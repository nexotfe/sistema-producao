-- NEXOTFE-PCP-ETAPA2O.8B-I5 (Parte 2): integra a reserva exclusiva
-- (pcp_recalculo_execucao) com a movimentacao real de prioridade
-- (reordenar_fila_pcp) e cria o Historico de Prioridades
-- (pcp_fila_projetos_historico). Proposta de migration, NAO aplicada
-- em producao - validada apenas em sandbox descartavel.
--
-- Correcoes incorporadas (auditoria I1F + I5 Parte 1):
-- 1. reordenar_fila_pcp passa a EXIGIR p_execucao_id + p_motivo -
--    nunca move prioridade sem reserva valida nem sem justificativa.
-- 2. VINCULACAO DE IDENTIDADE (ponto levantado na auditoria da Parte 1:
--    "verificar permissao nao equivale a comprovar que e o mesmo
--    usuario que iniciou a reserva"): p_movido_por precisa ser
--    EXATAMENTE o iniciado_por da reserva em_andamento daquele
--    execucao_id - nunca so "um usuario valido da empresa com
--    permissao". Um segundo usuario da MESMA empresa, mesmo com
--    pcp.alterar_prioridade, nao pode usar o execucao_id de outro.
-- 3. Movimentacao da fila + evento do Historico de Prioridades
--    gravados na MESMA transacao (mesmo corpo de funcao) - se um
--    falhar, o outro nunca fica gravado sozinho.
-- 4. Assinatura antiga de 5 parametros e EXPLICITAMENTE REMOVIDA
--    (drop function) na mesma migration - nunca fica como caminho
--    alternativo capaz de mover prioridade sem reserva/justificativa.
begin;

-- =====================================================================
-- Historico de Prioridades - append-only, nunca editado.
-- =====================================================================
create table public.pcp_fila_projetos_historico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  projeto_id uuid not null,
  posicao_anterior numeric not null,
  posicao_nova numeric not null,
  movido_por uuid not null references public.usuarios (id),
  execucao_id uuid not null,
  motivo text not null check (length(btrim(motivo)) > 0),
  criado_em timestamptz not null default now()
);

comment on table public.pcp_fila_projetos_historico is
  'ETAPA 2O.8B-I5 Parte 2: 1 evento por movimentacao REAL de prioridade (nunca por posicao sequencial derivada - reordenar_fila_pcp so atualiza a linha do projeto movido). execucao_id vincula o evento a reserva ativa no momento da decisao - rastreabilidade, nunca autorizacao por si so. Append-only.';

alter table public.pcp_fila_projetos_historico enable row level security;

create policy pcp_fila_projetos_historico_select_tenant on public.pcp_fila_projetos_historico
  for select to authenticated using (empresa_id = public.empresa_atual_id());

revoke all privileges on table public.pcp_fila_projetos_historico from public, anon, authenticated;
grant select on table public.pcp_fila_projetos_historico to authenticated;

create or replace function public.impedir_update_delete_pcp_fila_historico()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  raise exception 'pcp_fila_projetos_historico: historico append-only, update/delete nunca permitido.';
end;
$function$;

create trigger pcp_fila_projetos_historico_impedir_alteracao
  before update or delete on public.pcp_fila_projetos_historico
  for each row execute function public.impedir_update_delete_pcp_fila_historico();

