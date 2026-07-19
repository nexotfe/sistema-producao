# AUD-2026-07-19 — Auditoria: Bug de RLS em Soft Delete

**Data:** 2026-07-19
**Natureza do documento:** relatório de auditoria — retrato do momento,
com data de validade natural. Não precisa ser atualizado depois que as
15 tabelas listadas abaixo forem corrigidas; a regra permanente está em
`PAD-004_Politica_Exclusao_Registros.md`, a implementação de referência
em `IMP-SoftDelete.md`.

---

## 1. Contexto — o bug encontrado

Em 2026-07-18, durante a implementação do Calendário Operacional, foi
encontrado um bug real em `calendario_empresa_eventos`: a policy de RLS
de `SELECT` filtrava `deleted_at is null`. O Postgres exige que, após
um `UPDATE`, a linha resultante ainda satisfaça a policy de `SELECT` —
então o próprio `UPDATE` que gravava `deleted_at = now()` (o
soft-delete) era rejeitado pelo RLS, mesmo a policy de `UPDATE`
permitindo a operação.

**Correção aplicada:** a policy de `SELECT` (e a cláusula `USING` de
`UPDATE`) passou a conter apenas o isolamento por `empresa_id` — o
filtro de `deleted_at` foi movido para a query da aplicação
(`useCalendarioOperacional.ts`). Detalhes técnicos completos em
`IMP-SoftDelete.md`.

## 2. Investigação — as 15 tabelas pendentes

Levantamento de todas as tabelas reais do schema `public` com coluna
`deleted_at` (34 tabelas/views encontradas; 28 são tabelas reais, 6 são
views `_ativos` que herdam a RLS da tabela base). Cada uma foi cruzada
em 3 eixos: (1) a policy de `SELECT` filtra `deleted_at is null`? (2) o
`DELETE` físico está bloqueado (`using (false)`, ou nenhuma policy de
DELETE)? (3) existe algum caminho de código (frontend ou função SQL)
que já faz `UPDATE ... SET deleted_at`?

**Resultado:** nenhum código do projeto (frontend ou função SQL), além
do `calendario_empresa_eventos` já corrigido, jamais escreveu
`deleted_at` via `UPDATE`. Confirmado por grep completo em `src/` e
`supabase/migrations/`, e por contagem real no banco — as 15 tabelas
abaixo têm **0 linhas com `deleted_at` preenchido em produção**, hoje.
O bug nunca se manifestou porque o caminho de código que o acionaria
nunca foi escrito.

### As 15 tabelas com a mesma forma do bug

(`SELECT`/`UPDATE` filtrando `deleted_at is null` + `DELETE` físico
bloqueado + soft-delete nunca exercitado)

- `projeto_itens`
- `requisicoes_compra`
- `pedidos_compra`
- `clientes`
- `consumos_internos`
- `fornecedores`
- `materias_primas`
- `materias_primas_fornecedores`
- `numeracao_configuracoes`
- `ordens_fabricacao`
- `planejamentos_compra`
- `producao_configuracoes`
- `projetos`
- `propostas`
- `requisicao_compra_itens`

### Tabelas com `deleted_at` que NÃO estão nesta lista (não afetadas)

- `funcionarios`, `grupos_recursos`, `recursos_produtivos` — também
  filtram `deleted_at is null` no `SELECT`, mas o `DELETE` físico é
  permitido (admin) e é isso que o código realmente usa
  (`excluirRegistro()`) — o bug nunca seria acionado, porque essas
  telas nunca tentam `UPDATE ... SET deleted_at`.
- `bom_itens`, `bom_operacoes`, `bom_servicos_terceiros`,
  `bom_transportes`, `boms`, `configuracoes_empresa`,
  `itens_industriais`, `revisoes_itens`, `tecnologias_aplicadas` — o
  `SELECT` dessas **não filtra** `deleted_at` na policy.

## 3. Pré-condição ainda não verificada

Antes de corrigir a RLS de cada uma das 15 tabelas (remover o filtro
de `deleted_at` da policy de `SELECT`, conforme PAD-004 seção 2), é
preciso confirmar, tabela por tabela, se as queries da aplicação que já
listam essa tabela hoje incluem `.is("deleted_at", null)`
explicitamente. Se alguma tela depender só da RLS para esconder
excluídos e essa checagem não for feita antes da correção, registros
"excluídos" passariam a reaparecer na tela — um bug novo no lugar do
antigo.

