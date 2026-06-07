-- NEXOTFE - Ordem de Fabricação Operacional e Vistas de Consumo
-- Cria a função de criação de OF completa e views que acompanham o fluxo BOM -> estoque -> consumo interno -> compra externa.

create or replace function public.registrar_consumo_interno(
  p_projeto_id uuid,
  p_of_numero text,
  p_materia_prima_id uuid,
  p_quantidade numeric,
  p_unidade text,
  p_custo_unitario_material numeric default 0,
  p_local_estoque text default 'principal',
  p_data_movimentacao date default current_date,
  p_observacoes text default null,
  p_of_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_saldo_livre numeric;
  v_movimentacao_id uuid;
  v_consumo_id uuid;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if p_quantidade <= 0 then
    raise exception 'Quantidade do consumo interno deve ser maior que zero.';
  end if;

  if p_custo_unitario_material < 0 then
    raise exception 'Custo unitario do material nao pode ser negativo.';
  end if;

  if p_unidade not in ('kg', 'metro', 'barra', 'chapa', 'peca') then
    raise exception 'Unidade invalida para consumo interno.';
  end if;

  select saldo_livre into v_saldo_livre
  from public.estoque_saldos
  where empresa_id = v_empresa_id
    and materia_prima_id = p_materia_prima_id
    and local_estoque = p_local_estoque
  for update;

  if v_saldo_livre is null then
    raise exception 'Saldo de estoque nao encontrado para a materia-prima.';
  end if;

  if v_saldo_livre < p_quantidade then
    raise exception 'Saldo livre insuficiente para gerar consumo interno.';
  end if;

  update public.estoque_saldos
  set saldo_reservado = saldo_reservado + p_quantidade
  where empresa_id = v_empresa_id
    and materia_prima_id = p_materia_prima_id
    and local_estoque = p_local_estoque;

  insert into public.estoque_movimentacoes (
    empresa_id, materia_prima_id, local_estoque, tipo_movimento, quantidade,
    projeto_id, of_numero, of_id, observacoes, created_by
  )
  values (
    v_empresa_id, p_materia_prima_id, p_local_estoque, 'reserva', p_quantidade,
    p_projeto_id, p_of_numero, p_of_id,
    coalesce(p_observacoes, 'Reserva gerada por Consumo Interno'), auth.uid()
  )
  returning id into v_movimentacao_id;

  insert into public.consumos_internos (
    empresa_id, projeto_id, of_numero, of_id, materia_prima_id,
    estoque_movimentacao_id, local_estoque, quantidade, unidade,
    saldo_consumido, custo_unitario_material, data_movimentacao,
    observacoes, created_by
  )
  values (
    v_empresa_id, p_projeto_id, p_of_numero, p_of_id, p_materia_prima_id,
    v_movimentacao_id, p_local_estoque, p_quantidade, p_unidade,
    p_quantidade, p_custo_unitario_material, p_data_movimentacao,
    p_observacoes, auth.uid()
  )
  returning id into v_consumo_id;

  return v_consumo_id;
end;
$$;

comment on function public.registrar_consumo_interno is
  'Registra consumo interno para uma OF e atualiza a reserva em estoque.';

create or replace function public.registrar_requisicao_compra_material(
  p_projeto_id uuid,
  p_of_numero text,
  p_materia_prima_id uuid,
  p_quantidade numeric,
  p_unidade text,
  p_data_necessidade_material date,
  p_observacoes text default null,
  p_of_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_requisicao_id uuid;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if p_quantidade <= 0 then
    raise exception 'Quantidade da requisicao deve ser maior que zero.';
  end if;

  if p_unidade not in ('kg', 'metro', 'barra', 'chapa', 'peca') then
    raise exception 'Unidade invalida para requisicao de compra.';
  end if;

  insert into public.requisicoes_compra (
    empresa_id,
    projeto_id,
    of_numero,
    of_id,
    data_necessidade_material,
    status,
    observacoes,
    created_by
  )
  values (
    v_empresa_id,
    p_projeto_id,
    p_of_numero,
    p_of_id,
    p_data_necessidade_material,
    'aberta',
    coalesce(p_observacoes, 'Compra externa gerada por falta de saldo livre'),
    auth.uid()
  )
  returning id into v_requisicao_id;

  insert into public.requisicao_compra_itens (
    empresa_id,
    requisicao_compra_id,
    materia_prima_id,
    quantidade_necessaria,
    unidade,
    observacoes,
    created_by
  )
  values (
    v_empresa_id,
    v_requisicao_id,
    p_materia_prima_id,
    p_quantidade,
    p_unidade,
    p_observacoes,
    auth.uid()
  );

  return v_requisicao_id;
end;
$$;

comment on function public.registrar_requisicao_compra_material is
  'Registra requisicao de compra externamente vinculada a uma OF.';

create or replace function public.criar_ordem_fabricacao_operacional(
  p_projeto_id uuid default null,
  p_projeto_item_id uuid default null,
  p_produto_id uuid default null,
  p_bom_id uuid default null,
  p_quantidade_planejada numeric default 0,
  p_unidade text default 'peca',
  p_data_inicio_planejada date default null,
  p_data_conclusao_planejada date default null,
  p_tipo text default 'normal',
  p_observacoes text default null
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_of_id uuid;
  v_numero_of text;
  v_bom record;
  v_projeto_item record;
  v_demanda numeric;
  v_saldo_livre numeric;
  v_data_necessidade date := coalesce(p_data_conclusao_planejada, current_date + 7);
  v_consumo_id uuid;
  v_requisicao_id uuid;
  v_unidade_text text;
  v_bom_item record;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if p_quantidade_planejada <= 0 then
    raise exception 'Quantidade planejada da OF deve ser maior que zero.';
  end if;

  if p_unidade not in ('kg', 'metro', 'barra', 'chapa', 'peca') then
    raise exception 'Unidade invalida para a OF.';
  end if;

  if p_produto_id is null then
    if p_projeto_item_id is null then
      raise exception 'Produto ou item de projeto deve ser informado.';
    end if;

    select produto_id, unidade
      into v_projeto_item
      from public.projeto_itens
     where id = p_projeto_item_id
       and empresa_id = v_empresa_id
       and ativo = true
       and deleted_at is null;

    if not found then
      raise exception 'Item de projeto nao encontrado.';
    end if;

    p_produto_id := v_projeto_item.produto_id;
    if p_unidade is null then
      p_unidade := v_projeto_item.unidade;
    end if;
  end if;

  select * into v_bom
    from public.boms
   where id = p_bom_id
     and empresa_id = v_empresa_id
     and ativo = true
     and deleted_at is null;

  if not found then
    raise exception 'BOM nao encontrada ou inativa.';
  end if;

  insert into public.ordens_fabricacao (
    empresa_id, projeto_id, projeto_item_id, produto_id, bom_id,
    tipo, status, quantidade_planejada, quantidade_produzida,
    unidade, data_inicio_planejada, data_conclusao_planejada,
    observacoes, created_by
  )
  values (
    v_empresa_id, p_projeto_id, p_projeto_item_id, p_produto_id, p_bom_id,
    p_tipo, 'planejada', p_quantidade_planejada, 0,
    p_unidade, p_data_inicio_planejada, p_data_conclusao_planejada,
    p_observacoes, auth.uid()
  )
  returning id, numero_of into v_of_id, v_numero_of;

  for v_bom_item in
    select * from public.bom_itens
    where bom_id = v_bom.id
      and ativo = true
      and deleted_at is null
    order by nivel, ordem
  loop
    v_demanda := p_quantidade_planejada * v_bom_item.quantidade;
    v_unidade_text := coalesce(v_bom_item.unidade, p_unidade);

    if v_bom_item.componente_tipo = 'materia_prima' then
      select coalesce(saldo_livre, 0) into v_saldo_livre
      from public.estoque_saldos
      where empresa_id = v_empresa_id
        and materia_prima_id = v_bom_item.materia_prima_id
        and local_estoque = 'principal'
      for update;

      if v_saldo_livre > 0 then
        if v_saldo_livre >= v_demanda then
          perform public.registrar_consumo_interno(
            p_projeto_id,
            v_numero_of,
            v_bom_item.materia_prima_id,
            v_demanda,
            v_unidade_text,
            0,
            'principal',
            current_date,
            'Consumo interno gerado automaticamente na criacao da OF',
            v_of_id
          );
        else
          perform public.registrar_consumo_interno(
            p_projeto_id,
            v_numero_of,
            v_bom_item.materia_prima_id,
            v_saldo_livre,
            v_unidade_text,
            0,
            'principal',
            current_date,
            'Consumo interno parcial gerado automaticamente na criacao da OF',
            v_of_id
          );
          perform public.registrar_requisicao_compra_material(
            p_projeto_id,
            v_numero_of,
            v_bom_item.materia_prima_id,
            v_demanda - v_saldo_livre,
            v_unidade_text,
            v_data_necessidade,
            'Requisicao gerada por falta de estoque na criacao da OF',
            v_of_id
          );
        end if;
      else
        perform public.registrar_requisicao_compra_material(
          p_projeto_id,
          v_numero_of,
          v_bom_item.materia_prima_id,
          v_demanda,
          v_unidade_text,
          v_data_necessidade,
          'Requisicao gerada por falta de estoque na criacao da OF',
          v_of_id
        );
      end if;
    end if;
  end loop;

  return v_of_id;
end;
$$;

comment on function public.criar_ordem_fabricacao_operacional is
  'Cria uma OF operacional, registra consumo interno para materiais em estoque e requisicoes externas para faltas.';

create or replace view public.vw_of_consumo_detalhado as
select
  ofx.empresa_id,
  ofx.id as of_id,
  ofx.numero_of,
  ofx.projeto_id,
  ofx.produto_id,
  ip.pn as produto_pn,
  ip.descricao as produto_descricao,
  ofx.bom_id,
  b.versao as bom_versao,
  bi.id as bom_item_id,
  bi.componente_tipo,
  bi.materia_prima_id,
  mp.codigo as materia_codigo,
  mp.descricao as materia_descricao,
  bi.componente_produto_id,
  cp.pn as componente_pn,
  cp.descricao as componente_descricao,
  bi.quantidade as bom_quantidade,
  bi.unidade as bom_unidade,
  ofx.quantidade_planejada,
  ofx.unidade as of_unidade,
  ofx.quantidade_planejada * bi.quantidade as quantidade_demanda,
  coalesce(es.saldo_livre, 0) as estoque_saldo_livre,
  coalesce(ci.quantidade_consumo_interno, 0) as quantidade_consumo_interno,
  coalesce(rc.quantidade_compra_externa, 0) as quantidade_compra_externa,
  greatest(ofx.quantidade_planejada * bi.quantidade - coalesce(es.saldo_livre, 0), 0) as quantidade_falta_estoque,
  greatest(greatest(ofx.quantidade_planejada * bi.quantidade - coalesce(es.saldo_livre, 0), 0) - coalesce(ci.quantidade_consumo_interno, 0), 0) as quantidade_para_compra_externa,
  case
    when coalesce(ci.quantidade_consumo_interno, 0) > 0
      and coalesce(rc.quantidade_compra_externa, 0) > 0 then 'ci_parcial_compra_parcial'
    when coalesce(ci.quantidade_consumo_interno, 0) > 0 then 'ci_total'
    else 'compra_total'
  end as status_fluxo
from public.ordens_fabricacao ofx
join public.boms b on b.id = ofx.bom_id
join public.bom_itens bi on bi.bom_id = b.id
left join public.itens_industriais ip on ip.id = ofx.produto_id
left join public.materias_primas mp on mp.id = bi.materia_prima_id
left join public.itens_industriais cp on cp.id = bi.componente_produto_id
left join public.estoque_saldos es
  on es.empresa_id = ofx.empresa_id
 and es.materia_prima_id = bi.materia_prima_id
 and es.local_estoque = 'principal'
left join (
  select
    of_id,
    materia_prima_id,
    sum(quantidade) as quantidade_consumo_interno
  from public.consumos_internos
  where ativo = true
    and deleted_at is null
  group by of_id, materia_prima_id
) ci on ci.of_id = ofx.id
    and ci.materia_prima_id = bi.materia_prima_id
left join (
  select
    rc.of_id,
    rci.materia_prima_id,
    sum(rci.quantidade_necessaria) as quantidade_compra_externa
  from public.requisicoes_compra rc
  join public.requisicao_compra_itens rci on rci.requisicao_compra_id = rc.id
  where rc.ativo = true
    and rc.deleted_at is null
    and rci.ativo = true
    and rci.deleted_at is null
  group by rc.of_id, rci.materia_prima_id
) rc on rc.of_id = ofx.id
      and rc.materia_prima_id = bi.materia_prima_id
where ofx.ativo = true
  and b.ativo = true
  and bi.ativo = true;

comment on view public.vw_of_consumo_detalhado is
  'Visao detalhada do consumo por OF, mostrando demanda, estoque, CI e compra externa.';

create or replace view public.vw_of_fluxo_operacional as
select
  ofx.id as of_id,
  ofx.numero_of,
  ofx.projeto_id,
  ofx.produto_id,
  ip.pn as produto_pn,
  ofx.bom_id,
  b.versao as bom_versao,
  sum(d.quantidade_demanda) as total_demanda_bom,
  sum(d.estoque_saldo_livre) as total_estoque_livre,
  sum(d.quantidade_consumo_interno) as total_consumo_interno,
  sum(d.quantidade_para_compra_externa) as total_compra_externa,
  max(d.status_fluxo) as status_fluxo
from public.vw_of_consumo_detalhado d
join public.ordens_fabricacao ofx on ofx.id = d.of_id
left join public.itens_industriais ip on ip.id = ofx.produto_id
left join public.boms b on b.id = ofx.bom_id
where ofx.ativo = true
group by
  ofx.id,
  ofx.numero_of,
  ofx.projeto_id,
  ofx.produto_id,
  ip.pn,
  ofx.bom_id,
  b.versao;

comment on view public.vw_of_fluxo_operacional is
  'Visao operacional agregada por OF do fluxo BOM -> estoque -> consumo interno -> compra externa.';
