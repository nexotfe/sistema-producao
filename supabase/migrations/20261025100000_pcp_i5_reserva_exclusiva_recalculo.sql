-- NEXOTFE-PCP-ETAPA2O.8B-I5 (Parte 1, revisao apos auditoria): reserva
-- exclusiva de recalculo por empresa. Camada estritamente de CONTROLE
-- DE CONCORRENCIA - nunca decide nada de negocio do PCP, nunca grava
-- previsao, nunca move prioridade. Proposta de migration, NAO aplicada
-- em producao nesta rodada - validada apenas em sandbox descartavel.
--
-- Correcoes desta revisao (3 ressalvas da auditoria):
-- 1. iniciar_recalculo_pcp agora EXIGE pcp.solicitar_calculo (reaproveitada
--    do catalogo existente - iniciar um recalculo e literalmente
--    solicitar um calculo). confirmar_recuperacao_pcp agora EXIGE uma
--    permissao NOVA e dedicada, pcp.confirmar_recuperacao_recalculo
--    (categoria sensivel) - nunca qualquer usuario ativo da empresa.
-- 2. confirmar_recuperacao_pcp passa a exigir p_motivo (obrigatorio,
--    nao vazio) e grava evento de auditoria em
--    pcp_recalculo_recuperacoes (quem, quando, motivo, qual execucao).
-- 4. CONTEXTO DE AQUISICAO (auditoria da Parte 3): a reserva passa a
--    exigir p_contexto ('alterar_prioridade' ou 'solicitar_calculo').
--    A FUNCAO, nunca o chamador, decide qual permissao aquele contexto
--    exige - o chamador so declara QUAL OPERACAO esta realizando,
--    nunca QUAL PERMISSAO checar. Isso preserva as duas regras de
--    negocio corretas e distintas: mover prioridade (com recalculo
--    decorrente) exige so pcp.alterar_prioridade; solicitar recalculo
--    independente exige pcp.solicitar_calculo - sem acoplar as duas.
--    reordenar_fila_pcp (Parte 2) e quem impede, no banco, que uma
--    reserva adquirida no contexto solicitar_calculo seja usada para
--    mover a fila.
-- 3. ACHADO HONESTO, NAO RESOLVIDO: confirmar a recuperacao NUNCA e
--    equivalente a confirmar o encerramento seguro da Worker anterior -
--    nao existe, hoje, nenhuma evidencia tecnica capaz de provar isso
--    (ver Etapas I2/I3/I4). A unica mitigacao disponivel sem nova
--    infraestrutura e uma MARGEM ADICIONAL de seguranca, alem de
--    expira_em, antes que a confirmacao seja aceita - isso reduz a
--    janela de risco, NUNCA a elimina. p_margem_adicional_segundos e
--    OBRIGATORIO (sem default) porque o valor exato e decisao de
--    negocio do proprietario, ancorada no maxDuration real da
--    plataforma (ainda nao confirmado - ver I2/I3), nunca inferida
--    por esta migration.
begin;

create table public.pcp_recalculo_execucao (
  empresa_id uuid primary key references public.empresas (id),
  execucao_id uuid not null,
  iniciado_por uuid not null references public.usuarios (id),
  contexto text not null check (contexto in ('alterar_prioridade', 'solicitar_calculo')),
  iniciado_em timestamptz not null,
  expira_em timestamptz not null,
  situacao text not null check (situacao in ('em_andamento', 'concluida', 'falhou', 'recuperacao_pendente')),
  atualizado_em timestamptz not null default now()
);

comment on table public.pcp_recalculo_execucao is
  'ETAPA 2O.8B-I5: reserva exclusiva de recalculo do Motor por empresa - 1 linha por empresa. situacao=recuperacao_pendente e deliberado: expira_em vencido NUNCA e tratado como prova de que a Worker parou - so marca que uma nova execucao exige confirmacao explicita (permissao + margem adicional + motivo) antes de ser autorizada.';

alter table public.pcp_recalculo_execucao enable row level security;

create policy pcp_recalculo_execucao_select_tenant on public.pcp_recalculo_execucao
  for select to authenticated using (empresa_id = public.empresa_atual_id());

revoke all privileges on table public.pcp_recalculo_execucao from public, anon, authenticated;
grant select on table public.pcp_recalculo_execucao to authenticated;

-- =====================================================================
-- Auditoria de confirmacoes de recuperacao - append-only, nunca editado.
-- =====================================================================
create table public.pcp_recalculo_recuperacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  execucao_id_recuperada uuid not null,
  confirmado_por uuid not null references public.usuarios (id),
  confirmado_em timestamptz not null default now(),
  motivo text not null check (length(btrim(motivo)) > 0),
  margem_adicional_segundos integer not null,
  expirou_em timestamptz not null
);

