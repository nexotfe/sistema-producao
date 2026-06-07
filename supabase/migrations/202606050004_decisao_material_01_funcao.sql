-- NEXOTFE - Decisao Material - Parte 01
-- Decide entre CI, compra externa ou saldo parcial.

create or replace function public.processar_necessidade_material(
  p_projeto_id uuid,
  p_of_numero text,
  p_materia_prima_id uuid,
  p_quantidade_necessaria numeric,
  p_unidade text,
  p_custo_unitario_material numeric default 0,
  p_local_estoque text default 'principal',
  p_data_necessidade_material date default current_date,
  p_observacoes text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_saldo_livre numeric := 0;
  v_quantidade_ci numeric := 0;
  v_quantidade_compra numeric := 0;
  v_consumo_id uuid;
  v_requisicao_id uuid;
  v_status text;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if p_quantidade_necessaria <= 0 then
    raise exception 'Quantidade necessaria deve ser maior que zero.';
  end if;

  select saldo_livre into v_saldo_livre
  from public.estoque_saldos
  where empresa_id = v_empresa_id
    and materia_prima_id = p_materia_prima_id
    and local_estoque = p_local_estoque
  for update;

  v_saldo_livre := coalesce(v_saldo_livre, 0);
  v_quantidade_ci := least(v_saldo_livre, p_quantidade_necessaria);
  v_quantidade_compra := p_quantidade_necessaria - v_quantidade_ci;

  if v_quantidade_ci > 0 then
    v_consumo_id := public.registrar_consumo_interno(
      p_projeto_id, p_of_numero, p_materia_prima_id, v_quantidade_ci,
      p_unidade, p_custo_unitario_material, p_local_estoque,
      p_data_necessidade_material, p_observacoes
    );
  end if;

  if v_quantidade_compra > 0 then
    v_requisicao_id := public.registrar_requisicao_compra_material(
      p_projeto_id, p_of_numero, p_materia_prima_id, v_quantidade_compra,
      p_unidade, p_data_necessidade_material, p_observacoes
    );
  end if;

  v_status := case
    when v_quantidade_ci > 0 and v_quantidade_compra > 0
      then 'ci_parcial_compra_parcial'
    when v_quantidade_ci > 0 then 'ci_total'
    else 'compra_total'
  end;

  return jsonb_build_object(
    'status', v_status,
    'consumo_interno_id', v_consumo_id,
    'requisicao_compra_id', v_requisicao_id,
    'quantidade_consumo_interno', v_quantidade_ci,
    'quantidade_compra_externa', v_quantidade_compra,
    'saldo_livre_consultado', v_saldo_livre
  );
end;
$$;
