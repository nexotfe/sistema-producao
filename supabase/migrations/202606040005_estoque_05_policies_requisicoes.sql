-- NEXOTFE - Estoque - Parte 05
-- Politicas de movimentacoes e requisicoes de compra.
-- Requer a funcao public.empresa_atual_id().

create policy estoque_movimentacoes_select_tenant
  on public.estoque_movimentacoes
  for select
  using (empresa_id = public.empresa_atual_id());

create policy estoque_movimentacoes_insert_tenant
  on public.estoque_movimentacoes
  for insert
  with check (empresa_id = public.empresa_atual_id());

create policy estoque_movimentacoes_update_blocked
  on public.estoque_movimentacoes
  for update
  using (false);

create policy estoque_movimentacoes_delete_blocked
  on public.estoque_movimentacoes
  for delete
  using (false);

create policy requisicoes_compra_select_tenant
  on public.requisicoes_compra
  for select
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  );

create policy requisicoes_compra_insert_tenant
  on public.requisicoes_compra
  for insert
  with check (empresa_id = public.empresa_atual_id());

create policy requisicoes_compra_update_tenant
  on public.requisicoes_compra
  for update
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  )
  with check (empresa_id = public.empresa_atual_id());

create policy requisicoes_compra_delete_blocked
  on public.requisicoes_compra
  for delete
  using (false);

create policy requisicao_compra_itens_select_tenant
  on public.requisicao_compra_itens
  for select
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  );

create policy requisicao_compra_itens_insert_tenant
  on public.requisicao_compra_itens
  for insert
  with check (empresa_id = public.empresa_atual_id());

create policy requisicao_compra_itens_update_tenant
  on public.requisicao_compra_itens
  for update
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and deleted_at is null
  )
  with check (empresa_id = public.empresa_atual_id());

create policy requisicao_compra_itens_delete_blocked
  on public.requisicao_compra_itens
  for delete
  using (false);
