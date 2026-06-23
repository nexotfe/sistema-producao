-- NEXOTFE 1.0 - Baseline SQL
-- Modulo 013: fechamento de grants, RLS e policies
-- Dependencias: 001..012

begin;

revoke create on schema public from public,anon,authenticated;
grant usage on schema public to anon,authenticated,service_role;

do $rls$
declare
  r record;
begin
  for r in
    select n.nspname,c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind='r'
      and c.relname not like 'schema_migrations%'
  loop
    if r.relname<>'empresas' and not exists(select 1 from pg_attribute where attrelid=format('%I.%I',r.nspname,r.relname)::regclass and attname='empresa_id' and not attisdropped) then
      raise exception 'Tabela publica sem empresa_id: %.%',r.nspname,r.relname;
    end if;
    if not exists(select 1 from pg_class where oid=format('%I.%I',r.nspname,r.relname)::regclass and relrowsecurity) then
      raise exception 'Tabela publica sem RLS: %.%',r.nspname,r.relname;
    end if;
    if not exists(select 1 from pg_policies where schemaname=r.nspname and tablename=r.relname) then
      raise exception 'Tabela publica sem policy RLS: %.%',r.nspname,r.relname;
    end if;
  end loop;
end $rls$;

do $security_definer$
declare
  r record;
begin
  for r in
    select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args,p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    if r.proconfig is null or not exists(select 1 from unnest(r.proconfig) cfg where cfg like 'search_path=%') then
      raise exception 'Funcao SECURITY DEFINER sem search_path: %.%(%)',r.nspname,r.proname,r.args;
    end if;
  end loop;
end $security_definer$;

do $anon$
declare
  v_count integer;
begin
  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema='public' and grantee='anon' and privilege_type<>'SELECT';
  if v_count<>0 then raise exception 'Anon possui privilegios indevidos em tabelas/views public: %',v_count;end if;
end $anon$;

commit;
