# Resultado — 007_estoque.sql

**Data:** 22/06/2026  
**Ambiente:** PostgreSQL 18 local e descartável  
**Resultado:** APROVADO

## Estrutura aprovada

- 6 tabelas de Estoque;
- locais hierárquicos e configuráveis por empresa;
- saldo físico, reservado e livre por material/local;
- reserva vinculada à decisão PCP, necessidade, OF, material e saldo;
- eventos imutáveis da reserva;
- razão única de movimentos físicos;
- consumo vinculado à reserva e ao movimento correspondente;
- 8 policies RLS;
- 6 RPCs operacionais e 3 funções internas;
- integridade multiempresa por FKs compostas.

## Invariantes aprovadas

- reserva não altera o saldo físico;
- consumo reduz simultaneamente o físico e o reservado;
- saldo livre é sempre derivado de físico menos reservado;
- saldo reservado nunca supera o físico;
- reserva não excede a decisão nem a necessidade;
- reserva e consumo permanecem entidades distintas;
- movimento físico é imutável e possui origem rastreável;
- transferência gera saída e entrada correlacionadas na mesma transação;
- liberação é permitida apenas antes do consumo;
- cancelamento libera o restante ainda não consumido;
- uma reserva não cruza empresa, necessidade, OF, material, local ou decisão;
- hierarquia de locais não aceita ciclos.

## Comportamentos testados

- ajuste de entrada idempotente;
- cálculo de saldo físico, reservado e livre;
- criação e repetição idempotente da reserva;
- liberação sem movimento físico;
- cancelamento sem movimento físico;
- rejeição de reserva excedente;
- consumo parcial e final idempotente;
- rejeição da liberação após consumo parcial;
- encerramento da reserva como consumida;
- geração dos movimentos físicos de consumo;
- transferência atômica entre locais;
- bloqueio de alteração direta da razão física;
- rejeição de ciclo entre locais;
- isolamento de leitura entre duas empresas.

## Limite deliberado do módulo

- recebimento e requisição pertencem ao `008_suprimentos.sql`;
- entradas por recebimento usarão a razão física criada neste módulo;
- a decisão PCP completa será materializada atomicamente quando Reserva e Requisição estiverem ambas disponíveis.

## Reprodução

O conjunto `bootstrap → 001 → 002 → 003 → 004 → 005 → 006 → 007` foi instalado em dois bancos vazios independentes e produziu schemas normalizados idênticos.

**SHA-256 do schema normalizado:**  
`a67f63e48836764a0e7153f6b8aee89b2a29804d6ed27f61baaa00d41647b646`

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `007_estoque.sql` | `9f363a50662b9b1d6a538d59cd657ad41f04b65cb165e9418add84987d91f5cf` |
| `007_estoque_test.sql` | `be59b90b983b555bbf5d6619374f48bdc778a8ece6a6e202d461fbdc44d3a1ec` |

## Gate

O módulo `007_estoque.sql` está encerrado e libera o início do `008_suprimentos.sql`.
