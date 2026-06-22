# Resultado — 004_comercial.sql

**Data:** 21/06/2026  
**Ambiente:** PostgreSQL 18 local e descartável  
**Resultado:** APROVADO

## Estrutura aprovada

- `clientes`;
- `cliente_contatos`;
- `projetos`;
- `projeto_estado_eventos`;
- `orcamentos`;
- `orcamento_itens`;
- `aprovacoes_comerciais`;
- 17 policies RLS;
- três funções privilegiadas com `search_path` seguro;
- FKs compostas para integridade multiempresa.

## Decisões preservadas

- Projeto possui uma única identidade do orçamento à entrega;
- os nove Estados Oficiais do Projeto são os únicos aceitos;
- Tipo, Origem, Prioridade e Estado permanecem classificações distintas;
- mudança de estado não é permitida por atualização direta;
- toda transição gera evento imutável;
- aprovação comercial é decisão formal, revisável e idempotente;
- o total oficial do orçamento deriva dos itens e não possui segunda fonte no cabeçalho.

## Comportamentos aprovados

- isolamento entre duas empresas;
- contato de outro tenant rejeitado por FK composta;
- criação do projeto gera evento inicial;
- transições comerciais válidas são aceitas;
- alteração direta de status é negada;
- fluxo alcança `aprovado` somente por decisão comercial;
- repetição idempotente retorna a mesma aprovação sem duplicação;
- reutilização da chave idempotente com conteúdo diferente é rejeitada;
- usuário de outra empresa não visualiza nem transiciona o projeto;
- histórico de estados não aceita escrita direta;
- valor do item é calculado deterministicamente.

## Reprodução

O conjunto `bootstrap → 001 → 002 → 003 → 004` foi instalado em dois bancos vazios independentes e produziu schemas normalizados idênticos.

**SHA-256 do schema normalizado:**  
`9e206636b69f3c770f3b1008bd2f038047e6e0258228164750c0b058ce1cf72f`

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `004_comercial.sql` | `4b1eddac4a90e3409f7c638dbc759f7eb0e1e19426773ebef7db7a933fff8763` |
| `004_comercial_test.sql` | `40405da4cda678c87ae60707f5789f36639001e6452b19383245973fa3b1d9f9` |

## Gate

O módulo `004_comercial.sql` está encerrado e libera o início do `005_engenharia.sql`.

