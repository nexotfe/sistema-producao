# Auditoria Completa das Policies RLS — NEXOTFE

**Data:** 21/06/2026  
**Escopo:** 29 tabelas, 106 policies e 16 views do schema `public` restaurado  
**Método:** análise estática do catálogo restaurado  
**Alterações realizadas:** nenhuma

## 1. Conclusão executiva

O conjunto atual de RLS **não oferece isolamento multiempresa confiável** e não está apto para compor o baseline definitivo sem correções.

Foram identificados:

- duas tabelas industriais sem RLS;
- 20 policies com risco crítico direto;
- 31 policies com risco alto de escrita ou rastreabilidade;
- cinco tabelas com exposição explícita entre tenants;
- 64 policies atribuídas à role `public`;
- nenhuma tabela com `FORCE ROW LEVEL SECURITY`;
- oito views operacionais sem `security_invoker=true`;
- 42 policies existentes sem origem nas migrations locais;
- dependência sistêmica de `empresa_atual_id()`, já classificada como crítica.

As violações mais graves estão em `clientes`, `credenciais`, `grupos_recursos`, `recursos_produtivos` e `usuarios`.

## 2. Resultado quantitativo

### Cobertura

| Item | Quantidade |
|---|---:|
| Tabelas | 29 |
| Tabelas com RLS | 27 |
| Tabelas sem RLS | 2 |
| Tabelas com `FORCE RLS` | 0 |
| Policies | 106 |
| Policies permissivas | 106 |
| Policies restritivas | 0 |
| Policies para `authenticated` | 42 |
| Policies para `public` | 64 |

### Classificação individual

| Severidade | Quantidade |
|---|---:|
| Crítica | 20 |
| Alta | 31 |
| Média | 37 |
| Baixa | 18 |

A classificação completa está em `AUDITORIA_RLS_POLICIES.csv`. O resumo das 29 tabelas está em `AUDITORIA_RLS_TABELAS.csv`.

## 3. Tabelas sem RLS

### `boms`

Contém `empresa_id`, produto, versão, status e dados de autoria. Sem RLS, qualquer role com grant de tabela pode acessar BOMs de todas as empresas.

### `bom_itens`

Contém `empresa_id`, componentes, matérias-primas, quantidades e estrutura industrial. Também não possui RLS nem policies.

Essas duas ausências são críticas porque expõem propriedade intelectual industrial e permitem alcançar a estrutura de fabricação entre tenants.

## 4. Policies críticas por tabela

### 4.1 `clientes` — quatro de quatro críticas

#### SELECT

`usuarios autenticados podem visualizar clientes` utiliza `USING (true)`.

Consequência: qualquer usuário autenticado com grant de tabela pode visualizar clientes de todas as empresas.

#### INSERT

`usuarios autenticados podem criar clientes` valida somente `created_by = auth.uid()`.

Consequência: o usuário pode fornecer `empresa_id` de outro tenant e criar dado cruzado.

#### UPDATE e DELETE

As policies usam apenas `usuario_e_admin()`, sem comparar `clientes.empresa_id` com o tenant atual.

Consequência: um admin de qualquer empresa pode alterar ou excluir cliente de outra empresa caso conheça ou alcance seu identificador.

### 4.2 `credenciais` — quatro de quatro críticas

A tabela armazena `login`, `senha_criptografada`, observações, responsável e `empresa_id`.

Todas as policies usam:

```text
usuario_responsavel = auth.uid() OR usuario_e_admin()
```

Nenhuma inclui `empresa_id = empresa_atual_id()`.

Consequências:

- um admin pode ler, alterar e excluir credenciais de outros tenants;
- o próprio usuário pode inserir credencial com `empresa_id` arbitrário;
- dados de autenticação operacional podem atravessar fronteiras empresariais.

Esta é a exposição de maior impacto informacional encontrada na auditoria.

### 4.3 `grupos_recursos` — seis de seis críticas

- três policies de SELECT equivalentes usam `USING (true)`;
- INSERT valida somente `created_by`;
- UPDATE permite criador ou qualquer admin, sem tenant;
- DELETE permite qualquer admin, sem tenant.

Além do acesso cruzado, três policies idênticas aumentam ambiguidade e risco de manutenção. Como policies permissivas são combinadas por `OR`, qualquer policy ampla domina uma policy futura mais restrita.

