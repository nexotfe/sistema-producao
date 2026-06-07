-- NEXOTFE - Planejamento de Compras - Parte 01
-- Agrupa requisicoes compativeis antes do pedido de compra.

create table if not exists public.planejamentos_compra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  numero_planejamento text,
  materia_prima_id uuid not null references public.materias_primas(id),
  descricao_compra text not null,
  unidade_necessidade text not null,
  quantidade_necessaria_total numeric not null default 0,
  unidade_compra text,
  quantidade_planejada_compra numeric,
  sobra_prevista numeric,
  status text not null default 'em_planejamento',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint planejamentos_compra_status_chk check (
    status in ('em_planejamento', 'pronto_pedido', 'convertido_pedido', 'cancelado')
  ),
  constraint planejamentos_compra_qtd_chk check (
    quantidade_necessaria_total >= 0
    and (quantidade_planejada_compra is null or quantidade_planejada_compra > 0)
    and (sobra_prevista is null or sobra_prevista >= 0)
  ),
  constraint planejamentos_compra_unidade_chk check (
    unidade_necessidade in ('kg', 'metro', 'barra', 'chapa', 'peca')
  )
);

create table if not exists public.planejamento_compra_origens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  planejamento_compra_id uuid not null references public.planejamentos_compra(id),
  requisicao_compra_id uuid not null references public.requisicoes_compra(id),
  requisicao_compra_item_id uuid not null references public.requisicao_compra_itens(id),
  projeto_id uuid references public.projetos(id),
  of_numero text,
  quantidade_necessaria numeric not null,
  unidade text not null,
  observacoes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  constraint planejamento_compra_origens_qtd_chk check (quantidade_necessaria > 0),
  constraint planejamento_compra_origens_unidade_chk check (
    unidade in ('kg', 'metro', 'barra', 'chapa', 'peca')
  ),
  constraint planejamento_compra_origem_uniq unique (
    empresa_id,
    planejamento_compra_id,
    requisicao_compra_item_id
  )
);
