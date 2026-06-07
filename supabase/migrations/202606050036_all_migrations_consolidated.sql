-- NEXOTFE - Execução consolidada de todas as migrations de OF, BOM e Fluxo Operacional
-- Este arquivo consolidado permite executar todas as migrations pendentes de uma vez
-- Execute no SQL Editor do Supabase Dashboard

-- ============================================================================
-- PARTE 01: Estrutura BOM e Itens Industriais (migration 32)
-- ============================================================================

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

create index if not exists bom_itens_bom_id_idx on public.bom_itens (bom_id);
create index if not exists bom_itens_materia_prima_id_idx on public.bom_itens (materia_prima_id);
create index if not exists bom_itens_componente_produto_id_idx on public.bom_itens (componente_produto_id);

-- ============================================================================
-- PARTE 02: Ordens de Fabricação e Integração (migration 33)
-- ============================================================================

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

create unique index if not exists ordens_fabricacao_empresa_numero_idx
  on public.ordens_fabricacao (empresa_id, numero_of);
create index if not exists ordens_fabricacao_projeto_idx
  on public.ordens_fabricacao (projeto_id);
create index if not exists ordens_fabricacao_produto_idx
  on public.ordens_fabricacao (produto_id);
create index if not exists ordens_fabricacao_bom_idx
  on public.ordens_fabricacao (bom_id);

alter table public.projeto_itens
  add column if not exists bom_id uuid references public.boms(id);

alter table public.consumos_internos
  add column if not exists of_id uuid references public.ordens_fabricacao(id);

alter table public.estoque_movimentacoes
  add column if not exists of_id uuid references public.ordens_fabricacao(id);

alter table public.requisicoes_compra
  add column if not exists of_id uuid references public.ordens_fabricacao(id);

alter table public.planejamento_compra_origens
  add column if not exists of_id uuid references public.ordens_fabricacao(id);

alter table public.pedidos_compra
  add column if not exists of_id uuid references public.ordens_fabricacao(id);

alter table public.pedido_compra_itens
  add column if not exists of_id uuid references public.ordens_fabricacao(id);

create index if not exists consumos_internos_of_id_idx on public.consumos_internos (of_id);
create index if not exists estoque_movimentacoes_of_id_idx on public.estoque_movimentacoes (of_id);
create index if not exists requisicoes_compra_of_id_idx on public.requisicoes_compra (of_id);
create index if not exists pedidos_compra_of_id_idx on public.pedidos_compra (of_id);
create index if not exists projeto_itens_bom_idx on public.projeto_itens (bom_id);

create trigger set_ordens_fabricacao_updated_at
  before update on public.ordens_fabricacao
  for each row
  execute function public.set_updated_at();

alter table public.ordens_fabricacao enable row level security;

create policy ordens_fabricacao_select_tenant
  on public.ordens_fabricacao
  for select
  using (empresa_id = public.empresa_atual_id() and ativo = true and deleted_at is null);

create policy ordens_fabricacao_insert_tenant
  on public.ordens_fabricacao
  for insert
  with check (empresa_id = public.empresa_atual_id());

create policy ordens_fabricacao_update_tenant
  on public.ordens_fabricacao
  for update
  using (empresa_id = public.empresa_atual_id() and ativo = true and deleted_at is null)
  with check (empresa_id = public.empresa_atual_id());

create policy ordens_fabricacao_delete_blocked
  on public.ordens_fabricacao
  for delete
  using (false);

-- ============================================================================
-- PARTE 03: Numeração de OF e Views Operacionais (migration 34)
-- ============================================================================

create or replace function public.gerar_numero_entidade(p_entidade text)
returns text
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_config record;
  v_seq text;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  select * into v_config
    from public.numeracao_configuracoes
   where empresa_id = v_empresa_id
     and entidade = p_entidade
     and ativo = true
   limit 1;

  if not found then
    raise exception 'Configuracao de numeracao nao encontrada para entidade %', p_entidade;
  end if;

  update public.numeracao_configuracoes
     set sequencia_atual = sequencia_atual + 1, updated_at = now()
   where id = v_config.id
   returning sequencia_atual into v_config.sequencia_atual;

  v_seq := lpad(v_config.sequencia_atual::text, v_config.tamanho_sequencia, '0');
  return concat_ws('', coalesce(v_config.prefixo, ''), coalesce(v_config.ano, ''), v_seq);
