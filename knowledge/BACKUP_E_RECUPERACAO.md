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

## 5. Backup criptografado (dump lógico) e restauração completa — validado em 2026-10-20

> **Nunca rodar os comandos desta seção contra produção.** Todos os
> `psql`/`supabase storage cp` abaixo pressupõem um sandbox local novo
> e vazio, descartável ao final — nunca um banco com dados reais já
> existentes, nunca a connection string de produção. Um cenário real de
> recuperação de desastre (produção de verdade perdida) não segue este
> texto direto: passa primeiro pela Regra 9 do `CLAUDE.md` (checkpoint
> humano, uma escrita por vez, confirmação explícita a cada passo) e só
> depois disso pelos ajustes técnicos descritos aqui.

Procedimento real, testado de ponta a ponta num sandbox local descartável
(nunca em produção), incluindo o passo que faltava nas seções acima:
restauração completa de `auth`/`storage`/`public` a partir de um dump
lógico, não apenas do schema via migrations.

### 5.1 Geração do backup

```
supabase db dump --linked --role-only                                            -f roles.sql
supabase db dump --linked -s public,auth,storage,supabase_migrations             -f schema.sql
supabase db dump --linked -s public,auth,storage,supabase_migrations --data-only -f data.sql
```

Por padrão, `supabase db dump` **exclui** `auth`/`storage`/`supabase_migrations`
(schemas internos) — o `-s` explícito é obrigatório para incluí-los.

Os 3 arquivos + o(s) objeto(s) físico(s) do Storage (baixados via
`supabase storage cp`, nunca incluídos no dump do Postgres) são
empacotados (`tar`) e criptografados com GPG simétrico AES-256
(`gpg --symmetric --cipher-algo AES256`), senha nunca armazenada junto
dos arquivos nem registrada em nenhum lugar deste repositório. Cópia
local protegida (ACL restrita ao usuário) + cópia em mídia externa
(pendrive), hash SHA-256 conferido nas duas.

### 5.2 Restauração — papel administrativo correto

O `supabase start` local cria um `postgres` **sem privilégio de
superusuário** e **sem membership** em `supabase_admin` (dono real dos
schemas `auth`/`storage`). Restaurar como `postgres` falha com
`permission denied for schema auth`. O único role realmente superuser
no Postgres local da Supabase é `supabase_admin` — a restauração deve
conectar como esse role, não como `postgres`:

```sql
select rolname from pg_roles where rolsuper = true;  -- supabase_admin
```

```
psql -v ON_ERROR_STOP=1 -1 -U supabase_admin -d postgres -f roles.sql
psql -v ON_ERROR_STOP=1 -1 -U supabase_admin -d postgres -f schema_restauravel.sql
psql -v ON_ERROR_STOP=1 -1 -U supabase_admin -d postgres -f data_restauravel.sql
```

`-1` (`--single-transaction`) é importante: sem ele, um erro no meio do
`schema.sql` deixa objetos parciais criados (CREATE/ALTER não têm
rollback automático fora de uma transação explícita), obrigando a
reiniciar o container para tentar de novo. Com `-1`, um erro desfaz tudo
automaticamente e a mesma sessão pode ser reaproveitada na tentativa
seguinte.

### 5.3 Índices, tipos e constraints já existentes — só com equivalência comprovada

O `schema.sql` gerado pelo Supabase CLI já aplica `IF NOT EXISTS`/`OR
REPLACE` em schemas, tabelas, sequências, views, funções e triggers —
mas **não** em `CREATE INDEX`, `CREATE TYPE` nem `ALTER TABLE ... ADD
CONSTRAINT` (Postgres não aceita `IF NOT EXISTS` nessas três formas).
Como o Postgres local da Supabase já vem com dezenas de índices/tipos/
constraints padrão em `auth`/`storage`, restaurar por cima colide.

**Regra obrigatória: nunca tratar a colisão de forma genérica.** Antes
de qualquer ajuste, comparar a definição real de cada objeto que colide
— nome não é suficiente:

```sql
-- indices
select indexname, indexdef from pg_indexes where schemaname in ('auth','storage');
-- tipos (enums)
select n.nspname||'.'||t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder)
from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid
where n.nspname in ('auth','storage') group by 1;
-- constraints
select conname, pg_get_constraintdef(oid) from pg_constraint
where connamespace in ('auth'::regnamespace,'storage'::regnamespace);
```

