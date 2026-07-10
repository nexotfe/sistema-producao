# PÁGINA - NECESSIDADE DE COMPRAS

## Módulo PCP


# Objetivo

A página **Necessidade de Compras** é utilizada pelo PCP para analisar todas as necessidades de materiais dos Projetos.

Nesta etapa, o PCP decide se cada necessidade será atendida por:

* **CI — Consumo Interno** (material disponível em estoque).
* **C — Compra** (material inexistente ou insuficiente no estoque).

Essa decisão antecede o módulo de Compras.

O Comprador somente receberá as necessidades classificadas como **Compra (C)**.

---

# Cabeçalho

Título:

**Necessidade de Compras**

Campos:

* Busca geral

A pesquisa deverá localizar informações por:

* Projeto.
* OF.
* Requisição.
* Material.
* Código.
* Descrição.

No canto superior direito:

* Nome do usuário logado.

Esse padrão deverá ser utilizado futuramente em todas as páginas do NEXOTFE.

---

# Botões

* Voltar.
* Início.

---

# Indicadores

Remover:

* CI Total.
* CI Parcial.
* Compra Total.
* Requisições Abertas.

As informações estarão disponíveis diretamente na tabela.

---

# Tabela Principal

A tabela será configurável pela empresa.

Colunas padrão:

* Projeto.
* OF.
* Requisição.
* Material.
* Descrição.
* Dimensões.
* Bitola.
* Quantidade.
* Unidade.
* CI (Consumo Interno).
* C (Compra).

As colunas poderão ser reorganizadas, ocultadas ou adicionadas conforme a necessidade da empresa.

---

# Decisão do PCP

Cada linha representa uma necessidade de material.

O PCP deverá selecionar apenas uma opção:

☐ CI — Consumo Interno

ou

☐ C — Compra

As duas opções são mutuamente exclusivas.

Nunca poderão permanecer selecionadas simultaneamente.

---

# Consumo Interno (CI)

Quando o PCP selecionar:

**CI**

O sistema deverá:

* Reservar automaticamente o material no estoque.
* Vincular a reserva ao Projeto e à OF.
* Liberar a OF para Produção, desde que os demais requisitos também estejam atendidos.

Nenhuma Requisição de Compra será criada.

---

# Compra (C)

Quando o PCP selecionar:

**C**

O sistema deverá:

* Criar automaticamente uma Requisição de Compra.
* Vincular a Requisição ao Projeto e à OF.
* Enviar automaticamente a Requisição para o módulo Compras.

A OF permanecerá aguardando a chegada do material.

---

# Liberação da OF

A OF somente poderá ser liberada quando:

* Desenho técnico aprovado.
* Material reservado (CI) ou material recebido (Compra).
* Demais bloqueios inexistentes.

Caso qualquer requisito não seja atendido, a OF permanecerá bloqueada.

---

# Responsabilidades

## PCP

Responsável por:

* Analisar as necessidades.
* Decidir entre CI ou Compra.
* Reservar materiais.
* Liberar OFs.

---

## Compras

Responsável por:

* Receber as Requisições geradas pelo PCP.
* Executar o processo de compra.
* Receber materiais.
* Disponibilizar os materiais ao estoque.

O Comprador não decide se um item será comprado ou consumido do estoque.

Essa decisão pertence ao PCP.

---

# Princípios

O PCP administra materiais para a Produção.

O Compras administra aquisições.

O sistema executa automaticamente as ações decorrentes da decisão do PCP.

A decisão é única:

**CI ou Compra.**

Nunca ambas simultaneamente.
