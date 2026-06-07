-- NEXOTFE - Pedido Compra - Parte 03
-- Politicas dos itens do pedido.

create policy pedido_compra_itens_select_tenant
  on public.pedido_compra_itens for select
  using (empresa_id = public.empresa_atual_id());

create policy pedido_compra_itens_insert_tenant
  on public.pedido_compra_itens for insert
  with check (empresa_id = public.empresa_atual_id());

create policy pedido_compra_itens_update_blocked
  on public.pedido_compra_itens for update
  using (false);

create policy pedido_compra_itens_delete_blocked
  on public.pedido_compra_itens for delete
  using (false);
