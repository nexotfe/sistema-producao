-- Modulo de estoque proprio para Produto (itens_industriais), independente
-- de Materia-Prima, mais remocao do schema morto confirmado em auditoria.
--
-- PASSO 1 - Remove movimentacoes_estoque (por item_id -> itens_industriais).
-- Reconfirmado antes do DROP: 0 functions no schema public referenciam essa
-- tabela; 0 ocorrencias em src/ (frontend). Achado NOVO nesta verificacao
-- (a checagem anterior nao tinha olhado pg_views): 2 views dependem dela -
-- movimentacoes_estoque_ativas (wrapper "so ativos", igual ao padrao
-- funcionarios_ativos/recursos_produtivos_ativos/grupos_recursos_ativos) e
-- saldo_estoque_atual (view que calcula saldo agregando SUM(quantidade) por
-- item - um proto-rascunho exatamente do que produto_saldos resolve agora,
-- so que como view computada em vez de tabela mantida). Nenhuma das duas
-- views e referenciada por outra view, function ou pelo frontend (0
-- ocorrencias em src/) - seguro remover as duas antes da tabela.
drop view public.movimentacoes_estoque_ativas;
drop view public.saldo_estoque_atual;
drop table public.movimentacoes_estoque;

-- PASSO 2 - produto_movimentacoes, espelhando estoque_movimentacoes
-- (mesmas FKs sem "on delete" explicito = NO ACTION, mesma ausencia de
-- triggers, mesmas policies insert/select liberadas e update/delete
-- bloqueadas - e um log imutavel por design).
--
-- Desvio deliberado da lista literal do pedido: adicionei local_estoque
-- (default 'principal'), presente em estoque_movimentacoes mas omitido na
-- enumeracao de produto_movimentacoes. Sem essa coluna seria impossivel
-- amarrar uma movimentacao ao local correto de produto_saldos (que tem
-- local_estoque explicitamente pedido) - mesma chave usada hoje entre
-- estoque_movimentacoes e estoque_saldos. Ver relatorio para detalhe.
--
-- tipo_movimento: mantive entrada/saida/reserva/liberacao_reserva/ajuste
-- identicos a estoque_movimentacoes (mesmo vocabulario nas duas tabelas de
-- movimentacao facilita relatorio cruzado depois) e adicionei 'producao',
-- porque produto acabado/semiacabado entra em estoque tipicamente via
-- apontamento de producao (saida de uma OF), nao via compra externa - essa
-- e a principal diferenca de ciclo de vida frente a materia-prima. Nao
-- adicionei 'venda'/'expedicao' agora; 'saida' cobre consumo (como
-- componente de subconjunto) e expedicao por ora - e so um CHECK
-- constraint, extensivel sem quebrar nada quando Expedicao for implementado.
create table public.produto_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  item_id uuid not null references public.itens_industriais(id),
  local_estoque text not null default 'principal',
  tipo_movimento text not null,
  quantidade numeric not null,
  projeto_id uuid references public.projetos(id),
  of_numero text,
  of_id uuid references public.ordens_fabricacao(id),
  observacoes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  constraint produto_movimentacoes_quantidade_chk check (quantidade > 0),
  constraint produto_movimentacoes_tipo_chk check (
    tipo_movimento = any (array[
      'entrada', 'saida', 'reserva', 'liberacao_reserva', 'ajuste', 'producao'
    ])
  )
);

create index produto_movimentacoes_empresa_item_idx
  on public.produto_movimentacoes (empresa_id, item_id);
create index produto_movimentacoes_of_id_idx
  on public.produto_movimentacoes (of_id);
create index produto_movimentacoes_of_numero_idx
  on public.produto_movimentacoes (of_numero);
create index produto_movimentacoes_projeto_idx
  on public.produto_movimentacoes (projeto_id);

alter table public.produto_movimentacoes enable row level security;

grant select, insert, update, delete on table public.produto_movimentacoes
  to anon, authenticated;

create policy "produto_movimentacoes_select_tenant"
  on public.produto_movimentacoes for select
  to authenticated
  using (empresa_id = public.empresa_atual_id());
create policy "produto_movimentacoes_insert_tenant"
  on public.produto_movimentacoes for insert
  to authenticated
  with check (empresa_id = public.empresa_atual_id());
create policy "produto_movimentacoes_update_blocked"
  on public.produto_movimentacoes for update
  to authenticated
  using (false);
create policy "produto_movimentacoes_delete_blocked"
  on public.produto_movimentacoes for delete
  to authenticated
  using (false);

-- PASSO 3 - produto_saldos, espelhando estoque_saldos.
create table public.produto_saldos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  item_id uuid not null references public.itens_industriais(id),
  local_estoque text not null default 'principal',
  saldo_disponivel numeric not null default 0,
  saldo_reservado numeric not null default 0,
  saldo_livre numeric generated always as (saldo_disponivel - saldo_reservado) stored,
  updated_at timestamptz not null default now(),
  constraint produto_saldos_item_local_uniq unique (empresa_id, item_id, local_estoque),
  constraint produto_saldos_quantidades_chk check (
    saldo_disponivel >= 0 and saldo_reservado >= 0
    and saldo_reservado <= saldo_disponivel
  )
);

create index produto_saldos_empresa_item_idx
  on public.produto_saldos (empresa_id, item_id);

alter table public.produto_saldos enable row level security;

grant select, insert, update, delete on table public.produto_saldos
  to anon, authenticated;

create policy "produto_saldos_select_tenant"
  on public.produto_saldos for select
  to authenticated
  using (empresa_id = public.empresa_atual_id());
create policy "produto_saldos_insert_tenant"
  on public.produto_saldos for insert
  to authenticated
  with check (empresa_id = public.empresa_atual_id());
create policy "produto_saldos_update_tenant"
  on public.produto_saldos for update
  to authenticated
  using (empresa_id = public.empresa_atual_id())
  with check (empresa_id = public.empresa_atual_id());
create policy "produto_saldos_delete_blocked"
  on public.produto_saldos for delete
  to authenticated
  using (false);
