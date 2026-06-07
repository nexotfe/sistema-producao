-- NEXOTFE - Ordem de Fabricação: Numeração e Views Operacionais
-- Cria o gerador de numeração de OF e as visões que unem a demanda BOM à necessidade de estoque,
-- consumo interno e compra externa.

create or replace function public.gerar_numero_entidade(
  p_entidade text
)
returns text
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_config record;
  v_seq text;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  select *
    into v_config
    from public.numeracao_configuracoes
   where empresa_id = v_empresa_id
     and entidade = p_entidade
     and ativo = true
   limit 1;

  if not found then
    raise exception 'Configuracao de numeracao nao encontrada para entidade %', p_entidade;
  end if;

  update public.numeracao_configuracoes
     set sequencia_atual = sequencia_atual + 1,
         updated_at = now()
   where id = v_config.id
   returning sequencia_atual into v_config.sequencia_atual;

  v_seq := lpad(v_config.sequencia_atual::text, v_config.tamanho_sequencia, '0');

  return concat_ws('', coalesce(v_config.prefixo, ''), coalesce(v_config.ano, ''), v_seq);
end;
$$;

comment on function public.gerar_numero_entidade(text) is
  'Gera numero sequencial configurado por empresa para uma entidade industrial.';

create or replace function public.set_ordem_fabricacao_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero_of is null or trim(new.numero_of) = '' then
    new.numero_of := public.gerar_numero_entidade('of');
  end if;
  return new;
end;
$$;

comment on function public.set_ordem_fabricacao_numero() is
  'Trigger que atribui numero de OF automaticamente quando ausente.';

create trigger set_ordem_fabricacao_numero
  before insert on public.ordens_fabricacao
  for each row
  execute function public.set_ordem_fabricacao_numero();

create or replace view public.vw_demanda_bom_of as
select
  ofx.empresa_id,
  ofx.id as of_id,
  ofx.numero_of,
  ofx.projeto_id,
  ofx.projeto_item_id,
  ofx.produto_id,
  ip.pn as produto_pn,
  ip.descricao as produto_descricao,
  ofx.bom_id,
  b.versao as bom_versao,
  b.descricao as bom_descricao,
  bi.id as bom_item_id,
  bi.componente_tipo,
  bi.materia_prima_id,
  mp.codigo as materia_codigo,
  mp.descricao as materia_descricao,
  bi.componente_produto_id,
  cp.pn as componente_pn,
  cp.descricao as componente_descricao,
  bi.quantidade as bom_quantidade,
  ofx.quantidade_planejada,
  ofx.unidade as of_unidade,
  bi.unidade as componente_unidade,
  ofx.quantidade_planejada * bi.quantidade as quantidade_demanda,
  case
    when bi.componente_tipo = 'materia_prima' then 'materia_prima'
    else 'subconjunto'
  end as demanda_tipo
from public.ordens_fabricacao ofx
join public.boms b on b.id = ofx.bom_id
join public.bom_itens bi on bi.bom_id = b.id
left join public.materias_primas mp on mp.id = bi.materia_prima_id
left join public.itens_industriais cp on cp.id = bi.componente_produto_id
left join public.itens_industriais ip on ip.id = ofx.produto_id
where ofx.ativo = true
  and b.ativo = true
  and bi.ativo = true;

comment on view public.vw_demanda_bom_of is
  'Visao operacional da demanda de BOM por OF e por componente.';

create or replace view public.vw_demanda_estoque as
select
  d.*,
  es.saldo_disponivel,
  es.saldo_reservado,
  es.saldo_livre,
  greatest(d.quantidade_demanda - coalesce(es.saldo_livre, 0), 0) as quantidade_falta,
  case
    when coalesce(es.saldo_livre, 0) >= d.quantidade_demanda then false
    else true
  end as falta_estoque
from public.vw_demanda_bom_of d
left join public.estoque_saldos es
  on es.empresa_id = d.empresa_id
 and es.materia_prima_id = d.materia_prima_id
 and es.local_estoque = 'principal';

comment on view public.vw_demanda_estoque is
  'Visao de cobertura de estoque para a demanda BOM das OFs.';

create or replace view public.vw_demanda_consumo_compra as
select
  e.*,
  coalesce(ci.total_consumido, 0) as total_consumo_interno,
  coalesce(rc.total_requisicao, 0) as total_requisicao_compra,
  greatest(e.quantidade_falta - coalesce(ci.total_consumido, 0), 0) as quantidade_para_compra_externa,
  case
    when greatest(e.quantidade_falta - coalesce(ci.total_consumido, 0), 0) > 0 then true
    else false
  end as precisa_compra_externa
from public.vw_demanda_estoque e
left join (
  select
    of_id,
    materia_prima_id,
    sum(quantidade) as total_consumido
  from public.consumos_internos
  where ativo = true
  group by of_id, materia_prima_id
) ci on ci.of_id = e.of_id
    and ci.materia_prima_id = e.materia_prima_id
left join (
  select
    rc.of_id,
    rci.materia_prima_id,
    sum(rci.quantidade_necessaria) as total_requisicao
  from public.requisicoes_compra rc
  join public.requisicao_compra_itens rci on rci.requisicao_compra_id = rc.id
  where rc.ativo = true
    and rci.ativo = true
  group by rc.of_id, rci.materia_prima_id
) rc on rc.of_id = e.of_id
      and rc.materia_prima_id = e.materia_prima_id;

comment on view public.vw_demanda_consumo_compra is
  'Visao que mostra a necessidade de compra externa depois de estoque e consumo interno.';
