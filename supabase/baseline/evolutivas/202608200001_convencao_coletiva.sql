-- NEXOTFE 1.0 — Baseline SQL — Evolução canônica
-- Módulo: convenção coletiva de horas adicionais (percentuais de
-- acréscimo por natureza de dia, vigência histórica real)
-- Dependência: supabase/baseline/001..015 (em particular 002_security.sql -
-- public.usuarios, public.empresa_atual_id(), public.usuario_tem_permissao())
--
-- POR QUE ESTE ARQUIVO EXISTE SEPARADO DE supabase/migrations/202608130001_
-- empresa_convencao_horas_adicionais.sql (correção pedida pelo usuário,
-- 2026-08-20): aquela migration já está aplicada no projeto Supabase
-- vinculado (produção), que ainda roda a arquitetura histórica
-- (public.profiles + public.usuario_e_admin()) - ela permanece intocada,
-- nunca reescrita silenciosamente (é fato histórico do que rodou em
-- produção). Este arquivo é a MESMA feature, portada para a arquitetura
-- canônica do baseline (public.usuarios/permissoes + public.usuario_tem_permissao()),
-- que não tem public.profiles nem public.usuario_e_admin() (015_validate.sql
-- exige explicitamente a ausência de public.profiles no baseline
-- definitivo). As duas trilhas nunca se misturam: nenhum código aqui
-- referencia a trilha histórica, e vice-versa.
--
-- Diferença de conteúdo em relação a 202608130001: SOMENTE a checagem de
-- permissão dentro de registrar_convencao_horas_adicionais() muda, de
-- `usuario_e_admin()` para `usuario_tem_permissao('admin.convencao_coletiva.gerenciar')`
-- (nome de permissão escolhido seguindo o padrão já estabelecido em
-- admin.numeracao.gerenciar/admin.tecnologias.gerenciar/admin.recursos.gerenciar/
-- admin.colaboradores.gerenciar - cada entidade administrativa própria tem
-- sua própria permissão .gerenciar, nunca lumped sob admin.configuracoes.gerenciar,
-- que é reservado à tabela chave-valor configuracoes_empresa). Toda a
-- estrutura (tabela, índice único parcial, trigger de imutabilidade,
-- policy de SELECT, function de leitura por período) é idêntica: nenhuma
-- delas nunca dependeu de profiles/usuario_e_admin() - só liam
-- empresa_atual_id(), que já resolve corretamente contra QUALQUER uma das
-- duas arquiteturas (a function em si, não este arquivo, decide isso).
--
-- Reaplicação: nenhum objeto aqui usa IF NOT EXISTS/ON CONFLICT - uma
-- segunda execução falha alto e claro no primeiro `create table` com
-- "relation already exists" (pedido explícito do usuário: nunca mascarar
-- reaplicação). O arquivo inteiro está dentro de BEGIN/COMMIT (mesmo
-- padrão dos módulos 001-015): a falha aborta a transação inteira, sem
-- deixar objetos parciais.

begin;

create table public.empresa_convencao_horas_adicionais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  percentual_segunda_sexta numeric not null check (percentual_segunda_sexta >= 0),
  percentual_sabado numeric not null check (percentual_sabado >= 0),
  percentual_domingo numeric not null check (percentual_domingo >= 0),
  percentual_feriado numeric not null check (percentual_feriado >= 0),
  vigente_desde date not null,
  vigente_ate date,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  constraint empresa_convencao_horas_adicionais_vigencia_chk
    check (vigente_ate is null or vigente_ate >= vigente_desde)
);

comment on table public.empresa_convencao_horas_adicionais is
  'Percentuais de acréscimo de hora adicional (fração, ex.: 0.30 = 30%) por natureza de dia, globais por empresa, com vigência histórica real. 1 linha por vigência, layout largo (4 percentuais juntos, já que uma convenção coletiva nova normalmente muda os 4 ao mesmo tempo). Append-only por natureza: nenhuma linha já vigente (vigente_ate preenchido) pode ser alterada; toda escrita passa por registrar_convencao_horas_adicionais (seção 3). Trilha canônica (public.usuarios/usuario_tem_permissao) - equivalente funcional de supabase/migrations/202608130001_empresa_convencao_horas_adicionais.sql (trilha histórica de produção, public.profiles/usuario_e_admin), nunca a mesma tabela física.';
comment on column public.empresa_convencao_horas_adicionais.percentual_segunda_sexta is
  'Acréscimo sobre valor_hora para hora adicional em dia útil (natureza=hora_extra no motor em memória) - fração, não percentual inteiro (0.30, não 30).';