comment on table public.pcp_recalculo_recuperacoes is
  'ETAPA 2O.8B-I5: auditoria append-only de toda confirmacao de recuperacao de execucao abandonada - quem, quando, motivo obrigatorio, e a margem de seguranca efetivamente aplicada. Nunca editado nem apagado.';

alter table public.pcp_recalculo_recuperacoes enable row level security;

create policy pcp_recalculo_recuperacoes_select_tenant on public.pcp_recalculo_recuperacoes
  for select to authenticated using (empresa_id = public.empresa_atual_id());

revoke all privileges on table public.pcp_recalculo_recuperacoes from public, anon, authenticated;
grant select on table public.pcp_recalculo_recuperacoes to authenticated;

create or replace function public.impedir_update_delete_pcp_recalculo_recuperacoes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  raise exception 'pcp_recalculo_recuperacoes: historico append-only, update/delete nunca permitido.';
end;
$function$;

create trigger pcp_recalculo_recuperacoes_impedir_alteracao
  before update or delete on public.pcp_recalculo_recuperacoes
  for each row execute function public.impedir_update_delete_pcp_recalculo_recuperacoes();

-- =====================================================================
-- Permissao nova, dedicada - nunca reaproveitada de outra sensivel.
-- =====================================================================
insert into public.permissoes (chave, recurso, acao, categoria, nome, descricao) values
  ('pcp.confirmar_recuperacao_recalculo', 'pcp', 'confirmar_recuperacao_recalculo', 'sensivel',
   'Confirmar recuperação de execução abandonada',
   'Permite confirmar, após a margem adicional de segurança, que uma execução de recálculo aparentemente abandonada pode ser liberada para uma nova tentativa. Não comprova o encerramento técnico da execução anterior - decisão operacional explícita, exige motivo.')
on conflict (chave) do nothing;

