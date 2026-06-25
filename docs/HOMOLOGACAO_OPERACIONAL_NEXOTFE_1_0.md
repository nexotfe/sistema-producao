# Homologacao Operacional - NEXOTFE 1.0

## Objetivo

Este documento inicia a fase oficial de homologacao operacional do NEXOTFE 1.0.

Nesta fase o sistema passa a ser avaliado como ambiente operacional, considerando a Enifer como primeiro cliente de validacao. O foco nao e criar novas funcionalidades, mas identificar o que ja existe, validar o funcionamento real, registrar pendencias e organizar melhorias para estabilizacao da versao 1.0.

Durante esta fase:

- nao criar novos modulos;
- nao alterar schema;
- nao criar migrations;
- nao criar tabelas;
- nao alterar arquitetura consolidada;
- nao implementar melhorias imediatamente sem priorizacao;
- usar a operacao real como criterio de evolucao.

## Etapa 1 - Inventario Completo do Sistema

| Pagina | Rota | Modulo | Objetivo | Dados | Situacao |
| --- | --- | --- | --- | --- | --- |
| Login | `/` | Sistema | Autenticacao do usuario via Supabase Auth. | Dados reais | Funcional |
| Central Nexus | `/central` | Sistema | Indice de navegacao para as paginas atuais. | Estatico/manual | Funcional |
| Dashboard | `/dashboard` | Sistema | Rota de compatibilidade, redireciona para Central. | Nao aplicavel | Funcional |
| Clientes | `/clientes` | Comercial | Listar clientes cadastrados. | Dados reais | Funcional |
| Novo cliente | `/clientes/novo` | Comercial | Cadastro de cliente. | Dados reais | Funcional |
| Cliente mestre | `/clientes/[id]` | Comercial | Consulta da ficha do cliente. | Dados reais | Funcional |
| Editar cliente | `/clientes/[id]/editar` | Comercial | Edicao de cliente. | Dados reais | Funcional |
| Fornecedores | `/fornecedores` | Compras | Listar fornecedores cadastrados. | Dados reais | Funcional |
| Novo fornecedor | `/fornecedores/novo` | Compras | Cadastro de fornecedor. | Dados reais | Funcional |
| Fornecedor mestre | `/fornecedores/[id]` | Compras | Consulta da ficha do fornecedor. | Dados reais | Funcional |
| Editar fornecedor | `/fornecedores/[id]/editar` | Compras | Edicao de fornecedor. | Dados reais | Funcional |
| Projetos | `/projetos` | Comercial / Projeto | Lista de projetos. | Parcial | Parcialmente funcional |
| Novo projeto | `/projetos/novo` | Comercial / Projeto | Criacao inicial de projeto. | Parcial | Parcialmente funcional |
| Projeto mestre | `/projetos/[id]` | Projeto | Prontuario operacional do projeto. | Dados reais | Funcional |
| Compras | `/compras` | Compras | Visao executiva de compras e requisicoes. | Mock | Mockada |
| Decisao material | `/compras/decisao-material` | Compras / Estoque | Simular CI, compra parcial e compra total. | Mock | Mockada |
| Planejamento de compras | `/compras/planejamento` | Compras | Lista de planejamentos de compra. | Mock | Mockada |
| Detalhe planejamento compra | `/compras/planejamento/[id]` | Compras | Simulacao de consolidacao de compras. | Mock | Mockada |
| Pedido de compra | `/compras/pedidos/[id]` | Compras | Consulta de pedido de compra. | Parcial/mock | Parcialmente funcional |
| Materias-primas | `/estoque/materias-primas` | Estoque | Consulta operacional de materias-primas. | A verificar | Em desenvolvimento |
| OF mestre | `/ordens/[id]` | Producao / PCP | Consulta operacional da OF, materiais e fluxo. | Dados reais | Funcional |
| Planejamento PCP | `/pcp/planejamento` | PCP | Planejamento macro por projeto. | Dados reais | Funcional |
| Programacao Diaria | `/pcp/programacao-diaria` | PCP | Planejamento micro por OF, recurso e lider. | Dados reais + regras operacionais | Em evolucao |
| Produto / PN | `/produtos/[pn]` | Engenharia | Portal tecnico do PN com acesso ao roteiro. | Placeholder | Parcialmente funcional |
| Roteiro | `/roteiros/[pn]` | Engenharia | Consulta de roteiro por PN. | Parcial/mock | Parcialmente funcional |

