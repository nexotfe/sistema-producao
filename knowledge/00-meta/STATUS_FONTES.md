# Status das Fontes — Base de Conhecimento NEXOTFE

**Fase:** 0 — classificação read-only. Nenhum arquivo foi movido, mesclado ou apagado.

## Legenda

| Status | Significado |
|---|---|
| **Vigente** | Fonte confiável hoje. Pode fundamentar decisão diretamente. |
| **Histórico** | Fase concluída ou superada. Só como registro — nunca como base de decisão sem confirmar contra o vigente correspondente. |
| **Ambíguo** | Contradiz outro documento vigente em algum ponto específico, ou contém regra que não foi confirmada em nenhum outro lugar. Não fundamentar decisão sobre o ponto em questão sem confirmação do usuário. |
| **Candidato a fusão** | Sobrepõe conteúdo com outro documento do mesmo tema. Conteúdo é válido, mas a fusão em si é uma decisão de execução, não desta fase. |
| **Desatualizado confirmado** | Divergência confirmada por investigação direta em código/migrations/Git (fato verificável, não suposição). |

> ⚠️ **Regra:** documentos marcados **Histórico** ou **Ambíguo** nunca fundamentam sozinhos uma decisão de
> arquitetura, dado ou implementação. Sempre confirmar contra o documento **Vigente** correspondente listado
> em `knowledge/00-meta/INDICE.md`, ou perguntar ao usuário.

---

## Decisões já registradas nesta fase (não são mais perguntas abertas)

1. **Tipos de projeto oficiais**: confirmados contra o CHECK constraint real do banco
   (`supabase/migrations/202607080006_projetos_status_tipo_checks.sql:24`) — são exatamente **quatro**:
   `fabricacao`, `desenvolvimento`, `industrializacao`, `servico`. **"Revenda" não é tipo oficial.**
   `knowledge/livro-arquitetura-funcional/04 - PADRÃO OFICIAL.md` está correto neste ponto;
   `PADRÃO OFICIAL DE CLASSIFICAÇÕES DO NEXOTFE` (variante) está incorreto neste ponto específico.
2. **Homologação por rota (`docs/HOMOLOGACAO_OPERACIONAL_NEXOTFE_1_0.md`) e por módulo
   (`knowledge/STATUS_HOMOLOGACAO_NEXOTFE_1_0.md`) permanecem documentos separados** — granularidades
   intencionalmente diferentes, não é duplicação a mesclar.
3. **`PRODUCT.md` e `knowledge/01-MANIFESTO-NEXOTFE.md` permanecem documentos separados e interligados** —
   o Manifesto é a filosofia em prosa livre; PRODUCT.md é a operacionalização estruturada. Não fundir.
4. **Plano Diretor/Executivo da raiz vs os homônimos do livro (06/07)**: investigado contra Git e o índice
   normativo — não são duplicatas. `INDICE_NORMATIVO_NEXOTFE_1_0.md:16-17,25-26` já cataloga os dois como
   níveis diferentes (livro = "v1.0 congelada", raiz = "detalhado"). As 12 fases do plano da raiz batem com
   os grupos reais de migrations já aplicadas. Raiz = **Vigente**; livro 06/07 = **Histórico** (baseline
   congelada, não usar para planejar trabalho corrente).
5. **`ESTUDO_TECNICO_001.md`**: investigado contra as 134 migrations reais aplicadas — as 4 tabelas do
   contrato (`roteiros_fabricacao`, `necessidades_materiais`, `decisoes_necessidade_material`,
   `reservas_estoque`) não existem em nenhuma migration real (só em `supabase/baseline/`, nunca implantado).
   A necessidade de negócio foi resolvida com outro desenho (`processar_necessidade_material()`,
   `requisicoes_compra`, views de decisão de material). Status: **Desatualizado confirmado**.
   *Achado colateral fora do escopo desta tarefa*: `src/app/pcp/programacao-diaria/page.tsx:138` consulta
   `.from("necessidades_materiais")` — tabela que não existe em nenhuma migration real aplicada. Não foi
   corrigido aqui (fora do pedido); recomendo investigação separada.
