-- NEXOTFE - Estoque - Parte 03
-- Cria requisicoes de compra geradas por necessidade de material.
-- Escopo: necessidade calculada. Nao implementar fornecedor, aprovacao ou MRP.

create table if not exists public.requisicoes_compra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  numero_requisicao text,
  projeto_id uuid references public.projetos(id),
  of_numero text,
  data_necessidade_material date not null,
  status text not null default 'aberta',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint requisicoes_compra_status_chk check (
    status in ('aberta', 'em_compra', 'atendida', 'cancelada')
  ),
  constraint requisicoes_compra_numero_empresa_uniq unique (
    empresa_id,
    numero_requisicao
  )
);

create table if not exists public.requisicao_compra_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  requisicao_compra_id uuid not null references public.requisicoes_compra(id),
  materia_prima_id uuid not null references public.materias_primas(id),
  quantidade_necessaria numeric not null,
  unidade text not null,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint requisicao_compra_itens_quantidade_chk check (
    quantidade_necessaria > 0
  ),
  constraint requisicao_compra_itens_unidade_chk check (
    unidade in ('kg', 'metro', 'barra', 'chapa', 'peca')
  )
);

comment on table public.requisicoes_compra is
  'Cabecalho da necessidade de compra gerada pela falta de materia-prima.';

comment on table public.requisicao_compra_itens is
  'Itens de materia-prima necessarios para atender projeto e OF.';

comment on column public.requisicoes_compra.data_necessidade_material is
  'Data em que a materia-prima precisa estar disponivel para producao.';
