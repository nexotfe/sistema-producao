-- NEXOTFE - Pedido Compra - Parte 02
-- Triggers, RLS e politicas base.

create trigger set_pedidos_compra_updated_at
  before update on public.pedidos_compra
  for each row
  execute function public.set_updated_at();

alter table public.pedidos_compra enable row level security;
alter table public.pedido_compra_itens enable row level security;

create policy pedidos_compra_select_tenant
  on public.pedidos_compra for select
  using (empresa_id = public.empresa_atual_id() and ativo = true and deleted_at is null);

create policy pedidos_compra_insert_tenant
  on public.pedidos_compra for insert
  with check (empresa_id = public.empresa_atual_id());

create policy pedidos_compra_update_tenant
  on public.pedidos_compra for update
  using (empresa_id = public.empresa_atual_id() and ativo = true and deleted_at is null)
  with check (empresa_id = public.empresa_atual_id());

create policy pedidos_compra_delete_blocked
  on public.pedidos_compra for delete
  using (false);
