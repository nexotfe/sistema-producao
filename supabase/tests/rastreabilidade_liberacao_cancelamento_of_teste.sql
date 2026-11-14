-- TESTE (pré-aplicação, ambiente DESCARTÁVEL) da migration candidata
-- 20261112150000_candidata_pcp_rastreabilidade_liberacao_cancelamento_of.sql
-- - NÃO é uma migration, vive em supabase/tests/, NUNCA deve ser aplicado
-- em produção nem no banco vinculado. Assume que a migration candidata já
-- foi aplicada (via `supabase db reset` local, que replica TODO o
-- histórico real de supabase/migrations/ + a candidata) - NÃO embute o
-- DDL dela.
--
-- Roda contra o stack local do `supabase start` (não um Postgres nu) -
-- precisa dos papéis authenticated/anon/service_role providos pelo GoTrue
-- local. Fixtures SINTÉTICAS criadas dentro da própria transação,
-- desfeitas pelo ROLLBACK final - nunca dado real.
--
-- Único atalho de fixture fora do caminho 100% real: para o TESTE 3
-- (regressão de aprovar_of), a empresa sintética tem
-- 'pcp.ci_ce_momento_y.ativo'=true em configuracoes_empresa SÓ dentro
-- desta transação descartável - evita reconstruir uma árvore de BOM real
-- (irrelevante para o que este teste verifica: autoria/trigger), e NUNCA
-- toca a empresa real nem o banco vinculado. Liberação/cancelamento
-- (TESTES 1/2/4/5/6) usam o caminho realista (necessidades_confirmadas_em
-- setado direto, regime 'confirmado_momento_y' - equivalente a 'legado'
-- para o propósito de liberar_of, sem depender do interruptor).
--
-- Checklist pedido pelo usuário, coberto:
--   1/2. Histórico identifica corretamente quem liberou e quem cancelou;
--        uma transição posterior (cancelamento) não altera a autoria
--        histórica da transição anterior (liberação) - TESTE 1 + TESTE 2.
--   3. Fluxos de aprovação (Família "aprovação": aprovar_of) continuam
--      funcionando, sem nenhuma mudança de comportamento - TESTE 3.
--   4. Não há possibilidade de atribuir a ação a outro usuário - TESTE 5
--      (ator de empresa diferente rejeitado pela própria RPC, nenhuma
--      linha alterada) + TESTE 6 (nenhum client comum tem GRANT de
--      UPDATE em ordens_fabricacao - uma tentativa direta de gravar
--      estado_execucao_por por fora da RPC é rejeitada por ACL, 42501).
--   5. Idempotência / registros antigos permanecem intactos - TESTE 4
--      (repetir liberar_of numa OF já liberada, com OUTRO ator, nunca
--      reatribui a autoria original).

begin;

-- =====================================================================
-- FIXTURES SINTÉTICAS
-- =====================================================================
do $$
declare
  v_empresa_a uuid := gen_random_uuid();
  v_empresa_b uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_grupo_adm uuid;
  v_liberador uuid := gen_random_uuid();
  v_cancelador uuid := gen_random_uuid();
  v_usuario_b uuid := gen_random_uuid();
  v_produto uuid := gen_random_uuid();
  v_projeto uuid := gen_random_uuid();
  v_of1 uuid := gen_random_uuid();
  v_of2 uuid := gen_random_uuid();
  v_of3 uuid := gen_random_uuid();
  v_of4 uuid := gen_random_uuid();
