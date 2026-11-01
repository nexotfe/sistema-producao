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

## Copia Operacional da OF e Momento Y

Decisao registrada em 2026-10-29.

O Momento Y (conferencia de materia-prima pelo PCP antes da necessidade oficial de uma OF) acontece dentro da OF, na copia operacional do roteiro, nunca em uma tela ou fluxo separado.

E expressamente proibido que as alteracoes realizadas pelo PCP no Momento Y modifiquem o roteiro original do Comercial ou a estrutura BOM original.

O PCP pode ajustar materia-prima, quantidade, origem do fornecimento, decisao CI/CE e tempos operacionais exclusivamente na copia operacional da OF do projeto em questao.

O acesso a copia operacional ocorre a partir do fluxo de Prioridades do PCP (Planejamento Macro), nunca por uma rota paralela ou isolada.

Na copia operacional Y, o PCP pode revisar materiais, operacoes, recursos, tempos e observacoes da OF - sempre preservando o roteiro original X.

O botao "Salvar" registra essas alteracoes na OF. Nenhuma alteracao e propagada automaticamente ao roteiro original, a outras OFs ou a outros projetos.

Os valores X (Comercial), Y (PCP) e Z (Realizado) sao preservados: Y nunca sobrescreve X, e X nunca e alterado pelo PCP.

O salvamento da revisao nao libera automaticamente a OF. A liberacao da OF permanece independente do salvamento das alteracoes de materia-prima/Momento Y.

## Materias-primas na Copia Operacional

Decisao registrada em 2026-10-30.

A copia operacional apresenta as materias-primas da OF em tabela compacta, com:

- Descricao tecnica real do material (ex.: "Aco SAE 8620 - Barra redonda O 35 mm"), nunca uma descricao funcional da peca (ex.: "Barra para eixo pinhao"). A descricao tecnica e composta a partir da especificacao e da forma/dimensoes ja cadastradas do material - nunca inventada.
- Quantidade e unidade.
- Seletor CI/CE/P (Consumo Interno / Compra Externa / Parcial) para materiais de fornecimento da empresa - decisao de abastecimento do PCP, nunca uma afirmacao de recebimento fisico nem uma liberacao automatica da OF.
- Campo Quantidade para Compra, preenchido quando a decisao envolve CE ou P.
- Materiais fornecidos pelo cliente nunca geram CI/CE proprios - o seletor nao se aplica a eles.
- Acoes de Adicionar, Editar, Substituir e Remover materia-prima existem somente na copia operacional da OF - nunca alteram o roteiro original nem o cadastro de materias-primas.
- Observacoes tecnicas por material (ajuste operacional do PCP) sao preservadas e exibidas junto ao item.

## Operacoes X/Y/Z na Copia Operacional

Decisao registrada em 2026-10-30.

A copia operacional permite Incluir, Editar e Remover operacoes, alem de revisar o tempo Y de cada uma.

Uma operacao incluida pelo PCP nesta revisao nasce sem referencia comercial: o tempo X inicial e igual ao Y informado, nunca inventado como zero nem copiado de outra operacao - e nunca altera o roteiro original.

Qualquer operacao com execucao ja registrada (Z preenchido, inclusive parcial) tem o planejamento Y bloqueado para edicao - nao e permitido ajustar o tempo planejado depois de o resultado real ja ser conhecido, o que mascararia o desempenho real. O mesmo bloqueio vale para a observacao operacional da operacao (ver secao seguinte).

Os registros de Z (Realizado) sao sempre preservados e nunca editaveis pelo PCP.

As dependencias entre operacoes sao mantidas no modelo de dados e no modal Editar OP (campo "Depende da(s) OP"), com protecao contra ciclos.

A tabela principal da Copia Operacional do PCP nao exibe mais o texto de dependencia ("Depende de OP X" / "Sem dependencia") sob a descricao da operacao - a informacao continua disponivel e editavel no modal, apenas deixou de poluir a leitura da tabela principal.

## Observacoes do Roteiro (X/Y)

