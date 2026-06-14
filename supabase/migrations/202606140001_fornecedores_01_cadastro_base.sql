-- NEXOTFE - Fornecedores - Parte 01
-- Cadastro base de fornecedores com isolamento por empresa.

create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  nome text,
  empresa text,
  telefone text,
  email text,
  telefone_comercial text,
  email_comercial text,
  cnpj text,
  observacoes text,
  inscricao_estadual text,
  inscricao_municipal text,
  segmento text,
  site text,
  cep text,
  estado text,
  cidade text,
  bairro text,
  endereco text,
  numero text,
  complemento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

comment on table public.fornecedores is
  'Cadastro base de fornecedores usado pelo modulo de compras e rotinas operacionais.';

create index if not exists fornecedores_empresa_idx
  on public.fornecedores (empresa_id);

create index if not exists fornecedores_empresa_nome_idx
  on public.fornecedores (empresa_id, nome);

create index if not exists fornecedores_empresa_cnpj_idx
  on public.fornecedores (empresa_id, cnpj);

create trigger set_fornecedores_updated_at
  before update on public.fornecedores
  for each row
  execute function public.set_updated_at();

alter table public.fornecedores enable row level security;

create policy fornecedores_select_tenant
  on public.fornecedores
  for select
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  );

create policy fornecedores_insert_tenant
  on public.fornecedores
  for insert
  with check (
    empresa_id = public.empresa_atual_id()
  );

create policy fornecedores_update_tenant
  on public.fornecedores
  for update
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  )
  with check (
    empresa_id = public.empresa_atual_id()
  );

create policy fornecedores_delete_blocked
  on public.fornecedores
  for delete
  using (false);
