# PLANO DIRETOR DE IMPLEMENTAÇÃO — NEXOTFE 1.0

**Versão:** 1.0  
**Status:** Plano oficial de implementação  
**Data:** 19/06/2026  
**Base normativa:** Arquitetura NEXOTFE 1.0 congelada

## 1. Finalidade

Organizar a implementação incremental da Arquitetura NEXOTFE 1.0, preservando integralmente o Livro Mestre, a Arquitetura Geral, a Arquitetura de Dados, os Estados Oficiais, o Padrão de Classificações, o Dicionário Industrial e os Contratos Técnicos aprovados.

Este documento não altera a arquitetura. Ele define sequência, dependências, entregas, gates de qualidade e estratégia de migração.

## 2. Premissas e regras de execução

1. A Arquitetura 1.0 está congelada.
2. Nenhuma decisão de domínio poderá ser criada durante a implementação sem revisão arquitetural formal.
3. O banco existente deve ser preservado até a validação da migração.
4. Mudanças destrutivas não serão executadas na mesma entrega que introduzir suas substitutas.
5. Operações com múltiplos efeitos devem usar transações atômicas.
6. Estados, classificações e termos devem reproduzir exatamente os documentos normativos.
7. Cada fase deve entregar um incremento demonstrável e reversível.
8. Nenhuma interface será conectada a operações transacionais antes da validação do banco, das regras e da segurança.
9. Dados mockados não serão removidos antes de existir uma fonte real validada.
10. Fases posteriores não poderão contornar contratos incompletos de fases anteriores.

## 3. Risco crítico de início

No workspace atual, Arquitetura Geral, Arquitetura de Dados, Padrão de Classificações e Dicionário Industrial estão presentes como arquivos vazios. Como esses documentos foram declarados aprovados e normativos, seu conteúdo oficial deve ser disponibilizado no repositório antes do primeiro desenvolvimento definitivo.

Esse gate não reabre nem redesenha a arquitetura. Ele garante que a equipe implemente a versão aprovada, e não interpretações individuais.

**Condição de liberação:** os artefatos aprovados devem estar versionados, identificados por versão e acessíveis à equipe.

## 4. Estratégia geral

Sequência padrão de cada incremento:

```text
Contrato normativo
→ Modelo físico e migration revisada
→ RLS e permissões
→ RPCs e invariantes transacionais
→ Consultas e APIs de aplicação
→ Testes automatizados
→ Interface
→ Teste integrado
→ Aceite funcional
→ Observabilidade e liberação
```

### Justificativa

- Banco primeiro garante integridade independente da interface.
- RPCs concentram transações que não podem ser divididas em chamadas do cliente.
- APIs de aplicação isolam consumidores do modelo físico.
- Testes anteriores à interface reduzem retrabalho visual sobre regras instáveis.
- Integração e observabilidade fecham o ciclo antes da entrega operacional.

## 5. Fases oficiais

### Fase 0 — Gate normativo e preparação

**Prioridade:** crítica  
**Complexidade:** baixa  
**Risco:** crítico  
**Impacto:** total

#### Objetivo

Garantir que a implementação utilize exatamente a Arquitetura 1.0 aprovada.

#### Pré-requisitos

- aprovação interna da Arquitetura 1.0;
- identificação dos responsáveis funcionais e técnicos.

#### Entregas

- documentos normativos completos e versionados;
- matriz de rastreabilidade documento → entidade → estado → regra;
- glossário e classificações disponíveis para consulta;
- lista oficial de estados e transições;
- registro de decisões arquiteturais aplicáveis;
- critérios de alteração da arquitetura congelada.

#### Tabelas, RPCs, APIs e telas

Nenhuma. Esta fase não altera o sistema.

#### Testes e validações

- verificar ausência de documentos normativos vazios;
- verificar versão e status de cada documento;
- revisar termos duplicados ou divergentes;
- confirmar que o Estudo Técnico 001 referencia os estados oficiais.

#### Critério de conclusão

Todos os documentos normativos aprovados estão acessíveis e a equipe consegue rastrear cada termo e regra até sua fonte.

#### Risco caso seja ignorada

Criação de schema e regras baseadas em interpretações não aprovadas.

---

### Fase 1 — Baseline e saneamento do banco

**Prioridade:** crítica  
**Complexidade:** alta  
**Risco:** crítico  
**Impacto:** total

#### Objetivo

Criar uma base reproduzível e segura para receber a nova arquitetura sem perda dos dados existentes.

