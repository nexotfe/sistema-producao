-- Teste do módulo 001_extensions.sql
-- Falha imediatamente se a fundação técnica não estiver correta.

begin;

do $test$
declare
  v_extension_schema text;
  v_first_uuid uuid;
  v_second_uuid uuid;
begin
  select n.nspname
    into v_extension_schema
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pgcrypto';

  if v_extension_schema is distinct from 'extensions' then
    raise exception
      'pgcrypto deveria estar no schema extensions; encontrado: %',
      coalesce(v_extension_schema, '<ausente>');
  end if;

  v_first_uuid := extensions.gen_random_uuid();
  v_second_uuid := extensions.gen_random_uuid();

  if v_first_uuid is null or v_second_uuid is null then
    raise exception 'extensions.gen_random_uuid() retornou NULL';
  end if;

  if v_first_uuid = v_second_uuid then
    raise exception 'extensions.gen_random_uuid() não gerou valores distintos';
  end if;
end
$test$;

rollback;

