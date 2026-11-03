-- NEXOTFE-PCP-ETAPA2O.5H — Proteção transacional dos estados finais da OF
-- (concluida/cancelada/desdobrada) e sincronização de locks entre as
-- transições administrativas (cancelar_of/desdobrar_of/encerrar_of) e as
-- operações comuns da OF.
--
-- *** MIGRATION CANDIDATA — ARTEFATO DE DESENVOLVIMENTO ***
-- Validada em sandbox PostgreSQL local descartável (`nexotfe-sbx-pcp-
-- fatia1` e, em rodada de verificação independente, um segundo sandbox
-- limpo criado só para esta validação) — NÃO aplicada contra o banco
-- remoto/produção até autorização expressa e separada, por escrita
-- específica (CLAUDE.md Regra 9).
--
-- DEPENDÊNCIA DE APLICAÇÃO: esta migration pressupõe que
-- `20261103100000_etapa2o5g_integridade_concorrencia_operacoes_of.sql`
-- já foi aplicada antes dela (ordem cronológica do nome do arquivo já
-- garante isso num `supabase db reset`/`db push` normal). As 6 funções
-- corrigidas pela 2O.5G (`alterar_y_operacao`, `criar_op_no_y`,
-- `marcar_op_nao_aplicavel`, `alterar_dependencia_operacao`,
-- `registrar_apontamento`, `regularizar_apontamento`) NÃO são tocadas
-- aqui - nenhuma linha, nenhum `CREATE OR REPLACE` sobre elas. Esta
-- migration só altera os 4 triggers compartilhados (infraestrutura do
-- P6E) e as 3 funções de transição administrativa (P7C/ETAPA1E) que já
-- existiam antes da 2O.5G.
--
-- Origem: cada função/trigger abaixo foi extraído via
-- `pg_get_functiondef` diretamente do sandbox, depois de cada correção
-- ter sido testada lá - nunca reconstruído de memória ou de versão
-- histórica ultrapassada. `encerrar_of` foi conferido contra a versão
-- do P6E (20261015120000, única que a definiu); `cancelar_of` contra a
-- versão da ETAPA1E (20261023150000, mais recente que a do P7C);
-- `desdobrar_of` contra a versão do P7C (20261016090000, única que a
-- definiu).
--
-- =====================================================================
-- Regras de negócio preservadas (nenhuma redecidida aqui):
-- =====================================================================
--   1. OF em produção (liberada/em_producao) pode receber novas OPs -
--      `criar_op_no_y` (2O.5G) continua intocada; o novo lock de nível 2
--      em `cancelar_of`/`desdobrar_of`/`encerrar_of` só serializa contra
--      uma transição administrativa concorrente, nunca bloqueia OF ativa.
--   2. OP com execução registrada tem Y bloqueado - bloqueio da 2O.5G,
--      intocado; esta migration só fecha a lacuna de OF em estado final
--      SEM execução registrada (ex.: cancelada/desdobrada, que exigem
--      zero apontamentos por precondição própria de cancelar_of/
--      desdobrar_of).
--   3. OF concluida/cancelada/desdobrada fica congelada operacionalmente
--      - os 4 triggers abaixo passam a bloquear os 3 estados, não só
--      concluida.
--   4. Nenhuma exceção para regularização comum em OF final - decisão
--      definitiva do usuário; `impedir_escrita_via_op_of_encerrada`
--      (usada por `regularizar_apontamento`) bloqueia os 3 estados, sem
--      excepcionalidade.
--   5. Cancelamento/desdobramento preservam justificativa, autoria e
--      rastreabilidade - `cancelar_of`/`desdobrar_of` continuam exigindo
--      motivo obrigatório e gravando auditoria, sem nenhuma mudança
--      nessa parte do corpo.
--   6. Roteiro original X e apontamentos históricos Z nunca são
--      reescritos - nenhuma das funções desta migration faz UPDATE/
--      DELETE em `of_apontamentos` (append-only, trigger incondicional
--      do P6E, intocado) nem em `bom_operacoes`/`bom_operacao_id`.
--   7. Motor PCP e Simulação Comercial não são mencionados nem tocados
--      em nenhuma linha desta migration.
--
-- =====================================================================
-- Hierarquia de locks (ver 2O.5G para níveis 1-4; nível 0 é novo aqui):
-- =====================================================================
--   nível 0 — 'of-transicao:<of_id>'            (convenção já
--             estabelecida por liberar_of/criar_of_substituta/
--             registrar_retirada_material_of; `encerrar_of` passa a
--             usá-la também, alinhando-se à convenção)
--   nível 1 — 'of_dependencias:<of_id>'          (2O.5G)
--   nível 2 — 'ordens_fabricacao:<of_id>'        (2O.5G + aqui)
--   nível 3 — 'ordens_fabricacao_operacoes:<op_id>' (2O.5G)
--   nível 4 — 'funcionario_apontamento:<funcionario_id>' (2O.5G)
--
-- `cancelar_of`/`desdobrar_of` passam a adquirir nível 0 (já tinham) e
-- nível 2 (novo, nesta ordem). `encerrar_of` passa a adquirir nível 0
-- (novo) antes do nível 2 que já tinha.
--
-- ACHADO CRÍTICO DESTA FATIA, resolvido com `pg_try_advisory_xact_lock`
-- (NÃO BLOQUEANTE): as funções da 2O.5G `alterar_y_operacao` (nível 3
-- só) e `alterar_dependencia_operacao` (níveis 1+3 só) NUNCA adquirem o
-- nível 2 - sem alterá-las (proibido), a única forma de sincronizá-las
-- com `cancelar_of`/`desdobrar_of` é injetar o lock de nível 2 dentro
-- dos triggers que ambas já disparam em toda escrita
-- (`impedir_escrita_operacao_of_encerrada` e
-- `impedir_dependencia_of_encerrada`). Usar a versão BLOQUEANTE do lock
-- aqui inverteria a ordem de aquisição dentro dessas duas funções
-- (nível 3/1 já adquirido pela própria função, nível 2 só depois, via
-- trigger) - exatamente a receita de deadlock contra `registrar_
-- apontamento` (que adquire nível 2 antes do nível 3). A versão NÃO
-- BLOQUEANTE elimina esse risco por construção: uma tentativa que nunca
-- espera não pode ser o lado de um ciclo de espera. Testado nas duas
-- ordens de chegada, com 2 conexões reais, zero deadlock em todos os
-- testes - mas ausência de deadlock nos testes não é tratada como
-- garantia universal (ver comentário de `impedir_escrita_operacao_of_
-- encerrada` abaixo); o mecanismo de detecção nativo do PostgreSQL
-- continua sendo a rede de segurança final, e o chamador (futura
-- Server Action) precisa tratar o erro de rejeição (e um eventual
-- `deadlock_detected`) como retryable.
--
-- `registrar_apontamento` (2O.5G) JÁ adquire o nível 2 explicitamente
-- antes de escrever em `of_apontamentos` - por isso o trigger dessa
-- tabela (`impedir_escrita_apontamento_of_encerrada`) NÃO precisa do
-- lock injetado (reaquisição da mesma chave pela mesma sessão seria
-- redundante, não incorreta, mas desnecessária - mantido enxuto).
--
-- =====================================================================
-- Escopo EXCLUÍDO desta migration (decisões de negócio ainda pendentes
-- ou fora deste domínio):
-- =====================================================================
--   - Alerta/bloqueio de início de apontamento por dependência não
--     concluída (fora do escopo de integridade/concorrência).
--   - Validação de sequência lógica dos eventos de apontamento.
--   - Qualquer alteração em `criar_of_substituta` - já respeita a
--     fronteira da OF cancelada por construção (nunca escreve em
--     `ordens_fabricacao_operacoes`/`of_apontamentos`/
--     `of_operacao_dependencias` da OF cancelada), confirmado por
--     leitura e teste; não precisa de nenhum lock novo.
--   - Estado `suspensa` - nenhuma RPC atual transiciona para esse
--     valor; não alterado.
--   - Motor PCP, Simulação Comercial, Server Actions, Revisão 3.
begin;

