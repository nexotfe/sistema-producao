begin;

create or replace function public.reservar_material_of(
  p_of_id uuid,
  p_materia_prima_id uuid,
  p_quantidade numeric,
  p_unidade text,
  p_criado_por uuid,
  p_chave_idempotencia text,
  p_necessidade_id uuid default null,
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
  v_criado_por_empresa_id uuid;
  v_unidade_materia_prima text;
  v_quantidade_convertida numeric;
  v_saldo_livre numeric;
  v_existente record;
  v_movimentacao_id uuid;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'reservar_material_of: quantidade deve ser maior que zero.';
  end if;
  if p_chave_idempotencia is null or btrim(p_chave_idempotencia) = '' then
    raise exception 'reservar_material_of: chave_idempotencia é obrigatória.';
  end if;

  select empresa_id, of_raiz_id into v_empresa_id, v_of_raiz_id
  from public.ordens_fabricacao
  where id = p_of_id;

  if v_empresa_id is null then
    raise exception 'reservar_material_of: OF % não encontrada.', p_of_id;
  end if;

  v_of_filha_id := case when v_of_raiz_id is distinct from p_of_id then p_of_id else null end;

  select empresa_id into v_criado_por_empresa_id from public.usuarios where id = p_criado_por;
  if v_criado_por_empresa_id is null or v_criado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'reservar_material_of: criado_por % não é um usuário válido da empresa % da OF %.', p_criado_por, v_empresa_id, p_of_id;
  end if;

  if p_necessidade_id is not null then
    if not exists (
      select 1 from public.necessidades_of_material
      where id = p_necessidade_id and empresa_id = v_empresa_id and of_id = v_of_raiz_id
    ) then
      raise exception 'reservar_material_of: necessidade % não pertence à OF-raiz % na empresa %.', p_necessidade_id, v_of_raiz_id, v_empresa_id;
    end if;
  end if;

  select unidade into v_unidade_materia_prima
  from public.materias_primas
  where id = p_materia_prima_id and empresa_id = v_empresa_id;

  if v_unidade_materia_prima is null then
    raise exception 'reservar_material_of: matéria-prima % não encontrada na empresa %.', p_materia_prima_id, v_empresa_id;
  end if;

  v_quantidade_convertida := public.converter_para_unidade_base(p_quantidade, p_unidade, v_unidade_materia_prima);

  select id, materia_prima_id, quantidade, of_id, of_filha_id, tipo_movimento
    into v_existente
  from public.estoque_movimentacoes
  where empresa_id = v_empresa_id and chave_idempotencia = p_chave_idempotencia;

  if v_existente.id is not null then
    if v_existente.tipo_movimento = 'reserva'
       and v_existente.materia_prima_id = p_materia_prima_id
       and v_existente.of_id = v_of_raiz_id
       and v_existente.of_filha_id is not distinct from v_of_filha_id
       and v_existente.quantidade = v_quantidade_convertida
    then
      return v_existente.id;
    else
      raise exception 'reservar_material_of: chave_idempotencia % já foi usada com conteúdo diferente.', p_chave_idempotencia;
    end if;
  end if;

  select saldo_livre into v_saldo_livre
  from public.estoque_saldos
  where empresa_id = v_empresa_id and materia_prima_id = p_materia_prima_id and local_estoque = p_local_estoque
  for update;

  if v_saldo_livre is null then
    raise exception 'reservar_material_of: saldo de estoque não encontrado para a matéria-prima % no local %.', p_materia_prima_id, p_local_estoque;
  end if;
  if v_saldo_livre < v_quantidade_convertida then
    raise exception 'reservar_material_of: saldo livre insuficiente (livre=%, solicitado=%).', v_saldo_livre, v_quantidade_convertida;
  end if;

  update public.estoque_saldos
  set saldo_reservado = saldo_reservado + v_quantidade_convertida
  where empresa_id = v_empresa_id and materia_prima_id = p_materia_prima_id and local_estoque = p_local_estoque;

  insert into public.estoque_movimentacoes (
    empresa_id, materia_prima_id, local_estoque, tipo_movimento, quantidade,
    of_id, of_filha_id, necessidade_id, chave_idempotencia, observacoes, created_by
  ) values (
    v_empresa_id, p_materia_prima_id, p_local_estoque, 'reserva', v_quantidade_convertida,
    v_of_raiz_id, v_of_filha_id, p_necessidade_id, p_chave_idempotencia, p_observacoes, p_criado_por
  )
  returning id into v_movimentacao_id;

  return v_movimentacao_id;
end;
$function$;

revoke all on function public.reservar_material_of(uuid, uuid, numeric, text, uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.reservar_material_of(uuid, uuid, numeric, text, uuid, text, uuid, text, text) to service_role;

create or replace function public.liberar_reserva_material_of(
  p_reserva_id uuid,
  p_criado_por uuid,
  p_motivo text,
  p_chave_idempotencia text,
  p_quantidade numeric default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reserva record;
  v_empresa_id uuid;
  v_criado_por_empresa_id uuid;
  v_ja_movimentado numeric;
  v_restante numeric;
  v_quantidade_a_liberar numeric;
  v_existente record;
  v_movimentacao_id uuid;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'liberar_reserva_material_of: motivo é obrigatório.';
  end if;
  if p_chave_idempotencia is null or btrim(p_chave_idempotencia) = '' then
    raise exception 'liberar_reserva_material_of: chave_idempotencia é obrigatória.';
  end if;
  if p_quantidade is not null and p_quantidade <= 0 then
    raise exception 'liberar_reserva_material_of: quantidade, quando informada, deve ser maior que zero.';
  end if;

  select * into v_reserva from public.estoque_movimentacoes where id = p_reserva_id for update;
  if v_reserva.id is null then
    raise exception 'liberar_reserva_material_of: reserva % não encontrada.', p_reserva_id;
  end if;
  if v_reserva.tipo_movimento <> 'reserva' then
    raise exception 'liberar_reserva_material_of: movimentação % não é uma reserva (tipo=%).', p_reserva_id, v_reserva.tipo_movimento;
  end if;
  v_empresa_id := v_reserva.empresa_id;

  select empresa_id into v_criado_por_empresa_id from public.usuarios where id = p_criado_por;
  if v_criado_por_empresa_id is null or v_criado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'liberar_reserva_material_of: criado_por % não é um usuário válido da empresa % da reserva % - nunca é permitido liberar reserva de outra empresa.', p_criado_por, v_empresa_id, p_reserva_id;
  end if;

  select coalesce(sum(quantidade), 0) into v_ja_movimentado
  from public.estoque_movimentacoes
  where reserva_origem_id = p_reserva_id and empresa_id = v_empresa_id;

  v_restante := v_reserva.quantidade - v_ja_movimentado;
  v_quantidade_a_liberar := coalesce(p_quantidade, v_restante);

  if v_quantidade_a_liberar <= 0 then
    raise exception 'liberar_reserva_material_of: nada a liberar (restante=%).', v_restante;
  end if;
  if v_quantidade_a_liberar > v_restante then
    raise exception 'liberar_reserva_material_of: quantidade solicitada (%) excede o restante da reserva (%).', v_quantidade_a_liberar, v_restante;
  end if;

  select em.id into v_existente
  from public.estoque_movimentacoes em
  where em.empresa_id = v_empresa_id and em.chave_idempotencia = p_chave_idempotencia;

  if v_existente.id is not null then
    if exists (
      select 1 from public.estoque_movimentacoes
      where id = v_existente.id
        and tipo_movimento = 'liberacao_reserva'
        and reserva_origem_id = p_reserva_id
        and quantidade = v_quantidade_a_liberar
    ) then
      return v_existente.id;
    else
      raise exception 'liberar_reserva_material_of: chave_idempotencia % já foi usada com conteúdo diferente.', p_chave_idempotencia;
    end if;
  end if;

  perform 1 from public.estoque_saldos
  where empresa_id = v_empresa_id and materia_prima_id = v_reserva.materia_prima_id and local_estoque = v_reserva.local_estoque
  for update;

  update public.estoque_saldos
  set saldo_reservado = saldo_reservado - v_quantidade_a_liberar
  where empresa_id = v_empresa_id and materia_prima_id = v_reserva.materia_prima_id and local_estoque = v_reserva.local_estoque;

  insert into public.estoque_movimentacoes (
    empresa_id, materia_prima_id, local_estoque, tipo_movimento, quantidade,
    of_id, of_filha_id, reserva_origem_id, chave_idempotencia, observacoes, created_by
  ) values (
    v_empresa_id, v_reserva.materia_prima_id, v_reserva.local_estoque, 'liberacao_reserva', v_quantidade_a_liberar,
    v_reserva.of_id, v_reserva.of_filha_id, p_reserva_id, p_chave_idempotencia, p_motivo, p_criado_por
  )
  returning id into v_movimentacao_id;

  return v_movimentacao_id;
end;
$function$;

revoke all on function public.liberar_reserva_material_of(uuid, uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.liberar_reserva_material_of(uuid, uuid, text, text, numeric) to service_role;

commit;
