begin;

-- Resumo Produtivo do Orcamento: uma unica funcao autoritativa por
-- projeto, chamada uma unica vez (nao uma RPC recursiva por item em
-- loop no cliente - isso criava um N+1 previsivel). Substitui a
-- agregacao client-side em useOrcamento.ts que so somava
-- bom_operacoes do BOM de topo de cada item - nunca descia em
-- subconjuntos (bom_itens.componente_tipo='subconjunto'), subestimando
-- o tempo de qualquer estrutura com mais de um nivel.
--
-- Reaproveita o nucleo recursivo ja validado
-- lista_tecnica_nos_alcancaveis (mesma protecao de ciclo, mesmo
-- quantidade_acumulada = produto das quantidades no caminho, com
-- projeto_itens.quantidade como quantidade da raiz). Resolve o BOM de
-- cada no via resolver_bom_ativo_produto (o mesmo caminho usado pelos
-- gatilhos de protecao de ciclo), que respeita ativo=true e
-- deleted_at is null - ao contrario da resolucao ad-hoc que
-- useOrcamento.ts fazia antes (so filtrava deleted_at).
--
-- NAO reaproveita gerar_lista_tecnica_projeto nem sua validacao de
-- materia-prima/"estrutura de fabricacao incompleta": o Resumo
-- Produtivo e sobre tempo/operacoes, nao materiais, e a falta de
-- materia-prima nao pode bloquear o calculo de tempo - inclusive em
-- projetos de industrializacao, onde a materia-prima e do cliente mas
-- a mao-de-obra/tempo de fabricacao continuam sendo do fabricante.
--
-- Decisoes de negocio desta entrega:
--   1. Sem produtividade aplicada: calcular_produtividade_efetiva NAO
--      e chamada aqui - os minutos retornados sao sempre o tempo-
--      padrao de bom_operacoes.tempo_estimado_minutos x quantidade
--      acumulada, sem nenhum fator de eficiencia.
--   2. Operacoes sem recurso_produtivo_id vinculado (ainda nao
--      revinculadas manualmente) aparecem como uma linha propria com
--      recurso_produtivo_id null - nunca descartadas da soma (GROUP BY
--      trata null como grupo proprio).
--   3. Nao existe parametro p_excluir_operacoes (ao contrario de
--      calcular_custo_bom/p_excluir_materia_prima): tempo de operacao
--      sempre conta, mesmo em projetos de industrializacao - esta
--      funcao nem consulta projetos.tipo_projeto.
--   4. Produto de um item sem roteiro resolvivel, com ciclo detectado,
--      ou com profundidade maxima de estrutura excedida (>21 niveis -
--      mesmo teto de lista_tecnica_nos_alcancaveis) NUNCA aborta a
--      funcao inteira (ao contrario de gerar_lista_tecnica_projeto) -
--      o item so nao tem garantia de estar completo e volta marcado em
--      "itens" (estrutura_ok=false, motivo). Profundidade excedida e
--      tratada como incompletude (nao da pra garantir que nao existe
--      mais estrutura alem do teto), nunca como erro fatal.
--   5. O retorno tem um "estado" explicito no nivel do projeto:
--      'calculado' (todo item processado por completo) ou
--      'incompleto' (existe pelo menos um item sem roteiro, com ciclo,
--      ou com profundidade excedida). O chamador NUNCA deve apresentar
--      os minutos parciais como se fossem o total real quando
--      estado='incompleto' - a UI trata isso como aviso forte, nao
--      como rodape de "Total das operacoes".
--   6. Projeto sem natureza definida, nao encontrado ou nao visivel
--      ainda bloqueia a funcao inteira (nao ha "resumo produtivo
--      parcial de um projeto que nao existe") - so a incompletude POR
--      ITEM de estrutura e tolerada, nunca a ausencia do proprio
--      projeto. Ao contrario de gerar_lista_tecnica_projeto, esta
--      funcao nao valida tipo_projeto - roda igual para qualquer
--      natureza.
--   7. Quantidade de cada item de projeto precisa ser > 0 e nao-NaN -
--      validado explicitamente (o CHECK quantidade > 0 de projeto_itens
--      nao barra 'NaN'::numeric, que o Postgres trata como maior que
--      qualquer valor nao-NaN para fins de comparacao/ordenacao).
--   8. Ordenacao deterministica: "recursos" ordenado por codigo do
--      recurso (nulls last - "sem recurso" sempre por ultimo, igual ao
--      comportamento anterior no cliente); "itens" ordenado por codigo
--      do produto. Sem depender de ordem arbitraria de retorno do
--      banco (mesmo cuidado de resolver_bom_ativo_produto).
--   9. Estrutura PRODUTIVA incompleta (o que esta funcao mede) NAO e' a
--      mesma coisa que estrutura de MATERIAIS incompleta (o que
--      gerar_lista_tecnica_projeto mede). Um item pode ter roteiro
--      resolvivel e operacoes reais cadastradas, mas nenhuma materia-
--      prima ativa vinculada - nesse caso a Lista Tecnica e a aprovacao
--      da Simulacao Comercial o consideram incompleto (falta material),
--      mas o Resumo Produtivo o considera calculado (o tempo/hora-
--      maquina e' real e conhecido, independente de material). Validado
--      com dado real em producao: projeto 260010 (produto
--      ZTESTE-SIMCAP-002) tem BOM resolvivel e 7200 min reais em
--      FCNC-003, porem nenhuma materia-prima ativa - retorna
--      corretamente estado='calculado' aqui. Esta funcao NUNCA deve
--      usar ausencia de materia-prima como motivo de "incompleto".
--
-- Seguranca: SECURITY INVOKER (roda sob RLS de quem chama - nenhuma
-- elevacao de privilegio) e search_path fixado em 'public' (protege
-- contra sequestro de funcao via search_path de sessao - mesmo padrao
-- ja usado em outras funcoes deste projeto). Empresa sempre obtida via
-- empresa_atual_id() (sessao autenticada) - nenhum parametro livre de
-- empresa_id aceito pela funcao. ACL: EXECUTE revogado de public/anon,
-- concedido soh a authenticated. Nenhum DML (somente SELECT/leitura).
-- Nao substitui nem redefine nenhuma funcao existente - nome e tipos
-- sao novos.

create type public.resumo_produtivo_recurso as (
  recurso_produtivo_id uuid,
  recurso_codigo text,
  recurso_nome text,
  minutos numeric
);

create type public.resumo_produtivo_item_status as (
  projeto_item_id uuid,
  produto_id uuid,
  produto_codigo text,
  estrutura_ok boolean,
  motivo text
);

create type public.resumo_produtivo_projeto_resultado as (
  estado text,
  mensagem text,
  recursos public.resumo_produtivo_recurso[],
  itens public.resumo_produtivo_item_status[]
);

create or replace function public.calcular_resumo_produtivo_projeto(
  p_projeto_id uuid
) returns public.resumo_produtivo_projeto_resultado
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_recursos public.resumo_produtivo_recurso[];
  v_itens public.resumo_produtivo_item_status[];
  v_tem_item_incompleto boolean;
  v_estado text;
  v_mensagem text;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual não encontrada.';
  end if;

  if not exists (
    select 1 from public.projetos
     where id = p_projeto_id
       and empresa_id = v_empresa_id
       and deleted_at is null
  ) then
    raise exception 'Não é possível calcular o resumo produtivo: projeto não encontrado ou não está visível.';
  end if;

  if exists (
    select 1
    from public.projeto_itens pi
    where pi.projeto_id = p_projeto_id
      and pi.empresa_id = v_empresa_id
      and pi.ativo = true
      and pi.deleted_at is null
      and (
        pi.quantidade is null
        or pi.quantidade <= 0
        or pi.quantidade = 'NaN'::numeric
      )
  ) then
    raise exception 'Não é possível calcular o resumo produtivo: item do projeto com quantidade inválida.';
  end if;

  with itens as (
    select
      pi.id as projeto_item_id,
      pi.produto_id,
      pi.quantidade,
      ii.codigo as produto_codigo
    from public.projeto_itens pi
    join public.itens_industriais ii
      on ii.id = pi.produto_id and ii.empresa_id = v_empresa_id
    where pi.projeto_id = p_projeto_id
      and pi.empresa_id = v_empresa_id
      and pi.ativo = true
      and pi.deleted_at is null
  ),
  nos as (
    select
      i.projeto_item_id,
      i.produto_id,
      i.produto_codigo,
      n.profundidade,
      n.quantidade_acumulada,
      n.bom_resolvido_id,
      n.tem_bom,
      n.ciclo
    from itens i
    cross join lateral public.lista_tecnica_nos_alcancaveis(i.produto_id, i.quantidade) n
  ),
  status_item as (
    select
      projeto_item_id,
      produto_id,
      produto_codigo,
      coalesce(bool_or(tem_bom) filter (where profundidade = 0), false) as raiz_tem_bom,
      coalesce(bool_or(ciclo), false) as tem_ciclo,
      coalesce(bool_or(profundidade = 21 and tem_bom), false) as tem_profundidade_excedida
    from nos
    group by projeto_item_id, produto_id, produto_codigo
  ),
  itens_status as (
    select
      projeto_item_id,
      produto_id,
      produto_codigo,
      (raiz_tem_bom and not tem_ciclo and not tem_profundidade_excedida) as estrutura_ok,
      case
        when not raiz_tem_bom then 'sem_roteiro'
        when tem_ciclo then 'ciclo'
        when tem_profundidade_excedida then 'profundidade_excedida'
        else null
      end as motivo
    from status_item
  ),
  minutos as (
    select
      bo.recurso_produtivo_id,
      sum(bo.tempo_estimado_minutos * n.quantidade_acumulada) as minutos
    from nos n
    join public.bom_operacoes bo
      on bo.bom_id = n.bom_resolvido_id
     and bo.empresa_id = v_empresa_id
     and bo.ativo = true
     and bo.deleted_at is null
    where n.tem_bom
      and not n.ciclo
    group by bo.recurso_produtivo_id
  ),
  recursos_agregados as (
    select
      m.recurso_produtivo_id,
      rp.codigo as recurso_codigo,
      rp.nome as recurso_nome,
      m.minutos
    from minutos m
    left join public.recursos_produtivos rp on rp.id = m.recurso_produtivo_id
  )
  select
    coalesce(
      (select array_agg(
        row(recurso_produtivo_id, recurso_codigo, recurso_nome, minutos)
          ::public.resumo_produtivo_recurso
        order by recurso_codigo nulls last, recurso_produtivo_id nulls last
      ) from recursos_agregados),
      array[]::public.resumo_produtivo_recurso[]
    ),
    coalesce(
      (select array_agg(
        row(projeto_item_id, produto_id, produto_codigo, estrutura_ok, motivo)
          ::public.resumo_produtivo_item_status
        order by produto_codigo, projeto_item_id
      ) from itens_status),
      array[]::public.resumo_produtivo_item_status[]
    ),
    coalesce(
      (select bool_or(not estrutura_ok) from itens_status),
      false
    )
  into v_recursos, v_itens, v_tem_item_incompleto;

  if v_tem_item_incompleto then
    v_estado := 'incompleto';
    v_mensagem := 'Resumo produtivo incompleto: um ou mais itens não têm estrutura de fabricação totalmente resolvível. Os minutos retornados são parciais - não usar para prazo ou capacidade.';
  else
    v_estado := 'calculado';
    v_mensagem := null;
  end if;

  return (
    v_estado,
    v_mensagem,
    v_recursos,
    v_itens
  )::public.resumo_produtivo_projeto_resultado;
end;
$function$;

comment on function public.calcular_resumo_produtivo_projeto(uuid) is
  'Resumo produtivo (minutos por Recurso Produtivo) de todos os itens ativos de um projeto, percorrendo recursivamente os roteiros (inclusive subconjuntos) em uma unica chamada. estado=''incompleto'' quando qualquer item nao tem roteiro resolvivel, tem ciclo, ou excede a profundidade maxima - os minutos retornados nesse caso sao parciais, identificados por item em "itens".';

revoke execute on function public.calcular_resumo_produtivo_projeto(uuid) from public, anon;
grant execute on function public.calcular_resumo_produtivo_projeto(uuid) to authenticated;

commit;