-- =====================================================================
-- 1/7 — impedir_escrita_operacao_of_encerrada (trigger de
--       ordens_fabricacao_operacoes - dispara em criar_op_no_y,
--       alterar_y_operacao, marcar_op_nao_aplicavel).
-- ANTES: só bloqueava 'concluida'. Sem lock - não sincronizava com uma
-- transição administrativa em andamento (comprovado: corrida B3 real,
-- sem este lock, permitia alterar_y_operacao durante cancelar_of/
-- desdobrar_of ainda não comitados).
-- DEPOIS: bloqueia os 3 estados finais; lock não bloqueante de nível 2
-- ANTES da leitura de estado - fecha B3 sem risco de deadlock.
-- =====================================================================
create or replace function public.impedir_escrita_operacao_of_encerrada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_of_id uuid := coalesce(new.of_id, old.of_id);
  v_estado_execucao text;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('ordens_fabricacao:' || v_of_id::text, 0)) then
    raise exception 'ordens_fabricacao_operacoes: nao foi possivel confirmar o estado da OF % - outra transicao administrativa (cancelamento/desdobramento/encerramento) esta em andamento, tente novamente.', v_of_id;
  end if;

  select estado_execucao into v_estado_execucao
  from public.ordens_fabricacao
  where id = v_of_id;

  if v_estado_execucao in ('concluida', 'cancelada', 'desdobrada') then
    raise exception 'OF % esta em estado final (%) - nenhuma OP pode ser criada/alterada (operacoes comuns ficam congeladas apos concluida/cancelada/desdobrada).', v_of_id, v_estado_execucao;
  end if;

  return coalesce(new, old);
