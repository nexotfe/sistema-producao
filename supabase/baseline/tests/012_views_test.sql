begin;

do $s$ declare c int;begin
  select count(*) into c from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and c.relname like 'vw_%';
  if c<>16 then raise exception 'Esperadas 16 views operacionais; encontradas %',c;end if;
  select count(*) into c from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and c.relname like 'vw_%' and not (coalesce(c.reloptions,array[]::text[]) @> array['security_invoker=true']);
  if c<>0 then raise exception 'Existem views sem security_invoker=true: %',c;end if;
end $s$;

insert into auth.users(id,email) values('20000000-0000-0000-0000-000000000001','views-a@test'),('20000000-0000-0000-0000-000000000002','views-b@test');
insert into public.empresas(id,nome,slug) values('30000000-0000-0000-0000-000000000001','Views A','views-a'),('30000000-0000-0000-0000-000000000002','Views B','views-b');
insert into public.usuarios(id,auth_user_id,empresa_id,nome,email,papel,permissoes) values
('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Views A','views-a@test','consulta',array[]::text[]),
('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','Views B','views-b@test','consulta',array[]::text[]);
insert into public.clientes(id,empresa_id,nome,created_by) values('a0000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Cliente Views','20000000-0000-0000-0000-000000000001');
insert into public.projetos(id,empresa_id,cliente_id,numero_projeto,nome,tipo,status,created_by) values('a0000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','P-VIEW-1','Projeto Views','fabricacao','aprovado','20000000-0000-0000-0000-000000000001');

set local role authenticated;select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
do $tenant_a$ declare c int;begin select count(*) into c from public.vw_projetos_operacional;if c<>1 then raise exception 'Tenant A esperava 1 projeto na view; encontrou %',c;end if;end $tenant_a$;
reset role;

set local role authenticated;select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
do $tenant_b$ declare c int;begin select count(*) into c from public.vw_projetos_operacional;if c<>0 then raise exception 'Tenant B visualizou projeto de outro tenant na view';end if;end $tenant_b$;
reset role;

rollback;
