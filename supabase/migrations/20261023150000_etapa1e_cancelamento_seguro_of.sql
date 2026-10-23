-- NEXOTFE-ESTOQUE-ETAPA1E: cancelamento seguro de OF.
--
-- Regra definitiva: uma OF só pode ser cancelada se NÃO possuir
-- apontamento real de execução produtiva nem retirada física de
-- material atribuída a ela (independente ou mãe/filha/descendente).
-- Reserva isolada não impede cancelamento. Reservas remanescentes
-- com vínculo comprovado à OF cancelada são liberadas automaticamente;
-- reservas compartilhadas da raiz nunca são tocadas pelo cancelamento
-- de uma filha específica.
--
-- Divergência de quantidade (soma das filhas ativas x quantidade da
-- mãe) permanece FORA DE ESCOPO desta etapa: cancelar_of nunca
-- preenche divergencia_quantidade_justificativa/_aprovada_por
-- automaticamente. O trigger pré-existente validar_hierarquia_of
-- continua bloqueando, sem enfraquecimento, qualquer cancelamento de
-- filha que reduziria a soma das filhas ativas abaixo da quantidade
-- da mãe sem comprovação de cancelamento comercial pelo cliente
-- (decisão explícita do usuário - uma justificativa textual do PCP
-- nunca substitui uma alteração comercial formal).
--
-- Proteção de corrida: registrar_retirada_material_of passa a adquirir
-- o mesmo advisory lock de transição de OF usado por cancelar_of/
-- desdobrar_of/aprovar_of, na OF-raiz e, quando houver, na OF-filha
-- específica (ordem fixa raiz->filha, evita deadlock), serializando
-- contra um cancelamento concorrente sobre o mesmo recurso.
begin;

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
  v_existe_apontamento boolean;
  v_existe_retirada boolean;
  v_reserva record;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'cancelar_of: motivo é obrigatório.';
  end if;

  select empresa_id into v_empresa_id from public.ordens_fabricacao where id = p_of_id;
  if v_empresa_id is null then
    raise exception 'cancelar_of: OF % não encontrada.', p_of_id;
  end if;

  select empresa_id into v_cancelado_por_empresa_id from public.usuarios where id = p_cancelado_por;
  if v_cancelado_por_empresa_id is null or v_cancelado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'cancelar_of: cancelado_por % não é um usuário válido da empresa % da OF %.', p_cancelado_por, v_empresa_id, p_of_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));

  select * into v_of from public.ordens_fabricacao where id = p_of_id;

  if v_of.estado_aprovacao is distinct from 'aprovada' then
    raise exception 'cancelar_of: OF % não está aprovada (estado_aprovacao=%) - use reprovar_of para OFs ainda em auditoria.', p_of_id, v_of.estado_aprovacao;
  end if;

  if v_of.estado_execucao not in ('planejada', 'liberada', 'em_producao') then
    raise exception 'cancelar_of: OF % em estado_execucao=% não pode ser cancelada por esta via.', p_of_id, v_of.estado_execucao;
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
      raise exception 'Existe apontamento em andamento nesta OF. Pause ou finalize a sessão antes de cancelar.';
    end if;
  end if;

  -- ESTOQUE-ETAPA1E: qualquer apontamento real (não só sessão aberta).
  select exists(
    select 1 from public.of_apontamentos a
    join public.ordens_fabricacao_operacoes op on op.id = a.op_id
    where op.of_id = p_of_id
  ) into v_existe_apontamento;

  if v_existe_apontamento then
    raise exception 'cancelar_of: OF % possui apontamento real de execução registrado - cancelamento simples não permitido; exige reprovação produtiva (fluxo a ser formalizado, ainda não implementado).', p_of_id;
  end if;

  -- ESTOQUE-ETAPA1E: retirada física atribuída a ESTA OF (raiz, independente ou filha específica).
  select exists(
    select 1 from public.estoque_movimentacoes
    where tipo_movimento = 'saida'
      and (
        (v_of.of_pai_id is not null and of_filha_id = p_of_id)
        or (v_of.of_pai_id is null and of_id = p_of_id and of_filha_id is null)
      )
  ) into v_existe_retirada;

  if v_existe_retirada then
    raise exception 'cancelar_of: OF % possui retirada física de material registrada - cancelamento simples não permitido; exige reprovação produtiva (fluxo a ser formalizado, ainda não implementado).', p_of_id;
  end if;

  update public.ordens_fabricacao
    set estado_execucao = 'cancelada',
        estado_execucao_observacao = p_motivo
    where id = p_of_id
      and estado_execucao = v_of.estado_execucao;

  if not found then
    raise exception 'cancelar_of: falha ao cancelar OF % - estado mudou durante a operação.', p_of_id;
  end if;

  -- ESTOQUE-ETAPA1E: libera só reservas com vínculo COMPROVADO a esta OF específica.
  -- (Se a OF for filha e o cancelamento violar a soma de quantidade da mãe,
  -- o trigger validar_hierarquia_of já abortou a transação acima, antes de
  -- chegar aqui - nenhuma reserva é tocada nesse caso.)
  for v_reserva in
    select em.id,
      em.quantidade - coalesce((
        select sum(em2.quantidade) from public.estoque_movimentacoes em2
        where em2.reserva_origem_id = em.id
      ), 0) as restante
    from public.estoque_movimentacoes em
    where em.tipo_movimento = 'reserva'
      and (
        (v_of.of_pai_id is not null and em.of_filha_id = p_of_id)
        or (v_of.of_pai_id is null and em.of_id = p_of_id and em.of_filha_id is null)
      )
  loop
    if v_reserva.restante > 0 then
      perform public.liberar_reserva_material_of(
        v_reserva.id, p_cancelado_por,
        'Liberação automática por cancelamento da OF ' || v_of.numero_of,
        'cancelamento-of-' || p_of_id::text || '-reserva-' || v_reserva.id::text
      );
    end if;
  end loop;

  return jsonb_build_object('resultado', 'cancelada', 'of_id', p_of_id, 'numero_of', v_of.numero_of);
