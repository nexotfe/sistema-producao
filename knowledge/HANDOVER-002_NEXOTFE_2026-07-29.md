# HANDOVER-002 — NEXOTFE — 2026-07-29

**Status do push:** confirmado. `origin/main` = `4580068`, idêntico ao
`HEAD` local no momento deste documento — `git status -sb` mostra
`main...origin/main` sem "ahead"/"behind". Ao abrir este repositório
num computador novo, `git pull` traz tudo sem conflito.

**Sobre a numeração:** este é o segundo handover formal do projeto.
O primeiro (`knowledge/HANDOVER_NEXOTFE_2026-07-27.md`) não foi
renomeado — decisão explícita de não mexer em nome de arquivo já
commitado e publicado sem necessidade funcional. A numeração
(`HANDOVER-00X`) passa a valer a partir deste documento em diante;
trate `HANDOVER_NEXOTFE_2026-07-27.md` como o "HANDOVER-001" da série,
na prática, mesmo sem esse número no nome do arquivo.

---

## 1. O que foi feito nesta sessão (2026-07-29)

### 1.1 Troca de computador

Procedimento de setup em máquina nova seguido do zero. Resultado: 4
documentos operacionais novos, commitados em `0a5015d`
(`docs(knowledge): adiciona 4 documentos operacionais`):

- `knowledge/SETUP_WINDOWS.md` — passo a passo de ambiente do zero.
- `knowledge/TROUBLESHOOTING.md` — problemas reais já enfrentados
  (formato Problema → Sintoma → Causa → Solução).
- `knowledge/BACKUP_E_RECUPERACAO.md` — o que precisa de backup, o que
  não está no Git, procedimento de troca de máquina.
- `knowledge/VERSOES_OFICIAIS.md` — versões reais confirmadas por
  comando, não de memória.

### 1.2 Correção de identidade Git na máquina nova

O primeiro commit desta sessão falhou (`fatal: unable to auto-detect
email address`) — a máquina nova nunca teve `git config user.name`/
`user.email` configurados. Corrigido pelo usuário (`git config
--global`, fora do meu alcance operacional — ver Regra de Processo:
nunca atualizo config de Git). **Pendente:** essa entrada ainda não
foi adicionada ao `TROUBLESHOOTING.md` no formato Problema/Sintoma/
Causa/Solução — ver seção 2 abaixo.

### 1.3 DEC-004 — Simulação Comercial

Criado, revisado em várias rodadas e formalizado com `Status: Vigente`,
commitado em `4580068` (`docs(simulacao-comercial): DEC-004 -
Simulacao Comercial`). Documento em nível funcional/negócio — sem
tabelas, colunas, migrations ou tipos TypeScript, por decisão
explícita de escopo.

Resumo do conteúdo: Objetivo (responder, durante o orçamento, se o
projeto pode ser entregue na data desejada com a capacidade
disponível), Princípio (o sistema calcula, o profissional decide),
Papel do orçamentista (solicitar simulação, revisar resultado, decidir
aprovação — inclusive com risco assumido quando há déficit), Papel do
Motor (avalia viabilidade de capacidade, sem entrar em como o Motor
decide internamente — isso é PAD-008), Resultado esperado (informações
suficientes para justificar a decisão, sem prender o documento a um
formato de saída específico), Aprovação/Snapshot Comercial (referência
oficial da decisão até nova aprovação, revalidação obrigatória antes
de aprovar, histórico preservado), Limites do módulo (não faz PCP,
sequenciamento, OFs — fronteira só para delimitar responsabilidade), e
nota final referenciando a Seção 17 da Arquitetura Vigente para
qualquer evolução futura (horas extras, terceirização etc.), sem
duplicar esse conteúdo aqui.

### 1.4 Investigação completa dos 5 pontos preparatórios para PAD-008

Investigação de leitura (schema real + código TypeScript), sem
alteração de nada, para servir de base ao PAD-008 (Motor de
Capacidade):

1. **`ordens_fabricacao` e `operacoes_producao` existem no schema**
   desde junho/2026 (`202606050033_ordens_fabricacao_e_integracao.sql`
   e migrations subsequentes), com colunas reais, RLS, e uso real em
   código — telas em `src/app/ordens/[id]/page.tsx`,
   `src/app/pcp/planejamento/page.tsx`,
   `src/app/pcp/programacao-diaria/page.tsx`, e uma contagem de OFs em
   `useProjeto.ts`.

   **Divergência registrada explicitamente, como lição de processo:**
   esse achado é sobre a existência do código e do schema — não é uma
   confirmação de que o usuário navegou pessoalmente por telas de PCP
   funcionais na aplicação rodando hoje. "Existe no código" e "está
   confirmado como experiência de usuário navegável" são duas
   afirmações diferentes; só a primeira foi verificada nesta
   investigação. Antes do PAD-008 assumir que o módulo de PCP está
   operacional, vale essa confirmação direta do usuário, não só a
   leitura de código.

2. `ItemSimulacaoOperacao` confirmado como unidade central por
   `bomOperacaoId` — já é a granularidade em que o Motor decide hoje.
3. `ResultadoSimulacao` é só saída (`{ itensPorOperacao }`) — não
   separa entrada/saída no mesmo envelope; os parâmetros de entrada são
   argumentos de função separados.
4. Próximo `PAD-` livre confirmado por leitura real do diretório:
   **PAD-008** (maior existente é PAD-007).
5. Não existe hoje nenhuma estrutura equivalente a "Cenário de
   Execução" — nem override de recurso, produtividade ou equipe é
   passado ao Motor. Seria conceito genuinamente novo no PAD-008, não
   uma renomeação de algo existente.

Texto completo das 5 respostas, com trechos de código/migration como
evidência, está registrado na conversa desta sessão — não duplicado
aqui.

## 2. Pendências reais, em aberto

- **`cenario_demanda` × `Comprometido`:** decisão ainda pausada,
  herdada do handover anterior (seção 2.1/2.2 de
  `HANDOVER_NEXOTFE_2026-07-27.md`). Nesta sessão, essa pausa foi
  tornada explícita: a decisão fica adiada até o PAD-008 definir os
  contratos de entrada/saída do Motor de Capacidade — decidir sobre
  `cenario_demanda` antes disso corre o risco de decidir em cima de um
  contrato que o PAD-008 ainda pode mudar.
- **PAD-008 (Motor de Capacidade):** investigação pronta (seção 1.4
  acima), documento ainda não escrito. É o próximo passo real depois
  deste handover.
- **Entrada no `TROUBLESHOOTING.md` sobre identidade Git:** ainda não
  adicionada (ver seção 1.2). Curta, não bloqueia nada, mas fica
  registrada aqui para não se perder.

## 3. Onde retomar

1. Abrir o PAD-008 com a investigação da seção 1.4 já pronta — não
   refazer essa investigação, só reconfirmar algo pontual se tiver
   passado tempo/trabalho relevante desde então.
2. O PAD-008 deve responder, antes de qualquer outra coisa: qual é a
   relação real entre o Motor de Capacidade e
   `ordens_fabricacao`/`operacoes_producao` — são a mesma coisa, coisas
   relacionadas, ou deliberadamente independentes? (Ponto 1 da seção
   1.4, incluindo a divergência código-vs-experiência-de-usuário
   registrada ali.)
3. Só depois do PAD-008 definir esses contratos, retomar a decisão de
   `cenario_demanda` (seção 2 acima).
4. Fora isso: adicionar a entrada de identidade Git ao
   `TROUBLESHOOTING.md` é uma tarefa pequena e independente, pode ser
   feita a qualquer momento antes ou depois do PAD-008.