#### Pré-requisitos

- Fase 0 concluída;
- acesso controlado ao banco atual;
- backup validado;
- inventário dos ambientes.

#### Tabelas envolvidas

Todas as tabelas existentes, com atenção especial a:

- `empresas`;
- `usuarios`;
- `clientes`;
- `fornecedores`;
- `projetos` e `projeto_itens`;
- `itens_industriais`;
- `materias_primas`;
- `boms` e `bom_itens`;
- `ordens_fabricacao`;
- tabelas de estoque e compras;
- configurações de numeração e produção.

#### RPCs e APIs

- inventariar todas as funções e assinaturas atuais;
- identificar overloads e funções obsoletas;
- não expor novas APIs nesta fase.

#### Entregas

- catálogo do schema remoto;
- mapa migration → objeto criado;
- identificação das migrations aplicadas;
- baseline canônico para ambiente vazio;
- plano de backfill;
- plano de compatibilidade;
- plano de recuperação e rollback;
- retirada do consolidado duplicado do fluxo automático;
- ordem válida de dependências das migrations.

#### Testes

- reconstrução integral de banco vazio;
- aplicação sobre cópia anonimizada do banco atual;
- comparação de schema esperado versus obtido;
- verificação de FKs, índices, RLS, grants, views e funções;
- restauração de backup;
- detecção de funções ambíguas.

#### Critérios de conclusão

- banco vazio reproduzido sem intervenção manual;
- dados existentes preservados em ensaio de migração;
- rollback testado;
- nenhuma migration duplicada ou fora de ordem;
- relatório de divergências aprovado.

#### Risco caso a ordem seja alterada

Qualquer módulo novo poderá depender de um schema que não pode ser reconstruído ou migrado com segurança.

---

### Fase 2 — Fundação multiempresa e cadastros industriais

**Prioridade:** crítica  
**Complexidade:** média  
**Risco:** alto  
**Impacto:** total

#### Objetivo

Estabilizar identidade, tenant, numeração, classificações e cadastros compartilhados pelos demais módulos.

#### Dependências funcionais

- Dicionário Industrial;
- Padrão de Classificações;
- Estados Oficiais.

#### Tabelas envolvidas

- `empresas`;
- `usuarios` e vínculos autorizados;
- `clientes`;
- `fornecedores`;
- `numeracao_configuracoes`;
- `producao_configuracoes`;
- `grupos_tecnologias`;
- `tecnologias`;
- `recursos_produtivos`;
- cadastros de colaboradores definidos pela arquitetura;
- `materias_primas`;
- `itens_industriais` e classificações normativas.

#### RPCs

- geração transacional de numeração;
- ativação/inativação controlada de cadastros quando houver efeitos relacionados;
- operações administrativas previstas nos contratos normativos.

#### APIs

- consultas e comandos de cadastros mestres;
- pesquisa por códigos oficiais;
- consulta de classificações e estados permitidos.

#### Telas

- clientes;
- fornecedores;
- materiais/itens;
- tecnologias e grupos;
- recursos produtivos;
- colaboradores e configurações previstas.

#### Testes

- isolamento entre duas empresas;
- unicidade por tenant;
- numeração concorrente;
- bloqueio de vínculos cruzados entre empresas;
- ativação, inativação e histórico;
- conformidade das classificações.

#### Critérios de conclusão

- cadastros reais sem mocks;
- RLS validada;
- classificações iguais às fontes normativas;
- numeração sem colisão;
- dados mestres reutilizáveis pelas fases seguintes.

#### Risco caso seja antecipada outra fase

Projetos, roteiros e compras poderão criar registros duplicados ou incompatíveis com o cadastro mestre.

---

### Fase 3 — Comercial e Projetos

**Prioridade:** alta  
**Complexidade:** média  
**Risco:** médio  
**Impacto:** alto

#### Objetivo

Implementar o ciclo comercial e a criação da demanda industrial conforme o Livro Mestre.

#### Pré-requisitos

- clientes e numeração estabilizados;
- estados de Projeto aprovados;
- classificações comerciais disponíveis.

#### Tabelas envolvidas

- `clientes`;
- `projetos`;
- `projeto_itens`;
- `itens_industriais`;
- tabelas complementares previstas pela Arquitetura de Dados para documentos, aprovações e histórico.

#### RPCs

- criação numerada de projeto/orçamento;
- transições oficiais de estado;
- aprovação e liberação para o fluxo industrial;
- cancelamento com validação de dependências.