end;
$function$;

comment on function public.impedir_escrita_operacao_of_encerrada() is
  'ETAPA 2O.5H: bloqueia concluida/cancelada/desdobrada (antes: só concluida). Lock nao bloqueante de nivel 2 injetado - sincroniza alterar_y_operacao/marcar_op_nao_aplicavel/criar_op_no_y (2O.5G) contra cancelar_of/desdobrar_of/encerrar_of em andamento, sem poder formar deadlock (tentativa nao bloqueante nunca espera - nao e garantia universal contra deadlock formado por outros mecanismos, so por este lock especifico).';

-- =====================================================================
-- 2/7 — impedir_escrita_apontamento_of_encerrada (trigger de
--       of_apontamentos - dispara em registrar_apontamento).
-- ANTES: só bloqueava 'concluida'.
-- DEPOIS: bloqueia os 3 estados finais. SEM lock injetado aqui -
-- registrar_apontamento (2O.5G) ja adquire o nivel 2 explicitamente
-- antes de chegar a este INSERT; reaquisicao seria redundante.
-- =====================================================================
create or replace function public.impedir_escrita_apontamento_of_encerrada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_of_id uuid := coalesce(new.of_id, old.of_id);
  v_estado_execucao text;
begin
  select estado_execucao into v_estado_execucao
  from public.ordens_fabricacao
  where id = v_of_id;

  if v_estado_execucao in ('concluida', 'cancelada', 'desdobrada') then
    raise exception 'OF % esta em estado final (%) - nenhum apontamento pode ser criado.', v_of_id, v_estado_execucao;
  end if;

  return coalesce(new, old);
end;
$function$;

comment on function public.impedir_escrita_apontamento_of_encerrada() is
  'ETAPA 2O.5H: bloqueia concluida/cancelada/desdobrada (antes: só concluida). Sem lock injetado - registrar_apontamento (2O.5G) ja adquire o nivel 2 explicitamente antes deste INSERT, sincronizacao ja garantida pela propria funcao.';

-- =====================================================================
-- 3/7 — impedir_dependencia_of_encerrada (trigger de
--       of_operacao_dependencias - dispara em
--       alterar_dependencia_operacao).
-- ANTES: só bloqueava 'concluida'. Sem lock - corrida B4 real.
-- DEPOIS: bloqueia os 3 estados finais; lock nao bloqueante de nivel 2
-- ANTES da leitura de estado - fecha B4 sem risco de deadlock.
-- =====================================================================
create or replace function public.impedir_dependencia_of_encerrada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_op_origem_id uuid := coalesce(new.op_origem_id, old.op_origem_id);
  v_of_id uuid;
  v_estado_execucao text;
begin
  select ofab.id, ofab.estado_execucao into v_of_id, v_estado_execucao
  from public.ordens_fabricacao_operacoes op
  join public.ordens_fabricacao ofab on ofab.id = op.of_id
  where op.id = v_op_origem_id;

  if v_of_id is not null and not pg_try_advisory_xact_lock(hashtextextended('ordens_fabricacao:' || v_of_id::text, 0)) then
    raise exception 'of_operacao_dependencias: nao foi possivel confirmar o estado da OF % - outra transicao administrativa esta em andamento, tente novamente.', v_of_id;
  end if;

  if v_estado_execucao in ('concluida', 'cancelada', 'desdobrada') then
    raise exception 'A OF da dependencia esta em estado final (%) - nenhuma dependencia pode ser criada/alterada.', v_estado_execucao;
  end if;

  return coalesce(new, old);
end;
$function$;

