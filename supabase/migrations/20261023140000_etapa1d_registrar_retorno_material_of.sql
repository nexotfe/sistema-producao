begin;

create or replace function public.registrar_retorno_material_of(
  p_estoque_movimentacao_saida_id uuid,
  p_quantidade numeric,
  p_unidade text,
  p_criado_por uuid,
  p_motivo text,
  p_chave_idempotencia text,
  p_funcionario_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_saida record;
  v_empresa_id uuid;
  v_criado_por_empresa_id uuid;
  v_unidade_materia_prima text;
  v_quantidade_convertida numeric;
  v_ja_retornado numeric;
  v_restante numeric;
  v_existente record;
  v_entrada_id uuid;
  v_consumo record;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'registrar_retorno_material_of: motivo é obrigatório.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'registrar_retorno_material_of: quantidade deve ser maior que zero.';
  end if;
  if p_chave_idempotencia is null or btrim(p_chave_idempotencia) = '' then
    raise exception 'registrar_retorno_material_of: chave_idempotencia é obrigatória.';
  end if;

  select * into v_saida from public.estoque_movimentacoes where id = p_estoque_movimentacao_saida_id for update;
  if v_saida.id is null then
    raise exception 'registrar_retorno_material_of: movimentação de saída % não encontrada.', p_estoque_movimentacao_saida_id;
  end if;
  if v_saida.tipo_movimento <> 'saida' then
    raise exception 'registrar_retorno_material_of: movimentação % não é uma saída (tipo=%).', p_estoque_movimentacao_saida_id, v_saida.tipo_movimento;
  end if;
  v_empresa_id := v_saida.empresa_id;

  select empresa_id into v_criado_por_empresa_id from public.usuarios where id = p_criado_por;
  if v_criado_por_empresa_id is null or v_criado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'registrar_retorno_material_of: criado_por % não é um usuário válido da empresa % da saída % - nunca é permitido retornar material de outra empresa.', p_criado_por, v_empresa_id, p_estoque_movimentacao_saida_id;
  end if;

  if p_funcionario_id is not null then
    if not exists (
      select 1 from public.funcionarios where id = p_funcionario_id and empresa_id = v_empresa_id
    ) then
      raise exception 'registrar_retorno_material_of: funcionário % não pertence à empresa %.', p_funcionario_id, v_empresa_id;
    end if;
  end if;

  select unidade into v_unidade_materia_prima
  from public.materias_primas
  where id = v_saida.materia_prima_id and empresa_id = v_empresa_id;

  v_quantidade_convertida := public.converter_para_unidade_base(p_quantidade, p_unidade, v_unidade_materia_prima);

  select coalesce(sum(quantidade), 0) into v_ja_retornado
  from public.estoque_movimentacoes
  where movimentacao_origem_id = p_estoque_movimentacao_saida_id and empresa_id = v_empresa_id;

  v_restante := v_saida.quantidade - v_ja_retornado;

  select id, materia_prima_id, quantidade, of_id, of_filha_id, tipo_movimento, movimentacao_origem_id
    into v_existente
  from public.estoque_movimentacoes
  where empresa_id = v_empresa_id and chave_idempotencia = p_chave_idempotencia;

  if v_existente.id is not null then
    if v_existente.tipo_movimento = 'entrada'
       and v_existente.movimentacao_origem_id = p_estoque_movimentacao_saida_id
       and v_existente.quantidade = v_quantidade_convertida
    then
      return v_existente.id;
    else
      raise exception 'registrar_retorno_material_of: chave_idempotencia % já foi usada com conteúdo diferente.', p_chave_idempotencia;
    end if;
  end if;

  if v_quantidade_convertida > v_restante then
    raise exception 'registrar_retorno_material_of: quantidade solicitada (%) excede o restante não retornado da saída (%).', v_quantidade_convertida, v_restante;
  end if;

  perform 1 from public.estoque_saldos
  where empresa_id = v_empresa_id and materia_prima_id = v_saida.materia_prima_id and local_estoque = v_saida.local_estoque
  for update;

  update public.estoque_saldos
  set saldo_disponivel = saldo_disponivel + v_quantidade_convertida
  where empresa_id = v_empresa_id and materia_prima_id = v_saida.materia_prima_id and local_estoque = v_saida.local_estoque;

  insert into public.estoque_movimentacoes (
    empresa_id, materia_prima_id, local_estoque, tipo_movimento, quantidade,
    of_id, of_filha_id, movimentacao_origem_id, funcionario_id, chave_idempotencia, observacoes, created_by
  ) values (
    v_empresa_id, v_saida.materia_prima_id, v_saida.local_estoque, 'entrada', v_quantidade_convertida,
    v_saida.of_id, v_saida.of_filha_id, p_estoque_movimentacao_saida_id, p_funcionario_id, p_chave_idempotencia, p_motivo, p_criado_por
  )
  returning id into v_entrada_id;

  select * into v_consumo from public.consumos_internos where estoque_movimentacao_id = p_estoque_movimentacao_saida_id;
  if v_consumo.id is null then
    raise exception 'registrar_retorno_material_of: consumo original da saída % não encontrado.', p_estoque_movimentacao_saida_id;
  end if;

  insert into public.consumos_internos_ajustes (
    empresa_id, consumo_interno_id, tipo_ajuste, quantidade_ajustada, movimentacao_entrada_id, motivo, created_by
  ) values (
    v_empresa_id, v_consumo.id, 'retorno', v_quantidade_convertida, v_entrada_id, p_motivo, p_criado_por
  );

  return v_entrada_id;
end;
$function$;

revoke all on function public.registrar_retorno_material_of(uuid, numeric, text, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.registrar_retorno_material_of(uuid, numeric, text, uuid, text, text, uuid) to service_role;

commit;
