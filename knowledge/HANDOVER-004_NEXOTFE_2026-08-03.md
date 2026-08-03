# HANDOVER-004 — NEXOTFE — 2026-08-03

**Status do push:** feito. `origin/main` == `62f03c2112539765b3a4441e7395d378048ff2c6`,
confirmado por `git fetch` + `git rev-parse`. Deploy Vercel `success`
(GitHub Commit Status API), homepage de produção
`https://sistema-producao-woad.vercel.app/` respondendo HTTP 200 com o
conteúdo real da tela de login.

---

## 1. O que foi feito nesta sessão (2026-08-03) — fecha a Entrega 2

Entrega 2 (distribuição parcial de capacidade entre recursos
compatíveis, PAD-008 §19, DEC-004) implementada em 3 fases, 3 commits:

### 1.1 Fase 1 — schema (commit `70d5f61f66775b42ba4ce11d7a4533d48886aaa8`)

Migration `202608020001_simulacao_comercial_distribuicao_parcial.sql`
aplicada e verificada por leitura read-only contra o banco remoto.
Adiciona: `versao_resultado_motor` em `simulacao_comercial_itens` (1 =
legado, 2 = novo); tabela `simulacao_comercial_item_distribuicoes` (0..N
linhas por item, FKs compostas por `(id, empresa_id)`, RLS, índice em
`recurso_id`); trigger `trg_projetos_validar_pedido_recebido`;
`calcular_comprometido_v2` (corrige forma — soma via tabela filha,
UNION legado/novo — e regra de negócio — só `pedido_recebido`
compromete capacidade); `aprovar_projeto_com_simulacao_v4`
(`SECURITY DEFINER`, aditiva, v1-v3 preservadas intactas). Bug de
sintaxe SQL real (apóstrofo fechando string prematuramente) encontrado
só na aplicação real, corrigido antes de reaplicar.

### 1.2 Fase 2 — núcleo, leitura dupla, adaptador temporário v3 (commit `cbc9a718177be90b90b913bf3dcb2813e90d32f6`)

Núcleo de distribuição sequencial (`motorAvaliacaoSequencial.ts`):
consome candidatos (original primeiro, depois compatíveis por
prioridade) via `Math.min(disponível, restante)`, saldo compartilhado
entre operações da mesma simulação. `EPSILON_HORAS = 0.000001`
(`constantesNumericas.ts`) — primeira convenção de tolerância numérica
do projeto. Leitura dupla de snapshots (`carregarSnapshotPersistido.ts`)
com validação de consistência estrutural
(`SnapshotInconsistenteError`) e ordenação determinística. Ponte
temporária `adaptarParaV3.ts` para persistir via RPC v3 enquanto a v4
não entrava em uso (representa só déficit total ou atendimento 100% por
1 recurso — rejeita explicitamente distribuição parcial real).

### 1.3 Fase 3 — ativação da RPC v4 nativa (commit `62f03c2112539765b3a4441e7395d378048ff2c6`)

`aprovarSimulacaoComercialAction.ts` passa a chamar
`aprovar_projeto_com_simulacao_v4` diretamente
(`montarPayloadV4.ts`, mapeamento puro e testado, 0..N distribuições
por operação). `adaptarParaV3.ts`/`.test.ts` removidos por completo.
Correção incluída: exibição da "Data de Necessidade" na tela de
Simulação Comercial Aprovada usava `new Date(...).toLocaleDateString()`
sobre uma data `YYYY-MM-DD` sem hora — interpretada como UTC meia-noite
e exibida um dia antes em fuso negativo (BR); trocado pelo helper local
`formatarDataBr` (só split de string), já usado pelas outras datas do
mesmo bloco.

### 1.4 Teste ponta a ponta real (projeto de teste `260009`, não `260008`)

Servidor local rodando contra o Supabase remoto real, dirigido por
automação de navegador, logado como usuário real (Flavio Castro /
ENIFER), autorização explícita por escrita:

