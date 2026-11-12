-- NEXOTFE-PCP — Rastreabilidade de autoria em liberacao/cancelamento de OF.
--
-- Preparada em resposta a uma lacuna real encontrada: liberar_of/
-- cancelar_of recebem um ator explicito por parametro (p_liberado_por/
-- p_cancelado_por), validado contra a empresa da OF, mas o trigger de
-- historico (registrar_historico_estado_of) so sabia ler auth.uid() -
-- que fica NULL quando a chamada vem do client de servico (caso real
-- de liberar_of/cancelar_of, que nunca tem GRANT de UPDATE para o
-- client de sessao). Confirmado em dado real: a liberacao de
-- 260015-0002 e o cancelamento de 260014-0001 ja tem alterado_por=NULL,
-- origem='operacao_administrativa' no historico, por este motivo.
--
-- APLICADA no banco vinculado em 2026-11-12, apos: (1) validacao
-- funcional completa em ambiente descartavel local (ver
-- supabase/tests/rastreabilidade_liberacao_cancelamento_of_teste.sql,
-- 6/6 cenarios OK), e (2) verificacao de compatibilidade somente-leitura
-- contra o banco vinculado (liberar_of/cancelar_of/
-- registrar_historico_estado_of byte-identicos a base usada aqui;
-- colunas novas inexistentes antes; GRANTs/owner/security definer
-- confirmados preservados depois). Nenhum registro historico anterior
-- foi alterado (260015-0002/260014-0001 confirmados ainda NULL nas
-- colunas novas apos a aplicacao - sem backfill, como decidido).
--
-- Desenho (espelha o padrao JA EXISTENTE e comprovado de
-- estado_aprovacao_por/estado_aprovacao_em, usado por aprovar_of/
-- reprovar_of/resubmeter_of_para_auditoria ha tempo):
--   1. 2 colunas novas em ordens_fabricacao: estado_execucao_por uuid
--      (FK auth.users, igual estado_aprovacao_por) e estado_execucao_em
--      timestamptz. Ambas NULL por padrao - nenhuma linha existente
--      precisa de backfill (decisao explicita do usuario: nao
--      preencher retroativamente sem decisao especifica).
--   2. liberar_of/cancelar_of passam a gravar essas 2 colunas no MESMO
--      UPDATE que ja faziam (mesmo WHERE condicional, mesmo advisory
--      lock, nenhuma mudanca de protecao de concorrencia) - usando
--      exatamente o ator ja validado contra a empresa da OF, nenhuma
--      validacao nova.
--   3. registrar_historico_estado_of passa a usar
--      coalesce(auth.uid(), new.estado_execucao_por) SO no ramo em que
--      estado_execucao mudou - o ramo de estado_aprovacao continua
--      100% auth.uid(), sem nenhuma mudanca de comportamento para
--      aprovar_of/reprovar_of/resubmeter_of_para_auditoria/ajustar_of.
--
-- Seguranca (ver checklist pedido pelo usuario, validado no preflight
-- descartavel):
--   - estado_execucao_por so e gravado dentro das proprias RPCs
--     SECURITY DEFINER, depois de validarem que o ator pertence a
--     mesma empresa da OF - nenhum client comum tem GRANT de UPDATE em
--     ordens_fabricacao (confirmado: authenticated so tem SELECT), e
--     nenhuma outra via de escrita alcanca essa coluna. Nao ha
--     possibilidade de atribuir a acao a outro usuario via esta coluna.
--   - A coluna reflete o ator da ULTIMA transicao de estado_execucao
--     da OF (liberar -> cancelar sobrescreve), exatamente como
--     estado_aprovacao_por/estado_aprovacao_em ja fazem para aprovacao
--     (reprovar sobrescreve estado_aprovacao_por de uma aprovacao
--     anterior). A autoria PERMANENTE de cada transicao individual nao
--     depende desta coluna - fica em
--     ordens_fabricacao_historico_estados, que e append-only (uma
--     linha nova por transicao, nunca sobrescrita) e grava
--     alterado_por no MOMENTO EXATO de cada transicao, antes de
--     qualquer sobrescrita futura da coluna na OF.
--   - Idempotencia preservada: o caminho 'ja_liberada' de liberar_of
--     (nenhuma transicao real) nao executa este UPDATE, logo nunca
--     reescreve a autoria de uma liberacao anterior so por repetir a
--     chamada.

alter table public.ordens_fabricacao
  add column estado_execucao_por uuid references auth.users(id),
  add column estado_execucao_em timestamptz;

comment on column public.ordens_fabricacao.estado_execucao_por is
  'Ator validado da ULTIMA transicao de estado_execucao (liberar_of/cancelar_of) - gravado so dentro dessas RPCs, nunca por escrita direta. Reflete a transicao mais recente, nao o historico completo (ver ordens_fabricacao_historico_estados para isso).';
comment on column public.ordens_fabricacao.estado_execucao_em is
  'Timestamp da ULTIMA transicao de estado_execucao via liberar_of/cancelar_of - mesmo escopo de estado_execucao_por.';

