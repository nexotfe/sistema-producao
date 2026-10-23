begin;

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

revoke all on function public.registrar_retirada_material_of(uuid, uuid, numeric, text, uuid, text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.registrar_retirada_material_of(uuid, uuid, numeric, text, uuid, text, uuid, uuid, text, text) to service_role;

commit;