begin
  insert into auth.users (id, is_sso_user, is_anonymous) values
    (v_admin, false, false),
    (v_liberador, false, false),
    (v_cancelador, false, false),
    (v_usuario_b, false, false);

  insert into public.empresas (id, nome, slug, codigo, created_by) values
    (v_empresa_a, 'Empresa Teste A (rastreabilidade OF, local)', 'empresa-teste-rastreabilidade-of-a', 900101, v_admin),
    (v_empresa_b, 'Empresa Teste B (rastreabilidade OF, local)', 'empresa-teste-rastreabilidade-of-b', 900102, v_admin);

  -- Correção de fixture: v_admin precisa pertencer ao Grupo de Acesso
  -- ADM (auto-criado pela empresa) para passar usuario_tem_permissao -
  -- a chave pcp.aprovar_of (migration 20261112160000, aplicada DEPOIS
  -- que este teste foi originalmente escrito) exige isso. Nunca uma
  -- permissão mais ampla concedida - reaproveita a autoridade ADM já
  -- existente, nada criado/concedido novo.
  select id into v_grupo_adm from public.grupos_acesso where empresa_id = v_empresa_a and e_grupo_adm = true;
  if v_grupo_adm is null then
    raise exception 'PRÉ-CHECAGEM FALHOU: nenhum grupo ADM automático foi criado para a empresa sintética.';
  end if;

  insert into public.profiles (id, empresa_id, nome, nivel_acesso, ativo, grupo_id) values
    (v_admin, v_empresa_a, 'Admin PCP (teste rastreabilidade)', 'admin', true, v_grupo_adm);

  insert into public.usuarios (id, empresa_id, nome, email, nivel_acesso) values
    (v_admin, v_empresa_a, 'Admin PCP (teste rastreabilidade)', 'admin.teste@rastreabilidade.local', 'admin');

  insert into public.usuarios (id, empresa_id, nome, email) values
    (v_liberador, v_empresa_a, 'Liberador PCP (teste)', 'liberador.teste@rastreabilidade.local'),
    (v_cancelador, v_empresa_a, 'Cancelador PCP (teste)', 'cancelador.teste@rastreabilidade.local'),
    (v_usuario_b, v_empresa_b, 'Usuario Empresa B (teste)', 'usuario.b.teste@rastreabilidade.local');

  insert into public.itens_industriais (id, empresa_id, codigo, descricao, unidade, tipo_item, created_by) values
    (v_produto, v_empresa_a, '900101-PROD-1', 'Produto teste rastreabilidade OF', 'unidade', 'produto acabado', v_admin);

  insert into public.projetos (id, empresa_id, numero_projeto, tipo_projeto, status, created_by, nome) values
    (v_projeto, v_empresa_a, '900101', 'fabricacao', 'em_analise', v_admin, 'Projeto teste rastreabilidade OF');

  -- Atalho de fixture (ver cabeçalho) - só para o TESTE 3, só nesta
  -- transação descartável, nunca persistido, nunca a empresa real.
  insert into public.configuracoes_empresa (empresa_id, chave, valor, ativo, created_by) values
    (v_empresa_a, 'pcp.ci_ce_momento_y.ativo', 'true'::jsonb, true, v_admin);

  -- OF1: aprovada+planejada, regime liberável (necessidades_confirmadas_em
  -- setado direto - evita depender de BOM/necessidades reais, irrelevante
  -- para este teste) - usada no par liberar->cancelar (TESTE 1 + TESTE 2).
  insert into public.ordens_fabricacao (
    id, empresa_id, projeto_id, produto_id, numero_of, unidade, created_by,
    estado_aprovacao, estado_execucao, necessidades_confirmadas_em
  ) values (
    v_of1, v_empresa_a, v_projeto, v_produto, '900101-0001', 'unidade', v_admin,
    'aprovada', 'planejada', now()
  );

  -- OF2: aguardando_auditoria+planejada - usada na regressão de
  -- aprovar_of (TESTE 3).
  insert into public.ordens_fabricacao (
    id, empresa_id, projeto_id, produto_id, numero_of, unidade, created_by,
    estado_aprovacao, estado_execucao
  ) values (
    v_of2, v_empresa_a, v_projeto, v_produto, '900101-0002', 'unidade', v_admin,
    'aguardando_auditoria', 'planejada'
  );

  -- OF3: igual à OF1 - usada no teste de idempotência (TESTE 4).
  insert into public.ordens_fabricacao (
    id, empresa_id, projeto_id, produto_id, numero_of, unidade, created_by,
    estado_aprovacao, estado_execucao, necessidades_confirmadas_em
  ) values (
    v_of3, v_empresa_a, v_projeto, v_produto, '900101-0003', 'unidade', v_admin,
    'aprovada', 'planejada', now()
  );

  -- OF4: igual à OF1 - usada nos testes de "não atribuir a outro
  -- usuário" (TESTE 5 + TESTE 6).
  insert into public.ordens_fabricacao (
    id, empresa_id, projeto_id, produto_id, numero_of, unidade, created_by,
    estado_aprovacao, estado_execucao, necessidades_confirmadas_em
  ) values (
    v_of4, v_empresa_a, v_projeto, v_produto, '900101-0004', 'unidade', v_admin,
    'aprovada', 'planejada', now()
  );

  perform set_config('teste.empresa_a', v_empresa_a::text, true);
  perform set_config('teste.empresa_b', v_empresa_b::text, true);
  perform set_config('teste.admin', v_admin::text, true);
  perform set_config('teste.liberador', v_liberador::text, true);
  perform set_config('teste.cancelador', v_cancelador::text, true);
  perform set_config('teste.usuario_b', v_usuario_b::text, true);
  perform set_config('teste.of1', v_of1::text, true);
  perform set_config('teste.of2', v_of2::text, true);
  perform set_config('teste.of3', v_of3::text, true);
  perform set_config('teste.of4', v_of4::text, true);

  raise notice 'FIXTURES OK: empresa_a=%, admin=%, liberador=%, cancelador=%, usuario_b=%, of1=%, of2=%, of3=%, of4=%.',
    v_empresa_a, v_admin, v_liberador, v_cancelador, v_usuario_b, v_of1, v_of2, v_of3, v_of4;