create or replace function public.liberar_of(p_of_id uuid, p_liberado_por uuid, p_motivo text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_of record;
  v_empresa_id uuid;
  v_liberado_por_empresa_id uuid;
  v_regime_momento_y text;
begin
  select empresa_id into v_empresa_id from public.ordens_fabricacao where id = p_of_id;
  if v_empresa_id is null then
    raise exception 'liberar_of: OF % nao encontrada.', p_of_id;
  end if;

  select empresa_id into v_liberado_por_empresa_id from public.usuarios where id = p_liberado_por;
  if v_liberado_por_empresa_id is null or v_liberado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'liberar_of: liberado_por % nao e um usuario valido da empresa % da OF %.', p_liberado_por, v_empresa_id, p_of_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));

  select * into v_of from public.ordens_fabricacao where id = p_of_id;

  if v_of.estado_aprovacao = 'aprovada' and v_of.estado_execucao = 'liberada' then
    return jsonb_build_object('resultado', 'ja_liberada', 'of_id', v_of.id, 'numero_of', v_of.numero_of);
  end if;

  if v_of.estado_aprovacao is distinct from 'aprovada' or v_of.estado_execucao is distinct from 'planejada' then
    raise exception 'liberar_of: OF % em %/% nao pode ser liberada - precisa estar aprovada+planejada.', p_of_id, v_of.estado_aprovacao, v_of.estado_execucao;
  end if;

  -- Momento Y (REVISÃO 1): decisão de regime sempre via
  -- determinar_regime_momento_y_of - nunca reimplementada inline aqui.
  -- 'legado' e 'confirmado_momento_y' liberam; só 'pendente_momento_y'
  -- bloqueia (ver prova de exaustividade no comentário da função).
  v_regime_momento_y := public.determinar_regime_momento_y_of(p_of_id, v_empresa_id);
  if v_regime_momento_y = 'pendente_momento_y' then
    raise exception 'liberar_of: OF % ainda nao teve as materias-primas conferidas (Momento Y pendente).', p_of_id;
  end if;

  update public.ordens_fabricacao
    set estado_execucao = 'liberada',
        estado_execucao_observacao = p_motivo,
        estado_execucao_por = p_liberado_por,
        estado_execucao_em = now()
    where id = p_of_id
      and estado_aprovacao = 'aprovada'
      and estado_execucao = 'planejada';

  if not found then
    raise exception 'liberar_of: falha ao liberar OF % - estado mudou durante a operacao.', p_of_id;
  end if;

  return jsonb_build_object('resultado', 'liberada', 'of_id', p_of_id, 'numero_of', v_of.numero_of);
end;
$function$;