#### APIs

- listar e consultar projetos;
- criar e atualizar projeto em estado permitido;
- adicionar itens reutilizando PN existente;
- consultar histórico e aprovações.

#### Telas

- listagem de projetos;
- novo projeto;
- detalhe do projeto;
- itens do projeto;
- aprovação e histórico.

#### Testes

- numeração concorrente;
- transições válidas e inválidas;
- reutilização de PN;
- bloqueio de alteração após marcos normativos;
- isolamento por tenant;
- rastreabilidade cliente → projeto → item.

#### Critérios de conclusão

- ciclo comercial executável com dados reais;
- nenhuma duplicação de PN ao adicionar item;
- estados e aprovações auditáveis;
- projeto liberado disponível para Engenharia.

#### Risco caso a ordem seja alterada

Engenharia poderá nascer sem origem comercial rastreável ou receber dados ainda mutáveis.

---

### Fase 4 — Engenharia industrial

**Prioridade:** crítica  
**Complexidade:** alta  
**Risco:** alto  
**Impacto:** crítico

#### Objetivo

Implementar PN, BOM, Roteiro de Fabricação, materiais, operações, tecnologias e publicação de versões.

#### Pré-requisitos

- estrutura industrial e classificações concluídas;
- projetos reais;
- tecnologias e materiais cadastrados;
- regras oficiais de revisão disponíveis.

#### Tabelas envolvidas

- `itens_industriais`;
- `boms`;
- `bom_itens`;
- `roteiros_fabricacao`;
- `roteiro_materiais`;
- `roteiro_operacoes`;
- `roteiro_operacao_materiais`;
- `grupos_tecnologias`;
- `tecnologias`;
- tabelas de documentos e revisões previstas pela Arquitetura de Dados.

#### RPCs

- `publicar_roteiro_fabricacao`;
- operações transacionais de publicação/liberação definidas para BOM e documentos;
- criação de nova versão preservando a anterior.

#### APIs

- consultar PN e versões;
- criar e editar rascunho de roteiro;
- manter materiais e operações;
- validar e publicar roteiro;
- consultar estrutura liberada.

#### Telas

- portal técnico do PN;
- listagem e detalhe de BOM;
- edição e publicação de roteiro;
- materiais do roteiro;
- operações e tecnologias;
- documentos e histórico de revisão.

#### Testes

- apenas uma versão ativa quando essa for a regra normativa;
- imutabilidade de versão publicada;
- sequência de operações;
- unidade herdada do material;
- integridade BOM/roteiro/PN;
- publicação concorrente;
- vínculo entre material e operação.

#### Critérios de conclusão

- PN possui estrutura e roteiro publicados;
- versões anteriores permanecem rastreáveis;
- materiais e operações são persistidos;
- estrutura publicada pode originar planejamento e OF sem dados manuais duplicados.

#### Risco caso a ordem seja alterada

OFs poderão ser criadas sem definição técnica congelada, exigindo retrabalho e correções retroativas.

---

### Fase 5 — PCP, OF e decisão de materiais

**Prioridade:** crítica  
**Complexidade:** muito alta  
**Risco:** crítico  
**Impacto:** crítico

#### Objetivo

Implementar o eixo aprovado no Estudo Técnico 001: Roteiro → OF → Necessidades → Decisão PCP → Reserva/Requisição.

#### Pré-requisitos

- roteiro publicado;
- estoque base disponível;
- estados oficiais unificados;
- funções antigas de reserva/consumo classificadas para migração.

#### Tabelas envolvidas

- `ordens_fabricacao`;
- `necessidades_materiais`;
- `decisoes_necessidade_material`;
- `reservas_estoque`;
- `reserva_estoque_eventos`;
- `estoque_saldos`;
- `estoque_movimentacoes`;
- `requisicoes_compra`;
- `requisicao_compra_itens`;
- estruturas de roteiro e OF.

#### RPCs

- `criar_of_com_necessidades`;
- `gerar_necessidades_materiais_of`;
- `registrar_decisao_pcp`;
- `liberar_reserva_material`;
- `consumir_reserva_material`;
- `cancelar_decisao_necessidade`;
- `cancelar_of_e_liberar_reservas`.

#### APIs

- consultar OF e snapshot técnico;
- listar necessidades pendentes;
- registrar decisão PCP com idempotência;
- consultar cobertura, reservas e requisições;
- cancelar ou revisar decisões conforme regras oficiais.

#### Telas

