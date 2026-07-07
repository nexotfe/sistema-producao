-- NEXOTFE - Corrige lacuna de seguranca: boms e bom_itens sem RLS
--
-- Achado: public.boms e public.bom_itens estavam em producao sem RLS
-- habilitado, sem policies e sem triggers de auditoria, com o role anon
-- tendo grant total de select/insert/update/delete. Ambas as tabelas
-- estavam com 0 linhas reais no momento da correcao (sem risco de dado a
-- proteger).
--
-- Esta migration replica exatamente o padrao ja usado em itens_industriais
-- e nas tabelas bom_operacoes/bom_servicos_terceiros/bom_transportes
-- (202607060001): RLS habilitado, 4 policies "mesma empresa" e triggers
-- set_empresa_id_from_usuario + set_updated_at.

alter table public.boms enable row level security;
alter table public.bom_itens enable row level security;

create trigger boms_set_empresa_id
  before insert on public.boms
  for each row execute function public.set_empresa_id_from_usuario();
create trigger boms_set_updated_at
  before update on public.boms
  for each row execute function public.set_updated_at();

create trigger bom_itens_set_empresa_id
  before insert on public.bom_itens
  for each row execute function public.set_empresa_id_from_usuario();
create trigger bom_itens_set_updated_at
  before update on public.bom_itens
  for each row execute function public.set_updated_at();

create policy "nexotfe boms select mesma empresa"
  on public.boms for select
  to authenticated
  using (empresa_id = public.empresa_atual_id());
create policy "nexotfe boms insert mesma empresa"
  on public.boms for insert
  to authenticated
  with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid());
create policy "nexotfe boms update mesma empresa"
  on public.boms for update
  to authenticated
  using (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()))
  with check (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()));
create policy "nexotfe boms delete admin mesma empresa"
  on public.boms for delete
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

create policy "nexotfe bom itens select mesma empresa"
  on public.bom_itens for select
  to authenticated
  using (empresa_id = public.empresa_atual_id());
create policy "nexotfe bom itens insert mesma empresa"
  on public.bom_itens for insert
  to authenticated
  with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid());
create policy "nexotfe bom itens update mesma empresa"
  on public.bom_itens for update
  to authenticated
  using (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()))
  with check (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()));
create policy "nexotfe bom itens delete admin mesma empresa"
  on public.bom_itens for delete
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());
