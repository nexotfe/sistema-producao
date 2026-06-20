# 03 - ESTADOS OFICIAIS

# Estados Oficiais do NEXOTFE

**Versão:** 1.0
**Status:** Arquitetura Base Congelada
**Documento:** 03-ESTADOS-OFICIAIS.md

---

# Objetivo

Este documento define os estados oficiais utilizados pelo NEXOTFE.

Seu objetivo é garantir que todos os módulos do sistema utilizem a mesma nomenclatura e o mesmo significado para representar o ciclo de vida das entidades.

Banco de Dados, APIs, Backend, Frontend, Relatórios e Integrações deverão utilizar obrigatoriamente os estados definidos neste documento.

---

# Filosofia

Um estado representa a situação atual de uma entidade.

Estados não representam ações, permissões ou tipos.

Cada entidade possui seu próprio ciclo de vida.

Toda mudança de estado deverá ser registrada para fins de rastreabilidade.

---

# Princípios

Cada entidade possui apenas um estado atual.

Estados devem representar fases claramente distintas.

Mudanças de estado deverão respeitar o fluxo operacional definido pelo Livro Mestre.

Nenhuma implementação poderá criar estados diferentes sem atualização desta documentação.

---

# Projeto

## Ciclo de Vida

```text
Rascunho

↓

Em Orçamento

↓

Em Desenvolvimento

↓

Aguardando Aprovação

↓

Aprovado

↓

Em Planejamento

↓

Em Produção

↓

Concluído

↓

Cancelado
```

### Descrição

**Rascunho**
Projeto em elaboração.

**Em Orçamento**
Projeto em estudo comercial e técnico.

**Em Desenvolvimento**
Engenharia desenvolvendo a solução.

**Aguardando Aprovação**
Aguardando aprovação do cliente.

**Aprovado**
Projeto liberado para execução.

**Em Planejamento**
PCP preparando a produção.

**Em Produção**
Existe produção em andamento.

**Concluído**
Projeto encerrado com sucesso.

**Cancelado**
Projeto encerrado sem continuidade.

---

# Ordem de Fabricação (OF)

## Ciclo de Vida

```text
Simulação

↓

Aguardando Material

↓

Pronta para Programação

↓

Programada

↓

Em Produção

↓

Parada

↓

Finalizada

↓

Cancelada
```

### Descrição

**Simulação**
OF ainda não liberada.

**Aguardando Material**
Existe necessidade pendente.

**Pronta para Programação**
Todos os recursos necessários estão disponíveis.

**Programada**
Inserida oficialmente na programação.

**Em Produção**
Operações em execução.

**Parada**
Execução interrompida temporariamente.

**Finalizada**
Todas as operações concluídas.

**Cancelada**
OF encerrada antes da conclusão.

---

# Necessidade de Material

## Ciclo de Vida

```text
Definir

↓

Decisão Registrada

↓

Atendimento Parcial

↓

Atendida

↓

Cancelada
```

### Descrição

**Definir**
Aguardando decisão do PCP.

**Decisão Registrada**
Forma de atendimento definida.

**Atendimento Parcial**
Parte reservada e parte em compra.

**Atendida**
Necessidade totalmente atendida.

**Cancelada**
Necessidade anulada.

---

# Reserva de Estoque

## Ciclo de Vida

```text
Ativa

↓

Consumida

↓

Liberada

↓

Cancelada
```

### Descrição

**Ativa**
Material reservado para uma necessidade.

**Consumida**
Material utilizado pela produção.

**Liberada**
Reserva desfeita antes do consumo.

**Cancelada**
Reserva anulada por cancelamento do processo.

---

# Requisição de Compra

## Ciclo de Vida

```text
Aberta

↓

Em Cotação

↓

Aprovada

↓

Convertida em Pedido

↓

Cancelada
```

---

# Pedido de Compra

## Ciclo de Vida

```text
Emitido

↓

Parcialmente Recebido

↓

Recebido

↓

Encerrado

↓

Cancelado
```

---

# Recebimento

## Ciclo de Vida

```text
Aguardando Recebimento

↓

Recebimento Físico

↓

Conferência Documental

↓

Inspeção

↓

Liberado

↓

Rejeitado
```

### Observação

O Recebimento Físico confirma o material entregue.

A Conferência Documental valida a documentação (Nota Fiscal, Pedido de Compra e demais documentos).

Essas etapas são independentes e obrigatórias.

---

# Operação (OP)

## Ciclo de Vida

```text
Aguardando

↓

Preparação

↓

Em Execução

↓

Pausada

↓

Inspeção

↓

Concluída

↓

Cancelada
```

---

# Produto Acabado

## Ciclo de Vida

```text
Em Produção

↓

Aguardando Expedição

↓

Expedido

↓

Entregue
```

---

# Regras Gerais

Os estados definidos neste documento representam o padrão oficial do NEXOTFE.

Nenhum módulo poderá utilizar nomenclaturas diferentes para representar a mesma situação operacional.

Mudanças deverão ocorrer simultaneamente em:

* Arquitetura;
* Banco de Dados;
* Backend;
* Frontend;
* APIs;
* Relatórios;
* Integrações.

---

# Importante

Estado não é Tipo.

Estado não é Categoria.

Estado não é Prioridade.

Esses conceitos são independentes e estão definidos no documento:

**04-PADRAO-DE-CLASSIFICACOES.md**

---

# Considerações Finais

Os Estados Oficiais representam o ciclo de vida das principais entidades do NEXOTFE.

Sua finalidade é padronizar toda a plataforma, evitando divergências entre documentação, banco de dados e implementação.

Qualquer evolução futura deverá preservar a consistência definida neste documento.

---

**Documentos relacionados:**

* `02-ARQUITETURA-DE-DADOS.md`
* `04-PADRAO-DE-CLASSIFICACOES.md`