- criação/liberação de OF;
- detalhe operacional de OF;
- lista de necessidades;
- decisão PCP;
- consulta de reservas;
- rastreabilidade OF → necessidade → reserva/requisição.

#### Testes

- saldo total, parcial e inexistente;
- concorrência sobre o mesmo saldo;
- rollback integral em falha intermediária;
- idempotência;
- múltiplos locais de estoque;
- cancelamento e liberação;
- impossibilidade de consumo acima da reserva;
- bloqueio de decisão em estado inválido;
- RLS e vínculo multiempresa.

#### Critérios de conclusão

- nenhuma reserva ou requisição nasce sem decisão PCP;
- saldo nunca fica negativo;
- reprocessamento não duplica registros;
- OF preserva o roteiro utilizado;
- fluxo total, parcial e sem estoque é demonstrável;
- histórico completo e auditável.

#### Risco caso a ordem seja alterada

É possível duplicar compras, reservar saldo inexistente ou perder rastreabilidade entre engenharia e suprimentos.

---

### Fase 6 — Suprimentos e Compras

**Prioridade:** alta  
**Complexidade:** alta  
**Risco:** alto  
**Impacto:** alto

#### Objetivo

Transformar requisições aprovadas em planejamento e pedidos de compra rastreáveis.

#### Pré-requisitos

- necessidades e decisões PCP operacionais;
- fornecedores cadastrados;
- classificações de compra disponíveis.

#### Tabelas envolvidas

- `requisicoes_compra`;
- `requisicao_compra_itens`;
- `planejamentos_compra`;
- `planejamento_compra_origens`;
- `pedidos_compra`;
- `pedido_compra_itens`;
- `fornecedores`;
- tabelas de cotação previstas pela Arquitetura de Dados.

#### RPCs

- atualização transacional da decisão de planejamento;
- inclusão/exclusão controlada de origens;
- geração idempotente de pedido;
- cancelamento conforme estado e vínculos existentes.

#### APIs

- listar requisições abertas;
- consolidar necessidades pela chave normativa;
- registrar estratégia do comprador;
- gerar e consultar pedido;
- consultar rastreabilidade até OF e projeto.

#### Telas

- central de compras;
- requisições;
- planejamento;
- detalhe e decisão do planejamento;
- pedido de compra;
- fornecedor relacionado.

#### Testes

- consolidação compatível;
- agrupamento total, parcial e por OF;
- preservação das origens;
- pedido sem duplicidade;
- fornecedor por relacionamento oficial;
- cancelamento e alteração de estado;
- RLS.

#### Critérios de conclusão

- toda compra possui origem rastreável;
- consolidação não perde quantidade nem vínculo;
- decisões humanas ficam auditadas;
- pedido emitido pode ser recebido pela fase seguinte.

#### Risco caso a ordem seja alterada

Pedidos poderão ser gerados sem necessidade aprovada ou sem vínculo confiável com a produção.

---

### Fase 7 — Recebimento, inspeção de entrada e estoque

**Prioridade:** alta  
**Complexidade:** alta  
**Risco:** alto  
**Impacto:** crítico

#### Objetivo

Receber materiais, conferir pedido/documento/material físico, executar a inspeção aplicável e liberar saldo para uso.

#### Pré-requisitos

- pedidos de compra operacionais;
- estoque e materiais estabilizados;
- estados de Recebimento e Qualidade disponíveis.

#### Tabelas envolvidas

- pedidos e itens de compra;
- tabelas de recebimento e itens definidas pela Arquitetura de Dados;
- documentos fiscais recebidos previstos;
- inspeções e divergências previstas;
- `estoque_movimentacoes`;
- `estoque_saldos`;
- reservas relacionadas.

#### RPCs

- registrar recebimento físico;
- registrar conferência e inspeção;
- liberar recebimento para estoque;
- rejeitar ou registrar divergência;
- atualizar atendimento do pedido e da necessidade atomicamente.

#### APIs

- consultar entregas esperadas;
- registrar recebimento parcial ou total;
- consultar divergências;
- liberar material;
- consultar reflexo nas necessidades e OFs.

#### Telas

- recebimentos pendentes;
- conferência física/documental;
- inspeção de entrada;
- divergências;
- entrada em estoque;
- rastreabilidade do pedido à OF.

#### Testes

- recebimento total e parcial;
- quantidade superior ou divergente;
- rejeição e quarentena conforme estados oficiais;
- entrada única de estoque;
- repetição idempotente;
- atualização de pedido e necessidade;
- rollback em falha.

