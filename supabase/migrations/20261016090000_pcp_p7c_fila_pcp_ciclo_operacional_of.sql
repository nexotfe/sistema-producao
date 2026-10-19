-- PCP-P7C - Fila PCP + ciclo operacional da OF (liberacao/producao/
-- cancelamento/desdobramento), conforme desenho aprovado em
-- P7A/P7B/P7B.2.
--
-- Decisoes de negocio incorporadas (ver gates - nao redecididas aqui):
-- - liberacao PCP reaproveita estado_execucao (planejada/liberada/
--   em_producao/concluida/cancelada/desdobrada) - NUNCA um booleano
--   novo. suspensa existe no banco, nao e usada no fluxo v1.
-- - aprovar_of (ja em producao, migration 20260831212509) e liberar_of
--   permanecem acoes distintas - aprovar_of nunca e alterada aqui.
-- - motivo/observacao do eixo de execucao vai em
--   estado_execucao_observacao (coluna nova) - nunca reaproveita
--   estado_aprovacao_observacao.
-- - ordens_fabricacao_historico_estados (ja em producao) e estendida
--   aditivamente - nenhuma tabela de historico nova.
-- - revogacao de liberacao so antes do primeiro apontamento.
-- - cancelamento e terminal; em producao exige ausencia de sessao de
--   apontamento aberta.
-- - desdobramento so antes do primeiro apontamento (planejada/liberada,
--   nunca em_producao); filhas nascem com o Y VIGENTE da mae (nao o
--   Roteiro Mestre) - INV-PCP-26.
-- - indice de unicidade de OF raiz passa a excluir OFs canceladas.
--
-- Nao implementa UI. Nao integra Motor B. Nao aplica em producao.

-- =====================================================================
-- 1. Fila PCP - pcp_fila_projetos
-- =====================================================================
create table public.pcp_fila_projetos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  projeto_id uuid not null,
  entrada_em timestamptz not null default now(),
  posicao numeric not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid null references auth.users(id),
  constraint pcp_fila_projetos_projeto_empresa_fkey
    foreign key (projeto_id, empresa_id) references public.projetos(id, empresa_id),
  constraint pcp_fila_projetos_empresa_projeto_uniq unique (empresa_id, projeto_id),
  constraint pcp_fila_projetos_empresa_posicao_uniq unique (empresa_id, posicao)
);

comment on table public.pcp_fila_projetos is
  'PCP-P7C: fila persistente de Projetos no PCP. Uma linha por Projeto por empresa. entrada_em representa a PRIMEIRA entrada real (imutavel - nenhuma RPC/trigger a atualiza depois do insert). posicao e numeric (rank intermediario) para permitir reordenacao sem renumerar em lote.';

comment on column public.pcp_fila_projetos.entrada_em is
  'Imutavel. Reaprovacao/correcao posterior de projetos.status nunca recria esta linha nem altera este valor (ON CONFLICT DO NOTHING no trigger de entrada).';

alter table public.pcp_fila_projetos enable row level security;

create policy pcp_fila_projetos_select_tenant
  on public.pcp_fila_projetos for select to authenticated
  using (empresa_id = public.empresa_atual_id());

revoke all on public.pcp_fila_projetos from public, anon, authenticated;
grant select on public.pcp_fila_projetos to authenticated;

-- =====================================================================
-- 2. Entrada automatica na fila - trigger em projetos.status -> 'aprovado'
-- =====================================================================
create or replace function public.trg_projetos_entrar_fila_pcp()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nova_posicao numeric;
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    perform pg_advisory_xact_lock(hashtextextended('pcp_fila_projetos:' || new.empresa_id::text, 0));

    select coalesce(max(posicao), 0) + 1000 into v_nova_posicao
    from public.pcp_fila_projetos
    where empresa_id = new.empresa_id;

    insert into public.pcp_fila_projetos (empresa_id, projeto_id, posicao)
    values (new.empresa_id, new.id, v_nova_posicao)
    on conflict (empresa_id, projeto_id) do nothing;
  end if;

  return new;
end;
$function$;

comment on function public.trg_projetos_entrar_fila_pcp() is
  'PCP-P7C: entrada automatica e idempotente na fila PCP, mesma transacao da aprovacao do projeto. ON CONFLICT DO NOTHING garante que uma segunda transicao para aprovado (reaprovacao/correcao) nunca recria a linha nem move entrada_em - o projeto nunca "sai e entra de novo" como novo.';

