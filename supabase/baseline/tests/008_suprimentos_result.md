# Resultado — 008_suprimentos.sql

**Data:** 22/06/2026  
**Ambiente:** PostgreSQL 18 local e descartável  
**Resultado:** APROVADO

## Estrutura aprovada

- 12 tabelas de Suprimentos;
- fornecedores com situação de homologação;
- requisições industriais e administrativas;
- histórico imutável dos estados da requisição;
- planejamento com origens consolidadas;
- chave de consolidação por Família, Grade e Bitola;
- pedidos vinculados obrigatoriamente a fornecedor e planejamento;
- histórico imutável dos estados do pedido;
- recebimentos, itens e eventos de estado;
- 14 policies RLS;
- 8 RPCs operacionais e 4 funções internas;
- integridade multiempresa por FKs compostas.

## Invariantes aprovadas

- decisão PCP materializa Reserva e/ou Requisição na mesma transação;
- criação da OF continua sem decidir, reservar ou comprar automaticamente;
- requisição industrial referencia decisão, necessidade, OF e projeto;
- planejamento preserva todas as origens consolidadas;
- somente materiais iguais e com a mesma chave industrial são consolidados;
- pedido referencia fornecedor homologado, nunca apenas nome textual;
- pedido somente é emitido após aprovação das requisições;
- recebimento físico não altera estoque antes da liberação;
- inspeção obrigatória não pode ser ignorada;
- liberação gera movimento físico de recebimento;
- quantidade destinada à OF é reservada automaticamente;
- excedente de lote mínimo permanece como saldo livre;
- mudanças de estado de Requisição, Pedido e Recebimento geram histórico imutável;
- RPCs idempotentes rejeitam reutilização da chave com conteúdo diferente;
- revisão de decisão preserva o registro anterior e bloqueia reversão após consumo ou planejamento.

## Comportamentos testados

- decisão combinada de Estoque + Compra;
- cancelamento e nova revisão da decisão PCP sem apagar o histórico;
- reserva imediata somente da parcela disponível;
- geração rastreável da requisição;
- consolidação idempotente e compra acima da necessidade por lote mínimo;
- aprovação da requisição e emissão idempotente do pedido;
- bloqueio da entrada em estoque antes da liberação;
- recebimentos parciais com e sem inspeção;
- rejeição do salto da inspeção obrigatória;
- entrada física após liberação;
- reserva automática da parcela industrial recebida;
- preservação do excedente como saldo livre;
- atualização do pedido para parcialmente recebido, recebido e encerrado;
- históricos completos de Requisição, Pedido e Recebimento;
- isolamento de leitura entre duas empresas.

## Cenário quantitativo validado

- necessidade: `10 kg`;
- reserva inicial: `4 kg`;
- compra necessária: `6 kg`;
- compra planejada por lote mínimo: `8 kg`;
- saldo final físico: `12 kg`;
- saldo final reservado: `10 kg`;
- saldo final livre: `2 kg`.

## Reprodução

O conjunto `bootstrap → 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008` foi instalado em dois bancos vazios independentes e produziu schemas normalizados idênticos.

**SHA-256 do schema normalizado:**  
`ee598d0729771c1ed0d313e4d249237af741870698719b47c6e3dff29619a2f3`

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `008_suprimentos.sql` | `1f8ef95b563413cd64033cfbb4fdf425eaa5c0cbffce9ea0d7a4be4e3f65ae3d` |
| `008_suprimentos_test.sql` | `99db48487424a111ec753af4435a3e6eb452c179afcf6f63caab567bb5eec923` |

## Gate

O módulo `008_suprimentos.sql` está encerrado e libera o início do `009_producao.sql`.