end;
$$;

create or replace function public.set_ordem_fabricacao_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero_of is null or trim(new.numero_of) = '' then
    new.numero_of := public.gerar_numero_entidade('of');
  end if;
  return new;
end;
$$;

create trigger set_ordem_fabricacao_numero
  before insert on public.ordens_fabricacao
  for each row
  execute function public.set_ordem_fabricacao_numero();

create or replace view public.vw_demanda_bom_of as
select
  ofx.empresa_id, ofx.id as of_id, ofx.numero_of, ofx.projeto_id,
  ofx.projeto_item_id, ofx.produto_id, ip.pn as produto_pn,
  ip.descricao as produto_descricao, ofx.bom_id, b.versao as bom_versao,
  b.descricao as bom_descricao, bi.id as bom_item_id, bi.componente_tipo,
  bi.materia_prima_id, mp.codigo as materia_codigo,
  mp.descricao as materia_descricao, bi.componente_produto_id,
  cp.pn as componente_pn, cp.descricao as componente_descricao,
  bi.quantidade as bom_quantidade, ofx.quantidade_planejada,
  ofx.unidade as of_unidade, bi.unidade as componente_unidade,
  ofx.quantidade_planejada * bi.quantidade as quantidade_demanda,
  case when bi.componente_tipo = 'materia_prima' then 'materia_prima' else 'subconjunto' end as demanda_tipo
from public.ordens_fabricacao ofx
join public.boms b on b.id = ofx.bom_id
join public.bom_itens bi on bi.bom_id = b.id
left join public.materias_primas mp on mp.id = bi.materia_prima_id
left join public.itens_industriais cp on cp.id = bi.componente_produto_id
left join public.itens_industriais ip on ip.id = ofx.produto_id
where ofx.ativo = true and b.ativo = true and bi.ativo = true;

create or replace view public.vw_demanda_estoque as
select
  d.*, es.saldo_disponivel, es.saldo_reservado, es.saldo_livre,
  greatest(d.quantidade_demanda - coalesce(es.saldo_livre, 0), 0) as quantidade_falta,
  case when coalesce(es.saldo_livre, 0) >= d.quantidade_demanda then false else true end as falta_estoque
from public.vw_demanda_bom_of d
left join public.estoque_saldos es
  on es.empresa_id = d.empresa_id
 and es.materia_prima_id = d.materia_prima_id
 and es.local_estoque = 'principal';

create or replace view public.vw_demanda_consumo_compra as
select
  e.*,
  coalesce(ci.total_consumido, 0) as total_consumo_interno,
  coalesce(rc.total_requisicao, 0) as total_requisicao_compra,
  greatest(e.quantidade_falta - coalesce(ci.total_consumido, 0), 0) as quantidade_para_compra_externa,
  case when greatest(e.quantidade_falta - coalesce(ci.total_consumido, 0), 0) > 0 then true else false end as precisa_compra_externa
from public.vw_demanda_estoque e
left join (
  select of_id, materia_prima_id, sum(quantidade) as total_consumido
  from public.consumos_internos where ativo = true group by of_id, materia_prima_id
) ci on ci.of_id = e.of_id and ci.materia_prima_id = e.materia_prima_id
left join (
  select rc.of_id, rci.materia_prima_id, sum(rci.quantidade_necessaria) as total_requisicao
  from public.requisicoes_compra rc
  join public.requisicao_compra_itens rci on rci.requisicao_compra_id = rc.id
  where rc.ativo = true and rci.ativo = true
  group by rc.of_id, rci.materia_prima_id
) rc on rc.of_id = e.of_id and rc.materia_prima_id = e.materia_prima_id;

-- ============================================================================
-- PARTE 04: Funções de Operação de OF e Views Detalhadas (migration 35)
-- ============================================================================

