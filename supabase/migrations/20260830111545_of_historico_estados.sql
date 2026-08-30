-- Incremento 4D0, segunda fatia — Incremento 2/9: histórico de estados de
-- ordens_fabricacao. Tabela somente-acrescentável (append-only) que
-- registra automaticamente, via trigger AFTER INSERT OR UPDATE, toda
-- mudança real de estado_aprovacao/estado_execucao — nascimento da OF,
-- mudança de um só eixo, mudança simultânea dos dois, e qualquer caminho
-- de escrita (hoje só INSERT/UPDATE direto; futuras RPCs de
-- aprovação/reprovação/ressubmissão ficam fora desta fatia). Nenhuma RPC
-- de negócio é criada aqui — só a estrutura de histórico. Arquivo inteiro
-- é uma transação.

begin;

-- 1. Tabela de histórico. estado_*_anterior fica nulo só no nascimento da
--    OF (não existia linha anterior). estado_*_novo espelha a
--    nullability real de ordens_fabricacao.estado_aprovacao/
--    estado_execucao (nullable no schema, mesmo que sync_estado_of — 4D0-A
--    — sempre os preencha na prática) — não impor NOT NULL aqui evita que
--    um histórico mais rígido que a própria origem possa abortar o
--    INSERT/UPDATE real em ordens_fabricacao por um efeito colateral do
--    trigger. alterado_por é o auth.uid() real da sessão que executou a
--    escrita, nunca copiado de qualquer coluna de ordens_fabricacao —
--    autor "gravado" ali (ex.: estado_aprovacao_por) pode ter sido
--    definido por outra sessão ou herdado de backfill, e não representa
--    quem efetivamente fez ESTA mudança. NULL em alterado_por é o caso
--    legítimo de operação administrativa sem sessão autenticada (ex.:
--    manutenção via service_role/postgres direto), nunca um erro.
create table public.ordens_fabricacao_historico_estados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  of_id uuid not null,
  estado_aprovacao_anterior text,
  estado_aprovacao_novo text,
  estado_execucao_anterior text,
  estado_execucao_novo text,
  alterado_em timestamptz not null default now(),
  alterado_por uuid references auth.users(id),
  observacao text,
  origem text not null,
  constraint ordens_fabricacao_historico_estados_origem_chk
    check (origem in ('rpc', 'operacao_administrativa')),
  constraint ordens_fabricacao_historico_estados_of_empresa_fkey
    foreign key (of_id, empresa_id) references public.ordens_fabricacao (id, empresa_id)
);

comment on table public.ordens_fabricacao_historico_estados is
  '4D0: histórico somente-acrescentável de mudanças de estado_aprovacao/estado_execucao em ordens_fabricacao. Populado exclusivamente pelo trigger registrar_historico_estado_of — nenhuma escrita direta é permitida a nenhum papel de cliente, e UPDATE/DELETE são bloqueados estruturalmente (trigger incondicional), não só por RLS.';
comment on column public.ordens_fabricacao_historico_estados.alterado_por is
  'auth.uid() capturado pelo trigger no momento da mudança — nunca copiado de coluna de ordens_fabricacao. NULL = operação administrativa sem sessão autenticada (origem = operacao_administrativa).';
comment on column public.ordens_fabricacao_historico_estados.origem is
  'rpc = houve auth.uid() real (sessão autenticada) no momento da mudança. operacao_administrativa = sem sessão (auth.uid() nulo). Nenhuma RPC de aprovação/reprovação/ressubmissão existe ainda nesta fatia — a classificação já antecipa o caminho que essas RPCs vão usar.';

-- 2. Índices — consulta por OF em ordem cronológica, e por empresa/data
--    (auditoria/relatório).
create index ordens_fabricacao_historico_estados_of_cronologia_idx
  on public.ordens_fabricacao_historico_estados (of_id, alterado_em);

create index ordens_fabricacao_historico_estados_empresa_data_idx
  on public.ordens_fabricacao_historico_estados (empresa_id, alterado_em);

