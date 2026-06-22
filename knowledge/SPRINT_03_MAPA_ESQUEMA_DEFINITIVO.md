# Sprint 03 — Mapa do Esquema Definitivo NEXOTFE 1.0

**Status:** Contrato físico anterior ao DDL  
**Base:** Livro Mestre, Arquitetura de Dados, Estados Oficiais, Dicionário Industrial e Estudo Técnico 001

## 1. Regra de escopo

Este mapa traduz entidades normativas para estruturas persistentes. Ele não cria novo conceito funcional. Tabelas auxiliares existem somente para materializar composição, histórico, itens ou relações muitos-para-muitos já exigidas pela arquitetura.

Todas as tabelas de negócio possuem:

- `id uuid`;
- `empresa_id uuid` quando pertencentes a tenant;
- autoria e timestamps aplicáveis;
- integridade multiempresa;
- RLS;
- exclusão lógica somente quando compatível com rastreabilidade.

Históricos, eventos, movimentos, decisões, apontamentos e transições não podem sofrer exclusão lógica destrutiva.

## 2. Núcleo de segurança e administração

| Tabela definitiva | Origem | Responsabilidade |
|---|---|---|
| `empresas` | Transformar | Limite de isolamento e operação |
| `usuarios` | Transformar | Única fonte de empresa, papel e permissões |
| `configuracoes_empresa` | Transformar/consolidar | Parâmetros gerais versionáveis da empresa |
| `numeracao_configuracoes` | Transformar | Numeração transacional por empresa e entidade |
| `grupos_tecnologias` | Nova — ET001 | Agrupamento funcional de tecnologias |
| `tecnologias` | Substituir `tecnologias_aplicadas` | Competência exigida pelas operações |
| `grupos_recursos` | Transformar | Agrupamento de capacidade produtiva |
| `recursos_produtivos` | Transformar | Máquina, equipamento, dispositivo ou fornecedor executor |
| `colaboradores` | Transformar `funcionarios` | Pessoa e disponibilidade operacional |
| `colaborador_tecnologias` | Relação normativa | Qualificações do colaborador |
| `recurso_tecnologias` | Relação normativa | Tecnologias executáveis pelo recurso |

`auth.users` não integra o domínio industrial. Seu único vínculo é `usuarios.auth_user_id`, sem armazenar tenant ou autorização em metadata.

## 3. Comercial

| Tabela definitiva | Origem | Responsabilidade |
|---|---|---|
| `clientes` | Transformar | Identidade do cliente |
| `cliente_contatos` | Nova — Arquitetura de Dados | Contatos comerciais, técnicos, fiscais e de qualidade |
| `projetos` | Transformar | Unidade de gestão do orçamento à entrega |
| `orcamentos` | Nova — Arquitetura Geral | Cabeçalho e versão comercial |
| `orcamento_itens` | Auxiliar de composição | Escopo, quantidade e valor do orçamento |
| `aprovacoes_comerciais` | Nova — Arquitetura de Dados | Registro imutável da aprovação/rejeição |

Projeto mantém um único ciclo oficial. A passagem comercial/industrial é registrada por estado e eventos, sem duplicar a identidade do projeto.

## 4. Engenharia

| Tabela definitiva | Origem | Responsabilidade |
|---|---|---|
| `itens_industriais` | Transformar | Identidade técnica; origem única do PN |
| `projeto_itens` | Transformar | Aplicação de um item/PN no projeto |
| `documentos_tecnicos` | Nova — Arquitetura de Dados | Documento técnico rastreável |
| `revisoes_itens` | Nova — Arquitetura de Dados | Histórico e vigência da revisão técnica |
| `boms` | Transformar | Cabeçalho versionado da composição |
| `bom_itens` | Transformar | Componentes e quantidades da BOM |
| `roteiros_fabricacao` | Nova — ET001 | Cabeçalho versionado do processo |
| `roteiro_materiais` | Nova — ET001 | Consumo unitário por roteiro |
| `roteiro_operacoes` | Nova — ET001 | Sequência operacional do roteiro |
| `roteiro_operacao_materiais` | Nova — ET001 | Momento operacional da disponibilidade do material |

Regras estruturais:

