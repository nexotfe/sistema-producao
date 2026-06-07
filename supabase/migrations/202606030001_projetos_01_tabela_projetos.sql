-- NEXOTFE - Projetos/Orcamentos - Parte 01
-- Cria a tabela principal de projetos.
-- Escopo: fundacao industrial. Nao implementar OF, OP, APS ou capacidade aqui.

create table if not exists public.projetos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  numero_projeto text not null unique,
  cliente_id uuid references public.clientes(id),
  tipo_projeto text not null,
  data_objetivo date,
  prioridade text not null default 'normal',
  margem_lucro_percent numeric,
  regra_faturamento text,
  observacoes text,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint projetos_numero_formato_chk check (numero_projeto ~ '^[0-9]{6}$'),
  constraint projetos_tipo_chk check (
    tipo_projeto in ('fabricacao', 'desenvolvimento')
  ),
  constraint projetos_status_chk check (
    status in ('em_elaboracao', 'em_analise', 'aprovado', 'perdido', 'cancelado')
  ),
  constraint projetos_prioridade_chk check (
    prioridade in ('baixa', 'normal', 'urgente')
  ),
  constraint projetos_margem_lucro_chk check (
    margem_lucro_percent is null or margem_lucro_percent >= 0
  )
);

comment on table public.projetos is
  'Projeto representa o orcamento comercial e a demanda industrial futura.';

comment on column public.projetos.numero_projeto is
  'Formato AANNNN. Ex: 260001, 270001.';

comment on column public.projetos.data_objetivo is
  'Data central para necessidade futura de producao.';