### Observacoes de inventario

- A pagina mestre de REQ ainda nao existe, embora `EntityLink` ja possua rota para `/compras/requisicoes/[id]`.
- Qualidade e Expedicao ja existem no Baseline SQL, mas ainda nao possuem telas operacionais dedicadas no frontend.
- A pagina Projeto ja e a pagina mestre operacional mais madura.
- O PCP e o modulo mais integrado ao fluxo real neste momento.

## Etapa 2 - Funcionalidades Disponiveis

| Funcionalidade | Status | Observacao |
| --- | --- | --- |
| Login de usuario | Funciona | Supabase Auth. |
| Cadastrar empresa | Nao implementado no frontend | Existe estrutura no Baseline/Admin. |
| Configurar usuarios | Nao implementado no frontend | Dependente de tela administrativa. |
| Cadastrar cliente | Funciona | Cadastro real. |
| Editar cliente | Funciona | Edicao real. |
| Consultar cliente | Funciona | Pagina mestre real. |
| Cadastrar contato de cliente | Parcial | Contatos sao lidos no Projeto; cadastro dedicado precisa homologacao. |
| Cadastrar fornecedor | Funciona | Cadastro real. |
| Editar fornecedor | Funciona | Edicao real. |
| Consultar fornecedor | Funciona | Pagina mestre real. |
| Cadastrar projeto | Parcial | Existe rota; precisa validar fluxo completo com dados reais. |
| Consultar projeto operacional | Funciona | Dados reais de projeto, cliente, contatos, OFs, compras, engenharia, producao, qualidade e historico. |
| Cadastrar PN | Nao implementado no frontend | Existe estrutura de engenharia no Baseline. |
| Consultar PN | Parcial | Rota `/produtos/[pn]` funciona como portal/placeholder. |
| Cadastrar BOM | Nao implementado no frontend | Existe estrutura no Baseline. |
| Consultar BOM | Parcial | Indicadores aparecem no Projeto; tela completa ainda nao. |
| Cadastrar roteiro | Nao implementado no frontend | Existe estrutura no Baseline. |
| Consultar roteiro | Parcial | Rota por PN existe, maturidade a validar. |
| Cadastrar tecnologia | Nao implementado no frontend | Existe estrutura no Baseline/Admin. |
| Cadastrar recurso/maquina | Nao implementado no frontend | Existe estrutura no Baseline/Admin. |
| Cadastrar colaborador | Nao implementado no frontend | Existe estrutura no Baseline/Admin. |
| Cadastrar OF | Nao implementado no frontend | OF mestre consulta dados reais, mas criacao ainda nao. |
| Consultar OF | Funciona | Pagina mestre real. |
| Planejamento PCP | Funciona | Projetos reais, situacao, estado, proxima acao e avanco. |
| Reorganizar fila PCP | Parcial | Drag and drop local, sem persistencia. |
| Programacao Diaria | Funciona parcialmente | Usa OFs reais, recurso real quando houver, regra de OF programavel e impressao. |
| Cadastrar REQ | Nao implementado no frontend | Baseline possui suprimentos, mas pagina mestre REQ falta. |
| Consultar REQ | Nao implementado no frontend | Rota planejada no `EntityLink`, pagina ainda ausente. |
| Planejamento de compras | Mockado | Precisa integracao real. |
| Pedido de compra | Parcial/mock | Precisa validacao e integracao completa. |
| Recebimento | Nao implementado no frontend | Existe no Baseline. |
| Estoque / materias-primas | Em desenvolvimento | Precisa homologacao detalhada. |
| Apontamento de producao | Nao implementado no frontend | Existe no Baseline. |
| Qualidade | Nao implementado no frontend | Indicadores aparecem no Projeto; telas operacionais faltam. |
| Expedicao | Nao implementado no frontend | Existe no Baseline, tela operacional falta. |