#### Critérios de conclusão

- material somente fica disponível após liberação prevista;
- pedido, recebimento e estoque reconciliam quantidades;
- divergências permanecem rastreáveis;
- OF reflete a disponibilidade atualizada.

#### Risco caso a ordem seja alterada

Material não conferido pode entrar em produção ou recebimentos podem duplicar saldo.

---

### Fase 8 — Produção e execução de operações

**Prioridade:** alta  
**Complexidade:** muito alta  
**Risco:** crítico  
**Impacto:** crítico

#### Objetivo

Executar OFs e operações segundo o roteiro congelado, registrando consumo, progresso, paradas e conclusão.

#### Pré-requisitos

- OF e necessidades operacionais;
- materiais liberados;
- operações e tecnologias definidas;
- recursos e colaboradores disponíveis;
- estados de OP aprovados.

#### Tabelas envolvidas

- `ordens_fabricacao`;
- operações de OF definidas pela Arquitetura de Dados;
- apontamentos de produção previstos;
- recursos, tecnologias e colaboradores;
- reservas e `consumos_internos`;
- `estoque_movimentacoes`;
- registros de parada, perda e conclusão previstos.

#### RPCs

- liberar OF para produção;
- iniciar, pausar, retomar e concluir operação;
- consumir reserva;
- registrar quantidade produzida e perda;
- finalizar OF e registrar produto acabado conforme contrato.

#### APIs

- consultar fila de operações;
- consultar instruções e materiais;
- registrar eventos de execução;
- consultar progresso e impedimentos;
- consultar histórico da OF.

#### Telas

- fila operacional;
- detalhe da operação;
- apontamento;
- consumo de material;
- paradas e ocorrências;
- acompanhamento da OF.

#### Testes

- transições completas de OP;
- bloqueio sem pré-condições;
- consumo total e parcial de reserva;
- concorrência de apontamentos;
- conclusão com operações pendentes;
- perda e retrabalho conforme contratos;
- rastreabilidade de usuário, recurso, tempo e quantidade.

#### Critérios de conclusão

- operação percorre seu ciclo oficial;
- consumo físico é reconciliado com reserva;
- OF não finaliza com pendências proibidas;
- produto acabado e histórico são gerados corretamente;
- execução é totalmente auditável.

#### Risco caso a ordem seja alterada

Produção pode consumir material sem reserva, executar revisão errada ou concluir OF sem evidência operacional.

---

### Fase 9 — Qualidade industrial

**Prioridade:** alta  
**Complexidade:** alta  
**Risco:** alto  
**Impacto:** alto

#### Objetivo

Consolidar inspeções, resultados, não conformidades e disposições ao longo do fluxo industrial.

#### Pré-requisitos

- recebimento e produção operacionais;
- estados e responsabilidades de Qualidade definidos.

#### Tabelas envolvidas

- planos e resultados de inspeção previstos;
- não conformidades e disposições previstas;
- recebimentos;
- operações;
- OFs;
- produtos acabados e documentos relacionados.

#### RPCs

- registrar resultado de inspeção;
- aprovar, rejeitar ou encaminhar conforme estado permitido;
- abrir e encerrar não conformidade;
- aplicar disposição com efeitos transacionais.

#### APIs e telas

- fila de inspeção;
- inspeção de recebimento, processo e final;
- não conformidades;
- disposição e histórico;
- rastreabilidade por material, OF e operação.

#### Testes

- aprovação e rejeição;
- bloqueio de material/produto não liberado;
- retrabalho e reinspeção;
- segregação de responsabilidade;
- histórico imutável.

#### Critérios de conclusão

- nenhum material ou produto sujeito a inspeção avança sem disposição válida;
- não conformidades possuem origem, responsável e encerramento;
- decisões de qualidade são auditáveis.

#### Risco caso seja adiada além da expedição

Produtos podem ser expedidos sem evidência de conformidade.

---

### Fase 10 — Expedição e Entrega

**Prioridade:** média  
**Complexidade:** média  
**Risco:** médio  
**Impacto:** alto

#### Objetivo

Transformar produto acabado e liberado em expedição e entrega rastreáveis.

#### Pré-requisitos

- OF finalizada;
- produto acabado disponível;
- qualidade liberada;
- dados do cliente e projeto consistentes.

#### Tabelas envolvidas

- produtos acabados previstos;
- expedições e itens previstos;
- entregas previstas;
- movimentações de estoque;
- projeto, cliente e OF.

