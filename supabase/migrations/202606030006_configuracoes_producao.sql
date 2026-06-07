-- NEXOTFE - Configuracoes de Producao
-- Fundacao simples para planejamento inicial.
-- Nao implementa APS, calendario industrial avancado ou balanceamento automatico.

create table if not exists public.producao_configuracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  dias_buffer_entrega integer not null default 3,
  considerar_sabado boolean not null default false,
  eficiencia_engenharia numeric not null default 0.75,
  eficiencia_producao numeric not null default 0.85,
  eficiencia_montagem numeric not null default 0.75,
  prazo_resposta_cliente_dias_uteis integer not null default 3,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint producao_configuracoes_empresa_unique unique (empresa_id),
  constraint producao_configuracoes_buffer_chk check (dias_buffer_entrega >= 0),
  constraint producao_configuracoes_eficiencia_engenharia_chk check (
    eficiencia_engenharia > 0 and eficiencia_engenharia <= 1
  ),
  constraint producao_configuracoes_eficiencia_producao_chk check (
    eficiencia_producao > 0 and eficiencia_producao <= 1
  ),
  constraint producao_configuracoes_eficiencia_montagem_chk check (
    eficiencia_montagem > 0 and eficiencia_montagem <= 1
  ),
  constraint producao_configuracoes_prazo_cliente_chk check (
    prazo_resposta_cliente_dias_uteis >= 0
  )
);

comment on table public.producao_configuracoes is
  'Configuracoes simples de producao para planejamento inicial e protecao de prazo.';

create trigger set_producao_configuracoes_updated_at
  before update on public.producao_configuracoes
  for each row
  execute function public.set_updated_at();

alter table public.producao_configuracoes enable row level security;

create policy producao_configuracoes_select_tenant
  on public.producao_configuracoes
  for select
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  );

create policy producao_configuracoes_insert_tenant
  on public.producao_configuracoes
  for insert
  with check (
    empresa_id = public.empresa_atual_id()
  );

create policy producao_configuracoes_update_tenant
  on public.producao_configuracoes
  for update
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  )
  with check (
    empresa_id = public.empresa_atual_id()
  );

create policy producao_configuracoes_delete_blocked
  on public.producao_configuracoes
  for delete
  using (false);

create index if not exists producao_configuracoes_empresa_id_idx
  on public.producao_configuracoes (empresa_id);