comment on column public.empresa_convencao_horas_adicionais.vigente_desde is
  'Data em que esta convenção passa a valer - nunca retroativa (registrar_convencao_horas_adicionais exige >= current_date no momento do cadastro), mas pode ser uma data FUTURA (agendamento permitido).';
comment on column public.empresa_convencao_horas_adicionais.vigente_ate is
  'NULL enquanto esta é a convenção mais recente cadastrada ("aberta") - preenchido automaticamente pela function de transição quando uma convenção mais nova é registrada. Nunca editável diretamente (trigger de imutabilidade, seção 2).';

create unique index empresa_convencao_horas_adicionais_aberta_uniq
  on public.empresa_convencao_horas_adicionais (empresa_id)
  where vigente_ate is null;

create index empresa_convencao_horas_adicionais_empresa_periodo_idx
  on public.empresa_convencao_horas_adicionais (empresa_id, vigente_desde);

-- =====================================================================
-- 2. RLS - só SELECT direto para authenticated; toda escrita via a
--    function SECURITY DEFINER da seção 3 (histórico crítico não fica
--    exposto a INSERT/UPDATE/DELETE direto, mesmo de admin).
-- =====================================================================

alter table public.empresa_convencao_horas_adicionais enable row level security;

create policy empresa_convencao_horas_adicionais_select_tenant
  on public.empresa_convencao_horas_adicionais
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

revoke all on public.empresa_convencao_horas_adicionais from public, anon, authenticated;
grant select on public.empresa_convencao_horas_adicionais to authenticated;

-- =====================================================================
-- 3. Imutabilidade de conteúdo - nenhuma coluna pode mudar depois de
--    gravada, exceto vigente_ate, e mesmo assim só de NULL para uma
--    data (nunca reaberta).
-- =====================================================================

create or replace function public.impedir_alteracao_convencao_horas_adicionais()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.vigente_ate is not null then
    raise exception 'Convenção já encerrada (vigente_ate=%) - não pode ser alterada.', old.vigente_ate;
  end if;
  if (to_jsonb(old) - 'vigente_ate') is distinct from (to_jsonb(new) - 'vigente_ate') then
    raise exception 'Conteúdo de uma convenção já vigente é imutável - só vigente_ate pode ser preenchido, e só pela function de transição (registrar_convencao_horas_adicionais).';
  end if;
  return new;
end;
$function$;

comment on function public.impedir_alteracao_convencao_horas_adicionais() is
  'Trava de imutabilidade: uma linha já encerrada (vigente_ate not null) nunca pode ser tocada de novo; uma linha aberta só pode ter vigente_ate preenchido (fechamento), nenhuma outra coluna.';

revoke all on function public.impedir_alteracao_convencao_horas_adicionais() from public, anon, authenticated;

create trigger empresa_convencao_horas_adicionais_impedir_alteracao
  before update on public.empresa_convencao_horas_adicionais
  for each row
  execute function public.impedir_alteracao_convencao_horas_adicionais();

-- =====================================================================
-- 4. Leitura centralizada - "quais convenções cruzam o período
--    [p_data_inicio, p_data_fim]" (chamando com data_inicio=data_fim,
--    responde "qual vale NESSA data específica"). SECURITY INVOKER -
--    nunca eleva privilégio para leitura, RLS do chamador já filtra por
--    empresa (o WHERE explícito abaixo é defensivo/redundante com a
--    RLS, não uma segunda fonte de verdade).
-- =====================================================================

create or replace function public.convencoes_horas_adicionais_no_periodo(
  p_data_inicio date,
  p_data_fim date
)
returns setof public.empresa_convencao_horas_adicionais
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select *
  from public.empresa_convencao_horas_adicionais
  where empresa_id = public.empresa_atual_id()
    and vigente_desde <= p_data_fim
    and (vigente_ate is null or vigente_ate >= p_data_inicio)
  order by vigente_desde asc;
$function$;

comment on function public.convencoes_horas_adicionais_no_periodo(date, date) is
  'Todas as convenções da empresa atual cujo intervalo [vigente_desde, vigente_ate] tem interseção com [p_data_inicio, p_data_fim]. Chamar com p_data_inicio=p_data_fim para "qual convenção vale nesta data específica" - NUNCA usar o atalho "linha com vigente_ate is null" para essa pergunta, pois a linha aberta pode ser uma vigência agendada para o futuro, distinta da que vale hoje.';

revoke all on function public.convencoes_horas_adicionais_no_periodo(date, date) from public, anon;
grant execute on function public.convencoes_horas_adicionais_no_periodo(date, date) to authenticated;

