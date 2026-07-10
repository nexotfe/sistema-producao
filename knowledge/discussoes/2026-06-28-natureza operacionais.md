# NATUREZAS OPERACIONAIS

## NEXOTFE 1.0

### Objetivo

A Natureza Operacional define como a empresa deverá conduzir todo o fluxo operacional, industrial, logístico e fiscal de uma venda.

Ela é uma das primeiras informações definidas durante a elaboração do Orçamento.

A Natureza não representa apenas uma classificação comercial.

Ela determina como o ERP deverá se comportar durante todo o ciclo de vida da operação.

---

# Conceito

Toda oportunidade comercial deverá possuir obrigatoriamente uma Natureza Operacional.

As Naturezas disponíveis no NEXOTFE 1.0 são:

* Fabricação
* Desenvolvimento
* Industrialização
* Serviço

Cada Natureza possui regras próprias de:

* Engenharia
* Compras
* Estoque
* PCP
* Produção
* Qualidade
* Expedição
* Faturamento
* Fiscal

---

# Regras Gerais

A Natureza será definida durante a criação do Orçamento.

Após sua definição:

* O fluxo operacional será adaptado automaticamente.
* As regras de negócio específicas serão aplicadas.
* O comportamento dos módulos seguirá a Natureza selecionada.

A alteração da Natureza após o início do processo deverá ser evitada e, quando permitida, deverá ocorrer apenas enquanto o Orçamento estiver em elaboração.

---

# Comparativo Operacional

| Item                                     | Fabricação                | Desenvolvimento                      | Industrialização                  | Serviço                  |
| ---------------------------------------- | ------------------------- | ------------------------------------ | --------------------------------- | ------------------------ |
| Objetivo                                 | Fabricar um produto       | Desenvolver uma solução técnica      | Industrializar produto do cliente | Executar serviço técnico |
| Matéria-prima fornecida por              | Empresa                   | Empresa                              | Cliente                           | Conforme necessidade     |
| Compra de matéria-prima                  | Sim                       | Sim                                  | Normalmente não                   | Quando necessária        |
| Produto acabado                          | Sim                       | Pode existir                         | Sim                               | Normalmente não          |
| Produto pertence à empresa até a entrega | Sim                       | Sim                                  | Não                               | Não se aplica            |
| Controle de MP do cliente                | Não                       | Não                                  | Sim                               | Quando aplicável         |
| Engenharia                               | Quando necessária         | Obrigatória                          | Quando necessária                 | Quando necessária        |
| Roteiro de fabricação                    | Obrigatório para produzir | Obrigatório quando houver fabricação | Obrigatório                       | Quando aplicável         |
| Ordem de Fabricação                      | Sim                       | Quando houver fabricação             | Sim                               | Normalmente não          |
| Controle de estoque                      | Completo                  | Completo                             | Estoque de materiais do cliente   | Normalmente não          |
| Planejamento PCP                         | Sim                       | Sim                                  | Sim                               | Quando aplicável         |
| Produção                                 | Sim                       | Quando houver fabricação             | Sim                               | Quando aplicável         |
| Qualidade                                | Sim                       | Sim                                  | Sim                               | Quando aplicável         |
| Expedição                                | Sim                       | Sim                                  | Retorno ao cliente                | Não se aplica            |
| Tributação                               | Venda de fabricação       | Venda de desenvolvimento             | Industrialização                  | Prestação de serviço     |

---

# Fluxo Operacional

## Fabricação

Cliente

↓

Orçamento

↓

Análise de Viabilidade

↓

Projeto

↓

Engenharia

↓

Compras

↓

PCP

↓

Produção

↓

Qualidade

↓

Expedição

↓

Entrega

---

## Desenvolvimento

Cliente

↓

Orçamento

↓

Análise de Viabilidade

↓

Projeto

↓

PRD / PDR

↓

CDR

↓

FDR

↓

Fabricação (quando aplicável)

↓

Entrega

---

## Industrialização

Cliente entrega a matéria-prima

↓

Orçamento

↓

Análise de Viabilidade

↓

Projeto

↓

Industrialização

↓

Qualidade

↓

Retorno ao Cliente

---

## Serviço

Cliente

↓

Orçamento

↓

Análise de Viabilidade

↓

Projeto

↓

Execução do Serviço

↓

Relatório Técnico (quando aplicável)

↓

Entrega

---

# Particularidades

## Fabricação

A empresa é responsável pela aquisição da matéria-prima, fabricação, inspeção, armazenamento e entrega do produto acabado.

---

## Desenvolvimento

O foco principal é o desenvolvimento técnico.

A fabricação poderá ocorrer posteriormente.

O projeto seguirá marcos técnicos próprios.

---

## Industrialização

A matéria-prima pertence ao cliente.

O sistema deverá manter rastreabilidade completa dos materiais recebidos.

As regras de estoque, movimentação e faturamento são diferentes da Fabricação.

---

## Serviço

O resultado principal é a execução de um serviço.

Pode existir utilização de materiais, porém o foco é a prestação do serviço.

---

# Impacto nos Módulos

A Natureza Operacional influencia diretamente os módulos:

* Comercial
* Produtos
* Engenharia
* Compras
* Estoque
* Planejamento PCP
* Programação Diária
* Produção
* Qualidade
* Expedição
* Faturamento
* Fiscal

Cada módulo deverá adaptar seu comportamento conforme a Natureza definida no Orçamento.

---

# Princípios

* A Natureza Operacional é definida no Orçamento.
* A Natureza controla o comportamento do ERP.
* Naturezas diferentes possuem fluxos diferentes.
* O sistema deverá adaptar-se automaticamente à Natureza selecionada.
* O usuário define a Natureza; o sistema aplica as regras correspondentes.

---

# Filosofia

O NEXOTFE foi concebido para representar a operação real da indústria.

Não existe um único fluxo de negócio aplicável a todas as empresas ou operações.

Cada Natureza possui características próprias de engenharia, compras, produção, estoque e tributação.

O objetivo do NEXOTFE é adaptar o ERP ao processo operacional da empresa, preservando a rastreabilidade, a consistência das informações e a aderência às práticas industriais.

O sistema organiza, valida e orienta o processo.

As decisões de negócio permanecem sob responsabilidade dos especialistas da empresa.
