-- NEXOTFE - Estoque - Parte 04
-- Ativa updated_at, RLS e politicas iniciais.
-- Requer as funcoes public.empresa_atual_id() e public.set_updated_at().

create trigger set_materias_primas_updated_at
  before update on public.materias_primas
  for each row
  execute function public.set_updated_at();

create trigger set_estoque_saldos_updated_at
  before update on public.estoque_saldos
  for each row
  execute function public.set_updated_at();

create trigger set_requisicoes_compra_updated_at
  before update on public.requisicoes_compra
  for each row
  execute function public.set_updated_at();

create trigger set_requisicao_compra_itens_updated_at
  before update on public.requisicao_compra_itens
  for each row
  execute function public.set_updated_at();

alter table public.materias_primas enable row level security;
alter table public.estoque_saldos enable row level security;
alter table public.estoque_movimentacoes enable row level security;
alter table public.requisicoes_compra enable row level security;
alter table public.requisicao_compra_itens enable row level security;

create policy materias_primas_select_tenant
  on public.materias_primas
  for select
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  );

create policy materias_primas_insert_tenant
  on public.materias_primas
  for insert
  with check (empresa_id = public.empresa_atual_id());

create policy materias_primas_update_tenant
  on public.materias_primas
  for update
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  )
  with check (empresa_id = public.empresa_atual_id());

create policy materias_primas_delete_blocked
  on public.materias_primas
  for delete
  using (false);

create policy estoque_saldos_select_tenant
  on public.estoque_saldos
  for select
  using (empresa_id = public.empresa_atual_id());

create policy estoque_saldos_insert_tenant
  on public.estoque_saldos
  for insert
  with check (empresa_id = public.empresa_atual_id());

create policy estoque_saldos_update_tenant
  on public.estoque_saldos
  for update
  using (empresa_id = public.empresa_atual_id())
  with check (empresa_id = public.empresa_atual_id());

create policy estoque_saldos_delete_blocked
  on public.estoque_saldos
  for delete
  using (false);
