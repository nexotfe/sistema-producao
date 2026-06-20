# 05 - DICIONÁRIO INDUSTRIAL

# Dicionário Industrial Oficial do NEXOTFE

**Versão:** 1.0
**Status:** Arquitetura Base Congelada
**Documento:** 05-DICIONARIO-INDUSTRIAL.md

---

# Objetivo

Este documento define a terminologia oficial utilizada pelo NEXOTFE.

Seu objetivo é garantir que usuários, analistas, desenvolvedores e administradores utilizem exatamente os mesmos conceitos durante todo o ciclo de vida do sistema.

Cada termo possui um único significado.

Nenhuma implementação poderá alterar o significado dos termos definidos neste documento.

---

# Filosofia

O NEXOTFE representa uma indústria.

Por esse motivo, sua linguagem deve representar processos industriais e não apenas conceitos de software.

Toda palavra utilizada pelo sistema deverá possuir significado único, claro e rastreável.

---

# Empresa

Organização responsável pela operação do sistema.

Toda informação pertence obrigatoriamente a uma empresa.

A empresa é o limite de segurança, rastreabilidade e isolamento dos dados.

---

# Cliente

Pessoa física ou jurídica que solicita produtos, serviços ou desenvolvimento.

Todo fluxo operacional nasce a partir de um cliente.

---

# Contato

Pessoa vinculada ao cliente.

Pode exercer funções comerciais, técnicas, fiscais, compras, qualidade ou outras necessárias ao relacionamento.

---

# Projeto

Unidade principal de gestão do NEXOTFE.

Todo trabalho executado pelo sistema pertence a um projeto.

O projeto acompanha o processo desde o orçamento até a entrega.

---

# Item

Elemento pertencente a um projeto.

Pode representar:

* Produto;
* Conjunto;
* Subconjunto;
* Componente.

Cada item poderá possuir estrutura técnica própria.

---

# Part Number (PN)

Identificação técnica única de um item.

Um PN representa exatamente um produto ou componente.

O mesmo PN poderá ser reutilizado em diversos projetos.

---

# BOM (Bill of Materials)

Estrutura física do produto.

Responde à pergunta:

**"Do que o produto é composto?"**

Define componentes, matérias-primas e quantidades.

Não define como fabricar.

---

# Roteiro de Fabricação

Processo utilizado para fabricar um item.

Responde à pergunta:

**"Como fabricar o produto?"**

Define:

* operações;
* sequência;
* tecnologias;
* recursos;
* materiais consumidos;
* tempos previstos;
* serviços terceirizados.

---

# Ordem de Fabricação (OF)

Documento responsável por organizar a fabricação de um item.

Define:

* quantidade;
* roteiro utilizado;
* necessidades geradas;
* acompanhamento da produção.

A OF organiza o trabalho.

Ela não executa operações.

---

# Operação (OP)

Etapa individual pertencente a uma Ordem de Fabricação.

Cada operação representa uma atividade específica do processo produtivo.

Exemplos:

* Corte;
* Torneamento;
* Fresamento;
* Soldagem;
* Montagem;
* Inspeção.

---

# Tecnologia

Conhecimento ou processo necessário para executar uma operação.

Exemplos:

* Torneamento CNC;
* Fresamento CNC;
* Corte a Laser;
* Tratamento Térmico;
* Soldagem TIG.

Uma tecnologia pode ser executada por diferentes recursos produtivos.

---

# Recurso Produtivo

Máquina, equipamento, dispositivo ou fornecedor capaz de executar determinada tecnologia.

Exemplos:

* Centro de Usinagem CNC até 1000 mm;
* Centro de Usinagem CNC até 3000 mm;
* Torno CNC;
* Serra Vertical;
* Empresa de Tratamento Térmico.

---

# Colaborador

Pessoa responsável por executar atividades dentro da empresa.

O NEXOTFE controla capacidade semanal, qualificações e disponibilidade.

Horários de entrada e saída pertencem ao RH e não fazem parte do planejamento operacional.

---

# Necessidade de Material

Demanda calculada automaticamente pelo sistema a partir do Roteiro de Fabricação e da quantidade da OF.

Toda necessidade nasce aguardando decisão do PCP.

---

# Decisão do PCP

Registro formal da decisão sobre como atender uma necessidade de material.

Opções oficiais:

* Estoque;
* Compra;
* Estoque + Compra.

O sistema poderá sugerir.

A decisão pertence ao PCP.

---

# Reserva de Estoque

Compromisso lógico de determinada quantidade de material para uma necessidade específica.

A reserva reduz o saldo disponível para planejamento.

Ela não representa movimentação física.

---

# Consumo

Movimentação física do material para a produção.

O consumo reduz o estoque físico e normalmente ocorre sobre uma reserva previamente criada.

Reserva e Consumo são eventos distintos.

---

# Requisição de Compra

Solicitação formal para aquisição de materiais ou serviços.

Pode ser criada manualmente ou automaticamente por gatilhos definidos pelo sistema.

Toda requisição possui origem rastreável.

---

# Planejamento de Compras

Processo responsável por consolidar necessidades compatíveis antes da emissão dos pedidos de compra.

Seu objetivo é otimizar aquisições e reduzir custos.

---

# Pedido de Compra

Documento oficial enviado ao fornecedor para aquisição de materiais ou serviços.

Representa o compromisso comercial entre empresa e fornecedor.

---

# Recebimento

Processo responsável por validar materiais recebidos.

É composto por etapas independentes:

* Recebimento Físico;
* Conferência Documental;
* Inspeção (quando aplicável).

Somente após a conclusão dessas etapas o material poderá ser disponibilizado ao estoque.

---

# Produção

Conjunto de operações responsáveis por transformar matérias-primas em produtos acabados.

Seu principal objetivo é manter o fluxo contínuo da fábrica.

---

# Qualidade

Área responsável por verificar conformidade de materiais, processos e produtos.

Atua durante todo o ciclo produtivo.

---

# Produto Acabado

Item totalmente produzido e liberado para expedição.

Representa o resultado final da produção.

---

# Expedição

Processo responsável pela separação, conferência e envio dos produtos ao cliente.

Representa o encerramento do fluxo operacional.

---

# Fluxo Industrial Oficial

Cliente

↓

Projeto

↓

Item

↓

Part Number

↓

BOM

↓

Roteiro

↓

Ordem de Fabricação

↓

Necessidades

↓

Decisão do PCP

↓

Reserva ou Compra

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

Este fluxo representa a sequência oficial de funcionamento do NEXOTFE.

---

# Princípios da Linguagem

Cada termo possui um único significado.

Cada informação possui uma única origem.

Cada processo possui um responsável.

Toda decisão importante deverá ser registrada.

Toda movimentação deverá ser rastreável.

A linguagem oficial do NEXOTFE deverá permanecer consistente em toda evolução da plataforma.

---

# Considerações Finais

O Dicionário Industrial constitui a referência oficial da terminologia utilizada pelo NEXOTFE.

Seu objetivo é eliminar ambiguidades, facilitar a comunicação entre equipes e preservar a consistência da arquitetura funcional.

Toda nova funcionalidade deverá utilizar obrigatoriamente os conceitos definidos neste documento.

---

**Documentos relacionados:**

* `01-ARQUITETURA-GERAL.md`
* `02-ARQUITETURA-DE-DADOS.md`
* `03-ESTADOS-OFICIAIS.md`
* `04-PADRAO-DE-CLASSIFICACOES.md`
