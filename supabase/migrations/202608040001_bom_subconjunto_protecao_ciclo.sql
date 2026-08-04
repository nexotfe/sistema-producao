begin;

-- Protecao estrutural (servidor) contra ciclos e subconjuntos sem BOM
-- na relacao produto/subconjunto (bom_itens.componente_tipo='subconjunto').
--
-- Decisoes de negocio ja aprovadas que este arquivo implementa:
--   1. O mesmo subconjunto pode aparecer em varias linhas do roteiro
--      (quantidade/observacoes independentes) - nada aqui restringe isso.
--   2. Produto sem nenhum BOM resolvivel nao pode ser vinculado como
--      subconjunto (em nenhum BOM, nem historico).
--   3. Produto com BOM status='rascunho' pode ser subconjunto - a
--      exigencia e "tem BOM resolvivel", nunca "tem BOM ativo".
--   4. Autorreferencia e ciclos indiretos (A->B->A, N niveis) sao
--      sempre proibidos.
--   5. A protecao vive no banco (gatilhos AFTER), nao so na interface -
--      cobre insert/update direto, RPC futura, e SQL Editor.
--   6. Resolucao de "qual BOM vale" para um produto: prefere
--      ativo=true e status='ativo'; na ausencia, o mais recente por
--      created_at; desempate deterministico por id - MESMA regra em
--      SQL (resolver_bom_ativo_produto) e TypeScript
--      (resolverBomAtivo.ts / criarBuscarPaginaProdutosSubconjunto.ts).
--
-- Mecanismo: gatilhos AFTER em bom_itens e boms (nao RPC) - cobrem
-- qualquer via de escrita, direta ou futura. pg_advisory_xact_lock por
-- empresa serializa mutacoes concorrentes do grafo dentro do mesmo
-- tenant (nunca bloqueia entre empresas diferentes). Todas as funcoes
-- sao SECURITY INVOKER (padrao) - rodam sob as mesmas politicas RLS do
-- usuario que already esta fazendo a escrita.
--
-- Rollback (referencia, nao executado por este arquivo):
--   drop trigger if exists boms_validar_ciclo on public.boms;
--   drop trigger if exists bom_itens_validar_ciclo on public.bom_itens;
--   drop function if exists public.trg_boms_validar_ciclo();
--   drop function if exists public.trg_bom_itens_validar_ciclo();
--   drop function if exists public.bom_produto_e_subconjunto_vivo(uuid, uuid);
--   drop function if exists public.validar_estrutura_bom(uuid, uuid);
--   drop function if exists public.bom_estrutura_alcancavel(uuid, uuid);
--   drop function if exists public.resolver_bom_ativo_produto(uuid, uuid);
--   drop index if exists public.bom_itens_subconjunto_ativo_idx;
--   drop index if exists public.boms_produto_ativo_idx;

-- ---------------------------------------------------------------------
-- Indices de suporte a resolucao/travessia
-- ---------------------------------------------------------------------

create index if not exists boms_produto_ativo_idx
  on public.boms (produto_id, empresa_id)
  where ativo = true and deleted_at is null;

create index if not exists bom_itens_subconjunto_ativo_idx
  on public.bom_itens (bom_id, componente_tipo)
  where componente_tipo = 'subconjunto' and ativo = true and deleted_at is null;

-- ---------------------------------------------------------------------
-- resolver_bom_ativo_produto: qual BOM vale para um produto agora.
-- volatile (nao stable) - chamada de dentro de gatilhos AFTER que
-- precisam ver a propria linha que disparou o gatilho, nao o snapshot
-- do inicio do comando.
-- ---------------------------------------------------------------------

create or replace function public.resolver_bom_ativo_produto(
  p_empresa_id uuid,
  p_produto_id uuid
) returns uuid
language sql
volatile
as $$
  select id from public.boms
  where produto_id = p_produto_id
    and empresa_id = p_empresa_id
    and ativo = true
    and deleted_at is null
  order by (status = 'ativo') desc, created_at desc, id desc
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- bom_estrutura_alcancavel: travessia unica do grafo resolvido a
-- partir de um produto - caminho construido manualmente como uuid[]
-- (array[p_produto_raiz_id] na base, array_append a cada nivel); ciclo
-- detectado quando o proximo componente ja aparece em a.caminho
-- (bi.componente_produto_id = any(a.caminho)). A linha que fecha o
-- ciclo e produzida (para o caminho legivel no erro), mas o "where
-- not a.ciclo" no JOIN impede expandir a partir dela - recursao
-- provadamente finita (caminho so cresce, universo de produto_id e'
-- finito por empresa), sem teto de profundidade artificial. tem_bom
-- calculado por no na mesma passada.
-- ---------------------------------------------------------------------

