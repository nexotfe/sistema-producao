# Resultado - 010_qualidade.sql

**Data:** 23/06/2026  
**Ambiente:** PostgreSQL 18 local e descartavel  
**Resultado:** APROVADO

## Estrutura aprovada

- 6 tabelas de Qualidade;
- inspecoes de recebimento, processo e produto com alvo exclusivo;
- historico imutavel dos estados da inspecao;
- certificados vinculados a inspecao concluida;
- nao conformidades abertas automaticamente por resultado nao conforme;
- historico imutavel dos estados da nao conformidade;
- liberacoes de qualidade vinculadas a decisao formal;
- 6 policies RLS;
- 7 RPCs operacionais e 2 funcoes internas;
- integridade multiempresa por FKs compostas.

## Invariantes aprovadas

- uma inspecao possui exatamente um alvo conforme seu tipo;
- inspecao aberta ou em execucao permanece com resultado pendente;
- inspecao concluida exige resultado final e data de conclusao;
- OP em inspecao nao pode ser concluida por atalho fora da Qualidade;
- abertura de inspecao, certificado e liberacao sao idempotentes;
- reutilizacao de chave idempotente com payload divergente e rejeitada;
- certificado exige inspecao concluida;
- resultado nao conforme abre NC rastreavel;
- NC registra historico completo ate encerramento;
- liberacao conforme conclui OP e pode finalizar OF;
- decisao de retrabalho retorna OP para execucao;
- RLS isola leitura entre empresas.

## Comportamentos testados

- bloqueio da conclusao direta da OP em inspecao;
- abertura idempotente de inspecao de processo;
- rejeicao de idempotencia divergente na inspecao;
- inicio e conclusao de inspecao conforme;
- repeticao idempotente da conclusao conforme;
- registro idempotente de certificado;
- rejeicao de certificado com payload divergente;
- liberacao idempotente de inspecao conforme;
- conclusao da OP e finalizacao da OF apos liberacao;
- abertura e cancelamento de inspecao de produto;
- abertura, inicio e conclusao de inspecao nao conforme;
- criacao automatica da nao conformidade;
- transicao da NC para tratamento e encerramento;
- retorno da OP para execucao por retrabalho;
- historicos completos de inspecao e nao conformidade;
- bloqueio de alteracao direta da liberacao;
- isolamento de leitura entre duas empresas.

## Reproducao

O conjunto `bootstrap -> 001 -> 002 -> 003 -> 004 -> 005 -> 006 -> 007 -> 008 -> 009 -> 010` foi instalado em dois bancos vazios independentes e produziu schemas normalizados identicos.

**SHA-256 do schema normalizado:**  
`94ccee2703a1e5a31d1002f3e8a032377bbfa221b5d6c8e0d7aab232cf218ee2`

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `010_qualidade.sql` | `b99144e6b8f5da21584ae30f38e13aff4163a3e5a2760d86c680d55322add0e2` |
| `010_qualidade_test.sql` | `2a5b2d3ad1c67d94993c3eb04ad4b5b0d20e4562555853191ea8293927526d00` |

## Gate

O modulo `010_qualidade.sql` esta encerrado e libera o inicio do `011_expedicao.sql`.
