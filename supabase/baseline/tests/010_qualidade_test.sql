begin;

do $s$ declare t text;c int;begin
  foreach t in array array['inspecoes_qualidade','inspecao_qualidade_eventos','certificados_qualidade','nao_conformidades','nao_conformidade_eventos','liberacoes_qualidade'] loop
    if to_regclass('public.'||t) is null or not exists(select 1 from pg_class where oid=to_regclass('public.'||t) and relrowsecurity) then raise exception 'Estrutura/RLS ausente em %',t;end if;
  end loop;
  select count(*) into c from pg_policies where schemaname='public' and tablename=any(array['inspecoes_qualidade','inspecao_qualidade_eventos','certificados_qualidade','nao_conformidades','nao_conformidade_eventos','liberacoes_qualidade']);if c<>6 then raise exception 'Esperadas 6 policies de Qualidade; encontradas %',c;end if;
end $s$;

insert into auth.users(id,email) values('18000000-0000-0000-0000-000000000001','qualidade-a@test'),('18000000-0000-0000-0000-000000000002','qualidade-b@test');
insert into public.empresas(id,nome,slug) values('28000000-0000-0000-0000-000000000001','Qualidade A','qualidade-a'),('28000000-0000-0000-0000-000000000002','Qualidade B','qualidade-b');
insert into public.usuarios(id,auth_user_id,empresa_id,nome,email,papel,permissoes) values
('38000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','Qualidade A','qualidade-a@test','qualidade',array['admin.numeracao.gerar','qualidade.inspecoes.gerenciar','qualidade.certificados.gerenciar','qualidade.nao_conformidades.gerenciar','qualidade.liberacoes.decidir','qualidade.operacao.liberar','producao.op.transicionar']),
('38000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000002','Qualidade B','qualidade-b@test','qualidade',array[]::text[]);
insert into public.numeracao_configuracoes(empresa_id,entidade,prefixo,usar_ano,tamanho_sequencia,created_by) values
('28000000-0000-0000-0000-000000000001','inspecao','INSP-',true,4,'18000000-0000-0000-0000-000000000001'),
('28000000-0000-0000-0000-000000000001','nao_conformidade','NC-',true,4,'18000000-0000-0000-0000-000000000001');

