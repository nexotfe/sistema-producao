-- NEXOTFE 1.0 - Baseline SQL
-- Modulo 012: projecoes de leitura com security invoker
-- Dependencias: 001..011

begin;

create view public.vw_projetos_operacional with (security_invoker=true) as
select p.empresa_id,p.id as projeto_id,p.numero_projeto,p.nome,p.status,p.prioridade,c.nome as cliente_nome,count(distinct pi.id) as itens,count(distinct ofa.id) as ordens_fabricacao
from public.projetos p
join public.clientes c on c.empresa_id=p.empresa_id and c.id=p.cliente_id
left join public.projeto_itens pi on pi.empresa_id=p.empresa_id and pi.projeto_id=p.id and pi.deleted_at is null
left join public.ordens_fabricacao ofa on ofa.empresa_id=p.empresa_id and ofa.projeto_id=p.id and ofa.deleted_at is null
where p.deleted_at is null
group by p.empresa_id,p.id,p.numero_projeto,p.nome,p.status,p.prioridade,c.nome;

create view public.vw_engenharia_produtos with (security_invoker=true) as
select i.empresa_id,i.id as produto_id,i.pn,i.descricao,i.unidade,i.tipo,i.ativo,
  exists(select 1 from public.boms b where b.empresa_id=i.empresa_id and b.produto_id=i.id and b.publicada_em is not null and b.inativada_em is null and b.deleted_at is null) as possui_bom_publicada,
  exists(select 1 from public.roteiros_fabricacao r where r.empresa_id=i.empresa_id and r.produto_id=i.id and r.status='ativo' and r.deleted_at is null) as possui_roteiro_ativo
from public.itens_industriais i
where i.deleted_at is null;

create view public.vw_of_operacional with (security_invoker=true) as
select ofa.empresa_id,ofa.id as of_id,ofa.numero_of,ofa.status,ofa.quantidade_planejada,ofa.unidade,ofa.projeto_id,p.numero_projeto,i.pn as produto_pn,
  count(distinct nm.id) as necessidades,count(distinct op.id) as operacoes
from public.ordens_fabricacao ofa
join public.projetos p on p.empresa_id=ofa.empresa_id and p.id=ofa.projeto_id
join public.itens_industriais i on i.empresa_id=ofa.empresa_id and i.id=ofa.produto_id
left join public.necessidades_materiais nm on nm.empresa_id=ofa.empresa_id and nm.of_id=ofa.id
left join public.operacoes_producao op on op.empresa_id=ofa.empresa_id and op.of_id=ofa.id
where ofa.deleted_at is null
group by ofa.empresa_id,ofa.id,ofa.numero_of,ofa.status,ofa.quantidade_planejada,ofa.unidade,ofa.projeto_id,p.numero_projeto,i.pn;

create view public.vw_necessidades_materiais_operacional with (security_invoker=true) as
select nm.empresa_id,nm.id as necessidade_id,nm.of_id,ofa.numero_of,mp.codigo as material_codigo,mp.descricao as material_descricao,nm.quantidade_necessaria,nm.unidade_snapshot,nm.status,nm.status_decisao,nm.status_atendimento
from public.necessidades_materiais nm
join public.ordens_fabricacao ofa on ofa.empresa_id=nm.empresa_id and ofa.id=nm.of_id
join public.materias_primas mp on mp.empresa_id=nm.empresa_id and mp.id=nm.materia_prima_id;

create view public.vw_decisoes_pcp_operacional with (security_invoker=true) as
select d.empresa_id,d.id as decisao_id,d.necessidade_material_id,nm.of_id,d.tipo_decisao,d.quantidade_estoque,d.quantidade_compra,d.revisao,d.cancelada_em
from public.decisoes_necessidade_material d
join public.necessidades_materiais nm on nm.empresa_id=d.empresa_id and nm.id=d.necessidade_material_id;

create view public.vw_estoque_saldos_operacional with (security_invoker=true) as
select s.empresa_id,s.id as estoque_saldo_id,mp.codigo as material_codigo,mp.descricao as material_descricao,l.codigo as local_codigo,l.nome as local_nome,s.unidade,s.quantidade_fisica,s.quantidade_reservada,s.quantidade_livre
from public.estoque_saldos s
join public.materias_primas mp on mp.empresa_id=s.empresa_id and mp.id=s.materia_prima_id
join public.locais_estoque l on l.empresa_id=s.empresa_id and l.id=s.local_estoque_id;

