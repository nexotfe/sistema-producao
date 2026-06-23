begin;

do $s$ declare c int;begin
  select count(*) into c
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v' and c.relname like 'vw_%' and obj_description(c.oid,'pg_class') is null;
  if c<>0 then raise exception 'Views operacionais sem comentario: %',c;end if;
  if obj_description('public.empresa_atual_id()'::regprocedure,'pg_proc') is null then raise exception 'empresa_atual_id sem comentario';end if;
end $s$;

rollback;
