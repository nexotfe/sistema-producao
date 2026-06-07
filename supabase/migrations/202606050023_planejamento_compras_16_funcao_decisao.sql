-- NEXOTFE - Planejamento de Compras - Parte 16
-- Salva decisao do comprador no planejamento.

create or replace function public.atualizar_planejamento_compra_decisao(
  p_planejamento_compra_id uuid,
  p_modo_planejamento text,
  p_comprar_descricao text,
  p_quantidade_planejada_compra numeric default null,
  p_unidade_compra text default null,
  p_sobra_prevista numeric default null
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
begin
  if p_modo_planejamento not in ('manual', 'somar_todas', 'por_of', 'agrupamento_parcial') then
    raise exception 'Modo de planejamento invalido.';
  end if;

  update public.planejamentos_compra
  set modo_planejamento = p_modo_planejamento,
      comprar_descricao = p_comprar_descricao,
      quantidade_planejada_compra = p_quantidade_planejada_compra,
      unidade_compra = p_unidade_compra,
      sobra_prevista = p_sobra_prevista
  where id = p_planejamento_compra_id
    and empresa_id = v_empresa_id
    and ativo = true
    and deleted_at is null;

  if not found then
    raise exception 'Planejamento de compras nao encontrado.';
  end if;

  return p_planejamento_compra_id;
end;
$$;
