# PAD-005 — Segurança de Functions SQL (`EXECUTE` por padrão)

**Data:** 2026-07-19
**Status:** Vigente
**Natureza do documento:** arquitetura permanente — regra e princípio,
não amarrada a uma migration específica. Para o incidente que originou
esta regra, ver a seção "Origem" abaixo.

---

## 1. O problema

O Postgres concede `EXECUTE` a `PUBLIC` por padrão em toda `CREATE
FUNCTION` — qualquer role do banco pode chamar a function, a menos que
isso seja revogado explicitamente. O Supabase agrava isso: por padrão,
todo projeto Supabase aplica `ALTER DEFAULT PRIVILEGES` concedendo
`EXECUTE` a `anon`, `authenticated` e `service_role` em toda function
nova criada no schema `public` — incluindo `anon`, que representa
qualquer chamador **sem nenhuma autenticação**.

Ou seja: **toda function SQL nova neste projeto nasce alcançável por um
usuário não autenticado**, a menos que alguém lembre de revogar
manualmente. Isso vale mesmo para functions `SECURITY DEFINER`
projetadas para rodar com privilégio elevado e validar tudo
manualmente — a validação interna da function não importa se o
chamador nunca deveria ter chego até ela.

## 2. Exceção: functions de trigger não são afetadas na prática

Functions com `RETURNS trigger` **não podem ser invocadas diretamente**
por nenhum chamador, em nenhuma hipótese — o Postgres recusa a chamada
antes mesmo de avaliar qualquer `GRANT`, mesmo para o superusuário.
Confirmado empiricamente (não só por documentação) em duas camadas:

- SQL direto, como superusuário (`postgres`, contornando toda
  RLS/grant): `ERROR: trigger functions can only be called as
  triggers`.
- API REST real (PostgREST): `404 PGRST202` — o PostgREST nem lista
  functions `RETURNS trigger` como alvo de RPC.

Por isso, esta regra se aplica especificamente a **functions SQL
normais** (não-trigger) — sobretudo as `SECURITY DEFINER`, que são
justamente as que fazem sentido chamar via RPC (`supabase.rpc(...)`) a
partir da aplicação.

## 3. Regra

Toda function SQL não-trigger criada neste projeto deve revogar
`EXECUTE` de `PUBLIC` e de `anon` explicitamente, antes de conceder a
role(s) específica(s) que realmente devem chamá-la:

```sql
revoke execute on function public.minha_function(...) from public;
revoke execute on function public.minha_function(...) from anon;
grant execute on function public.minha_function(...) to authenticated;
```

Nunca confiar no estado padrão de `GRANT` de uma function nova sem
verificar `information_schema.routine_privileges` — o padrão do
Postgres/Supabase é "concede por padrão", não "nega por padrão".

## 4. Pendência — correção sistêmica, não aplicada ainda

Uma alternativa mais robusta (corrige o padrão do schema inteiro para
frente, em vez de depender de lembrar em cada function nova) seria:

```sql
alter default privileges in schema public
  revoke execute on functions from public, anon;
```

Isso mudaria o comportamento padrão de `CREATE FUNCTION` daqui em
diante — toda function nova nasceria **sem** `EXECUTE` para `PUBLIC`/
`anon`, exigindo `GRANT` explícito para qualquer role que precise
chamá-la (inclusive `authenticated`). **Não foi aplicado ainda** —
registrado aqui como recomendação pendente, a ser avaliado e decidido
como tarefa própria, não decidido silenciosamente numa migration de
funcionalidade. Até essa correção sistêmica ser aplicada, a regra da
seção 3 (revogar manualmente em cada function nova) é obrigatória.

## 5. Origem

Encontrado durante a Etapa 3 do motor de Simulação Comercial
(`aprovar_projeto_com_simulacao`, `supabase/migrations/
202607190006_simulacao_comercial_snapshot.sql`): a function, recém-
criada, estava alcançável por `anon` sem nenhuma autenticação. Uma
chamada real via `curl` contra a API REST, com um projeto real de
produção, chegou a tentar o `INSERT` no cabeçalho do snapshot — só não
gravou porque uma constraint `NOT NULL` não relacionada
(`aprovado_por`) barrou por acidente. A checagem de tenant que deveria
ter bloqueado isso (`v_empresa_id <> empresa_atual_id()`) tinha um
segundo defeito: comparação com `<>` contra `NULL` (retornado por
`empresa_atual_id()` para um chamador não autenticado) nunca avalia
como verdadeira em SQL, então a validação nunca disparava para esse
caso.

**A function esteve de fato exposta a `anon` em produção por
aproximadamente 15–20 minutos (~18:21–18:40 UTC, 2026-07-19)** —
mitigada por acidente de schema (a constraint `NOT NULL` de
`aprovado_por`, que não tem relação nenhuma com a checagem de tenant
que deveria ter barrado o acesso), não por proteção desenhada.
Corrigida assim que identificada, ainda durante a revisão anterior ao
commit — nunca chegou a ser aprovada/mesclada na branch principal nesse
estado. Nenhum dado real foi gravado ou exposto (confirmado por
reconsulta direta ao estado das tabelas antes e depois).

Checagem de `pg_stat_statements` (acumulando desde 2026-05-29, sem
reset) não mostrou nenhum volume de chamadas além do atribuível às
próprias ações desta sessão — mas essa fonte não registrou nem as
chamadas de teste feitas via `curl`/PostgREST (só as feitas via conexão
SQL direta), o que a torna insuficiente para descartar por completo uma
chamada de terceiro durante a janela. Os logs de acesso HTTP reais do
Supabase (Logs Explorer / Management API) são a fonte autoritativa para
isso e não foram verificados — não havia acesso de Management API
configurado neste ambiente no momento da investigação.