create or replace function public.cancelar_of(p_of_id uuid, p_cancelado_por uuid, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_of record;
  v_empresa_id uuid;
  v_cancelado_por_empresa_id uuid;
  v_existe_sessao_aberta boolean;
  v_existe_apontamento boolean;
  v_existe_retirada boolean;
  v_reserva record;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'cancelar_of: motivo é obrigatório.';
  end if;

  select empresa_id into v_empresa_id from public.ordens_fabricacao where id = p_of_id;
  if v_empresa_id is null then
    raise exception 'cancelar_of: OF % não encontrada.', p_of_id;
  end if;

  select empresa_id into v_cancelado_por_empresa_id from public.usuarios where id = p_cancelado_por;
  if v_cancelado_por_empresa_id is null or v_cancelado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'cancelar_of: cancelado_por % não é um usuário válido da empresa % da OF %.', p_cancelado_por, v_empresa_id, p_of_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao:' || p_of_id::text, 0));

  select * into v_of from public.ordens_fabricacao where id = p_of_id;

  if v_of.estado_aprovacao is distinct from 'aprovada' then
    raise exception 'cancelar_of: OF % não está aprovada (estado_aprovacao=%) - use reprovar_of para OFs ainda em auditoria.', p_of_id, v_of.estado_aprovacao;
  end if;

  if v_of.estado_execucao not in ('planejada', 'liberada', 'em_producao') then
    raise exception 'cancelar_of: OF % em estado_execucao=% não pode ser cancelada por esta via.', p_of_id, v_of.estado_execucao;
  end if;

  if v_of.estado_execucao = 'em_producao' then
    select exists(
      select 1
      from public.ordens_fabricacao_operacoes op
      where op.of_id = p_of_id
        and exists (
          select 1 from public.of_apontamentos a
          where a.op_id = op.id
            and a.ocorrido_em = (
              select max(a2.ocorrido_em) from public.of_apontamentos a2 where a2.op_id = op.id
            )
            and a.tipo_evento in ('iniciar', 'retomar')
        )
    ) into v_existe_sessao_aberta;

    if v_existe_sessao_aberta then
      raise exception 'Existe apontamento em andamento nesta OF. Pause ou finalize a sessão antes de cancelar.';
    end if;
  end if;

  select exists(
    select 1 from public.of_apontamentos a
    join public.ordens_fabricacao_operacoes op on op.id = a.op_id
    where op.of_id = p_of_id
  ) into v_existe_apontamento;

  if v_existe_apontamento then
    raise exception 'cancelar_of: OF % possui apontamento real de execução registrado - cancelamento simples não permitido; exige reprovação produtiva (fluxo a ser formalizado, ainda não implementado).', p_of_id;
  end if;

  select exists(
    select 1 from public.estoque_movimentacoes
    where tipo_movimento = 'saida'
      and (
        (v_of.of_pai_id is not null and of_filha_id = p_of_id)
        or (v_of.of_pai_id is null and of_id = p_of_id and of_filha_id is null)
      )
  ) into v_existe_retirada;

  if v_existe_retirada then
    raise exception 'cancelar_of: OF % possui retirada física de material registrada - cancelamento simples não permitido; exige reprovação produtiva (fluxo a ser formalizado, ainda não implementado).', p_of_id;
  end if;

  update public.ordens_fabricacao
    set estado_execucao = 'cancelada',
        estado_execucao_observacao = p_motivo,
        estado_execucao_por = p_cancelado_por,
        estado_execucao_em = now()
    where id = p_of_id
      and estado_execucao = v_of.estado_execucao;

  if not found then
    raise exception 'cancelar_of: falha ao cancelar OF % - estado mudou durante a operação.', p_of_id;
  end if;

  for v_reserva in
    select em.id,
      em.quantidade - coalesce((
        select sum(em2.quantidade) from public.estoque_movimentacoes em2
        where em2.reserva_origem_id = em.id
      ), 0) as restante
    from public.estoque_movimentacoes em
    where em.tipo_movimento = 'reserva'
      and (
        (v_of.of_pai_id is not null and em.of_filha_id = p_of_id)
        or (v_of.of_pai_id is null and em.of_id = p_of_id and em.of_filha_id is null)
      )
  loop
    if v_reserva.restante > 0 then
      perform public.liberar_reserva_material_of(
        v_reserva.id, p_cancelado_por,
        'Liberação automática por cancelamento da OF ' || v_of.numero_of,
        'cancelamento-of-' || p_of_id::text || '-reserva-' || v_reserva.id::text
      );
    end if;
  end loop;

  return jsonb_build_object('resultado', 'cancelada', 'of_id', p_of_id, 'numero_of', v_of.numero_of);
end;
$function$;

create or replace function public.registrar_historico_estado_of()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_deve_registrar boolean := false;
  v_estado_aprovacao_anterior text;
  v_estado_execucao_anterior text;
  v_alterado_por uuid;
  v_origem text;
begin
  if tg_op = 'INSERT' then
    v_deve_registrar := true;
    v_estado_aprovacao_anterior := null;
    v_estado_execucao_anterior := null;
    v_alterado_por := auth.uid();
  elsif tg_op = 'UPDATE' then
    if new.estado_aprovacao is distinct from old.estado_aprovacao
       or new.estado_execucao is distinct from old.estado_execucao then
      v_deve_registrar := true;
      v_estado_aprovacao_anterior := old.estado_aprovacao;
      v_estado_execucao_anterior := old.estado_execucao;
    end if;

    -- Transições de estado_execucao (liberar_of/cancelar_of) são
    -- sempre chamadas pelo client de serviço - a RPC valida o ator
    -- explícito por parâmetro, nunca por auth.uid() (client de sessão
    -- não tem GRANT de UPDATE em ordens_fabricacao). auth.uid() fica
    -- NULL nesse caminho, e SÓ nesse caso usamos estado_execucao_por
    -- como alternativa - essa coluna só é gravada dentro da própria
    -- RPC (SECURITY DEFINER), nunca por escrita direta de um client
    -- comum, então não representa um valor "forjado" vindo do
    -- chamador. Transições de estado_aprovacao continuam
    -- exclusivamente por auth.uid(), sem nenhuma mudança.
    if new.estado_execucao is distinct from old.estado_execucao then
      v_alterado_por := coalesce(auth.uid(), new.estado_execucao_por);
    else
      v_alterado_por := auth.uid();
    end if;
  end if;

  if not v_deve_registrar then
    return new;
  end if;

  v_origem := case when v_alterado_por is not null then 'rpc' else 'operacao_administrativa' end;

  insert into public.ordens_fabricacao_historico_estados (
    empresa_id, of_id,
    estado_aprovacao_anterior, estado_aprovacao_novo,
    estado_execucao_anterior, estado_execucao_novo,
    alterado_por, observacao, observacao_execucao, origem
  ) values (
    new.empresa_id, new.id,
    v_estado_aprovacao_anterior, new.estado_aprovacao,
    v_estado_execucao_anterior, new.estado_execucao,
    v_alterado_por, new.estado_aprovacao_observacao, new.estado_execucao_observacao, v_origem
  );

  return new;
end;
$function$;
