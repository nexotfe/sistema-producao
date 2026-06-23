# Resultado - 011_expedicao.sql

**Data:** 23/06/2026  
**Ambiente:** PostgreSQL 18 local e descartavel  
**Resultado:** APROVADO

## Estrutura aprovada

- 7 tabelas de Expedicao;
- Produto Acabado vinculado a OF finalizada, Projeto, item do Projeto e PN;
- historico imutavel dos estados do Produto Acabado;
- Separacao e itens de separacao;
- Expedicao e itens expedidos;
- Entrega confirmada ao cliente;
- 7 policies RLS;
- 6 RPCs operacionais e 1 funcao interna;
- integridade multiempresa por FKs compostas.

## Invariantes aprovadas

- Produto Acabado nasce somente de OF finalizada;
- Produto Acabado exige liberacao formal da Qualidade;
- Produto Acabado preserva rastreabilidade ate Projeto, item do Projeto e PN;
- separacao nao pode exceder a quantidade disponivel;
- expedicao exige separacao confirmada;
- entrega exige expedicao confirmada;
- quantidades seguem a cadeia `total >= separada >= expedida >= entregue`;
- entrega final altera Produto Acabado para `entregue`;
- quando todos os Produtos Acabados do Projeto sao entregues, o Projeto passa para `concluido`;
- RLS isola leitura entre empresas.

## Comportamentos testados

- bloqueio de Produto Acabado sem liberacao de Qualidade;
- registro idempotente de Produto Acabado;
- rejeicao de chave idempotente divergente;
- criacao idempotente da Separacao;
- bloqueio de separacao acima da quantidade disponivel;
- confirmacao da Separacao e mudanca do Produto Acabado para `separado`;
- registro idempotente da Expedicao;
- confirmacao da Expedicao e mudanca do Produto Acabado para `expedido`;
- registro idempotente da Entrega;
- mudanca do Produto Acabado para `entregue`;
- conclusao automatica do Projeto pela entrega;
- historico completo do Produto Acabado;
- bloqueio de alteracao direta da Entrega;
- isolamento de leitura entre duas empresas.

## Reproducao

O conjunto `bootstrap -> 001 -> 002 -> 003 -> 004 -> 005 -> 006 -> 007 -> 008 -> 009 -> 010 -> 011` foi instalado em dois bancos vazios independentes e produziu schemas normalizados identicos.

**SHA-256 do schema normalizado:**  
`d0323bd2d5e54129af99818fec9fc9e3e8e85034ade8210c093210de39cc0076`

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `011_expedicao.sql` | `258c171a903a69198ef19006136869d4408b6ee2265299893dfa2c66b5db42c6` |
| `011_expedicao_test.sql` | `ba4e6117eaed124ad758f17c82c1c6db5de99286f2b08328517d6a6ab8840baf` |

## Gate

O modulo `011_expedicao.sql` esta encerrado e libera o inicio do `012_views.sql`.