Como nenhuma das 15 tabelas tem hoje nenhuma linha soft-deletada, o
risco prático imediato dessa lacuna é zero — mas a checagem e o ajuste
das queries (onde faltar) continuam sendo pré-requisito da correção,
não um "nice to have".

Essa checagem tabela-por-tabela foi feita em 2026-07-19 (ver seção 4
para o progresso da correção das queries identificadas como
pendentes). 8 das 15 tabelas não têm hoje nenhuma query de listagem no
frontend (`requisicoes_compra`, `pedidos_compra`, `planejamentos_compra`,
`numeracao_configuracoes`, `producao_configuracoes`,
`consumos_internos`, `propostas`, `requisicao_compra_itens`) — para
essas, a correção de RLS pode ser feita diretamente, sem ajuste de
query antes.

## 4. Progresso da correção — queries da aplicação (PAD-004 seção 3)

Checklist das 7 tabelas que tinham queries de listagem sem
`.is("deleted_at", null)` explícito, corrigidas uma de cada vez antes
da futura correção de RLS de cada uma:

- [x] Clientes — queries da aplicação adequadas ao PAD-004 (seção 3).
      Pronto para futura correção da RLS.
- [x] Fornecedores — queries da aplicação adequadas ao PAD-004 (seção 3).
      Pronto para futura correção da RLS.
- [x] Projetos — queries da aplicação adequadas ao PAD-004 (seção 3),
      incluindo todos os consumidores transversais (listagem, carregar,
      duplicar, Orçamento, Proposta, busca de contato). Pronto para
      futura correção da RLS.
- [x] Item de Projeto — queries da aplicação adequadas ao PAD-004
      (seção 3): Orçamento, Proposta e Resumo Operacional. Pronto para
      futura correção da RLS.
- [x] Matérias-primas — queries da aplicação adequadas ao PAD-004
      (seção 3): listagem principal e busca/seletor no Roteiro. Pronto
      para futura correção da RLS.
- [x] Matérias-primas × Fornecedores — query da aplicação adequada ao
      PAD-004 (seção 3). Pronto para futura correção da RLS.
- [x] Ordens de Fabricação — queries da aplicação adequadas ao PAD-004
      (seção 3): detalhe da OF (`app/ordens/[id]/page.tsx`) e contagem
      no Resumo Operacional (`useProjeto.ts`). Os 2 consumidores do
      PCP já filtravam corretamente antes desta correção. Pronto para
      futura correção da RLS.

As 7 entidades desta checklist estão concluídas. A pré-condição da
seção 3 está satisfeita para as 15 tabelas listadas na seção 2 — a
futura correção de RLS (seção 2) pode ser tratada como tarefa separada,
quando solicitada.

## 5. Conclusão — correção da RLS (PAD-004 seção 2)

A correção de RLS das 15 tabelas foi concluída em três lotes, em
2026-07-19:

- **Lote A** — `clientes`, `fornecedores`, `projetos`, `projeto_itens`
  (commits `397283d`, `9d7827b`).
- **Lote B** — `materias_primas`, `materias_primas_fornecedores`
  (commits `bfc583a`, `db94a4d`). Duas lacunas novas de query de
  aplicação foram encontradas e corrigidas nesta rodada (hooks de
  detalhe/edição/resolução-por-id que não filtravam `deleted_at`).
- **Lote C** — as 9 tabelas restantes: `requisicoes_compra`,
  `pedidos_compra`, `planejamentos_compra`, `numeracao_configuracoes`,
  `producao_configuracoes`, `consumos_internos`, `propostas`,
  `requisicao_compra_itens`, `ordens_fabricacao` (commit `6f8d01b`).

Com isso, **as 15 tabelas listadas na seção 2 têm a RLS corrigida**
conforme o padrão descrito em `PAD-004_Politica_Exclusao_Registros.md`
seção 2. Dois pontos ficam registrados, não como pendência de correção,
mas como decisões conscientes:

- **Filtro `ativo = true`** — mantido nas policies das tabelas que já o
  tinham. Dívida técnica registrada em `PAD-004_Politica_Exclusao_Registros.md`
  seção 2, remoção pendente de auditoria própria das queries de
  aplicação, análoga a esta.
- **`propostas` sem policy de `UPDATE`** — decisão arquitetural fechada.
  A tabela `propostas` não possui UPDATE POLICY porque não existe fluxo
  de Soft Delete definido para essa entidade — não há tela, não há
  requisito de negócio para excluir propostas hoje. Caso o negócio
  passe a exigir exclusão lógica de propostas no futuro, uma nova
  decisão arquitetural deverá ser tomada antes da criação dessa policy.
