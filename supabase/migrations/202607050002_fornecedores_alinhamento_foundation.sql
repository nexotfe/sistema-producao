-- Alinhamento FOUNDATION do módulo Fornecedores.
-- Preserva dados existentes, padroniza nome_fantasia e aplica unicidade de CNPJ
-- por empresa ativa com exclusão física bloqueada.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fornecedores'
      and column_name = 'empresa'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fornecedores'
      and column_name = 'nome_fantasia'
  ) then
    alter table public.fornecedores rename column empresa to nome_fantasia;
  end if;
end $$;

drop index if exists public.fornecedores_empresa_cnpj_idx;
drop index if exists public.fornecedores_empresa_cnpj_uniq;

create unique index fornecedores_empresa_cnpj_uniq
  on public.fornecedores (
    empresa_id,
    regexp_replace(cnpj, '\D', '', 'g')
  )
  where cnpj is not null
    and btrim(cnpj) <> ''
    and deleted_at is null;

create index if not exists fornecedores_empresa_nome_fantasia_idx
  on public.fornecedores (empresa_id, nome_fantasia);

drop policy if exists fornecedores_delete_blocked on public.fornecedores;
drop policy if exists fornecedores_insert_tenant on public.fornecedores;
drop policy if exists fornecedores_select_tenant on public.fornecedores;
drop policy if exists fornecedores_update_tenant on public.fornecedores;

create policy fornecedores_select_tenant on public.fornecedores
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  );

create policy fornecedores_insert_tenant on public.fornecedores
  for insert
  to authenticated
  with check (
    empresa_id = public.empresa_atual_id()
    and created_by = auth.uid()
  );

create policy fornecedores_update_tenant on public.fornecedores
  for update
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
    and (
      created_by = auth.uid()
      or public.usuario_e_admin()
    )
  )
  with check (
    empresa_id = public.empresa_atual_id()
    and (
      created_by = auth.uid()
      or public.usuario_e_admin()
    )
  );

create policy fornecedores_delete_blocked on public.fornecedores
  for delete
  to authenticated
  using (false);

revoke delete on public.fornecedores from anon;
revoke delete on public.fornecedores from authenticated;

comment on column public.fornecedores.nome_fantasia is 'Nome fantasia do fornecedor. Substitui o antigo campo empresa para evitar ambiguidade com empresa_id.';
comment on index public.fornecedores_empresa_cnpj_uniq is 'Garante CNPJ unico por empresa ativa, considerando CNPJ normalizado sem mascara.';
