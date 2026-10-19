-- PCP-P8C: saldo restante de OP em execucao (INV-P8-01).
--
-- Fecha o gap encontrado no P8A (investigacao de integracao Motor B):
-- Z e um log de eventos por colaborador, sem campo de duracao/quantidade;
-- somar as horas apontadas por varios colaboradores mede horas-homem, nao
-- horas-recurso, e nao pode ser usado para inferir automaticamente o
-- saldo restante de uma OP em execucao (DEC-P8-02). O saldo e sempre uma
-- estimativa operacional explicita do PCP, nunca calculada a partir de Z.
--
-- INV-P8-01 - Saldo estimado so existe apos inicio real da OP: OP nunca
-- iniciada usa integralmente o Y; OP iniciada e nao resolvida pode
-- receber estimativa explicita de saldo; OP resolvida nao aceita
-- estimativa. "Iniciada" exige pelo menos 1 evento EFETIVO de iniciar/
-- retomar (via of_apontamentos_efetivos, que ja considera correcoes) -
-- nunca apenas "existe alguma linha em of_apontamentos".
--
-- DEC-P8-02 - recurso do saldo restante e informacao separada do Y
-- original: recurso_restante_estimado_id=null mantem recurso_vigente_id
-- valendo para o saldo; informado, passa a valer so para o saldo futuro.
-- Nunca sobrescreve recurso_vigente_id (preserva o Y original intacto).
--
-- v1 (decisao do usuario): RPC so aceita OP de OF em estado_execucao=
-- 'em_producao' - nunca planejada/liberada/cancelada/concluida/
-- desdobrada/suspensa. Reestimar quantas vezes forem necessarias e
-- permitido, cada chamada audita valor anterior e novo.

begin;

-- =====================================================================
-- 1. Colunas novas - separadas do Y original (tempo_vigente_minutos/
--    recurso_vigente_id, nunca sobrescritos) e de Z (of_apontamentos,
--    nunca escrito por esta migration).
-- =====================================================================
alter table public.ordens_fabricacao_operacoes
  add column tempo_restante_estimado_minutos numeric null,
  add column tempo_restante_estimado_em timestamptz null,
  add column tempo_restante_estimado_por uuid null,
  add column recurso_restante_estimado_id uuid null;

alter table public.ordens_fabricacao_operacoes
  add constraint ordens_fabricacao_operacoes_tempo_restante_positivo_chk
  check (tempo_restante_estimado_minutos is null or tempo_restante_estimado_minutos > 0);

comment on column public.ordens_fabricacao_operacoes.tempo_restante_estimado_minutos is
  'PCP-P8C/INV-P8-01: estimativa operacional explicita do saldo restante (minutos), nunca calculada a partir de Z. Nunca 0 (conclusao factual e op_esta_resolvida(), nao este campo). So preenchida por estimar_saldo_operacao.';
comment on column public.ordens_fabricacao_operacoes.recurso_restante_estimado_id is
  'PCP-P8C/DEC-P8-02: recurso planejado para o saldo restante, quando diferente do recurso_vigente_id do Y. Null = continua valendo recurso_vigente_id. Nunca sobrescreve recurso_vigente_id.';

alter table public.ordens_fabricacao_operacoes
  add constraint ordens_fabricacao_operacoes_recurso_restante_empresa_fk
  foreign key (recurso_restante_estimado_id, empresa_id)
  references public.recursos_produtivos (id, empresa_id);