#### RPCs

- reservar produto para expedição;
- confirmar expedição;
- registrar entrega;
- cancelar ou corrigir por evento compensatório.

#### APIs e telas

- produtos aguardando expedição;
- preparação e conferência;
- expedição;
- entrega e comprovantes;
- rastreabilidade até projeto e OF.

#### Testes

- expedição parcial e total;
- bloqueio sem qualidade;
- redução correta de estoque;
- idempotência de confirmação;
- entrega e encerramento.

#### Critérios de conclusão

- produto percorre estados oficiais até entregue;
- quantidades expedidas e entregues reconciliam;
- rastreabilidade ponta a ponta disponível.

---

### Fase 11 — Central Operacional, indicadores e integração

**Prioridade:** média  
**Complexidade:** alta  
**Risco:** médio  
**Impacto:** alto

#### Objetivo

Disponibilizar perspectivas operacionais sobre os dados consolidados, sem criar nova verdade de negócio.

#### Pré-requisitos

- módulos transacionais estabilizados;
- eventos e estados confiáveis;
- métricas definidas pela arquitetura.

#### Tabelas envolvidas

- tabelas transacionais das fases anteriores;
- views e read models aprovados;
- estruturas de integração previstas pela Arquitetura de Dados.

#### RPCs e APIs

- consultas agregadas sem efeitos colaterais;
- APIs de integração versionadas;
- publicação e reprocessamento controlado de eventos previstos.

#### Telas

- Central Nexus;
- Central de Operações;
- perspectivas Comercial, PCP, Compras, Produção, Qualidade e Expedição;
- alertas e indicadores definidos.

#### Testes

- consistência entre indicador e origem;
- isolamento multiempresa;
- navegação até o registro transacional;
- contratos de integração;
- idempotência e recuperação de eventos.

#### Critérios de conclusão

- toda informação agregada pode ser rastreada até sua origem;
- central não possui regra transacional própria;
- integrações não dependem diretamente de detalhes internos instáveis.

#### Risco caso seja antecipada

Dashboards serão construídos sobre dados e significados ainda instáveis, gerando retrabalho e indicadores conflitantes.

## 6. Estratégia de migração

### 6.1 Princípios

- migrations progressivas e versionadas;
- mudanças aditivas antes de mudanças destrutivas;
- dados legados nunca descartados sem reconciliação;
- rollback operacional baseado em backup, compatibilidade e retorno de aplicação;
- migrations aplicadas primeiro em ambiente isolado e depois em cópia anonimizada;
- nenhuma edição retroativa de migration já aplicada.

### 6.2 Etapas

1. Congelar alterações concorrentes no schema durante o baseline.
2. Gerar inventário do banco remoto e das migrations locais.
3. Identificar objetos sem migration e migrations não aplicadas.
4. Validar backup e restauração.
5. Criar baseline canônico reproduzível.
6. Aplicar expansão de schema sem remover estruturas antigas.
7. Executar backfill idempotente e auditável.
8. Comparar totais, chaves e relacionamentos.
9. Habilitar leitura nova sob controle de liberação.
10. Manter compatibilidade temporária com estruturas antigas.
11. Realizar cutover somente após aceite funcional.
12. Remover estruturas antigas em fase posterior e independente.

### 6.3 Dados existentes

Classificar cada conjunto como:

- válido e migrável automaticamente;
- válido com transformação;
- ambíguo e dependente de decisão humana;
- inválido e preservado para auditoria;
- dado de demonstração, removível apenas com autorização.

Consumos internos existentes exigem atenção especial porque podem representar reservas antecipadas.

### 6.4 Compatibilidade

- manter IDs estáveis sempre que permitido pela arquitetura;
- usar adaptações temporárias para leituras antigas;
- impedir escrita simultânea em modelos divergentes sem estratégia explícita;
- versionar APIs quando o contrato de dados mudar;
- remover mocks apenas após validação da fonte real.

### 6.5 Rollback

- backup e restauração testados;
- ponto de recuperação anterior à migration;
- rollback da aplicação independente do rollback de dados;
- feature flags para ativação de fluxos;
- migrations destrutivas em janela separada;
- eventos compensatórios para operações de negócio já confirmadas;
- relatório de reconciliação após retorno.

## 7. Estratégia de testes e qualidade

### 7.1 Pirâmide obrigatória

