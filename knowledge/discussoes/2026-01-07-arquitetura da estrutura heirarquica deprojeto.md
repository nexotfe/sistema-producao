NEXOTFE – Arquitetura da Estrutura Hierárquica de Projetos
Documento Funcional – Versão 1.0
Objetivo

Este documento define o funcionamento da Estrutura Hierárquica de Projetos do NEXOTFE.

Esta arquitetura será utilizada pelos módulos:

Comercial
Orçamento
Engenharia
PCP
Compras
Produção
Custos
Explosão de Materiais (BOM)

O objetivo é permitir que qualquer item do projeto possa possuir sua própria estrutura interna, sem limitação de níveis.

Conceito

No NEXOTFE não existem conceitos fixos de:

Pai
Filho
Neto
Bisneto

Esses termos servem apenas para explicar a estrutura.

Para o sistema existe apenas uma regra:

Todo item poderá possuir uma estrutura própria.

Isso permite criar produtos extremamente simples ou extremamente complexos utilizando exatamente a mesma arquitetura.

Estrutura Inicial

Todo projeto nasce da mesma forma.

Projeto

↓

Itens do Projeto

Exemplo:

Item	Descrição
1	Base Soldada
2	Eixo
3	Suporte do Eixo
4	Conjunto da Serra

Neste momento todos os itens são apenas itens do projeto.

Nenhum possui estrutura.

Quando um Item se torna um Conjunto

Durante o orçamento ou engenharia o usuário poderá decidir que determinado item deverá possuir componentes próprios.

Exemplo:

Conjunto da Serra

O usuário então cria uma estrutura para este item.

Após isso, este item passa a possuir uma estrutura própria.

Visualmente:

Conjunto da Serra

📂 Abrir Estrutura
Estrutura do Conjunto

Ao abrir a estrutura do conjunto, o sistema apresenta exatamente a mesma tela utilizada anteriormente.

Exemplo:

Projeto

>

Conjunto da Serra

Tabela:

Item	Descrição
1	Suporte da Serra
2	Motor
3	Eixo
4	Polia
5	Mancal

Observe que a página é exatamente a mesma.

Mudam apenas:

título;
breadcrumb;
itens exibidos.
Estruturas Infinitas

Qualquer item poderá possuir outra estrutura.

Exemplo:

Projeto

↓

Conjunto da Serra

↓

Mancal

↓

Eixo Interno

↓

Acoplamento

↓

...

Não existe limite para quantidade de níveis.

Como o Sistema sabe que existe uma Estrutura?

O sistema não identifica automaticamente.

Quem decide isso é o usuário.

Cada item possui apenas um estado:

Possui Estrutura?

SIM

ou

NÃO
Comportamento dos Botões
Item sem estrutura

Exibir:

➕ Criar Estrutura

Ao clicar:

cria uma estrutura vazia;
o usuário começa a cadastrar os itens.
Item com estrutura

Exibir:

📂 Abrir Estrutura

Ao clicar:

abre a estrutura daquele item.

Reutilização da Página

O NEXOTFE não possuirá páginas específicas para:

Subconjunto
Subconjunto1
Subconjunto2

Existe apenas uma única página.

Esta página é reutilizada em todos os níveis.

Ela altera apenas:

breadcrumb;
título;
itens apresentados.
Exemplo Completo
Projeto

Itens do Projeto

├── Base Soldada
├── Eixo
├── Suporte do Eixo
└── Conjunto da Serra
          📂 Abrir Estrutura

↓

Projeto

>

Conjunto da Serra

Itens da Estrutura

├── Suporte da Serra
├── Motor
├── Polia
└── Mancal
          📂 Abrir Estrutura

↓

Projeto

>

Conjunto da Serra

>

Mancal

Itens da Estrutura

├── Rolamento
├── Tampa
├── Retentor
└── Eixo Interno
          📂 Abrir Estrutura

↓

Projeto

>

Conjunto da Serra

>

Mancal

>

Eixo Interno

Itens da Estrutura

├── Chaveta
├── Rosca
├── Rasgo
└── Furo

Observe que a página nunca muda.

Benefícios

Esta arquitetura permite:

Estruturas infinitas.
Reutilização de componentes.
Reutilização de conjuntos entre projetos.
Explosão automática da BOM.
Planejamento do PCP.
Compras automáticas.
Custos por nível.
Produção por conjunto.
Engenharia modular.

Tudo utilizando exatamente a mesma página.

Filosofia do NEXOTFE

O sistema não trabalha com conceitos de pai, filho ou neto.

A única regra é:

Todo item poderá possuir sua própria estrutura.

Se um item possuir estrutura:

o sistema exibirá 📂 Abrir Estrutura.

Se não possuir:

o sistema exibirá ➕ Criar Estrutura.

A partir desse momento, o comportamento será exatamente o mesmo em qualquer nível da árvore.