comment on function public.impedir_dependencia_of_encerrada() is
  'ETAPA 2O.5H: bloqueia concluida/cancelada/desdobrada (antes: só concluida). Lock nao bloqueante de nivel 2 injetado - sincroniza alterar_dependencia_operacao (2O.5G) contra cancelar_of/desdobrar_of/encerrar_of em andamento, mesma logica de seguranca contra deadlock de impedir_escrita_operacao_of_encerrada.';

-- =====================================================================
-- 4/7 — impedir_escrita_via_op_of_encerrada (trigger compartilhado de
--       of_operacao_auditoria e of_apontamento_correcoes - dispara em
--       regularizar_apontamento e nos inserts de auditoria das demais).
-- ANTES: só bloqueava 'concluida'. Sem lock - corrida real comprovada
-- (regularizar_apontamento sucedia durante cancelar_of/desdobrar_of/
-- encerrar_of ainda nao comitados, em qualquer ordem de chegada).
-- DEPOIS: bloqueia os 3 estados finais, SEM excecao para regularizacao
-- (decisao definitiva do usuario - nenhuma excecao generica); lock nao
-- bloqueante de nivel 2 injetado.
-- =====================================================================
create or replace function public.impedir_escrita_via_op_of_encerrada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_op_id uuid := coalesce(new.op_id, old.op_id);
  v_of_id uuid;
  v_estado_execucao text;
begin
  select ofab.id, ofab.estado_execucao into v_of_id, v_estado_execucao
  from public.ordens_fabricacao_operacoes op
  join public.ordens_fabricacao ofab on ofab.id = op.of_id
  where op.id = v_op_id;

  if v_of_id is not null and not pg_try_advisory_xact_lock(hashtextextended('ordens_fabricacao:' || v_of_id::text, 0)) then
    raise exception 'A OF da OP % - nao foi possivel confirmar seu estado - outra transicao administrativa esta em andamento, tente novamente.', v_op_id;
  end if;

  if v_estado_execucao in ('concluida', 'cancelada', 'desdobrada') then
    raise exception 'A OF da OP % esta em estado final (%) - nenhum registro novo e permitido (auditoria/correcao congelam, sem excecao - inclusive para regularizacao).', v_op_id, v_estado_execucao;
  end if;

  return coalesce(new, old);
end;
$function$;

comment on function public.impedir_escrita_via_op_of_encerrada() is
  'ETAPA 2O.5H: bloqueia concluida/cancelada/desdobrada, sem excecao para regularizacao (decisao definitiva do usuario). Lock nao bloqueante de nivel 2 injetado - regularizar_apontamento (2O.5G) nunca detinha nenhum lock antes desta correcao; fecha a corrida real comprovada contra cancelar_of/desdobrar_of/encerrar_of.';

-- =====================================================================
-- 5/7 — cancelar_of. ANTES: só lock de nivel 0 ('of-transicao:').
-- DEPOIS: adquire tambem o nivel 2, na mesma ordem (0 depois 2) -
-- sincroniza com encerrar_of/criar_op_no_y/registrar_apontamento
-- (2O.5G), sem alterar nenhuma regra de negocio existente.
-- =====================================================================
create or replace function public.cancelar_of(
  p_of_id uuid,
  p_cancelado_por uuid,
  p_motivo text
)
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
        estado_execucao_observacao = p_motivo
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

comment on function public.cancelar_of(uuid, uuid, text) is
  'ETAPA 2O.5H: adquire tambem o lock de nivel 2 (ordens_fabricacao), apos o nivel 0 ja existente - sincroniza com encerrar_of/criar_op_no_y/registrar_apontamento (2O.5G). Nenhuma regra de negocio alterada (ETAPA1E: bloqueia cancelamento simples com apontamento real ou retirada fisica; libera so reservas com vinculo comprovado).';

