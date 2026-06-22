begin;

do $s$ declare t text;c int;begin
  foreach t in array array['fornecedores','requisicoes_compra','requisicao_compra_itens','requisicao_compra_eventos','planejamentos_compra','planejamento_compra_origens','pedidos_compra','pedido_compra_itens','pedido_compra_eventos','recebimentos','recebimento_itens','recebimento_eventos'] loop
    if to_regclass('public.'||t) is null or not exists(select 1 from pg_class where oid=to_regclass('public.'||t) and relrowsecurity) then raise exception 'Estrutura/RLS ausente em %',t;end if;
  end loop;
  select count(*) into c from pg_policies where schemaname='public' and tablename=any(array['fornecedores','requisicoes_compra','requisicao_compra_itens','requisicao_compra_eventos','planejamentos_compra','planejamento_compra_origens','pedidos_compra','pedido_compra_itens','pedido_compra_eventos','recebimentos','recebimento_itens','recebimento_eventos']);
  if c<>14 then raise exception 'Esperadas 14 policies de suprimentos; encontradas %',c;end if;
end $s$;

insert into auth.users(id,email) values('16000000-0000-0000-0000-000000000001','suprimentos-a@test'),('16000000-0000-0000-0000-000000000002','suprimentos-b@test');
insert into public.empresas(id,nome,slug) values('26000000-0000-0000-0000-000000000001','Suprimentos A','suprimentos-a'),('26000000-0000-0000-0000-000000000002','Suprimentos B','suprimentos-b');
insert into public.usuarios(id,auth_user_id,empresa_id,nome,email,papel,permissoes) values
('36000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001','Suprimentos A','suprimentos-a@test','suprimentos',array['admin.numeracao.gerar','estoque.locais.gerenciar','estoque.ajustar','estoque.reservar','pcp.decisao.registrar','suprimentos.fornecedores.gerenciar','suprimentos.requisicao.transicionar','suprimentos.planejamento.consolidar','suprimentos.pedido.emitir','suprimentos.pedido.encerrar','suprimentos.recebimento.registrar','suprimentos.recebimento.transicionar','qualidade.inspecoes.gerenciar','qualidade.liberacoes.decidir']),
('36000000-0000-0000-0000-000000000002','16000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000002','Suprimentos B','suprimentos-b@test','suprimentos',array[]::text[]);
insert into public.numeracao_configuracoes(empresa_id,entidade,prefixo,usar_ano,tamanho_sequencia,created_by) values
('26000000-0000-0000-0000-000000000001','requisicao_compra','RC-',true,4,'16000000-0000-0000-0000-000000000001'),
('26000000-0000-0000-0000-000000000001','planejamento_compra','PLC-',true,4,'16000000-0000-0000-0000-000000000001'),
('26000000-0000-0000-0000-000000000001','pedido_compra','PC-',true,4,'16000000-0000-0000-0000-000000000001'),
('26000000-0000-0000-0000-000000000001','recebimento','REC-',true,4,'16000000-0000-0000-0000-000000000001');
insert into public.numeracao_configuracoes(empresa_id,entidade,prefixo,usar_ano,tamanho_sequencia,created_by) values('26000000-0000-0000-0000-000000000001','inspecao','INSP-',true,4,'16000000-0000-0000-0000-000000000001');