insert into public.clientes(id,empresa_id,nome,created_by) values('80000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','Cliente Qualidade','18000000-0000-0000-0000-000000000001');
insert into public.projetos(id,empresa_id,cliente_id,numero_projeto,nome,tipo,status,created_by) values('80000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','P-QUAL-1','Projeto Qualidade','fabricacao','em_producao','18000000-0000-0000-0000-000000000001');
insert into public.itens_industriais(id,empresa_id,pn,descricao,unidade,tipo,created_by) values('80000000-0000-0000-0000-000000000003','28000000-0000-0000-0000-000000000001','PN-QUAL','Produto Qualidade','pc','produto','18000000-0000-0000-0000-000000000001');
insert into public.projeto_itens(id,empresa_id,projeto_id,item_industrial_id,quantidade,created_by) values('80000000-0000-0000-0000-000000000004','28000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000003',2,'18000000-0000-0000-0000-000000000001');
insert into public.grupos_tecnologias(id,empresa_id,codigo,descricao,created_by) values('80000000-0000-0000-0000-000000000005','28000000-0000-0000-0000-000000000001','TEC-QUAL','Tecnologia Qualidade','18000000-0000-0000-0000-000000000001');
insert into public.tecnologias(id,empresa_id,grupo_tecnologia_id,codigo,descricao,unidade_planejamento,created_by) values('80000000-0000-0000-0000-000000000006','28000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000005','MONTAR','Montagem','hora','18000000-0000-0000-0000-000000000001');
insert into public.boms(id,empresa_id,produto_id,versao,publicada_em,publicada_por,created_by) values('80000000-0000-0000-0000-000000000007','28000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000003','A',now(),'18000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000001');
insert into public.roteiros_fabricacao(id,empresa_id,produto_id,versao,status,created_by) values('80000000-0000-0000-0000-000000000008','28000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000003','A','rascunho','18000000-0000-0000-0000-000000000001');
insert into public.roteiro_operacoes(id,empresa_id,roteiro_id,sequencia,descricao_operacional,tipo_operacao,tecnologia_id,tempo_previsto,unidade_tempo,created_by) values('80000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000008',10,'Montar','interna','80000000-0000-0000-0000-000000000006',1,'hora','18000000-0000-0000-0000-000000000001');
update public.roteiros_fabricacao set status='ativo' where id='80000000-0000-0000-0000-000000000008';
insert into public.ordens_fabricacao(id,empresa_id,numero_of,projeto_id,projeto_item_id,produto_id,bom_id,roteiro_id,status,quantidade_planejada,unidade,idempotency_key,created_by) values
('80000000-0000-0000-0000-000000000010','28000000-0000-0000-0000-000000000001','OF-QUAL-OK','80000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000007','80000000-0000-0000-0000-000000000008','em_producao',1,'pc','fixture-qual-ok','18000000-0000-0000-0000-000000000001'),
('80000000-0000-0000-0000-000000000011','28000000-0000-0000-0000-000000000001','OF-QUAL-NC','80000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000007','80000000-0000-0000-0000-000000000008','em_producao',1,'pc','fixture-qual-nc','18000000-0000-0000-0000-000000000001');
insert into public.operacoes_producao(id,empresa_id,numero_op,of_id,roteiro_id,roteiro_operacao_id,sequencia_snapshot,descricao_snapshot,tipo_operacao_snapshot,tecnologia_id,tempo_planejado_snapshot,unidade_tempo_snapshot,quantidade_planejada_snapshot,unidade_quantidade_snapshot,status,iniciada_em,created_by) values
('80000000-0000-0000-0000-000000000012','28000000-0000-0000-0000-000000000001','OP-QUAL-OK','80000000-0000-0000-0000-000000000010','80000000-0000-0000-0000-000000000008','80000000-0000-0000-0000-000000000009',10,'Montar','interna','80000000-0000-0000-0000-000000000006',1,'hora',1,'pc','inspecao',now(),'18000000-0000-0000-0000-000000000001'),
('80000000-0000-0000-0000-000000000013','28000000-0000-0000-0000-000000000001','OP-QUAL-NC','80000000-0000-0000-0000-000000000011','80000000-0000-0000-0000-000000000008','80000000-0000-0000-0000-000000000009',10,'Montar','interna','80000000-0000-0000-0000-000000000006',1,'hora',1,'pc','inspecao',now(),'18000000-0000-0000-0000-000000000001');

