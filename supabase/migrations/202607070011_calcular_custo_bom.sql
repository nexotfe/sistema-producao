-- PASSO 4 (Fase B Roteiro) - function de calculo de custo industrial de
-- um BOM, com detalhamento por categoria (alimenta direto o card "Resumo
-- de Custos Industriais", sem calculo adicional no frontend).
--
-- Decisoes confirmadas com o usuario antes de implementar:
-- - Subconjunto (bom_itens.componente_tipo='subconjunto'): custo
--   RECURSIVO completo - busca o bom com status='ativo' mais recente do
--   componente_produto_id e chama esta mesma function nele, multiplica
--   pela quantidade. Se o produto-filho nao tiver bom ativo, contribui 0
--   (nao quebra - mesmo padrao ja usado no resto do projeto: dado
--   ausente vira 0, nao erro).
-- - Engenharia e Mao de obra ficam SEPARADAS (nao uma linha so), via
--   tecnologias_aplicadas.tipo = 'engenharia' vs os demais tipos - unico
--   sinal hoje que distingue as duas (ver levantamento anterior; e o
--   motivo de tecnologia_aplicada_id ter virado NOT NULL no Passo 2).
-- - Retorno em tabela (categoria, valor) com 7 linhas: materia_prima,
--   subconjunto, engenharia, mao_de_obra, terceiros, logistica, total.
--   materia_prima e subconjunto ficam separados (nao fundidos numa linha
--   so) para nao perder rastreabilidade - o card do frontend pode somar
--   as duas se quiser mostrar so 5 linhas como o mock.
--
-- Guarda de profundidade (20 niveis) contra referencia circular entre
-- boms (A tem B como subconjunto, B tem A como subconjunto).
--
-- Linhas de bom_itens sem materias_primas.custo_referencia preenchido
-- contribuem 0 para materia_prima (nao erro) - custo ainda nao cadastrado
-- e um estado esperado, nao uma falha.

create or replace function public.calcular_custo_bom(
  p_bom_id uuid,
  p_profundidade integer default 0
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

  -- Materia-prima direta (linhas sem custo_referencia preenchido contam 0)
  select coalesce(sum(bi.quantidade * mp.custo_referencia), 0)
    into v_materia_prima
  from public.bom_itens bi
  join public.materias_primas mp on mp.id = bi.materia_prima_id
  where bi.bom_id = p_bom_id
    and bi.componente_tipo = 'materia_prima'
    and bi.ativo = true
    and bi.deleted_at is null;

  -- Subconjuntos: custo recursivo do bom ativo mais recente do produto-filho
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
      and b.status = 'ativo'
      and b.deleted_at is null
    order by b.created_at desc
    limit 1;

    if v_bom_filho_id is not null then
      select t.valor into v_custo_filho
      from public.calcular_custo_bom(v_bom_filho_id, p_profundidade + 1) t
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

comment on function public.calcular_custo_bom(uuid, integer) is
  'Custo industrial de um bom por categoria (materia_prima, subconjunto, engenharia, mao_de_obra, terceiros, logistica, total). Subconjunto e recursivo (custo do bom ativo do produto-filho x quantidade).';

grant execute on function public.calcular_custo_bom(uuid, integer) to anon, authenticated;