## Etapa 3 - Fluxo Operacional Oficial de Homologacao

Este roteiro devera orientar os testes reais da Enifer no NEXOTFE 1.0.

1. Acessar o sistema.
2. Validar usuario autenticado.
3. Configurar dados administrativos basicos.
4. Configurar tecnologias.
5. Configurar recursos produtivos.
6. Configurar maquinas.
7. Configurar colaboradores.
8. Cadastrar fornecedores.
9. Cadastrar clientes.
10. Criar projeto.
11. Vincular contatos do cliente ao projeto.
12. Criar PN do projeto.
13. Criar engenharia do PN.
14. Criar BOM.
15. Criar roteiro.
16. Criar OF.
17. Gerar necessidades de materiais.
18. Decidir material: estoque, compra ou misto.
19. Gerar REQ quando houver compra.
20. Planejar compras.
21. Emitir pedido de compra.
22. Registrar recebimento.
23. Atualizar disponibilidade de material.
24. Liberar OF para programacao.
25. Consultar Planejamento PCP.
26. Ajustar fila macro de projetos quando necessario.
27. Consultar Programacao Diaria.
28. Validar OFs programaveis.
29. Imprimir programacao para lideres.
30. Executar producao.
31. Registrar apontamentos.
32. Abrir e concluir inspecoes de qualidade.
33. Registrar certificados ou RNCs.
34. Preparar expedicao.
35. Entregar projeto.
36. Encerrar projeto.

### Fluxo resumido

```text
Cliente
-> Projeto
-> Engenharia
-> BOM / Roteiro
-> OF
-> Compras / Estoque
-> Planejamento PCP
-> Programacao Diaria
-> Producao
-> Qualidade
-> Expedicao
-> Entrega
```

## Etapa 4 - Checklist de Homologacao por Pagina

Status possiveis:

- Aprovado
- Necessita ajuste
- Pendente

### Template padrao

| Item | Status | Observacoes |
| --- | --- | --- |
| Layout | Pendente | Validar leitura, densidade e hierarquia visual. |
| Navegacao | Pendente | Validar entrada, saida, voltar e links mestres. |
| Botoes | Pendente | Validar acao, estado desabilitado e feedback. |
| Filtros | Pendente | Validar comportamento real ou marcar como futuro. |
| Validacoes | Pendente | Validar campos obrigatorios e mensagens. |
| Links | Pendente | Validar `EntityLink` e rotas mestre. |
| Performance | Pendente | Validar carregamento e ausencia de N+1 perceptivel. |
| Dados | Pendente | Validar origem real, mock ou ausencia. |
| Mensagens | Pendente | Validar vazio, erro e carregamento. |
| Responsividade | Pendente | Validar desktop e tela menor. |
| Fluxo | Pendente | Validar caminho operacional completo. |
| Observacoes | Pendente | Registrar melhoria, duvida ou decisao. |

### Paginas prioritarias para homologacao

| Pagina | Prioridade | Motivo |
| --- | --- | --- |
| `/projetos/[id]` | Alta | Pagina mestre operacional do projeto. |
| `/pcp/planejamento` | Alta | Fila macro do PCP. |
| `/pcp/programacao-diaria` | Alta | Planejamento micro para lideres. |
| `/ordens/[id]` | Alta | Pagina mestre da OF. |
| `/clientes` e `/clientes/[id]` | Media | Base comercial. |
| `/fornecedores` e `/fornecedores/[id]` | Media | Base de compras. |
| `/compras` | Media | Atualmente mockada; precisa decisao de integracao. |
| `/compras/planejamento` | Media | Atualmente mockada; importante para suprimentos. |
| `/estoque/materias-primas` | Media | Deve ser validada contra fluxo de material. |
| `/produtos/[pn]` e `/roteiros/[pn]` | Media | Base tecnica ainda parcial. |

## Etapa 5 - Registro Inicial de Melhorias

Este backlog inicial nao autoriza implementacao imediata. Ele apenas registra pontos para priorizacao.

