# HANDOVER-003 — NEXOTFE — 2026-08-02

**Status do push:** NÃO feito. `git status -sb` mostra `main...origin/main
[ahead 4]` — 4 commits locais (incluindo o desta sessão) ainda não
publicados. Push é decisão separada, só com autorização explícita do
usuário (Regra de Processo) — nada nesta sessão empurrou nada para
`origin`.

---

## 1. O que foi feito nesta sessão (2026-08-02)

### 1.1 Migration `202608010001` — RPC v3 e colunas de janela comercial

Aplicada manualmente no SQL Editor e verificada nesta etapa, por
leitura read-only contra o banco remoto: colunas
`data_prevista_aprovacao_pedido`/`data_chegada_prevista` confirmadas
(`date`, nullable, sem default); função
`aprovar_projeto_com_simulacao_v3` confirmada com a assinatura completa
esperada, `SECURITY DEFINER`, `search_path` fixo, conteúdo funcional
idêntico ao arquivo local após normalização exclusiva das quebras de
linha CRLF/LF; ACL confirmada (`EXECUTE` só para `service_role`;
`authenticated`/`anon`/`PUBLIC` sem acesso); `aprovar_projeto_com_simulacao_v2`
confirmada intacta, sem alteração. A aplicação manual não passa pelo
tracking da CLI, o que deixou a migration ausente de
`supabase_migrations.schema_migrations` — corrigido nesta etapa com
`migration repair 202608010001 --status applied --linked`, executado
nesta sessão. Só `202608010001` ficou sincronizada por essa correção;
a divergência histórica de migrations mais antigas (já documentada em
`knowledge/TROUBLESHOOTING.md`) continua fora do escopo desta sessão,
sem alteração.

### 1.2 Teste ponta a ponta real da RPC v3 (não só leitura de código)

Servidor local (`npm run dev`) rodando contra o Supabase remoto real,
dirigido por automação de navegador (Playwright), logado como usuário
real (Flavio Castro / ENIFER), com autorização explícita e em separado
para cada escrita:

1. **Escrita 1** — criação do projeto de teste `260008` ("TESTE E2E
   Entrega 1 - Janela Comercial (excluir)"), empresa ENIFER, cliente
   CEBRACE CRISTAL PLANO LTDA, pela tela real `/projeto`.
2. **Escrita 2** — item do projeto adicionado pela tela real de
   Orçamento, produto-fixture `ZTESTE-SIMCAP-001` (roteiro desenhado
   para exercitar os 3 motivos de consideração do Motor: ORIGINAL,
   COMPATIBILIDADE, déficit total).
3. Testes de validação/preview (sem persistência): bloqueios de campo
   (Data Prevista vazia, Margem negativa/fracionária) confirmados; as
   3 datas derivadas (Chegada Prevista, Disponibilidade para Produção,
   Prazo Interno) conferidas contra cálculo manual do calendário real.
4. **Escrita 3** — aprovação real pela Server Action + RPC v3 (clique
   real em "Aprovar simulação" → "Aprovar com risco assumido", há
   déficit na 3ª operação de propósito). Snapshot e os 3 itens
   persistidos conferidos campo a campo contra o esperado; confirmado
   que `v2` não foi usada (as duas colunas novas só existem no payload
   da `v3`); confirmado snapshot único vigente, sem duplicação, nenhum
   outro projeto/empresa afetado.

Datas confirmadas (cenário real, calendário ENIFER, feriado de
07/09/2026 incluído): aprovação prevista 01/09/2026 → chegada prevista
15/09/2026 → disponibilidade para produção 16/09/2026; necessidade
01/10/2026, margem 2 dias produtivos → prazo interno 29/09/2026.

Projeto `260008` fica **aprovado e preservado como evidência deste
teste E2E** — pode ser usado depois para consultas e regressões
read-only (mesmo padrão do fixture `999999` já existente), mas **não
pode repetir diretamente um novo fluxo completo de aprovação**: como
já tem uma simulação vigente, a tela de Simulação cai direto no modo
somente-leitura (mesmo comportamento documentado para o `999999`) —
reaproveitar esse caminho de teste exigiria um reset indevido do
projeto ou a criação de outro projeto dedicado novo.

### 1.3 Correção de performance — N+1 no cálculo de calendário

Achado durante o teste E2E (item 1.2): o cálculo da janela levou
~1 minuto no navegador, por N+1 real em
`deslocarDiasProdutivos`/`resolverDiaProdutivo` (até 4 consultas ao
Supabase **por dia civil examinado** — 124 consultas no cenário real
medido). Corrigido em rodadas subsequentes, sem mudar nenhuma regra de
negócio nem data resultante:

- Novo módulo `contextoCalendario.ts`: carrega o calendário do
  intervalo inteiro em lote (até 4 consultas, não importa o tamanho do
  intervalo) e resolve os dias em memória. Única fonte da regra de
  precedência do calendário (Operacional → Oficial → Eventos) —
  `resolverDiaProdutivo.ts` virou um wrapper fino sobre ele.
- `prepararJanelaComercial.ts` compartilha **um único contexto** entre
  os 3 deslocamentos da janela e a contagem final de dias produtivos.
- Expansão automática e limitada quando a estimativa inicial não basta
  (calendário atípico) — nunca resultado incorreto, nunca "fora do
  contexto pré-carregado" numa entrada válida; limite defensivo
  (`MAX_DIAS_CIVIS_EXAMINADOS`) preservado.
- Paginação defensiva (`.range()`, lotes de 500) nas consultas de
  feriados/eventos — Supabase tem teto de linhas por resposta
  (`api.max_rows`) que truncaria em silêncio um intervalo muito grande
  sem isso. Ordenação determinística (`data` + `id`, a chave primária
  real das duas tabelas — `data` sozinha **não** é única em nenhuma das
  duas) garante que a paginação não omite nem duplica linha.

Resultado, confirmado contra o banco remoto real (não só mock): **4
consultas no cenário normal** (era 124), ~2-3s (era ~24s só no
preview). Consultas adicionais só acontecem quando há paginação
(intervalo com mais linhas de feriados/eventos do que cabe num lote) ou
expansão (calendário atípico, estimativa inicial insuficiente) — nos
dois casos o crescimento é por página/lote, nunca por dia civil
examinado. Mensagem pública de erro de `resolverDiaProdutivo` para data
inválida foi auditada e mantida byte-a-byte igual à anterior à
refatoração (contrato congelado em teste).

### 1.4 Auditoria final e commit

Auditoria de uma rodada cobrindo toda a Entrega 1 (não só a
otimização): segurança (RPC v3 — `SECURITY DEFINER`, `search_path`
fixo, grants, isolamento de tenant por `empresa_id` resolvido
server-side; achado positivo — a versão anterior desta Server Action
vazava `error.message` técnico ao cliente, corrigido nesta entrega),
fronteira client/server (segredo `service_role` confirmado isolado em
arquivo `server-only`, nunca importado por Client Component), N+1
restantes (nenhum dentro do escopo desta entrega), `.claude/` fora do
stage, ausência de credenciais/arquivos temporários no diff,
`package.json`/`package-lock.json` limpos (só a dependência `vitest`
adicionada).

**Commit único realizado:** `3da17b3dab459f460a5811ae168a2b3373a98f67`
— `feat(simulacao-comercial): implementa janela comercial derivada` —
22 arquivos, 5154 inserções / 530 deleções. 73 testes automatizados
passando, TypeScript limpo, build limpo, zero erro de lint novo (21
pré-existentes, fora do escopo desta entrega, inalterados). Árvore de
trabalho limpa depois do commit, exceto `.claude/` (nunca rastreado,
como sempre).

## 2. Pendências reais, em aberto

- **Push ainda não feito** (seção "Status do push" acima) — decisão
  separada, aguardando autorização explícita.
- **`arquitetura-tecnica/PAD-008_Motor_Capacidade.md`, seção 17, está desatualizada.** O
  cabeçalho da seção diz *"decisão aprovada, pendente de
  implementação"* e a linha de abertura diz *"Nada nesta seção está
  implementado"* — isso deixou de ser verdade nesta sessão (a Entrega 1
  implementou exatamente o fluxo de preparação comercial descrito ali:
  `deslocarDiasProdutivos`, Data Prevista de Aprovação do Pedido,
  Prazo Interno, disponibilidade de material). **Não foi corrigido
  nesta sessão** — só a criação deste HANDOVER foi pedida. Atualizar
  o PAD-008 (marcar a seção 17 como implementada, referenciando este
  commit) é uma tarefa pequena e separada, pendente.