revoke all on function public.trg_projetos_entrar_fila_pcp() from public, anon, authenticated, service_role;

create trigger projetos_entrar_fila_pcp
  after update of status on public.projetos
  for each row
  when (old.status is distinct from new.status)
  execute function public.trg_projetos_entrar_fila_pcp();

-- =====================================================================
-- 3. Reordenacao da fila - reordenar_fila_pcp
-- =====================================================================
create or replace function public.reordenar_fila_pcp(
  p_empresa_id uuid,
  p_projeto_id uuid,
  p_movido_por uuid,
  p_vizinho_anterior_projeto_id uuid default null,
  p_vizinho_seguinte_projeto_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_movido_por_empresa_id uuid;
  v_existe boolean;
  v_pos_anterior numeric;
  v_pos_seguinte numeric;
  v_nova_posicao numeric;
begin
  select empresa_id into v_movido_por_empresa_id from public.usuarios where id = p_movido_por;
  if v_movido_por_empresa_id is null or v_movido_por_empresa_id is distinct from p_empresa_id then
    raise exception 'reordenar_fila_pcp: movido_por % nao e um usuario valido da empresa %.', p_movido_por, p_empresa_id;
  end if;

  if p_vizinho_anterior_projeto_id is null and p_vizinho_seguinte_projeto_id is null then
    raise exception 'reordenar_fila_pcp: informe ao menos um vizinho (anterior ou seguinte) - nao aceita posicao arbitraria sem contexto.';
  end if;

  if p_vizinho_anterior_projeto_id is not null and p_vizinho_anterior_projeto_id = p_projeto_id then
    raise exception 'reordenar_fila_pcp: vizinho anterior nao pode ser o proprio projeto movido.';
  end if;
  if p_vizinho_seguinte_projeto_id is not null and p_vizinho_seguinte_projeto_id = p_projeto_id then
    raise exception 'reordenar_fila_pcp: vizinho seguinte nao pode ser o proprio projeto movido.';
  end if;

  -- mesmo namespace de lock usado pela entrada automatica - serializa
  -- toda escrita de posicao desta empresa.
  perform pg_advisory_xact_lock(hashtextextended('pcp_fila_projetos:' || p_empresa_id::text, 0));

  select exists(
    select 1 from public.pcp_fila_projetos where empresa_id = p_empresa_id and projeto_id = p_projeto_id
  ) into v_existe;
  if not v_existe then
    raise exception 'reordenar_fila_pcp: projeto % nao esta na fila da empresa %.', p_projeto_id, p_empresa_id;
  end if;

  if p_vizinho_anterior_projeto_id is not null then
    select posicao into v_pos_anterior from public.pcp_fila_projetos
      where empresa_id = p_empresa_id and projeto_id = p_vizinho_anterior_projeto_id;
    if v_pos_anterior is null then
      raise exception 'reordenar_fila_pcp: vizinho anterior % nao esta na fila da empresa %.', p_vizinho_anterior_projeto_id, p_empresa_id;
    end if;
  end if;

  if p_vizinho_seguinte_projeto_id is not null then
    select posicao into v_pos_seguinte from public.pcp_fila_projetos
      where empresa_id = p_empresa_id and projeto_id = p_vizinho_seguinte_projeto_id;
    if v_pos_seguinte is null then
      raise exception 'reordenar_fila_pcp: vizinho seguinte % nao esta na fila da empresa %.', p_vizinho_seguinte_projeto_id, p_empresa_id;
    end if;
  end if;

  if v_pos_anterior is not null and v_pos_seguinte is not null then
    v_nova_posicao := (v_pos_anterior + v_pos_seguinte) / 2;
  elsif v_pos_anterior is not null then
    v_nova_posicao := v_pos_anterior + 1000;
  else
    v_nova_posicao := v_pos_seguinte - 1000;
  end if;

  update public.pcp_fila_projetos
    set posicao = v_nova_posicao, atualizado_em = now(), atualizado_por = p_movido_por
    where empresa_id = p_empresa_id and projeto_id = p_projeto_id;

  return v_nova_posicao;
end;
$function$;

comment on function public.reordenar_fila_pcp(uuid, uuid, uuid, uuid, uuid) is
  'PCP-P7C: move um projeto na fila informando vizinhos (nunca uma posicao arbitraria) - a RPC resolve as posicoes reais e calcula o rank intermediario. Advisory lock por empresa serializa reordenacoes concorrentes.';

revoke all on function public.reordenar_fila_pcp(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reordenar_fila_pcp(uuid, uuid, uuid, uuid, uuid) to service_role;

-- =====================================================================
-- 4. Coluna de observacao do eixo de execucao (nunca reaproveita
--    estado_aprovacao_observacao, que continua exclusiva de
--    aprovar_of/reprovar_of/resubmeter_of_para_auditoria).
-- =====================================================================
alter table public.ordens_fabricacao
  add column estado_execucao_observacao text null;

comment on column public.ordens_fabricacao.estado_execucao_observacao is
  'PCP-P7C: observacao/motivo das transicoes do eixo estado_execucao (liberar/revogar/cancelar/desdobrar) - eixo distinto de estado_aprovacao_observacao, nunca reaproveitado.';

create index ordens_fabricacao_empresa_estado_execucao_idx
  on public.ordens_fabricacao (empresa_id, estado_execucao);

-- =====================================================================
-- 5. Historico - extensao aditiva de ordens_fabricacao_historico_estados
--    e registrar_historico_estado_of (ja em producao). Nenhuma tabela
--    nova.
-- =====================================================================
alter table public.ordens_fabricacao_historico_estados
  add column observacao_execucao text null;

comment on column public.ordens_fabricacao_historico_estados.observacao_execucao is
  'PCP-P7C: copia de ordens_fabricacao.estado_execucao_observacao no momento da transicao - eixo distinto de observacao (que continua ligada a estado_aprovacao_observacao). Mudanca aditiva - nao altera o significado de observacao.';

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
    alterado_por, observacao, observacao_execucao, origem
  ) values (
    new.empresa_id, new.id,
    v_estado_aprovacao_anterior, new.estado_aprovacao,
    v_estado_execucao_anterior, new.estado_execucao,
    v_alterado_por, new.estado_aprovacao_observacao, new.estado_execucao_observacao, v_origem
  );

  return new;
end;
$$;

comment on function public.registrar_historico_estado_of() is
  '4D0: unico ponto de traducao entre status (legado) e estado_aprovacao/estado_execucao (novo). PCP-P7C (aditivo): tambem registra observacao_execucao (estado_execucao_observacao) a cada transicao - comportamento de observacao (estado_aprovacao_observacao) inalterado.';

-- =====================================================================
-- 6. Correcao do indice de unicidade de OF raiz - exclui canceladas.
--    Sem isso, "OF cancelada -> nova OF raiz para o mesmo item" (regra
--    de negocio fechada em P7B.2) nao e cumprivel pelo banco.
-- =====================================================================
drop index public.ordens_fabricacao_projeto_item_raiz_uniq;

create unique index ordens_fabricacao_projeto_item_raiz_uniq
  on public.ordens_fabricacao (projeto_item_id)
  where projeto_item_id is not null
    and of_pai_id is null
    and of_origem_retrabalho_id is null
    and estado_execucao <> 'cancelada';

comment on index public.ordens_fabricacao_projeto_item_raiz_uniq is
  'PCP-P7C: acrescenta "and estado_execucao <> cancelada" ao predicado (P6E/T17 ja excluia retrabalho). Garante no maximo uma OF-raiz normal ATIVA (nao cancelada) por projeto_item_id - uma OF cancelada libera o item para uma OF substituta, sem apagar nem reutilizar a cancelada.';

-- =====================================================================
-- 7. liberar_of - planejada -> liberada (so com aprovada+planejada)
-- =====================================================================
create or replace function public.liberar_of(
  p_of_id uuid,
  p_liberado_por uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_of record;
  v_empresa_id uuid;
  v_liberado_por_empresa_id uuid;
begin
  select empresa_id into v_empresa_id from public.ordens_fabricacao where id = p_of_id;
  if v_empresa_id is null then
    raise exception 'liberar_of: OF % nao encontrada.', p_of_id;
  end if;

  select empresa_id into v_liberado_por_empresa_id from public.usuarios where id = p_liberado_por;
  if v_liberado_por_empresa_id is null or v_liberado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'liberar_of: liberado_por % nao e um usuario valido da empresa % da OF %.', p_liberado_por, v_empresa_id, p_of_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));

  select * into v_of from public.ordens_fabricacao where id = p_of_id;

  if v_of.estado_aprovacao = 'aprovada' and v_of.estado_execucao = 'liberada' then
    return jsonb_build_object('resultado', 'ja_liberada', 'of_id', v_of.id, 'numero_of', v_of.numero_of);
  end if;

  if v_of.estado_aprovacao is distinct from 'aprovada' or v_of.estado_execucao is distinct from 'planejada' then
    raise exception 'liberar_of: OF % em %/% nao pode ser liberada - precisa estar aprovada+planejada.', p_of_id, v_of.estado_aprovacao, v_of.estado_execucao;
  end if;

  update public.ordens_fabricacao
    set estado_execucao = 'liberada',
        estado_execucao_observacao = p_motivo
    where id = p_of_id
      and estado_aprovacao = 'aprovada'
      and estado_execucao = 'planejada';

  if not found then
    raise exception 'liberar_of: falha ao liberar OF % - estado mudou durante a operacao.', p_of_id;
  end if;

  return jsonb_build_object('resultado', 'liberada', 'of_id', p_of_id, 'numero_of', v_of.numero_of);
