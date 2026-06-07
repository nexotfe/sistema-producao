-- NEXOTFE - Estoque - Parte 01
-- Cria o cadastro base de materias-primas.
-- Escopo: fundacao industrial simples. Nao implementar MRP ou fornecedor aqui.

create table if not exists public.materias_primas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  codigo text,
  descricao text not null,
  unidade text not null,
  especificacao text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint materias_primas_unidade_chk check (
    unidade in ('kg', 'metro', 'barra', 'chapa', 'peca')
  ),
  constraint materias_primas_codigo_empresa_uniq unique (empresa_id, codigo)
);

comment on table public.materias_primas is
  'Cadastro de materias-primas usadas em roteiros de fabricacao e estoque.';

comment on column public.materias_primas.unidade is
  'Unidade operacional do material. O roteiro deve herdar esta unidade.';
