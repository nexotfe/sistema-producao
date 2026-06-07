-- NEXOTFE - Planejamento de Compras - Parte 15
-- Permite atualizar inclusao/exclusao de origens no planejamento.

drop policy if exists planejamento_compra_origens_update_blocked
  on public.planejamento_compra_origens;

create policy planejamento_compra_origens_update_tenant
  on public.planejamento_compra_origens
  for update
  using (empresa_id = public.empresa_atual_id())
  with check (empresa_id = public.empresa_atual_id());