1. Testes de constraints e estados.
2. Testes unitários de regras determinísticas.
3. Testes de RPC e transação.
4. Testes de RLS e autorização.
5. Testes de integração entre módulos.
6. Testes de migração e reconciliação.
7. Testes ponta a ponta dos fluxos críticos.
8. Aceite operacional com usuários responsáveis.

### 7.2 Cobertura mínima

- 100% das invariantes críticas com cenário automatizado;
- 100% das transições de estado permitidas e proibidas;
- 100% das RPCs transacionais com sucesso, falha e rollback;
- 100% das políticas RLS testadas com ao menos dois tenants e usuário sem acesso;
- cobertura mínima de 80% das regras determinísticas não críticas;
- todo bug crítico deve gerar teste de regressão.

Percentual de linhas não substitui cobertura de regras industriais.

### 7.3 Gate comum de conclusão de fase

Uma fase somente termina quando:

- entregas previstas estão implementadas e documentadas;
- critérios funcionais foram aceitos;
- arquitetura não apresenta desvio não aprovado;
- migrations foram testadas do zero e sobre base representativa;
- RLS e permissões foram validadas;
- testes obrigatórios passaram;
- rollback foi ensaiado quando aplicável;
- dados foram reconciliados;
- observabilidade e mensagens de erro estão disponíveis;
- documentação operacional foi atualizada;
- não existem mocks no fluxo declarado concluído.

## 8. Roadmap executivo

| Fase | Prioridade | Complexidade | Risco | Impacto |
|---|---|---|---|---|
| 0. Gate normativo | Crítica | Baixa | Crítico | Total |
| 1. Baseline do banco | Crítica | Alta | Crítico | Total |
| 2. Fundação e cadastros | Crítica | Média | Alto | Total |
| 3. Comercial e Projetos | Alta | Média | Médio | Alto |
| 4. Engenharia industrial | Crítica | Alta | Alto | Crítico |
| 5. PCP e materiais | Crítica | Muito alta | Crítico | Crítico |
| 6. Suprimentos | Alta | Alta | Alto | Alto |
| 7. Recebimento e estoque | Alta | Alta | Alto | Crítico |
| 8. Produção | Alta | Muito alta | Crítico | Crítico |
| 9. Qualidade | Alta | Alta | Alto | Alto |
| 10. Expedição | Média | Média | Médio | Alto |
| 11. Centrais e integração | Média | Alta | Médio | Alto |

## 9. Paralelização permitida

Após a Fase 1:

- cadastros de clientes e fornecedores podem evoluir em paralelo;
- tecnologias, recursos e materiais podem ser implementados em frentes separadas sob o mesmo contrato;
- preparação de testes e fixtures pode ocorrer paralelamente a cada modelo físico;
- protótipos de interface podem avançar sem integração e sem criar regras.

Após a Fase 4:

- Suprimentos pode preparar consultas e telas enquanto PCP conclui as RPCs, sem ativar geração de pedidos;
- Qualidade pode preparar planos e catálogos enquanto Recebimento e Produção são implementados;
- Expedição pode preparar seu modelo de leitura após o contrato de produto acabado estar estável.

Não paralelizar:

- baseline e migrations estruturais concorrentes;
- publicação de roteiro e criação de OF antes do contrato de versão;
- reserva e consumo por equipes diferentes sem um único contrato transacional;
- Produção antes do fechamento de OF/OP e materiais;
- Centrais antes da estabilização das fontes transacionais.

## 10. Primeiro fluxo industrial operacional

O caminho mais curto deve ser um corte vertical, não vários módulos incompletos:

```text
Cliente real
→ Projeto real
→ PN existente
→ Roteiro publicado com um material e uma operação
→ OF
→ Necessidade
→ Decisão PCP
→ Reserva total ou Requisição
→ Recebimento simples quando houver compra
→ Consumo da reserva
→ Conclusão da operação e OF
```

Esse corte deve cobrir três cenários:

1. saldo suficiente;
2. saldo parcial;
3. saldo inexistente.

Ele será o primeiro marco de valor porque valida Engenharia, PCP, Estoque e Compras sem depender de Centrais ou automações avançadas.

## 11. Checklist completo

### Gate e banco

- [ ] Documentos normativos disponibilizados.
- [ ] Matriz de rastreabilidade normativa.
- [ ] Inventário do banco remoto.
- [ ] Baseline reproduzível.
- [ ] Backup e restauração testados.
- [ ] Migrations duplicadas tratadas.
- [ ] Ordem de dependências corrigida.
- [ ] Funções antigas e overloads inventariados.
- [ ] RLS e grants auditados.