create or replace function public.bom_estrutura_alcancavel(
  p_empresa_id uuid,
  p_produto_raiz_id uuid
) returns table(produto_id uuid, caminho uuid[], profundidade integer, tem_bom boolean, ciclo boolean)
language sql
volatile
as $$
  with recursive alcance(produto_id, caminho, profundidade, tem_bom, ciclo) as (
    select
      p_produto_raiz_id,
      array[p_produto_raiz_id]::uuid[],
      0,
      public.resolver_bom_ativo_produto(p_empresa_id, p_produto_raiz_id) is not null,
      false
    union all
    select
      bi.componente_produto_id,
      array_append(a.caminho, bi.componente_produto_id),
      a.profundidade + 1,
      public.resolver_bom_ativo_produto(p_empresa_id, bi.componente_produto_id) is not null,
      bi.componente_produto_id = any(a.caminho)
    from alcance a
    join public.bom_itens bi
      on bi.bom_id = public.resolver_bom_ativo_produto(p_empresa_id, a.produto_id)
     and bi.componente_tipo = 'subconjunto'
     and bi.ativo = true
     and bi.deleted_at is null
    where not a.ciclo
  )
  select produto_id, caminho, profundidade, tem_bom, ciclo from alcance;
$$;

-- ---------------------------------------------------------------------
-- validar_estrutura_bom: definicao unica e central de "estrutura
-- valida" - grafo aciclico E todo subconjunto alcancavel tem BOM
-- resolvivel. RAISE (aborta a transacao) na primeira violacao
-- encontrada. Chamada pelos dois gatilhos abaixo.
-- ---------------------------------------------------------------------

create or replace function public.validar_estrutura_bom(
  p_empresa_id uuid,
  p_produto_raiz_id uuid
) returns void
language plpgsql
volatile
as $function$
declare
  v_linha record;
  v_caminho_legivel text;
begin
  select * into v_linha
    from public.bom_estrutura_alcancavel(p_empresa_id, p_produto_raiz_id)
    where ciclo
    order by profundidade limit 1;

  if found then
    select string_agg(ii.codigo, ' → ' order by ord) into v_caminho_legivel
      from unnest(v_linha.caminho) with ordinality as t(produto_id, ord)
      join public.itens_industriais ii on ii.id = t.produto_id;
    raise exception 'Estrutura inválida: ciclo detectado (%).', v_caminho_legivel;
  end if;

  select * into v_linha
    from public.bom_estrutura_alcancavel(p_empresa_id, p_produto_raiz_id)
    where profundidade > 0 and not tem_bom and not ciclo
    order by profundidade limit 1;

  if found then
    select string_agg(ii.codigo, ' → ' order by ord) into v_caminho_legivel
      from unnest(v_linha.caminho) with ordinality as t(produto_id, ord)
      join public.itens_industriais ii on ii.id = t.produto_id;
    raise exception 'Estrutura inválida: % não tem BOM cadastrado (caminho: %).',
      (select codigo from public.itens_industriais where id = v_linha.produto_id), v_caminho_legivel;
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- bom_produto_e_subconjunto_vivo: direcao contraria a travessia acima
-- - alguem depende deste produto como subconjunto agora? Necessaria
-- porque a travessia para frente nao enxerga quem aponta PARA o
-- produto que acabou de perder seu ultimo BOM resolvivel.
-- ---------------------------------------------------------------------

create or replace function public.bom_produto_e_subconjunto_vivo(
  p_empresa_id uuid,
  p_produto_id uuid
) returns uuid -- produto pai que depende dele (witness), ou NULL
language sql
volatile
as $$
  select b.produto_id
  from public.bom_itens bi
  join public.boms b on b.id = bi.bom_id
  where bi.componente_tipo = 'subconjunto'
    and bi.ativo = true
    and bi.deleted_at is null
    and bi.componente_produto_id = p_produto_id
    and bi.empresa_id = p_empresa_id
    and b.empresa_id = p_empresa_id
    and bi.bom_id = public.resolver_bom_ativo_produto(p_empresa_id, b.produto_id)
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- Gatilho bom_itens: valida a linha que esta sendo inserida/alterada.
-- Trava adquirida ANTES de qualquer leitura de estado compartilhado
-- (inclusive a checagem "componente tem BOM?"), para que toda mutacao
-- relevante de subconjuntos/BOMs da mesma empresa fique serializada
-- antes de qualquer decisao de integridade - fecha a janela de corrida
-- entre "componente tem BOM" e uma desativacao concorrente desse BOM.
-- ---------------------------------------------------------------------

create or replace function public.trg_bom_itens_validar_ciclo()
returns trigger
language plpgsql
as $function$
declare
  v_produto_pai uuid;
  v_bom_resolvido_pai uuid;
begin
  if new.componente_tipo <> 'subconjunto' or new.ativo is distinct from true or new.deleted_at is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('subconjunto-grafo:' || new.empresa_id::text, 0));

  if public.resolver_bom_ativo_produto(new.empresa_id, new.componente_produto_id) is null then
    raise exception 'Não é possível vincular % como subconjunto: produto sem roteiro cadastrado.',
      (
        select codigo
        from public.itens_industriais
        where id = new.componente_produto_id
          and empresa_id = new.empresa_id
      );
  end if;

  select produto_id into v_produto_pai
    from public.boms
    where id = new.bom_id
      and empresa_id = new.empresa_id;

  if v_produto_pai is null then
    raise exception 'bom_id % não encontrado ao validar subconjunto.', new.bom_id;
  end if;

  v_bom_resolvido_pai := public.resolver_bom_ativo_produto(new.empresa_id, v_produto_pai);
  if v_bom_resolvido_pai is distinct from new.bom_id then
    return new; -- linha fora do BOM resolvido - historica, validada quando (se) esse BOM for ativado
  end if;

  perform public.validar_estrutura_bom(new.empresa_id, v_produto_pai);

  return new;
