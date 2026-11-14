-- NEXOTFE-PCP — Ação combinada Aprovar+Liberar OF (um único clique do PCP).
--
-- *** MIGRATION CANDIDATA — ARTEFATO DE DESENVOLVIMENTO ***
-- Decisão de negócio aprovada pelo usuário: a interface oficial
-- (/ordens/[id]) deve expor um único botão "Liberar OF". O sistema
-- continua precisando de duas transições internas distintas
-- (aprovar_of, liberar_of) quando a OF ainda está aguardando auditoria -
-- esta migration cria uma RPC fina que as orquestra NA MESMA
-- transação, sem alterar nenhuma das duas RPCs existentes.
--
-- NÃO aplicada contra o banco remoto/produção até autorização expressa
-- e separada (CLAUDE.md Regra 9). Testada SÓ em ambiente descartável
-- local. Ver
-- supabase/tests/pcp_aprovar_e_liberar_of_combinado_teste.sql.
--
-- Diagnóstico que motivou esta migration (investigação anterior,
-- confirmada por leitura direta do banco vinculado):
--   - aprovar_of já checa internamente a permissão granular
--     pcp.aprovar_of (via usuario_tem_permissao), desde a migration de
--     permissão granular.
--   - liberar_of NÃO checa nenhuma permissão do catálogo internamente -
--     confirmado lendo o corpo real agora. Hoje pcp.liberar_of só é
--     verificada na camada de Server Action (liberarOfPcpAction.ts).
--     Isso significa que simplesmente encadear as duas RPCs sem checar
--     explicitamente as duas permissões aqui deixaria pcp.liberar_of
--     sem NENHUMA checagem no caminho combinado.
--
-- Desenho (menor alteração possível - aprovar_of/liberar_of
-- reaproveitadas SEM NENHUMA mudança):
--   1. auth.uid()/empresa_atual_id() - mesmo padrão de aprovar_of,
--      nunca aceita identificador do navegador.
--   2. Confirma a OF existe (sem lock ainda - erro amigável rápido).
--   3. Adquire o lock of-transicao:<id> (mesmo namespace de aprovar_of/
--      liberar_of) e SÓ ENTÃO relê o estado efetivo da OF - é essa
--      releitura, nunca uma anterior, que decide o branch e a
--      idempotência (ver "Correção de concorrência" abaixo).
--   4. Se já aprovada+liberada: devolve ja_liberada direto, sem chamar
--      aprovar_of nem liberar_of de novo (só confirma pcp.liberar_of
--      antes, nenhuma gravação).
--   5. Se aguardando_auditoria+planejada: checa EXPLICITAMENTE as DUAS
--      permissões (pcp.aprovar_of E pcp.liberar_of) ANTES de qualquer
--      escrita - nunca presume uma pela outra. Só então chama
--      aprovar_of(p_of_id, p_observacao_aprovacao) (função existente,
--      inalterada - ela mesma volta a checar pcp.aprovar_of
--      internamente, checagem redundante e inofensiva, defesa em
--      profundidade).
--   6. Em qualquer outro estado: checa SÓ pcp.liberar_of (liberar_of
--      não checa nenhuma permissão por conta própria - esta é a ÚNICA
--      barreira de permissão do caminho "só liberar").
--   7. Sempre chama liberar_of(p_of_id, auth.uid(), p_motivo_liberacao)
--      (função existente, inalterada) - usa o uid resolvido no passo 1,
--      nunca um parâmetro vindo do chamador.
--
-- Correção de concorrência (achado real do teste de 2 conexões
-- simultâneas, ANTES desta correção): a versão original decidia o
-- branch (chamar aprovar_of ou não) lendo a OF ANTES de qualquer lock.
-- Sob corrida real, a 2ª conexão lia o estado pré-A (correto por MVCC,
-- A ainda não comitou), decidia "preciso aprovar", só then tentava o
-- lock dentro de aprovar_of - onde ficava presa até A comitar. Ao ser
-- liberada, o estado já tinha mudado (A terminou) e aprovar_of
-- rejeitava com "transicao invalida", em vez da ação combinada
-- reconhecer que já estava tudo feito. Nenhuma corrupção de dado
-- ocorria (a transação de B revertia sozinha), mas a 2ª tentativa
-- nunca recebia o ja_liberada gracioso que liberar_of sozinha já dá.
-- Corrigido movendo a aquisição do lock (passo 3) para ANTES de
-- qualquer decisão de branch - a decisão passa a ser sempre sobre o
-- estado efetivo, nunca uma leitura desatualizada.
--
-- Atomicidade: é uma ÚNICA chamada de função = uma única transação
-- Postgres. Qualquer exceção levantada por aprovar_of OU liberar_of
-- propaga e aborta a chamada inteira - reverte TUDO (aprovação +
-- qualquer necessidade de material já gerada), nunca deixa a OF
-- parcialmente aprovada sem liberar. Testado explicitamente no arquivo
-- de teste (cenário de rollback: aprovação ocorre, liberação falha por
-- Momento Y pendente, estado final confirmado como se nada tivesse
-- acontecido).
--
-- Locks: of-transicao:<id> agora é adquirido no TOPO desta função,
-- antes de qualquer branch - mesmo namespace já usado por aprovar_of/
-- liberar_of/cancelar_of/reprovar_of/resubmeter_of_para_auditoria.
-- aprovar_of (+ subconjunto-grafo:<empresa>, condicional) e liberar_of
-- voltam a adquirir o MESMO lock of-transicao:<id> nas chamadas
-- aninhadas - advisory locks são reentrantes na MESMA transação/
-- sessão backend, a reaquisição é um no-op seguro (mesmo pid), nunca
-- um deadlock. A ORDEM RELATIVA entre of-transicao e subconjunto-grafo
-- não muda (of-transicao sempre primeiro) - nenhuma ordem nova
-- introduzida entre transações diferentes, nenhum risco de deadlock
-- novo. Único efeito colateral aceito: a checagem de permissão agora
-- ocorre com o lock já detido (antes ocorria sem lock, dentro de
-- aprovar_of) - mais correto (decide sobre o estado real), sem
-- nenhuma outra escrita concorrente possível nesse intervalo.
--
-- Rastreabilidade: registrar_historico_estado_of dispara uma vez por
-- UPDATE, sem nenhuma mudança - uma aprovação+liberação combinada
-- grava DUAS linhas de histórico (uma por transição), cada uma com o
-- ator real (auth.uid(), o mesmo nas duas). Nenhum histórico antigo é
-- tocado.
--
-- GRANT: só a `authenticated` (mesmo padrão de aprovar_of) - nunca
-- service_role, nunca chamável sem sessão real.
create or replace function public.aprovar_e_liberar_of(
  p_of_id uuid,
  p_observacao_aprovacao text default null,
  p_motivo_liberacao text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid;
  v_empresa_id uuid;
  v_of record;
  v_resultado_aprovacao jsonb;
  v_resultado_liberacao jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'aprovar_e_liberar_of: sessao invalida.';
  end if;

  v_empresa_id := public.empresa_atual_id();
  if v_empresa_id is null then
    raise exception 'aprovar_e_liberar_of: empresa atual nao encontrada.';
  end if;

  perform 1 from public.ordens_fabricacao where id = p_of_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'aprovar_e_liberar_of: OF nao encontrada.';
  end if;

  -- Lock ANTES de decidir qualquer branch (ver "Correção de
  -- concorrência" no cabeçalho desta migration) - mesmo namespace já
  -- usado por aprovar_of/liberar_of, reentrante na mesma transação.
  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));

  -- Releitura OBRIGATÓRIA sob o lock - é ESTA leitura, nunca uma
  -- anterior, que decide o branch e a idempotência.
  select * into v_of from public.ordens_fabricacao where id = p_of_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'aprovar_e_liberar_of: OF nao encontrada.';
  end if;

  -- Idempotência da ação COMBINADA: se outra chamada concorrente já
  -- concluiu todo o trabalho (aprovada+liberada) enquanto esta
  -- esperava o lock, nunca repete aprovação, liberação ou qualquer
  -- gravação - só confirma a permissão de liberação (mesma checagem
  -- que sempre protegeria este caminho) e devolve ja_liberada.
  if v_of.estado_aprovacao = 'aprovada' and v_of.estado_execucao = 'liberada' then
    if not coalesce(public.usuario_tem_permissao(v_uid, 'pcp.liberar_of'), false) then
      raise exception 'aprovar_e_liberar_of: usuario sem permissao para liberar OF.';
    end if;

    return jsonb_build_object(
      'resultado', 'ja_liberada',
      'of_id', p_of_id,
      'numero_of', v_of.numero_of,
      'aprovacao_realizada', false,
      'resultado_aprovacao', null,
      'resultado_liberacao', jsonb_build_object('resultado', 'ja_liberada', 'of_id', p_of_id, 'numero_of', v_of.numero_of)
    );
  end if;

  if v_of.estado_aprovacao = 'aguardando_auditoria' and v_of.estado_execucao = 'planejada' then
    -- Caminho combinado: as DUAS permissões, nunca uma presumindo a
    -- outra (decisao explicita do usuario).
    if not coalesce(public.usuario_tem_permissao(v_uid, 'pcp.aprovar_of'), false) then
      raise exception 'aprovar_e_liberar_of: usuario sem permissao para aprovar OF.';
    end if;
    if not coalesce(public.usuario_tem_permissao(v_uid, 'pcp.liberar_of'), false) then
      raise exception 'aprovar_e_liberar_of: usuario sem permissao para liberar OF.';
    end if;

    v_resultado_aprovacao := public.aprovar_of(p_of_id, p_observacao_aprovacao);
  else
    -- Caminho "só liberar" - liberar_of nao checa nenhuma permissao por
    -- conta propria, esta e a UNICA barreira aqui.
    if not coalesce(public.usuario_tem_permissao(v_uid, 'pcp.liberar_of'), false) then
      raise exception 'aprovar_e_liberar_of: usuario sem permissao para liberar OF.';
    end if;
  end if;

  v_resultado_liberacao := public.liberar_of(p_of_id, v_uid, p_motivo_liberacao);

  return jsonb_build_object(
    'resultado', v_resultado_liberacao->>'resultado',
    'of_id', p_of_id,
    'numero_of', v_of.numero_of,
    'aprovacao_realizada', (v_resultado_aprovacao is not null),
    'resultado_aprovacao', v_resultado_aprovacao,
    'resultado_liberacao', v_resultado_liberacao
  );
end;
$function$;

comment on function public.aprovar_e_liberar_of(uuid, text, text) is
  'Acao combinada do PCP (um unico clique): orquestra aprovar_of + liberar_of NA MESMA transacao, sem alterar nenhuma das duas. Lock of-transicao:<id> adquirido ANTES de decidir o branch - releitura sob lock decide branch/idempotencia (ja_liberada direto, sem repetir gravacao, se outra chamada concorrente ja terminou o trabalho). Checa EXPLICITAMENTE pcp.aprovar_of (so quando aguardando_auditoria+planejada) e pcp.liberar_of (sempre, inclusive no caminho idempotente) - liberar_of nao checa nenhuma permissao por conta propria. Qualquer falha em qualquer etapa reverte tudo (atomicidade de transacao unica). Gera 2 linhas de historico quando passa pelas 2 transicoes, nenhuma delas reescrita.';

revoke all on function public.aprovar_e_liberar_of(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.aprovar_e_liberar_of(uuid, text, text) to authenticated;
