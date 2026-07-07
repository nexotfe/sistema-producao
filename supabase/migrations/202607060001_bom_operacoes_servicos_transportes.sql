-- NEXOTFE - BOM: operacoes, servicos de terceiros e transportes
-- Estende a estrutura de BOM (boms/bom_itens) com os componentes de custo
-- industrial que faltavam: mao de obra/tecnologia (bom_operacoes), servicos
-- de terceiros (bom_servicos_terceiros) e logistica (bom_transportes).
--
-- Padrao replicado de public.itens_industriais (RLS habilitado, 4 policies
-- "mesma empresa", triggers set_empresa_id_from_usuario + set_updated_at).
-- NAO replica o padrao de public.boms, que hoje esta sem RLS, sem policies
-- e sem triggers em producao (ver observacao ao final deste arquivo).

create table public.bom_operacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  bom_id uuid not null,
  ordem smallint not null,
  descricao text not null,
  tecnologia_aplicada_id uuid,
  tempo_estimado_minutos numeric not null,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint bom_operacoes_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint bom_operacoes_bom_id_fkey foreign key (bom_id)
    references public.boms(id) on delete cascade,
  constraint bom_operacoes_tecnologia_fkey foreign key (tecnologia_aplicada_id)
    references public.tecnologias_aplicadas(id) on delete set null,
  constraint bom_operacoes_empresa_bom_ordem_uniq unique (empresa_id, bom_id, ordem),
  constraint bom_operacoes_descricao_chk check (btrim(descricao) <> ''),
  constraint bom_operacoes_tempo_chk check (tempo_estimado_minutos > 0)
);

create index bom_operacoes_empresa_id_idx on public.bom_operacoes (empresa_id);
create index bom_operacoes_bom_id_idx on public.bom_operacoes (bom_id);
create index bom_operacoes_ativo_idx on public.bom_operacoes (ativo);

create table public.bom_servicos_terceiros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  bom_id uuid not null,
  ordem smallint not null,
  descricao text not null,
  fornecedor_id uuid,
  custo_estimado numeric,
  prazo_estimado_dias integer,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint bom_servicos_terceiros_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint bom_servicos_terceiros_bom_id_fkey foreign key (bom_id)
    references public.boms(id) on delete cascade,
  constraint bom_servicos_terceiros_fornecedor_fkey foreign key (fornecedor_id)
    references public.fornecedores(id) on delete set null,
  constraint bom_servicos_terceiros_empresa_bom_ordem_uniq unique (empresa_id, bom_id, ordem),
  constraint bom_servicos_terceiros_descricao_chk check (btrim(descricao) <> ''),
  constraint bom_servicos_terceiros_custo_chk check (custo_estimado is null or custo_estimado >= 0)
);

create index bom_servicos_terceiros_empresa_id_idx on public.bom_servicos_terceiros (empresa_id);
create index bom_servicos_terceiros_bom_id_idx on public.bom_servicos_terceiros (bom_id);
create index bom_servicos_terceiros_ativo_idx on public.bom_servicos_terceiros (ativo);

create table public.bom_transportes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  bom_id uuid not null,
  ordem smallint not null,
  descricao text not null,
  fornecedor_id uuid,
  custo_estimado numeric,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint bom_transportes_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint bom_transportes_bom_id_fkey foreign key (bom_id)
    references public.boms(id) on delete cascade,
  constraint bom_transportes_fornecedor_fkey foreign key (fornecedor_id)
    references public.fornecedores(id) on delete set null,
  constraint bom_transportes_empresa_bom_ordem_uniq unique (empresa_id, bom_id, ordem),
  constraint bom_transportes_descricao_chk check (btrim(descricao) <> ''),
  constraint bom_transportes_custo_chk check (custo_estimado is null or custo_estimado >= 0)
);

create index bom_transportes_empresa_id_idx on public.bom_transportes (empresa_id);
create index bom_transportes_bom_id_idx on public.bom_transportes (bom_id);
create index bom_transportes_ativo_idx on public.bom_transportes (ativo);

-- Triggers (identicos aos de itens_industriais)

create trigger bom_operacoes_set_empresa_id
  before insert on public.bom_operacoes
  for each row execute function public.set_empresa_id_from_usuario();
create trigger bom_operacoes_set_updated_at
  before update on public.bom_operacoes
  for each row execute function public.set_updated_at();

create trigger bom_servicos_terceiros_set_empresa_id
  before insert on public.bom_servicos_terceiros
  for each row execute function public.set_empresa_id_from_usuario();
create trigger bom_servicos_terceiros_set_updated_at
  before update on public.bom_servicos_terceiros
  for each row execute function public.set_updated_at();

create trigger bom_transportes_set_empresa_id
  before insert on public.bom_transportes
  for each row execute function public.set_empresa_id_from_usuario();
create trigger bom_transportes_set_updated_at
  before update on public.bom_transportes
  for each row execute function public.set_updated_at();

-- RLS + policies (identicas ao padrao "mesma empresa" de itens_industriais)

alter table public.bom_operacoes enable row level security;
alter table public.bom_servicos_terceiros enable row level security;
alter table public.bom_transportes enable row level security;

create policy "nexotfe bom operacoes select mesma empresa"
  on public.bom_operacoes for select
  to authenticated
  using (empresa_id = public.empresa_atual_id());
create policy "nexotfe bom operacoes insert mesma empresa"
  on public.bom_operacoes for insert
  to authenticated
  with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid());
create policy "nexotfe bom operacoes update mesma empresa"
  on public.bom_operacoes for update
  to authenticated
  using (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()))
  with check (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()));
create policy "nexotfe bom operacoes delete admin mesma empresa"
  on public.bom_operacoes for delete
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

create policy "nexotfe bom servicos terceiros select mesma empresa"
  on public.bom_servicos_terceiros for select
  to authenticated
  using (empresa_id = public.empresa_atual_id());
create policy "nexotfe bom servicos terceiros insert mesma empresa"
  on public.bom_servicos_terceiros for insert
  to authenticated
  with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid());
create policy "nexotfe bom servicos terceiros update mesma empresa"
  on public.bom_servicos_terceiros for update
  to authenticated
  using (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()))
  with check (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()));
create policy "nexotfe bom servicos terceiros delete admin mesma empresa"
  on public.bom_servicos_terceiros for delete
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

create policy "nexotfe bom transportes select mesma empresa"
  on public.bom_transportes for select
  to authenticated
  using (empresa_id = public.empresa_atual_id());
create policy "nexotfe bom transportes insert mesma empresa"
  on public.bom_transportes for insert
  to authenticated
  with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid());
create policy "nexotfe bom transportes update mesma empresa"
  on public.bom_transportes for update
  to authenticated
  using (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()))
  with check (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()));
create policy "nexotfe bom transportes delete admin mesma empresa"
  on public.bom_transportes for delete
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

comment on table public.bom_operacoes is
  'Operacoes de fabricacao/mao de obra da BOM: sequencia, tecnologia aplicada e tempo estimado.';
comment on table public.bom_servicos_terceiros is
  'Servicos de terceiros vinculados a BOM (ex: tratamento termico), com fornecedor, custo e prazo estimados.';
comment on table public.bom_transportes is
  'Transportes/logistica vinculados a BOM, com transportadora (fornecedor) e custo estimado.';

-- OBSERVACAO (nao corrigido nesta migration): public.boms esta em producao
-- hoje SEM RLS habilitado, SEM policies e SEM triggers de auditoria, com
-- grant total (select/insert/update/delete) para o role anon. Isso diverge
-- do padrao usado em itens_industriais e replicado aqui. Requer decisao e
-- migration propria antes de corrigir.
