# PÁGINA - PEDIDO DE COMPRA

## NEXOTFE 1.0

# Objetivo

O Pedido de Compra é o documento oficial utilizado para formalizar uma negociação entre a empresa e um fornecedor.

Ele é gerado pelo Comprador a partir de uma ou mais Requisições de Compra.

O Pedido representa um compromisso comercial entre as partes.

---

# Cabeçalho

Título:

**Pedido de Compra**

Botões padrão:

* Voltar.
* Início.
* Salvar.
* Imprimir PDF.
* Enviar por E-mail.
* Histórico.

No canto superior direito:

* Nome do usuário.

---

# Identificação

Campos:

* Número do Pedido.
* Data de emissão.
* Comprador responsável.
* Situação do Pedido.

Exemplo de situações:

* Em elaboração.
* Enviado.
* Parcialmente recebido.
* Recebido.
* Cancelado.

---

# Fornecedor

Selecionado a partir do Cadastro de Fornecedores.

Campos:

* Razão Social.
* Nome Fantasia.
* CNPJ.
* Contato.
* Telefone.
* E-mail.

---

# Informações Comerciais

Campos:

* Condição de pagamento.
* Prazo de pagamento.
* Prazo de entrega.
* Tipo de frete.
* Transportadora.
* Local de entrega.
* Observações comerciais.

---

# Itens do Pedido

Tabela configurável.

Colunas sugeridas:

* Código.
* Descrição.
* Dimensões.
* Bitola.
* Quantidade.
* Unidade.
* Valor Unitário.
* Valor Total.
* Previsão de entrega.

Os itens poderão pertencer a diferentes:

* Projetos.
* OFs.
* Requisições.

---

# Rastreabilidade

Cada item deverá manter vínculo com:

* Projeto.
* OF.
* Requisição.

Mesmo quando diversos itens forem comprados no mesmo Pedido.

---

# Recebimento Parcial

O sistema deverá permitir recebimentos parciais.

Exemplo:

Pedido:

10 barras SAE 4340.

Recebimento 1:

6 barras.

Recebimento 2:

4 barras.

O Pedido permanecerá aberto até o recebimento total ou cancelamento do saldo.

---

# Alterações

Enquanto não houver recebimento, o Comprador poderá:

* Alterar quantidades.
* Excluir itens.
* Adicionar itens.
* Alterar fornecedor.
* Alterar condições comerciais.

Após o primeiro recebimento, os itens recebidos não poderão mais ser alterados.

---

# Anexos

O Pedido poderá possuir anexos.

Exemplos:

* Cotações.
* Propostas.
* Desenhos.
* Especificações técnicas.
* Contratos.
* E-mails.

---

# Emissão

O sistema deverá permitir:

* Visualização.
* Impressão.
* Exportação em PDF.
* Envio por e-mail.

O layout será configurável pela empresa.

---

# Fluxo

Requisição

↓

Planejamento de Compras

↓

Pedido de Compra

↓

Fornecedor

↓

Recebimento

↓

Estoque

↓

Liberação da OF

---

# Princípios

O Pedido de Compra representa uma negociação comercial.

Um Pedido poderá atender:

* diversos Projetos;
* diversas OFs;
* diversas Requisições;
* diversos Materiais.

A rastreabilidade deverá ser preservada em todos os níveis.

O Comprador decide como organizar o Pedido.

O sistema registra e controla todo o ciclo até o recebimento final.