create view public.vw_reservas_estoque_operacional with (security_invoker=true) as
select r.empresa_id,r.id as reserva_id,r.of_id,ofa.numero_of,mp.codigo as material_codigo,r.quantidade_reservada,r.quantidade_consumida,r.quantidade_liberada,r.unidade,r.status
from public.reservas_estoque r
join public.ordens_fabricacao ofa on ofa.empresa_id=r.empresa_id and ofa.id=r.of_id
join public.materias_primas mp on mp.empresa_id=r.empresa_id and mp.id=r.materia_prima_id;

create view public.vw_requisicoes_compra_operacional with (security_invoker=true) as
select r.empresa_id,r.id as requisicao_id,r.numero_requisicao,r.origem,r.status,r.prioridade,r.projeto_id,r.of_id,count(i.id) as itens
from public.requisicoes_compra r
left join public.requisicao_compra_itens i on i.empresa_id=r.empresa_id and i.requisicao_compra_id=r.id
group by r.empresa_id,r.id,r.numero_requisicao,r.origem,r.status,r.prioridade,r.projeto_id,r.of_id;

create view public.vw_planejamento_compras_operacional with (security_invoker=true) as
select p.empresa_id,p.id as planejamento_id,p.numero_planejamento,p.materia_prima_id,mp.codigo as material_codigo,
  case when p.cancelado_em is not null then 'cancelado' when p.convertido_em is not null then 'convertido' else 'aberto' end as status,
  p.quantidade_necessaria_total,p.quantidade_planejada_compra,p.unidade_necessidade,p.estrategia,count(o.id) as origens
from public.planejamentos_compra p
join public.materias_primas mp on mp.empresa_id=p.empresa_id and mp.id=p.materia_prima_id
left join public.planejamento_compra_origens o on o.empresa_id=p.empresa_id and o.planejamento_compra_id=p.id
group by p.empresa_id,p.id,p.numero_planejamento,p.materia_prima_id,mp.codigo,p.cancelado_em,p.convertido_em,p.quantidade_necessaria_total,p.quantidade_planejada_compra,p.unidade_necessidade,p.estrategia;

create view public.vw_pedidos_compra_operacional with (security_invoker=true) as
select p.empresa_id,p.id as pedido_id,p.numero_pedido,p.status,f.razao_social as fornecedor_nome,p.data_emissao,p.data_prevista_entrega,count(i.id) as itens
from public.pedidos_compra p
join public.fornecedores f on f.empresa_id=p.empresa_id and f.id=p.fornecedor_id
left join public.pedido_compra_itens i on i.empresa_id=p.empresa_id and i.pedido_compra_id=p.id
group by p.empresa_id,p.id,p.numero_pedido,p.status,f.razao_social,p.data_emissao,p.data_prevista_entrega;

create view public.vw_recebimentos_operacional with (security_invoker=true) as
select r.empresa_id,r.id as recebimento_id,r.numero_recebimento,r.status,r.pedido_compra_id,r.exige_inspecao,sum(i.quantidade_recebida) as quantidade_recebida,sum(i.quantidade_aceita) as quantidade_aceita
from public.recebimentos r
left join public.recebimento_itens i on i.empresa_id=r.empresa_id and i.recebimento_id=r.id
group by r.empresa_id,r.id,r.numero_recebimento,r.status,r.pedido_compra_id,r.exige_inspecao;

create view public.vw_producao_operacional with (security_invoker=true) as
select op.empresa_id,op.id as operacao_id,op.numero_op,op.of_id,ofa.numero_of,op.sequencia_snapshot,op.descricao_snapshot,op.status,op.quantidade_planejada_snapshot,
  coalesce(sum(a.quantidade_produzida),0) as quantidade_produzida
from public.operacoes_producao op
join public.ordens_fabricacao ofa on ofa.empresa_id=op.empresa_id and ofa.id=op.of_id
left join public.apontamentos_producao a on a.empresa_id=op.empresa_id and a.operacao_producao_id=op.id
group by op.empresa_id,op.id,op.numero_op,op.of_id,ofa.numero_of,op.sequencia_snapshot,op.descricao_snapshot,op.status,op.quantidade_planejada_snapshot;

