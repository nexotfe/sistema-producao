begin;

alter table public.estoque_movimentacoes
  add constraint estoque_movimentacoes_id_empresa_uniq unique (id, empresa_id);

alter table public.estoque_movimentacoes
  drop constraint estoque_movimentacoes_of_id_fkey;
alter table public.estoque_movimentacoes
  add constraint estoque_movimentacoes_of_id_fkey
    foreign key (of_id, empresa_id) references public.ordens_fabricacao (id, empresa_id);

alter table public.estoque_movimentacoes
  add column of_filha_id uuid,
  add column reserva_origem_id uuid,
  add column movimentacao_origem_id uuid,
  add column funcionario_id uuid,
  add column chave_idempotencia text;

alter table public.estoque_movimentacoes
  add constraint estoque_movimentacoes_of_filha_id_fkey
    foreign key (of_filha_id, empresa_id) references public.ordens_fabricacao (id, empresa_id),
  add constraint estoque_movimentacoes_reserva_origem_id_fkey
    foreign key (reserva_origem_id, empresa_id) references public.estoque_movimentacoes (id, empresa_id),
  add constraint estoque_movimentacoes_movimentacao_origem_id_fkey
    foreign key (movimentacao_origem_id, empresa_id) references public.estoque_movimentacoes (id, empresa_id),
  add constraint estoque_movimentacoes_funcionario_id_fkey
    foreign key (funcionario_id, empresa_id) references public.funcionarios (id, empresa_id);

alter table public.estoque_movimentacoes
  add constraint estoque_movimentacoes_reserva_origem_nao_propria_chk
    check (reserva_origem_id is distinct from id),
  add constraint estoque_movimentacoes_movimentacao_origem_nao_propria_chk
    check (movimentacao_origem_id is distinct from id),
  add constraint estoque_movimentacoes_reserva_origem_tipo_chk
    check (reserva_origem_id is null or tipo_movimento in ('saida', 'liberacao_reserva')),
  add constraint estoque_movimentacoes_movimentacao_origem_tipo_chk
    check (movimentacao_origem_id is null or tipo_movimento = 'entrada');

create unique index estoque_movimentacoes_chave_idempotencia_uniq
  on public.estoque_movimentacoes (empresa_id, chave_idempotencia)
  where chave_idempotencia is not null;

create index estoque_movimentacoes_reserva_origem_idx on public.estoque_movimentacoes (reserva_origem_id) where reserva_origem_id is not null;

alter table public.consumos_internos
  drop constraint consumos_internos_of_id_fkey;
alter table public.consumos_internos
  add constraint consumos_internos_of_id_fkey
    foreign key (of_id, empresa_id) references public.ordens_fabricacao (id, empresa_id);

alter table public.consumos_internos
  add constraint consumos_internos_id_empresa_uniq unique (id, empresa_id);

create table public.consumos_internos_ajustes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  consumo_interno_id uuid not null,
  tipo_ajuste text not null,
  quantidade_ajustada numeric not null,
  of_destino_id uuid,
  responsavel_custo text,
  movimentacao_entrada_id uuid,
  motivo text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  constraint consumos_internos_ajustes_consumo_fkey
    foreign key (consumo_interno_id, empresa_id) references public.consumos_internos (id, empresa_id),
  constraint consumos_internos_ajustes_of_destino_fkey
    foreign key (of_destino_id, empresa_id) references public.ordens_fabricacao (id, empresa_id),
  constraint consumos_internos_ajustes_movimentacao_entrada_fkey
    foreign key (movimentacao_entrada_id, empresa_id) references public.estoque_movimentacoes (id, empresa_id),
  constraint consumos_internos_ajustes_tipo_chk
    check (tipo_ajuste in ('retorno', 'transferencia', 'perda_reconhecida')),
  constraint consumos_internos_ajustes_quantidade_chk check (quantidade_ajustada > 0),
  constraint consumos_internos_ajustes_motivo_chk check (btrim(motivo) <> ''),
  constraint consumos_internos_ajustes_of_destino_requerido_chk
    check ((tipo_ajuste = 'transferencia') = (of_destino_id is not null)),
  constraint consumos_internos_ajustes_movimentacao_entrada_requerida_chk
    check ((tipo_ajuste = 'retorno') = (movimentacao_entrada_id is not null))
);

create index consumos_internos_ajustes_consumo_idx on public.consumos_internos_ajustes (consumo_interno_id);

alter table public.consumos_internos_ajustes enable row level security;

create policy consumos_internos_ajustes_select_tenant
  on public.consumos_internos_ajustes for select to authenticated
  using (empresa_id = public.empresa_atual_id());

revoke all on table public.consumos_internos_ajustes from public, anon, authenticated, service_role;
grant select on table public.consumos_internos_ajustes to authenticated;

insert into public.permissoes (chave, recurso, acao, categoria, nome, descricao) values
  ('estoque.movimentar', 'estoque', 'movimentar', 'comum',
   'Movimentar estoque de matéria-prima',
   'Permite registrar reservas, retiradas, entradas e ajustes de matéria-prima vinculados a uma Ordem de Fabricação.')
on conflict (chave) do nothing;

commit;
