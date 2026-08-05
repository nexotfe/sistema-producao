begin;

-- Lista Tecnica de Materiais do PROJETO (nao do roteiro avulso): dado
-- um projeto, expande recursivamente o roteiro resolvido de CADA item
-- ativo do projeto (produtos, semiacabados, servicos - qualquer
-- itens_industriais com BOM resolvivel), multiplica quantidades
-- acumuladas pela quantidade SOLICITADA de cada item, e consolida a
-- mesma materia-prima (por materia_prima_id) entre TODOS os itens do
-- projeto. Somente leitura - nenhuma tabela e' escrita. Nao depende de
-- ordens_fabricacao, requisicoes_compra, planejamentos_compra nem de
-- nenhuma view do modulo de Compras (fluxo operacional futuro).
--
-- Historico de decisao: a primeira versao deste desenho era por
-- PRODUTO/ROTEIRO avulso (gerar_lista_tecnica_consolidada). Corrigido
-- nesta versao: a lista oficial pertence ao PROJETO - o roteiro
-- fornece a composicao, o projeto fornece os produtos e as
-- quantidades solicitadas. O nucleo recursivo (lista_tecnica_nos_
-- alcancaveis) foi mantido sem alteracao estrutural; only ganhou o
-- campo tipo_item, usado pela regra de servico abaixo.
--
-- Decisoes de negocio aprovadas (sessao completa):
--   1. Natureza do projeto (projetos.tipo_projeto):
--      - null                                    → bloqueia (erro): natureza nao definida
--      - 'industrializacao'                      → NAO E' ERRO: retorna
--        estado='nao_aplicavel_industrializacao' com arrays vazios e
--        mensagem explicando que o material e' fornecido pelo cliente
--      - 'fabricacao'/'desenvolvimento'/'servico' → prossegue
--      - qualquer outro valor                     → bloqueia (erro): natureza nao reconhecida
--   2. BOM inexistente para o produto de um item → bloqueia tudo:
--      "X nao possui roteiro cadastrado".
--   3. Validacao por SUBARVORE (nao mais por item inteiro): cada no
--      alcancavel cujo tipo_item seja DIFERENTE de 'servico' precisa
--      ter pelo menos uma materia-prima ativa na sua PROPRIA subarvore
--      (identificada por prefixo de caminho_bom_item_ids - nao
--      caminho_ids, que se repete quando o mesmo subconjunto aparece
--      duas vezes no mesmo pai). Um no 'servico' fica isento dessa
--      exigencia (mao de obra pura e' valida), mas a isencao NAO se
--      propaga para os descendentes dele - um subconjunto de
--      fabricacao incompleto dentro de um servico continua bloqueando.
--   4. Materia-prima invalida (ausente/invisivel por RLS/excluida)
--      bloqueia sempre, para qualquer tipo_item - identificando a
--      LINHA (bom_item_id), nunca tentando contornar RLS para inferir
--      o motivo exato (RLS de materias_primas ja filtra ativo=true no
--      proprio SELECT - "inativa" e "ausente" sao indistinguiveis sob
--      SECURITY INVOKER).
--   5. Unidade incompativel bloqueia sem total parcial - mensagem com
--      material + unidade encontrada + esperada + item + caminho.
--   6. Produto do ITEM DE PROJETO ausente/excluido/inativo bloqueia,
--      identificando projeto_item_id E produto_id - lido via LEFT JOIN
--      (nunca INNER JOIN) para que nenhum item desapareca
--      silenciosamente por causa do proprio JOIN ou da RLS.
--   7. Quantidade de cada item de projeto deve ser finita e > 0 -
--      valida no servidor, bloqueando tudo e citando item/codigo.
--   8. Persistencia: somente leitura, sob demanda, sem
--      snapshot/reserva/registro de Compras.
--   9. Identificacao de item/produto em mensagens e no retorno usa
--      SEMPRE itens_industriais.codigo (atual, via LEFT JOIN fresco) -
--      nunca projeto_itens.pn/tipo_item (denormalizados, podem estar
--      desatualizados). O id (uuid) so' aparece como fallback quando
--      nao ha' codigo (produto ausente).
--  10. Retorno inclui itens_analisados (todo item validado, mesmo
--      quando possui_materiais=false) - um servico so'-mao-de-obra
--      nunca desaparece silenciosamente so' porque nao contribuiu
--      nenhuma linha de material.
--  11. Nenhum resultado parcial: qualquer item invalido aborta a
--      funcao inteira.
--
-- Reaproveita sem modificar: resolver_bom_ativo_produto e
-- converter_para_unidade_base. NAO reaproveita nem modifica
-- bom_estrutura_alcancavel nem coletarEstruturaBom.ts (producao,
-- proposito diferente).
--
-- REQUISITO OBRIGATORIO PENDENTE (nao implementado nesta entrega): a
-- mesma validacao de "estrutura de fabricacao incompleta" (subarvore
-- sem materia-prima ativa, exceto raiz de servico) deve tambem valer
-- para a Simulacao Comercial (Motor de Capacidade /
-- coletarEstruturaBom.ts), que hoje ignora silenciosamente um
-- subconjunto sem BOM resolvivel. Requer decisao e autorizacao
-- separadas antes de alterar aquele modulo (producao, protegido).
--
-- SECURITY INVOKER explicito nas duas funcoes. Nenhuma aceita
-- empresa_id como parametro - derivam via empresa_atual_id()
-- internamente. Nenhum arredondamento em nenhum passo do calculo.
--
-- Rollback (referencia, nao executado por este arquivo):
--   drop function if exists public.gerar_lista_tecnica_projeto(uuid);
--   drop function if exists public.lista_tecnica_nos_alcancaveis(uuid, numeric);
--   drop type if exists public.lista_tecnica_projeto_resultado;
--   drop type if exists public.lista_tecnica_linha_material;
--   drop type if exists public.lista_tecnica_item_analisado;
--   drop type if exists public.lista_tecnica_projeto_item_bruto;
--   drop type if exists public.lista_tecnica_linha_bruta;
--   drop type if exists public.lista_tecnica_no;

-- ---------------------------------------------------------------------
-- Tipos compostos
-- ---------------------------------------------------------------------

create type public.lista_tecnica_no as (
  produto_id uuid,
  caminho uuid[],
  caminho_bom_item_ids uuid[],
  profundidade integer,
  quantidade_acumulada numeric,
  bom_resolvido_id uuid,
  tem_bom boolean,
  ciclo boolean,
  produto_ausente boolean,
  produto_excluido boolean,
  produto_inativo boolean,
  tipo_item text
);

create type public.lista_tecnica_linha_bruta as (
  materia_prima_id uuid,
  materia_prima_codigo text,
  materia_prima_descricao text,
  unidade_base text,
  materia_prima_invalida boolean,
  bom_item_id uuid,
  ordem smallint,
  quantidade_linha numeric,
  unidade_linha text,
  quantidade_acumulada_produto numeric,
  produto_origem_id uuid,
  produto_origem_codigo text,
  profundidade integer,
  caminho_ids uuid[],
  caminho_codigos text[],
  caminho_bom_item_ids uuid[],
  dimensoes text
);

create type public.lista_tecnica_projeto_item_bruto as (
  projeto_item_id uuid,
  produto_id uuid,
  quantidade numeric,
  produto_ausente boolean,
  produto_excluido boolean,
  produto_inativo boolean,
  produto_codigo text,
  produto_tipo_item text
);

create type public.lista_tecnica_item_analisado as (
  projeto_item_id uuid,
  produto_raiz_id uuid,
  produto_raiz_codigo text,
  quantidade_solicitada numeric,
  tipo_item text,
  possui_materiais boolean
);

create type public.lista_tecnica_linha_material as (
  projeto_item_id uuid,
  produto_raiz_id uuid,
  produto_raiz_codigo text,
  quantidade_solicitada numeric,
  materia_prima_id uuid,
  materia_prima_codigo text,
  materia_prima_descricao text,
  unidade_base text,
  bom_item_id uuid,
  ordem smallint,
  quantidade_linha numeric,
  unidade_linha text,
  quantidade_acumulada_produto numeric,
  quantidade_calculada_origem numeric,
  quantidade_convertida numeric,
  dimensoes text,
  profundidade integer,
  caminho_ids uuid[],
  caminho_codigos text[],
  caminho_bom_item_ids uuid[]
);

create type public.lista_tecnica_projeto_resultado as (
  estado text,
  mensagem text,
  itens_analisados public.lista_tecnica_item_analisado[],
  materiais public.lista_tecnica_linha_material[]
);

-- ---------------------------------------------------------------------
-- lista_tecnica_nos_alcancaveis: nucleo recursivo, por produto - sem
-- mudanca estrutural desde a versao anterior, so' ganhou tipo_item
-- (mesmo LATERAL que ja buscava ativo/deleted_at).
-- ---------------------------------------------------------------------

create or replace function public.lista_tecnica_nos_alcancaveis(
  p_produto_raiz_id uuid,
  p_quantidade_raiz numeric
) returns setof public.lista_tecnica_no
language sql
security invoker
volatile
as $$
  with recursive nos(
    produto_id, caminho, caminho_bom_item_ids, profundidade, quantidade_acumulada,
    bom_resolvido_id, tem_bom, ciclo, produto_ausente, produto_excluido, produto_inativo, tipo_item
  ) as (
    select
      p_produto_raiz_id,
      array[p_produto_raiz_id]::uuid[],
      array[]::uuid[],
      0,
      p_quantidade_raiz,
      b.bom_id,
      b.bom_id is not null,
      false,
      pv.id is null,
      pv.id is not null and pv.deleted_at is not null,
      pv.id is not null and pv.deleted_at is null and pv.ativo is distinct from true,
      pv.tipo_item
    from (select public.resolver_bom_ativo_produto(public.empresa_atual_id(), p_produto_raiz_id) as bom_id) b
    left join lateral (
      select ii.id, ii.ativo, ii.deleted_at, ii.tipo_item
      from public.itens_industriais ii
      where ii.id = p_produto_raiz_id and ii.empresa_id = public.empresa_atual_id()
    ) as pv on true
    union all
    select
      bi.componente_produto_id,
      array_append(n.caminho, bi.componente_produto_id),
      array_append(n.caminho_bom_item_ids, bi.id),
      n.profundidade + 1,
      n.quantidade_acumulada * bi.quantidade,
      b.bom_id,
      b.bom_id is not null,
      bi.componente_produto_id = any(n.caminho),
      pv.id is null,
      pv.id is not null and pv.deleted_at is not null,
      pv.id is not null and pv.deleted_at is null and pv.ativo is distinct from true,
      pv.tipo_item
    from nos n
    join public.bom_itens bi
      on bi.bom_id = n.bom_resolvido_id
     and bi.componente_tipo = 'subconjunto'
     and bi.ativo = true
     and bi.deleted_at is null
     and bi.empresa_id = public.empresa_atual_id()
    cross join lateral (
      select public.resolver_bom_ativo_produto(public.empresa_atual_id(), bi.componente_produto_id) as bom_id
    ) as b
    left join lateral (
      select ii.id, ii.ativo, ii.deleted_at, ii.tipo_item
      from public.itens_industriais ii
      where ii.id = bi.componente_produto_id and ii.empresa_id = public.empresa_atual_id()
    ) as pv on true
    where not n.ciclo
      and n.profundidade < 21
  )
  select
    produto_id, caminho, caminho_bom_item_ids, profundidade, quantidade_acumulada,
    bom_resolvido_id, tem_bom, ciclo, produto_ausente, produto_excluido, produto_inativo, tipo_item
  from nos;
$$;

revoke execute on function public.lista_tecnica_nos_alcancaveis(uuid, numeric) from public, anon;
grant execute on function public.lista_tecnica_nos_alcancaveis(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- gerar_lista_tecnica_projeto: unica funcao exposta ao cliente.
-- ---------------------------------------------------------------------

create or replace function public.gerar_lista_tecnica_projeto(
  p_projeto_id uuid
) returns public.lista_tecnica_projeto_resultado
language plpgsql
security invoker
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_tipo_projeto text;
  v_itens_projeto public.lista_tecnica_projeto_item_bruto[];
  v_item public.lista_tecnica_projeto_item_bruto;
  v_qtd_lidos integer;
  v_itens_analisados public.lista_tecnica_item_analisado[] := array[]::public.lista_tecnica_item_analisado[];
  v_materiais_todas public.lista_tecnica_linha_material[] := array[]::public.lista_tecnica_linha_material[];
  v_nos public.lista_tecnica_no[];
  v_linhas public.lista_tecnica_linha_bruta[];
  v_no record;
  v_linha record;
  v_rec record;
  v_caminho_legivel text;
  v_possui_materiais boolean;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual não encontrada.';
  end if;

  select p.tipo_projeto into v_tipo_projeto
  from public.projetos p
  where p.id = p_projeto_id and p.empresa_id = v_empresa_id and p.deleted_at is null;

  if not found then
    raise exception 'Não é possível gerar a lista: projeto não encontrado ou não está visível.';
  end if;

  if v_tipo_projeto is null then
    raise exception 'Não é possível gerar a lista: o projeto não possui natureza definida.';
  elsif v_tipo_projeto = 'industrializacao' then
    return (
      'nao_aplicavel_industrializacao',
      'A matéria-prima deste projeto é fornecida pelo cliente.',
      array[]::public.lista_tecnica_item_analisado[],
      array[]::public.lista_tecnica_linha_material[]
    )::public.lista_tecnica_projeto_resultado;
  elsif v_tipo_projeto not in ('fabricacao', 'desenvolvimento', 'servico') then
    raise exception 'Não é possível gerar a lista: natureza de projeto "%" não reconhecida.', v_tipo_projeto;
  end if;

  -- ===== carrega TODOS os itens ativos primeiro, LEFT JOIN no produto -
  -- nenhum item desaparece por causa do join =====
  select array_agg(x) into v_itens_projeto
  from (
    select
      pi.id as projeto_item_id,
      pi.produto_id,
      pi.quantidade,
      (ii.id is null) as produto_ausente,
      (ii.id is not null and ii.deleted_at is not null) as produto_excluido,
      (ii.id is not null and ii.deleted_at is null and ii.ativo is distinct from true) as produto_inativo,
      ii.codigo as produto_codigo,
      ii.tipo_item as produto_tipo_item
    from public.projeto_itens pi
    left join public.itens_industriais ii
      on ii.id = pi.produto_id and ii.empresa_id = v_empresa_id
    where pi.projeto_id = p_projeto_id
      and pi.empresa_id = v_empresa_id
      and pi.ativo = true
      and pi.deleted_at is null
  ) x;

  v_qtd_lidos := coalesce(array_length(v_itens_projeto, 1), 0);

  if v_qtd_lidos = 0 then
    raise exception 'Não é possível gerar a lista: o projeto não possui itens cadastrados.';
  end if;

  -- validacao estrutural de cada item (produto e quantidade) ANTES de
  -- expandir qualquer roteiro
  foreach v_item in array v_itens_projeto loop
    if v_item.produto_ausente then
      raise exception 'Não é possível gerar a lista: o produto do item de projeto % (produto_id %) não foi encontrado ou não está visível.',
        v_item.projeto_item_id, v_item.produto_id;
    elsif v_item.produto_excluido then
      raise exception 'Não é possível gerar a lista: o produto % (item de projeto %) foi excluído.',
        v_item.produto_codigo, v_item.projeto_item_id;
    elsif v_item.produto_inativo then
      raise exception 'Não é possível gerar a lista: o produto % (item de projeto %) está inativo.',
        v_item.produto_codigo, v_item.projeto_item_id;
    end if;

    if v_item.quantidade is null or v_item.quantidade <= 0 or v_item.quantidade = 'NaN'::numeric then
      raise exception 'Não é possível gerar a lista: a quantidade do item % (produto %) deve ser um número finito maior que zero.',
        v_item.projeto_item_id, coalesce(v_item.produto_codigo, v_item.produto_id::text);
    end if;
  end loop;

  -- ===== expande cada item =====
  foreach v_item in array v_itens_projeto loop
    select array_agg(n) into v_nos
      from public.lista_tecnica_nos_alcancaveis(v_item.produto_id, v_item.quantidade) n;

    if exists (select 1 from unnest(v_nos) as n where n.profundidade > 20) then
      raise exception 'Não é possível gerar a lista: profundidade máxima de estrutura (20 níveis) excedida no item % (produto %).',
        v_item.projeto_item_id, v_item.produto_codigo;
    end if;

    select n.* into v_no from unnest(v_nos) as n where n.ciclo order by n.profundidade limit 1;
    if found then
      select string_agg(coalesce(ii.codigo, t.produto_id::text || ' (não encontrado)'), ' → ' order by ord)
        into v_caminho_legivel
        from unnest(v_no.caminho) with ordinality as t(produto_id, ord)
        left join public.itens_industriais ii on ii.id = t.produto_id;
      raise exception 'Não é possível gerar a lista: ciclo detectado na estrutura do item % (produto %) (caminho: %).',
        v_item.projeto_item_id, v_item.produto_codigo, v_caminho_legivel;
    end if;

    select n.* into v_no from unnest(v_nos) as n
      where n.produto_ausente or n.produto_excluido or n.produto_inativo
      order by n.profundidade limit 1;
    if found then
      select string_agg(coalesce(ii.codigo, t.produto_id::text || ' (não encontrado)'), ' → ' order by ord)
        into v_caminho_legivel
        from unnest(v_no.caminho) with ordinality as t(produto_id, ord)
        left join public.itens_industriais ii on ii.id = t.produto_id;
      if v_no.produto_ausente then
        raise exception 'Não é possível gerar a lista: o produto % não foi encontrado ou não está visível (item %, caminho: %).',
          v_no.produto_id, v_item.projeto_item_id, v_caminho_legivel;
      elsif v_no.produto_excluido then
        raise exception 'Não é possível gerar a lista: o produto % foi excluído (item %, caminho: %).',
          v_no.produto_id, v_item.projeto_item_id, v_caminho_legivel;
      else
        raise exception 'Não é possível gerar a lista: o produto % está inativo (item %, caminho: %).',
          v_no.produto_id, v_item.projeto_item_id, v_caminho_legivel;
      end if;
    end if;

    select n.* into v_no from unnest(v_nos) as n where not n.tem_bom order by n.profundidade limit 1;
    if found then
      select string_agg(coalesce(ii.codigo, t.produto_id::text || ' (não encontrado)'), ' → ' order by ord)
        into v_caminho_legivel
        from unnest(v_no.caminho) with ordinality as t(produto_id, ord)
        left join public.itens_industriais ii on ii.id = t.produto_id;
      raise exception 'Não é possível gerar a lista: % não possui roteiro cadastrado (item %, caminho: %).',
        (select codigo from public.itens_industriais where id = v_no.produto_id), v_item.projeto_item_id, v_caminho_legivel;
    end if;

    -- ===== monta linhas de materia-prima deste item (uma unica vez) =====
    select array_agg(linha) into v_linhas
    from (
      select
        mp.id as materia_prima_id,
        mp.codigo as materia_prima_codigo,
        mp.descricao as materia_prima_descricao,
        mp.unidade as unidade_base,
        (mp.id is null or mp.deleted_at is not null) as materia_prima_invalida,
        bi.id as bom_item_id,
        bi.ordem,
        bi.quantidade as quantidade_linha,
        bi.unidade as unidade_linha,
        n.quantidade_acumulada as quantidade_acumulada_produto,
        n.produto_id as produto_origem_id,
        ii.codigo as produto_origem_codigo,
        n.profundidade,
        n.caminho as caminho_ids,
        (select array_agg(ii2.codigo order by ord)
           from unnest(n.caminho) with ordinality as t(pid, ord)
           join public.itens_industriais ii2 on ii2.id = t.pid) as caminho_codigos,
        n.caminho_bom_item_ids,
        bi.dimensoes
      from unnest(v_nos) as n
      join public.itens_industriais ii on ii.id = n.produto_id
      join public.bom_itens bi
        on bi.bom_id = n.bom_resolvido_id
       and bi.componente_tipo = 'materia_prima' and bi.ativo = true and bi.deleted_at is null
       and bi.empresa_id = v_empresa_id
      left join public.materias_primas mp
        on mp.id = bi.materia_prima_id and mp.empresa_id = v_empresa_id
    ) linha;

    if v_linhas is null then
      v_linhas := array[]::public.lista_tecnica_linha_bruta[];
    end if;

    -- ===== validação por subárvore: cada nó cujo tipo_item NÃO é
    -- 'servico' precisa de matéria-prima na PRÓPRIA subárvore -
    -- identidade da ocorrência é caminho_bom_item_ids (não caminho_ids,
    -- que se repete quando o mesmo subconjunto aparece 2x no mesmo pai).
    -- cardinality() (nunca array_length) porque o caminho vazio da raiz
    -- teria array_length NULL, quebrando a fatia [1:NULL].
    -- A isenção de serviço é LOCAL ao nó - não se propaga a descendentes.
    for v_no in select * from unnest(v_nos) loop
      if v_no.tipo_item is distinct from 'servico' then
        if not exists (
          select 1 from unnest(v_linhas) as l
          where l.caminho_bom_item_ids[1:cardinality(v_no.caminho_bom_item_ids)] = v_no.caminho_bom_item_ids
        ) then
          select string_agg(coalesce(ii.codigo, t.produto_id::text || ' (não encontrado)'), ' → ' order by ord)
            into v_caminho_legivel
            from unnest(v_no.caminho) with ordinality as t(produto_id, ord)
            left join public.itens_industriais ii on ii.id = t.produto_id;
          raise exception 'Roteiro de fabricação incompleto: nenhuma matéria-prima ativa foi encontrada (item %, caminho: %).',
            v_item.projeto_item_id, v_caminho_legivel;
        end if;
      end if;
    end loop;

    -- ===== matéria-prima indisponível ou inválida =====
    select l.* into v_linha from unnest(v_linhas) as l where l.materia_prima_invalida order by l.profundidade limit 1;
    if found then
      select string_agg(codigo, ' → ' order by ord) into v_caminho_legivel
        from unnest(v_linha.caminho_ids) with ordinality as t(produto_id, ord)
        join public.itens_industriais ii on ii.id = t.produto_id;
      raise exception 'Não é possível gerar a lista: matéria-prima indisponível ou inválida na linha do roteiro (bom_item_id %) (item %, caminho: %).',
        v_linha.bom_item_id, v_item.projeto_item_id, v_caminho_legivel;
    end if;

    -- ===== unidade incompatível =====
    for v_rec in
      select distinct l.unidade_linha, l.unidade_base, l.materia_prima_codigo, l.caminho_ids
      from unnest(v_linhas) as l
    loop
      begin
        perform public.converter_para_unidade_base(1, v_rec.unidade_linha, v_rec.unidade_base);
      exception when others then
        select string_agg(codigo, ' → ' order by ord) into v_caminho_legivel
          from unnest(v_rec.caminho_ids) with ordinality as t(produto_id, ord)
          join public.itens_industriais ii on ii.id = t.produto_id;
        raise exception 'Não é possível gerar a lista: % está em "%" mas o cadastro espera "%" (item %, caminho: %).',
          v_rec.materia_prima_codigo, v_rec.unidade_linha, v_rec.unidade_base, v_item.projeto_item_id, v_caminho_legivel;
      end;
    end loop;

    v_possui_materiais := coalesce(array_length(v_linhas, 1), 0) > 0;

    v_itens_analisados := v_itens_analisados || row(
      v_item.projeto_item_id, v_item.produto_id, v_item.produto_codigo,
      v_item.quantidade, v_item.produto_tipo_item, v_possui_materiais
    )::public.lista_tecnica_item_analisado;

    if v_possui_materiais then
      v_materiais_todas := v_materiais_todas || (
        select array_agg(
          row(
            v_item.projeto_item_id, v_item.produto_id, v_item.produto_codigo, v_item.quantidade,
            l.materia_prima_id, l.materia_prima_codigo, l.materia_prima_descricao, l.unidade_base,
            l.bom_item_id, l.ordem, l.quantidade_linha, l.unidade_linha, l.quantidade_acumulada_produto,
            l.quantidade_linha * l.quantidade_acumulada_produto,
            public.converter_para_unidade_base(l.quantidade_linha * l.quantidade_acumulada_produto, l.unidade_linha, l.unidade_base),
            l.dimensoes, l.profundidade, l.caminho_ids, l.caminho_codigos, l.caminho_bom_item_ids
          )::public.lista_tecnica_linha_material
        )
        from unnest(v_linhas) as l
      );
    end if;
  end loop;

  -- invariante defensiva: nenhum item pode ter sumido entre leitura e resultado
  if array_length(v_itens_analisados, 1) is distinct from v_qtd_lidos then
    raise exception 'Inconsistência interna: % itens lidos, % itens analisados.',
      v_qtd_lidos, coalesce(array_length(v_itens_analisados, 1), 0);
  end if;

  -- reordena com COALESCE - array_agg sobre zero linhas devolve NULL,
  -- nunca pode escapar como NULL no retorno
  v_itens_analisados := coalesce(
    (select array_agg(x order by x.produto_raiz_codigo) from unnest(v_itens_analisados) x),
    array[]::public.lista_tecnica_item_analisado[]
  );
  v_materiais_todas := coalesce(
    (select array_agg(x order by x.produto_raiz_codigo, x.caminho_ids, x.profundidade, x.ordem, x.bom_item_id, x.materia_prima_codigo)
       from unnest(v_materiais_todas) x),
    array[]::public.lista_tecnica_linha_material[]
  );

  return ('calculado', null, v_itens_analisados, v_materiais_todas)::public.lista_tecnica_projeto_resultado;
end;
$function$;

comment on function public.gerar_lista_tecnica_projeto is
  'Expande recursivamente o roteiro de cada item ativo de um projeto e consolida as matérias-primas por materia_prima_id na unidade-base, entre todos os itens. Industrialização retorna estado nao_aplicavel_industrializacao (material fornecido pelo cliente), não é erro. Somente leitura - não depende de OF, estoque, PCP, requisição ou planejamento de compra.';

revoke execute on function public.gerar_lista_tecnica_projeto(uuid) from public, anon;
grant execute on function public.gerar_lista_tecnica_projeto(uuid) to authenticated;

commit;
