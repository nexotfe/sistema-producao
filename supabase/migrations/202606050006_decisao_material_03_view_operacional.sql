-- NEXOTFE - Decisao Material - Parte 03
-- Visao operacional por projeto, OF e materia-prima.

create or replace view public.vw_decisao_material_of as
with ci as (
  select
    empresa_id,
    projeto_id,
    of_numero,
    materia_prima_id,
    unidade,
    sum(quantidade) as quantidade_consumo_interno,
    sum(custo_total_material) as custo_total_material,
    max(data_movimentacao) as ultima_data_ci
  from public.consumos_internos
  where ativo = true
    and deleted_at is null
  group by empresa_id, projeto_id, of_numero, materia_prima_id, unidade
),
rc as (
  select
    r.empresa_id,
    r.projeto_id,
    r.of_numero,
    i.materia_prima_id,
    i.unidade,
    sum(i.quantidade_necessaria) as quantidade_compra_externa,
    max(r.data_necessidade_material) as data_necessidade_material,
    max(r.status) as status_requisicao
  from public.requisicoes_compra r
  join public.requisicao_compra_itens i
    on i.requisicao_compra_id = r.id
  where r.ativo = true
    and r.deleted_at is null
    and i.ativo = true
    and i.deleted_at is null
  group by r.empresa_id, r.projeto_id, r.of_numero, i.materia_prima_id, i.unidade
)
select
  coalesce(ci.empresa_id, rc.empresa_id) as empresa_id,
  coalesce(ci.projeto_id, rc.projeto_id) as projeto_id,
  coalesce(ci.of_numero, rc.of_numero) as of_numero,
  coalesce(ci.materia_prima_id, rc.materia_prima_id) as materia_prima_id,
  mp.codigo as materia_prima_codigo,
  mp.descricao as materia_prima_descricao,
  coalesce(ci.unidade, rc.unidade) as unidade,
  coalesce(ci.quantidade_consumo_interno, 0) as quantidade_consumo_interno,
  coalesce(rc.quantidade_compra_externa, 0) as quantidade_compra_externa,
  coalesce(ci.quantidade_consumo_interno, 0)
    + coalesce(rc.quantidade_compra_externa, 0) as quantidade_total,
  coalesce(ci.custo_total_material, 0) as custo_total_material,
  rc.data_necessidade_material,
  ci.ultima_data_ci,
  rc.status_requisicao,
  case
    when coalesce(ci.quantidade_consumo_interno, 0) > 0
      and coalesce(rc.quantidade_compra_externa, 0) > 0
      then 'ci_parcial_compra_parcial'
    when coalesce(ci.quantidade_consumo_interno, 0) > 0 then 'ci_total'
    else 'compra_total'
  end as status_decisao
from ci
full join rc
  on rc.empresa_id = ci.empresa_id
  and rc.projeto_id = ci.projeto_id
  and rc.of_numero = ci.of_numero
  and rc.materia_prima_id = ci.materia_prima_id
left join public.materias_primas mp
  on mp.id = coalesce(ci.materia_prima_id, rc.materia_prima_id);
