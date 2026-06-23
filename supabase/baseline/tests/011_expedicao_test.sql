begin;

do $s$ declare t text;c int;begin
  foreach t in array array['produtos_acabados','produto_acabado_eventos','separacoes_expedicao','separacao_itens','expedicoes','expedicao_itens','entregas'] loop
    if to_regclass('public.'||t) is null or not exists(select 1 from pg_class where oid=to_regclass('public.'||t) and relrowsecurity) then raise exception 'Estrutura/RLS ausente em %',t;end if;
  end loop;
  select count(*) into c from pg_policies where schemaname='public' and tablename=any(array['produtos_acabados','produto_acabado_eventos','separacoes_expedicao','separacao_itens','expedicoes','expedicao_itens','entregas']);if c<>7 then raise exception 'Esperadas 7 policies de Expedicao; encontradas %',c;end if;
end $s$;

insert into auth.users(id,email) values('19000000-0000-0000-0000-000000000001','expedicao-a@test'),('19000000-0000-0000-0000-000000000002','expedicao-b@test');
insert into public.empresas(id,nome,slug) values('29000000-0000-0000-0000-000000000001','Expedicao A','expedicao-a'),('29000000-0000-0000-0000-000000000002','Expedicao B','expedicao-b');
insert into public.usuarios(id,auth_user_id,empresa_id,nome,email,papel,permissoes) values
('39000000-0000-0000-0000-000000000001','19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001','Expedicao A','expedicao-a@test','expedicao',array['admin.numeracao.gerar','expedicao.produtos_acabados.registrar','expedicao.separacoes.gerenciar','expedicao.expedicoes.gerenciar','expedicao.entregas.registrar','expedicao.projetos.concluir']),
('39000000-0000-0000-0000-000000000002','19000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000002','Expedicao B','expedicao-b@test','expedicao',array[]::text[]);
insert into public.numeracao_configuracoes(empresa_id,entidade,prefixo,usar_ano,tamanho_sequencia,created_by) values
('29000000-0000-0000-0000-000000000001','produto_acabado','PA-',true,4,'19000000-0000-0000-0000-000000000001'),
('29000000-0000-0000-0000-000000000001','separacao_expedicao','SEP-',true,4,'19000000-0000-0000-0000-000000000001'),
('29000000-0000-0000-0000-000000000001','expedicao','EXP-',true,4,'19000000-0000-0000-0000-000000000001'),
('29000000-0000-0000-0000-000000000001','entrega','ENT-',true,4,'19000000-0000-0000-0000-000000000001');

insert into public.clientes(id,empresa_id,nome,created_by) values('90000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001','Cliente Expedicao','19000000-0000-0000-0000-000000000001');
insert into public.projetos(id,empresa_id,cliente_id,numero_projeto,nome,tipo,status,created_by) values('90000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','P-EXP-1','Projeto Expedicao','fabricacao','em_producao','19000000-0000-0000-0000-000000000001');
insert into public.itens_industriais(id,empresa_id,pn,descricao,unidade,tipo,created_by) values('90000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000001','PN-EXP','Produto Expedicao','pc','produto','19000000-0000-0000-0000-000000000001');
insert into public.projeto_itens(id,empresa_id,projeto_id,item_industrial_id,quantidade,created_by) values('90000000-0000-0000-0000-000000000004','29000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000003',2,'19000000-0000-0000-0000-000000000001');
insert into public.grupos_tecnologias(id,empresa_id,codigo,descricao,created_by) values('90000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000001','TEC-EXP','Tecnologia Expedicao','19000000-0000-0000-0000-000000000001');
insert into public.tecnologias(id,empresa_id,grupo_tecnologia_id,codigo,descricao,unidade_planejamento,created_by) values('90000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000005','MONTAR','Montagem','hora','19000000-0000-0000-0000-000000000001');
insert into public.boms(id,empresa_id,produto_id,versao,publicada_em,publicada_por,created_by) values('90000000-0000-0000-0000-000000000007','29000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000003','A',now(),'19000000-0000-0000-0000-000000000001','19000000-0000-0000-0000-000000000001');
insert into public.roteiros_fabricacao(id,empresa_id,produto_id,versao,status,created_by) values('90000000-0000-0000-0000-000000000008','29000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000003','A','ativo','19000000-0000-0000-0000-000000000001');
insert into public.ordens_fabricacao(id,empresa_id,numero_of,projeto_id,projeto_item_id,produto_id,bom_id,roteiro_id,status,quantidade_planejada,unidade,idempotency_key,created_by) values
('90000000-0000-0000-0000-000000000010','29000000-0000-0000-0000-000000000001','OF-EXP-OK','90000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000004','90000000-0000-0000-0000-000000000003','90000000-0000-0000-0000-000000000007','90000000-0000-0000-0000-000000000008','finalizada',2,'pc','fixture-exp-ok','19000000-0000-0000-0000-000000000001'),
('90000000-0000-0000-0000-000000000011','29000000-0000-0000-0000-000000000001','OF-EXP-BLOCK','90000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000004','90000000-0000-0000-0000-000000000003','90000000-0000-0000-0000-000000000007','90000000-0000-0000-0000-000000000008','finalizada',1,'pc','fixture-exp-block','19000000-0000-0000-0000-000000000001');
insert into public.inspecoes_qualidade(id,empresa_id,numero_inspecao,tipo,of_id,criterio,status,resultado,concluida_em,idempotency_key,created_by) values('90000000-0000-0000-0000-000000000012','29000000-0000-0000-0000-000000000001','INSP-EXP-OK','produto','90000000-0000-0000-0000-000000000010','Inspecao final','concluida','conforme',now(),'insp-exp-ok','19000000-0000-0000-0000-000000000001');
insert into public.liberacoes_qualidade(id,empresa_id,inspecao_qualidade_id,decisao,justificativa,idempotency_key,decidida_por) values('90000000-0000-0000-0000-000000000013','29000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000012','liberado','Liberado para expedicao','lib-exp-ok','19000000-0000-0000-0000-000000000001');

