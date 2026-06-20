# 04 - PADRÃO OFICIAL DE CLASSIFICAÇÕES

# Padrão Oficial de Classificações do NEXOTFE

**Versão:** 1.0
**Status:** Arquitetura Base Congelada
**Documento:** 04-PADRAO-DE-CLASSIFICACOES.md

---

# Objetivo

Este documento define o padrão oficial de classificações utilizado pelo NEXOTFE.

Seu objetivo é eliminar ambiguidades na modelagem do sistema, garantindo que cada classificação possua uma única finalidade e um único significado.

Banco de Dados, Backend, Frontend, APIs, Relatórios e Documentação deverão utilizar obrigatoriamente este padrão.

---

# Filosofia

Uma classificação existe para responder apenas uma pergunta.

Nunca utilizar uma classificação para representar outra.

Exemplos:

Estado não representa Tipo.

Categoria não representa Prioridade.

Origem não representa Situação.

Essa separação garante consistência durante toda a evolução do sistema.

---

# Princípio Fundamental

Cada classificação possui responsabilidade exclusiva.

Se uma informação responder mais de uma pergunta, deverão existir classificações diferentes.

---

# Estado

## Pergunta que responde

**Em que situação a entidade se encontra neste momento?**

O Estado representa o ciclo de vida da entidade.

Exemplos:

Projeto:

* Em Orçamento
* Aprovado
* Em Produção
* Concluído

OF:

* Programada
* Em Produção
* Finalizada

Reserva:

* Ativa
* Consumida
* Liberada

Características:

* muda ao longo do tempo;
* representa evolução;
* existe apenas um estado atual.

---

# Tipo

## Pergunta que responde

**O que esta entidade é?**

O Tipo representa sua natureza.

Exemplos:

Projeto:

* Fabricação
* Desenvolvimento
* Serviço
* Industrialização

Operação:

* Interna
* Terceirizada
* Movimentação
* Inspeção

Fornecedor:

* Matéria-prima
* Tratamento Térmico
* Pintura
* Transporte

Características:

* normalmente não muda;
* define identidade.

---

# Categoria

## Pergunta que responde

**A qual grupo esta entidade pertence?**

A Categoria organiza informações semelhantes.

Exemplos:

Material:

* Matéria-prima
* Ferramenta
* Consumo
* Escritório

Compra:

* Produção
* Manutenção
* Administrativo

Cliente:

* Nacional
* Internacional

Características:

* utilizada para organização;
* utilizada em filtros e relatórios.

---

# Origem

## Pergunta que responde

**De onde esta informação foi gerada?**

A Origem identifica o processo que criou determinado registro.

Exemplos:

Requisição:

* Projeto
* OF
* Estoque
* Manual

Movimentação:

* Compra
* Produção
* Ajuste
* Inventário

Projeto:

* Comercial
* Engenharia

Características:

* identifica a fonte;
* auxilia rastreabilidade.

---

# Prioridade

## Pergunta que responde

**Qual a urgência deste registro?**

Exemplos:

* Baixa
* Normal
* Alta
* Crítica

Características:

* auxilia planejamento;
* não altera fluxo;
* não altera estado.

---

# Situação

## Pergunta que responde

**Existe alguma condição especial?**

A Situação representa condições temporárias ou complementares.

Exemplos:

Fornecedor:

* Homologado
* Bloqueado
* Em Avaliação

Material:

* Obsoleto
* Em Revisão

Projeto:

* Suspenso
* Em Espera

Características:

* complementar ao Estado;
* pode coexistir com qualquer estado.

---

# Classificações Complementares

Conforme a evolução do sistema, poderão existir outras classificações especializadas.

Exemplos:

* Severidade
* Criticidade
* Risco
* Complexidade
* Impacto

Cada nova classificação deverá responder apenas uma pergunta claramente definida.

---

# Regras Gerais

Antes de criar qualquer campo de classificação, responder obrigatoriamente:

1. Estou representando uma evolução?
   → Estado.

2. Estou identificando a natureza?
   → Tipo.

3. Estou agrupando informações?
   → Categoria.

4. Estou identificando a origem?
   → Origem.

5. Estou definindo urgência?
   → Prioridade.

6. Estou registrando uma condição especial?
   → Situação.

Se nenhuma dessas perguntas responder ao problema, deverá ser criada uma nova classificação oficialmente documentada.

---

# Boas Práticas

Nunca reutilizar uma classificação para outra finalidade.

Nunca utilizar textos livres quando existir classificação oficial.

Nunca criar novos valores diretamente no código.

Toda classificação deverá estar documentada.

Toda implementação deverá utilizar exatamente a mesma nomenclatura em:

* Banco de Dados;
* Backend;
* Frontend;
* APIs;
* Relatórios;
* Documentação.

---

# Benefícios

Este padrão proporciona:

* consistência;
* facilidade de manutenção;
* redução de ambiguidades;
* integração entre módulos;
* melhor rastreabilidade;
* maior facilidade para evolução futura.

---

# Considerações Finais

O Padrão Oficial de Classificações estabelece uma linguagem comum para toda a plataforma NEXOTFE.

Sua correta utilização garante que diferentes equipes implementem funcionalidades de forma consistente, preservando a arquitetura funcional do sistema.

Toda nova classificação deverá seguir os princípios definidos neste documento.

---

**Documentos relacionados:**

* `03-ESTADOS-OFICIAIS.md`
* `05-DICIONARIO-INDUSTRIAL.md`
