-- NEXOTFE - Projetos/Orcamentos - Parte 02
-- Cria os itens do projeto, que representam as linhas do orcamento.
-- Cada item referencia um PN/produto ja existente.

create table if not exists public.projeto_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  projeto_id uuid not null references public.projetos(id),
  produto_id uuid not null references public.itens_industriais(id),
  pn text not null,
  descricao text not null,
  revisao text,
  quantidade numeric not null,
  material text,
  tipo_item text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint projeto_itens_quantidade_chk check (quantidade > 0)
);

comment on table public.projeto_itens is
  'Itens do projeto representam linhas do orcamento. Cada item referencia um PN existente.';

comment on column public.projeto_itens.produto_id is
  'Referencia o cadastro industrial do PN. Nao recriar produto ao adicionar item.';

comment on column public.projeto_itens.pn is
  'PN e a identidade tecnica unica da peca/produto.';
