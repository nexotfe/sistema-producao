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

**Esta checagem tabela-por-tabela ainda não foi feita** — é o próximo
passo antes de implementar a correção de RLS nas 15 tabelas.
