# Arquitetura Operacional do PCP - NEXOTFE 1.0

## Objetivo

Este documento define a arquitetura operacional do modulo PCP do NEXOTFE.

Ele nao implementa funcionalidades. Sua finalidade e documentar a filosofia operacional, as regras de negocio, as responsabilidades do modulo e os limites da versao 1.0, servindo como referencia para desenvolvimento, testes, manutencao e evolucoes futuras.

## Filosofia do PCP

O PCP e o cerebro operacional da fabrica.

Sua funcao nao e apenas programar maquinas. Sua responsabilidade e transformar um Projeto aprovado em um produto entregue, garantindo que cada etapa ocorra na ordem correta e respeitando as restricoes da empresa.

Toda decisao do PCP deve considerar:

- Engenharia
- Compras
- Estoque
- Producao
- Qualidade
- Expedicao

O NEXOTFE atende empresas de manufatura sob encomenda. Portanto, o PCP deve operar a partir do Projeto como entidade central, e nao a partir de produtos seriados de catalogo.

## Fluxo Operacional

O fluxo operacional de referencia e:

```text
Cliente
->
Orcamento
->
Projeto
->
Engenharia
->
Compras
->
Planejamento PCP (Macro)
->
Programacao Diaria (Micro)
->
Producao
->
Qualidade
->
Expedicao
->
Entrega
```

## Planejamento PCP (Macro)

### Objetivo

O Planejamento PCP determina a ordem de prioridade dos projetos.

Ele responde:

```text
Qual projeto deve receber atencao primeiro?
```

Cada linha representa um Projeto. Nunca uma OF individual.

### Responsabilidades

- Definir prioridades.
- Visualizar situacao operacional.
- Identificar bloqueios.
- Determinar a proxima acao.
- Reorganizar prioridades.

### Informacoes Minimas

- Prioridade
- Projeto
- Cliente
- Situacao
- Estado
- Proxima Acao
- Avanco
- Entrega

## Programacao Diaria (Micro)

### Objetivo

A Programacao Diaria distribui OFs para execucao diaria.

Ela responde:

```text
O que cada lider devera executar hoje?
```

Cada linha representa uma OF.

### Responsabilidades

- Distribuir OFs.
- Organizar por recurso.
- Permitir impressao.
- Preparar a distribuicao aos lideres.

### Informacoes Previstas

A Programacao Diaria devera utilizar dados reais de:

- Projeto
- OF
- PN
- Recurso
- Tecnologia
- Tempo previsto
- Tempo realizado
- Situacao
- Lider

## Filosofia da Prioridade

Prioridade pertence ao Projeto.

As OFs herdam automaticamente a prioridade do Projeto.

Nao existe prioridade independente da OF.

Alterar a prioridade do Projeto altera automaticamente a prioridade operacional de todas as OFs vinculadas.

Na versao atual, a reorganizacao por drag and drop no Planejamento PCP e visual/local. Persistencia de prioridade nao faz parte da etapa atual.

## Situacao Operacional

A Situacao representa o estado geral do Projeto.

Valores permitidos:

- Em andamento
- Parado
- Concluido

## Estado

O Estado representa a condicao operacional das OFs do Projeto.

Formato:

```text
55 aptas | 45 nao aptas
```

Onde:

- `aptas` = OFs aptas
- `nao aptas` = OFs nao aptas

Ao passar o mouse, o Planejamento PCP deve apresentar:

- OF totais
- OF aptas
- Aguardando material
- Em producao
- Programacao
- Finalizadas

## Proxima Acao

A Proxima Acao representa o principal bloqueio operacional do Projeto.

Deve mostrar apenas uma acao, nunca multiplas acoes simultaneas.

Hierarquia oficial:

1. Comprar material
2. Programar CNC
3. Liberar engenharia
4. Produzir
5. Montar
6. Terceirizar
7. Concluido
8. Cancelado
9. Sem OFs

Caso existam estados conflitantes, deve prevalecer o bloqueio mais critico conforme a hierarquia acima.

## Avanco

O Avanco representa a relacao entre realizado e planejado no contexto produtivo das OFs vinculadas ao Projeto.

Na versao atual, o calculo deve permanecer simples e rastreavel:

```text
quantidade produzida / quantidade planejada
```

Projetos sem OF devem apresentar `0%`.

Projetos concluidos devem apresentar `100%`.

## Regras de Negocio

Todas as regras operacionais do Planejamento PCP devem permanecer centralizadas.

Arquivo oficial:

```text
src/modules/pcp/planningRules.ts
```

Nenhuma regra operacional deve ficar espalhada na interface.

A pagina `/pcp/planejamento` deve ser responsavel por:

- carregar dados;
- controlar estados locais de interface;
- preservar o drag and drop local;
- renderizar a experiencia visual aprovada.

A regra operacional deve ser mantida fora da interface.

## Navegacao

O fluxo de navegacao esperado e:

```text
Planejamento
->
Projeto
->
Voltar
->
Planejamento
```

Devem ser utilizados:

- `EntityLink`
- `ModuleBackButton`
- `ModuleBackLink`, quando aplicavel
- `entityRoutes`

Evitar links fixos quando uma entidade possuir rota mestre oficial.

## Consultas e Performance

O PCP deve priorizar consultas em lote.

Evitar N+1.

O Planejamento PCP deve carregar apenas os dados necessarios para a fila macro.

Regras de agregacao devem ser reutilizaveis sempre que possivel, especialmente entre:

- Planejamento PCP
- Programacao Diaria
- Pagina Projeto
- Pagina OF

## Futuras Evolucoes

Nao fazem parte da versao operacional atual:

- persistencia do drag and drop;
- APS;
- capacidade finita;
- balanceamento automatico;
- sequenciamento inteligente;
- inteligencia artificial.

Esses recursos poderao existir futuramente, mas devem reutilizar a arquitetura existente.

## Principios de Desenvolvimento

Toda nova funcionalidade do PCP deve respeitar:

- Projeto como entidade mestre.
- Planejamento Macro por Projeto.
- Programacao Micro por OF.
- Navegacao integrada.
- Dados reais sempre que possivel.
- Regras de negocio separadas da interface.
- Componentes reutilizaveis.
- Performance com consultas em lote.
- Ausencia de consultas N+1.
- Ausencia de duplicacao de paginas mestre.

## Criterio de Avaliacao de Novos Prompts

Todo novo prompt relacionado ao PCP deve ser avaliado contra estas perguntas:

1. A funcionalidade melhora o controle de um Projeto sob encomenda?
2. A responsabilidade pertence ao Planejamento Macro, a Programacao Micro ou a outro modulo?
3. A regra pode ser reutilizada por Projeto, OF, Compras, Producao ou Qualidade?
4. A implementacao preserva pagina mestre unica?
5. A implementacao evita consultas N+1?
6. A implementacao evita misturar regra operacional dentro da interface?
7. A implementacao respeita o escopo da versao atual?

Se a resposta indicar desalinhamento com a arquitetura, a implementacao deve ser reavaliada antes de seguir.

## Objetivo Final

Transformar o PCP do NEXOTFE em um modulo robusto, escalavel e preparado para empresas de manufatura sob encomenda, mantendo simplicidade operacional para o usuario e uma arquitetura limpa para futuras evolucoes, incluindo otimizacao de capacidade, sequenciamento avancado e inteligencia artificial.
