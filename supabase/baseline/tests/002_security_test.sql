-- Testes estruturais e comportamentais do módulo 002_security.sql.

begin;

do $structure$
declare
  v_count integer;
begin
  if to_regclass('public.empresas') is null then
    raise exception 'Tabela public.empresas ausente';
  end if;

  if to_regclass('public.usuarios') is null then
    raise exception 'Tabela public.usuarios ausente';
  end if;

  if to_regclass('public.profiles') is not null then
    raise exception 'public.profiles não pode integrar o baseline';
  end if;

  select count(*) into v_count
    from pg_attribute
   where attrelid = 'public.usuarios'::regclass
     and attname in ('empresa_id', 'papel', 'permissoes')
     and not attisdropped;

  if v_count <> 3 then
    raise exception 'public.usuarios não concentra empresa, papel e permissões';
  end if;

  if not exists (
    select 1 from pg_class
     where oid in ('public.empresas'::regclass, 'public.usuarios'::regclass)
       and relrowsecurity = true
     group by relrowsecurity
    having count(*) = 2
  ) then
    raise exception 'RLS não está habilitada nas duas tabelas de segurança';
  end if;

  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and tablename in ('empresas', 'usuarios');

  if v_count <> 5 then
    raise exception 'Esperadas 5 policies; encontradas %', v_count;
  end if;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('empresa_atual_id', 'usuario_tem_permissao')
       and (
         p.prosecdef is not true
         or not exists (
           select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
            where cfg like 'search_path=%'
         )
       )
  ) then
    raise exception 'Função de contexto sem SECURITY DEFINER/search_path seguro';
  end if;
end
$structure$;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'a@nexotfe.test'),
  ('10000000-0000-0000-0000-000000000002', 'b@nexotfe.test'),
  ('10000000-0000-0000-0000-000000000003', 'gestor-a@nexotfe.test');

insert into public.empresas (id, nome, slug) values
  ('20000000-0000-0000-0000-000000000001', 'Empresa A', 'empresa-a'),
  ('20000000-0000-0000-0000-000000000002', 'Empresa B', 'empresa-b');

insert into public.usuarios (
  id, auth_user_id, empresa_id, nome, email, papel, permissoes
) values
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Usuário A', 'a@nexotfe.test', 'operador', array[]::text[]
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'Usuário B', 'b@nexotfe.test', 'operador', array[]::text[]
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    'Gestor A', 'gestor-a@nexotfe.test', 'gestor',
    array[
      'admin.empresas.gerenciar',
      'admin.usuarios.visualizar',
      'admin.usuarios.gerenciar'
    ]
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

do $tenant_a$
declare
  v_count integer;
  v_affected integer;
begin
  if public.empresa_atual_id() is distinct from
     '20000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'Tenant do usuário A resolvido incorretamente';
  end if;

  select count(*) into v_count from public.empresas;
  if v_count <> 1 then
    raise exception 'Usuário A visualizou % empresas; esperado 1', v_count;
  end if;

  select count(*) into v_count from public.usuarios;
  if v_count <> 1 then
    raise exception 'Usuário A visualizou % usuários; esperado apenas o próprio', v_count;
  end if;

  if public.usuario_tem_permissao('admin.usuarios.gerenciar') then
    raise exception 'Usuário A recebeu permissão inexistente';
  end if;

  update public.usuarios
     set papel = 'admin'
   where auth_user_id = auth.uid();
  get diagnostics v_affected = row_count;
  if v_affected <> 0 then
    raise exception 'Usuário sem permissão conseguiu alterar o próprio papel';
  end if;

  begin
    insert into public.usuarios (
      auth_user_id, empresa_id, nome, email, papel, created_by
    ) values (
      extensions.gen_random_uuid(),
      '20000000-0000-0000-0000-000000000002',
      'Invasor', 'invasor@nexotfe.test', 'admin', auth.uid()
    );
    raise exception 'Usuário A conseguiu inserir usuário em outro tenant';
  exception
    when insufficient_privilege or foreign_key_violation then null;
  end;
end
$tenant_a$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000003',
  true
);

do $manager_a$
declare
  v_count integer;
begin
  select count(*) into v_count from public.usuarios;
  if v_count <> 2 then
    raise exception 'Gestor A deveria visualizar 2 usuários do tenant; encontrou %', v_count;
  end if;

  if not public.usuario_tem_permissao('admin.usuarios.gerenciar') then
    raise exception 'Permissão explícita do Gestor A não foi reconhecida';
  end if;

  if exists (
    select 1 from public.usuarios
     where empresa_id = '20000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'Gestor A visualizou usuário da Empresa B';
  end if;
end
$manager_a$;

reset role;

update public.usuarios
   set ativo = false
 where auth_user_id = '10000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

do $inactive_user$
declare
  v_count integer;
begin
  if public.empresa_atual_id() is not null then
    raise exception 'Usuário inativo ainda recebeu tenant';
  end if;

  select count(*) into v_count from public.usuarios;
  if v_count <> 0 then
    raise exception 'Usuário inativo ainda visualiza public.usuarios';
  end if;
end
$inactive_user$;

reset role;
set local role anon;

do $anonymous$
begin
  begin
    perform public.empresa_atual_id();
    raise exception 'Role anon conseguiu executar empresa_atual_id()';
  exception
    when insufficient_privilege then null;
  end;
end
$anonymous$;

reset role;
rollback;