end;
$$;

-- Helpers de LEITURA só para este teste (schema pg_temp, dono = sessão
-- atual = superuser, ANTES de qualquer SET ROLE) - SECURITY DEFINER para
-- que os blocos abaixo, já sob `service_role`/`authenticated` (sem GRANT
-- de SELECT direto nessas 2 tabelas - o mesmo isolamento real que faz
-- liberar_of/cancelar_of precisarem ser SECURITY DEFINER), ainda consigam
-- VERIFICAR o resultado. Nunca usados pela aplicação real - só por este
-- arquivo de teste, para ler o que as próprias RPCs (também SECURITY
-- DEFINER) já gravaram.
create function pg_temp.ler_of_teste(p_id uuid) returns public.ordens_fabricacao
  language sql security definer as $$ select * from public.ordens_fabricacao where id = p_id $$;

create function pg_temp.ler_historico_execucao_teste(p_of_id uuid, p_anterior text, p_novo text) returns public.ordens_fabricacao_historico_estados
  language sql security definer as $$
    select * from public.ordens_fabricacao_historico_estados
    where of_id = p_of_id and estado_execucao_anterior is distinct from null
      and estado_execucao_anterior = p_anterior and estado_execucao_novo = p_novo
  $$;

create function pg_temp.ler_historico_aprovacao_teste(p_of_id uuid, p_anterior text, p_novo text) returns public.ordens_fabricacao_historico_estados
  language sql security definer as $$
    select * from public.ordens_fabricacao_historico_estados
    where of_id = p_of_id and estado_aprovacao_anterior = p_anterior and estado_aprovacao_novo = p_novo
  $$;

create function pg_temp.ler_por_id_historico_teste(p_id uuid) returns public.ordens_fabricacao_historico_estados
  language sql security definer as $$ select * from public.ordens_fabricacao_historico_estados where id = p_id $$;

create function pg_temp.contar_historico_teste(p_of_id uuid) returns bigint
  language sql security definer as $$ select count(*) from public.ordens_fabricacao_historico_estados where of_id = p_of_id $$;

-- ---------------------------------------------------------------------
-- TESTE 1: liberar_of via client de serviço (sem request.jwt.claims -
-- replica EXATAMENTE o que liberarOfPcpAction faz hoje: auth.uid() fica
-- NULL nesta transação). A autoria permanente deve ficar correta mesmo
-- assim, via estado_execucao_por.
-- ---------------------------------------------------------------------
set role service_role;

do $$
declare
  v_resultado jsonb;
  v_of record;
  v_hist record;
