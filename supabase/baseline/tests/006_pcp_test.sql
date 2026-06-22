begin;
do $s$ declare t text; c int; begin
  foreach t in array array['ordens_fabricacao','of_estado_eventos','dependencias_of','programacoes_of','necessidades_materiais','decisoes_necessidade_material'] loop
    if to_regclass('public.'||t) is null or not exists(select 1 from pg_class where oid=to_regclass('public.'||t) and relrowsecurity) then raise exception 'Estrutura/RLS ausente em %',t; end if;
  end loop;
  select count(*) into c from pg_policies where schemaname='public' and tablename=any(array['ordens_fabricacao','of_estado_eventos','dependencias_of','programacoes_of','necessidades_materiais','decisoes_necessidade_material']);
  if c<>8 then raise exception 'Esperadas 8 policies PCP; encontradas %',c; end if;
end $s$;

insert into auth.users(id,email) values('14000000-0000-0000-0000-000000000001','pcp-a@test'),('14000000-0000-0000-0000-000000000002','pcp-b@test');
insert into public.empresas(id,nome,slug) values('24000000-0000-0000-0000-000000000001','PCP A','pcp-a'),('24000000-0000-0000-0000-000000000002','PCP B','pcp-b');
insert into public.usuarios(id,auth_user_id,empresa_id,nome,email,papel,permissoes) values
('34000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','PCP A','pcp-a@test','pcp',array['admin.numeracao.gerar','pcp.of.criar','pcp.necessidades.gerar','pcp.of.transicionar','pcp.programacao.gerenciar','pcp.dependencias.gerenciar']),
('34000000-0000-0000-0000-000000000002','14000000-0000-0000-0000-000000000002','24000000-0000-0000-0000-000000000002','PCP B','pcp-b@test','pcp',array['pcp.of.transicionar']);
insert into public.numeracao_configuracoes(empresa_id,entidade,prefixo,usar_ano,tamanho_sequencia,created_by) values('24000000-0000-0000-0000-000000000001','of','OF-',true,4,'14000000-0000-0000-0000-000000000001');
insert into public.clientes(id,empresa_id,nome,created_by) values('41000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','Cliente','14000000-0000-0000-0000-000000000001');
insert into public.projetos(id,empresa_id,cliente_id,numero_projeto,nome,tipo,status,created_by) values('42000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','P-1','Projeto','fabricacao','aprovado','14000000-0000-0000-0000-000000000001');
insert into public.itens_industriais(id,empresa_id,pn,descricao,unidade,tipo,created_by) values('43000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','PN-PCP','Produto','peca','produto','14000000-0000-0000-0000-000000000001');
insert into public.revisoes_itens(id,empresa_id,item_industrial_id,codigo_revisao,aprovada_em,aprovada_por,created_by) values('44000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001','A',now(),'14000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001');
insert into public.projeto_itens(id,empresa_id,projeto_id,item_industrial_id,revisao_item_id,quantidade,created_by) values('45000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001',10,'14000000-0000-0000-0000-000000000001');
insert into public.grupos_tecnologias(id,empresa_id,codigo,descricao,created_by) values('46100000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','TEC-PCP','Tecnologia PCP','14000000-0000-0000-0000-000000000001');
insert into public.tecnologias(id,empresa_id,grupo_tecnologia_id,codigo,descricao,unidade_planejamento,created_by) values('46200000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','46100000-0000-0000-0000-000000000001','OP-PCP','Operação PCP','hora','14000000-0000-0000-0000-000000000001');
insert into public.materias_primas(id,empresa_id,codigo,descricao,unidade,created_by) values('46000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','MP','Material','kg','14000000-0000-0000-0000-000000000001');
insert into public.boms(id,empresa_id,produto_id,revisao_item_id,versao,publicada_em,publicada_por,created_by) values('47000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001','A',now(),'14000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001');
insert into public.roteiros_fabricacao(id,empresa_id,produto_id,revisao_item_id,versao,status,created_by) values('48000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001','A','rascunho','14000000-0000-0000-0000-000000000001');
insert into public.roteiro_materiais(id,empresa_id,roteiro_id,materia_prima_id,quantidade_unitaria,unidade,ordem,created_by) values('49000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001','46000000-0000-0000-0000-000000000001',2.5,'kg',1,'14000000-0000-0000-0000-000000000001');
insert into public.roteiro_operacoes(id,empresa_id,roteiro_id,sequencia,descricao_operacional,tipo_operacao,tecnologia_id,tempo_previsto,unidade_tempo,created_by) values('50000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001',10,'Operar','interna','46200000-0000-0000-0000-000000000001',1,'hora','14000000-0000-0000-0000-000000000001');
insert into public.roteiro_operacao_materiais(id,empresa_id,roteiro_id,roteiro_operacao_id,roteiro_material_id,created_by) values('51000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','49000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001');
update public.roteiros_fabricacao set status='ativo' where id='48000000-0000-0000-0000-000000000001';