create or replace view public.vw_of_consumo_detalhado as
select
  ofx.empresa_id, ofx.id as of_id, ofx.numero_of, ofx.projeto_id,
  ofx.produto_id, ip.pn as produto_pn, ip.descricao as produto_descricao,
  ofx.bom_id, b.versao as bom_versao, bi.id as bom_item_id,
  bi.componente_tipo, bi.materia_prima_id, mp.codigo as materia_codigo,
  mp.descricao as materia_descricao, bi.componente_produto_id,
  cp.pn as componente_pn, cp.descricao as componente_descricao,
  bi.quantidade as bom_quantidade, bi.unidade as bom_unidade,
  ofx.quantidade_planejada, ofx.unidade as of_unidade,
  ofx.quantidade_planejada * bi.quantidade as quantidade_demanda,
  coalesce(es.saldo_livre, 0) as estoque_saldo_livre,
  coalesce(ci.quantidade_consumo_interno, 0) as quantidade_consumo_interno,
  coalesce(rc.quantidade_compra_externa, 0) as quantidade_compra_externa,
  greatest(ofx.quantidade_planejada * bi.quantidade - coalesce(es.saldo_livre, 0), 0) as quantidade_falta_estoque,
  greatest(greatest(ofx.quantidade_planejada * bi.quantidade - coalesce(es.saldo_livre, 0), 0) - coalesce(ci.quantidade_consumo_interno, 0), 0) as quantidade_para_compra_externa,
  case
    when coalesce(ci.quantidade_consumo_interno, 0) > 0 and coalesce(rc.quantidade_compra_externa, 0) > 0 then 'ci_parcial_compra_parcial'
    when coalesce(ci.quantidade_consumo_interno, 0) > 0 then 'ci_total'
    else 'compra_total'
  end as status_fluxo
from public.ordens_fabricacao ofx
join public.boms b on b.id = ofx.bom_id
join public.bom_itens bi on bi.bom_id = b.id
left join public.itens_industriais ip on ip.id = ofx.produto_id
left join public.materias_primas mp on mp.id = bi.materia_prima_id
left join public.itens_industriais cp on cp.id = bi.componente_produto_id
left join public.estoque_saldos es
  on es.empresa_id = ofx.empresa_id and es.materia_prima_id = bi.materia_prima_id and es.local_estoque = 'principal'
left join (
  select of_id, materia_prima_id, sum(quantidade) as quantidade_consumo_interno
  from public.consumos_internos where ativo = true and deleted_at is null
  group by of_id, materia_prima_id
) ci on ci.of_id = ofx.id and ci.materia_prima_id = bi.materia_prima_id
left join (
  select rc.of_id, rci.materia_prima_id, sum(rci.quantidade_necessaria) as quantidade_compra_externa
  from public.requisicoes_compra rc
  join public.requisicao_compra_itens rci on rci.requisicao_compra_id = rc.id
  where rc.ativo = true and rc.deleted_at is null and rci.ativo = true and rci.deleted_at is null
  group by rc.of_id, rci.materia_prima_id
) rc on rc.of_id = ofx.id and rc.materia_prima_id = bi.materia_prima_id
where ofx.ativo = true and b.ativo = true and bi.ativo = true;

create or replace view public.vw_of_fluxo_operacional as
select
  ofx.id as of_id, ofx.numero_of, ofx.projeto_id, ofx.produto_id,
  ip.pn as produto_pn, ofx.bom_id, b.versao as bom_versao,
  sum(d.quantidade_demanda) as total_demanda_bom,
  sum(d.estoque_saldo_livre) as total_estoque_livre,
  sum(d.quantidade_consumo_interno) as total_consumo_interno,
  sum(d.quantidade_para_compra_externa) as total_compra_externa,
  max(d.status_fluxo) as status_fluxo
from public.vw_of_consumo_detalhado d
join public.ordens_fabricacao ofx on ofx.id = d.of_id
left join public.itens_industriais ip on ip.id = ofx.produto_id
left join public.boms b on b.id = ofx.bom_id
where ofx.ativo = true
group by ofx.id, ofx.numero_of, ofx.projeto_id, ofx.produto_id, ip.pn, ofx.bom_id, b.versao;

-- Fim das migrations consolidadas
