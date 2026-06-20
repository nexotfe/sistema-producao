# 01 - ARQUITETURA GERAL

# Arquitetura Geral do NEXOTFE

**Versão:** 1.0
**Status:** Arquitetura Base Congelada
**Documento:** 01-ARQUITETURA-GERAL.md

---

# Objetivo

Este documento apresenta a Arquitetura Geral do NEXOTFE.

Seu objetivo é definir como a plataforma está organizada, quais são seus módulos principais, suas responsabilidades e como eles se relacionam durante todo o ciclo operacional da empresa.

Este documento representa a estrutura funcional da empresa, independentemente da tecnologia utilizada para sua implementação.

---

# Filosofia da Arquitetura

O NEXOTFE não foi organizado por telas.

O NEXOTFE foi organizado por processos.

Cada módulo representa uma área funcional da empresa e possui responsabilidades claramente definidas.

As informações fluem naturalmente entre os módulos, preservando rastreabilidade, consistência e apoio à tomada de decisão.

O sistema existe para organizar a operação da empresa, e não para modificar sua forma de trabalhar.

---

# Visão Geral

A arquitetura do NEXOTFE representa o ciclo completo de uma empresa industrial.

Desde o primeiro contato comercial até a entrega do produto ao cliente, todas as informações permanecem conectadas por meio de um fluxo único.

Cada módulo possui objetivos específicos, porém todos fazem parte de um único processo empresarial.

---

# Estrutura Geral

```text
EMPRESA
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

Todos os módulos compartilham uma única base de informações e trabalham sobre os mesmos conceitos definidos pelo Livro Mestre e pela Arquitetura Funcional.

---

# Configurações

Responsável pelas informações estruturais da empresa.

Principais responsabilidades:

* Empresas
* Usuários
* Numeração
* Parâmetros Gerais
* Tecnologias
* Recursos Produtivos
* Colaboradores
* Configurações Operacionais

Esse módulo fornece a infraestrutura necessária para o funcionamento dos demais.

---

# Comercial

Representa a entrada de novos negócios.

Principais responsabilidades:

* Clientes
* Contatos
* Oportunidades
* Orçamentos
* Projetos Comerciais
* Aprovação Comercial

Todo trabalho executado pelo NEXOTFE possui origem no Comercial.

---

# Engenharia

Responsável pela definição técnica do produto.

Principais responsabilidades:

* Projetos Industriais
* Itens
* Part Number (PN)
* BOM
* Roteiros de Fabricação
* Documentação Técnica
* Revisões

Toda identidade técnica nasce na Engenharia.

Nenhuma definição técnica deverá ser criada diretamente na Produção.

---

# PCP

Responsável pela organização da produção.

Principais responsabilidades:

* Ordens de Fabricação
* Necessidades de Materiais
* Decisões de Atendimento
* Reservas
* Programação
* Dependências entre OFs

O PCP organiza o fluxo produtivo.

O sistema auxilia.

A decisão permanece humana.

---

# Suprimentos

Responsável pela disponibilidade dos recursos necessários à produção.

Principais responsabilidades:

* Estoque
* Requisições
* Planejamento de Compras
* Pedidos de Compra
* Recebimento
* Fornecedores

Seu objetivo é garantir que os materiais estejam disponíveis no momento correto.

---

# Produção

Representa a execução física do planejamento.

Principais responsabilidades:

* Operações
* Tecnologias
* Recursos
* Colaboradores
* Apontamentos
* Serviços Terceirizados

A Produção transforma planejamento em produto acabado.

---

# Qualidade

Responsável por validar materiais, processos e produtos.

Principais responsabilidades:

* Inspeções
* Certificados
* Não Conformidades
* Liberações

A Qualidade garante conformidade técnica durante todo o processo.

---

# Expedição

Representa o encerramento do fluxo operacional.

Principais responsabilidades:

* Produto Acabado
* Separação
* Expedição
* Entrega

O ciclo industrial somente é considerado concluído após a entrega ao cliente.

---

# Fluxo Principal

O NEXOTFE organiza o seguinte fluxo operacional:

Cliente

↓

Projeto Comercial

↓

Orçamento

↓

Aprovação

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

Necessidades de Materiais

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

Esse fluxo representa a espinha dorsal do NEXOTFE e deverá ser preservado em toda evolução da plataforma.

---

# Responsabilidades

Cada módulo possui responsabilidades exclusivas.

Nenhum módulo deverá assumir funções pertencentes a outro.

Exemplos:

* Comercial vende.
* Engenharia define.
* PCP organiza.
* Suprimentos abastece.
* Produção executa.
* Qualidade valida.
* Expedição entrega.

Essa separação reduz conflitos, facilita a manutenção do sistema e preserva a organização operacional da empresa.

---

# Princípios Arquiteturais

A Arquitetura Geral do NEXOTFE é baseada nos seguintes princípios:

* A empresa é organizada por processos.
* Cada informação possui uma única origem.
* Cada módulo possui responsabilidades claramente definidas.
* O sistema calcula informações e apresenta sugestões.
* As decisões permanecem sob responsabilidade das pessoas.
* Toda informação deverá ser rastreável desde sua origem até sua conclusão.
* A evolução da arquitetura deverá preservar compatibilidade com os princípios definidos neste documento.

---

# Integração entre os Módulos

Os módulos do NEXOTFE não funcionam de forma isolada.

Cada módulo fornece informações para o próximo, formando um fluxo contínuo.

A integração entre eles é realizada por meio das entidades definidas na Arquitetura de Dados e pelos Contratos Técnicos correspondentes.

---

# Considerações Finais

A Arquitetura Geral representa a organização funcional da plataforma NEXOTFE.

Ela não define implementação, banco de dados ou tecnologia.

Seu objetivo é servir como referência permanente para toda evolução do sistema.

Toda decisão arquitetural futura deverá preservar os princípios estabelecidos neste documento.

---

**Documento relacionado:**

`02-ARQUITETURA-DE-DADOS.md`