set local role authenticated;select set_config('request.jwt.claim.sub','19000000-0000-0000-0000-000000000001',true);
do $flow$ declare pa uuid;pa2 uuid;sep uuid;sep2 uuid;exp uuid;exp2 uuid;ent uuid;ent2 uuid;st text;c int;failed boolean:=false;begin
  failed:=false;begin perform public.registrar_produto_acabado('90000000-0000-0000-0000-000000000011','Sem qualidade','pa-block');exception when raise_exception then failed:=true;end;if not failed then raise exception 'Produto acabado aceitou OF sem liberacao da Qualidade';end if;
  pa:=public.registrar_produto_acabado('90000000-0000-0000-0000-000000000010','Produto pronto','pa-ok');
  pa2:=public.registrar_produto_acabado('90000000-0000-0000-0000-000000000010','Produto pronto','pa-ok');if pa<>pa2 then raise exception 'Produto acabado nao foi idempotente';end if;
  failed:=false;begin perform public.registrar_produto_acabado('90000000-0000-0000-0000-000000000011','Outro','pa-ok');exception when raise_exception then failed:=true;end;if not failed then raise exception 'Produto acabado aceitou chave divergente';end if;
  sep:=public.criar_separacao_expedicao(pa,2,'Separar para envio','sep-ok');
  sep2:=public.criar_separacao_expedicao(pa,2,'Separar para envio','sep-ok');if sep<>sep2 then raise exception 'Separacao nao foi idempotente';end if;
  failed:=false;begin perform public.criar_separacao_expedicao(pa,1,'Excedente','sep-extra');exception when raise_exception then failed:=true;end;if not failed then raise exception 'Separacao excedeu quantidade disponivel';end if;
  perform public.confirmar_separacao_expedicao(sep,'Conferencia OK');select status into st from public.produtos_acabados where id=pa;if st<>'separado' then raise exception 'Produto acabado nao ficou separado';end if;
  exp:=public.registrar_expedicao(sep,'Transportadora A','CTE-001','Enviar ao cliente','exp-ok');
  exp2:=public.registrar_expedicao(sep,'Transportadora A','CTE-001','Enviar ao cliente','exp-ok');if exp<>exp2 then raise exception 'Expedicao nao foi idempotente';end if;
  perform public.confirmar_expedicao(exp,'Saida confirmada');select status into st from public.produtos_acabados where id=pa;if st<>'expedido' then raise exception 'Produto acabado nao ficou expedido';end if;
  ent:=public.registrar_entrega(exp,'Cliente Expedicao','CANHOTO-001',null,'ent-ok');
  ent2:=public.registrar_entrega(exp,'Cliente Expedicao','CANHOTO-001',null,'ent-ok');if ent<>ent2 then raise exception 'Entrega nao foi idempotente';end if;
  select status into st from public.produtos_acabados where id=pa;if st<>'entregue' then raise exception 'Produto acabado nao ficou entregue';end if;
  select status into st from public.projetos where id='90000000-0000-0000-0000-000000000002';if st<>'concluido' then raise exception 'Projeto nao foi concluido pela entrega';end if;
  select count(*) into c from public.produto_acabado_eventos where produto_acabado_id=pa;if c<>4 then raise exception 'Historico do produto acabado incompleto: %',c;end if;
  failed:=false;begin update public.entregas set recebido_por='Alterado' where id=ent;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Entrega aceitou alteracao direta';end if;
end $flow$;
reset role;

set local role authenticated;select set_config('request.jwt.claim.sub','19000000-0000-0000-0000-000000000002',true);
do $tenant$ declare c int;t text;begin foreach t in array array['produtos_acabados','produto_acabado_eventos','separacoes_expedicao','separacao_itens','expedicoes','expedicao_itens','entregas'] loop execute format('select count(*) from public.%I',t) into c;if c<>0 then raise exception 'Tenant B visualizou dados de %',t;end if;end loop;end $tenant$;
reset role;

rollback;