- PN é único por empresa e não é copiado para `projeto_itens`;
- BOM responde somente à composição;
- Roteiro responde ao processo e ao consumo unitário;
- versões publicadas de BOM e Roteiro são imutáveis;
- documento e revisão possuem identidade e histórico próprios.

## 5. PCP

| Tabela definitiva | Origem | Responsabilidade |
|---|---|---|
| `ordens_fabricacao` | Transformar | Organizar fabricação e congelar BOM/Roteiro usados |
| `dependencias_of` | Nova — Arquitetura de Dados | Precedência entre OFs |
| `programacoes_of` | Nova — Arquitetura de Dados | Inserção formal da OF na programação |
| `necessidades_materiais` | Nova — ET001 | Demanda calculada e congelada |
| `decisoes_necessidade_material` | Nova — ET001 | Histórico da decisão humana do PCP |
| `reservas_estoque` | Nova — ET001 | Compromisso lógico do saldo |
| `reserva_estoque_eventos` | Nova — ET001 | Histórico imutável da reserva |

Regras estruturais:

- criar OF não cria reserva, consumo ou requisição;
- geração de necessidades é idempotente por OF, roteiro e versão de cálculo;
- decisão registra estoque, compra ou combinação;
- revisão de decisão não apaga decisão anterior;
- reserva e requisição referenciam a decisão que as originou.

## 6. Estoque e Suprimentos

| Tabela definitiva | Origem | Responsabilidade |
|---|---|---|
| `materias_primas` | Transformar | Identidade de compra e unidade oficial do material |
| `locais_estoque` | Auxiliar exigida pela Reserva | Local controlado onde existe saldo |
| `estoque_saldos` | Transformar | Saldo físico, reservado e livre por material/local |
| `estoque_movimentacoes` | Transformar/consolidar | Razão única de movimentos físicos |
| `consumos_materiais` | Transformar `consumos_internos` | Consumo físico vinculado à reserva e OF |
| `fornecedores` | Transformar | Identidade do fornecedor |
| `requisicoes_compra` | Transformar | Solicitação formal de aquisição |
| `requisicao_compra_itens` | Transformar | Itens originados por necessidade/decisão ou origem manual autorizada |
| `planejamentos_compra` | Transformar | Consolidação de necessidades compatíveis |
| `planejamento_compra_origens` | Transformar | Rastreabilidade das origens consolidadas |
| `pedidos_compra` | Transformar | Compromisso comercial com fornecedor |
| `pedido_compra_itens` | Transformar | Itens do pedido e suas origens |
| `recebimentos` | Nova — Arquitetura de Dados | Processo de recebimento e seu estado oficial |
| `recebimento_itens` | Auxiliar de composição | Quantidades recebidas e vínculo ao pedido |
| `recebimento_eventos` | Auxiliar de histórico | Recebimento físico, conferência, inspeção e liberação |

Regras estruturais:

- existe uma única razão física: `estoque_movimentacoes`;
- reserva nunca é tipo de movimentação física;
- saldo reservado deriva de reservas ativas, atualizado transacionalmente;
- Pedido possui FK de fornecedor, nunca somente nome textual;
- material só entra em saldo disponível após o recebimento atingir liberação.

## 7. Produção

| Tabela definitiva | Origem | Responsabilidade |
|---|---|---|
| `operacoes_producao` | Nova — Arquitetura de Dados | OP executável derivada do Roteiro/OF |
| `operacao_alocacoes` | Relação normativa | Recurso e colaborador alocados |
| `apontamentos_producao` | Nova — Arquitetura de Dados | Tempo, quantidade, perda e executor |
| `servicos_terceirizados` | Nova — Arquitetura de Dados | Envio, execução externa, retorno e vínculo à OP |

Cada OP preserva snapshot da operação do roteiro. A OF organiza; a OP executa.

## 8. Qualidade

| Tabela definitiva | Origem | Responsabilidade |
|---|---|---|
| `inspecoes_qualidade` | Nova — Arquitetura de Dados | Inspeção de recebimento, processo ou produto |
| `certificados_qualidade` | Nova — Arquitetura de Dados | Evidência documental de conformidade |
| `nao_conformidades` | Nova — Arquitetura de Dados | Ocorrência, disposição e tratamento |
| `liberacoes_qualidade` | Nova — Arquitetura de Dados | Gate formal de liberação/rejeição |