end;
$function$;

comment on function public.liberar_of(uuid, uuid, text) is
  'PCP-P7C: decisao do PCP, por OF, autorizando producao (aprovada+planejada -> aprovada+liberada). Distinta de aprovar_of (gate estrutural + necessidade de material) - nunca fundidas. Idempotente (ja_liberada sem efeito colateral). Motivo opcional, gravado em estado_execucao_observacao. Autorizacao por Grupo de Acesso/Permissao fica para gate futuro - ACL tecnica aqui e service_role-only.';

revoke all on function public.liberar_of(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.liberar_of(uuid, uuid, text) to service_role;

-- =====================================================================
-- 8. revogar_liberacao_of - liberada -> planejada, so antes do 1o Z
-- =====================================================================
create or replace function public.revogar_liberacao_of(
  p_of_id uuid,
  p_revogado_por uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_of record;
  v_empresa_id uuid;
  v_revogado_por_empresa_id uuid;
  v_existe_apontamento boolean;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'revogar_liberacao_of: motivo e obrigatorio.';
  end if;

  select empresa_id into v_empresa_id from public.ordens_fabricacao where id = p_of_id;
  if v_empresa_id is null then
    raise exception 'revogar_liberacao_of: OF % nao encontrada.', p_of_id;
  end if;

  select empresa_id into v_revogado_por_empresa_id from public.usuarios where id = p_revogado_por;
  if v_revogado_por_empresa_id is null or v_revogado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'revogar_liberacao_of: revogado_por % nao e um usuario valido da empresa % da OF %.', p_revogado_por, v_empresa_id, p_of_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));

  select * into v_of from public.ordens_fabricacao where id = p_of_id;

  if v_of.estado_aprovacao is distinct from 'aprovada' or v_of.estado_execucao is distinct from 'liberada' then
    raise exception 'revogar_liberacao_of: OF % em %/% nao esta liberada - nao ha o que revogar.', p_of_id, v_of.estado_aprovacao, v_of.estado_execucao;
  end if;

  select exists(
    select 1
    from public.of_apontamentos a
    join public.ordens_fabricacao_operacoes op on op.id = a.op_id
    where op.of_id = p_of_id
  ) into v_existe_apontamento;

  if v_existe_apontamento then
    raise exception 'Esta OF ja possui producao iniciada. A revogacao de liberacao nao se aplica. Suspensao de OF em execucao ainda nao esta implementada.';
  end if;

  update public.ordens_fabricacao
    set estado_execucao = 'planejada',
        estado_execucao_observacao = p_motivo
    where id = p_of_id
      and estado_aprovacao = 'aprovada'
      and estado_execucao = 'liberada';

  if not found then
    raise exception 'revogar_liberacao_of: falha ao revogar OF % - estado mudou durante a operacao.', p_of_id;
  end if;

  return jsonb_build_object('resultado', 'revogada', 'of_id', p_of_id, 'numero_of', v_of.numero_of);