insert into public.clientes(id,empresa_id,nome,created_by) values('60000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001','Cliente Suprimentos','16000000-0000-0000-0000-000000000001');
insert into public.projetos(id,empresa_id,cliente_id,numero_projeto,nome,tipo,status,created_by) values('60000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','P-SUP-1','Projeto Suprimentos','fabricacao','aprovado','16000000-0000-0000-0000-000000000001');
insert into public.itens_industriais(id,empresa_id,pn,descricao,unidade,tipo,created_by) values('60000000-0000-0000-0000-000000000003','26000000-0000-0000-0000-000000000001','PN-SUP','Produto Suprimentos','pc','produto','16000000-0000-0000-0000-000000000001');
insert into public.projeto_itens(id,empresa_id,projeto_id,item_industrial_id,quantidade,created_by) values('60000000-0000-0000-0000-000000000004','26000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000003',1,'16000000-0000-0000-0000-000000000001');
insert into public.grupos_tecnologias(id,empresa_id,codigo,descricao,created_by) values('61000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001','TEC-SUP','Tecnologia Suprimentos','16000000-0000-0000-0000-000000000001');
insert into public.tecnologias(id,empresa_id,grupo_tecnologia_id,codigo,descricao,unidade_planejamento,created_by) values('61000000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','OP-SUP','Operação Suprimentos','hora','16000000-0000-0000-0000-000000000001');
insert into public.materias_primas(id,empresa_id,codigo,descricao,unidade,familia,tipo_grade,bitola,created_by) values('60000000-0000-0000-0000-000000000005','26000000-0000-0000-0000-000000000001','MP-SUP','Aço redondo','kg','Aço carbono','SAE 1045','Ø50','16000000-0000-0000-0000-000000000001');
insert into public.boms(id,empresa_id,produto_id,versao,publicada_em,publicada_por,created_by) values('60000000-0000-0000-0000-000000000006','26000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000003','A',now(),'16000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001');
insert into public.roteiros_fabricacao(id,empresa_id,produto_id,versao,status,created_by) values('60000000-0000-0000-0000-000000000007','26000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000003','A','rascunho','16000000-0000-0000-0000-000000000001');
insert into public.roteiro_materiais(id,empresa_id,roteiro_id,materia_prima_id,quantidade_unitaria,unidade,ordem,created_by) values('60000000-0000-0000-0000-000000000008','26000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000007','60000000-0000-0000-0000-000000000005',10,'kg',1,'16000000-0000-0000-0000-000000000001');
insert into public.roteiro_operacoes(id,empresa_id,roteiro_id,sequencia,descricao_operacional,tipo_operacao,tecnologia_id,tempo_previsto,unidade_tempo,created_by) values('60000000-0000-0000-0000-000000000009','26000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000007',10,'Operação','interna','61000000-0000-0000-0000-000000000002',1,'hora','16000000-0000-0000-0000-000000000001');
update public.roteiros_fabricacao set status='ativo' where id='60000000-0000-0000-0000-000000000007';
insert into public.ordens_fabricacao(id,empresa_id,numero_of,projeto_id,projeto_item_id,produto_id,bom_id,roteiro_id,status,quantidade_planejada,unidade,idempotency_key,created_by) values('60000000-0000-0000-0000-000000000010','26000000-0000-0000-0000-000000000001','OF-SUP-1','60000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000004','60000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000006','60000000-0000-0000-0000-000000000007','aguardando_material',1,'pc','fixture-sup-1','16000000-0000-0000-0000-000000000001');
insert into public.necessidades_materiais(id,empresa_id,of_id,roteiro_id,roteiro_material_id,materia_prima_id,quantidade_unitaria_snapshot,quantidade_of_snapshot,quantidade_necessaria,unidade_snapshot,data_necessidade,status,status_decisao,status_atendimento,versao_calculo,created_by) values('60000000-0000-0000-0000-000000000011','26000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000010','60000000-0000-0000-0000-000000000007','60000000-0000-0000-0000-000000000008','60000000-0000-0000-0000-000000000005',10,1,10,'kg',current_date+10,'definir','pendente','pendente',1,'16000000-0000-0000-0000-000000000001');
insert into public.ordens_fabricacao(id,empresa_id,numero_of,projeto_id,projeto_item_id,produto_id,bom_id,roteiro_id,status,quantidade_planejada,unidade,idempotency_key,created_by) values('60000000-0000-0000-0000-000000000016','26000000-0000-0000-0000-000000000001','OF-SUP-2','60000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000004','60000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000006','60000000-0000-0000-0000-000000000007','aguardando_material',1,'pc','fixture-sup-2','16000000-0000-0000-0000-000000000001');
insert into public.necessidades_materiais(id,empresa_id,of_id,roteiro_id,roteiro_material_id,materia_prima_id,quantidade_unitaria_snapshot,quantidade_of_snapshot,quantidade_necessaria,unidade_snapshot,data_necessidade,status,status_decisao,status_atendimento,versao_calculo,created_by) values('60000000-0000-0000-0000-000000000017','26000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000016','60000000-0000-0000-0000-000000000007','60000000-0000-0000-0000-000000000008','60000000-0000-0000-0000-000000000005',2,1,2,'kg',current_date+12,'definir','pendente','pendente',1,'16000000-0000-0000-0000-000000000001');

set local role authenticated;select set_config('request.jwt.claim.sub','16000000-0000-0000-0000-000000000001',true);
insert into public.locais_estoque(id,empresa_id,codigo,nome,tipo,created_by) values('60000000-0000-0000-0000-000000000012',public.empresa_atual_id(),'ALM-SUP','Almoxarifado','almoxarifado',auth.uid());
insert into public.fornecedores(id,empresa_id,razao_social,documento,tipo,situacao,created_by) values('60000000-0000-0000-0000-000000000013',public.empresa_atual_id(),'Fornecedor Homologado','12345678000100','materia_prima','homologado',auth.uid());

