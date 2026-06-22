-- Testes estruturais e comportamentais do módulo 005_engenharia.sql.

begin;

do $structure$
declare
  v_tables text[]:=array['itens_industriais','materias_primas','revisoes_itens','documentos_tecnicos','projeto_itens','boms','bom_itens','roteiros_fabricacao','roteiro_materiais','roteiro_operacoes','roteiro_operacao_materiais'];
  v_table text; v_count integer;
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.'||v_table) is null then raise exception 'Tabela % ausente',v_table; end if;
    if not exists(select 1 from pg_class where oid=to_regclass('public.'||v_table) and relrowsecurity) then raise exception 'RLS ausente em %',v_table; end if;
  end loop;
  select count(*) into v_count from pg_policies where schemaname='public' and tablename=any(v_tables);
  if v_count<>33 then raise exception 'Esperadas 33 policies; encontradas %',v_count; end if;
  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('publicar_bom','ativar_roteiro_fabricacao','aprovar_revisao_item')
     and p.prosecdef and exists(select 1 from unnest(coalesce(p.proconfig,array[]::text[])) c where c like 'search_path=%');
  if v_count<>3 then raise exception 'RPCs privilegiadas de Engenharia fora do contrato'; end if;
end $structure$;

insert into auth.users(id,email) values
('13000000-0000-0000-0000-000000000001','eng-a@nexotfe.test'),
('13000000-0000-0000-0000-000000000002','eng-b@nexotfe.test');
insert into public.empresas(id,nome,slug) values
('23000000-0000-0000-0000-000000000001','Engenharia A','engenharia-a'),
('23000000-0000-0000-0000-000000000002','Engenharia B','engenharia-b');
insert into public.usuarios(id,auth_user_id,empresa_id,nome,email,papel,permissoes) values
('33000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','Eng A','eng-a@nexotfe.test','engenharia',array['engenharia.itens.gerenciar','engenharia.materiais.gerenciar','engenharia.revisoes.gerenciar','engenharia.revisoes.aprovar','engenharia.documentos.gerenciar','engenharia.projetos.gerenciar','engenharia.boms.gerenciar','engenharia.boms.publicar','engenharia.roteiros.gerenciar','engenharia.roteiros.publicar']),
('33000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000002','Eng B','eng-b@nexotfe.test','engenharia',array['engenharia.itens.gerenciar','engenharia.materiais.gerenciar','engenharia.revisoes.gerenciar','engenharia.revisoes.aprovar','engenharia.boms.gerenciar','engenharia.boms.publicar','engenharia.roteiros.gerenciar','engenharia.roteiros.publicar']);

insert into public.clientes(id,empresa_id,nome,created_by) values
('43000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','Cliente Eng A','13000000-0000-0000-0000-000000000001');
insert into public.projetos(id,empresa_id,cliente_id,numero_projeto,nome,tipo,status,created_by) values
('44000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001','ENG-001','Projeto Eng','fabricacao','aprovado','13000000-0000-0000-0000-000000000001');
insert into public.grupos_tecnologias(id,empresa_id,codigo,descricao,created_by) values
('45000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','USINAGEM','Usinagem','13000000-0000-0000-0000-000000000001');
insert into public.tecnologias(id,empresa_id,grupo_tecnologia_id,codigo,descricao,unidade_planejamento,created_by) values
('46000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001','CNC','Usinagem CNC','hora','13000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);

insert into public.itens_industriais(id,empresa_id,pn,descricao,unidade,tipo,created_by) values
('47000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','PN-100','Produto 100','peca','produto',auth.uid()),
('47000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000001','PN-101','Componente 101','peca','componente',auth.uid());
insert into public.materias_primas(id,empresa_id,codigo,descricao,unidade,created_by) values
('48000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','ACO-01','Aço','kg',auth.uid());
insert into public.revisoes_itens(id,empresa_id,item_industrial_id,codigo_revisao,created_by) values
('49000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001','A',auth.uid());
select public.aprovar_revisao_item('49000000-0000-0000-0000-000000000001');
insert into public.projeto_itens(empresa_id,projeto_id,item_industrial_id,revisao_item_id,quantidade,created_by) values
('23000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001','49000000-0000-0000-0000-000000000001',2,auth.uid());
insert into public.boms(id,empresa_id,produto_id,revisao_item_id,versao,created_by) values
('50000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001','49000000-0000-0000-0000-000000000001','A',auth.uid());
insert into public.bom_itens(empresa_id,bom_id,materia_prima_id,quantidade,unidade,ordem,created_by) values
('23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001',2.5,'kg',1,auth.uid());

do $bom$
declare v_failed boolean:=false;
begin
  begin
    insert into public.bom_itens(empresa_id,bom_id,materia_prima_id,quantidade,unidade,ordem,created_by) values
    ('23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001',1,'metro',2,auth.uid());
  exception when raise_exception then v_failed:=true; end;
  if not v_failed then raise exception 'BOM aceitou unidade divergente'; end if;
  perform public.publicar_bom('50000000-0000-0000-0000-000000000001');
  v_failed:=false;
  begin
    insert into public.bom_itens(empresa_id,bom_id,componente_produto_id,quantidade,unidade,ordem,created_by) values
    ('23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000002',1,'peca',2,auth.uid());
  exception when raise_exception then v_failed:=true; end;
  if not v_failed then raise exception 'BOM publicada aceitou novo item'; end if;
end $bom$;

insert into public.roteiros_fabricacao(id,empresa_id,produto_id,revisao_item_id,versao,created_by) values
('51000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001','49000000-0000-0000-0000-000000000001','A',auth.uid());
insert into public.roteiro_materiais(id,empresa_id,roteiro_id,materia_prima_id,quantidade_unitaria,unidade,ordem,created_by) values
('52000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001',2.5,'kg',1,auth.uid());
insert into public.roteiro_operacoes(id,empresa_id,roteiro_id,sequencia,descricao_operacional,tipo_operacao,tecnologia_id,tempo_previsto,unidade_tempo,created_by) values
('53000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001',10,'Usinar','interna','46000000-0000-0000-0000-000000000001',1.5,'hora',auth.uid());
insert into public.roteiro_operacao_materiais(empresa_id,roteiro_id,roteiro_operacao_id,roteiro_material_id,created_by) values
('23000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001',auth.uid());
select public.ativar_roteiro_fabricacao('51000000-0000-0000-0000-000000000001');

do $route$
declare v_status text; v_failed boolean:=false; v_count integer;
begin
  select status into v_status from public.roteiros_fabricacao where id='51000000-0000-0000-0000-000000000001';
  if v_status<>'ativo' then raise exception 'Roteiro não foi ativado'; end if;
  begin update public.roteiro_operacoes set tempo_previsto=2 where id='53000000-0000-0000-0000-000000000001';
  exception when raise_exception then v_failed:=true; end;
  if not v_failed then raise exception 'Roteiro ativo aceitou alteração estrutural'; end if;
  select count(*) into v_count from public.itens_industriais;
  if v_count<>2 then raise exception 'Isolamento da Engenharia falhou'; end if;
end $route$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000002',true);
do $tenant_b$
declare v_count integer;
begin
  select count(*) into v_count from public.itens_industriais;
  if v_count<>0 then raise exception 'Empresa B visualizou PN da Empresa A'; end if;
end $tenant_b$;
reset role;
rollback;