-- =====================================================================
-- 2. estimar_saldo_operacao - service_role-only, fail-closed desde o
--    nascimento (mesma convencao de liberar_of/cancelar_of/
--    criar_of_substituta: ator explicito por parametro, nao auth.uid()).
-- =====================================================================
create or replace function public.estimar_saldo_operacao(
  p_op_id uuid,
  p_estimado_por uuid,
  p_tempo_restante_estimado_minutos numeric,
  p_recurso_planejado_restante_id uuid default null,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_of_id uuid;
  v_estado_execucao_of text;
  v_estimado_por_empresa_id uuid;
  v_recurso_empresa_id uuid;
  v_tem_inicio_real boolean;
  v_tempo_anterior numeric;
  v_recurso_anterior uuid;
begin
  select empresa_id, of_id into v_empresa_id, v_of_id
  from public.ordens_fabricacao_operacoes
  where id = p_op_id;

  if v_empresa_id is null then
    raise exception 'estimar_saldo_operacao: OP % nao encontrada.', p_op_id;
  end if;

  select empresa_id into v_estimado_por_empresa_id from public.usuarios where id = p_estimado_por;
  if v_estimado_por_empresa_id is null or v_estimado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'estimar_saldo_operacao: estimado_por % nao e um usuario valido da empresa % da OP %.', p_estimado_por, v_empresa_id, p_op_id;
  end if;

  if p_tempo_restante_estimado_minutos is null or not (p_tempo_restante_estimado_minutos > 0) then
    raise exception 'estimar_saldo_operacao: tempo_restante_estimado_minutos invalido (%) - precisa ser maior que zero.', p_tempo_restante_estimado_minutos;
  end if;

  if p_recurso_planejado_restante_id is not null then
    select empresa_id into v_recurso_empresa_id from public.recursos_produtivos where id = p_recurso_planejado_restante_id;
    if v_recurso_empresa_id is null or v_recurso_empresa_id is distinct from v_empresa_id then
      raise exception 'estimar_saldo_operacao: recurso % nao pertence a empresa % da OP %.', p_recurso_planejado_restante_id, v_empresa_id, p_op_id;
    end if;
  end if;

  select estado_execucao into v_estado_execucao_of from public.ordens_fabricacao where id = v_of_id;
  if v_estado_execucao_of is distinct from 'em_producao' then
    raise exception 'estimar_saldo_operacao: OF % em estado_execucao=% - v1 so aceita estimativa de saldo para OF em_producao.', v_of_id, v_estado_execucao_of;
  end if;

  if public.op_esta_resolvida(p_op_id) then
    raise exception 'estimar_saldo_operacao: OP % ja esta resolvida - conclusao factual, saldo restante nao se aplica.', p_op_id;
  end if;

  -- INV-P8-01: "iniciada" exige pelo menos 1 evento EFETIVO de iniciar/
  -- retomar (nunca so "existe alguma linha em of_apontamentos") - usa a
  -- mesma visao efetiva (considera correcoes) que op_esta_resolvida().
  select exists(
    select 1 from public.of_apontamentos_efetivos(p_op_id) e
    where e.tipo_evento in ('iniciar', 'retomar')
  ) into v_tem_inicio_real;

  if not v_tem_inicio_real then
    raise exception 'estimar_saldo_operacao: OP % nao tem inicio real registrado (nenhum evento efetivo de iniciar/retomar) - OP nunca iniciada usa o Y integral, nao aceita estimativa de saldo.', p_op_id;
  end if;

  select tempo_restante_estimado_minutos, recurso_restante_estimado_id
    into v_tempo_anterior, v_recurso_anterior
  from public.ordens_fabricacao_operacoes where id = p_op_id;

  update public.ordens_fabricacao_operacoes
  set tempo_restante_estimado_minutos = p_tempo_restante_estimado_minutos,
      tempo_restante_estimado_em = now(),
      tempo_restante_estimado_por = p_estimado_por,
      recurso_restante_estimado_id = p_recurso_planejado_restante_id
  where id = p_op_id;

  insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
    values (v_empresa_id, p_op_id, 'tempo_restante_estimado_minutos', v_tempo_anterior::text, p_tempo_restante_estimado_minutos::text, p_estimado_por, p_motivo);

  if p_recurso_planejado_restante_id is distinct from v_recurso_anterior then
    insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
      values (v_empresa_id, p_op_id, 'recurso_restante_estimado_id', v_recurso_anterior::text, p_recurso_planejado_restante_id::text, p_estimado_por, p_motivo);
  end if;
end;
$function$;

comment on function public.estimar_saldo_operacao(uuid, uuid, numeric, uuid, text) is
  'PCP-P8C/INV-P8-01/DEC-P8-02: estimativa operacional explicita (nunca calculada de Z) do saldo restante de uma OP ja iniciada e nao resolvida, de OF em_producao (v1). Reestimar e permitido quantas vezes necessario enquanto a OP nao estiver resolvida - cada chamada audita valor anterior e novo em of_operacao_auditoria. recurso_planejado_restante_id null mantem recurso_vigente_id valendo para o saldo; informado, vale so para o saldo futuro - nunca sobrescreve recurso_vigente_id (Y original preservado). ACL tecnica: service_role-only (mesma pendencia de Grupo de Acesso/Permissao das demais RPCs do ciclo PCP).';

revoke all on function public.estimar_saldo_operacao(uuid, uuid, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.estimar_saldo_operacao(uuid, uuid, numeric, uuid, text) to service_role;

commit;