begin
  v_resultado := public.liberar_of(
    current_setting('teste.of1')::uuid, current_setting('teste.liberador')::uuid, 'Teste rastreabilidade - liberação'
  );

  if v_resultado->>'resultado' <> 'liberada' then
    raise exception 'TESTE 1 FALHOU: liberar_of deveria retornar resultado=liberada (veio %).', v_resultado;
  end if;

  select * into v_of from pg_temp.ler_of_teste(current_setting('teste.of1')::uuid);
  if v_of.estado_execucao <> 'liberada' then
    raise exception 'TESTE 1 FALHOU: estado_execucao deveria ser liberada (veio %).', v_of.estado_execucao;
  end if;
  if v_of.estado_execucao_por <> current_setting('teste.liberador')::uuid then
    raise exception 'TESTE 1 FALHOU: estado_execucao_por deveria ser o liberador real (veio %).', v_of.estado_execucao_por;
  end if;
  if v_of.estado_execucao_em is null then
    raise exception 'TESTE 1 FALHOU: estado_execucao_em deveria estar preenchido.';
  end if;

  select * into v_hist from pg_temp.ler_historico_execucao_teste(current_setting('teste.of1')::uuid, 'planejada', 'liberada');

  if v_hist.alterado_por is distinct from current_setting('teste.liberador')::uuid then
    raise exception 'TESTE 1 FALHOU: historico.alterado_por da liberação deveria ser o liberador real (veio %) - ANTES da correção, isto vinha NULL.', v_hist.alterado_por;
  end if;
  if v_hist.origem <> 'rpc' then
    raise exception 'TESTE 1 FALHOU: historico.origem da liberação deveria ser rpc (veio %).', v_hist.origem;
  end if;

  raise notice 'TESTE 1 OK: liberar_of via client de serviço grava autoria real (liberador=%) tanto na OF quanto no histórico (origem=rpc).', v_hist.alterado_por;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 2: cancelar_of (via client de serviço), MESMO par aprovação/
-- execução, ATOR DIFERENTE. A transição de cancelamento deve gravar a
-- autoria do cancelador - e a linha de histórico da liberação (TESTE 1)
-- NUNCA deve ser reescrita.
-- ---------------------------------------------------------------------
do $$
declare
  v_resultado jsonb;
  v_of record;
  v_hist_liberacao_antes record;
  v_hist_liberacao_depois record;
  v_hist_cancelamento record;
begin
  select * into v_hist_liberacao_antes from pg_temp.ler_historico_execucao_teste(current_setting('teste.of1')::uuid, 'planejada', 'liberada');

  v_resultado := public.cancelar_of(
    current_setting('teste.of1')::uuid, current_setting('teste.cancelador')::uuid, 'Teste rastreabilidade - cancelamento'
  );

  if v_resultado->>'resultado' <> 'cancelada' then
    raise exception 'TESTE 2 FALHOU: cancelar_of deveria retornar resultado=cancelada (veio %).', v_resultado;
  end if;

  select * into v_of from pg_temp.ler_of_teste(current_setting('teste.of1')::uuid);
  if v_of.estado_execucao_por <> current_setting('teste.cancelador')::uuid then
    raise exception 'TESTE 2 FALHOU: apos o cancelamento, estado_execucao_por deveria ser o CANCELADOR (veio %) - e esperado sobrescrever, documentado no cabecalho da migration.', v_of.estado_execucao_por;
  end if;

  select * into v_hist_cancelamento from pg_temp.ler_historico_execucao_teste(current_setting('teste.of1')::uuid, 'liberada', 'cancelada');
  if v_hist_cancelamento.alterado_por is distinct from current_setting('teste.cancelador')::uuid then
    raise exception 'TESTE 2 FALHOU: historico.alterado_por do cancelamento deveria ser o cancelador real (veio %).', v_hist_cancelamento.alterado_por;
  end if;

  -- O NUCLEO do pedido do usuario: a linha de historico da LIBERACAO
  -- (transicao ANTERIOR) precisa continuar intacta, com a autoria do
  -- LIBERADOR - mesmo depois que estado_execucao_por na OF foi
  -- sobrescrito pelo cancelamento.
  select * into v_hist_liberacao_depois from pg_temp.ler_por_id_historico_teste(v_hist_liberacao_antes.id);

  if v_hist_liberacao_depois.alterado_por is distinct from v_hist_liberacao_antes.alterado_por
     or v_hist_liberacao_depois.alterado_por is distinct from current_setting('teste.liberador')::uuid then
    raise exception 'TESTE 2 FALHOU: a transicao POSTERIOR (cancelamento) alterou a autoria HISTORICA da transicao ANTERIOR (liberacao) - era %, ficou %.', v_hist_liberacao_antes.alterado_por, v_hist_liberacao_depois.alterado_por;
  end if;

  raise notice 'TESTE 2 OK: cancelamento grava autoria propria (cancelador=%) sem alterar a linha de historico ja gravada da liberacao (liberador=%, intacto).', v_hist_cancelamento.alterado_por, v_hist_liberacao_depois.alterado_por;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3 (regressão, Família "aprovação"): aprovar_of via client de