6. **ADR-004/005/006**: investigados contra código e Git — status documental "Em revisão" desde 2026-06-14
   nunca foi atualizado, mas as decisões já foram implementadas de fato (`src/app/central/`,
   `src/app/projetos/` ativos, `src/app/page.tsx:49` confirma `router.push("/central")` como destino
   pós-login, commits recentes evoluindo `/central`). Status: **Desatualizado confirmado** (o conteúdo da
   decisão está correto; só o campo Status do documento está errado).
7. **"PN" vs. "Código" — fechada em 2026-08-07 por instrução direta do usuário.** Deixou de ser nota aberta:
   interface, pesquisas e mensagens usam exclusivamente "Código"; "PN" é legado técnico. A coluna física
   `projeto_itens.pn` e rotas com segmento `[pn]` **não são renomeadas agora** (decisão de nomenclatura de
   interface, não de schema). Registrado em `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` item 6.
   `src/modules/projetos/README.md` corrigido na mesma sessão (ver linha própria abaixo).
8. **Gap de `excluir_bom` fechado.** O teste de roteador de 2026-08-07 (pergunta "regras de exclusão lógica
   de roteiro") expôs que a migration mais recente sobre o tema (`202608060002_excluir_bom_logico.sql`,
   2026-08-06) não tinha nenhum documento correspondente indexado — o agente de teste precisou cair para
   Grep amplo. Fechado com `knowledge/arquitetura-tecnica/DEC-005_Exclusao_Logica_Roteiro.md` (novo) e
   entradas em `INDICE.md` nas seções "02 · Roteiros/BOM" e "05 · Banco".

## Regra de fallback (adicionada em 2026-08-07)

Para comportamento **implementado recentemente**, migrations reais (`supabase/migrations/`) e código
vigente (`src/modules/`, `src/app/`) prevalecem sobre documentação desatualizada — a mesma lógica que
resolveu as decisões #5, #6 e #8 acima. Ver a seção equivalente em `CLAUDE.md`/`AGENTS.md` (router).

## Decisões mantidas em aberto (fora do escopo desta fase — aguardando você)

- **Ordem PCP × Compras no fluxo macro** — `docs/FUNDACAO_ARQUITETURA_SISTEMA_NEXOTFE_1_0.md:133-157`
  (Compras depois do PCP) diverge de `docs/ARQUITETURA_OPERACIONAL_PCP_NEXOTFE.md:28-52` (Compras antes do
  PCP, com Qualidade no meio).
- **Terminologia de Recebimento** — "Conferência Documental / Liberado" vs "Conferência Fiscal / Liberado
  para Estoque", divergente entre os pares do livro e o `Capítulo 03 Recebimento`.

---

## 00 · Meta / Governança