### 4.4 `recursos_produtivos` — quatro de quatro críticas

- SELECT é incondicional;
- existem duas policies de INSERT logicamente equivalentes, ambas sem tenant;
- UPDATE permite criador ou qualquer admin, também sem tenant.

Capacidade e recursos produtivos de todas as empresas podem ser expostos ou contaminados.

### 4.5 `usuarios` — duas críticas e uma média

`Admins gerenciam usuarios` usa apenas `usuario_e_admin()` em uma policy `ALL`.

`Usuarios podem ver o proprio perfil` permite o próprio registro ou qualquer admin, novamente sem tenant no ramo administrativo.

Consequência: um admin pode visualizar e administrar usuários de outras empresas.

A policy de autoatualização consulta o nível atual na própria tabela. Essa subconsulta não foi classificada como recursão automática porque aciona policies de `SELECT`, não novamente a policy de `UPDATE`. Ainda assim, exige teste explícito para confirmar comportamento e preservação do nível de acesso.

## 5. Riscos altos de escrita operacional

Trinta e uma policies permitem INSERT ou UPDATE sem autorização funcional suficiente ou sem proteção de `created_by`.

O padrão recorrente é:

```text
empresa_id = empresa_atual_id()
```

Esse filtro impede parte do acesso cruzado, mas não responde:

- qual papel pode alterar a entidade;
- em qual estado a alteração é permitida;
- se o usuário pode falsificar `created_by`;
- se a operação deveria ocorrer somente por RPC transacional;
- se o histórico deve ser imutável.

Isso afeta projetos, OFs, consumo, estoque, requisições, planejamento, pedidos e configurações.

Particularmente, `estoque_saldos` possui policies diretas de INSERT e UPDATE para `public`. Saldo não deve ser mutável por operação genérica de frontend; deve ser consequência de operação transacional controlada.

## 6. Dependência crítica de `empresa_atual_id()`

Para o baseline definitivo, `empresa_atual_id()` e todas as funções auxiliares deverão resolver o contexto exclusivamente por `public.usuarios`. `auth.users` será somente a identidade autenticada, e `public.profiles` não será fonte de empresa, papel ou permissão. Fallback entre tabelas fica proibido.

Sessenta e sete policies dependem dessa função direta ou indiretamente.

A auditoria de `SECURITY DEFINER` demonstrou que:

- profile inativo pode cair para `usuarios.empresa_id`;
- existem duas fontes de tenant potencialmente divergentes;
- empresa inativa não é validada.

Portanto, mesmo policies aparentemente corretas herdam o risco do resolvedor. Corrigir policies antes de corrigir a função deixaria uma falsa sensação de segurança.

## 7. Role `public`

Sessenta e quatro policies foram criadas sem `TO authenticated`, resultando em role `{public}`.

No PostgreSQL, `PUBLIC` abrange todas as roles. A policy não concede privilégio de tabela por si só, mas passa a ser considerada por qualquer role que possua grant, inclusive `anon`.

Hoje muitas dessas expressões retornam falso para sessão sem `auth.uid()`, mas isso é uma dependência implícita e frágil. Policies de dados empresariais devem declarar as roles intencionais explicitamente.

Os grants não fizeram parte do backup; por isso não é possível afirmar se `anon` possui acesso efetivo.

## 8. Policies permissivas e duplicadas

Todas as 106 policies são permissivas. Policies permissivas para o mesmo comando são combinadas por `OR`.

Consequências:

- uma policy ampla neutraliza condições de outra policy;
- adicionar uma nova policy não torna o conjunto mais restritivo;
- policies antigas esquecidas permanecem como caminhos de acesso.

Duplicidades confirmadas:

- três SELECTs equivalentes e incondicionais em `grupos_recursos`;
- dois INSERTs logicamente equivalentes em `recursos_produtivos`.

## 9. Views que podem contornar RLS

Oito views preexistentes ao histórico local usam `security_invoker=true`, demonstrando o padrão seguro já adotado parcialmente pelo projeto.

As oito views criadas pelas migrations locais não declaram essa opção:

- `vw_decisao_material_of`;
- `vw_planejamento_compras_operacional`;
- `vw_demanda_bom_of`;
- `vw_demanda_estoque`;
- `vw_demanda_consumo_compra`;
- `vw_of_fluxo_industrial`;
- `vw_of_consumo_detalhado`;
- `vw_of_fluxo_operacional`.

