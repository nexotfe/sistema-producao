# Resultado — 006_pcp.sql

**Data:** 21/06/2026  
**Ambiente:** PostgreSQL 18 local e descartável  
**Resultado:** APROVADO

## Estrutura aprovada

- 6 tabelas de PCP;
- OF vinculada ao item de projeto, PN, BOM e Roteiro fixados;
- histórico imutável dos estados da OF;
- dependências entre OFs com rejeição de ciclos;
- programação revisionada e idempotente;
- necessidades de materiais calculadas a partir do Roteiro;
- histórico separado das decisões do PCP;
- 8 policies RLS;
- 4 RPCs transacionais privilegiadas;
- integridade multiempresa por FKs compostas.

## Invariantes aprovadas

- uma OF não troca silenciosamente seu PN, BOM ou Roteiro;
- criação da OF e geração inicial das necessidades formam uma única transação;
- a mesma chave de idempotência não duplica OF nem programação;
- quantidade necessária é derivada da quantidade por unidade do Roteiro multiplicada pela quantidade da OF;
- nenhuma decisão PCP, reserva ou requisição é criada implicitamente;
- OF com necessidade pendente não alcança `pronta_programacao`;
- dependências pertencem à mesma empresa e não podem formar ciclos;
- somente estados oficiais de OF são aceitos;
- alterações transacionais sensíveis ocorrem somente pelas RPCs autorizadas.

## Comportamentos testados

- criação atômica de OF com necessidades;
- repetição idempotente da criação;
- cálculo quantitativo das necessidades;
- ausência de decisão automática;
- bloqueio da transição enquanto há necessidade pendente;
- rejeição de ciclo entre OFs;
- transição para prontidão após atendimento das necessidades;
- programação idempotente da OF;
- isolamento de leitura entre duas empresas.

## Limite deliberado do módulo

- reservas e movimentos físicos pertencem ao `007_estoque.sql`;
- requisições e compras pertencem ao `008_suprimentos.sql`;
- a RPC final de decisão PCP, com destino atômico para reserva ou requisição, somente será criada quando os módulos 007 e 008 existirem.

Esse limite evita referências prematuras, tabelas provisórias e retrabalho transacional.

## Reprodução

O conjunto `bootstrap → 001 → 002 → 003 → 004 → 005 → 006` foi instalado em dois bancos vazios independentes e produziu schemas normalizados idênticos.

**SHA-256 do schema normalizado:**  
`6c71d07f0fcaec33d4d97d98104c13ad1d553bcfc6b40521581fc8036ab073a8`

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `006_pcp.sql` | `007910e82ac237140e28f9031177e0729a2554944be3c075ad5346e1953c0392` |
| `006_pcp_test.sql` | `6c09c27849e93ad100371cb838f6982fbe19518a3bed4f57b97d31d490294680` |

## Gate

O módulo `006_pcp.sql` está encerrado e libera o início do `007_estoque.sql`.