set local role authenticated; select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
do $flow$ declare a uuid;b uuid;a2 uuid;q numeric;c int;failed boolean:=false; begin
  a:=public.criar_of_com_necessidades('45000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001',4,current_date,current_date+5,'normal',null,'of-a-1');
  a2:=public.criar_of_com_necessidades('45000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001',4,current_date,current_date+5,'normal',null,'of-a-1');
  if a<>a2 then raise exception 'Idempotência da OF falhou';end if;
  select quantidade_necessaria into q from public.necessidades_materiais where of_id=a;
  if q<>10 then raise exception 'Necessidade esperada 10; encontrada %',q;end if;
  select count(*) into c from public.decisoes_necessidade_material where necessidade_material_id in(select id from public.necessidades_materiais where of_id=a);
  if c<>0 then raise exception 'Criação da OF decidiu material automaticamente';end if;
  perform public.transicionar_of(a,'aguardando_material','Liberada ao PCP');
  begin perform public.transicionar_of(a,'pronta_programacao','Indevido'); exception when raise_exception then failed:=true;end;
  if not failed then raise exception 'OF ficou pronta com necessidade pendente';end if;
  b:=public.criar_of_com_necessidades('45000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001',1,current_date,current_date+5,'normal',null,'of-a-2');
  insert into public.dependencias_of(empresa_id,of_predecessora_id,of_sucessora_id,created_by) values(public.empresa_atual_id(),a,b,auth.uid());
  failed:=false;begin insert into public.dependencias_of(empresa_id,of_predecessora_id,of_sucessora_id,created_by) values(public.empresa_atual_id(),b,a,auth.uid());exception when raise_exception then failed:=true;end;
  if not failed then raise exception 'Ciclo entre OFs foi aceito';end if;
end $flow$;
reset role;

update public.necessidades_materiais set status='atendida',status_decisao='decidida',status_atendimento='atendido' where of_id=(select id from public.ordens_fabricacao where idempotency_key='of-a-1');
set local role authenticated;select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
do $schedule$ declare o uuid;p uuid;s text;begin
 select id into o from public.ordens_fabricacao where idempotency_key='of-a-1';perform public.transicionar_of(o,'pronta_programacao','Materiais atendidos');
 p:=public.programar_of(o,now()+interval '1 day',now()+interval '2 days','Programação','prog-a-1');
 if p is null then raise exception 'Programação não criada';end if;select status into s from public.ordens_fabricacao where id=o;if s<>'programada' then raise exception 'OF não programada';end if;
end $schedule$;
reset role;
set local role authenticated;select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000002',true);
do $tenant$ declare c int;begin select count(*) into c from public.ordens_fabricacao;if c<>0 then raise exception 'Tenant B visualizou OF A';end if;end $tenant$;
reset role;rollback;
