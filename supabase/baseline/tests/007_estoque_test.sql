begin;

do $s$ declare t text; c int; begin
  foreach t in array array['locais_estoque','estoque_saldos','reservas_estoque','reserva_estoque_eventos','estoque_movimentacoes','consumos_materiais'] loop
    if to_regclass('public.'||t) is null or not exists(select 1 from pg_class where oid=to_regclass('public.'||t) and relrowsecurity) then raise exception 'Estrutura/RLS ausente em %',t; end if;
  end loop;
  select count(*) into c from pg_policies where schemaname='public' and tablename=any(array['locais_estoque','estoque_saldos','reservas_estoque','reserva_estoque_eventos','estoque_movimentacoes','consumos_materiais']);
  if c<>8 then raise exception 'Esperadas 8 policies de estoque; encontradas %',c; end if;
end $s$;

insert into auth.users(id,email) values
('15000000-0000-0000-0000-000000000001','estoque-a@test'),
('15000000-0000-0000-0000-000000000002','estoque-b@test');
insert into public.empresas(id,nome,slug) values
('25000000-0000-0000-0000-000000000001','Estoque A','estoque-a'),
('25000000-0000-0000-0000-000000000002','Estoque B','estoque-b');
insert into public.usuarios(id,auth_user_id,empresa_id,nome,email,papel,permissoes) values
('35000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','Estoque A','estoque-a@test','estoque',array['estoque.locais.gerenciar','estoque.ajustar','estoque.transferir','estoque.reservar','estoque.consumir']),
('35000000-0000-0000-0000-000000000002','15000000-0000-0000-0000-000000000002','25000000-0000-0000-0000-000000000002','Estoque B','estoque-b@test','estoque',array[]::text[]);

insert into public.clientes(id,empresa_id,nome,created_by) values('40000000-0000-0000-0000-000000000071','25000000-0000-0000-0000-000000000001','Cliente Estoque','15000000-0000-0000-0000-000000000001');
insert into public.projetos(id,empresa_id,cliente_id,numero_projeto,nome,tipo,status,created_by) values('40000000-0000-0000-0000-000000000072','25000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000071','P-EST-1','Projeto Estoque','fabricacao','aprovado','15000000-0000-0000-0000-000000000001');
insert into public.itens_industriais(id,empresa_id,pn,descricao,unidade,tipo,created_by) values('40000000-0000-0000-0000-000000000073','25000000-0000-0000-0000-000000000001','PN-EST','Produto Estoque','pc','produto','15000000-0000-0000-0000-000000000001');
insert into public.projeto_itens(id,empresa_id,projeto_id,item_industrial_id,quantidade,created_by) values('40000000-0000-0000-0000-000000000074','25000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000072','40000000-0000-0000-0000-000000000073',1,'15000000-0000-0000-0000-000000000001');
insert into public.grupos_tecnologias(id,empresa_id,codigo,descricao,created_by) values('46100000-0000-0000-0000-000000000071','25000000-0000-0000-0000-000000000001','TEC-EST','Tecnologia Estoque','15000000-0000-0000-0000-000000000001');
insert into public.tecnologias(id,empresa_id,grupo_tecnologia_id,codigo,descricao,unidade_planejamento,created_by) values('46200000-0000-0000-0000-000000000071','25000000-0000-0000-0000-000000000001','46100000-0000-0000-0000-000000000071','OP-EST','Operação Estoque','hora','15000000-0000-0000-0000-000000000001');
insert into public.materias_primas(id,empresa_id,codigo,descricao,unidade,created_by) values('40000000-0000-0000-0000-000000000075','25000000-0000-0000-0000-000000000001','MP-EST','Material Estoque','kg','15000000-0000-0000-0000-000000000001');
insert into public.boms(id,empresa_id,produto_id,versao,publicada_em,publicada_por,created_by) values('40000000-0000-0000-0000-000000000076','25000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000073','A',now(),'15000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000001');
insert into public.roteiros_fabricacao(id,empresa_id,produto_id,versao,status,created_by) values('40000000-0000-0000-0000-000000000077','25000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000073','A','rascunho','15000000-0000-0000-0000-000000000001');
insert into public.roteiro_materiais(id,empresa_id,roteiro_id,materia_prima_id,quantidade_unitaria,unidade,ordem,created_by) values('40000000-0000-0000-0000-000000000078','25000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000077','40000000-0000-0000-0000-000000000075',10,'kg',1,'15000000-0000-0000-0000-000000000001');
insert into public.roteiro_operacoes(id,empresa_id,roteiro_id,sequencia,descricao_operacional,tipo_operacao,tecnologia_id,tempo_previsto,unidade_tempo,created_by) values('40000000-0000-0000-0000-000000000084','25000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000077',10,'Operação de teste','interna','46200000-0000-0000-0000-000000000071',1,'hora','15000000-0000-0000-0000-000000000001');
update public.roteiros_fabricacao set status='ativo' where id='40000000-0000-0000-0000-000000000077';
insert into public.ordens_fabricacao(id,empresa_id,numero_of,projeto_id,projeto_item_id,produto_id,bom_id,roteiro_id,status,quantidade_planejada,unidade,idempotency_key,created_by) values('40000000-0000-0000-0000-000000000079','25000000-0000-0000-0000-000000000001','OF-EST-1','40000000-0000-0000-0000-000000000072','40000000-0000-0000-0000-000000000074','40000000-0000-0000-0000-000000000073','40000000-0000-0000-0000-000000000076','40000000-0000-0000-0000-000000000077','aguardando_material',1,'pc','fixture-est-1','15000000-0000-0000-0000-000000000001');
insert into public.necessidades_materiais(id,empresa_id,of_id,roteiro_id,roteiro_material_id,materia_prima_id,quantidade_unitaria_snapshot,quantidade_of_snapshot,quantidade_necessaria,unidade_snapshot,status,status_decisao,status_atendimento,versao_calculo,created_by) values('40000000-0000-0000-0000-000000000080','25000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000079','40000000-0000-0000-0000-000000000077','40000000-0000-0000-0000-000000000078','40000000-0000-0000-0000-000000000075',10,1,10,'kg','decisao_registrada','decidida','pendente',1,'15000000-0000-0000-0000-000000000001');
insert into public.decisoes_necessidade_material(id,empresa_id,necessidade_material_id,tipo_decisao,quantidade_estoque,quantidade_compra,revisao,idempotency_key,decidido_por) values('40000000-0000-0000-0000-000000000081','25000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000080','estoque',10,0,1,'dec-est-1','15000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000001',true);
insert into public.locais_estoque(id,empresa_id,codigo,nome,tipo,created_by) values('40000000-0000-0000-0000-000000000082',public.empresa_atual_id(),'ALM','Almoxarifado','almoxarifado',auth.uid());
insert into public.locais_estoque(id,empresa_id,local_pai_id,codigo,nome,tipo,created_by) values('40000000-0000-0000-0000-000000000083',public.empresa_atual_id(),'40000000-0000-0000-0000-000000000082','ALM-P1','Posição 1','posicao',auth.uid());