-- =====================================================================
-- 6/7 — desdobrar_of. Mesma correcao de lock que cancelar_of.
-- =====================================================================
create or replace function public.desdobrar_of(
  p_of_mae_id uuid,
  p_desdobrado_por uuid,
  p_filhas jsonb,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mae record;
  v_empresa_id uuid;
  v_desdobrado_por_empresa_id uuid;
  v_existe_apontamento boolean;
  v_filha jsonb;
  v_nova_of_id uuid;
  v_novo_numero text;
  v_resultado jsonb := '[]'::jsonb;
  v_op_mae record;
  v_nova_op_id uuid;
  v_map_ops jsonb;
  v_dep record;
  v_sub_anterior text;
begin
  if jsonb_typeof(p_filhas) is distinct from 'array' or jsonb_array_length(p_filhas) < 1 then
    raise exception 'desdobrar_of: p_filhas precisa ser um array JSON com pelo menos 1 elemento.';
  end if;

  select empresa_id into v_empresa_id from public.ordens_fabricacao where id = p_of_mae_id;
  if v_empresa_id is null then
    raise exception 'desdobrar_of: OF % nao encontrada.', p_of_mae_id;
  end if;

  select empresa_id into v_desdobrado_por_empresa_id from public.usuarios where id = p_desdobrado_por;
  if v_desdobrado_por_empresa_id is null or v_desdobrado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'desdobrar_of: desdobrado_por % nao e um usuario valido da empresa % da OF %.', p_desdobrado_por, v_empresa_id, p_of_mae_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_mae_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao:' || p_of_mae_id::text, 0));

  select * into v_mae from public.ordens_fabricacao where id = p_of_mae_id;

  if v_mae.estado_aprovacao is distinct from 'aprovada' then
    raise exception 'desdobrar_of: OF % precisa estar aprovada (estado_aprovacao=%).', p_of_mae_id, v_mae.estado_aprovacao;
  end if;

  if v_mae.estado_execucao not in ('planejada', 'liberada') then
    raise exception 'desdobrar_of: OF % em estado_execucao=% nao pode ser desdobrada - so planejada ou liberada, nunca em_producao.', p_of_mae_id, v_mae.estado_execucao;
  end if;

  select exists(
    select 1
    from public.of_apontamentos a
    join public.ordens_fabricacao_operacoes op on op.id = a.op_id
    where op.of_id = p_of_mae_id
  ) into v_existe_apontamento;

  if v_existe_apontamento then
    raise exception 'desdobrar_of: OF % ja possui apontamento registrado - desdobramento nao e permitido depois do primeiro apontamento.', p_of_mae_id;
  end if;

  v_sub_anterior := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', p_desdobrado_por::text, true);

  for v_filha in select * from jsonb_array_elements(p_filhas)
  loop
    if not (v_filha ? 'quantidade') or (v_filha->>'quantidade')::numeric <= 0 then
      raise exception 'desdobrar_of: cada filha precisa de quantidade > 0: %', v_filha;
    end if;

    insert into public.ordens_fabricacao (
      empresa_id, projeto_id, projeto_item_id, produto_id, bom_id,
      quantidade_planejada, unidade, created_by,
      estado_aprovacao, estado_execucao, of_pai_id
    ) values (
      v_empresa_id, v_mae.projeto_id, v_mae.projeto_item_id, v_mae.produto_id, v_mae.bom_id,
      (v_filha->>'quantidade')::numeric, v_mae.unidade, p_desdobrado_por,
      'aprovada', 'planejada', p_of_mae_id
    )
    returning id, numero_of into v_nova_of_id, v_novo_numero;

    v_map_ops := '{}'::jsonb;

    for v_op_mae in
      select * from public.ordens_fabricacao_operacoes where of_id = p_of_mae_id
    loop
      insert into public.ordens_fabricacao_operacoes (
        empresa_id, of_id, origem, bom_operacao_id,
        codigo_operacional, descricao, recurso_vigente_id, tempo_vigente_minutos,
        sequencia_vigente, nao_aplicavel, motivo_nao_aplicavel, observacao, created_by
      ) values (
        v_empresa_id, v_nova_of_id, v_op_mae.origem, v_op_mae.bom_operacao_id,
        v_op_mae.codigo_operacional, v_op_mae.descricao, v_op_mae.recurso_vigente_id, v_op_mae.tempo_vigente_minutos,
        v_op_mae.sequencia_vigente, v_op_mae.nao_aplicavel, v_op_mae.motivo_nao_aplicavel, v_op_mae.observacao, p_desdobrado_por
      )
      returning id into v_nova_op_id;

      insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
        values (v_empresa_id, v_nova_op_id, 'criacao', null, 'OP criada por desdobramento de lote (Y vigente copiado da OP ' || v_op_mae.id::text || ' da OF-mae)', p_desdobrado_por, p_motivo);

      v_map_ops := v_map_ops || jsonb_build_object(v_op_mae.id::text, v_nova_op_id::text);
    end loop;

    for v_dep in
      select d.op_origem_id, d.op_dependente_id
      from public.of_operacao_dependencias d
      join public.ordens_fabricacao_operacoes op on op.id = d.op_origem_id
      where op.of_id = p_of_mae_id
    loop
      insert into public.of_operacao_dependencias (empresa_id, op_origem_id, op_dependente_id, created_by)
      values (
        v_empresa_id,
        (v_map_ops ->> v_dep.op_origem_id::text)::uuid,
        (v_map_ops ->> v_dep.op_dependente_id::text)::uuid,
        p_desdobrado_por
      )
      on conflict (op_origem_id, op_dependente_id) do nothing;
    end loop;

    v_resultado := v_resultado || jsonb_build_object('of_id', v_nova_of_id, 'numero_of', v_novo_numero, 'quantidade', (v_filha->>'quantidade')::numeric);
  end loop;

  update public.ordens_fabricacao
    set estado_execucao = 'desdobrada',
        estado_execucao_observacao = p_motivo
    where id = p_of_mae_id
      and estado_execucao = v_mae.estado_execucao;

  if not found then
    raise exception 'desdobrar_of: falha ao marcar OF % como desdobrada - estado mudou durante a operacao.', p_of_mae_id;
  end if;

  perform set_config('request.jwt.claim.sub', v_sub_anterior, true);

  return jsonb_build_object('resultado', 'desdobrada', 'of_mae_id', p_of_mae_id, 'filhas', v_resultado);
end;
$function$;

comment on function public.desdobrar_of(uuid, uuid, jsonb, text) is
  'ETAPA 2O.5H: adquire tambem o lock de nivel 2 (ordens_fabricacao), apos o nivel 0 ja existente - mesma sincronizacao de cancelar_of. Nenhuma regra de negocio alterada (P7C: INV-PCP-26, Y vigente da mae copiado para as filhas, dependencias recriadas so com ids internos da filha).';

-- =====================================================================
-- 7/7 — encerrar_of. ANTES: só lock de nivel 2. DEPOIS: adquire tambem
-- o nivel 0 ('of-transicao:'), ANTES do nivel 2 - alinha encerrar_of a
-- convencao ja estabelecida por cancelar_of/desdobrar_of/liberar_of/
-- criar_of_substituta/registrar_retirada_material_of (achado real desta
-- fatia: encerrar_of era a unica funcao de transicao administrativa que
-- nao usava 'of-transicao:'). Releitura do estado apos os locks,
-- cobrindo tambem cancelada/desdobrada (nao so concluida) por simetria.
-- =====================================================================
create or replace function public.encerrar_of(p_of_id uuid, p_encerrado_por uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_estado_execucao text;
begin
  select empresa_id, estado_execucao into v_empresa_id, v_estado_execucao
  from public.ordens_fabricacao where id = p_of_id;

  if v_empresa_id is null then
    raise exception 'OF % nao encontrada.', p_of_id;
  end if;

  if v_estado_execucao = 'concluida' then
    raise exception 'OF % ja esta encerrada.', p_of_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao:' || p_of_id::text, 0));

  select estado_execucao into v_estado_execucao from public.ordens_fabricacao where id = p_of_id;
  if v_estado_execucao in ('concluida', 'cancelada', 'desdobrada') then
    raise exception 'OF % ja esta em estado final (%).', p_of_id, v_estado_execucao;
  end if;

  if not public.of_pode_encerrar(p_of_id) then
    raise exception 'OF % nao pode ser encerrada - existem OPs nao resolvidas: %.',
      p_of_id,
      (
        select string_agg(codigo_operacional, ', ')
        from public.ordens_fabricacao_operacoes op
        where op.of_id = p_of_id and not public.op_esta_resolvida(op.id)
      );
  end if;

  update public.ordens_fabricacao
  set estado_execucao = 'concluida'
  where id = p_of_id;
end;
$function$;

comment on function public.encerrar_of(uuid, uuid) is
  'ETAPA 2O.5H: adquire tambem o lock de nivel 0 (of-transicao), antes do nivel 2 ja existente - alinha encerrar_of a convencao ja usada por cancelar_of/desdobrar_of/liberar_of/criar_of_substituta, fechando a corrida real comprovada entre encerramento e cancelamento/desdobramento concorrentes sobre a mesma OF. Releitura do estado apos os locks cobre tambem cancelada/desdobrada por simetria. PCP-P6C/P6D1/P6D2 preservados integralmente - verifica atomicamente que TODAS as OPs aplicaveis estao resolvidas antes de concluir.';

commit;
