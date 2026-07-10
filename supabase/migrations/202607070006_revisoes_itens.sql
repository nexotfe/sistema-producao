-- Cria revisoes_itens no remoto real. Nunca existiu (confirmado em
-- levantamento anterior: so estava documentada em
-- supabase/baseline/005_engenharia.sql, que o proprio README do baseline
-- marca como validado so em Postgres local descartavel).
--
-- Estrutura adaptada do baseline para bater com o padrao real ja
-- confirmado nesta sessao (identico ao usado em bom_operacoes/
-- tecnologias_aplicadas): empresa_id, created_at/updated_at, created_by/
-- deleted_by referenciando auth.users(id) diretamente, RLS com 4 policies
-- "mesma empresa", triggers set_empresa_id_from_usuario + set_updated_at,
-- GRANT explicito (policy sozinha nao basta - ja aprendemos essa licao).
--
-- Desvio do baseline: o baseline referencia itens_industriais via FK
-- composta (empresa_id, item_industrial_id) -> itens_industriais(empresa_id,
-- id), o que exige um UNIQUE(empresa_id, id) em itens_industriais. O
-- itens_industriais real so tem PRIMARY KEY(id) (confirmado via
-- pg_constraint) - sem esse unique composto, a FK do baseline nao seria
-- aceita pelo Postgres. Uso FK simples em item_industrial_id ->
-- itens_industriais(id), mesmo padrao ja usado em recursos_produtivos.grupo_id
-- e bom_operacoes.tecnologia_aplicada_id.
--
-- Sem coluna "situacao": vigencia e calculada na query (vigente =
-- aprovada_em is not null and vigente_ate is null; dentro do intervalo
-- vigente_desde/vigente_ate caso contrario = anterior), nao gravada.
-- Anexo de desenho fica em itens_industriais.pdf_tecnico_path/pdf_tecnico_nome
-- (por Produto, nao por revisao - decisao ja tomada).

create table public.revisoes_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  item_industrial_id uuid not null references public.itens_industriais(id) on delete restrict,
  codigo_revisao text not null,
  descricao text,
  vigente_desde date,
  vigente_ate date,
  aprovada_em timestamptz,
  aprovada_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint revisoes_itens_codigo_uniq unique (empresa_id, item_industrial_id, codigo_revisao),
  constraint revisoes_itens_codigo_chk check (btrim(codigo_revisao) <> ''),
  constraint revisoes_itens_vigencia_chk check (
    vigente_ate is null or vigente_desde is null or vigente_ate >= vigente_desde
  ),
  constraint revisoes_itens_aprovacao_chk check ((aprovada_em is null) = (aprovada_por is null)),
  constraint revisoes_itens_delete_chk check ((deleted_at is null) = (deleted_by is null))
);

-- So 1 revisao vigente (aprovada e sem data de fim) por item, por empresa.
create unique index revisoes_itens_vigente_uniq
  on public.revisoes_itens (empresa_id, item_industrial_id)
  where aprovada_em is not null and vigente_ate is null and deleted_at is null;

create index revisoes_itens_empresa_id_idx on public.revisoes_itens (empresa_id);
create index revisoes_itens_item_industrial_id_idx on public.revisoes_itens (item_industrial_id);
create index revisoes_itens_deleted_at_idx on public.revisoes_itens (deleted_at);

alter table public.revisoes_itens enable row level security;

grant select, insert, update, delete on table public.revisoes_itens
  to anon, authenticated;

create trigger revisoes_itens_set_empresa_id
  before insert on public.revisoes_itens
  for each row execute function public.set_empresa_id_from_usuario();
create trigger revisoes_itens_set_updated_at
  before update on public.revisoes_itens
  for each row execute function public.set_updated_at();

create policy "nexotfe revisoes itens select mesma empresa"
  on public.revisoes_itens for select
  to authenticated
  using (empresa_id = public.empresa_atual_id());
create policy "nexotfe revisoes itens insert mesma empresa"
  on public.revisoes_itens for insert
  to authenticated
  with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid());
create policy "nexotfe revisoes itens update mesma empresa"
  on public.revisoes_itens for update
  to authenticated
  using (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()))
  with check (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()));
create policy "nexotfe revisoes itens delete admin mesma empresa"
  on public.revisoes_itens for delete
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

comment on table public.revisoes_itens is
  'Historico de revisoes tecnicas de itens_industriais (vigencia e aprovacao). Situacao vigente/anterior e calculada na query, nao armazenada.';
