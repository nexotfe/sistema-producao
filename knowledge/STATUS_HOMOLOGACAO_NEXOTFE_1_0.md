# Status de Homologacao NEXOTFE 1.0

**Versao:** 1.0  
**Status:** Controle operacional em andamento  
**Data:** 27/06/2026  
**Responsavel:** NEXOTFE / Flavio  
**Natureza:** registra o que esta aprovado, em teste ou pendente

## Objetivo

Este documento registra o estado atual de homologacao do NEXOTFE 1.0.

Ele evita confusao entre:

- tela criada;
- tela funcional;
- tela com dados reais;
- tela mockada;
- tela homologada operacionalmente.

## Criterios de Status

| Status | Significado |
| --- | --- |
| Homologado | Utilizado e aprovado operacionalmente pelo Flavio. |
| Funcional | Compila, abre e executa fluxo principal. |
| Parcial | Existe, mas falta parte importante do fluxo. |
| Mockado | Usa dados ficticios ou estrutura visual sem integracao real. |
| Em homologacao | Em teste operacional controlado. |
| Pendente | Ainda nao implementado ou nao validado. |

## Cadastros Base

| Modulo | Rotas principais | Dados | Status | Observacao |
| --- | --- | --- | --- | --- |
| Clientes | `/clientes`, `/clientes/novo`, `/clientes/[id]`, `/clientes/[id]/editar` | Reais | Em homologacao final | Validado com uso real; referencia visual para cadastros. |
| Colaboradores | `/colaboradores`, `/colaboradores/novo`, `/colaboradores/[id]`, `/colaboradores/[id]/editar` | Reais | Em homologacao | Interface usa Colaboradores; tabela fisica pode permanecer conforme baseline atual. |
| Fornecedores | `/fornecedores`, `/fornecedores/novo`, `/fornecedores/[id]`, `/fornecedores/[id]/editar` | Reais | Em homologacao | Segue padrao de Clientes e Colaboradores. |
| Grupos de Recursos | `/grupos-recursos`, `/grupos-recursos/novo`, `/grupos-recursos/[id]`, `/grupos-recursos/[id]/editar` | Reais | Em homologacao | Representa Familia Produtiva. |
| Recursos Produtivos | `/recursos`, `/recursos/novo`, `/recursos/[id]`, `/recursos/[id]/editar` | Reais/parcial | Em ajuste | Depende de Grupo de Recursos obrigatorio. |
| Produtos | `/produtos`, `/produtos/novo`, `/produtos/[pn]`, `/produtos/[pn]/editar` | Mockados | Mockado aprovado para estrutura inicial | Nao conectado ao Supabase por decisao da fase. |

## Comercial e Projeto

| Modulo | Rotas principais | Dados | Status | Observacao |
| --- | --- | --- | --- | --- |
| Projetos | `/projetos`, `/projetos/novo` | Parcial | Parcial | Precisa homologar criacao ponta a ponta. |
| Projeto Mestre | `/projetos/[id]` | Reais | Funcional | Pagina mestre operacional mais madura. |
| Orcamentos | A definir | Pendente | Pendente | Importante para nascimento de Produtos e Projetos. |

## Engenharia

| Modulo | Rotas principais | Dados | Status | Observacao |
| --- | --- | --- | --- | --- |
| Produto / Codigo | `/produtos/[pn]` | Placeholder | Parcial | Rota tecnica existe; interface deve usar "Codigo". |
| Roteiros | `/roteiros/[pn]` | Parcial/mock | Parcial | Necessita homologacao com dados reais. |
| BOM | A definir | Pendente | Pendente | Indicadores aparecem no Projeto, mas tela completa falta. |
| Documentos Tecnicos | A definir | Pendente | Pendente | Estrutura futura. |

## PCP

| Modulo | Rotas principais | Dados | Status | Observacao |
| --- | --- | --- | --- | --- |
| Planejamento PCP | `/pcp/planejamento` | Reais | Funcional | Macro por Projeto; prioridade local; situacao, estado, proxima acao e avanco conectados. |
| Programacao Diaria | `/pcp/programacao-diaria` | Reais + regras | Em evolucao | Micro por OF; agrupamento por recurso e impressao em evolucao. |
| Capacidade | A definir | Pendente | Futuro | Nao faz parte da versao atual. |
| APS | A definir | Pendente | Futuro | Nao implementar sem fase aprovada. |

## Compras

| Modulo | Rotas principais | Dados | Status | Observacao |
| --- | --- | --- | --- | --- |
| Compras | `/compras` | Mock | Mockado | Precisa integracao real futura. |
| Decisao Material | `/compras/decisao-material` | Mock | Mockado | Simulacao visual. |
| Planejamento Compras | `/compras/planejamento`, `/compras/planejamento/[id]` | Mock | Mockado | Precisa homologacao real. |
| Pedido de Compra | `/compras/pedidos/[id]` | Parcial/mock | Parcial | A validar. |
| REQ Mestre | `/compras/requisicoes/[id]` | Pendente | Pendente | Rota prevista por EntityLink, pagina ainda faltante. |

## Producao

| Modulo | Rotas principais | Dados | Status | Observacao |
| --- | --- | --- | --- | --- |
| OF Mestre | `/ordens/[id]` | Reais | Funcional | Pagina mestre unica da OF. |
| Apontamentos | A definir | Pendente | Pendente | Existe no baseline, falta frontend operacional. |

## Estoque

| Modulo | Rotas principais | Dados | Status | Observacao |
| --- | --- | --- | --- | --- |
| Materias-primas | `/estoque/materias-primas` | A verificar | Em desenvolvimento | Precisa homologacao detalhada. |
| Saldos e Movimentacoes | A definir | Pendente | Pendente | A implementar conforme fluxo aprovado. |

## Qualidade

| Modulo | Rotas principais | Dados | Status | Observacao |
| --- | --- | --- | --- | --- |
| Indicadores no Projeto | `/projetos/[id]` | Reais/parcial | Funcional | Bloco executivo integrado. |
| Inspecoes | A definir | Pendente | Pendente | Falta tela operacional. |
| RNC | A definir | Pendente | Pendente | Falta tela operacional. |
| Certificados | A definir | Pendente | Pendente | Falta tela operacional. |

## Expedicao

| Modulo | Rotas principais | Dados | Status | Observacao |
| --- | --- | --- | --- | --- |
| Expedicao | A definir | Pendente | Pendente | Existe no fluxo e baseline, falta frontend operacional. |

## Proxima Ordem Recomendada

1. Concluir homologacao de Produtos mockados com aceite visual.
2. Definir regra oficial de Produto no fluxo de Orcamento.
3. Homologar Grupos de Recursos e Recursos Produtivos.
4. Retomar Engenharia: Produtos reais, Roteiro, BOM.
5. Criar pagina mestre REQ.
6. Consolidar Compras com dados reais.
7. Avancar Programacao Diaria, Producao, Qualidade e Expedicao.

## Regra de Atualizacao

Este documento deve ser atualizado sempre que:

- um modulo for homologado;
- uma tela passar de mock para dados reais;
- uma rota nova for criada;
- uma decisao operacional mudar;
- uma dependencia nova for identificada.