end;
$function$;

comment on function public.revogar_liberacao_of(uuid, uuid, text) is
  'PCP-P7C: liberada -> planejada, somente se nunca houve of_apontamentos para nenhuma OP da OF. Motivo obrigatorio e nao vazio. Depois do primeiro apontamento a OF ja esta em_producao - revogacao nao se aplica (consequencia do fluxo, nao bloqueio arbitrario). Suspensao de OF em execucao e pendencia futura, nao implementada.';

revoke all on function public.revogar_liberacao_of(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.revogar_liberacao_of(uuid, uuid, text) to service_role;

-- =====================================================================
-- 9. cancelar_of - terminal; em_producao exige ausencia de sessao aberta
-- =====================================================================
create or replace function public.cancelar_of(
  p_of_id uuid,
  p_cancelado_por uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_of record;
  v_empresa_id uuid;
  v_cancelado_por_empresa_id uuid;
  v_existe_sessao_aberta boolean;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'cancelar_of: motivo e obrigatorio.';
  end if;

  select empresa_id into v_empresa_id from public.ordens_fabricacao where id = p_of_id;
  if v_empresa_id is null then
    raise exception 'cancelar_of: OF % nao encontrada.', p_of_id;
  end if;

  select empresa_id into v_cancelado_por_empresa_id from public.usuarios where id = p_cancelado_por;
  if v_cancelado_por_empresa_id is null or v_cancelado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'cancelar_of: cancelado_por % nao e um usuario valido da empresa % da OF %.', p_cancelado_por, v_empresa_id, p_of_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));

  select * into v_of from public.ordens_fabricacao where id = p_of_id;

  -- ACHADO REAL (verificado na matriz estados_of_combinacoes_validas):
  -- nao existe par (aguardando_auditoria, cancelada) - so (reprovada,
  -- cancelada) e (aprovada, cancelada). OF ainda em auditoria usa
  -- reprovar_of (ja existente), nunca cancelar_of.
  if v_of.estado_aprovacao is distinct from 'aprovada' then
    raise exception 'cancelar_of: OF % nao esta aprovada (estado_aprovacao=%) - use reprovar_of para OFs ainda em auditoria.', p_of_id, v_of.estado_aprovacao;
  end if;

  if v_of.estado_execucao not in ('planejada', 'liberada', 'em_producao') then
    raise exception 'cancelar_of: OF % em estado_execucao=% nao pode ser cancelada por esta via.', p_of_id, v_of.estado_execucao;
  end if;

  if v_of.estado_execucao = 'em_producao' then
    select exists(
      select 1
      from public.ordens_fabricacao_operacoes op
      where op.of_id = p_of_id
        and exists (
          select 1 from public.of_apontamentos a
          where a.op_id = op.id
            and a.ocorrido_em = (
              select max(a2.ocorrido_em) from public.of_apontamentos a2 where a2.op_id = op.id
            )
            and a.tipo_evento in ('iniciar', 'retomar')
        )
    ) into v_existe_sessao_aberta;

    if v_existe_sessao_aberta then
      raise exception 'Existe apontamento em andamento nesta OF. Pause ou finalize a sessao antes de cancelar.';
    end if;
  end if;

  update public.ordens_fabricacao
    set estado_execucao = 'cancelada',
        estado_execucao_observacao = p_motivo
    where id = p_of_id
      and estado_execucao = v_of.estado_execucao;

  if not found then
    raise exception 'cancelar_of: falha ao cancelar OF % - estado mudou durante a operacao.', p_of_id;
  end if;

  return jsonb_build_object('resultado', 'cancelada', 'of_id', p_of_id, 'numero_of', v_of.numero_of);
