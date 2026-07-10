# REQUISIÇÃO DE COMPRA

## NEXOTFE 1.0

# Objetivo

A Requisição de Compra representa a necessidade de aquisição de materiais ou serviços para atender um Projeto.

Ela nasce automaticamente após a decisão do PCP pela opção **Compra (C)**.

A Requisição não representa um Pedido de Compra.

Ela apenas informa ao Comprador quais materiais deverão ser adquiridos.

---

# Estrutura

Uma Requisição poderá possuir:

* Um Projeto.
* Uma ou várias OFs.
* Um ou centenas de itens.

Não existe limite de itens.

Exemplo:

Requisição RC000145

Projeto PRJ260180

Itens:

* Chapa SAE 1020
* Barra SAE 1045
* Barra SAE 4340
* Rolamentos
* Parafusos
* Tinta
* Tratamento térmico
* Pintura
* Embalagens

Todos pertencem à mesma Requisição.

---

# Papel do Comprador

Ao receber a Requisição, o Comprador decidirá como realizar as aquisições.

Exemplos:

## Opção 1

Um único fornecedor.

↓

Um único Pedido de Compra.

---

## Opção 2

Cinco fornecedores.

↓

Cinco Pedidos de Compra.

---

## Opção 3

Dez fornecedores.

↓

Dez Pedidos de Compra.

---

## Opção 4

Parte comprada agora.

Parte comprada posteriormente.

A decisão pertence exclusivamente ao Comprador.

---

# Pedido de Compra

Cada Pedido poderá conter:

* Um item.
* Diversos itens.
* Itens de vários Projetos.
* Itens de diversas Requisições.

Não existe relação de um para um entre Requisição e Pedido.

---

# Exemplo

Requisição RC000145

Possui:

30 itens.

O Comprador decide:

Fornecedor A

Pedido PC001

15 itens.

Fornecedor B

Pedido PC002

8 itens.

Fornecedor C

Pedido PC003

7 itens.

A Requisição continua sendo apenas uma.

Os Pedidos passam a representar as negociações realizadas.

---

# Rastreabilidade

O sistema deverá manter obrigatoriamente:

Projeto

↓

OF

↓

Requisição

↓

Item da Requisição

↓

Pedido de Compra

↓

Item do Pedido

↓

Recebimento

↓

Estoque

↓

Consumo

Mesmo que um item seja dividido entre diversos fornecedores, a rastreabilidade deverá permanecer íntegra.

---

# Princípios

A Requisição representa uma necessidade da Produção.

O Pedido representa uma negociação comercial.

Uma Requisição poderá originar diversos Pedidos de Compra.

Um Pedido poderá atender diversas Requisições.

O sistema deverá preservar integralmente a rastreabilidade entre todos os documentos.