Decisao registrada em 2026-10-30. Reutiliza o campo "Observacoes" ja existente no roteiro de fabricacao (`bom_operacoes.observacoes`) - nenhum campo novo foi criado no roteiro original.

Aplica-se a mesma separacao X/Y ja aprovada para o tempo das operacoes:

- X: observacao original do roteiro, nunca modificavel pelo PCP.
- Y: observacao operacional da copia da OF, que o PCP pode manter, corrigir ou complementar.
- Se nao houver alteracao salva, a producao usa a observacao original (X).
- Se houver alteracao salva, a producao usa a observacao operacional (Y) - nunca as duas ao mesmo tempo.

O criterio de "existe revisao valida" e sempre a presenca de uma entrada de historico de revisao da observacao - nunca uma comparacao de igualdade de texto entre X e Y.

O historico de alteracoes da observacao e preservado integralmente, com rastreabilidade (data, responsavel, texto anterior, texto novo, justificativa) - a mesma justificativa unica ja exigida para salvar qualquer revisao da copia operacional.

## Natureza Comercial x Natureza Operacional da OF

Decisao registrada em 2026-10-30.

Desenvolvimento pertence a natureza comercial da venda, nao a natureza operacional da OF.

Uma venda de Desenvolvimento pode comecar apenas com escopo, conceito tecnico e orcamento macro, sem desenhos ou roteiros individuais de fabricacao. Somente apos a Engenharia desenvolver o projeto sao elaborados os desenhos e roteiros necessarios para gerar as OFs que seguirao ao PCP.

Na interface operacional da OF, considerar apenas tres classificacoes:

- Venda / Fabricacao
- Servico
- Industrializacao

Mapeamento de apresentacao (natureza comercial do projeto -> natureza operacional exibida na OF):

- Fabricacao -> Fabricacao
- Desenvolvimento -> Fabricacao
- Servico -> Servico
- Industrializacao -> Industrializacao

Desenvolvimento nunca e apresentado como quarta natureza operacional na tela da OF.

A natureza comercial original do projeto deve ser preservada, inclusive `tipo_projeto='desenvolvimento'` - nunca reescrita ou substituida para caber nas tres classificacoes operacionais acima.

O roteiro macro do orcamento nunca e transformado silenciosamente em uma OF de fabricacao.

**Decisao confirmada em 2026-10-30:** sempre que uma OF for originada de um orcamento classificado comercialmente como Desenvolvimento, sua natureza operacional no PCP sera Venda/Fabricacao. A natureza comercial original do projeto continua sendo Desenvolvimento (nunca reescrita - ver paragrafo acima). O roteiro macro do orcamento nao podera ser transformado automaticamente em OF: as OFs devem resultar exclusivamente dos roteiros detalhados elaborados pela Engenharia apos o desenvolvimento - reforca o paragrafo acima, nao abre excecao a ele.

A forma tecnica mais simples de representar esta regra (evitando campo redundante) ainda esta em investigacao - ver evidencia abaixo.

**Evidencia levantada em 2026-10-30 (investigacao tecnica, somente leitura):**

- `ordens_fabricacao` nao tem nenhuma coluna de natureza/categoria/classificacao. A unica coluna proxima e `tipo` (check `'normal'|'reparo'|'servico'`, `202606050033_ordens_fabricacao_e_integracao.sql`), nunca estendida para cobrir fabricacao/industrializacao - nao serve hoje para a classificacao operacional de 3 vias.
- Nao existe, em nenhuma tabela real (OF ou BOM), um campo de origem de fornecimento (empresa/cliente) aplicado em producao - o conceito so existe na migration candidata do Momento Y (`20261029100000...sql`, nao aplicada), e la vive em `necessidades_of_material`, nao em `ordens_fabricacao`/`boms`.
- `projetos.tipo_projeto` e lido hoje em 2 pontos, nenhum grava nada na OF: `calcular_custo_bom_interno` (exclui materia-prima do custo quando `industrializacao`) e `gerar_lista_tecnica_projeto` (bloqueia a lista para `industrializacao`). Nenhum dos dois toca `ordens_fabricacao`.
- **Achado de risco relevante:** `criar_ofs_de_projeto_aprovado` (`20261015120000_pcp_p6e_of_operacoes_y_z_retrabalho.sql`), a funcao que cria as OFs na aprovacao do projeto, NAO LE `tipo_projeto` em nenhum momento - gera OF para qualquer item ativo com BOM resolvido, independente da natureza do projeto. Ou seja, hoje, nada no caminho de criacao de OF impede que um roteiro macro de um projeto de Desenvolvimento vire uma OF normal caso algum item tenha BOM resolvido prematuramente - e exatamente o risco que esta decisao (paragrafo acima, "o roteiro macro do orcamento nunca e transformado silenciosamente em uma OF de fabricacao") precisa fechar, e que ainda nao esta fechado no codigo.
- Nao foi possivel confirmar, por restricao de acesso (RLS bloqueia ate `service_role` em `ordens_fabricacao`, by design), se o unico projeto real com `tipo_projeto='desenvolvimento'` ja tem alguma OF gerada.