end;
$function$;

comment on function public.cancelar_of(uuid, uuid, text) is
  'PCP-P7C: {planejada,liberada,em_producao} -> cancelada, terminal (nunca reabre). Motivo obrigatorio. Em em_producao, exige ausencia de sessao de apontamento aberta em qualquer OP - evita deixar colaborador "preso" numa OP ativa. Y/Z/historico/OPs preservados integralmente (nunca apagados).';

revoke all on function public.cancelar_of(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancelar_of(uuid, uuid, text) to service_role;

-- =====================================================================
-- 10. desdobrar_of - cria filhas a partir do Y VIGENTE da mae (INV-PCP-26)
-- =====================================================================
create or replace function public.desdobrar_of(
  p_of_mae_id uuid,
  p_desdobrado_por uuid,
  p_filhas jsonb,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mae record;
  v_empresa_id uuid;
  v_desdobrado_por_empresa_id uuid;
  v_existe_apontamento boolean;
  v_filha jsonb;
  v_nova_of_id uuid;
  v_novo_numero text;
  v_resultado jsonb := '[]'::jsonb;
  v_op_mae record;
  v_nova_op_id uuid;
  v_map_ops jsonb;
  v_dep record;
  v_sub_anterior text;
begin
  if jsonb_typeof(p_filhas) is distinct from 'array' or jsonb_array_length(p_filhas) < 1 then
    raise exception 'desdobrar_of: p_filhas precisa ser um array JSON com pelo menos 1 elemento.';
  end if;

  select empresa_id into v_empresa_id from public.ordens_fabricacao where id = p_of_mae_id;
  if v_empresa_id is null then
    raise exception 'desdobrar_of: OF % nao encontrada.', p_of_mae_id;
  end if;

  select empresa_id into v_desdobrado_por_empresa_id from public.usuarios where id = p_desdobrado_por;
  if v_desdobrado_por_empresa_id is null or v_desdobrado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'desdobrar_of: desdobrado_por % nao e um usuario valido da empresa % da OF %.', p_desdobrado_por, v_empresa_id, p_of_mae_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_mae_id::text, 0));

  select * into v_mae from public.ordens_fabricacao where id = p_of_mae_id;

  if v_mae.estado_aprovacao is distinct from 'aprovada' then
    raise exception 'desdobrar_of: OF % precisa estar aprovada (estado_aprovacao=%).', p_of_mae_id, v_mae.estado_aprovacao;
  end if;

  if v_mae.estado_execucao not in ('planejada', 'liberada') then
    raise exception 'desdobrar_of: OF % em estado_execucao=% nao pode ser desdobrada - so planejada ou liberada, nunca em_producao.', p_of_mae_id, v_mae.estado_execucao;
  end if;

  select exists(
    select 1
    from public.of_apontamentos a
    join public.ordens_fabricacao_operacoes op on op.id = a.op_id
    where op.of_id = p_of_mae_id
  ) into v_existe_apontamento;

  if v_existe_apontamento then
    raise exception 'desdobrar_of: OF % ja possui apontamento registrado - desdobramento nao e permitido depois do primeiro apontamento.', p_of_mae_id;
  end if;

  -- ACHADO REAL (sandbox, mesmo padrao do T17/P6E em criar_of_retrabalho):
  -- esta RPC roda sob service_role (sem JWT) - gerar_numero_of(), chamado
  -- pelo trigger de numeracao no INSERT das filhas, depende de
  -- empresa_atual_id(), que depende de auth.uid()/request.jwt.claim.sub.
  v_sub_anterior := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', p_desdobrado_por::text, true);

  for v_filha in select * from jsonb_array_elements(p_filhas)
  loop
    if not (v_filha ? 'quantidade') or (v_filha->>'quantidade')::numeric <= 0 then
      raise exception 'desdobrar_of: cada filha precisa de quantidade > 0: %', v_filha;
    end if;

    insert into public.ordens_fabricacao (
      empresa_id, projeto_id, projeto_item_id, produto_id, bom_id,
      quantidade_planejada, unidade, created_by,
      estado_aprovacao, estado_execucao, of_pai_id
    ) values (
      v_empresa_id, v_mae.projeto_id, v_mae.projeto_item_id, v_mae.produto_id, v_mae.bom_id,
      (v_filha->>'quantidade')::numeric, v_mae.unidade, p_desdobrado_por,
      'aprovada', 'planejada', p_of_mae_id
    )
    returning id, numero_of into v_nova_of_id, v_novo_numero;

    -- INV-PCP-26: cada OP da filha nasce copiando o Y VIGENTE da mae
    -- (codigo/descricao/recurso/tempo/sequencia/nao_aplicavel), nunca
    -- recriada a partir do Roteiro Mestre. Mapa antigo->novo id so
    -- para recriar dependencias desta filha, nunca cruza para outra.
    v_map_ops := '{}'::jsonb;

    for v_op_mae in
      select * from public.ordens_fabricacao_operacoes where of_id = p_of_mae_id
    loop
      insert into public.ordens_fabricacao_operacoes (
        empresa_id, of_id, origem, bom_operacao_id,
        codigo_operacional, descricao, recurso_vigente_id, tempo_vigente_minutos,
        sequencia_vigente, nao_aplicavel, motivo_nao_aplicavel, observacao, created_by
      ) values (
        v_empresa_id, v_nova_of_id, v_op_mae.origem, v_op_mae.bom_operacao_id,
        v_op_mae.codigo_operacional, v_op_mae.descricao, v_op_mae.recurso_vigente_id, v_op_mae.tempo_vigente_minutos,
        v_op_mae.sequencia_vigente, v_op_mae.nao_aplicavel, v_op_mae.motivo_nao_aplicavel, v_op_mae.observacao, p_desdobrado_por
      )
      returning id into v_nova_op_id;

      insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
        values (v_empresa_id, v_nova_op_id, 'criacao', null, 'OP criada por desdobramento de lote (Y vigente copiado da OP ' || v_op_mae.id::text || ' da OF-mae)', p_desdobrado_por, p_motivo);

      v_map_ops := v_map_ops || jsonb_build_object(v_op_mae.id::text, v_nova_op_id::text);
    end loop;

    -- recria dependencias do Y vigente da mae, apontando so para os
    -- novos ids desta filha - nunca para mae nem para outra filha.
    for v_dep in
      select d.op_origem_id, d.op_dependente_id
      from public.of_operacao_dependencias d
      join public.ordens_fabricacao_operacoes op on op.id = d.op_origem_id
      where op.of_id = p_of_mae_id
    loop
      insert into public.of_operacao_dependencias (empresa_id, op_origem_id, op_dependente_id, created_by)
      values (
        v_empresa_id,
        (v_map_ops ->> v_dep.op_origem_id::text)::uuid,
        (v_map_ops ->> v_dep.op_dependente_id::text)::uuid,
        p_desdobrado_por
      )
      on conflict (op_origem_id, op_dependente_id) do nothing;
    end loop;

    v_resultado := v_resultado || jsonb_build_object('of_id', v_nova_of_id, 'numero_of', v_novo_numero, 'quantidade', (v_filha->>'quantidade')::numeric);
  end loop;

  -- validar_hierarquia_of (deferred, SECURITY DEFINER desde P6F.1)
  -- valida no COMMIT que a soma das filhas fecha com a quantidade da
  -- mae - nao revalidado aqui manualmente, de proposito.
  update public.ordens_fabricacao
    set estado_execucao = 'desdobrada',
        estado_execucao_observacao = p_motivo
    where id = p_of_mae_id
      and estado_execucao = v_mae.estado_execucao;

  if not found then
    raise exception 'desdobrar_of: falha ao marcar OF % como desdobrada - estado mudou durante a operacao.', p_of_mae_id;
  end if;

  perform set_config('request.jwt.claim.sub', v_sub_anterior, true);

  return jsonb_build_object('resultado', 'desdobrada', 'of_mae_id', p_of_mae_id, 'filhas', v_resultado);