-- =====================================================================
-- iniciar_recalculo_pcp - unica via de aquisicao da reserva.
-- =====================================================================
create or replace function public.iniciar_recalculo_pcp(
  p_empresa_id uuid,
  p_iniciado_por uuid,
  p_contexto text,
  p_ttl_segundos integer default 300
)
returns table (
  execucao_id uuid,
  adquirida boolean,
  motivo text,
  responsavel_atual_id uuid,
  responsavel_atual_nome text,
  iniciado_em_atual timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_usuario uuid;
  v_ativo boolean;
  v_existente record;
  v_nova_execucao_id uuid := gen_random_uuid();
  v_agora timestamptz := now();
  v_nome_responsavel text;
  v_permissao_exigida text;
begin
  if p_ttl_segundos is null or p_ttl_segundos <= 0 or p_ttl_segundos > 3600 then
    raise exception 'iniciar_recalculo_pcp: p_ttl_segundos invalido (%) - precisa estar entre 1 e 3600.', p_ttl_segundos;
  end if;

  -- CORRECAO (auditoria Parte 3): o CHAMADOR so declara qual operacao
  -- esta realizando (contexto) - a FUNCAO, nunca o chamador, decide
  -- qual permissao esse contexto exige. Isso impede que um parametro
  -- livre de permissao seja usado para burlar a regra de negocio.
  if p_contexto not in ('alterar_prioridade', 'solicitar_calculo') then
    raise exception 'iniciar_recalculo_pcp: p_contexto invalido (%) - precisa ser alterar_prioridade ou solicitar_calculo.', p_contexto;
  end if;
  v_permissao_exigida := case p_contexto
    when 'alterar_prioridade' then 'pcp.alterar_prioridade'
    when 'solicitar_calculo' then 'pcp.solicitar_calculo'
  end;

  select u.empresa_id, coalesce(pr.ativo, false), u.nome
    into v_empresa_usuario, v_ativo, v_nome_responsavel
  from public.usuarios u
  left join public.profiles pr on pr.id = u.id
  where u.id = p_iniciado_por;

  if v_empresa_usuario is null then
    raise exception 'iniciar_recalculo_pcp: iniciado_por % nao e um usuario valido.', p_iniciado_por;
  end if;
  if v_empresa_usuario is distinct from p_empresa_id then
    raise exception 'iniciar_recalculo_pcp: iniciado_por % nao pertence a empresa %.', p_iniciado_por, p_empresa_id;
  end if;
  if not v_ativo then
    raise exception 'iniciar_recalculo_pcp: iniciado_por % nao esta ativo.', p_iniciado_por;
  end if;

  -- CORRECAO (ressalva 3 da auditoria original, refinada na Parte 3):
  -- exige a permissao REAL correspondente ao contexto declarado -
  -- nunca so pertencer/estar ativo na empresa, e nunca uma unica
  -- permissao fixa para os dois contextos possiveis.
  if not public.usuario_tem_permissao(p_iniciado_por, v_permissao_exigida) then
    raise exception 'iniciar_recalculo_pcp: iniciado_por % nao possui a permissao % exigida pelo contexto %.', p_iniciado_por, v_permissao_exigida, p_contexto;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pcp_recalculo_execucao:' || p_empresa_id::text, 0));

  select * into v_existente from public.pcp_recalculo_execucao where empresa_id = p_empresa_id for update;

  if v_existente is null then
    insert into public.pcp_recalculo_execucao (empresa_id, execucao_id, iniciado_por, contexto, iniciado_em, expira_em, situacao)
    values (p_empresa_id, v_nova_execucao_id, p_iniciado_por, p_contexto, v_agora, v_agora + (p_ttl_segundos || ' seconds')::interval, 'em_andamento');
    return query select v_nova_execucao_id, true, 'adquirida'::text, p_iniciado_por, v_nome_responsavel, v_agora;
    return;
  end if;

  if v_existente.situacao = 'em_andamento' and v_existente.expira_em > v_agora then
    return query
      select v_existente.execucao_id, false, 'ocupada'::text, v_existente.iniciado_por,
             (select nome from public.usuarios where id = v_existente.iniciado_por), v_existente.iniciado_em;
    return;
  end if;

  if v_existente.situacao = 'em_andamento' and v_existente.expira_em <= v_agora then
    update public.pcp_recalculo_execucao
    set situacao = 'recuperacao_pendente', atualizado_em = v_agora
    where empresa_id = p_empresa_id;
    return query
      select v_existente.execucao_id, false, 'recuperacao_pendente'::text, v_existente.iniciado_por,
             (select nome from public.usuarios where id = v_existente.iniciado_por), v_existente.iniciado_em;
    return;
  end if;

  if v_existente.situacao = 'recuperacao_pendente' then
    return query
      select v_existente.execucao_id, false, 'recuperacao_pendente'::text, v_existente.iniciado_por,
             (select nome from public.usuarios where id = v_existente.iniciado_por), v_existente.iniciado_em;
    return;
  end if;

  update public.pcp_recalculo_execucao
  set execucao_id = v_nova_execucao_id, iniciado_por = p_iniciado_por, contexto = p_contexto, iniciado_em = v_agora,
      expira_em = v_agora + (p_ttl_segundos || ' seconds')::interval, situacao = 'em_andamento',
      atualizado_em = v_agora
  where empresa_id = p_empresa_id;

  return query select v_nova_execucao_id, true, 'adquirida'::text, p_iniciado_por, v_nome_responsavel, v_agora;
end;
$function$;

comment on function public.iniciar_recalculo_pcp(uuid, uuid, text, integer) is
  'ETAPA 2O.8B-I5 (Parte 3): adquire a reserva exclusiva de recalculo da empresa. p_contexto declara a OPERACAO (alterar_prioridade ou solicitar_calculo) - a FUNCAO, nunca o chamador, decide qual permissao esse contexto exige. expira_em vencido NUNCA libera direto - transita para recuperacao_pendente, exigindo confirmar_recuperacao_pcp (permissao dedicada + margem + motivo) antes de qualquer nova tentativa.';

revoke all on function public.iniciar_recalculo_pcp(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.iniciar_recalculo_pcp(uuid, uuid, text, integer) to service_role;

-- =====================================================================
-- finalizar_recalculo_pcp - unica via de liberacao normal da reserva.
-- =====================================================================
create or replace function public.finalizar_recalculo_pcp(
  p_empresa_id uuid,
  p_execucao_id uuid,
  p_situacao text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_linhas_afetadas integer;
begin
  if p_situacao not in ('concluida', 'falhou') then
    raise exception 'finalizar_recalculo_pcp: p_situacao invalida (%) - precisa ser concluida ou falhou.', p_situacao;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pcp_recalculo_execucao:' || p_empresa_id::text, 0));

  update public.pcp_recalculo_execucao
  set situacao = p_situacao, atualizado_em = now()
  where empresa_id = p_empresa_id
    and execucao_id = p_execucao_id
    and situacao = 'em_andamento';

  get diagnostics v_linhas_afetadas = row_count;
  return v_linhas_afetadas = 1;
end;
$function$;

comment on function public.finalizar_recalculo_pcp(uuid, uuid, text) is
  'ETAPA 2O.8B-I5: finaliza a reserva, SO se execucao_id corresponder exatamente a reserva em_andamento daquela empresa.';

revoke all on function public.finalizar_recalculo_pcp(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finalizar_recalculo_pcp(uuid, uuid, text) to service_role;

-- =====================================================================
-- confirmar_recuperacao_pcp - unica via de saida de recuperacao_pendente.
-- Acao EXPLICITA, com permissao dedicada, margem adicional obrigatoria
-- e motivo obrigatorio. NUNCA prova encerramento tecnico - so reduz a
-- janela de risco (ver cabecalho do arquivo).
-- =====================================================================
create or replace function public.confirmar_recuperacao_pcp(
  p_empresa_id uuid,
  p_confirmado_por uuid,
  p_margem_adicional_segundos integer,
  p_motivo text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_usuario uuid;
  v_ativo boolean;
  v_existente record;
  v_agora timestamptz := now();
  v_linhas_afetadas integer;
begin
  if p_margem_adicional_segundos is null or p_margem_adicional_segundos < 60 then
    raise exception 'confirmar_recuperacao_pcp: p_margem_adicional_segundos invalido (%) - precisa ser explicito e >= 60s (decisao de negocio, nunca um default silencioso).', p_margem_adicional_segundos;
  end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'confirmar_recuperacao_pcp: motivo e obrigatorio.';
  end if;

  select u.empresa_id, coalesce(pr.ativo, false) into v_empresa_usuario, v_ativo
  from public.usuarios u
  left join public.profiles pr on pr.id = u.id
  where u.id = p_confirmado_por;

  if v_empresa_usuario is null or v_empresa_usuario is distinct from p_empresa_id then
    raise exception 'confirmar_recuperacao_pcp: confirmado_por % nao e um usuario valido da empresa %.', p_confirmado_por, p_empresa_id;
  end if;
  if not v_ativo then
    raise exception 'confirmar_recuperacao_pcp: confirmado_por % nao esta ativo.', p_confirmado_por;
  end if;

  -- CORRECAO (ressalva 1): permissao administrativa DEDICADA, nunca
  -- "qualquer usuario ativo da empresa".
  if not public.usuario_tem_permissao(p_confirmado_por, 'pcp.confirmar_recuperacao_recalculo') then
    raise exception 'confirmar_recuperacao_pcp: confirmado_por % nao possui a permissao pcp.confirmar_recuperacao_recalculo.', p_confirmado_por;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pcp_recalculo_execucao:' || p_empresa_id::text, 0));

  select * into v_existente from public.pcp_recalculo_execucao where empresa_id = p_empresa_id for update;

  if v_existente is null or v_existente.situacao != 'recuperacao_pendente' then
    return false;
  end if;

  -- CORRECAO (ressalva 2): a confirmacao so e aceita depois de uma
  -- margem ADICIONAL alem de expira_em - nunca imediatamente ao
  -- detectar o vencimento. Isso NUNCA prova que a Worker parou; so
  -- reduz a janela em que uma confirmacao precipitada poderia
  -- coincidir com uma execucao anterior ainda ativa.
  if v_agora < v_existente.expira_em + (p_margem_adicional_segundos || ' seconds')::interval then
    raise exception 'confirmar_recuperacao_pcp: margem adicional de seguranca ainda nao transcorrida (faltam % segundos).',
      extract(epoch from (v_existente.expira_em + (p_margem_adicional_segundos || ' seconds')::interval - v_agora))::integer;
  end if;

  update public.pcp_recalculo_execucao
  set situacao = 'falhou', atualizado_em = v_agora
  where empresa_id = p_empresa_id and situacao = 'recuperacao_pendente';

  get diagnostics v_linhas_afetadas = row_count;

  if v_linhas_afetadas = 1 then
    insert into public.pcp_recalculo_recuperacoes
      (empresa_id, execucao_id_recuperada, confirmado_por, confirmado_em, motivo, margem_adicional_segundos, expirou_em)
    values
      (p_empresa_id, v_existente.execucao_id, p_confirmado_por, v_agora, p_motivo, p_margem_adicional_segundos, v_existente.expira_em);
  end if;

  return v_linhas_afetadas = 1;
end;
$function$;

comment on function public.confirmar_recuperacao_pcp(uuid, uuid, integer, text) is
  'ETAPA 2O.8B-I5: unica forma de sair de recuperacao_pendente. Exige pcp.confirmar_recuperacao_recalculo, margem adicional >= 60s alem de expira_em, e motivo obrigatorio - grava auditoria em pcp_recalculo_recuperacoes. NUNCA constitui prova tecnica de encerramento da execucao anterior - e uma decisao operacional explicita, com janela de risco reduzida, nunca eliminada.';

revoke all on function public.confirmar_recuperacao_pcp(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.confirmar_recuperacao_pcp(uuid, uuid, integer, text) to service_role;

commit;
