-- Calendario de Eventos da Empresa - excecoes pontuais que sobrescrevem
-- o Calendario Operacional da Empresa e o Calendario Oficial. Ver
-- ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secao 7.3.
create table public.calendario_empresa_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  data date not null,
  tipo text not null check (tipo in (
    'recesso_coletivo','inventario','paralisacao',
    'dia_trabalhado_excepcional','feriado_local_temporario'
  )),
  descricao text,
  ativo boolean not null default true,
  reconciliado_em timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint calendario_empresa_eventos_empresa_data_tipo_uniq unique (empresa_id, data, tipo)
);

comment on table public.calendario_empresa_eventos is
  'Calendario de Eventos da Empresa - excecoes pontuais. Campo produtivo e derivado do tipo (dia_trabalhado_excepcional = produtivo; demais tipos = nao produtivo), nao armazenado. Ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secao 7.3.';

create trigger calendario_empresa_eventos_set_empresa_id
  before insert on public.calendario_empresa_eventos
  for each row execute function public.set_empresa_id_from_usuario();

create index calendario_empresa_eventos_empresa_data_idx
  on public.calendario_empresa_eventos (empresa_id, data);

alter table public.calendario_empresa_eventos enable row level security;

-- RLS cuida so do isolamento por empresa - filtrar deleted_at aqui
-- tambem quebraria o soft delete (UPDATE ... SET deleted_at = ...):
-- o Postgres exige que a linha, depois do UPDATE, ainda satisfaca a
-- policy de SELECT, entao "deleted_at is null" no SELECT rejeitaria a
-- propria escrita que marca a linha como excluida. O filtro de
-- deleted_at fica por conta da query da aplicacao.
create policy calendario_empresa_eventos_select_tenant
  on public.calendario_empresa_eventos
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

create policy calendario_empresa_eventos_insert_tenant
  on public.calendario_empresa_eventos
  for insert to authenticated
  with check (empresa_id = public.empresa_atual_id());

create policy calendario_empresa_eventos_update_tenant
  on public.calendario_empresa_eventos
  for update to authenticated
  using (empresa_id = public.empresa_atual_id())
  with check (empresa_id = public.empresa_atual_id());

create policy calendario_empresa_eventos_delete_blocked
  on public.calendario_empresa_eventos
  for delete to authenticated
  using (false);
