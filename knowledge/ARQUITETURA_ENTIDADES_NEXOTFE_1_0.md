# Arquitetura de Entidades NEXOTFE 1.0

**Versao:** 1.0  
**Status:** Referencia arquitetural em consolidacao  
**Data:** 27/06/2026  
**Responsavel:** NEXOTFE / Flavio  
**Natureza:** define como os modulos se relacionam

## Objetivo

Este documento define a arquitetura de relacionamento entre as entidades principais do NEXOTFE 1.0.

Ele nao substitui o Baseline SQL nem cria schema. Sua finalidade e orientar a evolucao funcional e evitar duplicidade de telas, regras e caminhos operacionais.

## Principio Central

O NEXOTFE e um ERP industrial para producao sob encomenda.

O Projeto e a entidade operacional central.

Os modulos devem funcionar como portas de entrada para as mesmas entidades mestre, nunca como copias isoladas.

## Entidades Mestre

### Cliente

Representa a empresa compradora.

Relacionamentos principais:

- Cliente pode possuir contatos.
- Cliente pode originar oportunidades.
- Cliente pode originar orcamentos.
- Cliente pode estar vinculado a projetos.

Rota mestre atual:

```text
/clientes/[id]
```

### Produto

Representa um item, produto acabado, semiacabado, componente ou codigo tecnico utilizado pelo fluxo industrial.

Regras:

- Produto nao pertence ao cliente.
- Produto pode existir sem roteiro.
- Produto pode ser usado em orcamentos e projetos.
- Produto pode ter quantidade inicial 0.
- Produto nao executa logica de estoque dentro do cadastro.

Rota atual:

```text
/produtos/[pn]
```

Observacao: a rota pode manter `[pn]` por compatibilidade tecnica, mas a interface deve utilizar "Codigo".

### Orcamento

Representa a proposta comercial antes da aprovacao do projeto.

Relacionamentos:

- Orcamento pode usar Produtos.
- Orcamento pode originar Projeto.
- Cadastro de Produto pode nascer durante o Orcamento.

Numeracao sugerida:

```text
ORC000001
```

### Projeto

Representa o trabalho aprovado e em execucao.

Relacionamentos:

- Projeto pertence a um Cliente.
- Projeto utiliza Produtos.
- Projeto gera Engenharia.
- Projeto gera ou referencia Roteiros.
- Projeto possui OFs.
- Projeto possui REQs e Compras.
- Projeto possui Producao, Qualidade, Expedicao e Historico.

Rota mestre:

```text
/projetos/[id]
```

Numeracao sugerida:

```text
PRJ000001
```

### Roteiro

Representa a forma de fabricar um Produto.

Regras:

- Roteiro pertence ao Produto.
- Roteiro nunca existe sem Produto.
- Roteiro pode gerar necessidades de material e operacoes.
- Roteiro e base para OF.

Rota atual:

```text
/roteiros/[pn]
```

Numeracao sugerida:

```text
RT000001
```

### OF

Representa a ordem de fabricacao.

Regras:

- OF nunca existe sem Roteiro.
- OF e a entidade central da fabricacao.
- OF herda prioridade do Projeto.
- OF nao possui prioridade independente na versao atual.

Rota mestre:

```text
/ordens/[id]
```

Numeracao sugerida:

```text
OF000001
```

### REQ

Representa a requisicao de compra.

Relacionamentos:

- REQ pode nascer de necessidades do Projeto, Roteiro ou OF.
- REQ deve possuir pagina mestre unica.
- REQ pertence ao dominio de Compras.

Rota mestre prevista:

```text
/compras/requisicoes/[id]
```

Numeracao sugerida:

```text
REQ000001
```

### Fornecedor

Representa empresa fornecedora.

Relacionamentos:

- Fornecedor pode estar vinculado a pedidos.
- Fornecedor pode estar vinculado a recebimentos.
- Fornecedor pode estar vinculado a qualidade de recebimento.

Rota mestre:

```text
/fornecedores/[id]
```

### Grupo de Recursos

Representa uma familia produtiva, nao apenas uma categoria.

Exemplos:

- Centros de Usinagem CNC;
- Tornos CNC;
- Soldagem;
- Pintura;
- Inspecao.

Regras:

- Grupo de Recursos prepara o sistema para capacidade agregada futura.
- Grupo de Recursos sera base para PCP, roteiros, programacao diaria e indicadores.

### Recurso Produtivo

Representa qualquer elemento capaz de executar uma operacao produtiva.

Exemplos:

- maquina;
- bancada;
- setor;
- dispositivo;
- recurso compartilhado;
- inspecao;
- pintura;
- montagem.

Regras:

- Recurso Produtivo deve pertencer a um Grupo de Recursos.
- Recurso pode ser usado por Roteiros, PCP, Programacao Diaria e Producao.

### Producao

Representa execucao das OFs e suas operacoes.

Relacionamentos:

- Producao nasce a partir de OF.
- Producao registra operacoes e apontamentos.
- Producao alimenta Qualidade e Historico operacional.

### Qualidade

Representa inspecoes, RNCs, certificados e liberacoes.

Regras:

- Qualidade pode bloquear ou liberar avancos.
- Estoque de produto acabado pode depender de Qualidade.

### Estoque

Representa saldos, reservas, consumos e disponibilidade.

Regras:

- Reserva nao e consumo.
- Consumo e evento fisico.
- Produto acabado deve seguir a regra de Qualidade quando aplicavel.

### Expedicao

Representa separacao, expedicao, entrega e encerramento operacional.

## Cadeia Principal

```text
Produto
->
Roteiro atual
->
OF
->
Producao
->
Qualidade
->
Estoque
->
Expedicao
```

## Cadeia Comercial

```text
Cliente
->
Orcamento
->
Projeto
->
Produto
->
Roteiro
->
OF
```

## Cadeia Operacional por Projeto

```text
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
```

## Regras Arquiteturais

- Produto pode existir sem roteiro.
- Roteiro nunca existe sem Produto.
- OF nunca existe sem Roteiro.
- Projeto utiliza Produtos.
- Orcamento utiliza Produtos.
- Produto nao pertence ao Cliente.
- Roteiro pertence ao Produto.
- OF pertence ao fluxo de Projeto por meio de Roteiro e fabricacao.
- Estoque somente deve refletir eventos reais.
- Qualidade deve controlar liberacoes quando aplicavel.
- Recurso Produtivo pertence a Grupo de Recursos.
- Grupo de Recursos representa Familia Produtiva.

## Numeracao de Referencia

| Entidade | Formato sugerido |
| --- | --- |
| Produto | `EN002` ou `COD000001`, conforme regra a consolidar |
| Roteiro | `RT000001` |
| OF | `OF000001` |
| Projeto | `PRJ000001` |
| Orcamento | `ORC000001` |
| REQ | `REQ000001` |
| Pedido de Compra | `PC000001` |

## Regra Contra Duplicidade

Nao criar paginas duplicadas para a mesma entidade.

Exemplos proibidos:

- Projeto Comercial;
- Projeto PCP;
- Projeto Compras;
- OF Producao;
- OF PCP;
- REQ Compras;
- REQ Projeto;
- Item Engenharia;
- Item Estoque.

Cada entidade principal deve possuir uma unica pagina mestre.