do $flow$ declare saldo uuid;dec1 uuid;dec2 uuid;dec_old uuid;dec_new uuid;req_item uuid;req uuid;plan uuid;plan2 uuid;pedido uuid;pedido2 uuid;pedido_item uuid;rec1 uuid;rec1b uuid;rec2 uuid;rec_item uuid;insp uuid;qf numeric;qr numeric;ql numeric;q numeric;st text;c int;rev int;failed boolean:=false;begin
  dec_old:=public.registrar_decisao_pcp('60000000-0000-0000-0000-000000000017','compra',0,2,null,'Primeira decisão','dec-rev-1');
  perform public.cancelar_decisao_pcp(dec_old,'Revisão antes do planejamento');
  dec_new:=public.registrar_decisao_pcp('60000000-0000-0000-0000-000000000017','compra',0,2,null,'Decisão revisada','dec-rev-2');
  select revisao into rev from public.decisoes_necessidade_material where id=dec_new;if rev<>2 then raise exception 'Revisão da decisão não preservou histórico';end if;
  if not exists(select 1 from public.decisoes_necessidade_material where id=dec_old and cancelada_em is not null) then raise exception 'Decisão anterior não permaneceu cancelada no histórico';end if;
  perform public.ajustar_estoque('60000000-0000-0000-0000-000000000005','60000000-0000-0000-0000-000000000012','ajuste_entrada',4,'Saldo inicial','aj-sup-1');
  select id into saldo from public.estoque_saldos where materia_prima_id='60000000-0000-0000-0000-000000000005' and local_estoque_id='60000000-0000-0000-0000-000000000012';
  dec1:=public.registrar_decisao_pcp('60000000-0000-0000-0000-000000000011','estoque_compra',4,6,saldo,'Atendimento combinado','dec-sup-1');
  dec2:=public.registrar_decisao_pcp('60000000-0000-0000-0000-000000000011','estoque_compra',4,6,saldo,'Atendimento combinado','dec-sup-1');
  if dec1<>dec2 then raise exception 'Decisão PCP não foi idempotente';end if;
  select quantidade_fisica,quantidade_reservada,quantidade_livre into qf,qr,ql from public.estoque_saldos where id=saldo;
  if qf<>4 or qr<>4 or ql<>0 then raise exception 'Decisão combinada alterou saldo incorretamente';end if;
  select i.id,i.requisicao_compra_id,i.quantidade into req_item,req,q from public.requisicao_compra_itens i where i.decisao_necessidade_material_id=dec1;
  if q<>6 then raise exception 'Requisição não preservou parcela de compra';end if;
  select status into st from public.necessidades_materiais where id='60000000-0000-0000-0000-000000000011';if st<>'atendimento_parcial' then raise exception 'Necessidade combinada não ficou parcial';end if;

  plan:=public.consolidar_planejamento_compra(array[req_item],8,'lote_minimo','Lote comercial','plan-sup-1');
  plan2:=public.consolidar_planejamento_compra(array[req_item],8,'lote_minimo','Lote comercial','plan-sup-1');if plan<>plan2 then raise exception 'Planejamento não foi idempotente';end if;
  select quantidade_necessaria_total,sobra_prevista into q,ql from public.planejamentos_compra where id=plan;if q<>6 or ql<>2 then raise exception 'Consolidação/lote mínimo incorretos';end if;
  perform public.transicionar_requisicao_compra(req,'aprovada','Cotação aprovada');
  pedido:=public.emitir_pedido_compra(plan,'60000000-0000-0000-0000-000000000013',12.50,current_date+5,'BRL','Pedido de teste','ped-sup-1');
  pedido2:=public.emitir_pedido_compra(plan,'60000000-0000-0000-0000-000000000013',12.50,current_date+5,'BRL','Pedido de teste','ped-sup-1');if pedido<>pedido2 then raise exception 'Pedido não foi idempotente';end if;
  select id into pedido_item from public.pedido_compra_itens where pedido_compra_id=pedido;

  rec1:=public.registrar_recebimento_compra(pedido_item,3,3,'60000000-0000-0000-0000-000000000012','NF-001',false,'Parcial 1','rec-sup-1');
  rec1b:=public.registrar_recebimento_compra(pedido_item,3,3,'60000000-0000-0000-0000-000000000012','NF-001',false,'Parcial 1','rec-sup-1');if rec1<>rec1b then raise exception 'Recebimento não foi idempotente';end if;
  select quantidade_fisica into qf from public.estoque_saldos where id=saldo;if qf<>4 then raise exception 'Material entrou no estoque antes da liberação';end if;
  perform public.transicionar_recebimento(rec1,'recebimento_fisico','Conferência física');
  perform public.transicionar_recebimento(rec1,'conferencia_documental','NF conferida');
  perform public.transicionar_recebimento(rec1,'liberado','Material liberado');
  select quantidade_fisica,quantidade_reservada,quantidade_livre into qf,qr,ql from public.estoque_saldos where id=saldo;
  if qf<>7 or qr<>7 or ql<>0 then raise exception 'Primeiro recebimento incorreto: %, %, %',qf,qr,ql;end if;
  select status into st from public.pedidos_compra where id=pedido;if st<>'parcialmente_recebido' then raise exception 'Pedido não ficou parcialmente recebido';end if;

  rec2:=public.registrar_recebimento_compra(pedido_item,5,5,'60000000-0000-0000-0000-000000000012','NF-002',true,'Parcial 2','rec-sup-2');
  perform public.transicionar_recebimento(rec2,'recebimento_fisico','Conferência física');
  perform public.transicionar_recebimento(rec2,'conferencia_documental','NF conferida');
  failed:=false;begin perform public.transicionar_recebimento(rec2,'liberado','Pular inspeção');exception when raise_exception then failed:=true;end;if not failed then raise exception 'Recebimento obrigatório pulou inspeção';end if;
  perform public.transicionar_recebimento(rec2,'inspecao','Inspeção aprovada');
  if to_regclass('public.inspecoes_qualidade') is null then perform public.transicionar_recebimento(rec2,'liberado','Qualidade liberou');else
    select id into rec_item from public.recebimento_itens where recebimento_id=rec2;
    insp:=public.abrir_inspecao_qualidade('recebimento',rec_item,null,null,'Conferência de recebimento','Inspeção integrada','insp-rec-sup');
    perform public.iniciar_inspecao_qualidade(insp,'Início');perform public.concluir_inspecao_qualidade(insp,'conforme','Conforme',null,null);perform public.registrar_liberacao_qualidade(insp,'liberado','Recebimento aprovado','lib-rec-sup');
  end if;
  select quantidade_fisica,quantidade_reservada,quantidade_livre into qf,qr,ql from public.estoque_saldos where id=saldo;
  if qf<>12 or qr<>10 or ql<>2 then raise exception 'Saldo final incorreto: %, %, %',qf,qr,ql;end if;
  select status into st from public.necessidades_materiais where id='60000000-0000-0000-0000-000000000011';if st<>'atendida' then raise exception 'Necessidade não foi atendida após recebimento';end if;
  select status into st from public.pedidos_compra where id=pedido;if st<>'recebido' then raise exception 'Pedido não ficou recebido';end if;
  perform public.encerrar_pedido_compra(pedido,'encerrar','Processo concluído');
  select count(*) into c from public.estoque_movimentacoes where origem_tipo='recebimento_item' and tipo='recebimento';if c<>2 then raise exception 'Razão física não contém dois recebimentos';end if;
  select count(*) into c from public.recebimento_eventos where recebimento_id in(rec1,rec2);if c<>9 then raise exception 'Histórico de recebimento incompleto: %',c;end if;
  select count(*) into c from public.requisicao_compra_eventos where requisicao_compra_id=req;if c<>4 then raise exception 'Histórico da requisição incompleto: %',c;end if;
  select count(*) into c from public.pedido_compra_eventos where pedido_compra_id=pedido;if c<>4 then raise exception 'Histórico do pedido incompleto: %',c;end if;
end $flow$;
reset role;

set local role authenticated;select set_config('request.jwt.claim.sub','16000000-0000-0000-0000-000000000002',true);
do $tenant$ declare c int;begin
  select count(*) into c from public.requisicoes_compra;if c<>0 then raise exception 'Tenant B visualizou requisição A';end if;
  select count(*) into c from public.pedidos_compra;if c<>0 then raise exception 'Tenant B visualizou pedido A';end if;
  select count(*) into c from public.recebimentos;if c<>0 then raise exception 'Tenant B visualizou recebimento A';end if;
end $tenant$;
reset role;

rollback;
