begin;

-- Corrige incompatibilidade real entre o RPC v2 de aprovacao
-- (service_role, sem JWT de usuario) e a trigger
-- trg_projetos_congelar_custos, que dependia de
-- empresa_atual_id()/auth.uid() (sempre null sob service_role).
-- Ver historico completo desta correcao nas revisoes 1 e 2 (revisadas
-- e rejeitadas antes de qualquer aplicacao - ambiguidade de overload,
-- elevacao de privilegio em congelar_custos_projeto, filtros de
-- tenant faltando, rollback incompleto). Revisao 3 corrige: falta de
-- transacao explicita, validacao de tenant do item via
-- itens_industriais (nao "produtos" - tabela inexistente neste
-- schema, confirmado por FK real), e restauracao exata de
-- ACL/comentario no rollback.

-- =========================================================
-- 1) Function interna de calculo de custo - empresa_id explicito,
--    todo filtro de tenant no WHERE (nao depende de RLS, porque roda
--    SECURITY DEFINER).
-- =========================================================
create or replace function public.calcular_custo_bom_interno(
  p_bom_id uuid,
  p_empresa_id uuid,
  p_profundidade integer default 0,
  p_excluir_materia_prima boolean default false
)
returns table (categoria text, valor numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
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

  if p_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if not exists (
    select 1 from public.boms
     where id = p_bom_id and empresa_id = p_empresa_id and deleted_at is null
  ) then
    raise exception 'Bom nao encontrado para a empresa atual.';
  end if;

  if not p_excluir_materia_prima then
    select coalesce(sum(
      public.converter_para_unidade_base(bi.quantidade, bi.unidade, mp.unidade)
        * mp.custo_referencia
    ), 0)
      into v_materia_prima
    from public.bom_itens bi
    join public.materias_primas mp on mp.id = bi.materia_prima_id
    where bi.bom_id = p_bom_id
      and bi.empresa_id = p_empresa_id
      and mp.empresa_id = p_empresa_id
      and bi.componente_tipo = 'materia_prima'
      and bi.ativo = true
      and bi.deleted_at is null
      and mp.custo_referencia is not null;
  end if;

  for v_item in
    select bi.quantidade, bi.componente_produto_id
    from public.bom_itens bi
    where bi.bom_id = p_bom_id
      and bi.empresa_id = p_empresa_id
      and bi.componente_tipo = 'subconjunto'
      and bi.ativo = true
      and bi.deleted_at is null
  loop
    select b.id into v_bom_filho_id
    from public.boms b
    where b.produto_id = v_item.componente_produto_id
      and b.empresa_id = p_empresa_id
      and b.deleted_at is null
    order by (b.status = 'ativo') desc, b.created_at desc
    limit 1;

    if v_bom_filho_id is not null then
      select t.valor into v_custo_filho
      from public.calcular_custo_bom_interno(v_bom_filho_id, p_empresa_id, p_profundidade + 1, p_excluir_materia_prima) t
      where t.categoria = 'total';

      v_subconjunto := v_subconjunto + v_item.quantidade * coalesce(v_custo_filho, 0);
    end if;
  end loop;

  select
    coalesce(sum((bo.tempo_estimado_minutos / 60.0) * rp.valor_hora)
      filter (where bo.tipo = 'engenharia'), 0),
    coalesce(sum((bo.tempo_estimado_minutos / 60.0) * rp.valor_hora)
      filter (where bo.tipo <> 'engenharia'), 0)
    into v_engenharia, v_mao_de_obra
  from public.bom_operacoes bo
  join public.recursos_produtivos rp on rp.id = bo.recurso_produtivo_id
  where bo.bom_id = p_bom_id
    and bo.empresa_id = p_empresa_id
    and rp.empresa_id = p_empresa_id
    and bo.ativo = true
    and bo.deleted_at is null;

  select coalesce(sum(bst.custo_estimado), 0)
    into v_terceiros
  from public.bom_servicos_terceiros bst
  where bst.bom_id = p_bom_id
    and bst.empresa_id = p_empresa_id
    and bst.ativo = true
    and bst.deleted_at is null;

  select coalesce(sum(btr.custo_estimado), 0)
    into v_logistica
  from public.bom_transportes btr
  where btr.bom_id = p_bom_id
    and btr.empresa_id = p_empresa_id
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

comment on function public.calcular_custo_bom_interno(uuid, uuid, integer, boolean) is
  'Mesmo calculo de calcular_custo_bom, com empresa_id recebido explicitamente e todo filtro de tenant explicito no WHERE - necessario porque roda SECURITY DEFINER, sem a protecao de RLS que a function publica original tinha. Chamada so pela function publica calcular_custo_bom e por congelar_custos_projeto_interno. Sem grant para public/anon/authenticated.';

revoke execute on function public.calcular_custo_bom_interno(uuid, uuid, integer, boolean) from public;
revoke execute on function public.calcular_custo_bom_interno(uuid, uuid, integer, boolean) from anon;
revoke execute on function public.calcular_custo_bom_interno(uuid, uuid, integer, boolean) from authenticated;

-- =========================================================
-- 2) Wrapper publico calcular_custo_bom: MESMA assinatura, mesmo
--    comentario original (nao sobrescrito aqui - o CREATE OR REPLACE
--    preserva ACL e comentario automaticamente quando a assinatura
--    nao muda; so o corpo muda). Precisa de SECURITY DEFINER para
--    poder chamar a function interna revogada de authenticated/anon.
-- =========================================================
create or replace function public.calcular_custo_bom(
  p_bom_id uuid,
  p_profundidade integer default 0,
  p_excluir_materia_prima boolean default false
)
returns table (categoria text, valor numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  return query
    select * from public.calcular_custo_bom_interno(p_bom_id, v_empresa_id, p_profundidade, p_excluir_materia_prima);
end;
$function$;

-- =========================================================
-- 3) Function interna de congelamento - substitui congelar_custos_projeto.
--    empresa_id explicito (a trigger fornece via NEW.empresa_id).
--    Valida: projeto existe para o par (p_projeto_id, p_empresa_id) -
--    erro explicito se nao, em vez de rodar zero iteracoes em
--    silencio; item pertence a empresa (projeto_itens.empresa_id);
--    produto do item pertence a empresa (EXISTS em itens_industriais -
--    tabela real referenciada pela FK produto_id, confirmada agora,
--    nao "produtos"); bom escolhido pertence a empresa.
-- =========================================================
create or replace function public.congelar_custos_projeto_interno(
  p_projeto_id uuid,
  p_empresa_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tipo_projeto text;
  v_excluir_materia_prima boolean;
  v_item record;
  v_bom_id uuid;
  v_custo_unitario numeric;
begin
  select tipo_projeto into v_tipo_projeto
  from public.projetos
  where id = p_projeto_id
    and empresa_id = p_empresa_id;

  if not found then
    raise exception 'Projeto % nao encontrado para a empresa %.', p_projeto_id, p_empresa_id;
  end if;

  v_excluir_materia_prima := (v_tipo_projeto = 'industrializacao');

  for v_item in
    select pi.id, pi.produto_id
    from public.projeto_itens pi
    where pi.projeto_id = p_projeto_id
      and pi.empresa_id = p_empresa_id
      and pi.ativo = true
      and pi.deleted_at is null
      and exists (
        select 1 from public.itens_industriais ii
        where ii.id = pi.produto_id
          and ii.empresa_id = p_empresa_id
      )
  loop
    select id into v_bom_id
    from public.boms
    where produto_id = v_item.produto_id
      and empresa_id = p_empresa_id
      and deleted_at is null
    order by (status = 'ativo') desc, created_at desc
    limit 1;

    v_custo_unitario := 0;

    if v_bom_id is not null then
      select t.valor into v_custo_unitario
      from public.calcular_custo_bom_interno(v_bom_id, p_empresa_id, 0, v_excluir_materia_prima) t
      where t.categoria = 'total';
    end if;

    update public.projeto_itens
    set custo_congelado = coalesce(v_custo_unitario, 0),
        custo_congelado_em = now(),
        custo_editado_manualmente = false
    where id = v_item.id
      and empresa_id = p_empresa_id;
  end loop;
end;
$function$;

comment on function public.congelar_custos_projeto_interno(uuid, uuid) is
  'Substitui congelar_custos_projeto (removida nesta migration - sem chamador vivo alem da trigger, confirmado por grep em src/ e supabase/migrations/*.sql). empresa_id explicito de NEW.empresa_id via trg_projetos_congelar_custos - nunca resolvido por sessao. Valida projeto/item/produto(itens_industriais)/bom pela empresa recebida. SECURITY DEFINER, sem grant para public/anon/authenticated.';

revoke execute on function public.congelar_custos_projeto_interno(uuid, uuid) from public;
revoke execute on function public.congelar_custos_projeto_interno(uuid, uuid) from anon;
revoke execute on function public.congelar_custos_projeto_interno(uuid, uuid) from authenticated;

drop function if exists public.congelar_custos_projeto(uuid);

-- =========================================================
-- 4) Trigger: chama a function interna com NEW.id/NEW.empresa_id.
--    SECURITY DEFINER para poder chamar as internas revogadas,
--    independente de quem disparou o UPDATE (authenticated ou
--    service_role).
-- =========================================================
create or replace function public.trg_projetos_congelar_custos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.status = 'rascunho' and new.status <> 'rascunho' then
    perform public.congelar_custos_projeto_interno(new.id, new.empresa_id);
  elsif old.status <> 'rascunho' and new.status = 'rascunho' then
    perform public.descongelar_custos_projeto(new.id);
  end if;
  return new;
end;
$function$;

comment on function public.trg_projetos_congelar_custos() is
  'SECURITY DEFINER (mudou nesta migration; nao tinha comentario antes) - precisa poder chamar congelar_custos_projeto_interno/calcular_custo_bom_interno independente de quem disparou o UPDATE de projetos.status (authenticated via v1/tela normal, ou service_role via aprovar_projeto_com_simulacao_v2). descongelar_custos_projeto nao mudou.';

revoke execute on function public.trg_projetos_congelar_custos() from public;
revoke execute on function public.trg_projetos_congelar_custos() from anon;
revoke execute on function public.trg_projetos_congelar_custos() from authenticated;

commit;