create view public.vw_apontamentos_producao_operacional with (security_invoker=true) as
select a.empresa_id,a.id as apontamento_id,a.operacao_producao_id,op.numero_op,a.inicio_em,a.fim_em,a.duracao_minutos,a.quantidade_produzida,a.quantidade_perdida,a.idempotency_key
from public.apontamentos_producao a
join public.operacoes_producao op on op.empresa_id=a.empresa_id and op.id=a.operacao_producao_id;

create view public.vw_qualidade_operacional with (security_invoker=true) as
select i.empresa_id,i.id as inspecao_id,i.numero_inspecao,i.tipo,i.status,i.resultado,i.recebimento_item_id,i.operacao_producao_id,i.of_id,count(nc.id) as nao_conformidades
from public.inspecoes_qualidade i
left join public.nao_conformidades nc on nc.empresa_id=i.empresa_id and nc.inspecao_qualidade_id=i.id
group by i.empresa_id,i.id,i.numero_inspecao,i.tipo,i.status,i.resultado,i.recebimento_item_id,i.operacao_producao_id,i.of_id;

create view public.vw_expedicao_operacional with (security_invoker=true) as
select pa.empresa_id,pa.id as produto_acabado_id,pa.numero_produto_acabado,pa.status,pa.projeto_id,p.numero_projeto,pa.of_id,ofa.numero_of,pa.quantidade_total,pa.quantidade_separada,pa.quantidade_expedida,pa.quantidade_entregue,pa.unidade
from public.produtos_acabados pa
join public.projetos p on p.empresa_id=pa.empresa_id and p.id=pa.projeto_id
join public.ordens_fabricacao ofa on ofa.empresa_id=pa.empresa_id and ofa.id=pa.of_id;

create view public.vw_rastreabilidade_projeto with (security_invoker=true) as
select p.empresa_id,p.id as projeto_id,p.numero_projeto,p.status as projeto_status,ofa.id as of_id,ofa.numero_of,ofa.status as of_status,pa.id as produto_acabado_id,pa.status as produto_acabado_status,e.id as entrega_id,e.entregue_em
from public.projetos p
left join public.ordens_fabricacao ofa on ofa.empresa_id=p.empresa_id and ofa.projeto_id=p.id and ofa.deleted_at is null
left join public.produtos_acabados pa on pa.empresa_id=p.empresa_id and pa.of_id=ofa.id
left join public.expedicao_itens ei on ei.empresa_id=p.empresa_id and ei.produto_acabado_id=pa.id
left join public.entregas e on e.empresa_id=p.empresa_id and e.expedicao_id=ei.expedicao_id
where p.deleted_at is null;

revoke all on public.vw_projetos_operacional,public.vw_engenharia_produtos,public.vw_of_operacional,public.vw_necessidades_materiais_operacional,public.vw_decisoes_pcp_operacional,public.vw_estoque_saldos_operacional,public.vw_reservas_estoque_operacional,public.vw_requisicoes_compra_operacional,public.vw_planejamento_compras_operacional,public.vw_pedidos_compra_operacional,public.vw_recebimentos_operacional,public.vw_producao_operacional,public.vw_apontamentos_producao_operacional,public.vw_qualidade_operacional,public.vw_expedicao_operacional,public.vw_rastreabilidade_projeto from public,anon;
grant select on public.vw_projetos_operacional,public.vw_engenharia_produtos,public.vw_of_operacional,public.vw_necessidades_materiais_operacional,public.vw_decisoes_pcp_operacional,public.vw_estoque_saldos_operacional,public.vw_reservas_estoque_operacional,public.vw_requisicoes_compra_operacional,public.vw_planejamento_compras_operacional,public.vw_pedidos_compra_operacional,public.vw_recebimentos_operacional,public.vw_producao_operacional,public.vw_apontamentos_producao_operacional,public.vw_qualidade_operacional,public.vw_expedicao_operacional,public.vw_rastreabilidade_projeto to authenticated,service_role;

commit;
