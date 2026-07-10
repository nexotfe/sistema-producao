# PÁGINA — CRIAR ORÇAMENTO

## Objetivo

A página **Criar Orçamento** é o ponto de entrada do processo comercial.

Ela registra a solicitação do cliente, define a Natureza da operação, adiciona os produtos, permite abrir os roteiros e prepara as informações necessárias para a Análise de Viabilidade.

O Orçamento ainda não autoriza produção.

O Projeto somente seguirá o fluxo operacional após aprovação formal do cliente.

---

# Cabeçalho

Título:

**Criar Orçamento**

Botões padrão:

* Voltar
* Início
* Salvar rascunho

---

# Dados do Orçamento

## Projeto

Número único do processo.

Antes da aprovação do cliente, esse número representa o Orçamento.

Após aprovação, o mesmo número passa a representar o Projeto.

Regras:

* Obrigatório.
* Único no sistema.
* Não deve ser duplicado.
* Não deve ser alterado depois de criado.

---

## Cliente

Nome do cliente.

O sistema deverá buscar o cliente no cadastro.

Se o cliente não existir, o sistema deverá informar:

**Cliente não encontrado. Cadastre o cliente antes de continuar.**

---

## Natureza

Campo obrigatório.

Substitui o termo antigo **Tipo**.

Opções:

* Fabricação
* Desenvolvimento
* Industrialização
* Serviço

A Natureza define o comportamento operacional, fiscal e industrial do orçamento.

---

# Comportamento por Natureza

## Fabricação

A empresa fornece a matéria-prima, fabrica o produto e vende o produto acabado.

Entram no custo:

* Matéria-prima.
* Horas dos recursos produtivos.
* Serviços de terceiros.
* Tratamentos.
* Transporte.
* Impostos.
* Margem de lucro.

---

## Desenvolvimento

Usado quando o trabalho principal é desenvolver um produto, máquina, dispositivo ou solução.

Na fase de orçamento pode usar roteiro macro.

Exemplo:

OP10 — Projeto — 100h

Após aprovação do cliente, o roteiro poderá ser refinado.

Exemplo:

OP10 — PDR — 40h
OP20 — CDR — 20h
OP30 — FDR — 20h
OP40 — Desenhos 2D — 20h

---

## Industrialização

Segue fluxo parecido com Fabricação, porém a matéria-prima é fornecida pelo cliente.

Diferença principal:

* A matéria-prima não entra no custo de venda.
* Deve haver rastreabilidade do material do cliente.
* Impostos seguem regra própria de industrialização.

Entram no custo:

* Horas dos recursos produtivos.
* Serviços de terceiros.
* Tratamentos.
* Transporte.
* Impostos.
* Margem de lucro.

Não entra no custo:

* Matéria-prima fornecida pelo cliente.

---

## Serviço

Segue o fluxo operacional quando houver uso de recursos produtivos.

Pode ter:

* Produto.
* Roteiro.
* OF.
* Produção.
* Qualidade, quando aplicável.

Entram no custo:

* Horas dos recursos produtivos.
* Materiais consumidos, quando aplicável.
* Serviços de terceiros, quando aplicável.
* Transporte, quando aplicável.
* Impostos.
* Margem de lucro.

---

# Data Objetivo

Data solicitada pelo cliente.

Será usada como referência para a Análise de Viabilidade.

O sistema deverá comparar a data solicitada com a data possível calculada pelos cenários.

---

# Prioridade

Remover da tela.

Não é necessária neste contexto.

---

# Margem de Lucro

Percentual informado pelo orçamentista.

Representa a margem desejada para formar o preço de venda.

---

# Itens do Orçamento

Cada item representa um Produto.

A tabela deve conter:

* Descrição
* Código
* Quantidade
* Roteiro
* Horas roteiro
* Situação

Botão:

**Adicionar item**

---

## Adicionar item

Ao adicionar item, o sistema deverá pesquisar o Produto.

Se existir:

* Seleciona o Produto.
* Preenche Código e Descrição.
* Usuário informa a Quantidade.

Se não existir:

* Permite cadastrar novo Produto.
* Após salvar, retorna automaticamente ao Orçamento.
* Produto já fica vinculado ao item.

---

# Roteiro no Orçamento

O roteiro é aberto a partir do item.

O roteiro define:

* Matéria-prima.
* Operações.
* Recursos produtivos.
* Horas.
* Serviços de terceiros.
* Tratamentos.
* Transporte, quando aplicável.

O roteiro não possui quantidade.

A quantidade pertence ao item do Orçamento e depois à OF.

---

# Cálculo do Orçamento

O custo base do orçamento será formado por:

* Matéria-prima utilizada.
* Horas dos recursos descritas nas operações do roteiro.
* Serviços de terceiros.
* Tratamentos.
* Transporte.
* Impostos.
* Margem de lucro.

Para Industrialização, a matéria-prima fornecida pelo cliente não entra no custo de venda.

Para Serviço, os custos aplicáveis dependem do tipo de serviço executado.

---

# Impostos

A área de Impostos deve permanecer na tela.

No Baseline 1.0, os valores de impostos serão informados manualmente pelo orçamentista.

O sistema não calculará impostos automaticamente nesta fase.

---

# Análise de Viabilidade

Após todos os roteiros estarem concluídos, o sistema liberará a etapa:

**Análise de Viabilidade**

A Análise de Viabilidade verificará:

* Se é possível fabricar.
* Se é possível atender a Data Objetivo.
* Qual o melhor prazo possível.
* Gargalos.
* Compras críticas.
* Capacidade dos recursos.
* Terceirização.
* Horas extras, quando necessário.

Após a análise, a proposta comercial poderá ser enviada ao cliente.

Nenhum Projeto operacional será iniciado antes da aprovação do cliente.

---

# Proposta Comercial

Após rodar a Análise de Viabilidade, o sistema deverá permitir gerar uma proposta para o cliente.

A proposta deverá considerar:

* Produtos.
* Quantidades.
* Preço.
* Prazo possível.
* Condições comerciais.
* Observações.

Se o cliente aprovar, o Orçamento passa a seguir como Projeto.

Se o cliente rejeitar, o Orçamento fica registrado como não aprovado.

Se o cliente solicitar alteração, o Orçamento retorna para edição.
