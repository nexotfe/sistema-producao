-- NEXOTFE - Modelagem industrial - Parte 01
-- Cria o cadastro de itens industriais e a estrutura BOM para conectar projetos, estoque,
-- consumo interno e compras ao fluxo industrial.

create table if not exists public.itens_industriais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  pn text not null,
  descricao text not null,
  revisao text,
  tipo text not null default 'produto_final',
  categoria text,
  unidade text not null,
  peso_unitario numeric,
  codigo_cliente text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint itens_industriais_tipo_chk check (
    tipo in ('produto_final', 'subconjunto', 'componentes')
  ),
  constraint itens_industriais_unidade_chk check (
    unidade in ('kg', 'metro', 'barra', 'chapa', 'peca')
  ),
  constraint itens_industriais_pn_empresa_uniq unique (empresa_id, pn)
);

comment on table public.itens_industriais is
  'Cadastro de itens industriais (PNs) usados por projetos, BOMs e roteiros.';

comment on column public.itens_industriais.pn is
  'Numero de peça / PN que identifica o item industrial.';

comment on column public.itens_industriais.tipo is
  'Define se o item e produto final, subconjunto ou componente interno.';

comment on column public.itens_industriais.unidade is
  'Unidade base para quantidades do item industrial.';

create table if not exists public.boms (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  produto_id uuid not null references public.itens_industriais(id),
  versao text not null default 'A',
  descricao text,
  status text not null default 'ativo',
  data_validade date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint boms_status_chk check (
    status in ('ativo', 'inativo', 'rascunho')
  ),
  constraint boms_produto_versao_uniq unique (empresa_id, produto_id, versao)
);

comment on table public.boms is
  'Estrutura BOM principal que agrupa componentes para um produto industrial.';

comment on column public.boms.produto_id is
  'Produto final associado a esta estrutura BOM.';

comment on column public.boms.versao is
  'Versao da BOM para controle de revisoes industriais.';

create table if not exists public.bom_itens (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references public.boms(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id),
  materia_prima_id uuid references public.materias_primas(id),
  componente_produto_id uuid references public.itens_industriais(id),
  componente_tipo text not null default 'materia_prima',
  quantidade numeric not null,
  unidade text not null,
  nivel smallint not null default 1,
  ordem smallint not null default 1,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint bom_itens_tipo_chk check (
    componente_tipo in ('materia_prima', 'subconjunto')
  ),
  constraint bom_itens_referencia_chk check (
    (componente_tipo = 'materia_prima' and materia_prima_id is not null and componente_produto_id is null)
    or
    (componente_tipo = 'subconjunto' and componente_produto_id is not null and materia_prima_id is null)
  ),
  constraint bom_itens_quantidade_chk check (quantidade > 0),
  constraint bom_itens_unidade_chk check (
    unidade in ('kg', 'metro', 'barra', 'chapa', 'peca')
  )
);

comment on table public.bom_itens is
  'Itens de BOM que representam materias-primas ou subconjuntos usados na fabricacao.';

comment on column public.bom_itens.componente_tipo is
  'Tipo de componente: materia-prima ou subconjunto/product.';

comment on column public.bom_itens.quantidade is
  'Quantidade de componente necessaria para fabricar o produto final.';

create index if not exists bom_itens_bom_id_idx on public.bom_itens (bom_id);
create index if not exists bom_itens_materia_prima_id_idx on public.bom_itens (materia_prima_id);
create index if not exists bom_itens_componente_produto_id_idx on public.bom_itens (componente_produto_id);
