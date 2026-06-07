-- NEXOTFE - Configuracoes de Numeracao
-- Prepara arquitetura para numeracao configuravel por empresa.
-- Exemplo atual: 26xxxx, mas nao fixar regra no codigo.

create table if not exists public.numeracao_configuracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  entidade text not null,
  prefixo text,
  ano text,
  sequencia_atual integer not null default 0,
  tamanho_sequencia integer not null default 4,
  mascara text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint numeracao_configuracoes_entidade_chk check (
    entidade in ('projeto', 'of')
  ),
  constraint numeracao_configuracoes_sequencia_chk check (
    sequencia_atual >= 0 and tamanho_sequencia > 0
  ),
  constraint numeracao_configuracoes_empresa_entidade_unique unique (
    empresa_id,
    entidade
  )
);

comment on table public.numeracao_configuracoes is
  'Configuracoes de numeracao por empresa. Ex: projeto 26xxxx.';

create trigger set_numeracao_configuracoes_updated_at
  before update on public.numeracao_configuracoes
  for each row
  execute function public.set_updated_at();

alter table public.numeracao_configuracoes enable row level security;

create policy numeracao_configuracoes_select_tenant
  on public.numeracao_configuracoes
  for select
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  );

create policy numeracao_configuracoes_insert_tenant
  on public.numeracao_configuracoes
  for insert
  with check (
    empresa_id = public.empresa_atual_id()
  );

create policy numeracao_configuracoes_update_tenant
  on public.numeracao_configuracoes
  for update
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  )
  with check (
    empresa_id = public.empresa_atual_id()
  );

create policy numeracao_configuracoes_delete_blocked
  on public.numeracao_configuracoes
  for delete
  using (false);

create index if not exists numeracao_configuracoes_empresa_id_idx
  on public.numeracao_configuracoes (empresa_id);

create index if not exists numeracao_configuracoes_entidade_idx
  on public.numeracao_configuracoes (entidade);
