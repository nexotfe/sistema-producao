-- Custo Estimado real no Resumo Operacional do Projeto - regra de
-- Industrialização: para projetos com tipo='industrializacao', o custo
-- estimado exclui matéria-prima (o cliente já fornece o material; a
-- NEXOTFE só cobra engenharia/mão de obra/terceiros/logística), inclusive
-- a matéria-prima que vem de dentro de subconjuntos, recursivamente.
--
-- Em vez de duplicar a lógica de soma em outro lugar (ex: no frontend),
-- adicionamos um parâmetro p_excluir_materia_prima à própria
-- calcular_custo_bom (default false, então todo caller existente - Roteiro,
-- Produto - continua com o comportamento atual). Quando true, a função:
-- 1) não soma a matéria-prima direta do bom;
-- 2) propaga o mesmo flag na chamada recursiva de subconjunto, então o
--    total do bom-filho já vem sem matéria-prima, e a soma do pai também
--    fica sem ela.
--
-- CREATE OR REPLACE não permite adicionar parâmetro a uma function
-- existente sem recriar (mudaria a assinatura) - drop explícito evita
-- ficar com duas versões sobrepostas (2 args e 3 args) e uma chamada
-- ambígua via RPC.
drop function if exists public.calcular_custo_bom(uuid, integer);

create or replace function public.calcular_custo_bom(
  p_bom_id uuid,
  p_profundidade integer default 0,
  p_excluir_materia_prima boolean default false
)
returns table (categoria text, valor numeric)
language plpgsql
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_materia_prima numeric := 0;
  v_subconjunto numeric := 0;
  v_engenharia numeric := 0;
  v_mao_de_obra numeric := 0;
  v_terceiros numeric := 0;
  v_logistica numeric := 0;
  v_item record;
  v_bom_filho_id uuid;
  v_custo_filho numeric;
begin
  if p_profundidade > 20 then
    raise exception 'Profundidade maxima de estrutura (BOM) excedida no bom % - possivel referencia circular.', p_bom_id;
  end if;

  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if not exists (
    select 1 from public.boms
     where id = p_bom_id and empresa_id = v_empresa_id and deleted_at is null
  ) then
    raise exception 'Bom nao encontrado para a empresa atual.';
  end if;

  -- Materia-prima direta: pulada por completo quando p_excluir_materia_prima
  -- (regra de Industrializacao). Converte a quantidade consumida
  -- (bi.unidade) para a unidade de preco da materia-prima (mp.unidade)
  -- antes de multiplicar por custo_referencia. Linhas sem custo_referencia
  -- preenchido contam 0.
  if not p_excluir_materia_prima then
    select coalesce(sum(
      public.converter_para_unidade_base(bi.quantidade, bi.unidade, mp.unidade)
        * mp.custo_referencia
    ), 0)
      into v_materia_prima
    from public.bom_itens bi
    join public.materias_primas mp on mp.id = bi.materia_prima_id
    where bi.bom_id = p_bom_id
      and bi.componente_tipo = 'materia_prima'
      and bi.ativo = true
      and bi.deleted_at is null
      and mp.custo_referencia is not null;
  end if;

  -- Subconjuntos: custo recursivo do bom do produto-filho. Prefere o bom
  -- 'ativo'; sem nenhum ativo, cai para o mais recente (mesma regra do
  -- carregarBom em useRoteiro.ts). Propaga p_excluir_materia_prima para
  -- que a matéria-prima do filho também seja excluída quando aplicável.
  for v_item in
    select bi.quantidade, bi.componente_produto_id
    from public.bom_itens bi
    where bi.bom_id = p_bom_id
      and bi.componente_tipo = 'subconjunto'
      and bi.ativo = true
      and bi.deleted_at is null
  loop
    select b.id into v_bom_filho_id
    from public.boms b
    where b.produto_id = v_item.componente_produto_id
      and b.empresa_id = v_empresa_id
      and b.deleted_at is null
    order by (b.status = 'ativo') desc, b.created_at desc
    limit 1;

    if v_bom_filho_id is not null then
      select t.valor into v_custo_filho
      from public.calcular_custo_bom(v_bom_filho_id, p_profundidade + 1, p_excluir_materia_prima) t
      where t.categoria = 'total';

      v_subconjunto := v_subconjunto + v_item.quantidade * coalesce(v_custo_filho, 0);
    end if;
  end loop;

  -- Engenharia e mao de obra: separadas por tecnologias_aplicadas.tipo
  select
    coalesce(sum((bo.tempo_estimado_minutos / 60.0) * ta.valor_hora)
      filter (where ta.tipo = 'engenharia'), 0),
    coalesce(sum((bo.tempo_estimado_minutos / 60.0) * ta.valor_hora)
      filter (where ta.tipo <> 'engenharia'), 0)
    into v_engenharia, v_mao_de_obra
  from public.bom_operacoes bo
  join public.tecnologias_aplicadas ta on ta.id = bo.tecnologia_aplicada_id
  where bo.bom_id = p_bom_id
    and bo.ativo = true
    and bo.deleted_at is null;

  -- Terceiros
  select coalesce(sum(bst.custo_estimado), 0)
    into v_terceiros
  from public.bom_servicos_terceiros bst
  where bst.bom_id = p_bom_id
    and bst.ativo = true
    and bst.deleted_at is null;

  -- Logistica
  select coalesce(sum(btr.custo_estimado), 0)
    into v_logistica
  from public.bom_transportes btr
  where btr.bom_id = p_bom_id
    and btr.ativo = true
    and btr.deleted_at is null;

  return query
    select 'materia_prima'::text, v_materia_prima
    union all select 'subconjunto'::text, v_subconjunto
    union all select 'engenharia'::text, v_engenharia
    union all select 'mao_de_obra'::text, v_mao_de_obra
    union all select 'terceiros'::text, v_terceiros
    union all select 'logistica'::text, v_logistica
    union all select 'total'::text,
      v_materia_prima + v_subconjunto + v_engenharia + v_mao_de_obra + v_terceiros + v_logistica;
end;
$function$;

comment on function public.calcular_custo_bom(uuid, integer, boolean) is
  'Custo industrial de um bom por categoria (materia_prima, subconjunto, engenharia, mao_de_obra, terceiros, logistica, total). Materia-prima converte a unidade de consumo para a unidade de preco antes de multiplicar. Subconjunto e recursivo (custo do bom do produto-filho x quantidade); bom do filho preferido = ativo, senao o mais recente (mesma regra de useRoteiro.ts). p_excluir_materia_prima (default false) zera a materia-prima direta e propaga a exclusao para subconjuntos - usado no Custo Estimado de projetos tipo=industrializacao.';

grant execute on function public.calcular_custo_bom(uuid, integer, boolean) to anon, authenticated;