- **Seção 19 do PAD-008 (Distribuição parcial entre recursos
  compatíveis) é a próxima entrega funcional**, conforme definido pelo
  usuário para esta sessão — contrato **já fechado**, sem pergunta em
  aberto (`DistribuicaoRecurso`, `ItemResultadoMotor` novos, regras de
  consistência aritmética, critério de revalidação, hash de
  solicitação — tudo em PAD-008 §19.3). Exemplo de referência do
  próprio PAD-008 (§19.2), citado pelo usuário para abrir a próxima
  sessão: necessidade de 200h, Torno 1 (original) consome 140h, Torno 2
  (compatível prioridade 1) consome 40h, Torno 3 (compatível prioridade
  2) consome 20h, déficit zero.
- Débito técnico pequeno, aceito conscientemente na auditoria final:
  4 implementações pequenas e quase idênticas de validação de formato
  de data continuam espalhadas entre `contextoCalendario.ts`,
  `deslocarDiasProdutivos.ts`, `resolverDiaProdutivo.ts` e
  `agregarDiasProdutivos.ts` — deixado assim de propósito, para não
  arriscar quebrar contrato de mensagem de erro de novo. Não bloqueia
  nada.
- `prepararEntradasMotor.ts` (fora do diff desta entrega) ainda faz 1
  consulta por recurso em loop (N+1 pré-existente) — candidato a uma
  futura rodada de performance, não uma regressão desta entrega.

## 3. Onde retomar

1. Distribuição parcial entre recursos compatíveis (PAD-008 §19) como
   **entrega nova, separada**, sem misturar com o código já fechado e
   commitado desta sessão (`3da17b3`). O contrato de dados já está
   fechado em §19.3 — não é uma decisão em aberto, é implementação.
2. Escopo esperado da próxima entrega, já mapeado em PAD-008 §19.4:
   núcleo do Motor (algoritmo de consumo parcial), `ItemSimulacaoOperacao`/
   `ResultadoSimulacao`, `prepararResultadoParaExibicao.ts` e a tabela
   de `SimulacaoCapacidade.tsx` (vira hierárquica),
   `compararResultadosSimulacao.ts` (critério de 19.3),
   `validarPayloadAprovacao.ts` (array aninhado + consistência
   aritmética), hash de solicitação, RPC nova (tabela pai por operação
   + tabela filha por distribuição), migration nova, testes
   automatizados.
3. Antes de escrever qualquer código dessa nova entrega: plano primeiro
   (Regra de Processo 2 — schema/RPC/múltiplos arquivos), aguardando
   aprovação explícita, mesmo padrão desta sessão.
4. Push do que já está pronto (`3da17b3` e os 3 commits anteriores)
   continua pendente, independente de quando a próxima entrega começar
   — só com autorização explícita, separada de qualquer outra decisão.
