# PAD-004 — Política de Exclusão de Registros

**Data:** 2026-07-19
**Versão:** 1.0
**Status:** Vigente
**Natureza do documento:** arquitetura permanente — regras e princípios,
sem referência a arquivos, hooks ou componentes específicos. Para a
implementação de referência atual, ver `IMP-SoftDelete.md`. Para o
estado da auditoria de conformidade das tabelas existentes, ver
`AUD-2026-07-19_Soft_Delete.md`.

---

## 1. Quando usar Soft Delete vs DELETE físico

Regra geral: **dado de negócio nunca é fisicamente excluído**. Exclusão
lógica (soft delete) é o padrão; DELETE físico é a exceção.

Toda nova tabela deverá definir explicitamente, durante sua modelagem,
se adota Soft Delete ou DELETE físico — sendo o Soft Delete o padrão
por definição, salvo justificativa registrada no comentário da
migration (seguindo a ressalva já registrada neste documento).

O critério que decide qual das duas se aplica a uma tabela **não é**
"cadastro simples vs cadastro complexo" — é a natureza do que a linha
representa:

- **Soft delete (DELETE físico bloqueado)** — a tabela guarda o
  registro de um **fato de negócio que realmente aconteceu**: uma
  venda, uma compra, um cadastro de parceiro comercial, uma
  configuração operacional. Esse registro nunca pode desaparecer do
  sistema, para auditoria e rastreabilidade — independentemente de o
  schema parecer simples.
- **DELETE físico permitido (restrito a administrador)** — a tabela
  representa um cadastro de apoio onde a **integridade referencial já
  é suficiente** para impedir a exclusão de qualquer registro
  efetivamente vinculado a produção: a constraint de chave estrangeira
  (`RESTRICT`/`NO ACTION` entre agregados, `CASCADE` dentro do mesmo
  agregado) barra a exclusão antes mesmo de qualquer decisão de
  negócio ser necessária. Um administrador pode limpar um cadastro
  genuinamente não utilizado; qualquer vínculo real bloqueia a
  exclusão automaticamente.

Toda tabela nova deve ter esse critério avaliado explicitamente e
registrado no momento da sua criação — não decidido por analogia com
outra tabela "parecida".

---

## 2. Padrão de RLS — princípio geral

> **RLS resolve isolamento multi-tenant. Filtros de estado do registro
> — `deleted_at`, `ativo`, ou qualquer outro campo de controle de
> visibilidade — são responsabilidade da aplicação, nunca da política
> de RLS.**

Esse princípio vale para soft delete, mas não é exclusivo dele: qualquer
policy de RLS que combine isolamento por empresa com um filtro de
estado do dado corre o mesmo risco descrito abaixo.

### Motivo técnico (soft delete especificamente)

O Postgres exige que, após um `UPDATE`, a linha resultante ainda
satisfaça a policy de `SELECT` da tabela para a escrita ser aceita. Se
a policy de `SELECT` filtra `deleted_at is null`, o próprio `UPDATE`
que grava `deleted_at = now()` produz uma linha que não satisfaz mais
essa policy — e o Postgres rejeita a escrita, mesmo a policy de
`UPDATE` permitindo a operação.

O mesmo problema afeta um futuro fluxo de restauração: se a cláusula
`USING` da policy de `UPDATE` também filtrar `deleted_at is null`, uma
linha já excluída nunca poderia ser selecionada para ser restaurada.

### Padrão correto (SQL de exemplo genérico)

```sql
create policy <tabela>_select_tenant
  on public.<tabela>
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

create policy <tabela>_update_tenant
  on public.<tabela>
  for update to authenticated
  using (empresa_id = public.empresa_atual_id())
  with check (empresa_id = public.empresa_atual_id());
```

Nenhuma referência a `deleted_at` nem a `ativo` em nenhuma das duas. O
filtro de visibilidade é feito pela query da aplicação.