-- SESSÃO (auth.uid() real) continua funcionando exatamente como antes -
-- autoria em estado_aprovacao_por/historico via auth.uid(), e as colunas
-- NOVAS (estado_execucao_por/em) permanecem NULL (nenhuma transição de
-- estado_execucao ocorreu aqui).
-- ---------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('teste.admin'), 'role', 'authenticated')::text, true);
end;
$$;

set role authenticated;

do $$
declare
  v_resultado jsonb;
  v_of record;
  v_hist record;
begin
  v_resultado := public.aprovar_of(current_setting('teste.of2')::uuid, 'Teste regressão aprovação');

  if v_resultado->>'resultado' <> 'aprovada' then
    raise exception 'TESTE 3 FALHOU: aprovar_of deveria retornar resultado=aprovada (veio %).', v_resultado;
  end if;

  select * into v_of from public.ordens_fabricacao where id = current_setting('teste.of2')::uuid;
  if v_of.estado_aprovacao <> 'aprovada' then
    raise exception 'TESTE 3 FALHOU: estado_aprovacao deveria ser aprovada (veio %).', v_of.estado_aprovacao;
  end if;
  if v_of.estado_aprovacao_por <> current_setting('teste.admin')::uuid then
    raise exception 'TESTE 3 FALHOU: estado_aprovacao_por deveria ser o admin real (veio %) - regressao na Familia aprovacao.', v_of.estado_aprovacao_por;
  end if;
  if v_of.estado_execucao_por is not null or v_of.estado_execucao_em is not null then
    raise exception 'TESTE 3 FALHOU: estado_execucao_por/em deveriam continuar NULL - nenhuma transicao de estado_execucao ocorreu nesta OF.';
  end if;

  select * into v_hist from public.ordens_fabricacao_historico_estados
  where of_id = current_setting('teste.of2')::uuid
    and estado_aprovacao_anterior = 'aguardando_auditoria' and estado_aprovacao_novo = 'aprovada';
  if v_hist.alterado_por is distinct from current_setting('teste.admin')::uuid or v_hist.origem <> 'rpc' then
    raise exception 'TESTE 3 FALHOU: historico da aprovacao deveria ter alterado_por=admin e origem=rpc (veio alterado_por=%, origem=%) - regressao na Familia aprovacao.', v_hist.alterado_por, v_hist.origem;
  end if;

  raise notice 'TESTE 3 OK: aprovar_of (Familia aprovacao, client de sessao) 100%% inalterado - autoria=%, origem=rpc, colunas novas de execucao permanecem NULL.', v_hist.alterado_por;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4 (idempotência / registros antigos intactos): repetir
-- liberar_of numa OF já liberada, informando um ATOR DIFERENTE do
-- liberador original - o caminho idempotente (ja_liberada) nunca deve
-- reatribuir a autoria já gravada.
-- ---------------------------------------------------------------------
set role service_role;

do $$
declare
  v_resultado1 jsonb;
  v_resultado2 jsonb;
  v_of record;
  v_qtd_historico bigint;
begin
  v_resultado1 := public.liberar_of(current_setting('teste.of3')::uuid, current_setting('teste.liberador')::uuid, null);
  if v_resultado1->>'resultado' <> 'liberada' then
    raise exception 'TESTE 4 FALHOU (preparo): primeira liberação da OF3 deveria ter sucesso (veio %).', v_resultado1;
  end if;

  v_resultado2 := public.liberar_of(current_setting('teste.of3')::uuid, current_setting('teste.cancelador')::uuid, null);
  if v_resultado2->>'resultado' <> 'ja_liberada' then
    raise exception 'TESTE 4 FALHOU: repetir liberar_of numa OF já liberada deveria devolver ja_liberada (veio %).', v_resultado2;
  end if;

  select * into v_of from pg_temp.ler_of_teste(current_setting('teste.of3')::uuid);
  if v_of.estado_execucao_por <> current_setting('teste.liberador')::uuid then
    raise exception 'TESTE 4 FALHOU: a chamada idempotente (ator diferente) reatribuiu estado_execucao_por (era liberador, ficou %) - autoria original deveria ter sido preservada.', v_of.estado_execucao_por;
  end if;

  select count(*) into v_qtd_historico from public.ordens_fabricacao_historico_estados
  where of_id = current_setting('teste.of3')::uuid
    and estado_execucao_anterior = 'planejada' and estado_execucao_novo = 'liberada';
  if v_qtd_historico <> 1 then
    raise exception 'TESTE 4 FALHOU: deveria haver exatamente 1 linha de histórico para a liberação da OF3 (achou %) - a chamada idempotente não deveria criar uma segunda.', v_qtd_historico;
  end if;

  raise notice 'TESTE 4 OK: repetição idempotente (ator diferente) devolveu ja_liberada sem reatribuir autoria nem duplicar histórico.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 5 ("não há possibilidade de atribuir a outro usuário", via
