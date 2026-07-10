# COTAÇÃO E SELEÇÃO DE FORNECEDORES

## NEXOTFE 1.0

# Objetivo

A etapa de Cotação tem como objetivo permitir que o Comprador obtenha propostas comerciais de um ou mais fornecedores antes da emissão do Pedido de Compra.

O NEXOTFE não gera automaticamente um Pedido de Compra após o Planejamento.

Primeiro ocorre a negociação.

Somente após a definição do fornecedor será emitido o Pedido de Compra.

---

# Fluxo

Necessidade de Compra

↓

Planejamento de Compras

↓

Cotação

↓

Recebimento das Propostas

↓

Análise das Propostas

↓

Escolha do Fornecedor

↓

Pedido de Compra

↓

Recebimento

↓

Estoque

---

# Cotação

O Comprador poderá selecionar um ou vários itens do Planejamento de Compras.

Esses itens poderão ser enviados para um ou vários fornecedores.

Exemplo:

Fornecedor A

* Chapa SAE 1020
* Barra SAE 4340
* Rolamento 6208

Fornecedor B

* Chapa SAE 1020
* Barra SAE 4340

Fornecedor C

* Barra SAE 4340
* Rolamento 6208

Cada fornecedor poderá receber uma lista diferente de materiais.

---

# Recebimento das Propostas

Após o retorno dos fornecedores, o Comprador registrará as propostas recebidas.

Cada proposta poderá conter:

* Valor unitário.
* Valor total.
* Prazo de entrega.
* Condições de pagamento.
* Frete.
* Validade da proposta.
* Observações.

---

# Comparação

O sistema deverá permitir comparar as propostas recebidas.

Exemplo:

| Material  | Fornecedor A | Fornecedor B | Fornecedor C |
| --------- | -----------: | -----------: | -----------: |
| Valor     |  R$ 1.250,00 |  R$ 1.180,00 |  R$ 1.320,00 |
| Prazo     |       5 dias |      12 dias |       4 dias |
| Frete     |      Incluso |  Não incluso |      Incluso |
| Pagamento |      28 dias |      21 dias |      35 dias |

O objetivo é apoiar a decisão do Comprador.

O sistema não selecionará automaticamente o fornecedor.

---

# Escolha do Fornecedor

Após a análise, o Comprador poderá:

* Escolher um único fornecedor.
* Dividir os itens entre diversos fornecedores.
* Comprar apenas parte dos itens.
* Cancelar a compra de determinados materiais.

A decisão pertence exclusivamente ao Comprador.

---

# Emissão do Pedido de Compra

Somente após a escolha dos fornecedores o sistema permitirá gerar os Pedidos de Compra.

O sistema poderá gerar:

* Um Pedido de Compra.
* Diversos Pedidos de Compra.

Cada Pedido conterá apenas os itens destinados ao respectivo fornecedor.

---

# Rastreabilidade

Cada item deverá manter vínculo com:

* Projeto.
* OF.
* Requisição.
* Cotação.
* Fornecedor.
* Pedido de Compra.
* Recebimento.
* Estoque.

Mesmo quando um item for dividido entre diversos fornecedores, a rastreabilidade deverá ser preservada.

---

# Princípios

A Cotação representa a etapa de negociação comercial.

O Pedido de Compra representa a formalização da negociação.

O sistema organiza as informações e facilita a comparação.

A decisão final pertence ao Comprador.

Toda negociação deverá permanecer registrada para consulta futura.
