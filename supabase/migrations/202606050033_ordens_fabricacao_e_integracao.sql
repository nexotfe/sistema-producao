-- NEXOTFE - Ordens de Fabricacao e Integracao de Fluxo Industrial
-- Esta migration adiciona a modelagem de OF e conecta BOM, estoque, consumo interno,
-- requisicoes de compra e pedidos de compra ao fluxo de producao.

create table if not exists public.ordens_fabricacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  numero_of text not null,
  projeto_id uuid not null references public.projetos(id),
  projeto_item_id uuid references public.projeto_itens(id),
  produto_id uuid not null references public.itens_industriais(id),
  bom_id uuid references public.boms(id),
  tipo text not null default 'normal',
  status text not null default 'planejada',
  quantidade_planejada numeric not null default 0,
  quantidade_produzida numeric not null default 0,
  unidade text not null,
  data_inicio_planejada date,
  data_conclusao_planejada date,
  data_inicio_real date,
  data_conclusao_real date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint ordens_fabricacao_status_chk check (
    status in ('planejada', 'em_producao', 'concluida', 'suspensa', 'cancelada')
  ),
  constraint ordens_fabricacao_tipo_chk check (
    tipo in ('normal', 'reparo', 'servico')
  ),
  constraint ordens_fabricacao_quantidade_chk check (
    quantidade_planejada >= 0
    and quantidade_produzida >= 0
  ),
  constraint ordens_fabricacao_unidade_chk check (
    unidade in ('kg', 'metro', 'barra', 'chapa', 'peca')
  )
);

comment on table public.ordens_fabricacao is
  'Ordem de Fabricacao (OF) vinculada a projeto, BOM e itens industriais.';

comment on column public.ordens_fabricacao.numero_of is
  'Numero operacional da OF. Deve ser gerado pela numeracao de empresa.';

comment on column public.ordens_fabricacao.produto_id is
  'PN produzido por esta OF.';

comment on column public.ordens_fabricacao.bom_id is
  'BOM selecionada para fabricar este produto na OF.';

comment on column public.ordens_fabricacao.projeto_item_id is
  'Item do projeto que originou esta OF, quando aplicavel.';

create unique index if not exists ordens_fabricacao_empresa_numero_idx
  on public.ordens_fabricacao (empresa_id, numero_of);

create index if not exists ordens_fabricacao_projeto_idx
  on public.ordens_fabricacao (projeto_id);

create index if not exists ordens_fabricacao_projeto_item_idx
  on public.ordens_fabricacao (projeto_item_id);

create index if not exists ordens_fabricacao_produto_idx
  on public.ordens_fabricacao (produto_id);

create index if not exists ordens_fabricacao_bom_idx
  on public.ordens_fabricacao (bom_id);

alter table public.projeto_itens
  add column if not exists bom_id uuid references public.boms(id);

comment on column public.projeto_itens.bom_id is
  'BOM escolhida para fabricar este item do projeto.';

alter table public.consumos_internos
  add column if not exists of_id uuid references public.ordens_fabricacao(id);

comment on column public.consumos_internos.of_id is
  'FK para a ordem de fabricacao que consumiu material do estoque.';

alter table public.estoque_movimentacoes
  add column if not exists of_id uuid references public.ordens_fabricacao(id);

comment on column public.estoque_movimentacoes.of_id is
  'FK para a OF associada a esta movimentacao de estoque.';

alter table public.requisicoes_compra
  add column if not exists of_id uuid references public.ordens_fabricacao(id);

comment on column public.requisicoes_compra.of_id is
  'FK para a OF que originou a requisicao de compra.';

alter table public.planejamento_compra_origens
  add column if not exists of_id uuid references public.ordens_fabricacao(id);

comment on column public.planejamento_compra_origens.of_id is
  'FK para a OF que participa deste planejamento de compras.';

alter table public.pedidos_compra
  add column if not exists of_id uuid references public.ordens_fabricacao(id);

comment on column public.pedidos_compra.of_id is
  'FK para a OF que motivou este pedido de compra.';

alter table public.pedido_compra_itens
  add column if not exists of_id uuid references public.ordens_fabricacao(id);

comment on column public.pedido_compra_itens.of_id is
  'FK para a OF visivel no item de pedido de compra.';

create index if not exists consumos_internos_of_id_idx
  on public.consumos_internos (of_id);

create index if not exists estoque_movimentacoes_of_id_idx
  on public.estoque_movimentacoes (of_id);

create index if not exists requisicoes_compra_of_id_idx
  on public.requisicoes_compra (of_id);

create index if not exists planejamento_compra_origens_of_id_idx
  on public.planejamento_compra_origens (of_id);

create index if not exists pedidos_compra_of_id_idx
  on public.pedidos_compra (of_id);

create index if not exists pedido_compra_itens_of_id_idx
  on public.pedido_compra_itens (of_id);

create index if not exists projeto_itens_bom_idx
  on public.projeto_itens (bom_id);

create trigger set_ordens_fabricacao_updated_at
  before update on public.ordens_fabricacao
  for each row
  execute function public.set_updated_at();

alter table public.ordens_fabricacao enable row level security;

create policy ordens_fabricacao_select_tenant
  on public.ordens_fabricacao
  for select
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  );

create policy ordens_fabricacao_insert_tenant
  on public.ordens_fabricacao
  for insert
  with check (empresa_id = public.empresa_atual_id());

create policy ordens_fabricacao_update_tenant
  on public.ordens_fabricacao
  for update
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  )
  with check (empresa_id = public.empresa_atual_id());

create policy ordens_fabricacao_delete_blocked
  on public.ordens_fabricacao
  for delete
  using (false);

create or replace view public.vw_of_fluxo_industrial as
select
  ofx.id as of_id,
  ofx.numero_of,
  ofx.projeto_id,
  ofx.projeto_item_id,
  ofx.produto_id,
  ofx.bom_id,
  ofx.status as of_status,
  ofx.tipo as of_tipo,
  ofx.quantidade_planejada,
  ofx.quantidade_produzida,
  ofx.unidade,
  coalesce(sum(ci.quantidade), 0) as total_consumo_interno,
  coalesce(sum(rcit.quantidade_necessaria), 0) as total_requisicao_compra,
  count(distinct pc.id) as pedidos_compra_abertos
from public.ordens_fabricacao ofx
left join public.consumos_internos ci on ci.of_id = ofx.id
left join public.requisicoes_compra rc on rc.of_id = ofx.id
left join public.requisicao_compra_itens rcit on rcit.requisicao_compra_id = rc.id
left join public.pedidos_compra pc on pc.of_id = ofx.id
where ofx.ativo = true
group by
  ofx.id,
  ofx.numero_of,
  ofx.projeto_id,
  ofx.projeto_item_id,
  ofx.produto_id,
  ofx.bom_id,
  ofx.status,
  ofx.tipo,
  ofx.quantidade_planejada,
  ofx.quantidade_produzida,
  ofx.unidade;