set local role authenticated;select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000001',true);
do $flow$ declare insp_ok uuid;insp_ok_2 uuid;insp_nc uuid;insp_cancel uuid;cert uuid;cert2 uuid;lib uuid;lib2 uuid;nc uuid;st text;c int;failed boolean:=false;begin
  begin perform public.transicionar_operacao_producao('80000000-0000-0000-0000-000000000012','concluida','Tentativa direta');exception when raise_exception then failed:=true;end;if not failed then raise exception 'Conclusão da OP contornou a Qualidade';end if;

  insp_ok:=public.abrir_inspecao_qualidade('processo',null,'80000000-0000-0000-0000-000000000012',null,'Dimensional e visual',null,'insp-qual-ok');
  insp_ok_2:=public.abrir_inspecao_qualidade('processo',null,'80000000-0000-0000-0000-000000000012',null,'Dimensional e visual',null,'insp-qual-ok');if insp_ok<>insp_ok_2 then raise exception 'Abertura não foi idempotente';end if;
  failed:=false;begin perform public.abrir_inspecao_qualidade('processo',null,'80000000-0000-0000-0000-000000000012',null,'Critério divergente',null,'insp-qual-ok');exception when raise_exception then failed:=true;end;if not failed then raise exception 'Idempotência aceitou payload divergente';end if;
  perform public.iniciar_inspecao_qualidade(insp_ok,'Início da inspeção');perform public.concluir_inspecao_qualidade(insp_ok,'conforme','Peça conforme',null,null);perform public.concluir_inspecao_qualidade(insp_ok,'conforme','Repetição',null,null);

  cert:=public.registrar_certificado_qualidade(insp_ok,'dimensional','CQ-001','cq-001.pdf','qualidade/cq-001.pdf',repeat('a',64),current_date,current_date+365,'cert-qual-1');
  cert2:=public.registrar_certificado_qualidade(insp_ok,'dimensional','CQ-001','cq-001.pdf','qualidade/cq-001.pdf',repeat('a',64),current_date,current_date+365,'cert-qual-1');if cert<>cert2 then raise exception 'Certificado não foi idempotente';end if;
  failed:=false;begin perform public.registrar_certificado_qualidade(insp_ok,'dimensional','CQ-001','outro.pdf','qualidade/outro.pdf',repeat('a',64),current_date,current_date+365,'cert-qual-1');exception when raise_exception then failed:=true;end;if not failed then raise exception 'Certificado aceitou payload divergente';end if;

  lib:=public.registrar_liberacao_qualidade(insp_ok,'liberado','Produto aprovado','lib-qual-ok');lib2:=public.registrar_liberacao_qualidade(insp_ok,'liberado','Produto aprovado','lib-qual-ok');if lib<>lib2 then raise exception 'Liberação não foi idempotente';end if;
  select status into st from public.operacoes_producao where id='80000000-0000-0000-0000-000000000012';if st<>'concluida' then raise exception 'Liberação não concluiu a OP';end if;
  select status into st from public.ordens_fabricacao where id='80000000-0000-0000-0000-000000000010';if st<>'finalizada' then raise exception 'Liberação não finalizou a OF';end if;

  insp_cancel:=public.abrir_inspecao_qualidade('produto',null,null,'80000000-0000-0000-0000-000000000010','Inspeção final',null,'insp-qual-cancel');perform public.cancelar_inspecao_qualidade(insp_cancel,'Amostra substituída');select status into st from public.inspecoes_qualidade where id=insp_cancel;if st<>'cancelada' then raise exception 'Cancelamento da inspeção falhou';end if;

  insp_nc:=public.abrir_inspecao_qualidade('processo',null,'80000000-0000-0000-0000-000000000013',null,'Dimensional e visual',null,'insp-qual-nc');perform public.iniciar_inspecao_qualidade(insp_nc,'Início da inspeção');perform public.concluir_inspecao_qualidade(insp_nc,'nao_conforme','Dimensão fora','alta','Diâmetro acima da tolerância');
  select id into nc from public.nao_conformidades where inspecao_qualidade_id=insp_nc;if nc is null then raise exception 'Resultado não conforme não abriu NC';end if;
  perform public.transicionar_nao_conformidade(nc,'em_tratamento',null,'18000000-0000-0000-0000-000000000001',current_date+7,'Definir contenção');perform public.transicionar_nao_conformidade(nc,'encerrada','Retrabalho aprovado',null,null,'Validar disposição');
  select count(*) into c from public.nao_conformidade_eventos where nao_conformidade_id=nc;if c<>3 then raise exception 'Histórico da NC incompleto: %',c;end if;
  perform public.registrar_liberacao_qualidade(insp_nc,'retrabalho','Retornar à produção','lib-qual-nc');select status into st from public.operacoes_producao where id='80000000-0000-0000-0000-000000000013';if st<>'em_execucao' then raise exception 'Retrabalho não retornou a OP à execução';end if;

  select count(*) into c from public.inspecao_qualidade_eventos where inspecao_qualidade_id=insp_ok;if c<>3 then raise exception 'Histórico da inspeção conforme incompleto: %',c;end if;
  failed:=false;begin update public.liberacoes_qualidade set justificativa='Alterada' where id=lib;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Liberação aceitou alteração direta';end if;
end $flow$;
reset role;

set local role authenticated;select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000002',true);
do $tenant$ declare c int;t text;begin foreach t in array array['inspecoes_qualidade','inspecao_qualidade_eventos','certificados_qualidade','nao_conformidades','nao_conformidade_eventos','liberacoes_qualidade'] loop execute format('select count(*) from public.%I',t) into c;if c<>0 then raise exception 'Tenant B visualizou dados de %',t;end if;end loop;end $tenant$;
reset role;

rollback;
