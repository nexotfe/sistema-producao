-- NEXOTFE - Pedido Compra - Parte 01
-- Pedido leve gerado a partir do planejamento.

create table if not exists public.pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  numero_pedido text,
  planejamento_compra_id uuid references public.planejamentos_compra(id),
  fornecedor_nome text,
  status text not null default 'rascunho',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint pedidos_compra_status_chk check (
    status in ('rascunho', 'enviado', 'confirmado', 'cancelado')
  )
);

create table if not exists public.pedido_compra_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  pedido_compra_id uuid not null references public.pedidos_compra(id),
  planejamento_compra_id uuid references public.planejamentos_compra(id),
  materia_prima_id uuid not null references public.materias_primas(id),
  descricao_compra text not null,
  quantidade numeric,
  unidade text,
  comprar_descricao text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