A regra de negocio (Desenvolvimento -> Venda/Fabricacao na OF) esta decidida.

**Recomendacao tecnica (investigacao continuada em 2026-10-30, ainda aguardando confirmacao do usuario, nenhum codigo/migration/banco alterado):** como o mapeamento Desenvolvimento -> Fabricacao e fixo e sem ambiguidade (ao contrario de origem de fornecimento, que varia por material e exige decisao do PCP), a forma mais simples e sem campo redundante e uma funcao de apresentacao/leitura (`CASE WHEN tipo_projeto = 'desenvolvimento' THEN 'fabricacao' ELSE tipo_projeto END`), aplicada onde a natureza operacional da OF for exibida ou usada (hoje seria, por exemplo, numa view que ja faz join com `projetos`, como `vw_of_fluxo_operacional`) - sem nenhuma coluna nova em `ordens_fabricacao`. Nao resolve, porem, o achado de risco ja registrado acima: `criar_ofs_de_projeto_aprovado` nao le `tipo_projeto` e geraria OF de um roteiro macro de Desenvolvimento sem nenhuma trava, independente de como a natureza operacional for exibida depois - esse e um gate de criacao de OF, nao um problema de rotulo, e permanece como pendencia de implementacao separada, fora do escopo desta etapa (somente leitura).

**Esclarecimento registrado em 2026-11-01:** projetos de Desenvolvimento podem gerar OFs para a execucao do proprio desenvolvimento (ex.: prototipo, prova de conceito) - a criacao da OF nao deve ser bloqueada apenas pela natureza comercial do projeto ser Desenvolvimento. Isso reinterpreta o "achado de risco" registrado acima: a ausencia de leitura de `tipo_projeto` em `criar_ofs_de_projeto_aprovado` deixa de ser, por si so, uma falha a fechar com um bloqueio - o ponto relevante que permanece em aberto e garantir que a OF gerada, quando originada de Desenvolvimento, sempre se apresente operacionalmente como Fabricacao (ver mapeamento acima), nunca que sua criacao seja impedida.

O Momento Y continua acontecendo exclusivamente dentro da copia operacional do roteiro da OF (ver secao anterior) - esta decisao nao abre excecao para alterar o roteiro original.

## OF Virtual e OF de Producao (Prototipo)

Decisao e aprovacao visual registradas em 2026-10-30. Atualiza e substitui o registro anterior desta secao ("Impressao Individual da OF"), que descrevia um botao reservado e desabilitado - isso nao reflete mais o estado do prototipo.

No prototipo mockado, o botao "Imprimir OF" no cabecalho da propria Ordem de Fabricacao ja abre uma visualizacao funcional de demonstracao (nao uma tela separada nem um fluxo em lote). Cada OF e aberta individualmente, independente das demais OFs do projeto.

Existem dois modelos de apresentacao, selecionaveis pelo usuario:

- Mod 1 - Com tempo planejado: inclui a coluna de tempo planejado por operacao.
- Mod 2 - Sem tempo planejado: omite inteiramente a coluna e qualquer valor de tempo no documento - nunca e apenas um valor em branco.

