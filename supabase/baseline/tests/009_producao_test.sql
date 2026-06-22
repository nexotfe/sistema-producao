begin;

do $s$ declare t text;c int;begin
  foreach t in array array['operacoes_producao','operacao_producao_eventos','operacao_alocacoes','apontamentos_producao','servicos_terceirizados','servico_terceirizado_eventos'] loop
    if to_regclass('public.'||t) is null or not exists(select 1 from pg_class where oid=to_regclass('public.'||t) and relrowsecurity) then raise exception 'Estrutura/RLS ausente em %',t;end if;
  end loop;
  select count(*) into c from pg_policies where schemaname='public' and tablename=any(array['operacoes_producao','operacao_producao_eventos','operacao_alocacoes','apontamentos_producao','servicos_terceirizados','servico_terceirizado_eventos']);if c<>6 then raise exception 'Esperadas 6 policies de produção; encontradas %',c;end if;
end $s$;

insert into auth.users(id,email) values('17000000-0000-0000-0000-000000000001','producao-a@test'),('17000000-0000-0000-0000-000000000002','producao-b@test');
insert into public.empresas(id,nome,slug) values('27000000-0000-0000-0000-000000000001','Produção A','producao-a'),('27000000-0000-0000-0000-000000000002','Produção B','producao-b');
insert into public.usuarios(id,auth_user_id,empresa_id,nome,email,papel,permissoes) values
('37000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000001','Produção A','producao-a@test','producao',array['admin.numeracao.gerar','producao.ops.gerar','producao.alocacoes.gerenciar','producao.apontamentos.registrar','producao.terceiros.gerenciar','producao.op.transicionar','qualidade.operacao.liberar','qualidade.inspecoes.gerenciar','qualidade.liberacoes.decidir']),
('37000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000002','27000000-0000-0000-0000-000000000002','Produção B','producao-b@test','producao',array[]::text[]);
insert into public.numeracao_configuracoes(empresa_id,entidade,prefixo,usar_ano,tamanho_sequencia,created_by) values('27000000-0000-0000-0000-000000000001','op','OP-',true,4,'17000000-0000-0000-0000-000000000001');
insert into public.numeracao_configuracoes(empresa_id,entidade,prefixo,usar_ano,tamanho_sequencia,created_by) values('27000000-0000-0000-0000-000000000001','inspecao','INSP-',true,4,'17000000-0000-0000-0000-000000000001');
insert into public.clientes(id,empresa_id,nome,created_by) values('70000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000001','Cliente Produção','17000000-0000-0000-0000-000000000001');
insert into public.projetos(id,empresa_id,cliente_id,numero_projeto,nome,tipo,status,created_by) values('70000000-0000-0000-0000-000000000002','27000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','P-PROD-1','Projeto Produção','fabricacao','em_producao','17000000-0000-0000-0000-000000000001');
insert into public.itens_industriais(id,empresa_id,pn,descricao,unidade,tipo,created_by) values('70000000-0000-0000-0000-000000000003','27000000-0000-0000-0000-000000000001','PN-PROD','Produto Produção','pc','produto','17000000-0000-0000-0000-000000000001');
insert into public.projeto_itens(id,empresa_id,projeto_id,item_industrial_id,quantidade,created_by) values('70000000-0000-0000-0000-000000000004','27000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000003',1,'17000000-0000-0000-0000-000000000001');
insert into public.grupos_tecnologias(id,empresa_id,codigo,descricao,created_by) values('70000000-0000-0000-0000-000000000005','27000000-0000-0000-0000-000000000001','TEC-PROD','Tecnologias Produção','17000000-0000-0000-0000-000000000001');
insert into public.tecnologias(id,empresa_id,grupo_tecnologia_id,codigo,descricao,unidade_planejamento,created_by) values
('70000000-0000-0000-0000-000000000006','27000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000005','USINAR','Usinagem','hora','17000000-0000-0000-0000-000000000001'),
('70000000-0000-0000-0000-000000000007','27000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000005','TRATAR','Tratamento','hora','17000000-0000-0000-0000-000000000001');
insert into public.grupos_recursos(id,empresa_id,codigo,nome,created_by) values('70000000-0000-0000-0000-000000000008','27000000-0000-0000-0000-000000000001','MAQ','Máquinas','17000000-0000-0000-0000-000000000001');
insert into public.recursos_produtivos(id,empresa_id,grupo_recurso_id,codigo,nome,created_by) values('70000000-0000-0000-0000-000000000009','27000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000008','MAQ-1','Máquina 1','17000000-0000-0000-0000-000000000001');
insert into public.colaboradores(id,empresa_id,codigo,nome,created_by) values('70000000-0000-0000-0000-000000000010','27000000-0000-0000-0000-000000000001','COL-1','Operador 1','17000000-0000-0000-0000-000000000001');
insert into public.recurso_tecnologias(empresa_id,recurso_produtivo_id,tecnologia_id,created_by) values('27000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000009','70000000-0000-0000-0000-000000000006','17000000-0000-0000-0000-000000000001');
insert into public.colaborador_tecnologias(empresa_id,colaborador_id,tecnologia_id,created_by) values('27000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000010','70000000-0000-0000-0000-000000000006','17000000-0000-0000-0000-000000000001');
insert into public.boms(id,empresa_id,produto_id,versao,publicada_em,publicada_por,created_by) values('70000000-0000-0000-0000-000000000011','27000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003','A',now(),'17000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001');
insert into public.roteiros_fabricacao(id,empresa_id,produto_id,versao,status,created_by) values('70000000-0000-0000-0000-000000000012','27000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003','A','rascunho','17000000-0000-0000-0000-000000000001');
insert into public.roteiro_operacoes(id,empresa_id,roteiro_id,sequencia,descricao_operacional,tipo_operacao,tecnologia_id,tempo_previsto,unidade_tempo,created_by) values
('70000000-0000-0000-0000-000000000013','27000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000012',10,'Usinar','interna','70000000-0000-0000-0000-000000000006',2,'hora','17000000-0000-0000-0000-000000000001'),
('70000000-0000-0000-0000-000000000014','27000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000012',20,'Tratar','terceirizada','70000000-0000-0000-0000-000000000007',3,'dia','17000000-0000-0000-0000-000000000001');
update public.roteiros_fabricacao set status='ativo' where id='70000000-0000-0000-0000-000000000012';
insert into public.ordens_fabricacao(id,empresa_id,numero_of,projeto_id,projeto_item_id,produto_id,bom_id,roteiro_id,status,quantidade_planejada,unidade,idempotency_key,created_by) values('70000000-0000-0000-0000-000000000015','27000000-0000-0000-0000-000000000001','OF-PROD-1','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000011','70000000-0000-0000-0000-000000000012','programada',1,'pc','fixture-prod-1','17000000-0000-0000-0000-000000000001');
insert into public.fornecedores(id,empresa_id,razao_social,tipo,situacao,created_by) values('70000000-0000-0000-0000-000000000016','27000000-0000-0000-0000-000000000001','Tratamentos ABC','servico_industrial','homologado','17000000-0000-0000-0000-000000000001');

