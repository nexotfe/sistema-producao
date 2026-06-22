-- NEXOTFE 1.0 — Baseline SQL
-- Módulo 002: empresa, usuário, contexto, permissões e RLS-base
-- Dependência: 001_extensions.sql
-- Alvo: projeto Supabase com auth.users e roles de API disponíveis

begin;

create table public.empresas (
  id uuid primary key default extensions.gen_random_uuid(),
  codigo bigint generated always as identity unique,
  nome text not null,
  slug text not null unique,
  cnpj text,
  email text,
  telefone text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  constraint empresas_nome_chk
    check (btrim(nome) <> ''),
  constraint empresas_slug_chk
    check (slug = lower(btrim(slug)) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint empresas_cnpj_chk
    check (cnpj is null or btrim(cnpj) <> ''),
  constraint empresas_email_chk
    check (email is null or email = lower(btrim(email)))
);

-- public.usuarios é a única autoridade de negócio para empresa, papel e permissões.
-- auth.users fornece somente a identidade autenticada.
create table public.usuarios (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid not null unique
    references auth.users(id) on delete restrict,
  empresa_id uuid not null
    references public.empresas(id) on delete restrict,
  nome text not null,
  email text not null,
  papel text not null,
  permissoes text[] not null default array[]::text[],
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  constraint usuarios_empresa_id_id_uniq unique (empresa_id, id),
  constraint usuarios_nome_chk
    check (btrim(nome) <> ''),
  constraint usuarios_email_chk
    check (email = lower(btrim(email)) and email <> ''),
  constraint usuarios_papel_chk
    check (papel = lower(btrim(papel)) and papel <> ''),
  constraint usuarios_permissoes_sem_null_chk
    check (array_position(permissoes, null) is null)
);

create unique index usuarios_empresa_email_uniq
  on public.usuarios (empresa_id, email);

create index usuarios_empresa_ativo_idx
  on public.usuarios (empresa_id, ativo);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$function$;

revoke all on function public.set_updated_at() from public;

create trigger empresas_set_updated_at
before update on public.empresas
for each row execute function public.set_updated_at();

create trigger usuarios_set_updated_at
before update on public.usuarios
for each row execute function public.set_updated_at();

-- Resolve o tenant exclusivamente por public.usuarios.
-- Não existe fallback para profiles, metadata ou claims de empresa.
create or replace function public.empresa_atual_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select u.empresa_id
    from public.usuarios u
    join public.empresas e on e.id = u.empresa_id
   where u.auth_user_id = auth.uid()
     and u.ativo = true
     and e.ativo = true
   limit 1
$function$;

create or replace function public.usuario_tem_permissao(p_permissao text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
      from public.usuarios u
      join public.empresas e on e.id = u.empresa_id
     where u.auth_user_id = auth.uid()
       and u.ativo = true
       and e.ativo = true
       and nullif(btrim(p_permissao), '') is not null
       and p_permissao = any (u.permissoes)
  )
$function$;

revoke all on function public.empresa_atual_id() from public;
revoke all on function public.usuario_tem_permissao(text) from public;

grant usage on schema public, extensions to authenticated, service_role;

grant execute on function public.empresa_atual_id()
  to authenticated, service_role;
grant execute on function public.usuario_tem_permissao(text)
  to authenticated, service_role;

revoke all on table public.empresas from public, anon, authenticated;
revoke all on table public.usuarios from public, anon, authenticated;

grant select, update on table public.empresas to authenticated;
grant select, insert, update on table public.usuarios to authenticated;
grant all on table public.empresas, public.usuarios to service_role;

alter table public.empresas enable row level security;
alter table public.usuarios enable row level security;

create policy empresas_select_mesmo_tenant
on public.empresas
for select
to authenticated
using (id = public.empresa_atual_id());

create policy empresas_update_com_permissao
on public.empresas
for update
to authenticated
using (
  id = public.empresa_atual_id()
  and public.usuario_tem_permissao('admin.empresas.gerenciar')
)
with check (
  id = public.empresa_atual_id()
  and public.usuario_tem_permissao('admin.empresas.gerenciar')
);

create policy usuarios_select_autorizado
on public.usuarios
for select
to authenticated
using (
  public.empresa_atual_id() is not null
  and (
    auth_user_id = auth.uid()
    or (
      empresa_id = public.empresa_atual_id()
      and public.usuario_tem_permissao('admin.usuarios.visualizar')
    )
  )
);

create policy usuarios_insert_com_permissao
on public.usuarios
for insert
to authenticated
with check (
  empresa_id = public.empresa_atual_id()
  and created_by = auth.uid()
  and public.usuario_tem_permissao('admin.usuarios.gerenciar')
);

create policy usuarios_update_com_permissao
on public.usuarios
for update
to authenticated
using (
  empresa_id = public.empresa_atual_id()
  and public.usuario_tem_permissao('admin.usuarios.gerenciar')
)
with check (
  empresa_id = public.empresa_atual_id()
  and public.usuario_tem_permissao('admin.usuarios.gerenciar')
);

comment on table public.empresas is
  'Limite de segurança, rastreabilidade e isolamento dos dados do NEXOTFE.';
comment on table public.usuarios is
  'Única fonte oficial de empresa, papel e permissões; vinculada à identidade auth.users.';
comment on column public.usuarios.permissoes is
  'Permissões explícitas do usuário. Nenhuma autorização de negócio é lida de metadata do Auth.';
comment on function public.empresa_atual_id() is
  'Resolve a empresa ativa exclusivamente por public.usuarios e auth.uid().';

commit;