-- =====================================================================
-- 5. Function de transição - único caminho de escrita. Serializa por
--    empresa (pg_advisory_xact_lock) e rejeita qualquer sobreposição de
--    vigência explicitamente (daterange/&&, nativo do Postgres). Ordem
--    importa: localizar a aberta -> validar posterioridade -> FECHAR ->
--    só então checar sobreposição contra o estado final resultante.
--
--    ÚNICA diferença de conteúdo frente a
--    supabase/migrations/202608130001 (trilha histórica): a checagem de
--    permissão usa a autoridade canônica do baseline
--    (public.usuario_tem_permissao('admin.convencao_coletiva.gerenciar'),
--    errcode 42501 - insufficient_privilege, mesmo idioma de
--    005_engenharia.sql/006_pcp.sql/007_estoque.sql/etc.) em vez de
--    public.usuario_e_admin() (trilha histórica, lê public.profiles -
--    nunca reintroduzida aqui).
-- =====================================================================

create or replace function public.registrar_convencao_horas_adicionais(
  p_percentual_segunda_sexta numeric,
  p_percentual_sabado numeric,
  p_percentual_domingo numeric,
  p_percentual_feriado numeric,
  p_vigente_desde date
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_atual record;
  v_novo_id uuid;
begin
  if not public.usuario_tem_permissao('admin.convencao_coletiva.gerenciar') then
    raise exception 'Usuário sem permissão para gerenciar a convenção coletiva.' using errcode = '42501';
  end if;

  if v_empresa_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  -- Serializa por empresa: só uma transação por vez pode registrar uma
  -- nova convenção para esta empresa. Lock liberado automaticamente no
  -- fim da transação (commit ou rollback).
  perform pg_advisory_xact_lock(hashtextextended('empresa_convencao_horas_adicionais:' || v_empresa_id::text, 0));

  if p_vigente_desde < current_date then
    raise exception 'A vigência não pode começar no passado (%) - use uma data igual ou posterior a hoje (%). Agendar para o futuro continua permitido.', p_vigente_desde, current_date;
  end if;

  select * into v_atual
  from public.empresa_convencao_horas_adicionais
  where empresa_id = v_empresa_id and vigente_ate is null;

  -- v_atual.id IS NOT NULL - nunca "v_atual IS NOT NULL" sozinho: para
  -- tipos linha/composto, "row IS NOT NULL" só é verdadeiro quando TODOS
  -- os campos são não-nulos, e esta consulta filtra "vigente_ate is
  -- null" - QUALQUER linha encontrada tem, por definição, esse campo
  -- nulo.
  if v_atual.id is not null and p_vigente_desde <= v_atual.vigente_desde then
    raise exception 'A nova vigência (%) precisa ser posterior à vigência atual (%).', p_vigente_desde, v_atual.vigente_desde;
  end if;

  if v_atual.id is not null then
    update public.empresa_convencao_horas_adicionais
    set vigente_ate = p_vigente_desde - 1
    where id = v_atual.id;
  end if;

  -- Rejeita qualquer sobreposição com QUALQUER linha existente da
  -- empresa (não só a que acabou de ser fechada) - reforço explícito
  -- além da monotonicidade já garantida acima. Roda DEPOIS do
  -- fechamento acima, contra o ESTADO FINAL que resultaria da gravação.
  if exists (
    select 1
    from public.empresa_convencao_horas_adicionais c
    where c.empresa_id = v_empresa_id
      and daterange(c.vigente_desde, coalesce(c.vigente_ate + 1, 'infinity'::date))
          && daterange(p_vigente_desde, 'infinity'::date)
  ) then
    raise exception 'Sobreposição de vigência detectada para esta empresa - já existe uma convenção cobrindo parte do período a partir de %.', p_vigente_desde;
  end if;

  insert into public.empresa_convencao_horas_adicionais
    (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, created_by)
  values (v_empresa_id, p_percentual_segunda_sexta, p_percentual_sabado, p_percentual_domingo, p_percentual_feriado, p_vigente_desde, auth.uid())
  returning id into v_novo_id;

  return v_novo_id;
end;
$function$;

comment on function public.registrar_convencao_horas_adicionais(numeric, numeric, numeric, numeric, date) is
  'Único caminho de escrita para empresa_convencao_horas_adicionais - exige admin.convencao_coletiva.gerenciar (public.usuario_tem_permissao), serializado por empresa (pg_advisory_xact_lock), rejeita vigência retroativa (vigente_desde >= current_date) e qualquer sobreposição de período (daterange/&&). Fecha a convenção aberta anterior (vigente_ate = nova vigente_desde - 1) e insere a nova, atomicamente.';

revoke all on function public.registrar_convencao_horas_adicionais(numeric, numeric, numeric, numeric, date) from public, anon;
grant execute on function public.registrar_convencao_horas_adicionais(numeric, numeric, numeric, numeric, date) to authenticated;

commit;