1. Fixture: produto `ZTESTE-SIMCAP-002`, BOM rascunho, 1 operação
   (OP10, 60 min, recurso original FCNC-003 CNC 500).
2. Projeto `260009` ("TESTE E2E Fase 3 - Distribuição Parcial
   (excluir)"), cliente CEBRACE CRISTAL PLANO LTDA, item com
   quantidade 120 (carga padrão total: 120 horas).
3. Preview (sem persistência): janela comercial derivada confirmada
   (chegada prevista 21/08/2026, disponibilidade 24/08/2026, prazo
   interno 01/09/2026) e distribuição prevista conferida contra cálculo
   manual antes de clicar "Simular".
4. Aprovação real via RPC v4: snapshot `19c364ad-6a0b-45c6-9ad9-a1c81c9cd756`
   persistido — 1 item (`versao_resultado_motor = 2`), 3 distribuições
   (FCNC-003 original 52,36h; FCNC-002 compatível prioridade 1 52,36h;
   FCNC-004 compatível prioridade 2 15,28h; produtividade 85% nas três;
   soma 120h; déficit zero).
5. Replay controlado de idempotência: mesma chave e mesmo hash
   reenviados à RPC — retornou o mesmo ID, sem duplicar snapshot, item
   ou distribuição; nenhum valor ou timestamp de negócio alterado.
6. Confirmado: projeto permaneceu `situacao_comercial = consulta`
   durante todo o teste — não compromete capacidade de nenhum recurso
   (`calcular_comprometido_v2` só conta `pedido_recebido`). Snapshot
   legado do projeto `260008` (Entrega 1, `versao_resultado_motor = 1`)
   continua legível sem alteração.

### 1.5 Auditoria final e commit

Auditoria de uma rodada cobrindo: troca v3→v4 completa; no fluxo ativo
de aprovação da Simulação Comercial, a única RPC de persistência
chamada é `aprovar_projeto_com_simulacao_v4`; não permanece chamada
ativa à v3 nesse fluxo; payload construído exclusivamente do resultado
recalculado no servidor (nunca do payload do navegador — confirmado por
leitura de `orquestrarAprovacaoAutoritativa.ts:248`); comparação
cliente×servidor cobrindo os 10 campos de cada distribuição; isolamento
de tenant (RPC resolve `empresa_id` só de `p_aprovado_por`, valida cada
entidade referenciada contra essa empresa); ausência de segredo no
bundle client (`grep` em `.next/static` — zero ocorrências de
`SUPABASE_SERVICE_ROLE_KEY`, `service_role`, nomes de RPC de aprovação,
fragmentos `eyJ...`); compatibilidade de leitura de snapshots v1/v2;
TypeScript limpo; 106 testes passando (suíte completa); lint limpo;
build de produção limpo.

**Commit único realizado:** `62f03c2112539765b3a4441e7395d378048ff2c6`
— `feat(simulacao-comercial): ativa persistencia nativa da distribuicao
parcial` — 8 arquivos, 302 inserções / 309 deleções. Push autorizado
separadamente, depois de confirmação explícita de que a credencial de
Production da Vercel (antes bloqueada, HTTP 401) havia sido corrigida.
Deploy confirmado `success`, homepage respondendo.

## 2. Limitações conhecidas (não corrigidas por esta entrega)

- **Concorrência entre duas aprovações simultâneas diferentes**: o
  índice único parcial `simulacoes_comerciais_vigente_unico`
  (`(projeto_id) where vigente = true`, migration `202607190006`)
  garante, a nível de banco, que nunca existe mais de uma linha vigente
  por projeto — não há corrupção de dado nem duplicação. Mas a RPC v4
  não serializa duas aprovações concorrentes reais (chaves de
  idempotência diferentes): ambas podem persistir com sucesso, e a
  última sobrescreve silenciosamente a vigência da anterior, sem aviso
  a nenhum dos dois usuários. **Não se afirma atomicidade completa.**
  Herdada de v2/v3, não introduzida por esta entrega, não corrigida por
  ela.
- **Autorização por cargo** continua ausente em todas as RPCs de
  aprovação (v1-v4) — só pertencimento à empresa é verificado.
- **N+1 pré-existente em `prepararEntradasMotor.ts`** (registrado desde
  `HANDOVER-003`, fora do escopo da Entrega 1): o loop de resolução de
  capacidade/produtividade/comprometido por recurso ainda faz 3
  chamadas sequenciais por recurso, não batchadas. Não corrigido por
  esta entrega.
- Duplicação de schema entre 4 representações paralelas do mesmo
  formato de distribuição (validação, tipo de domínio, payload v4, hash
  canônico) — tradeoff aceito conscientemente para não adicionar `zod`
  como dependência nova.

## 3. Pendências documentais fechadas nesta sessão

- `PAD-008_Motor_Capacidade.md` (v2.0 → v2.1) — seção 19 reescrita de
  "decisão aprovada, pendente" para "implementado"; nomenclatura do
  contrato §19.3 corrigida para os nomes reais de campo; seções 1, 2,
  4, 6, 6.2, 8, 9, 11, 13, 16, 20, 21, 22 atualizadas onde citavam a
  distribuição parcial ou a RPC v3 como estado presente/futuro
  incorreto.
- `DEC-004_Simulacao_Comercial.md` (v1.1 → v1.2) — seções
  "Disponibilidade provisória de material" e "Distribuição analítica
  entre recursos compatíveis" corrigidas de "pendente de implementação"
  para "implementado".

## 4. Pendência documental identificada, não fechada nesta sessão

- `DEC-002_Aprovacao_Simulacao_Comercial.md` (linha 43) ainda cita
  `recurso_considerado_id`/`motivo_consideracao` como o critério
  técnico de revalidação — desatualizado desde a Entrega 2 (o critério
  real agora compara `distribuicoes[]` completo, ver PAD-008 §13/§19.3).
  Fora do escopo desta sessão (não solicitado).
- `src/modules/recursos/components/CompatibilidadeRecursos.tsx:51-53`
  — texto de ajuda ao usuário ("...tentará os recursos abaixo, nesta
  ordem") descreve linguagem de substituição sequencial, não de
  distribuição/compartilhamento simultâneo. Achado de copy de produto,
  não corrigido nesta sessão (fora do pedido).

## 5. Próximas entregas futuras (registradas, não implementadas)

- Horas extras.
- Terceirização.
- Geração e comparação de múltiplos cenários comerciais.
- Integração real com Compras e Estoque (substituição dos 9 dias fixos
  de material por dado real do fluxo de requisição/cotação/pedido).
- PCP e Produção operacionais.
- Reprogramação dinâmica após cada OP concluída dentro das Ordens de
  Fabricação — o sistema recalculará continuamente a programação
  conforme cada Operação (OP) for concluída dentro de uma OF; o PCP
  atuará por exceção, intervindo apenas quando houver risco identificado
  ao prazo final.
- Autorização por cargo na aprovação (se ainda não existir por outra via).
- Calculador reverso baseado em capacidade diária / Data de Início
  Necessária (PAD-008 §18) — decisão de negócio já aprovada, algoritmo
  ainda sem desenho.
- Correção de outros pontos frágeis de formatação de datas fora da tela
  de Simulação Comercial Aprovada (candidatos identificados em auditoria
  anterior desta sessão: `ProjectDetailsPageContent.tsx:41`,
  `src/app/projetos/page.tsx:15`, `src/app/proposta-comercial/page.tsx:31`,
  `src/app/projeto/page.tsx:35`, `src/app/ordens/[id]/page.tsx:116`).

## 6. Onde retomar

Nenhuma decisão de código pendente desta entrega. Próximo passo é
escolha de negócio: qual item da seção 5 acima vira a próxima entrega,
com plano prévio (Regra de Processo 2) antes de qualquer código.
