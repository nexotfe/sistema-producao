-- NEXOTFE - Projetos/Orcamentos - Parte 03
-- Ativa RLS, isolamento por empresa, updated_at e soft delete.
-- Requer as funcoes public.empresa_atual_id() e public.set_updated_at().

create trigger set_projetos_updated_at
  before update on public.projetos
  for each row
  execute function public.set_updated_at();

create trigger set_projeto_itens_updated_at
  before update on public.projeto_itens
  for each row
  execute function public.set_updated_at();

alter table public.projetos enable row level security;
alter table public.projeto_itens enable row level security;

create policy projetos_select_tenant
  on public.projetos
  for select
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  );

create policy projetos_insert_tenant
  on public.projetos
  for insert
  with check (
    empresa_id = public.empresa_atual_id()
  );

create policy projetos_update_tenant
  on public.projetos
  for update
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  )
  with check (
    empresa_id = public.empresa_atual_id()
  );

create policy projetos_delete_blocked
  on public.projetos
  for delete
  using (false);

create policy projeto_itens_select_tenant
  on public.projeto_itens
  for select
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  );

create policy projeto_itens_insert_tenant
  on public.projeto_itens
  for insert
  with check (
    empresa_id = public.empresa_atual_id()
  );

create policy projeto_itens_update_tenant
  on public.projeto_itens
  for update
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  )
  with check (
    empresa_id = public.empresa_atual_id()
  );

create policy projeto_itens_delete_blocked
  on public.projeto_itens
  for delete
  using (false);