do $flow$ declare m1 uuid;m2 uuid;s uuid;r1 uuid;r1b uuid;rc uuid;r2 uuid;c1 uuid;c1b uuid;corr uuid;qf numeric;qr numeric;ql numeric;st text;cnt int;failed boolean:=false; begin
  begin update public.locais_estoque set local_pai_id='40000000-0000-0000-0000-000000000083' where id='40000000-0000-0000-0000-000000000082'; exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'Ciclo de locais foi aceito'; end if;

  m1:=public.ajustar_estoque('40000000-0000-0000-0000-000000000075','40000000-0000-0000-0000-000000000082','ajuste_entrada',20,'Carga inicial','aj-est-1');
  m2:=public.ajustar_estoque('40000000-0000-0000-0000-000000000075','40000000-0000-0000-0000-000000000082','ajuste_entrada',20,'Carga inicial','aj-est-1');
  if m1<>m2 then raise exception 'Ajuste idempotente criou movimento diferente'; end if;
  select id,quantidade_fisica,quantidade_reservada,quantidade_livre into s,qf,qr,ql from public.estoque_saldos where materia_prima_id='40000000-0000-0000-0000-000000000075' and local_estoque_id='40000000-0000-0000-0000-000000000082';
  if qf<>20 or qr<>0 or ql<>20 then raise exception 'Saldo inicial incorreto: %, %, %',qf,qr,ql; end if;

  r1:=public.reservar_estoque('40000000-0000-0000-0000-000000000081',s,10,'res-est-1');
  r1b:=public.reservar_estoque('40000000-0000-0000-0000-000000000081',s,10,'res-est-1');
  if r1<>r1b then raise exception 'Reserva idempotente criou registro diferente'; end if;
  select quantidade_fisica,quantidade_reservada,quantidade_livre into qf,qr,ql from public.estoque_saldos where id=s;
  if qf<>20 or qr<>10 or ql<>10 then raise exception 'Reserva alterou saldo físico ou livre incorretamente'; end if;
  select status into st from public.necessidades_materiais where id='40000000-0000-0000-0000-000000000080';
  if st<>'atendida' then raise exception 'Necessidade totalmente reservada não foi atendida'; end if;
  perform public.liberar_reserva_estoque(r1,'Replanejamento');
  select quantidade_fisica,quantidade_reservada,quantidade_livre into qf,qr,ql from public.estoque_saldos where id=s;
  if qf<>20 or qr<>0 or ql<>20 then raise exception 'Liberação movimentou saldo físico ou não liberou compromisso'; end if;

  rc:=public.reservar_estoque('40000000-0000-0000-0000-000000000081',s,10,'res-est-cancelar');
  perform public.cancelar_reserva_estoque(rc,'Cancelamento do planejamento');
  select quantidade_fisica,quantidade_reservada,quantidade_livre into qf,qr,ql from public.estoque_saldos where id=s;
  if qf<>20 or qr<>0 or ql<>20 then raise exception 'Cancelamento movimentou saldo físico ou não liberou compromisso'; end if;

  r2:=public.reservar_estoque('40000000-0000-0000-0000-000000000081',s,10,'res-est-2');
  failed:=false; begin perform public.reservar_estoque('40000000-0000-0000-0000-000000000081',s,1,'res-est-excesso'); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'Reserva acima da necessidade foi aceita'; end if;
  c1:=public.consumir_reserva_estoque(r2,4,'Consumo parcial','cons-est-1');
  c1b:=public.consumir_reserva_estoque(r2,4,'Consumo parcial','cons-est-1');
  if c1<>c1b then raise exception 'Consumo idempotente criou registro diferente'; end if;
  select quantidade_fisica,quantidade_reservada,quantidade_livre into qf,qr,ql from public.estoque_saldos where id=s;
  if qf<>16 or qr<>6 or ql<>10 then raise exception 'Consumo parcial incorreto: %, %, %',qf,qr,ql; end if;
  failed:=false; begin perform public.liberar_reserva_estoque(r2,'Tentativa indevida'); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'Reserva parcialmente consumida foi liberada'; end if;
  perform public.consumir_reserva_estoque(r2,6,'Consumo final','cons-est-2');
  select quantidade_fisica,quantidade_reservada,quantidade_livre into qf,qr,ql from public.estoque_saldos where id=s;
  if qf<>10 or qr<>0 or ql<>10 then raise exception 'Consumo final incorreto: %, %, %',qf,qr,ql; end if;
  select status into st from public.reservas_estoque where id=r2;if st<>'consumida' then raise exception 'Reserva não foi encerrada como consumida'; end if;
  select count(*) into cnt from public.estoque_movimentacoes where reserva_estoque_id=r2 and tipo='consumo';if cnt<>2 then raise exception 'Razão física não contém os dois consumos'; end if;

  corr:=public.transferir_estoque('40000000-0000-0000-0000-000000000075','40000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000083',3,'Reposição posição','trans-est-1');
  select count(*) into cnt from public.estoque_movimentacoes where correlacao_id=corr;if cnt<>2 then raise exception 'Transferência não produziu par de movimentos'; end if;
  select quantidade_fisica into qf from public.estoque_saldos where materia_prima_id='40000000-0000-0000-0000-000000000075' and local_estoque_id='40000000-0000-0000-0000-000000000082';if qf<>7 then raise exception 'Origem da transferência incorreta';end if;
  select quantidade_fisica into qf from public.estoque_saldos where materia_prima_id='40000000-0000-0000-0000-000000000075' and local_estoque_id='40000000-0000-0000-0000-000000000083';if qf<>3 then raise exception 'Destino da transferência incorreto';end if;

  failed:=false;begin update public.estoque_movimentacoes set motivo='Alterado' where id=m1;exception when insufficient_privilege then failed:=true;end;
  if not failed then raise exception 'Movimento físico aceitou alteração direta';end if;
end $flow$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000002',true);
do $tenant$ declare c int;begin
  select count(*) into c from public.estoque_saldos;if c<>0 then raise exception 'Tenant B visualizou saldo do tenant A';end if;
  select count(*) into c from public.reservas_estoque;if c<>0 then raise exception 'Tenant B visualizou reserva do tenant A';end if;
  select count(*) into c from public.estoque_movimentacoes;if c<>0 then raise exception 'Tenant B visualizou movimentos do tenant A';end if;
end $tenant$;
reset role;

rollback;
