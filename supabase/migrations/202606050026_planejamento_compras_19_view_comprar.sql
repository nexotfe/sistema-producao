-- NEXOTFE - Planejamento de Compras - Parte 19
-- Exibe o campo Comprar na view operacional.

create or replace view public.vw_planejamento_compras_operacional as
select
  p.id as planejamento_compra_id,
  p.empresa_id,
  p.numero_planejamento,
  p.materia_prima_id,
  mp.codigo as materia_prima_codigo,
  mp.descricao as materia_prima_descricao,
  p.descricao_compra,
  p.material_base,
  p.forma_material,
  p.bitola_ou_espessura,
  p.chave_industrial_compra,
  p.modo_planejamento,
  p.criterio_calculo,
  p.unidade_necessidade,
  p.quantidade_necessaria_total,
  p.unidade_compra,
  p.quantidade_planejada_compra,
  p.sobra_prevista,
  p.status,
  count(o.id) filter (where o.incluir_no_planejamento = true) as origens_incluidas,
  count(o.id) filter (where o.incluir_no_planejamento = false) as origens_excluidas,
  sum(o.quantidade_necessaria) filter (
    where o.incluir_no_planejamento = true
  ) as quantidade_origens_incluidas,
  string_agg(distinct o.of_numero, ', ') filter (
    where o.incluir_no_planejamento = true and o.of_numero is not null
  ) as ofs_incluidas,
  max(o.created_at) as ultima_origem_em,
  p.created_at,
  p.updated_at,
  p.quantidade_necessaria_total as soma_total,
  p.quantidade_planejada_compra as sugestao_compra,
  p.comprar_descricao
from public.planejamentos_compra p
left join public.materias_primas mp on mp.id = p.materia_prima_id
left join public.planejamento_compra_origens o
  on o.planejamento_compra_id = p.id
where p.ativo = true
  and p.deleted_at is null
group by
  p.id,
  p.empresa_id,
  p.numero_planejamento,
  p.materia_prima_id,
  mp.codigo,
  mp.descricao,
  p.descricao_compra,
  p.material_base,
  p.forma_material,
  p.bitola_ou_espessura,
  p.chave_industrial_compra,
  p.modo_planejamento,
  p.criterio_calculo,
  p.unidade_necessidade,
  p.quantidade_necessaria_total,
  p.unidade_compra,
  p.quantidade_planejada_compra,
  p.sobra_prevista,
  p.status,
  p.created_at,
  p.updated_at,
  p.comprar_descricao;
