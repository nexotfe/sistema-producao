-- NEXOTFE - Pedido Compra - Parte 04
-- Gera pedido rascunho a partir do planejamento.

create or replace function public.gerar_pedido_compra_rascunho(
  p_planejamento_compra_id uuid,
  p_fornecedor_nome text default null
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_planejamento record;
  v_pedido_id uuid;
begin
  select * into v_planejamento
  from public.planejamentos_compra
  where id = p_planejamento_compra_id
    and empresa_id = v_empresa_id
    and ativo = true
    and deleted_at is null;

  if not found then
    raise exception 'Planejamento de compras nao encontrado.';
  end if;

  insert into public.pedidos_compra (
    empresa_id, planejamento_compra_id, fornecedor_nome, status, created_by
  )
  values (v_empresa_id, p_planejamento_compra_id, p_fornecedor_nome, 'rascunho', auth.uid())
  returning id into v_pedido_id;

  insert into public.pedido_compra_itens (
    empresa_id, pedido_compra_id, planejamento_compra_id, materia_prima_id,
    descricao_compra, quantidade, unidade, comprar_descricao, created_by
  )
  values (
    v_empresa_id, v_pedido_id, p_planejamento_compra_id,
    v_planejamento.materia_prima_id, v_planejamento.descricao_compra,
    v_planejamento.quantidade_planejada_compra, v_planejamento.unidade_compra,
    v_planejamento.comprar_descricao, auth.uid()
  );

  return v_pedido_id;
end;
$$;