> **Dívida técnica registrada (Lote A, 2026-07-19):** a policy de RLS
> ainda filtra `ativo = true` em algumas tabelas, por transição — isso
> não é o modelo ideal (RLS deveria cuidar só de isolamento/autorização,
> conforme este mesmo documento define para `deleted_at`). Remoção
> pendente de auditoria própria das queries de aplicação, análoga à
> `AUD-2026-07-19_Soft_Delete.md`.

---

## 3. Permissões de Exclusão

Matriz por papel — **proposta inicial, a validar como decisão de
negócio** (hoje o sistema só distingue administrador de não-administrador
em RLS; a diferenciação entre os demais papéis abaixo ainda não está
implementada em nenhuma policy):

| Papel | Soft delete (exclusão lógica) | DELETE físico (tabelas que permitem) | Restauração (quando existir) |
| --- | --- | --- | --- |
| `leitura` | Não | Não | Não |
| `operador` | Não | Não | Não |
| `gestor` | Sim | Não | Não |
| `admin` | Sim | Sim | Sim |

Os quatro papéis acima (`admin`, `gestor`, `operador`, `leitura`) são os
valores reais já existentes no cadastro de usuários — a matriz precisa
ser confirmada como decisão de negócio antes de virar policy de RLS.

---

## 4. Ciclo de Vida do Registro

```
Criado
  ↓
Ativo (ativo = true, deleted_at = null)
  ↓
Inativo (ativo = false, deleted_at = null)  ── pode voltar a Ativo
  ↓
Excluído logicamente (deleted_at preenchido)  ── pode voltar a Ativo/Inativo (restauração — seção 6)
  ↓
Exclusão física  ── só nas tabelas que permitem (seção 1), e só quando não há vínculo real
```

Um registro não precisa passar por "Inativo" antes de ser excluído
logicamente — os dois são estados independentes (seção 5).

---

## 5. `ativo` e `deleted_at` são conceitos independentes

`ativo = false` e `deleted_at` preenchido **não são a mesma coisa** e
não devem ser tratados como sinônimos:

- `ativo = false` — o registro continua fazendo parte da operação
  normal da empresa, só está temporariamente fora de uso. Pode voltar
  a `ativo = true` a qualquer momento, sem nenhuma conotação de
  exclusão.
- `deleted_at` preenchido — o registro foi removido da operação da
  empresa. É reversível apenas através de um fluxo de restauração
  explícito (ainda não implementado — seção 6), nunca de forma
  implícita.

**Exemplo — Fornecedor:** `ativo = false` pode significar "este
fornecedor está temporariamente sem vender para nós" — ele continua
cadastrado, pode ser reativado a qualquer momento, e nada foi
"excluído". `deleted_at` preenchido significa "este fornecedor foi
removido da operação" — uma decisão diferente, de outra natureza,
tomada por outro motivo.

Uma tabela pode ter os dois campos simultaneamente, e eles podem mudar
de forma independente um do outro.

---

## 6. Evolução Futura

- **Fluxo de restauração.** Não existe hoje nenhuma interface que
  reverta um soft-delete (`deleted_at` de volta a `null`). Fica
  registrado como necessidade futura, provavelmente restrita ao papel
  `admin` (seção 3) — sem desenho de schema ou tela ainda.
- **Motivo da Exclusão.** Quando um fluxo de exclusão (lógica ou
  restauração) for implementado, o motivo da exclusão deveria ser um
  **campo estruturado** — uma lista fixa de opções (ex.: Duplicado /
  Erro de Cadastro / Cancelado / Outro) — e não texto livre, para
  permitir relatórios e auditoria consistentes. Registrado aqui só como
  direção arquitetural; não implementado nesta versão.

---

## Conformidade

Todas as tabelas que utilizam Soft Delete devem seguir este padrão —
para o estado da auditoria de conformidade, ver
`AUD-2026-07-19_Soft_Delete.md`.
