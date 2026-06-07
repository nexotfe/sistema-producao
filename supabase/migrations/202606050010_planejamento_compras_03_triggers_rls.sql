-- NEXOTFE - Planejamento de Compras - Parte 03
-- Ativa updated_at, RLS e politicas base.

create trigger set_planejamentos_compra_updated_at
  before update on public.planejamentos_compra
  for each row
  execute function public.set_updated_at();

alter table public.planejamentos_compra enable row level security;
alter table public.planejamento_compra_origens enable row level security;

create policy planejamentos_compra_select_tenant
  on public.planejamentos_compra
  for select
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  );

create policy planejamentos_compra_insert_tenant
  on public.planejamentos_compra
  for insert
  with check (empresa_id = public.empresa_atual_id());

create policy planejamentos_compra_update_tenant
  on public.planejamentos_compra
  for update
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  )
  with check (empresa_id = public.empresa_atual_id());

create policy planejamentos_compra_delete_blocked
  on public.planejamentos_compra
  for delete
  using (false);