end;
$function$;

drop trigger if exists bom_itens_validar_ciclo on public.bom_itens;
create trigger bom_itens_validar_ciclo
  after insert or update of bom_id, componente_produto_id, componente_tipo, ativo, deleted_at
  on public.bom_itens
  for each row
  execute function public.trg_bom_itens_validar_ciclo();

-- ---------------------------------------------------------------------
-- Gatilho boms: empresa_id/produto_id/created_at imutaveis apos o
-- INSERT (nada na aplicacao os edita hoje - confirmado por grep - e
-- editar qualquer um afetaria dois lados/duas empresas ao mesmo
-- tempo). status/ativo/deleted_at disparam revalidacao completa da
-- estrutura (para frente) e checagem de dependentes vivos (para tras).
-- ---------------------------------------------------------------------

create or replace function public.trg_boms_validar_ciclo()
returns trigger
language plpgsql
as $function$
declare
  v_precisa_validar boolean;
  v_produto_dependente uuid;
begin
  if TG_OP = 'UPDATE' then
    if new.empresa_id is distinct from old.empresa_id
       or new.produto_id is distinct from old.produto_id
       or new.created_at is distinct from old.created_at then
      raise exception 'empresa_id, produto_id e created_at de um BOM são imutáveis após a criação.';
    end if;
  end if;

  if TG_OP = 'INSERT' then
    v_precisa_validar := true;
  else
    v_precisa_validar :=
      new.status is distinct from old.status
      or new.ativo is distinct from old.ativo
      or new.deleted_at is distinct from old.deleted_at;
  end if;

  if not v_precisa_validar then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('subconjunto-grafo:' || new.empresa_id::text, 0));

  -- Pra frente: este produto continua com estrutura valida?
  perform public.validar_estrutura_bom(new.empresa_id, new.produto_id);

  -- Pra tras: se ele acabou de perder o ultimo BOM resolvivel, alguem depende dele?
  if public.resolver_bom_ativo_produto(new.empresa_id, new.produto_id) is null then
    v_produto_dependente := public.bom_produto_e_subconjunto_vivo(new.empresa_id, new.produto_id);
    if v_produto_dependente is not null then
      raise exception 'Não é possível remover/desativar o último BOM de %: usado como subconjunto por %.',
        (select codigo from public.itens_industriais where id = new.produto_id),
        (select codigo from public.itens_industriais where id = v_produto_dependente);
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists boms_validar_ciclo on public.boms;
create trigger boms_validar_ciclo
  after insert or update of status, ativo, deleted_at, produto_id, empresa_id, created_at
  on public.boms
  for each row
  execute function public.trg_boms_validar_ciclo();

-- ---------------------------------------------------------------------
-- ACL: SECURITY INVOKER em todas as funcoes - rodam sob RLS do usuario
-- que ja esta fazendo a escrita. authenticated precisa de EXECUTE
-- porque as funcoes de leitura sao chamadas de dentro dos gatilhos
-- (que rodam com o papel de quem disparou o INSERT/UPDATE, nao com um
-- papel privilegiado). public/anon revogados por padrao de menor
-- privilegio - nenhum client anonimo tem motivo para chamar isto
-- diretamente.
-- ---------------------------------------------------------------------

revoke execute on function public.resolver_bom_ativo_produto(uuid, uuid) from public, anon;
grant execute on function public.resolver_bom_ativo_produto(uuid, uuid) to authenticated;

revoke execute on function public.bom_estrutura_alcancavel(uuid, uuid) from public, anon;
grant execute on function public.bom_estrutura_alcancavel(uuid, uuid) to authenticated;

revoke execute on function public.validar_estrutura_bom(uuid, uuid) from public, anon;
grant execute on function public.validar_estrutura_bom(uuid, uuid) to authenticated;

revoke execute on function public.bom_produto_e_subconjunto_vivo(uuid, uuid) from public, anon;
grant execute on function public.bom_produto_e_subconjunto_vivo(uuid, uuid) to authenticated;

revoke execute on function public.trg_bom_itens_validar_ciclo() from public, anon;
revoke execute on function public.trg_boms_validar_ciclo() from public, anon;

-- Este projeto Supabase tem ALTER DEFAULT PRIVILEGES no schema public
-- concedendo EXECUTE a authenticated em toda funcao nova (confirmado
-- por leitura em pg_default_acl) - sem este revoke explicito,
-- authenticated teria EXECUTE nas duas funcoes de gatilho mesmo sem
-- nenhum grant aqui. Gatilhos rodam automaticamente; nenhum usuario
-- autenticado precisa chama-los diretamente - menor privilegio.
revoke execute on function public.trg_bom_itens_validar_ciclo() from authenticated;
revoke execute on function public.trg_boms_validar_ciclo() from authenticated;

commit;
