-- NEXOTFE - Pedido Compra - Parte 05
-- Indices e comentarios.

create index if not exists pedidos_compra_empresa_status_idx
  on public.pedidos_compra (empresa_id, status);

create index if not exists pedidos_compra_planejamento_idx
  on public.pedidos_compra (planejamento_compra_id);

create index if not exists pedido_compra_itens_pedido_idx
  on public.pedido_compra_itens (pedido_compra_id);

comment on table public.pedidos_compra is
  'Pedido de compra leve, gerado a partir do planejamento.';

comment on function public.gerar_pedido_compra_rascunho(uuid, text) is
  'Gera pedido de compra em rascunho a partir do planejamento confirmado.';
