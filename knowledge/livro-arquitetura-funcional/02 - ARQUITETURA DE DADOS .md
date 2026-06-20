# 02 - ARQUITETURA DE DADOS

# Arquitetura de Dados do NEXOTFE

**Versão:** 1.0
**Status:** Arquitetura Base Congelada
**Documento:** 02-ARQUITETURA-DE-DADOS.md

---

# Objetivo

Este documento define a Arquitetura de Dados do NEXOTFE.

Seu objetivo é estabelecer como as informações da empresa são organizadas, quais são as entidades principais do sistema e como elas se relacionam durante todo o ciclo operacional.

Este documento não define banco de dados, tabelas, tipos de campos ou tecnologias de implementação.

Seu foco é exclusivamente a organização conceitual das informações.

---

# Filosofia

A Arquitetura de Dados do NEXOTFE representa o fluxo natural das informações dentro de uma empresa industrial.

Cada informação possui uma única origem.

Cada entidade possui responsabilidades claramente definidas.

Os relacionamentos existem para preservar rastreabilidade, consistência e evolução do sistema.

---

# Princípios Fundamentais

Toda informação possui um proprietário funcional.

Nenhuma informação deverá ser duplicada entre módulos.

Toda informação deverá poder ser rastreada desde sua origem até sua conclusão.

As entidades representam conceitos da empresa e não estruturas de banco de dados.

Toda implementação futura deverá respeitar estes princípios.

---

# Estrutura Conceitual

A arquitetura está organizada em grandes grupos de entidades.

```text
Empresa
│
├── Configurações
│
├── Comercial
│
├── Engenharia
│
├── PCP
│
├── Suprimentos
│
├── Produção
│
├── Qualidade
│
└── Expedição
```

Cada grupo contém entidades especializadas e responsabilidades próprias.

---

# Núcleo Administrativo

Representa as informações estruturais da empresa.

Principais entidades:

* Empresa
* Usuários
* Configurações
* Numeração
* Parâmetros
* Tecnologias
* Recursos
* Colaboradores

Essas entidades sustentam toda a operação do sistema.

---

# Núcleo Comercial

Representa a origem dos negócios.

Principais entidades:

* Cliente
* Contato
* Projeto Comercial
* Orçamento
* Aprovação Comercial

Todo processo industrial inicia-se neste núcleo.

---

# Núcleo de Engenharia

Representa a definição técnica do produto.

Principais entidades:

* Projeto
* Item
* Part Number (PN)
* BOM
* Roteiro de Fabricação
* Documento Técnico
* Revisão

A Engenharia define o produto.

Ela não executa a produção.

---

# Núcleo PCP

Representa a organização da produção.

Principais entidades:

* Ordem de Fabricação
* Necessidade de Material
* Decisão do PCP
* Reserva
* Programação
* Dependência entre OFs

O PCP organiza o fluxo produtivo.

---

# Núcleo de Suprimentos

Representa o abastecimento da fábrica.

Principais entidades:

* Estoque
* Requisição de Compra
* Planejamento de Compras
* Pedido de Compra
* Recebimento
* Fornecedor

O objetivo deste núcleo é garantir disponibilidade de materiais no momento correto.

---

# Núcleo de Produção

Representa a execução física do planejamento.

Principais entidades:

* Operação
* Tecnologia
* Recurso Produtivo
* Colaborador
* Apontamento
* Serviço Terceirizado

A Produção transforma materiais em produtos.

---

# Núcleo da Qualidade

Representa a validação dos processos.

Principais entidades:

* Inspeção
* Certificado
* Não Conformidade
* Liberação

A Qualidade acompanha materiais, processos e produtos.

---

# Núcleo de Expedição

Representa o encerramento do ciclo operacional.

Principais entidades:

* Produto Acabado
* Separação
* Expedição
* Entrega

O fluxo somente termina após a confirmação da entrega ao cliente.

---

# Fluxo das Informações

O NEXOTFE organiza os dados na seguinte sequência lógica:

Cliente

↓

Projeto Comercial

↓

Projeto Industrial

↓

Item

↓

Part Number (PN)

↓

BOM

↓

Roteiro de Fabricação

↓

Ordem de Fabricação

↓

Necessidades de Material

↓

Decisão do PCP

↓

Reserva de Estoque

ou

Requisição de Compra

↓

Planejamento de Compras

↓

Pedido de Compra

↓

Recebimento

↓

Produção

↓

Produto Acabado

↓

Expedição

↓

Entrega

Cada entidade recebe informações da etapa anterior e fornece informações para a etapa seguinte.

---

# Responsabilidade das Entidades

Cada entidade possui responsabilidade exclusiva.

Exemplos:

Projeto organiza o trabalho.

PN identifica tecnicamente o item.

BOM descreve a composição.

Roteiro descreve o processo de fabricação.

OF organiza a produção.

Operações executam o trabalho.

Necessidades representam demandas calculadas.

Reservas representam compromisso lógico do estoque.

Compras representam aquisição externa.

Recebimento valida entrada de materiais.

Produção transforma materiais.

Expedição entrega produtos.

Nenhuma entidade deverá assumir responsabilidades pertencentes a outra.

---

# Rastreabilidade

Toda informação deverá permitir navegação completa entre origem e destino.

Exemplos:

Cliente → Projeto → OF → Produção → Entrega

Ou

Material → Necessidade → Reserva → Consumo → Produto

Essa rastreabilidade representa um dos princípios fundamentais da arquitetura do NEXOTFE.

---

# Evolução da Arquitetura

Novas entidades poderão ser incorporadas no futuro.

Entretanto, deverão respeitar obrigatoriamente:

* a separação de responsabilidades;
* a rastreabilidade;
* a origem única da informação;
* os princípios definidos neste documento.

A evolução da arquitetura nunca deverá comprometer a consistência dos dados existentes.

---

# Considerações Finais

A Arquitetura de Dados representa a organização conceitual das informações do NEXOTFE.

Ela não descreve banco de dados.

Ela não descreve implementação.

Seu objetivo é garantir que toda evolução tecnológica preserve exatamente o mesmo modelo conceitual da empresa.

Toda implementação deverá ser consequência desta arquitetura.

Nunca o contrário.

---

**Documentos relacionados:**

* `01-ARQUITETURA-GERAL.md`
* `03-ESTADOS-OFICIAIS.md`