### Fundação

- [ ] Empresas e usuários.
- [ ] Isolamento multiempresa.
- [ ] Numeração.
- [ ] Classificações oficiais.
- [ ] Clientes.
- [ ] Fornecedores.
- [ ] Colaboradores.
- [ ] Grupos de tecnologias.
- [ ] Tecnologias.
- [ ] Recursos produtivos.
- [ ] Materiais e itens industriais.

### Comercial e Engenharia

- [ ] Projetos.
- [ ] Itens de projeto.
- [ ] PN.
- [ ] BOM.
- [ ] Itens de BOM.
- [ ] Roteiros.
- [ ] Materiais de roteiro.
- [ ] Operações.
- [ ] Relação operação/material.
- [ ] Publicação e versionamento.
- [ ] Documentos técnicos.

### PCP e Estoque

- [ ] OF.
- [ ] Snapshot técnico da OF.
- [ ] Necessidades de materiais.
- [ ] Decisão PCP.
- [ ] Reserva de estoque.
- [ ] Eventos de reserva.
- [ ] Liberação de reserva.
- [ ] Consumo físico.
- [ ] Cancelamento transacional.
- [ ] Saldos e movimentações reconciliados.

### Suprimentos

- [ ] Requisições.
- [ ] Itens de requisição.
- [ ] Planejamento de compras.
- [ ] Origens de planejamento.
- [ ] Consolidação industrial.
- [ ] Decisão do comprador.
- [ ] Pedidos de compra.
- [ ] Itens de pedido.
- [ ] Rastreabilidade até OF e Projeto.

### Recebimento e Qualidade

- [ ] Recebimento físico.
- [ ] Conferência documental.
- [ ] Inspeção de entrada.
- [ ] Divergências.
- [ ] Liberação para estoque.
- [ ] Recebimento parcial.
- [ ] Inspeção em processo.
- [ ] Inspeção final.
- [ ] Não conformidades.
- [ ] Disposição e retrabalho.

### Produção

- [ ] Operações de OF.
- [ ] Filas operacionais.
- [ ] Início, pausa, retomada e conclusão.
- [ ] Apontamentos.
- [ ] Consumo de materiais.
- [ ] Paradas.
- [ ] Perdas conforme contrato.
- [ ] Conclusão de OF.
- [ ] Produto acabado.

### Expedição e Centrais

- [ ] Produto liberado para expedição.
- [ ] Preparação e conferência.
- [ ] Expedição parcial e total.
- [ ] Entrega.
- [ ] Central Nexus.
- [ ] Central de Operações.
- [ ] Indicadores rastreáveis.
- [ ] APIs de integração.
- [ ] Eventos e recuperação.
- [ ] Fluxo ponta a ponta validado.

## 12. Recomendações do Arquiteto-Chefe

### Maior dificuldade técnica

Migrar o banco atual e implantar o eixo OF → Necessidade → Decisão → Reserva/Requisição sem duplicar efeitos, perder rastreabilidade ou corromper saldos existentes.

### Fase que merece maior atenção

Fase 5 — PCP, OF e decisão de materiais. Ela concentra concorrência, idempotência, estados, estoque, compras e cancelamentos. Um erro nessa fase se propaga por todo o fluxo industrial.

### Paralelização

Cadastros, preparação de testes, Qualidade e protótipos de interface podem ser paralelizados dentro dos limites definidos. Banco estrutural, versionamento técnico, reservas e consumo devem permanecer sob coordenação única.

### Redução de retrabalho

- implementar cortes verticais pequenos;
- exigir rastreabilidade normativa em cada entrega;
- estabilizar banco e RPC antes da interface;
- preservar versões publicadas e históricos;
- testar migrations sobre dados representativos;
- impedir regras duplicadas em diferentes consumidores;
- adiar Centrais até os dados transacionais estarem estáveis.

### Estratégia para o primeiro fluxo funcionando

Entregar primeiro um único PN com roteiro publicado, uma OF, um material e uma operação, validando os cenários de estoque total, parcial e zero. Depois ampliar variedade e volume sem mudar o contrato.

## 13. Autorização de execução do plano

O Plano Diretor pode ser adotado imediatamente como guia de preparação. O desenvolvimento definitivo da primeira fase de banco somente deve começar após a conclusão do Gate Normativo da Fase 0 e do inventário/backup inicial da Fase 1.

Essa condição não reabre a Arquitetura 1.0. Ela garante que a implementação seja fiel, reproduzível e recuperável.
