# Backup e Recuperação — NEXOTFE

## 1. O que já está coberto (e por quê)

### 1.1 Código-fonte e documentação

Tudo em `src/`, `docs/`, `knowledge/`, `scripts/` e os arquivos de
configuração da raiz está versionado no Git e enviado para
`https://github.com/nexotfe/sistema-producao.git` (`origin`). Isso
cobre o código da aplicação e toda a documentação, incluindo este
arquivo.

**Confirmação real:** `git ls-files supabase/migrations | wc -l`
retorna 123 — ou seja, todo o histórico de migrations do projeto está
versionado e chega ao GitHub junto com o resto do código, sem depender
de nenhum backup separado do banco. Comando executado em Git Bash —
no PowerShell, usar `(git ls-files supabase/migrations).Count` como
equivalente (testado, mesmo resultado: 123).

### 1.2 Schema do banco (migrations)

As 123 migrations em `supabase/migrations/` são a fonte de verdade do
schema e estão no Git — não são um artefato separado que precisa de
rotina própria de backup. Recriar o schema do zero é, na prática,
`supabase db push --linked` contra um projeto Supabase vazio.

### 1.3 Dados do banco (Supabase)

Os dados em si (linhas das tabelas) ficam hospedados no Supabase, fora
desta máquina — uma falha no computador local não afeta os dados.
Ainda assim, para restauração de dados especificamente (não schema),
existe pelo menos um backup real já usado neste projeto:
`nexotfe_public_20260621_000436.dump`, restaurado localmente em
2026-06-21 para fins de auditoria (ver
`knowledge/CATALOGO_BANCO_RESTAURADO/README.md`). Esse dump cobre
apenas o schema `public` (estrutura e dados, sem grants e sem os
schemas internos do Supabase como `auth`) — não é um backup completo
do projeto Supabase.

Para um backup de dados atualizado, as opções são:

- Backups automáticos do próprio Supabase (Dashboard → Database →
  Backups) — depende do plano do projeto.
- `pg_dump` manual contra a connection string do **Session Pooler**
  (a conexão direta falha por IPv6 nesta rede — ver
  [TROUBLESHOOTING.md](TROUBLESHOOTING.md)).

## 2. O que NÃO está no Git

`.env.local` está no `.gitignore` (linha 80) e nunca deve ser
commitado — contém `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` e `DATABASE_URL`. Perder esse arquivo
não é perda de dado — todos os três valores podem ser recriados a
partir do Supabase Dashboard (ver
[SETUP_WINDOWS.md](SETUP_WINDOWS.md#7-configurar-envlocal)) — mas vale
guardar uma cópia fora da máquina local para não precisar recriar toda
vez:

- Um gerenciador de senhas com suporte a notas seguras (ex: Bitwarden,
  1Password) é a opção recomendada — nunca um arquivo de texto solto
  em nuvem sem criptografia (Google Drive, e-mail, etc.) nem qualquer
  repositório Git, público ou privado.
- A sessão de login do Supabase CLI (`npx supabase login`) também não
  é sincronizada entre máquinas — é local por design do CLI e precisa
  ser refeita em cada computador novo (não é algo para "fazer backup",
  é normal precisar logar de novo).

Sempre confirmar que o `.gitignore` continua protegendo esse arquivo
antes de realizar um commit.

## 3. Procedimento de troca de computador

Baseado no que foi feito de verdade em 2026-07-27 (ver
`knowledge/HANDOVER_NEXOTFE_2026-07-27.md`), reutilizável para a
próxima troca:

### No computador antigo, antes de trocar

1. Commitar e enviar (`git push`) tudo que estiver pronto — não deixar
   trabalho só local.
2. Rodar `git status -sb` e confirmar que aparece
   `main...origin/main` sem "ahead"/"behind" — prova de que o remoto
   tem exatamente o que está local.
3. Registrar num handover (`knowledge/HANDOVER_<PROJETO>_<data>.md`) o
   que foi commitado nesta rodada e, principalmente, o que ficou
   **decidido mas não implementado** ou **investigado mas pausado** —
   esse é o conteúdo que não está em nenhum commit e se perderia sem
   esse registro.

### No computador novo

1. Seguir [SETUP_WINDOWS.md](SETUP_WINDOWS.md) do zero (Git, Node,
   VS Code, clone, `npm install`).
2. `git pull` — não deve haver conflito se o passo 2 acima foi
   confirmado no computador antigo.
3. Recriar `.env.local` (a partir do gerenciador de senhas ou do
   Supabase Dashboard, nunca do Git).
4. `npx supabase login` e `npx supabase link --project-ref
   xttyiffmtsmraqroalrb` — sessão de CLI é por máquina, não vem no
   `git pull`.
5. Ler o handover mais recente em `knowledge/` antes de escrever
   qualquer código novo, para retomar exatamente de onde parou
   (decisões pendentes, investigações pausadas).

## 4. Recuperação após falha de máquina (sem handover prévio)

Se o computador falhar sem ter passado pelo procedimento acima
(ex: pane de hardware no meio de uma sessão):

1. **Código e documentação:** tudo que já tinha sido commitado e
   enviado ao GitHub está seguro — `git clone` num computador novo
   recupera 100% disso.
2. **Trabalho não commitado:** é perda real, não recuperável por este
   procedimento. É por isso que a Regra 4 do `CLAUDE.md` (mostrar
   `git diff --stat` e commitar por tema) existe — commits pequenos e
   frequentes reduzem o que pode se perder numa falha.
3. **Dados do banco:** não são afetados por falha da máquina local —
   continuam no Supabase. Se o próprio projeto Supabase tiver um
   problema (não a máquina local), usar o backup mais recente
   disponível no Dashboard (Database → Backups) ou um dump manual
   anterior, como o de `knowledge/CATALOGO_BANCO_RESTAURADO/`.
4. Depois de recuperar código e dados, seguir os passos da seção "No
   computador novo" acima normalmente.
