-- NEXOTFE - Requisicao Compra - Parte 02
-- Funcao operacional para falta de material.

create or replace function public.registrar_requisicao_compra_material(
  p_projeto_id uuid,
  p_of_numero text,
  p_materia_prima_id uuid,
  p_quantidade numeric,
  p_unidade text,
  p_data_necessidade_material date,
  p_observacoes text default null
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_requisicao_id uuid;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if p_quantidade <= 0 then
    raise exception 'Quantidade da requisicao deve ser maior que zero.';
  end if;

  if p_unidade not in ('kg', 'metro', 'barra', 'chapa', 'peca') then
    raise exception 'Unidade invalida para requisicao de compra.';
  end if;

  insert into public.requisicoes_compra (
    empresa_id,
    projeto_id,
    of_numero,
    data_necessidade_material,
    status,
    observacoes,
    created_by
  )
  values (
    v_empresa_id,
    p_projeto_id,
    p_of_numero,
    p_data_necessidade_material,
    'aberta',
    coalesce(p_observacoes, 'Compra externa gerada por falta de saldo livre'),
    auth.uid()
  )
  returning id into v_requisicao_id;

  insert into public.requisicao_compra_itens (
    empresa_id,
    requisicao_compra_id,
    materia_prima_id,
    quantidade_necessaria,
    unidade,
    observacoes,
    created_by
  )
  values (
    v_empresa_id,
    v_requisicao_id,
    p_materia_prima_id,
    p_quantidade,
    p_unidade,
    p_observacoes,
    auth.uid()
  );

  return v_requisicao_id;
end;
$$;