set local role authenticated;select set_config('request.jwt.claim.sub','17000000-0000-0000-0000-000000000001',true);
do $flow$ declare op1 uuid;op2 uuid;aloc uuid;aloc2 uuid;ap0 uuid;ap1 uuid;ap2 uuid;serv uuid;insp uuid;t0 timestamptz:=now()+interval '1 day';t1 timestamptz:=now()+interval '2 days';st text;c int;failed boolean:=false;begin
  if public.gerar_operacoes_producao('70000000-0000-0000-0000-000000000015')<>2 or public.gerar_operacoes_producao('70000000-0000-0000-0000-000000000015')<>2 then raise exception 'Geração idempotente das OPs falhou';end if;
  select id into op1 from public.operacoes_producao where of_id='70000000-0000-0000-0000-000000000015' and sequencia_snapshot=10;
  select id into op2 from public.operacoes_producao where of_id='70000000-0000-0000-0000-000000000015' and sequencia_snapshot=20;
  aloc:=public.alocar_operacao_producao(op1,'70000000-0000-0000-0000-000000000009','70000000-0000-0000-0000-000000000010',t0,t1,'aloc-prod-1');
  aloc2:=public.alocar_operacao_producao(op1,'70000000-0000-0000-0000-000000000009','70000000-0000-0000-0000-000000000010',t0,t1,'aloc-prod-1');if aloc<>aloc2 then raise exception 'Alocação não foi idempotente';end if;
  failed:=false;begin perform public.alocar_operacao_producao(op1,'70000000-0000-0000-0000-000000000009',null,t0+interval '1 hour',t1,'aloc-conflito');exception when raise_exception then failed:=true;end;if not failed then raise exception 'Sobreposição de recurso foi aceita';end if;
  serv:=public.planejar_servico_terceirizado(op2,'70000000-0000-0000-0000-000000000016','Tratamento 45 HRC',current_date+5,null,null,'Serviço externo','serv-prod-1');
  perform public.transicionar_operacao_producao(op2,'preparacao','Preparar envio');
  perform public.transicionar_servico_terceirizado(serv,'enviado','Material enviado');perform public.transicionar_servico_terceirizado(serv,'em_execucao','Fornecedor iniciou');perform public.transicionar_servico_terceirizado(serv,'retornado','Material retornou');perform public.transicionar_servico_terceirizado(serv,'aceito','Retorno aceito');
  failed:=false;begin perform public.transicionar_operacao_producao(op2,'em_execucao','Início antecipado');exception when raise_exception then failed:=true;end;if not failed then raise exception 'OP sucessora ignorou precedência';end if;
  perform public.transicionar_operacao_producao(op1,'preparacao','Preparação interna');perform public.transicionar_operacao_producao(op1,'em_execucao','Início interno');
  select status into st from public.ordens_fabricacao where id='70000000-0000-0000-0000-000000000015';if st<>'em_producao' then raise exception 'OF não entrou em produção';end if;
  ap0:=public.registrar_apontamento_producao(op1,aloc,t0,t0+interval '30 minutes',0,0,'Tempo de preparação','apt-prod-tempo');
  ap1:=public.registrar_apontamento_producao(op1,aloc,t0+interval '1 hour',t0+interval '2 hours',1,0,'Produção concluída','apt-prod-1');ap2:=public.registrar_apontamento_producao(op1,aloc,t0+interval '1 hour',t0+interval '2 hours',1,0,'Produção concluída','apt-prod-1');if ap1<>ap2 then raise exception 'Apontamento não foi idempotente';end if;
  failed:=false;begin perform public.registrar_apontamento_producao(op1,aloc,t0+interval '90 minutes',t0+interval '150 minutes',0,0,'Sobreposição','apt-sobreposto');exception when raise_exception then failed:=true;end;if not failed then raise exception 'Sobreposição de apontamento foi aceita';end if;
  perform public.transicionar_operacao_producao(op1,'inspecao','Enviar à inspeção');
  if to_regclass('public.inspecoes_qualidade') is null then perform public.transicionar_operacao_producao(op1,'concluida','Operação aprovada');else insp:=public.abrir_inspecao_qualidade('processo',null,op1,null,'Inspeção da operação','', 'insp-op-1');perform public.iniciar_inspecao_qualidade(insp,'Início');perform public.concluir_inspecao_qualidade(insp,'conforme','Conforme',null,null);perform public.registrar_liberacao_qualidade(insp,'liberado','Operação aprovada','lib-op-1');end if;
  perform public.transicionar_operacao_producao(op2,'em_execucao','Executar retorno');perform public.transicionar_operacao_producao(op2,'inspecao','Inspecionar serviço');
  if to_regclass('public.inspecoes_qualidade') is null then perform public.transicionar_operacao_producao(op2,'concluida','Serviço aprovado');else insp:=public.abrir_inspecao_qualidade('processo',null,op2,null,'Inspeção do serviço','', 'insp-op-2');perform public.iniciar_inspecao_qualidade(insp,'Início');perform public.concluir_inspecao_qualidade(insp,'conforme','Conforme',null,null);perform public.registrar_liberacao_qualidade(insp,'liberado','Serviço aprovado','lib-op-2');end if;
  select status into st from public.ordens_fabricacao where id='70000000-0000-0000-0000-000000000015';if st<>'finalizada' then raise exception 'OF não finalizou após todas as OPs';end if;
  select count(*) into c from public.operacao_producao_eventos where operacao_producao_id in(op1,op2);if c<>10 then raise exception 'Histórico das OPs incompleto: %',c;end if;
  select count(*) into c from public.servico_terceirizado_eventos where servico_terceirizado_id=serv;if c<>5 then raise exception 'Histórico do serviço incompleto: %',c;end if;
  failed:=false;begin update public.apontamentos_producao set quantidade_produzida=99 where id=ap1;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Apontamento aceitou alteração direta';end if;
end $flow$;
reset role;

set local role authenticated;select set_config('request.jwt.claim.sub','17000000-0000-0000-0000-000000000002',true);
do $tenant$ declare c int;begin select count(*) into c from public.operacoes_producao;if c<>0 then raise exception 'Tenant B visualizou OP A';end if;select count(*) into c from public.apontamentos_producao;if c<>0 then raise exception 'Tenant B visualizou apontamento A';end if;end $tenant$;
reset role;
rollback;
