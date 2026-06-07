-- NEXOTFE - Planejamento de Compras - Parte 04
-- Politicas das origens do planejamento.

create policy planejamento_compra_origens_select_tenant
  on public.planejamento_compra_origens
  for select
  using (empresa_id = public.empresa_atual_id());

create policy planejamento_compra_origens_insert_tenant
  on public.planejamento_compra_origens
  for insert
  with check (empresa_id = public.empresa_atual_id());

create policy planejamento_compra_origens_update_blocked
  on public.planejamento_compra_origens
  for update
  using (false);

create policy planejamento_compra_origens_delete_blocked
  on public.planejamento_compra_origens
  for delete
  using (false);
