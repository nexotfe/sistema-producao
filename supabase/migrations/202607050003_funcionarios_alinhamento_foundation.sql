-- Alinhamento FOUNDATION do módulo Colaboradores.
-- Preserva os dados de carga_horaria renomeando o campo para carga_produtiva.
-- Remove disponibilidade_atual porque disponibilidade real pertence ao Planejamento.
-- Bloqueia exclusão física.

drop view if exists public.funcionarios_ativos;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'funcionarios'
      and column_name = 'carga_horaria'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'funcionarios'
      and column_name = 'carga_produtiva'
  ) then
    alter table public.funcionarios rename column carga_horaria to carga_produtiva;
  end if;
end $$;

alter table public.funcionarios
  drop column if exists disponibilidade_atual;

drop policy if exists "nexotfe funcionarios delete admin mesma empresa" on public.funcionarios;
drop policy if exists "nexotfe funcionarios insert mesma empresa" on public.funcionarios;
drop policy if exists "nexotfe funcionarios select mesma empresa" on public.funcionarios;
drop policy if exists "nexotfe funcionarios update mesma empresa" on public.funcionarios;
drop policy if exists funcionarios_delete_blocked on public.funcionarios;
drop policy if exists funcionarios_insert_tenant on public.funcionarios;
drop policy if exists funcionarios_select_tenant on public.funcionarios;
drop policy if exists funcionarios_update_tenant on public.funcionarios;

create policy funcionarios_select_tenant on public.funcionarios
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and deleted_at is null
  );

create policy funcionarios_insert_tenant on public.funcionarios
  for insert
  to authenticated
  with check (
    empresa_id = public.empresa_atual_id()
    and created_by = auth.uid()
  );

create policy funcionarios_update_tenant on public.funcionarios
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

create policy funcionarios_delete_blocked on public.funcionarios
  for delete
  to authenticated
  using (false);

revoke delete on public.funcionarios from anon;
revoke delete on public.funcionarios from authenticated;

create view public.funcionarios_ativos as
select
  id,
  empresa_id,
  codigo,
  nome,
  apelido,
  setor,
  funcao,
  tecnologia_aplicada_id,
  habilidades,
  carga_produtiva,
  telefone,
  email,
  data_admissao,
  observacoes,
  ativo,
  created_at,
  updated_at,
  deleted_at,
  deleted_by,
  created_by
from public.funcionarios
where empresa_id = public.empresa_atual_id()
  and ativo = true
  and deleted_at is null;

grant select on public.funcionarios_ativos to authenticated;

comment on column public.funcionarios.carga_produtiva is 'Carga produtiva padrao do colaborador definida no cadastro.';
