-- NEXOTFE - configuracoes_empresa
-- Esta tabela nunca existiu no remoto real: so estava documentada em
-- supabase/baseline/003_admin.sql, que o proprio README do baseline marca
-- como validado apenas em Postgres local descartavel ("Nao aplicar ao
-- projeto Supabase remoto sem plano formal de implantacao"). Confirmado
-- por consulta direta ao remoto (information_schema, REST API e
-- supabase_migrations.schema_migrations) que a tabela nao existe em
-- producao.
--
-- Estrutura adaptada do baseline para bater com o padrao de
-- auditoria/RLS efetivamente em producao hoje (identico ao replicado em
-- bom_operacoes/bom_servicos_terceiros/bom_transportes, migration
-- 202607060001): empresa_id, ativo, created_at/updated_at,
-- created_by/deleted_by referenciando auth.users(id) diretamente (sem
-- "on delete restrict", conforme confirmado em bom_operacoes), RLS com
-- 4 policies "mesma empresa", triggers set_empresa_id_from_usuario +
-- set_updated_at.

create table public.configuracoes_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  chave text not null,
  valor jsonb not null,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint configuracoes_empresa_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint configuracoes_empresa_empresa_chave_uniq unique (empresa_id, chave),
  constraint configuracoes_empresa_chave_chk
    check (chave = lower(btrim(chave)) and chave ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  constraint configuracoes_empresa_delete_chk
    check ((deleted_at is null) = (deleted_by is null))
);

create index configuracoes_empresa_empresa_id_idx on public.configuracoes_empresa (empresa_id);
create index configuracoes_empresa_ativo_idx on public.configuracoes_empresa (ativo);

create trigger configuracoes_empresa_set_empresa_id
  before insert on public.configuracoes_empresa
  for each row execute function public.set_empresa_id_from_usuario();
create trigger configuracoes_empresa_set_updated_at
  before update on public.configuracoes_empresa
  for each row execute function public.set_updated_at();

alter table public.configuracoes_empresa enable row level security;

create policy "nexotfe configuracoes empresa select mesma empresa"
  on public.configuracoes_empresa for select
  to authenticated
  using (empresa_id = public.empresa_atual_id());
create policy "nexotfe configuracoes empresa insert mesma empresa"
  on public.configuracoes_empresa for insert
  to authenticated
  with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid());
create policy "nexotfe configuracoes empresa update mesma empresa"
  on public.configuracoes_empresa for update
  to authenticated
  using (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()))
  with check (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()));
create policy "nexotfe configuracoes empresa delete admin mesma empresa"
  on public.configuracoes_empresa for delete
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

comment on table public.configuracoes_empresa is
  'Parametros administrativos da empresa, identificados por chave estavel (jsonb). Piloto: colunas configuraveis por tela.';