| Pagina | Descricao | Prioridade | Tipo | Status |
| --- | --- | --- | --- | --- |
| `/compras/requisicoes/[id]` | Criar pagina mestre da REQ, pois `EntityLink` ja aponta para ela. | Alta | Nova funcionalidade | Pendente |
| `/pcp/programacao-diaria` | Validar com dados reais de OFs em ambiente populado. | Alta | Homologacao | Pendente |
| `/pcp/programacao-diaria` | Validar impressao em papel/PDF com lideres. | Alta | UX | Pendente |
| `/pcp/planejamento` | Definir se drag and drop devera persistir prioridade. | Alta | Regra de negocio | Pendente |
| `/projetos/novo` | Homologar criacao real de projeto ponta a ponta. | Alta | Correção/fluxo | Pendente |
| `/ordens/[id]` | Validar retorno inteligente e conteudo operacional com OF real. | Alta | UX/dados | Pendente |
| `/compras` | Substituir mocks por dados reais de REQ e pedidos. | Alta | Dados reais | Pendente |
| `/compras/planejamento` | Integrar planejamentos reais de compra. | Alta | Dados reais | Pendente |
| `/estoque/materias-primas` | Validar origem dos saldos e disponibilidade. | Media | Dados/performance | Pendente |
| `/produtos/[pn]` | Evoluir placeholder para ficha mestre de PN. | Media | Nova funcionalidade | Pendente |
| `/roteiros/[pn]` | Validar roteiro real e vinculo com operacoes. | Media | Dados reais | Pendente |
| Qualidade | Criar telas operacionais de inspecao, RNC e certificados. | Media | Nova funcionalidade | Pendente |
| Expedicao | Criar tela operacional de separacao, expedicao e entrega. | Media | Nova funcionalidade | Pendente |
| Sistema | Criar tela administrativa para usuarios, recursos, tecnologias e colaboradores. | Media | Nova funcionalidade | Pendente |
| Global | Revisar mensagens de vazio/erro/carregamento em todas as telas. | Media | UX | Pendente |
| Global | Revisar responsividade das tabelas operacionais. | Media | UX | Pendente |

## Etapa 6 - Regras da Homologacao

Durante a homologacao:

- qualquer melhoria deve ser registrada antes de implementar;
- toda melhoria deve ter pagina, descricao, prioridade e tipo;
- bugs criticos podem ser tratados antes do backlog, desde que documentados;
- novas funcionalidades devem respeitar Projeto como entidade central;
- PCP Macro continua por Projeto;
- Programacao Diaria continua por OF;
- regras operacionais devem permanecer fora da interface sempre que possivel;
- dados reais devem ser priorizados, mas somente depois de aceite visual quando a tela ainda estiver imatura.

## Relatorio Consolidado da Versao Atual

O NEXOTFE 1.0 ja possui uma base operacional consistente para iniciar homologacao, principalmente nos seguintes pontos:

- autenticacao;
- cadastro e consulta de clientes;
- cadastro e consulta de fornecedores;
- pagina mestre de Projeto com dados reais;
- pagina mestre de OF com dados reais;
- Planejamento PCP com dados reais e regras centralizadas;
- Programacao Diaria com dados reais, agrupamento por recurso e impressao;
- navegacao integrada por `EntityLink`, `ModuleBackButton` e rotas centralizadas.

Os principais blocos ainda nao maduros para operacao completa sao:

- REQ mestre;
- compras reais;
- planejamento real de compras;
- criacao operacional de PN, BOM, roteiro e OF pelo frontend;
- apontamento de producao;
- qualidade operacional;
- expedicao operacional;
- administracao de recursos, tecnologias, maquinas e colaboradores.

## Criterio de Sucesso da Homologacao

A fase sera considerada bem encaminhada quando:

- todas as paginas tiverem status revisado;
- cada tela critica tiver checklist preenchido;
- o fluxo Projeto -> PCP -> Programacao Diaria -> Producao for testado com dados reais;
- as pendencias forem priorizadas;
- nenhuma melhoria for implementada sem registro;
- o sistema puder ser utilizado pela Enifer em rotina controlada de validacao.