-- =====================================================================
-- Nova assinatura de reordenar_fila_pcp - exige reserva + motivo.
-- =====================================================================
create or replace function public.reordenar_fila_pcp(
  p_empresa_id uuid,
  p_projeto_id uuid,
  p_movido_por uuid,
  p_execucao_id uuid,
  p_motivo text,
  p_vizinho_anterior_projeto_id uuid default null,
  p_vizinho_seguinte_projeto_id uuid default null
)
returns table (posicao_nova numeric, evento_historico_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_movido_por_empresa_id uuid;
  v_reserva record;
  v_existe boolean;
  v_pos_anterior numeric;
  v_pos_seguinte numeric;
  v_posicao_atual numeric;
  v_nova_posicao numeric;
  v_evento_id uuid;
begin
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'reordenar_fila_pcp: motivo e obrigatorio.';
  end if;

  select empresa_id into v_movido_por_empresa_id from public.usuarios where id = p_movido_por;
  if v_movido_por_empresa_id is null or v_movido_por_empresa_id is distinct from p_empresa_id then
    raise exception 'reordenar_fila_pcp: movido_por % nao e um usuario valido da empresa %.', p_movido_por, p_empresa_id;
  end if;

  -- CORRECAO CENTRAL (auditoria Parte 1): a reserva precisa estar
  -- em_andamento para ESTA empresa, e p_movido_por precisa ser
  -- EXATAMENTE quem a iniciou - nunca so "um usuario valido da
  -- empresa com permissao". Isso fecha o uso indevido do execucao_id
  -- de outro usuario da MESMA empresa.
  select * into v_reserva from public.pcp_recalculo_execucao where empresa_id = p_empresa_id;
  if v_reserva is null or v_reserva.situacao != 'em_andamento' or v_reserva.execucao_id != p_execucao_id then
    raise exception 'reordenar_fila_pcp: execucao_id % nao corresponde a uma reserva em_andamento valida da empresa %.', p_execucao_id, p_empresa_id;
  end if;
  if v_reserva.iniciado_por is distinct from p_movido_por then
    raise exception 'reordenar_fila_pcp: movido_por % nao corresponde ao usuario que iniciou a execucao %.', p_movido_por, p_execucao_id;
  end if;

  -- CORRECAO (auditoria Parte 3): a reserva pode ter sido adquirida
  -- para dois contextos distintos (iniciar_recalculo_pcp). Mover a
  -- fila so e aceito se a reserva foi adquirida especificamente para
  -- alterar_prioridade - uma reserva de solicitar_calculo (recalculo
  -- independente) NUNCA pode ser usada para mover a fila, mesmo com
  -- identidade/permissao/empresa corretas. Barreira no banco, nao so
  -- confianca no codigo chamador.
  if v_reserva.contexto is distinct from 'alterar_prioridade' then
    raise exception 'reordenar_fila_pcp: execucao_id % foi adquirida no contexto % - apenas reservas do contexto alterar_prioridade podem mover a fila.', p_execucao_id, v_reserva.contexto;
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

  perform pg_advisory_xact_lock(hashtextextended('pcp_fila_projetos:' || p_empresa_id::text, 0));

  select posicao into v_posicao_atual from public.pcp_fila_projetos
    where empresa_id = p_empresa_id and projeto_id = p_projeto_id;
  if v_posicao_atual is null then
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

  -- Historico gravado na MESMA transacao - se isto falhar, o update
  -- acima tambem e desfeito (mesma funcao, mesmo bloco implicito).
  insert into public.pcp_fila_projetos_historico
    (empresa_id, projeto_id, posicao_anterior, posicao_nova, movido_por, execucao_id, motivo)
  values
    (p_empresa_id, p_projeto_id, v_posicao_atual, v_nova_posicao, p_movido_por, p_execucao_id, p_motivo)
  returning id into v_evento_id;

  return query select v_nova_posicao, v_evento_id;
end;
$function$;

comment on function public.reordenar_fila_pcp(uuid, uuid, uuid, uuid, text, uuid, uuid) is
  'ETAPA 2O.8B-I5 Parte 2/3: exige reserva em_andamento valida (execucao_id) cujo iniciado_por seja EXATAMENTE p_movido_por e cujo contexto seja alterar_prioridade - nunca so empresa+permissao. Motivo obrigatorio. Movimentacao da fila e evento do Historico de Prioridades gravados atomicamente. Mesma logica de posicionamento (rank intermediario por vizinhos) da versao anterior, preservada sem alteracao.';

revoke all on function public.reordenar_fila_pcp(uuid, uuid, uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reordenar_fila_pcp(uuid, uuid, uuid, uuid, text, uuid, uuid) to service_role;

-- CORRECAO OBRIGATORIA (auditoria I1F, reforcada na Parte 1): a
-- assinatura antiga de 5 parametros e removida explicitamente - nunca
-- pode permanecer como caminho alternativo sem reserva/justificativa.
drop function if exists public.reordenar_fila_pcp(uuid, uuid, uuid, uuid, uuid);

commit;