end;
$function$;

comment on function public.desdobrar_of(uuid, uuid, jsonb, text) is
  'PCP-P7C: so antes do primeiro apontamento (planejada/liberada, nunca em_producao). Cada filha nasce aprovada+planejada, of_pai_id=mae (of_raiz_id resolvido por validar_e_resolver_of_pai), com OPs proprias copiando o Y VIGENTE da mae no instante do desdobramento (INV-PCP-26) - nunca recriadas do Roteiro Mestre. Dependencias recriadas so com ids internos da filha. Mae vira desdobrada (fora do Motor B, nao inicia/retoma, Y congelado). Soma das filhas validada pelo trigger de hierarquia existente (deferred, sem revalidacao manual aqui).';

revoke all on function public.desdobrar_of(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.desdobrar_of(uuid, uuid, jsonb, text) to service_role;

-- =====================================================================
-- 11. registrar_apontamento - gate de liberacao/producao (aditivo)
-- =====================================================================
create or replace function public.registrar_apontamento(
  p_op_id uuid,
  p_funcionario_id uuid,
  p_tipo_evento text,
  p_ocorrido_em timestamptz,
  p_recurso_real_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_of_id uuid;
  v_estado_execucao_of text;
  v_timezone text;
  v_dia_local date;
  v_pausas_hoje integer;
  v_sessoes_ativas integer;
  v_novo_id uuid;
begin
  if p_tipo_evento not in ('iniciar', 'pausar', 'retomar', 'finalizar') then
    raise exception 'tipo_evento invalido: %.', p_tipo_evento;
  end if;

  select op.empresa_id, op.of_id into v_empresa_id, v_of_id
  from public.ordens_fabricacao_operacoes op
  where op.id = p_op_id;

  if v_empresa_id is null then
    raise exception 'OP % nao encontrada.', p_op_id;
  end if;

  select estado_execucao into v_estado_execucao_of from public.ordens_fabricacao where id = v_of_id;

  -- PCP-P7C: iniciar exige OF liberada ou ja em producao (OP seguinte
  -- da mesma OF); retomar exige OF ja em producao (o estado ja
  -- avancou - nao depende de liberada). pausar/finalizar nunca
  -- bloqueados por liberacao - so encerram trabalho ja em curso.
  if p_tipo_evento = 'iniciar' then
    if v_estado_execucao_of not in ('liberada', 'em_producao') then
      raise exception 'OF % nao esta liberada (estado_execucao=%) - nao e possivel iniciar apontamento.', v_of_id, v_estado_execucao_of;
    end if;
  elsif p_tipo_evento = 'retomar' then
    if v_estado_execucao_of is distinct from 'em_producao' then
      raise exception 'OF % nao esta em producao (estado_execucao=%) - nao e possivel retomar apontamento.', v_of_id, v_estado_execucao_of;
    end if;
  end if;

  select timezone into v_timezone from public.empresas where id = v_empresa_id;
  v_dia_local := (p_ocorrido_em at time zone v_timezone)::date;

  -- Serializa por funcionario (PCP-P6D.1 Parte F/28 - evita ultrapassar
  -- os limites sob concorrencia real).
  perform pg_advisory_xact_lock(hashtextextended('funcionario_apontamento:' || p_funcionario_id::text, 0));

  if p_tipo_evento = 'pausar' then
    select count(*) into v_pausas_hoje
    from public.of_apontamentos
    where funcionario_id = p_funcionario_id
      and tipo_evento = 'pausar'
      and (ocorrido_em at time zone v_timezone)::date = v_dia_local;

    if v_pausas_hoje >= 4 then
      raise exception 'Funcionario % ja realizou 4 pausas hoje (dia local %) - limite diario atingido (PCP-P6C.4).', p_funcionario_id, v_dia_local;
    end if;
  end if;

  if p_tipo_evento = 'iniciar' then
    -- Sessao ativa = ultimo evento do funcionario (em qualquer OP) e
    -- 'iniciar' ou 'retomar' (pausada NAO conta - PCP-P6D.1 Parte 17/P).
    select count(*) into v_sessoes_ativas
    from (
      select distinct a.op_id
      from public.of_apontamentos a
      where a.funcionario_id = p_funcionario_id
        and a.ocorrido_em = (
          select max(a2.ocorrido_em) from public.of_apontamentos a2
          where a2.funcionario_id = p_funcionario_id and a2.op_id = a.op_id
        )
        and a.tipo_evento in ('iniciar', 'retomar')
    ) ativas;

    if v_sessoes_ativas >= 3 then
      raise exception 'Funcionario % ja possui 3 OPs simultaneamente ativas - limite atingido (PCP-P6C.4).', p_funcionario_id;
    end if;
  end if;

  insert into public.of_apontamentos (
    empresa_id, of_id, op_id, funcionario_id, recurso_real_id, tipo_evento, ocorrido_em
  ) values (
    v_empresa_id, v_of_id, p_op_id, p_funcionario_id, p_recurso_real_id, p_tipo_evento, p_ocorrido_em
  )
  returning id into v_novo_id;

  -- PCP-P7C: primeiro inicio real promove a OF - na mesma transacao,
  -- antes do evento Z ja estar gravado. Condicional (WHERE
  -- estado_execucao='liberada') e seguro sob concorrencia - a segunda
  -- chamada simultanea so encontra 0 linhas, sem erro.
  if p_tipo_evento = 'iniciar' and v_estado_execucao_of = 'liberada' then
    update public.ordens_fabricacao
      set estado_execucao = 'em_producao'
      where id = v_of_id and estado_execucao = 'liberada';
  end if;

  return v_novo_id;
end;
$function$;

comment on function public.registrar_apontamento(uuid, uuid, text, timestamptz, uuid) is
  'Unico ponto de escrita de Z normal (PCP-P6E Parte S.6). PCP-P7C: iniciar exige OF liberada/em_producao; retomar exige em_producao (nao depende de liberada - o estado ja avancou); pausar/finalizar nunca bloqueados por liberacao. Primeiro iniciar real promove liberada->em_producao na mesma transacao. Dia local calculado via empresas.timezone. 4a pausa permitida, 5a bloqueada. 3 OPs simultaneas permitidas, 4a bloqueada - sessao pausada nao ocupa vaga. Nao exige auth.users do funcionario - so funcionario_id.';

-- =====================================================================
-- 12. ACL - fail-closed desde o nascimento (regra permanente herdada
--     do P6E.1) para todas as RPCs novas deste gate.
-- =====================================================================
-- (ja aplicado individualmente apos cada CREATE OR REPLACE acima -
-- reafirmado aqui por clareza de auditoria, idempotente)
revoke all on function public.liberar_of(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.revogar_liberacao_of(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cancelar_of(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.desdobrar_of(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.reordenar_fila_pcp(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
