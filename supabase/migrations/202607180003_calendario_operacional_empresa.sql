-- Calendario Operacional da Empresa - regra permanente, padrao semanal
-- de trabalho. Uma linha por empresa. Ver
-- ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secao 7.2.
create table public.calendario_operacional_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  segunda boolean not null default true,
  terca boolean not null default true,
  quarta boolean not null default true,
  quinta boolean not null default true,
  sexta boolean not null default true,
  sabado boolean not null default false,
  domingo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  constraint calendario_operacional_empresa_empresa_uniq unique (empresa_id)
);

comment on table public.calendario_operacional_empresa is
  'Calendario Operacional da Empresa - regra permanente, padrao semanal. Uma linha por empresa. Ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secao 7.2.';

create trigger calendario_operacional_empresa_set_updated_at
  before update on public.calendario_operacional_empresa
  for each row execute function public.set_updated_at();

alter table public.calendario_operacional_empresa enable row level security;

create policy calendario_operacional_empresa_select_tenant
  on public.calendario_operacional_empresa
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

create policy calendario_operacional_empresa_insert_tenant
  on public.calendario_operacional_empresa
  for insert to authenticated
  with check (empresa_id = public.empresa_atual_id());

create policy calendario_operacional_empresa_update_tenant
  on public.calendario_operacional_empresa
  for update to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin())
  with check (empresa_id = public.empresa_atual_id());

-- Backfill das empresas existentes: segunda-sexta = true, sabado/domingo = false
do $$
declare
  v_empresa record;
  v_usuario uuid;
begin
  for v_empresa in select id from public.empresas loop
    select id into v_usuario from public.usuarios where empresa_id = v_empresa.id limit 1;

    if v_usuario is not null then
      insert into public.calendario_operacional_empresa (empresa_id, created_by)
      values (v_empresa.id, v_usuario)
      on conflict (empresa_id) do nothing;
    end if;
  end loop;
end $$;
