-- NEXOTFE 1.0 - Baseline SQL
-- Modulo 015: invariantes finais do baseline
-- Dependencias: 001..014

begin;

do $validate$
declare
  v_count integer;
begin
  if to_regclass('public.profiles') is not null then
    raise exception 'public.profiles nao pode integrar o baseline definitivo';
  end if;

  select count(*) into v_count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';
  if v_count<>72 then raise exception 'Esperadas 72 tabelas public; encontradas %',v_count;end if;

  select count(*) into v_count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and c.relname like 'vw_%';
  if v_count<>16 then raise exception 'Esperadas 16 views operacionais; encontradas %',v_count;end if;

  select count(*) into v_count from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e';
  if v_count<>0 then raise exception 'Enums nativos public nao integram o baseline: %',v_count;end if;

  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
  if v_count<>0 then raise exception 'Existem tabelas public sem RLS: %',v_count;end if;

  select count(*) into v_count
  from pg_depend d
  join pg_rewrite rw on rw.oid=d.objid
  join pg_class v on v.oid=rw.ev_class
  join pg_namespace n on n.oid=v.relnamespace
  where n.nspname='public' and v.relkind='v' and d.refobjid=to_regclass('public.profiles');
  if v_count<>0 then raise exception 'Views ainda dependem de public.profiles';end if;
end $validate$;

commit;
