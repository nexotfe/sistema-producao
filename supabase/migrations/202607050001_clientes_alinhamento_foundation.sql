-- Alinhamento FOUNDATION do módulo Clientes.
-- Preserva dados existentes, padroniza nome_fantasia, aplica unicidade de CNPJ
-- por empresa e remove permissão de exclusão física para usuários autenticados.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clientes'
      and column_name = 'empresa'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clientes'
      and column_name = 'nome_fantasia'
  ) then
    alter table public.clientes rename column empresa to nome_fantasia;
  end if;
end $$;

alter index if exists public.clientes_empresa_idx rename to clientes_nome_fantasia_idx;

drop index if exists public.clientes_empresa_cnpj_uniq;

create unique index if not exists clientes_empresa_cnpj_uniq
  on public.clientes (
    empresa_id,
    regexp_replace(cnpj, '\D', '', 'g')
  )
  where cnpj is not null
    and btrim(cnpj) <> ''
    and deleted_at is null;

drop policy if exists "admins podem editar clientes" on public.clientes;
drop policy if exists "admins podem excluir clientes" on public.clientes;
drop policy if exists "usuarios autenticados podem criar clientes" on public.clientes;
drop policy if exists "usuarios autenticados podem visualizar clientes" on public.clientes;
drop policy if exists clientes_select on public.clientes;
drop policy if exists clientes_insert on public.clientes;
drop policy if exists clientes_update on public.clientes;

create policy clientes_select on public.clientes
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and deleted_at is null
  );

create policy clientes_insert on public.clientes
  for insert
  to authenticated
  with check (
    empresa_id = public.empresa_atual_id()
    and created_by = auth.uid()
  );

create policy clientes_update on public.clientes
  for update
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
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

revoke delete on public.clientes from anon;
revoke delete on public.clientes from authenticated;

drop view if exists public.clientes_ativos;

create view public.clientes_ativos as
select
  id,
  empresa_id,
  nome,
  nome_fantasia,
  telefone,
  email,
  cnpj,
  cidade,
  observacoes,
  ativo,
  created_at,
  updated_at,
  deleted_at,
  deleted_by,
  created_by
from public.clientes
where empresa_id = public.empresa_atual_id()
  and ativo = true
  and deleted_at is null;

grant select on public.clientes_ativos to authenticated;

comment on column public.clientes.nome_fantasia is 'Nome fantasia do cliente. Substitui o antigo campo empresa para evitar ambiguidade com empresa_id.';
comment on index public.clientes_empresa_cnpj_uniq is 'Garante CNPJ unico por empresa ativa, considerando CNPJ normalizado sem mascara.';
