create table if not exists public.materias_primas_fornecedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  materia_prima_id uuid not null references public.materias_primas(id),
  fornecedor_id uuid not null references public.fornecedores(id),
  codigo_fornecedor text,
  moeda text not null default 'BRL',
  preferencial boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint materias_primas_fornecedores_delete_chk
    check ((deleted_at is null) = (deleted_by is null)),
  constraint materias_primas_fornecedores_moeda_chk
    check (btrim(moeda) <> '')
);

create unique index if not exists materias_primas_fornecedores_uniq
  on public.materias_primas_fornecedores (
    empresa_id,
    materia_prima_id,
    fornecedor_id
  )
  where deleted_at is null;

create index if not exists materias_primas_fornecedores_material_idx
  on public.materias_primas_fornecedores (empresa_id, materia_prima_id)
  where deleted_at is null;

alter table public.materias_primas_fornecedores enable row level security;

drop policy if exists materias_primas_fornecedores_select_tenant
  on public.materias_primas_fornecedores;
drop policy if exists materias_primas_fornecedores_insert_tenant
  on public.materias_primas_fornecedores;
drop policy if exists materias_primas_fornecedores_update_tenant
  on public.materias_primas_fornecedores;
drop policy if exists materias_primas_fornecedores_delete_blocked
  on public.materias_primas_fornecedores;

create policy materias_primas_fornecedores_select_tenant
  on public.materias_primas_fornecedores
  for select
  to authenticated
  using (empresa_id = empresa_atual_id() and deleted_at is null);

create policy materias_primas_fornecedores_insert_tenant
  on public.materias_primas_fornecedores
  for insert
  to authenticated
  with check (empresa_id = empresa_atual_id());

create policy materias_primas_fornecedores_update_tenant
  on public.materias_primas_fornecedores
  for update
  to authenticated
  using (empresa_id = empresa_atual_id() and deleted_at is null)
  with check (empresa_id = empresa_atual_id());

create policy materias_primas_fornecedores_delete_blocked
  on public.materias_primas_fornecedores
  for delete
  to authenticated
  using (false);

grant select, insert, update on public.materias_primas_fornecedores
  to authenticated;

revoke delete on public.materias_primas_fornecedores from authenticated;