A unica diferenca funcional entre os dois modelos e a presenca do tempo planejado. Os demais campos (numero da OF, projeto, cliente, codigo/descricao da peca, quantidade, referencia ao desenho, natureza operacional, materias-primas, operacoes, recursos, observacoes tecnicas) sao identicos nos dois modelos.

Ambos os modelos possuem duas apresentacoes: visualizacao em Tela e previa Impressa (A4) - a escolha de modelo (Mod 1/Mod 2) vale para as duas.

O botao "PDF" aciona a impressao nativa do navegador (`window.print()`) - nao existe geracao de PDF proprietaria nem emissao oficial nesta etapa.

O documento utiliza exclusivamente os dados ja salvos da OF (`ordem.*`), nunca o rascunho de edicao em andamento na Copia Operacional. Se houver alteracoes nao salvas no momento em que a visualizacao e aberta, isso e sinalizado de forma discreta no proprio documento.

Na apresentacao de producao (Tela e A4 dos dois modelos), a coluna Dependencias e substituida pela coluna Observacoes - a dependencia entre operacoes continua existindo no modelo de dados e no modal Editar OP (ver secao "Operacoes X/Y/Z na Copia Operacional"), apenas nao e mais exibida nesse documento.

O tempo planejado, quando exibido (Mod 1), reflete os dados operacionais validos da OF: Y quando ha revisao valida registrada, ou X quando nao ha - nunca os dois ao mesmo tempo, nunca um valor inventado. O criterio de "existe revisao valida" e sempre a presenca de uma entrada de historico de revisao - nunca uma comparacao de igualdade entre X e Y (um valor Y que por acaso coincide com X apos uma revisao real continua sendo tratado como revisado).

Regra de autorizacao: uma OF que ainda nao foi liberada e sempre apresentada com identificacao inequivoca de simulacao ("SIMULACAO - NAO LIBERADA PARA PRODUCAO"), nunca como documento autorizado para producao - mesmo depois que a emissao oficial existir de fato.

## Impressao A4 (Prototipo)

Decisao e aprovacao visual registradas em 2026-10-30.

A previa impressa A4 (Mod 1 e Mod 2) segue:

- Margem fisica unica de 15 mm, definida em `@page` - nenhuma segunda margem somada pelo proprio documento.
- Fundo branco na impressao real, sem o fundo colorido do sistema.
- Sem borda nem sombra decorativa no documento impresso - esses elementos existem apenas na previa em tela, para simular a folha sobre o fundo do aplicativo.
- Paginacao automatica, sem corte de linha de material ou operacao no meio.
- Cabecalho com a identificacao da OF repetido nas paginas adicionais.
- Compatibilidade visual com impressao preto e branco (texto preto sobre fundo branco, sem dependencia de cor para informacao essencial).
- Ausencia de alteracao artificial no tamanho das letras conforme a quantidade de materiais/operacoes - uma OF pequena e uma OF grande usam a mesma tipografia.

A aparencia da visualizacao virtual e do documento A4 (incluindo a correcao de margens acima) foi aprovada visualmente pelo usuario em 2026-10-30.

## Limites da Implementacao (Momento Y e OF de Producao)

Registrado em 2026-11-01.

**Prototipo aprovado (mockado, isolado da producao):** interfaces, interacoes, visualizacao e impressao de demonstracao descritas nas secoes acima - Copia Operacional, Materias-primas, Operacoes X/Y/Z, Observacoes do Roteiro, OF Virtual/Producao e Impressao A4.

**Implementacao real pendente:** integracao com dados reais, persistencia, permissoes, validacoes transacionais, confirmacao oficial do Momento Y e emissao oficial da OF. Nenhuma dessas funcionalidades mockadas esta disponivel em producao.

A migration Revisao 3 (`20261029100000_pcp_momento_y_confirmacao_necessidades.sql`) permanece nao aplicada e congelada - validada em sandbox, com preflight de producao sem conflitos, aguardando autorizacao para aplicacao real.

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