-- 3. RLS — leitura só para admin ou PCP da própria empresa (mesmo padrão
--    de numeracao_of_formato/numeracao_of_projoeto, Incremento 1). Sem
--    nenhuma policy de escrita — INSERT já é impossível para papel de
--    cliente pelo REVOKE abaixo, e UPDATE/DELETE são bloqueados de forma
--    estrutural (trigger incondicional, seção 6), não dependem de RLS.
alter table public.ordens_fabricacao_historico_estados enable row level security;

create policy ordens_fabricacao_historico_estados_select_admin_pcp
  on public.ordens_fabricacao_historico_estados
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and (public.usuario_e_admin() or public.usuario_tem_papel_funcional('pcp'))
  );

-- CORREÇÃO (achado real, Incremento 1): revogar de public/anon/authenticated
-- não remove privilégio de service_role — Supabase concede a service_role
-- de forma independente do grant a PUBLIC. service_role entra
-- explicitamente no REVOKE de escrita (exigência desta fatia: "authenticated,
-- anon e service_role sem escrita direta"), diferente do padrão anterior
-- (numeracao_of_formato/numeracao_of_projeto) que não mencionava
-- service_role. SELECT de service_role não é tocado — permanece no
-- padrão default (bypassa RLS, como sempre para essa role).
--
-- CORREÇÃO (achado real, revisão do usuário): TRUNCATE não é DELETE — não
-- passa por RLS e não dispara nenhum trigger FOR EACH ROW. Sem revogar
-- TRUNCATE explicitamente e sem um trigger de instrução dedicado (seção
-- 6), authenticated/anon/service_role poderiam esvaziar o histórico
-- inteiro sem que bloquear_alteracao_historico_estado_of (FOR EACH ROW)
-- jamais disparasse. TRUNCATE entra no mesmo REVOKE de escrita.
revoke insert, update, delete, truncate on public.ordens_fabricacao_historico_estados
  from public, anon, authenticated, service_role;
grant select on public.ordens_fabricacao_historico_estados to authenticated;

-- 4. Trigger que popula o histórico. AFTER (não BEFORE) INSERT OR UPDATE —
--    por AFTER, todos os triggers BEFORE de ordens_fabricacao já
--    resolveram os valores finais de estado_aprovacao/estado_execucao/
--    numero_of (sync_estado_of, set_ordem_fabricacao_numero, 4D0-A/
--    Incremento 1) antes deste trigger rodar, sem depender de ordem
--    alfabética entre triggers BEFORE. Só grava linha quando há mudança
--    real (INSERT sempre grava — nascimento; UPDATE só grava se
--    estado_aprovacao OU estado_execucao mudaram de verdade, com
--    IS DISTINCT FROM — NULL-safe, nunca perde uma transição de/para
--    NULL por comparação `<>` que retornaria NULL e seria tratada como
--    falso). SECURITY DEFINER: authenticated não tem INSERT na tabela de
--    histórico (REVOKE acima) — o INSERT interno do trigger precisa
--    rodar com o privilégio do dono da função, não do papel que
--    inseriu/atualizou ordens_fabricacao. Mesmo padrão e mesmo motivo já
--    comprovado em set_ordem_fabricacao_numero (Incremento 1): SECURITY
--    DEFINER não exige que authenticated tenha EXECUTE nesta função para
--    o trigger disparar — só chamada DIRETA exigiria (bloqueada pelo
--    REVOKE da seção 5).
create or replace function public.registrar_historico_estado_of()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_deve_registrar boolean := false;
  v_estado_aprovacao_anterior text;
  v_estado_execucao_anterior text;
  v_alterado_por uuid;
  v_origem text;
begin
  if tg_op = 'INSERT' then
    v_deve_registrar := true;
    v_estado_aprovacao_anterior := null;
    v_estado_execucao_anterior := null;
  elsif tg_op = 'UPDATE' then
    if new.estado_aprovacao is distinct from old.estado_aprovacao
       or new.estado_execucao is distinct from old.estado_execucao then
      v_deve_registrar := true;
      v_estado_aprovacao_anterior := old.estado_aprovacao;
      v_estado_execucao_anterior := old.estado_execucao;
    end if;
  end if;

  if not v_deve_registrar then
    return new;
  end if;

  -- Captura direta — nunca lida de coluna de ordens_fabricacao. Um valor
  -- "forjado" em estado_aprovacao_por não tem nenhuma influência aqui.
  v_alterado_por := auth.uid();
  v_origem := case when v_alterado_por is not null then 'rpc' else 'operacao_administrativa' end;

  insert into public.ordens_fabricacao_historico_estados (
    empresa_id, of_id,
    estado_aprovacao_anterior, estado_aprovacao_novo,
    estado_execucao_anterior, estado_execucao_novo,
    alterado_por, observacao, origem
  ) values (
    new.empresa_id, new.id,
    v_estado_aprovacao_anterior, new.estado_aprovacao,
    v_estado_execucao_anterior, new.estado_execucao,
    v_alterado_por, new.estado_aprovacao_observacao, v_origem
  );

  return new;
end;
$$;

comment on function public.registrar_historico_estado_of() is
  '4D0: popula ordens_fabricacao_historico_estados. AFTER INSERT (nascimento) OR UPDATE (só quando estado_aprovacao ou estado_execucao mudam de verdade, IS DISTINCT FROM). alterado_por = auth.uid() capturado no momento, nunca herdado de coluna da OF. SECURITY DEFINER — EXECUTE nunca concedido a nenhum papel de cliente (nem authenticated, nem service_role); chamada só pelo trigger.';

revoke execute on function public.registrar_historico_estado_of()
  from public, anon, authenticated, service_role;

create trigger registrar_historico_estado_of
  after insert or update on public.ordens_fabricacao
  for each row
  execute function public.registrar_historico_estado_of();

-- 5. Imutabilidade estrutural do histórico — incondicional, para
--    qualquer executor (authenticated, service_role, dono da tabela,
--    qualquer função SECURITY DEFINER futura), sem exceção. Sem SECURITY
--    DEFINER de propósito: um trigger BEFORE já dispara para todo
--    executor da instrução, mesmo raciocínio já comprovado em
--    bloquear_delete_fisico_of (4D0-A) e bloquear_alteracao_numero_of
--    (Incremento 1) — RLS sozinha não alcança dono/service_role
--    (rls_forced_no_dono=false), só o trigger alcança.
create or replace function public.bloquear_alteracao_historico_estado_of()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  raise exception 'ordens_fabricacao_historico_estados: historico e somente-acrescentavel - UPDATE/DELETE nao sao permitidos, mesmo por service_role ou proprietario.';
  return null;
end;
$$;

revoke execute on function public.bloquear_alteracao_historico_estado_of()
  from public, anon, authenticated, service_role;

create trigger bloquear_update_historico_estado_of
  before update on public.ordens_fabricacao_historico_estados
  for each row
  execute function public.bloquear_alteracao_historico_estado_of();

create trigger bloquear_delete_historico_estado_of
  before delete on public.ordens_fabricacao_historico_estados
  for each row
  execute function public.bloquear_alteracao_historico_estado_of();

-- 6. TRUNCATE é uma operação de INSTRUÇÃO, não de linha — nunca dispara
--    trigger FOR EACH ROW e nunca passa por RLS. Função e trigger
--    dedicados, deliberadamente separados dos de UPDATE/DELETE (que
--    continuam FOR EACH ROW): TRUNCATE só aceita trigger FOR EACH
--    STATEMENT, e misturar os dois no mesmo objeto obscureceria qual
--    mecanismo bloqueia qual operação. Mesma incondicionalidade das
--    demais proteções estruturais desta tabela — sem SECURITY DEFINER,
--    dispara para qualquer executor, inclusive dono/service_role.
create or replace function public.bloquear_truncate_historico_estado_of()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  raise exception 'ordens_fabricacao_historico_estados: TRUNCATE nao e permitido - historico e somente-acrescentavel, mesmo por service_role ou proprietario.';
  return null;
end;
$$;

revoke execute on function public.bloquear_truncate_historico_estado_of()
  from public, anon, authenticated, service_role;

create trigger bloquear_truncate_historico_estado_of
  before truncate on public.ordens_fabricacao_historico_estados
  for each statement
  execute function public.bloquear_truncate_historico_estado_of();

commit;
