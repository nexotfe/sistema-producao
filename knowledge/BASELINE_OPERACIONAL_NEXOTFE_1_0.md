# Baseline Operacional NEXOTFE 1.0

**Versao:** 1.0  
**Status:** Referencia operacional em consolidacao  
**Data:** 27/06/2026  
**Responsavel:** NEXOTFE / Flavio  
**Natureza:** define o que o sistema faz

## Objetivo

Este documento consolida as decisoes funcionais e operacionais do NEXOTFE 1.0.

Ele define o comportamento esperado do ERP, seus modulos, fluxos, regras de negocio, telas, botoes padrao, homologacoes e decisoes operacionais aprovadas.

Este documento deve ser utilizado por:

- Flavio;
- Codex;
- futuros desenvolvedores;
- validadores operacionais da Enifer.

## Filosofia do ERP

O NEXOTFE e um ERP industrial para empresas que trabalham por projeto e sob encomenda.

O sistema nao deve ser tratado como ERP de producao seriada ou catalogo fixo de produtos.

O Projeto e o nucleo operacional do sistema.

Cada projeto pode possuir:

- engenharia propria;
- produtos ou itens especificos;
- roteiros;
- BOM;
- documentos;
- compras;
- OFs;
- producao;
- qualidade;
- expedicao;
- historico.

Toda nova funcionalidade deve responder a pergunta:

```text
Esta funcionalidade melhora o controle de um projeto sob encomenda?
```

Se a resposta for negativa, a implementacao deve ser reavaliada antes de prosseguir.

## Fluxo Operacional Oficial

O fluxo operacional de referencia do NEXOTFE 1.0 e:

```text
Cliente
->
Oportunidade
->
Orcamento
->
Projeto
->
Engenharia
->
Compras
->
Planejamento PCP
->
Programacao Diaria
->
Producao
->
Qualidade
->
Expedicao
->
Entrega
->
Pos-venda
```

## Modulos Oficiais

### Comercial

Responsavel por clientes, oportunidades, orcamentos, abertura de projetos e acompanhamento comercial.

### Engenharia

Responsavel por produtos, codigos, BOM, roteiros, documentos tecnicos e revisoes.

### PCP

Responsavel pelo planejamento macro por projeto e pela programacao diaria por OF.

### Compras

Responsavel por requisicoes, pedidos, fornecedores e rastreabilidade das aquisicoes.

### Estoque

Responsavel por saldos, reservas, consumo, recebimentos e disponibilidade operacional.

### Producao

Responsavel pela execucao das OFs, operacoes, recursos e apontamentos.

### Qualidade

Responsavel por inspecoes, RNCs, certificados e liberacoes.

### Expedicao

Responsavel por separacao, expedicao, entrega e encerramento operacional.

### Cadastros Base

Responsaveis por clientes, fornecedores, colaboradores, grupos de recursos, recursos produtivos e produtos.

## Regras Operacionais Consolidadas

### Projeto

- Projeto e a entidade central do ERP.
- A pagina Projeto deve responder: "O que esta acontecendo neste trabalho?"
- Toda informacao operacional relevante deve convergir para o Projeto.
- Nao criar paginas duplicadas como Projeto Comercial, Projeto PCP ou Projeto Compras.

### Produto

- Produto nao pertence ao cliente.
- Produto pode ser utilizado por orcamentos e projetos.
- Produto pode existir sem roteiro.
- Produto deve possuir codigo unico.
- Produto deve possuir descricao unica quando a regra for ativada.
- Cadastro de Produto pode nascer a partir do fluxo de Orcamento.
- Quantidade em Produto e informacao de estoque e deve iniciar em 0.
- Nao implementar logica de estoque dentro do cadastro de Produto.

### Codigo

- A interface deve utilizar o termo "Codigo".
- Evitar o termo "PN" na interface.
- Quando houver rotas legadas com `[pn]`, elas podem permanecer tecnicamente, mas o texto visivel deve usar "Codigo".

### Roteiro

- Roteiro pertence ao Produto.
- Roteiro nunca deve existir sem Produto.
- Um Produto pode existir sem roteiro, mas um roteiro sempre deve apontar para um Produto.

### OF

- OF nunca deve existir sem Roteiro.
- OF e o centro da fabricacao.
- A tela da OF deve ser unica.
- Nao criar OF PCP ou OF Producao como paginas duplicadas.

### Estoque

- Estoque somente deve ser atualizado por eventos operacionais aprovados.
- Reserva logica e consumo fisico sao eventos diferentes.
- Estoque de produto acabado deve considerar liberacao de Qualidade quando aplicavel.

### Compras

- Compras deve concentrar a rastreabilidade de REQs e pedidos.
- Eventos de REQ nao devem poluir o Historico do Projeto quando ja estiverem no bloco Compras.
- Pagina mestre de REQ deve existir futuramente como entidade unica.

### PCP

- Planejamento PCP e macro por Projeto.
- Programacao Diaria e micro por OF.
- Prioridade pertence ao Projeto.
- OFs herdam a prioridade do Projeto.
- Drag and drop de prioridade ainda nao deve persistir sem regra aprovada.

## Botoes Padrao

Os cadastros e paginas operacionais devem utilizar botoes padrao consistentes:

- Voltar;
- Inicio;
- Novo;
- Editar;
- Salvar;
- Atualizar;
- Duplicar, quando aplicavel;
- Filtros, quando aplicavel;
- Atualizar, quando aplicavel;
- Imprimir, quando aplicavel;
- Exportar PDF, quando aplicavel;
- Exportar Excel, quando aplicavel.

## Navegacao Padrao

Paginas internas devem evitar becos sem saida.

Sempre que possivel utilizar:

- `ModuleBackButton`;
- `ModuleBackLink`;
- `EntityLink`;
- `entityRoutes`;
- retorno por `router.back()` com fallback para `/central` ou `/dashboard`, conforme padrao vigente da tela.

## Homologacao

Um modulo nao e considerado pronto apenas por compilar ou abrir no navegador.

Um modulo so recebe status homologado quando:

- usa dados reais, quando a fase exige;
- permite operacao real;
- possui navegacao aprovada;
- possui mensagens claras;
- possui persistencia validada, quando aplicavel;
- foi utilizado e aprovado operacionalmente pelo Flavio.

## Regra para Novos Prompts

Antes de implementar qualquer prompt, o Codex deve avaliar se o pedido respeita:

- este Baseline Operacional;
- a Arquitetura NEXOTFE 1.0;
- os Padroes de Desenvolvimento;
- o Status de Homologacao atual.

Se houver conflito, o Codex deve explicar o conflito antes de alterar codigo.