Qualidade referencia a entidade inspecionada por relações explícitas controladas; não usa texto livre como única origem.

## 9. Expedição

| Tabela definitiva | Origem | Responsabilidade |
|---|---|---|
| `produtos_acabados` | Nova — Arquitetura de Dados | Produto concluído e liberado |
| `separacoes_expedicao` | Nova — Arquitetura de Dados | Preparação para envio |
| `separacao_itens` | Auxiliar de composição | Produtos separados |
| `expedicoes` | Nova — Arquitetura de Dados | Evento/documento de expedição |
| `expedicao_itens` | Auxiliar de composição | Itens enviados |
| `entregas` | Nova — Arquitetura de Dados | Confirmação de entrega ao cliente |

## 10. Estados controlados

O baseline utilizará `text` com `CHECK`, conforme o Estudo Técnico 001, evitando enums nativos de alto custo evolutivo.

Estados obrigatórios:

- Projeto: `rascunho`, `em_orcamento`, `em_desenvolvimento`, `aguardando_aprovacao`, `aprovado`, `em_planejamento`, `em_producao`, `concluido`, `cancelado`;
- OF: `simulacao`, `aguardando_material`, `pronta_programacao`, `programada`, `em_producao`, `parada`, `finalizada`, `cancelada`;
- Necessidade: `definir`, `decisao_registrada`, `atendimento_parcial`, `atendida`, `cancelada`;
- Reserva: `ativa`, `consumida`, `liberada`, `cancelada`;
- Requisição: `aberta`, `em_cotacao`, `aprovada`, `convertida_pedido`, `cancelada`;
- Pedido: `emitido`, `parcialmente_recebido`, `recebido`, `encerrado`, `cancelado`;
- Recebimento: `aguardando_recebimento`, `recebimento_fisico`, `conferencia_documental`, `inspecao`, `liberado`, `rejeitado`;
- OP: `aguardando`, `preparacao`, `em_execucao`, `pausada`, `inspecao`, `concluida`, `cancelada`;
- Produto acabado: `em_producao`, `aguardando_expedicao`, `expedido`, `entregue`.

Estados não serão usados como tipo, origem, categoria, prioridade ou situação.

## 11. Integridade multiempresa

O simples uso de FKs por `id` não é suficiente. Relações empresariais críticas terão unicidade `(empresa_id, id)` no pai e FK composta `(empresa_id, pai_id)` no filho.

Isso se aplica, no mínimo, a:

- usuário → empresa;
- projeto → cliente;
- item de projeto → projeto/item industrial;
- BOM/Roteiro → item industrial;
- OF → projeto/item/BOM/Roteiro;
- necessidade → OF/Roteiro/material;
- decisão → necessidade;
- reserva → decisão/necessidade/OF/saldo;
- requisição → necessidade/decisão;
- pedido → fornecedor/planejamento;
- recebimento → pedido;
- OP → OF/operação do roteiro;
- objetos de qualidade e expedição.

## 12. Funções transacionais mínimas

O baseline deve fornecer contratos transacionais para:

- resolver contexto por `public.usuarios`;
- gerar numeração por empresa;
- criar OF sem atendimento automático;
- gerar/reprocessar necessidades idempotentemente;
- registrar/revisar decisão PCP;
- reservar, liberar, cancelar e consumir reserva;
- criar requisição a partir da decisão;
- consolidar planejamento de compras;
- emitir pedido;
- registrar etapas do recebimento;
- transicionar estados com histórico e validação.

Funções genéricas de soft delete/restore com SQL dinâmico não integrarão o baseline.

## 13. Views

Views serão criadas somente após as entidades transacionais e deverão usar `security_invoker = true` quando expostas à API. Nenhuma view decidirá ou inventará estado; ela apenas projetará fatos persistidos.

## 14. Gate para o DDL

O DDL pode começar quando:

- a classificação dos objetos estiver completa;
- este mapa tiver correspondência com todas as entidades normativas;
- os nomes definitivos estiverem congelados para a Sprint;
- nenhuma tabela representar simultaneamente Reserva e Consumo;
- `public.usuarios` permanecer como única autoridade de negócio.

Essas condições estão atendidas para iniciar a escrita incremental do baseline SQL em ambiente isolado.

