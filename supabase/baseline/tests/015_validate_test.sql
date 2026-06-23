begin;

do $s$ declare c int;begin
  select count(*) into c from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';
  if c<>72 then raise exception 'Esperadas 72 tabelas public; encontradas %',c;end if;
  select count(*) into c from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and c.relname like 'vw_%';
  if c<>16 then raise exception 'Esperadas 16 views public; encontradas %',c;end if;
  if to_regclass('public.profiles') is not null then raise exception 'profiles nao pode existir';end if;
end $s$;

rollback;
