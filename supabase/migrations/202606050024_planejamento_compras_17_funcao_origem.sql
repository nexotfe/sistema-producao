-- NEXOTFE - Planejamento de Compras - Parte 17
-- Salva inclusao ou exclusao de uma origem/OF.

create or replace function public.definir_planejamento_compra_origem(
  p_origem_id uuid,
  p_incluir_no_planejamento boolean,
  p_ordem_agrupamento integer default null
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
begin
  update public.planejamento_compra_origens
  set incluir_no_planejamento = p_incluir_no_planejamento,
      ordem_agrupamento = p_ordem_agrupamento
  where id = p_origem_id
    and empresa_id = v_empresa_id;

  if not found then
    raise exception 'Origem do planejamento nao encontrada.';
  end if;

  return p_origem_id;
end;
$$;