Só depois de confirmar que a definição do dump é **idêntica** à já
existente (byte a byte, após normalizar aspas/espaços) é seguro tornar
aquele objeto específico idempotente:

- Índices: `CREATE INDEX "x"` → `CREATE INDEX IF NOT EXISTS "x"` (só nos
  nomes confirmados equivalentes).
- Tipos: envolver em `DO $$ BEGIN CREATE TYPE ...; EXCEPTION WHEN
  duplicate_object THEN null; END $$;`.
- Constraints: envolver em `DO $$ BEGIN ALTER TABLE ... ADD CONSTRAINT
  ...; EXCEPTION WHEN duplicate_object OR invalid_table_definition OR
  duplicate_table THEN null; END $$;` — são 3 `SQLSTATE` diferentes
  dependendo do tipo de colisão (`PRIMARY KEY` duplicada dá
  `invalid_table_definition`; `UNIQUE` duplicada dá `duplicate_table`
  pelo índice implícito que ela cria; o resto dá `duplicate_object`).
  Capturar as 3 é necessário, mas só para os nomes já confirmados
  equivalentes — nunca com um `WHEN others` genérico, que esconderia um
  erro real numa restauração futura onde a definição realmente mudou.

Essas correções são feitas **só na cópia de trabalho** (`schema.sql` →
`schema_restauravel.sql`), nunca no arquivo original do backup.

### 5.4 Referências circulares em `data.sql`

O próprio `pg_dump --data-only` já resolve isso: a primeira linha do
arquivo gerado é `SET session_replication_role = replica;`, que
desativa a execução de todos os triggers (inclusive os de FK) durante a
carga — nenhum tratamento manual adicional é necessário, mesmo com
tabelas que têm FK circular entre si (ex.: `cenarios_comerciais_aprovados`,
`necessidades_of_material`). Validar depois da carga com anti-join por
FK (nunca só contagem de linhas) — ver exemplo de query no `COMMIT`
desta seção.

### 5.5 Arquivo físico do Storage — recuperação separada, nunca via SQL direto

O dump do Postgres só cobre a *metadata* (`storage.objects`); o blob em
si vive fora do banco. Restaurar os dois juntos causa conflito:

1. **Excluir** a linha de `storage.objects` daquele objeto específico da
   cópia de trabalho de `data.sql` (localizar pelo bucket+caminho, não
   pelo `empresa_id`, que se repete em centenas de linhas de outras
   tabelas).
2. Depois da carga normal do resto de `data.sql`, subir o arquivo físico
   via `supabase storage cp <local> ss:///<bucket>/<caminho>` — a API
   cria blob + metadata consistentes sozinha. Uma segunda tentativa de
   inserir a mesma linha via SQL depois disso falha com
   `duplicate key value violates unique constraint
   "idx_objects_current_version"` — confirmado por teste real, não por
   suposição.
3. `id`/`owner`/`created_at` do objeto recriado não serão idênticos ao
   original (metadados internos da Supabase) — sem efeito na aplicação,
   que referencia arquivos por bucket+caminho (`logo_path` etc.), nunca
   por esse UUID interno.

### 5.6 Checklist de validação pós-restauração

- Contagem de linhas nas tabelas-chave comparada com produção **no
  momento da verificação**, não só com o snapshot do backup.
- Anti-join por FK (não só contagem) para toda FK de `public`, inclusive
  as compostas `(coluna, empresa_id)` — zero linha órfã esperado.
- `usuarios`/`profiles` → `auth.users` → `auth.identities` nos dois
  sentidos.
- SHA-256 do arquivo de Storage, conferido por **download real via API**
  depois do upload (não só comparar o arquivo local com ele mesmo).
- Uma leitura real de algum módulo da aplicação contra o banco
  restaurado (não só consulta SQL solta) — prova que RLS, triggers e
  RPCs completas continuam funcionando, não só que os dados existem.

Não depender só desta seção de memória — o script completo (comparação
de índices/tipos/constraints, geração das cópias de trabalho corrigidas,
validação de FKs) foi escrito durante o teste de 2026-10-20 e deveria
ser formalizado como script reutilizável em `scripts/` numa próxima
rodada, em vez de reescrito do zero a cada restauração.