-- parâmetro): liberar_of com um ator de OUTRA empresa deve continuar
-- sendo rejeitado pela própria validação já existente da RPC - e a OF
-- (e seu histórico) devem permanecer 100% intactos após a rejeição.
-- ---------------------------------------------------------------------
do $$
declare
  v_of_antes record;
  v_of_depois record;
  v_qtd_historico bigint;
begin
  select * into v_of_antes from pg_temp.ler_of_teste(current_setting('teste.of4')::uuid);

  begin
    perform public.liberar_of(current_setting('teste.of4')::uuid, current_setting('teste.usuario_b')::uuid, 'tentativa indevida');
    raise exception 'TESTE 5 FALHOU: liberar_of aceitou um ator de empresa diferente da OF.';
  exception
    when others then
      if sqlerrm like 'TESTE 5 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%nao e um usuario valido%' then
        raise exception 'TESTE 5 FALHOU: rejeitado, mas pelo motivo ERRADO (achou: %).', sqlerrm;
      end if;
  end;

  select * into v_of_depois from pg_temp.ler_of_teste(current_setting('teste.of4')::uuid);
  if v_of_depois.estado_execucao <> v_of_antes.estado_execucao or v_of_depois.estado_execucao_por is not null then
    raise exception 'TESTE 5 FALHOU: a OF4 deveria permanecer 100%% intacta apos a rejeicao (estado_execucao=%, estado_execucao_por=%).', v_of_depois.estado_execucao, v_of_depois.estado_execucao_por;
  end if;

  select count(*) into v_qtd_historico from public.ordens_fabricacao_historico_estados where of_id = current_setting('teste.of4')::uuid;
  if v_qtd_historico <> 1 then
    raise exception 'TESTE 5 FALHOU: nenhuma linha de historico nova deveria ter sido criada pela tentativa rejeitada (achou % linhas, esperado 1 - so a de criacao da OF).', v_qtd_historico;
  end if;

  raise notice 'TESTE 5 OK: ator de outra empresa rejeitado (%), OF4 e seu historico permanecem intactos.', 'nao e um usuario valido';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 6 ("não há possibilidade de atribuir a outro usuário", via
-- bypass direto): nenhum client comum (authenticated) tem GRANT de
-- UPDATE em ordens_fabricacao - logo ninguém pode gravar
-- estado_execucao_por diretamente, por fora de liberar_of/cancelar_of.
-- ---------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('teste.liberador'), 'role', 'authenticated')::text, true);
end;
$$;

set role authenticated;

do $$
declare
  v_sqlstate text;
begin
  begin
    update public.ordens_fabricacao set estado_execucao_por = current_setting('teste.liberador')::uuid where id = current_setting('teste.of4')::uuid;
    raise exception 'TESTE 6 FALHOU: authenticated conseguiu fazer UPDATE direto em ordens_fabricacao.';
  exception
    when others then
      v_sqlstate := sqlstate;
      if sqlerrm like 'TESTE 6 FALHOU%' then raise; end if;
  end;

  if v_sqlstate is distinct from '42501' then
    raise exception 'TESTE 6 FALHOU: UPDATE direto foi rejeitado, mas com sqlstate errado (esperava 42501, achou %).', v_sqlstate;
  end if;
  raise notice 'TESTE 6 OK: nenhum client comum consegue gravar estado_execucao_por por fora da RPC (sqlstate 42501).';
end;
$$;

reset role;

-- ROLLBACK obrigatório - nenhuma linha/fixture sintética fica gravada.
rollback;