| Documento | Status | Nota |
|---|---|---|
| `CLAUDE.md` | Vigente | — |
| `AGENTS.md` | Vigente | — |
| `README.md` (raiz) | Desatualizado confirmado | Vazio, só o título |
| `knowledge/README.md` | Desatualizado confirmado | Referencia pastas `modulos/`, `diagramas/`, `templates/`, `anexos/` que não existem no repositório |
| `knowledge/01-MANIFESTO-NEXOTFE.md` | Vigente | Ver decisão #3 |
| `knowledge/02-METODO NEXUS.MD` | Vigente | — |
| `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` | Vigente | Precedência máxima (Regra 6 do CLAUDE.md) |
| `knowledge/BASELINE_NEXOTFE_1_0.md` | Vigente | Nome parecido com o Operacional, mas escopo distinto (precedência normativa de banco) |
| `knowledge/BASELINE_OPERACIONAL_NEXOTFE_1_0.md` | Vigente | Escopo funcional/UX, distinto do anterior |
| `knowledge/VERSOES_OFICIAIS.md` | Vigente | — |
| `knowledge/PADROES_DESENVOLVIMENTO_NEXOTFE_1_0.md` | Vigente | — |
| `knowledge/ARQUITETURA_ENTIDADES_NEXOTFE_1_0.md` | Vigente | — |
| `knowledge/livro-arquitetura-funcional/INDICE_NORMATIVO_NEXOTFE_1_0.md` | Vigente | — |
| `knowledge/livro-arquitetura-funcional/MANIFESTO_BASELINE_NORMATIVO_NEXOTFE_1_0.md` | Histórico | Hashes de integridade de uma foto congelada de 20/06; não revalidado após `CONSOLIDACAO_VIGENTE` alterar conteúdo normativo |
| `knowledge/livro-arquitetura-funcional/MATRIZ_RASTREABILIDADE_NORMATIVA_NEXOTFE_1_0.md` | Vigente | — |
| `knowledge/livro-arquitetura-funcional/MILESTONE_01_ARQUITETURA_NEXOTFE_1_0_CONGELADA.md` | Histórico | Marco de congelamento pontual (19/06) |
| `knowledge/STATUS_HOMOLOGACAO_NEXOTFE_1_0.md` | Ambíguo | Provável desatualização frente às entregas de jul/ago — não investigado linha a linha; permanece documento separado (decisão #2) |
| `knowledge/REGISTRO_PRONTIDAO_SPRINT_01.md` | Histórico | Sprint encerrada |
| `knowledge/SPRINT_02_INVENTARIO_MIGRATIONS.md` | Histórico | — |
| `knowledge/SPRINT_02_AUDITORIA_MIGRATIONS_INICIAL.md` | Histórico | — |
| `knowledge/SPRINT_02_BLOQUEIOS_E_RECOMENDACOES.md` | Histórico | — |
| `knowledge/SPRINT_02_BASELINE_SANEAMENTO.md` | Histórico | Nunca teve documento de encerramento formal |
| `knowledge/SPRINT_03_BASELINE_SQL.md` | Histórico | Schema abandonado (ver decisão #5) |
| `knowledge/SPRINT_03_MAPA_ESQUEMA_DEFINITIVO.md` | Histórico | Schema abandonado (ver decisão #5) |
| `knowledge/AUDITORIA_COMPLETA_MIGRATIONS_NEXOTFE.md` | Histórico | — |
| `knowledge/AUDITORIA_COMPLETA_POLICIES_RLS.md` | Histórico | Verificar se achados críticos de RLS já foram corrigidos antes de descartar |
| `knowledge/AUDITORIA_FUNCOES_SECURITY_DEFINER.md` | Histórico | — |
| `knowledge/COMPARACAO_BANCO_RESTAURADO_ARQUITETURA_NEXOTFE_1_0.md` | Histórico | — |
| `knowledge/CATALOGO_BANCO_RESTAURADO/` (README + CSVs) | Histórico | Evidência tabular da auditoria de banco de jun/2026 |
| `knowledge/AUDITORIA_MIGRATIONS/*.csv`, `AUDITORIA_RLS_*.csv`, `AUDITORIA_SECURITY_DEFINER_FUNCOES.csv`, `COMPARACAO_*.csv`, `SPRINT_03_CLASSIFICACAO_OBJETOS*.csv`, `BASELINE_NEXOTFE_1_0_MANIFESTO.csv`, `BASELINE_NEXOTFE_1_0.sha256` | Histórico | Evidência tabular da mesma auditoria pontual |
| `knowledge/BACKUP_E_RECUPERACAO.md` | Vigente | — |
| `knowledge/TROUBLESHOOTING.md` | Vigente | — |
| `knowledge/SETUP_WINDOWS.md` | Vigente | — |
| `supabase/baseline/README.md` + `supabase/baseline/tests/*.md` (15) | Histórico | Validado tecnicamente, mas nunca aplicado ao remoto |
| `knowledge/HANDOVER_NEXOTFE_2026-07-27.md` | Histórico | — |
| `knowledge/HANDOVER-002_NEXOTFE_2026-07-29.md` | Histórico | — |
| `knowledge/HANDOVER-003_NEXOTFE_2026-08-02.md` | Histórico | — |
| `knowledge/HANDOVER-004_NEXOTFE_2026-08-03.md` | Histórico | Contém pendência viva (DEC-002 desatualizado) não promovida a documento formal |
| `src/modules/compras/README.md` | Desatualizado confirmado | Escopo real do módulo já é maior que o descrito |
| `src/modules/estoque/README.md` | Desatualizado confirmado | Idem |
| `src/modules/projetos/README.md` | Vigente | Corrigido em 2026-08-07 — usa "Código", cita "PN" só como legado da coluna física `projeto_itens.pn` (ver `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` item 6) |

## 01 · Produto

| Documento | Status | Nota |
|---|---|---|
| `PRODUCT.md` | Vigente | Ver decisão #3 |
| `DESIGN.md` | Vigente | Fonte mais atual/granular de UX |
| `docs/DIRETRIZ_VISUAL_UX_NEXOTFE.md` | Ambíguo | Contradiz `DESIGN.md` sobre navegação (menu lateral fixo vs "não existe shell global") — `DESIGN.md` prevalece na prática, mas este documento não foi corrigido nem arquivado |
| `docs/PADRAO_NAVEGACAO_NEXUS.md` | Vigente | Complementar, sem contradição detectada |
| `knowledge/arquitetura-tecnica/PAD-006_Sistema_de_Temas.md` | Vigente | Arquitetura aprovada; implementação pendente é reconhecida no próprio documento |
| `knowledge/arquitetura-tecnica/PAD-007_Design_System_Base.md` | Ambíguo | Referencia "PAD-008 (Componentes Compartilhados)" que não existe — o PAD-008 real é outro tema (Motor de Capacidade) |
| `knowledge/livro-arquitetura-funcional/05 - DICIONÁRIO INDUSTRIAL.md` | Candidato a fusão | Par com a variante abaixo |
| `knowledge/livro-arquitetura-funcional/DICIONÁRIO INDUSTRIAL DO NEXOTFE` | Candidato a fusão | Tem verbetes extras ("Projeto Comercial/Industrial") que faltam no numerado |
| `knowledge/livro-arquitetura-funcional/03 - ESTADOS OFICIAIS Estados.md` | Ambíguo | Diverge do par quanto à terminologia de Recebimento (decisão em aberto) |
| `knowledge/livro-arquitetura-funcional/ESTADOS OFICIAIS DO NEXOTFE` | Ambíguo | Idem; tem seção extra "Decisão do PCP" que falta no numerado |
| `knowledge/livro-arquitetura-funcional/04 - PADRÃO OFICIAL.md` | Vigente (Tipo de Projeto) / Candidato a fusão (restante) | Ver decisão #1 |
| `knowledge/livro-arquitetura-funcional/PADRÃO OFICIAL DE CLASSIFICAÇÕES DO NEXOTFE` | Desatualizado confirmado | Lista "Revenda" como 5º tipo — ver decisão #1 |

## 02 · Roteiros / BOM

| Documento | Status | Nota |
|---|---|---|
| `knowledge/livro-arquitetura-funcional/ESTUDO 007 Cadastro Inteligente de Materiais` | Vigente | — |
| `knowledge/livro-arquitetura-funcional/Capítulo 02 Cadastro de Tecnologias` | Vigente | — |
| `knowledge/livro-arquitetura-funcional/Capítulo 03 Grupos de Tecnologias` | Vigente | — |
| `knowledge/livro-arquitetura-funcional/Capítulo 04 Cadastro de Recursos Produtivos` | Vigente | — |
| `knowledge/livro-arquitetura-funcional/Capítulo 05 Capacidade Operacional` | Vigente | — |
| `knowledge/livro-arquitetura-funcional/ESTUDO 002 Arquitetura Funcional das Ordens de Fabricação e Operações` | Vigente | — |
| `knowledge/arquitetura-tecnica/2026-07-15-arquitetura-roteiro-desenvolvimento-v2.md` | Candidato a fusão | Duplicado literalmente dentro de `knowledge/arquitetura-tecnica/ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md` §15 |
| `knowledge/discussoes/2026-06-28-grupos e of operacionais.md` | Ambíguo | Regra real ("OF Operacional"/rateio de custo) sem réplica formal em nenhum outro documento — não descartar sem extrair |
| `knowledge/discussoes/2026-06-28-flexibilidade operacional.md` | Ambíguo | Mesma regra do item acima (divisão de autoridade PCP × Liderança de Produção) |

## 03 · Projetos / Orçamento

| Documento | Status | Nota |
|---|---|---|
| `knowledge/livro-arquitetura-funcional/01-ORCAMENTO` | Vigente | Nome de arquivo não reflete o conteúdo (é o capítulo "Ciclo de Vida do Projeto Industrial") |
| `knowledge/arquitetura-tecnica/DEC-001_Desconto_Comercial_Orcamento.md` | Vigente | — |
| `knowledge/decisoes/ADR-006-projetos-rota-listagem.md` | Desatualizado confirmado | Ver decisão #6 |
| `knowledge/discussoes/2026-06-28-orcamento.md` | Histórico | Regra "nº projeto único no sistema" já superada por `CONSOLIDACAO_VIGENTE` item 3 |

## 04 · Simulação Comercial

| Documento | Status | Nota |
|---|---|---|
| `knowledge/arquitetura-tecnica/ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md` | Ambíguo | Documento central, mas com 2 seções internas confirmadas obsoletas: §11.4/§14 ("Cenário de Demanda" nunca implementado) e §18.2/§18.5 (modelo de recurso único, já substituído por `distribuicoes[]` na Entrega 2) |
| `knowledge/arquitetura-tecnica/PAD-008_Motor_Capacidade.md` | Vigente | Hub técnico mais bem mantido do conjunto |
| `knowledge/arquitetura-tecnica/DEC-002_Aprovacao_Simulacao_Comercial.md` | Desatualizado confirmado | Campos legados `recurso_considerado_id`/`motivo_consideracao`, auto-identificado em PAD-008 §13 e HANDOVER-004 |
| `knowledge/arquitetura-tecnica/DEC-003_Status_Aprovado_Via_Simulacao.md` | Vigente | — |
| `knowledge/arquitetura-tecnica/DEC-004_Simulacao_Comercial.md` | Vigente | — |
| `knowledge/arquitetura-tecnica/2026-07-15-01-motor de simulacao.md` | Histórico | Substituído, nota de precedência explícita no documento vigente |
| `knowledge/arquitetura-tecnica/2026-07-15-Resumo das decisoes.md` | Histórico | Idem |
| `knowledge/arquitetura-tecnica/2026-07-15-arquitetura do calendario operacional.md` | Histórico | Idem |
| `knowledge/discussoes/2026-06-28-analise de viabilidade-sinulacao.md` | Histórico | Superado por PAD-008/DEC-004 |
| `knowledge/discussoes/2026-06-28-analise de viabilidade.md` | Histórico | Superado por DEC-002/DEC-003 |
| `knowledge/discussoes/2026-06-28-pagina analise de viabilidade.md` | Histórico | — |
| `knowledge/discussoes/2026-06-28-margem de seguranca.md` | Histórico | Evoluído em PAD-008 §17 |
| `knowledge/discussoes/2026-06-28-capacidade produtiva do colaborador.md` | Histórico | — |

## 05 · Banco

| Documento | Status | Nota |
|---|---|---|
| `knowledge/arquitetura-tecnica/PAD-004_Politica_Exclusao_Registros.md` | Vigente | — |
| `knowledge/arquitetura-tecnica/AUD-2026-07-19_Soft_Delete.md` | Histórico | Auditoria concluída, valor de registro reconhecido pelo próprio documento |
| `knowledge/arquitetura-tecnica/IMP-SoftDelete.md` | Vigente | Implementação de referência; aceita ficar levemente desatualizada por definição própria |
| `knowledge/arquitetura-tecnica/DEC-005_Exclusao_Logica_Roteiro.md` | Vigente | Especializa PAD-004 para Roteiro/BOM; aponta para `202608060002_excluir_bom_logico.sql` (2026-08-06) |
| `knowledge/arquitetura-tecnica/PAD-005_Seguranca_Functions_SQL.md` | Vigente | — |

## 06 · Operação

| Documento | Status | Nota |
|---|---|---|
| `docs/FUNDACAO_ARQUITETURA_SISTEMA_NEXOTFE_1_0.md` | Ambíguo | Fluxo geral diverge de `ARQUITETURA_OPERACIONAL_PCP` (decisão em aberto) |
| `docs/FUNDACAO_INDUSTRIAL_NEXOTFE.md` | Vigente | — |
| `docs/FUNDACAO_COMPRAS_NEXOTFE.md` | Vigente | — |
| `docs/ARQUITETURA_OPERACIONAL_PCP_NEXOTFE.md` | Ambíguo | Idem, mesma divergência |
| `knowledge/livro-arquitetura-funcional/PARTE V SUPRIMENTOS` | Vigente | Versão final, sem placeholders |
| `knowledge/livro-arquitetura-funcional/PARTE III — SUPRIMENTOS Capítulo 03` | Histórico | Rascunho de template com placeholders não preenchidos, superado por PARTE V |
| `knowledge/livro-arquitetura-funcional/PARTE VI PRODUÇÃO` | Candidato a fusão | Com "parte1", ~40% de conteúdo repetido |
| `knowledge/livro-arquitetura-funcional/PARTE VI PRODUÇÃO parte1` | Candidato a fusão | Idem |
| `knowledge/livro-arquitetura-funcional/PARTE VII ARQUITETURA DAS CENTRAIS` | Vigente | — |
| `knowledge/livro-arquitetura-funcional/ESTUDO 006 – Arquitetura de Navegação e Tomada de Decisão` | Vigente | — |
| `knowledge/livro-arquitetura-funcional/ESTUDO 008 — Planejamento Inteligente de Compras Status  🟢 Aprovado – Versão 1.0` | Vigente | Tem bloco interno de rascunho não removido (§ Complemento repete §6/§7) — não bloqueante |
| `knowledge/livro-arquitetura-funcional/ESTUDO 016 Central de Operações` | Vigente | — |
| `knowledge/livro-arquitetura-funcional/Capítulo 01 Requisição de Compra` | Vigente | — |
| `knowledge/livro-arquitetura-funcional/Capítulo 03 Recebimento` | Vigente | Fonte canônica sugerida de terminologia; decisão final de Recebimento ainda em aberto |
| `knowledge/livro-arquitetura-funcional/Capítulo 04 Gestão de Estoque` | Vigente | — |
| `docs/HOMOLOGACAO_OPERACIONAL_NEXOTFE_1_0.md` | Vigente | Ver decisão #2 |
| `knowledge/BASELINE_OPERACIONAL_NEXOTFE_1_0.md` | Vigente | — |
| `knowledge/decisoes/ADR-004-integracao-001.md` | Desatualizado confirmado | Ver decisão #6 |
| `knowledge/decisoes/ADR-005-central-nexus.md` | Desatualizado confirmado | Ver decisão #6 |
| `knowledge/discussoes/2026-01-07-arquitetura da estrutura heirarquica deprojeto.md` | Histórico | — |
| `knowledge/discussoes/2026-06-28-natureza operacionais.md` | Ambíguo | Tabela comparativa granular Natureza × módulo sem réplica formal completa em nenhum PAD/DEC/livro |
| `knowledge/discussoes/2026-06-28-necessidade de compras.md` | Histórico | Superado pelo Capítulo 01 Requisição de Compra |
| `knowledge/discussoes/2026-06-28-planejamento de compras.md` | Histórico | Superado pelo ESTUDO 008 |
| `knowledge/discussoes/2026-06-28-planejamento e programacao da producao.md` | Ambíguo | Fatores de produtividade 75/85/75% não confirmados em documento formal |
| `knowledge/discussoes/2026-06-28-principio de rastreabilidade.md` | Histórico | Princípio já presente na Introdução formal |
| `knowledge/discussoes/2026-06-28-programacao da producao.md` | Histórico | — |
| `knowledge/discussoes/2026-06-28-proposta conercial.md` | Histórico | Spec de feature, não regra de negócio crítica |
| `knowledge/discussoes/2026-06-28-fluxo` | Histórico | Duplicado do diagrama "Fluxo" do livro |
| `knowledge/discussoes/2026-06-29-cotacao e selecao de fornecedores.md` | Histórico | Coberto por PARTE V |
| `knowledge/discussoes/2026-06-29-pagina pedidos de compra.md` | Histórico | Coberto por PARTE V / Capítulo 01 |
| `knowledge/discussoes/2026-06-29-projeto origem.md` | Histórico | Substituído por `knowledge/01-MANIFESTO-NEXOTFE.md` |
| `knowledge/discussoes/2026-06-29-requisicao de compras.md` | Histórico | Coberto pelo Capítulo 01 |
| `knowledge/discussoes/2026-07-02- escrevevendo desde o inicio` | Histórico | Rascunho direto do "00 - INTRODUÇÃO.md" oficial |
| `knowledge/discussoes/2026-07-02-arrumanda as ideias.md` | Ambíguo | Contém lista de campos da página Projeto não confirmada em spec formal |
| `knowledge/discussoes/2026-07-02-prompt para enviar.md` | Histórico | — |
| `knowledge/discussoes/2026-07-06-auditoria e modificacao.md` | Ambíguo | `CONSOLIDACAO_VIGENTE` já reconhece parte deste arquivo como vigente; maior densidade de regras órfãs do lote (mapeamento tabela↔conceito, numeração OP, status Projeto, Resumo Operacional) |
| `knowledge/discussoes/prompt inicial` | Histórico | — |
| `knowledge/omboard/2026-05-07-HANDBOOK-001.md` a `-010` (9 arquivos) | Histórico | Onboarding de IA em inglês, mai/2026; papel hoje cumprido pelo CLAUDE.md. **HANDBOOK-010 contradiz a Regra 9 do CLAUDE.md atual** (instrui a evitar confirmação por escrita) — nunca formalmente revogado |
| `knowledge/omboard/2026-05-07-HANDBOOK-CLAUDE-011` | Ambíguo | `CONSOLIDACAO_VIGENTE` reconhece Decisions 1, 3, 4, 5 como ainda vigentes (só a Decision 2 foi superada); só existe em inglês, sem réplica formal em português |

## 07 · Setup / Ambiente

| Documento | Status | Nota |
|---|---|---|
| `knowledge/SETUP_WINDOWS.md` | Vigente | — |
| `knowledge/VERSOES_OFICIAIS.md` | Vigente | — |
| `knowledge/TROUBLESHOOTING.md` | Vigente | — |
| `knowledge/BACKUP_E_RECUPERACAO.md` | Vigente | — |

## Planos / Histórico geral

| Documento | Status | Nota |
|---|---|---|
| `PLANO_DIRETOR_IMPLEMENTACAO_NEXOTFE_1_0.md` | Vigente | Ver decisão #4 |
| `PLANO_EXECUTIVO_IMPLEMENTACAO_NEXOTFE_1_0.md` | Vigente | Ver decisão #4 |
| `knowledge/livro-arquitetura-funcional/06 - PLANO DIRETOR.md` | Histórico | Ver decisão #4 |
| `knowledge/livro-arquitetura-funcional/07 - PLANO EXECUTIVO.md` | Histórico | Ver decisão #4 |
| `ESTUDO_TECNICO_001.md` | Desatualizado confirmado | Ver decisão #5 |
| `knowledge/livro-arquitetura-funcional/00 - INTRODUÇÃO.md` | Vigente | Índice atual do livro |
| `knowledge/livro-arquitetura-funcional/00-INTRODUCAO-E-FILOSOFIA.MD` | Histórico | Estrutura de capítulos divergente da real, nunca realizada |
| `knowledge/livro-arquitetura-funcional/01 - ARQUITETURA GERAL.md` | Candidato a fusão | Par com a variante abaixo |
| `knowledge/livro-arquitetura-funcional/ARQUITETURA GERAL DO NEXOTFE` | Candidato a fusão | Tem seção extra "Camadas do Projeto/Supabase" que falta no numerado |
| `knowledge/livro-arquitetura-funcional/02 - ARQUITETURA DE DADOS .md` | Candidato a fusão | Par com a variante abaixo |
| `knowledge/livro-arquitetura-funcional/ARQUITETURA DE DADOS DO NEXOTFE` | Candidato a fusão | Tem seção extra "Regras Gerais" que falta no numerado |
| `knowledge/livro-arquitetura-funcional/99 - PRINCÍPIOS ARQUITETURAIS.md` | Vigente | Documento "constitucional", sem par duplicado |
| `knowledge/livro-arquitetura-funcional/Fluxo` | Histórico | Diagrama ASCII de baixo valor isolado, redundante com "01 - ARQUITETURA GERAL" |
| `knowledge/livro-arquitetura-funcional/Capítulo 01 Cadastro de Colaboradores` | Ambíguo | Conteúdo não confirmado com segurança na auditoria (erro de mapeamento em leitura paralela) — recomendo releitura isolada antes de classificar com confiança |
