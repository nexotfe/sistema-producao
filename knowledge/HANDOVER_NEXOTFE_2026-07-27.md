# Handover NEXOTFE — 2026-07-27

**Status do push:** confirmado. `origin/main` = `6cee02c`, idêntico ao
`HEAD` local no momento deste documento — `git status -sb` mostra
`main...origin/main` sem "ahead"/"behind". Ao abrir este repositório
num computador novo, `git pull` traz tudo sem conflito.

---

## 1. O que foi commitado nesta rodada (2026-07-27)

### 1.1 Commits

Três commits, nesta ordem, todos enviados ao remoto:

1. **`d101a58`** — `docs(projetos): DEC-003 - Status Aprovado via Simulacao Comercial + correcao do dropdown`. Formaliza, em `knowledge/arquitetura-tecnica/DEC-003_Status_Aprovado_Via_Simulacao.md`, a regra de que `projetos.status` só transiciona para `'aprovado'` via `aprovar_projeto_com_simulacao` (regra que já existia implementada desde a Etapa 3, via trigger `projetos_bloquear_aprovacao_direta`, mas nunca tinha documento próprio). Corrige a regressão de UX real encontrada por investigação: o dropdown de Status em `src/app/projeto/page.tsx` permitia selecionar "Aprovado" livremente e o `UPDATE` direto era bloqueado pela trigger com um erro cru — agora `useProjeto.ts` intercepta isso no client, antes de qualquer chamada ao Supabase, com mensagem orientando para a tela de Simulação Comercial; quando já aprovado, o campo fica somente leitura.
2. **`fc5a2c3`** — `feat(simulacao-comercial): V1.1 - Aprovacao da Simulacao Comercial (DEC-002)`. Formaliza DEC-002 e implementa o fluxo completo de aprovação sobre a V1.0 (que só simulava): revalidação antes de aprovar (compara o resultado exibido com uma nova execução do Motor, bloqueia se algo mudou), déficit não bloqueia aprovação mas exige confirmação explícita num modal (com bloco "Motivo principal do déficit"), substituição de simulação vigente avisada antes, tela cai direto em modo leitura quando já existe aprovação. Testado com dado real (projeto 260006, ENIFER) — déficit real de 56h investigado e confirmado (feriado municipal real reduzindo a janela a 5 dias produtivos), aprovação **não** executada de propósito para não alterar a simulação vigente real do projeto.
3. **`6cee02c`** — `feat(projetos): link "Simulação" na tela de Projeto`. Botão de navegação para `/projetos/{id}/simulacao`, isolado da V1.1 porque tinha sido escrito antes, numa sessão anterior, e nunca commitado.

### 1.2 Documentos DEC- existentes

Documentos formais que existem agora, na série `DEC-`: `DEC-001` (Desconto Comercial do Orçamento), `DEC-002` (Aprovação da Simulação Comercial), `DEC-003` (Status Aprovado via Simulação Comercial). Todos em `knowledge/arquitetura-tecnica/`.

## 2. Pendências reais, em aberto — não decididas ainda

### 2.1 Remoção de `cenario_demanda` — PAUSADA

Investigação real (query direta no banco, `pg_get_functiondef` sobre toda `pg_proc`) confirmou que `cenario_demanda` (coluna em `simulacoes_comerciais`) nunca foi lida por nenhuma function de cálculo — só `aprovar_projeto_com_simulacao` grava. Isso levou a uma tarefa de remoção (schema + RPC + código + documentação), mas a investigação encontrou uma **contradição real** antes de qualquer execução: a seção 11.4 e a seção 14 de `arquitetura-tecnica/ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md` descrevem "Cenário de Demanda" como algo que **deveria** filtrar quais simulações de outros projetos contam como `Comprometido` (por Situação Comercial da empresa, configurável) — e `calcular_comprometido_v1` não faz esse filtro hoje, nem existe a tabela de configuração que a seção 11.4 prevê.

**Decisão pendente, do usuário:** (a) formalizar que a seção 11.4 fica conscientemente superada/adiada, documentar isso, e então remover `cenario_demanda` como verdadeiramente vestigial; ou (b) reconsiderar a remoção, já que o campo pode ser a ponta visível de uma funcionalidade real ainda não implementada (hoje `Comprometido` conta qualquer projeto com simulação vigente, mesmo um ainda em fase de "Consulta" — o que pode ser um problema de negócio maior que uma limpeza de schema).

Nenhum código, schema ou documentação foi alterado para essa remoção — ficou só a investigação, registrada na conversa, não em arquivo.

### 2.2 Comprometido × Situação Comercial — mesma pausa

Decorre diretamente do item 2.1. Enquanto a decisão acima não for tomada, não avançar em nenhuma mudança de arquitetura sobre como `Comprometido` deveria (ou não) respeitar Situação Comercial/Cenário de Demanda.

## 3. Onde retomar no próximo computador

1. `git pull` — nada deveria conflitar, o remoto já reflete tudo até aqui.
2. Rodar `npx supabase login`/reconfirmar acesso ao projeto linkado (`db query --linked`) se for continuar investigação via SQL real — sessão de CLI é por máquina, não vem no `git pull`.
3. Retomar pela decisão da seção 2.1 acima antes de qualquer código novo em Simulação Comercial — é a única coisa realmente bloqueada.
4. Fora isso, Desconto Comercial do Orçamento (DEC-001, Microciclos 1-2) e a migração do módulo Recursos Produtivos ao Design System (PAD-006/007) estão 100% commitados e concluídos — não há trabalho pendente conhecido nessas duas frentes.
