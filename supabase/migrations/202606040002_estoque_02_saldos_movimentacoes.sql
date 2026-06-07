-- NEXOTFE - Estoque - Parte 02
-- Cria saldos e movimentacoes simples de estoque.
-- Escopo: saldo disponivel, saldo reservado e historico operacional.

create table if not exists public.estoque_saldos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  materia_prima_id uuid not null references public.materias_primas(id),
  local_estoque text not null default 'principal',
  saldo_disponivel numeric not null default 0,
  saldo_reservado numeric not null default 0,
  saldo_livre numeric generated always as (saldo_disponivel - saldo_reservado) stored,
  updated_at timestamptz not null default now(),
  constraint estoque_saldos_quantidades_chk check (
    saldo_disponivel >= 0
    and saldo_reservado >= 0
    and saldo_reservado <= saldo_disponivel
  ),
  constraint estoque_saldos_material_local_uniq unique (
    empresa_id,
    materia_prima_id,
    local_estoque
  )
);

create table if not exists public.estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  materia_prima_id uuid not null references public.materias_primas(id),
  local_estoque text not null default 'principal',
  tipo_movimento text not null,
  quantidade numeric not null,
  projeto_id uuid references public.projetos(id),
  of_numero text,
  observacoes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  constraint estoque_movimentacoes_tipo_chk check (
    tipo_movimento in (
      'entrada',
      'saida',
      'reserva',
      'liberacao_reserva',
      'ajuste'
    )
  ),
  constraint estoque_movimentacoes_quantidade_chk check (quantidade > 0)
);

comment on table public.estoque_saldos is
  'Saldo atual de materia-prima por local de estoque.';

comment on column public.estoque_saldos.saldo_livre is
  'Saldo disponivel menos saldo reservado. Base para decidir disponibilidade.';

comment on table public.estoque_movimentacoes is
  'Historico simples de entradas, saidas, reservas e ajustes de estoque.';
