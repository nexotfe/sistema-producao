-- Alinhamento FOUNDATION do módulo Grupos de Recursos.
-- Preserva dados existentes, aplica código único por empresa ativa e bloqueia exclusão física.

drop index if exists public.grupos_recursos_codigo_key;
drop index if exists public.grupos_recursos_empresa_codigo_unique_idx;

create unique index grupos_recursos_empresa_codigo_unique_idx
  on public.grupos_recursos (empresa_id, codigo)
  where deleted_at is null;

drop policy if exists "Authenticated users can view grupos" on public.grupos_recursos;
drop policy if exists "admins excluem grupos recursos" on public.grupos_recursos;
drop policy if exists "nexotfe grupos recursos select autenticado" on public.grupos_recursos;
drop policy if exists "nexotfe grupos recursos update criador ou admin" on public.grupos_recursos;
drop policy if exists "usuarios autenticados criam grupos recursos" on public.grupos_recursos;
drop policy if exists "usuarios autenticados visualizam grupos recursos" on public.grupos_recursos;
drop policy if exists grupos_recursos_delete_blocked on public.grupos_recursos;
drop policy if exists grupos_recursos_insert_tenant on public.grupos_recursos;
drop policy if exists grupos_recursos_select_tenant on public.grupos_recursos;
drop policy if exists grupos_recursos_update_tenant on public.grupos_recursos;

create policy grupos_recursos_select_tenant on public.grupos_recursos
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and deleted_at is null
  );

create policy grupos_recursos_insert_tenant on public.grupos_recursos
  for insert
  to authenticated
  with check (
    empresa_id = public.empresa_atual_id()
    and created_by = auth.uid()
  );

create policy grupos_recursos_update_tenant on public.grupos_recursos
  for update
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and deleted_at is null
    and (
      created_by = auth.uid()
      or public.usuario_e_admin()
    )
  )
  with check (
    empresa_id = public.empresa_atual_id()
    and (
      created_by = auth.uid()
      or public.usuario_e_admin()
    )
  );

create policy grupos_recursos_delete_blocked on public.grupos_recursos
  for delete
  to authenticated
  using (false);

revoke delete on public.grupos_recursos from anon;
revoke delete on public.grupos_recursos from authenticated;

comment on index public.grupos_recursos_empresa_codigo_unique_idx is 'Garante codigo unico por empresa ativa para grupos de recursos.';
