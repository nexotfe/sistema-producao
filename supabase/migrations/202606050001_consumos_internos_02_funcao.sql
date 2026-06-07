-- NEXOTFE - Consumo Interno - Parte 02
-- Funcao operacional: saldo suficiente gera CI e reserva material.

create or replace function public.registrar_consumo_interno(
  p_projeto_id uuid,
  p_of_numero text,
  p_materia_prima_id uuid,
  p_quantidade numeric,
  p_unidade text,
  p_custo_unitario_material numeric default 0,
  p_local_estoque text default 'principal',
  p_data_movimentacao date default current_date,
  p_observacoes text default null
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_saldo_livre numeric;
  v_movimentacao_id uuid;
  v_consumo_id uuid;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if p_quantidade <= 0 then
    raise exception 'Quantidade do consumo interno deve ser maior que zero.';
  end if;

  if p_custo_unitario_material < 0 then
    raise exception 'Custo unitario do material nao pode ser negativo.';
  end if;

  if p_unidade not in ('kg', 'metro', 'barra', 'chapa', 'peca') then
    raise exception 'Unidade invalida para consumo interno.';
  end if;

  select saldo_livre into v_saldo_livre
  from public.estoque_saldos
  where empresa_id = v_empresa_id
    and materia_prima_id = p_materia_prima_id
    and local_estoque = p_local_estoque
  for update;

  if v_saldo_livre is null then
    raise exception 'Saldo de estoque nao encontrado para a materia-prima.';
  end if;

  if v_saldo_livre < p_quantidade then
    raise exception 'Saldo livre insuficiente para gerar consumo interno.';
  end if;

  update public.estoque_saldos
  set saldo_reservado = saldo_reservado + p_quantidade
  where empresa_id = v_empresa_id
    and materia_prima_id = p_materia_prima_id
    and local_estoque = p_local_estoque;

  insert into public.estoque_movimentacoes (
    empresa_id, materia_prima_id, local_estoque, tipo_movimento, quantidade,
    projeto_id, of_numero, observacoes, created_by
  )
  values (
    v_empresa_id, p_materia_prima_id, p_local_estoque, 'reserva', p_quantidade,
    p_projeto_id, p_of_numero,
    coalesce(p_observacoes, 'Reserva gerada por Consumo Interno'), auth.uid()
  )
  returning id into v_movimentacao_id;

  insert into public.consumos_internos (
    empresa_id, projeto_id, of_numero, materia_prima_id,
    estoque_movimentacao_id, local_estoque, quantidade, unidade,
    saldo_consumido, custo_unitario_material, data_movimentacao,
    observacoes, created_by
  )
  values (
    v_empresa_id, p_projeto_id, p_of_numero, p_materia_prima_id,
    v_movimentacao_id, p_local_estoque, p_quantidade, p_unidade,
    p_quantidade, p_custo_unitario_material, p_data_movimentacao,
    p_observacoes, auth.uid()
  )
  returning id into v_consumo_id;

  return v_consumo_id;
end;
$$;
