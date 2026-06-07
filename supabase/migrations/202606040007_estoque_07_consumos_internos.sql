-- NEXOTFE - Estoque/Compras - Parte 07
-- Cria a fundacao de Consumo Interno (CI).
-- Escopo: registrar uso de material existente em estoque, sem compra externa.

create table if not exists public.consumos_internos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  projeto_id uuid not null references public.projetos(id),
  of_numero text not null,
  materia_prima_id uuid not null references public.materias_primas(id),
  estoque_movimentacao_id uuid references public.estoque_movimentacoes(id),
  local_estoque text not null default 'principal',
  quantidade numeric not null,
  unidade text not null,
  saldo_consumido numeric not null,
  custo_unitario_material numeric not null default 0,
  custo_total_material numeric generated always as (
    quantidade * custo_unitario_material
  ) stored,
  data_movimentacao date not null default current_date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint consumos_internos_quantidades_chk check (
    quantidade > 0
    and saldo_consumido > 0
    and saldo_consumido <= quantidade
  ),
  constraint consumos_internos_custo_chk check (custo_unitario_material >= 0),
  constraint consumos_internos_unidade_chk check (
    unidade in ('kg', 'metro', 'barra', 'chapa', 'peca')
  )
);

comment on table public.consumos_internos is
  'Consumo Interno registra material atendido pelo estoque para projeto e OF.';

comment on column public.consumos_internos.of_numero is
  'Numero operacional da OF. FK sera adicionada quando a tabela de OF existir.';

comment on column public.consumos_internos.estoque_movimentacao_id is
  'Movimentacao de estoque relacionada ao consumo, quando ja registrada.';

comment on column public.consumos_internos.custo_total_material is
  'Custo industrial do material consumido. Nao representa compra externa.';

create trigger set_consumos_internos_updated_at
  before update on public.consumos_internos
  for each row
  execute function public.set_updated_at();

alter table public.consumos_internos enable row level security;

create policy consumos_internos_select_tenant
  on public.consumos_internos
  for select
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  );

create policy consumos_internos_insert_tenant
  on public.consumos_internos
  for insert
  with check (empresa_id = public.empresa_atual_id());

create policy consumos_internos_update_tenant
  on public.consumos_internos
  for update
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  )
  with check (empresa_id = public.empresa_atual_id());

create policy consumos_internos_delete_blocked
  on public.consumos_internos
  for delete
  using (false);

create index if not exists consumos_internos_empresa_data_idx
  on public.consumos_internos (empresa_id, data_movimentacao);

create index if not exists consumos_internos_projeto_idx
  on public.consumos_internos (projeto_id);

create index if not exists consumos_internos_of_numero_idx
  on public.consumos_internos (of_numero);

create index if not exists consumos_internos_material_idx
  on public.consumos_internos (materia_prima_id);