Views com comportamento padrão podem avaliar tabelas subjacentes usando o contexto do owner da view. Se esse owner for também owner das tabelas, RLS pode ser ignorada. Owner e grants não foram preservados no backup, então o bypass efetivo precisa ser confirmado no Supabase; o risco arquitetural já é suficiente para exigir correção.

## 10. `FORCE ROW LEVEL SECURITY`

Nenhuma tabela utiliza `FORCE ROW LEVEL SECURITY`.

Isso significa que owners das tabelas normalmente ignoram RLS. Não é obrigatório forçar RLS em todos os casos, pois funções administrativas e migrações podem precisar de bypass, mas o comportamento deve ser deliberado e testado.

No NEXOTFE, a combinação entre:

- ausência de `FORCE RLS`;
- owners ainda não auditados;
- views sem `security_invoker`;
- funções `SECURITY DEFINER`;

cria caminhos de bypass que não estão governados pelo histórico local.

## 11. Rastreamento nas migrations

O banco restaurado possui 106 policies, enquanto as migrations locais definem 65 nomes únicos.

- 42 policies não possuem origem local;
- uma policy local, `planejamento_compra_origens_update_blocked`, foi removida posteriormente e não existe no banco atual;
- várias policies são recriadas sem idempotência;
- a migration consolidada repete quatro policies de OF.

O baseline definitivo precisa conter a origem integral das policies aprovadas.

## 12. Ordem obrigatória de correção

1. Confirmar grants, owners e roles reais no Supabase.
2. Corrigir `handle_new_auth_user()` e `empresa_atual_id()`.
3. Fechar imediatamente o acesso cruzado de `credenciais`.
4. Corrigir as policies de `clientes`, `usuarios`, `grupos_recursos` e `recursos_produtivos`.
5. Habilitar RLS e criar policies de `boms` e `bom_itens`.
6. Recriar as oito views operacionais com `security_invoker=true`.
7. Substituir role `public` por roles explícitas quando aplicável.
8. Restringir escritas operacionais a RPCs e papéis compatíveis.
9. Proteger `created_by`, `empresa_id` e campos de estado contra alteração arbitrária.
10. Consolidar e versionar todas as policies no baseline.
11. Remover duplicidades somente por migration controlada e após testes.
12. Executar matriz completa de isolamento antes de qualquer implantação.

## 13. Testes mínimos obrigatórios

### Matriz de identidade

Para cada tabela e comando:

- `anon`;
- operador da empresa A;
- admin da empresa A;
- operador da empresa B;
- admin da empresa B;
- usuário inativo;
- usuário de empresa inativa;
- `service_role` em teste controlado.

### Isolamento

- consultar UUID conhecido de outro tenant;
- atualizar e excluir UUID conhecido de outro tenant;
- inserir payload com `empresa_id` estrangeiro;
- alterar `empresa_id` de registro existente;
- falsificar `created_by` e `deleted_by`;
- confirmar que admin permanece limitado ao próprio tenant.

### Dados sensíveis

- garantir que credenciais nunca atravessem tenant;
- confirmar que senha criptografada não é retornada por views ou APIs indevidas;
- validar logs de acesso administrativo.

### Operações industriais

- impedir alteração direta de saldo;
- impedir consumo, requisição, decisão e cancelamento fora das RPCs previstas;
- validar transições de estado;
- confirmar imutabilidade dos eventos históricos.

### Views e bypass

- consultar cada view como `anon`, operador e admin de dois tenants;
- confirmar `security_invoker=true` no catálogo;
- testar acesso direto e via view ao mesmo registro;
- testar owner da tabela, owner da view e role com `BYPASSRLS` em ambiente isolado.

## 14. Decisão final

**Policies auditadas:** 106 de 106.  
**Tabelas auditadas:** 29 de 29.  
**RLS apta para baseline sem ajustes:** não.  
**Isolamento multiempresa comprovado:** não.  
**Aplicação de migrations autorizada:** não.

Correções bloqueantes:

1. 20 policies críticas;
2. RLS ausente em `boms` e `bom_itens`;
3. resolvedor de tenant crítico;
4. views operacionais sem `security_invoker`;
5. grants e owners ainda não confirmados no ambiente remoto.