end;
$function$;

comment on function public.cancelar_of(uuid, uuid, text) is
  'Cancela uma OF aprovada em planejada/liberada/em_producao, sem sessão em andamento. ESTOQUE-ETAPA1E: bloqueia cancelamento simples quando houver qualquer apontamento real (não só sessão aberta) ou retirada física de material vinculada à OF (raiz/independente ou filha específica); ao cancelar, libera automaticamente apenas as reservas com vínculo comprovado a esta OF (nunca reservas compartilhadas da raiz quando a OF cancelada é uma filha). Nunca preenche divergencia_quantidade_justificativa/_aprovada_por - cancelamento de filha que violaria a soma de quantidade da mãe fica bloqueado pelo trigger validar_hierarquia_of, sem enfraquecimento (decisão explícita do usuário - fora de escopo da Etapa 1E).';

revoke all on function public.cancelar_of(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancelar_of(uuid, uuid, text) to service_role;

create or replace function public.registrar_retirada_material_of(
  p_of_id uuid,
  p_materia_prima_id uuid,
  p_quantidade numeric,
  p_unidade text,
  p_criado_por uuid,
  p_chave_idempotencia text,
  p_reserva_origem_id uuid default null,
  p_funcionario_id uuid default null,
  p_local_estoque text default 'principal',
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_of_raiz_id uuid;
  v_of_filha_id uuid;
  v_projeto_id uuid;
  v_numero_of text;
  v_criado_por_empresa_id uuid;
  v_unidade_materia_prima text;
  v_custo_referencia numeric;
  v_quantidade_convertida numeric;
  v_saldo_disponivel numeric;
  v_reserva record;
  v_ja_movimentado_reserva numeric;
  v_restante_reserva numeric;
  v_existente record;
  v_movimentacao_id uuid;
  v_custo_unitario numeric;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'registrar_retirada_material_of: quantidade deve ser maior que zero.';
  end if;
  if p_chave_idempotencia is null or btrim(p_chave_idempotencia) = '' then
    raise exception 'registrar_retirada_material_of: chave_idempotencia é obrigatória.';
  end if;

  select empresa_id, of_raiz_id into v_empresa_id, v_of_raiz_id
  from public.ordens_fabricacao
  where id = p_of_id;

  if v_empresa_id is null then
    raise exception 'registrar_retirada_material_of: OF % não encontrada.', p_of_id;
  end if;

  v_of_filha_id := case when v_of_raiz_id is distinct from p_of_id then p_of_id else null end;

  -- ESTOQUE-ETAPA1E: serializa contra cancelar_of concorrente sobre a mesma OF
  -- (raiz primeiro, depois a filha específica quando houver - ordem fixa evita deadlock).
  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || v_of_raiz_id::text, 0));
  if v_of_filha_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || v_of_filha_id::text, 0));
  end if;

  select projeto_id, numero_of into v_projeto_id, v_numero_of
  from public.ordens_fabricacao
  where id = v_of_raiz_id;

  select empresa_id into v_criado_por_empresa_id from public.usuarios where id = p_criado_por;
  if v_criado_por_empresa_id is null or v_criado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'registrar_retirada_material_of: criado_por % não é um usuário válido da empresa % da OF %.', p_criado_por, v_empresa_id, p_of_id;
  end if;

  if p_funcionario_id is not null then
    if not exists (
      select 1 from public.funcionarios where id = p_funcionario_id and empresa_id = v_empresa_id
    ) then
      raise exception 'registrar_retirada_material_of: funcionário % não pertence à empresa %.', p_funcionario_id, v_empresa_id;
    end if;
  end if;

  select unidade, custo_referencia into v_unidade_materia_prima, v_custo_referencia
  from public.materias_primas
  where id = p_materia_prima_id and empresa_id = v_empresa_id;

  if v_unidade_materia_prima is null then
    raise exception 'registrar_retirada_material_of: matéria-prima % não encontrada na empresa %.', p_materia_prima_id, v_empresa_id;
  end if;

  v_quantidade_convertida := public.converter_para_unidade_base(p_quantidade, p_unidade, v_unidade_materia_prima);

  select id, materia_prima_id, quantidade, of_id, of_filha_id, tipo_movimento, reserva_origem_id
    into v_existente
  from public.estoque_movimentacoes
  where empresa_id = v_empresa_id and chave_idempotencia = p_chave_idempotencia;

  if v_existente.id is not null then
    if v_existente.tipo_movimento = 'saida'
       and v_existente.materia_prima_id = p_materia_prima_id
       and v_existente.of_id = v_of_raiz_id
       and v_existente.of_filha_id is not distinct from v_of_filha_id
       and v_existente.quantidade = v_quantidade_convertida
       and v_existente.reserva_origem_id is not distinct from p_reserva_origem_id
    then
      return v_existente.id;
    else
      raise exception 'registrar_retirada_material_of: chave_idempotencia % já foi usada com conteúdo diferente.', p_chave_idempotencia;
    end if;
  end if;

  if p_reserva_origem_id is not null then
    select * into v_reserva from public.estoque_movimentacoes where id = p_reserva_origem_id for update;
    if v_reserva.id is null then
      raise exception 'registrar_retirada_material_of: reserva % não encontrada.', p_reserva_origem_id;
    end if;
    if v_reserva.tipo_movimento <> 'reserva' then
      raise exception 'registrar_retirada_material_of: movimentação % não é uma reserva (tipo=%).', p_reserva_origem_id, v_reserva.tipo_movimento;
    end if;
    if v_reserva.empresa_id is distinct from v_empresa_id
       or v_reserva.materia_prima_id is distinct from p_materia_prima_id
       or v_reserva.of_id is distinct from v_of_raiz_id
    then
      raise exception 'registrar_retirada_material_of: reserva % não corresponde à OF/matéria-prima informadas.', p_reserva_origem_id;
    end if;

    select coalesce(sum(quantidade), 0) into v_ja_movimentado_reserva
    from public.estoque_movimentacoes
    where reserva_origem_id = p_reserva_origem_id and empresa_id = v_empresa_id;

    v_restante_reserva := v_reserva.quantidade - v_ja_movimentado_reserva;
    if v_quantidade_convertida > v_restante_reserva then
      raise exception 'registrar_retirada_material_of: quantidade solicitada (%) excede o restante da reserva (%).', v_quantidade_convertida, v_restante_reserva;
    end if;
  end if;

  select saldo_disponivel into v_saldo_disponivel
  from public.estoque_saldos
  where empresa_id = v_empresa_id and materia_prima_id = p_materia_prima_id and local_estoque = p_local_estoque
  for update;

  if v_saldo_disponivel is null then
    raise exception 'registrar_retirada_material_of: saldo de estoque não encontrado para a matéria-prima % no local %.', p_materia_prima_id, p_local_estoque;
  end if;
  if v_saldo_disponivel < v_quantidade_convertida then
    raise exception 'registrar_retirada_material_of: saldo disponível insuficiente (disponível=%, solicitado=%).', v_saldo_disponivel, v_quantidade_convertida;
  end if;

  update public.estoque_saldos
  set saldo_disponivel = saldo_disponivel - v_quantidade_convertida,
      saldo_reservado = saldo_reservado - case when p_reserva_origem_id is not null then v_quantidade_convertida else 0 end
  where empresa_id = v_empresa_id and materia_prima_id = p_materia_prima_id and local_estoque = p_local_estoque;

  insert into public.estoque_movimentacoes (
    empresa_id, materia_prima_id, local_estoque, tipo_movimento, quantidade,
    of_id, of_filha_id, reserva_origem_id, funcionario_id, chave_idempotencia, observacoes, created_by
  ) values (
    v_empresa_id, p_materia_prima_id, p_local_estoque, 'saida', v_quantidade_convertida,
    v_of_raiz_id, v_of_filha_id, p_reserva_origem_id, p_funcionario_id, p_chave_idempotencia, p_observacoes, p_criado_por
  )
  returning id into v_movimentacao_id;

  v_custo_unitario := coalesce(v_custo_referencia, 0);

  insert into public.consumos_internos (
    empresa_id, projeto_id, of_numero, of_id, materia_prima_id, estoque_movimentacao_id,
    local_estoque, quantidade, unidade, saldo_consumido, custo_unitario_material, created_by
  ) values (
    v_empresa_id, v_projeto_id, v_numero_of, v_of_raiz_id, p_materia_prima_id, v_movimentacao_id,
    p_local_estoque, v_quantidade_convertida, v_unidade_materia_prima, v_quantidade_convertida, v_custo_unitario, p_criado_por
  );

  return v_movimentacao_id;
end;
$function$;

comment on function public.registrar_retirada_material_of(uuid, uuid, numeric, text, uuid, text, uuid, uuid, text, text) is
  'ESTOQUE-ETAPA1C/1E: retirada efetiva de material. ETAPA1E: adquire pg_advisory_xact_lock("of-transicao:"+id) na raiz e, quando aplicável, na OF-filha específica, serializando contra cancelar_of concorrente sobre o mesmo recurso. Demais comportamentos inalterados desde a Etapa 1C.';

revoke all on function public.registrar_retirada_material_of(uuid, uuid, numeric, text, uuid, text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.registrar_retirada_material_of(uuid, uuid, numeric, text, uuid, text, uuid, uuid, text, text) to service_role;

commit;
