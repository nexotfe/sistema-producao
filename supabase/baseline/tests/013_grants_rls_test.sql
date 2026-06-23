begin;

do $s$ declare c int;begin
  select count(*) into c from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
  if c<>0 then raise exception 'Tabelas public sem RLS: %',c;end if;
  select count(*) into c from pg_policies where schemaname='public';
  if c<70 then raise exception 'Policies RLS insuficientes: %',c;end if;
  select count(*) into c from information_schema.role_table_grants where table_schema='public' and grantee='anon' and privilege_type<>'SELECT';
  if c<>0 then raise exception 'Anon possui grants indevidos: %',c;end if;
end $s$;

rollback;
