-- TESTE (pós-aplicação) das migrations
-- 20260822165408_aprovar_cenario_comercial_service_role_assinatura_tecnica.sql
-- (Fase 1) e 20260822195805_aprovar_cenario_comercial_v2_idempotencia.sql
-- (idempotência, correção do usuário após o achado de travamento em
-- "Aprovando..." no orçamento 260007) - NÃO é uma migration, vive em
-- supabase/tests/, nunca deve ser aplicado em produção. Assume que as
-- duas migrations reais já foram aplicadas - NÃO embute o DDL delas.
--
-- DIFERENÇA DELIBERADA do padrão usado em
-- cenarios_comerciais_aprovados_teste.sql (que reaproveita fixtures
-- REAIS do ambiente vinculado): este arquivo roda contra um banco
-- LOCAL restaurado só com SCHEMA (supabase db dump --linked --schema
-- public - schema-only, sem dado nenhum) - não há empresa/perfil/
-- projeto real disponível localmente. Fixtures aqui são SINTÉTICAS,
-- criadas dentro da própria transação (auth.users mínimo + empresas +
-- profiles + projetos) e desfeitas pelo ROLLBACK final - nunca dado
-- real, nunca aplicado fora deste ambiente local de validação.
--
-- Escopo coberto (itens do checkpoint pedido pelo usuário):
--   0. COEXISTÊNCIA: as DUAS RPCs (antiga, 12 parâmetros, e nova,
--      aprovar_cenario_comercial_v2) existem e funcionam
--      SIMULTANEAMENTE - a antiga continua chamável por authenticated
--      (código ainda em produção), a nova só por service_role (código
--      novo). Nenhuma delas quebra a outra.
--   1. anon/authenticated negados por ACL (42501) na RPC NOVA.
--   2. service_role aprova com sucesso via v2; aprovado_por gravado é
--      EXATAMENTE p_aprovado_por.
--   3. as DUAS assinaturas existem no catálogo; a assinatura v2
--      ANTERIOR (Fase 1, 15 parâmetros, sem idempotência) NÃO existe
--      mais - trocada em bloco por esta migration (nunca usada em
--      produção, seguro substituir).
--   4. usuário sem nível admin rejeitado na v2.
--   5. usuário de outra empresa rejeitado na v2.
--   6. projeto de outra empresa rejeitado na v2.
--   7. p_assinatura_tecnica nula ou malformada rejeitada na v2.
--   8. cenário legado (estilo 260007) permanece com assinatura_tecnica
--      NULL - nunca backfillado.
--   9. regressão: substituição/motivo obrigatório e "1 vigente por
--      projeto" continuam funcionando na v2.
--   10. IDEMPOTÊNCIA (nova nesta migration): mesma chave + mesmo
--       projeto + mesmo hash devolve o cenário já gravado (nunca insere
--       de novo); mesma chave + projeto OU hash diferente é erro de
--       integridade (nunca devolve outro cenário); p_chave_idempotencia/
--       p_hash_solicitacao ausentes são rejeitados.
--
-- FORA de escopo aqui (não verificável em SQL puro, coberto em
-- TypeScript): "Server Action rejeita ANTES de criar o client
-- privilegiado" - orquestrarAprovacaoCenarioComercial.test.ts; "código
-- novo chama exclusivamente v2" - persistirViaRpcAprovacaoCenario.test.ts;
-- "timeout por etapa"/"gravação incerta verificada antes do retry" -
-- executarComTimeout.test.ts, orquestrarAprovacaoCenarioComercial.test.ts,
-- ResumoFinanceiroCard.test.tsx.

begin;

-- =====================================================================
-- FIXTURES SINTÉTICAS (empresa A com admin+operador, empresa B com
-- admin, 1 projeto por empresa) - só para esta transação.
-- =====================================================================
do $$
declare
  v_admin_a uuid := gen_random_uuid();
  v_operador_a uuid := gen_random_uuid();
  v_admin_b uuid := gen_random_uuid();
  v_empresa_a uuid := gen_random_uuid();
  v_empresa_b uuid := gen_random_uuid();
  v_projeto_a uuid := gen_random_uuid();
  v_projeto_a2 uuid := gen_random_uuid();
  v_projeto_b uuid := gen_random_uuid();
begin
  insert into auth.users (id, is_sso_user, is_anonymous) values
    (v_admin_a, false, false),
    (v_operador_a, false, false),
    (v_admin_b, false, false);

  insert into public.empresas (id, nome, slug, codigo) values
    (v_empresa_a, 'Empresa Teste A (local)', 'empresa-teste-a-local', 900001),
    (v_empresa_b, 'Empresa Teste B (local)', 'empresa-teste-b-local', 900002);

  insert into public.profiles (id, empresa_id, nome, nivel_acesso, ativo) values
    (v_admin_a, v_empresa_a, 'Admin A (teste)', 'admin', true),
    (v_operador_a, v_empresa_a, 'Operador A (teste)', 'operador', true),
    (v_admin_b, v_empresa_b, 'Admin B (teste)', 'admin', true);

  insert into public.projetos (
    id, empresa_id, numero_projeto, tipo_projeto, status, created_by, nome
  ) values
    (v_projeto_a, v_empresa_a, '900001', 'fabricacao', 'em_analise', v_admin_a, 'Projeto Teste A (local)'),
    (v_projeto_a2, v_empresa_a, '900003', 'fabricacao', 'em_analise', v_admin_a, 'Projeto Teste A2 (local, mesma empresa)'),
    (v_projeto_b, v_empresa_b, '900002', 'fabricacao', 'em_analise', v_admin_b, 'Projeto Teste B (local)');

  perform set_config('teste.admin_a', v_admin_a::text, true);
  perform set_config('teste.operador_a', v_operador_a::text, true);
  perform set_config('teste.admin_b', v_admin_b::text, true);
  perform set_config('teste.empresa_a', v_empresa_a::text, true);
  perform set_config('teste.empresa_b', v_empresa_b::text, true);
  perform set_config('teste.projeto_a', v_projeto_a::text, true);
  perform set_config('teste.projeto_a2', v_projeto_a2::text, true);
  perform set_config('teste.projeto_b', v_projeto_b::text, true);

  raise notice 'FIXTURES OK: empresa_a=%, admin_a=%, operador_a=%, projeto_a=%, projeto_a2=%, empresa_b=%, admin_b=%, projeto_b=%.',
    v_empresa_a, v_admin_a, v_operador_a, v_projeto_a, v_projeto_a2, v_empresa_b, v_admin_b, v_projeto_b;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 3: RPC antiga continua existindo; a v2 ATUAL (17 parâmetros,
-- com idempotência) existe; a v2 ANTERIOR (15 parâmetros, Fase 1, sem
-- idempotência) NÃO existe mais - trocada em bloco por esta migration.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.aprovar_cenario_comercial(uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text)') is null then
    raise exception 'TESTE 3a FALHOU: a RPC ANTIGA (12 parâmetros) deveria continuar existindo (Fase 1 é aditiva, a remoção é escopo da Fase 2).';
  end if;
  raise notice 'TESTE 3a OK: RPC antiga (12 parâmetros) continua existindo.';

  if to_regprocedure('public.aprovar_cenario_comercial_v2(uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text, text, text)') is null then
    raise exception 'TESTE 3b FALHOU: a RPC v2 ATUAL (17 parâmetros, com idempotência) deveria existir depois desta migration.';
  end if;
  raise notice 'TESTE 3b OK: RPC v2 atual (17 parâmetros) existe.';

  if to_regprocedure('public.aprovar_cenario_comercial_v2(uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text)') is not null then
    raise exception 'TESTE 3c FALHOU: a assinatura v2 ANTERIOR (15 parâmetros, Fase 1, sem idempotência) não deveria mais existir - deveria ter sido trocada em bloco.';
  end if;
  raise notice 'TESTE 3c OK: assinatura v2 anterior (15 parâmetros) não existe mais.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 0 (COEXISTÊNCIA): a RPC ANTIGA continua funcionando NORMALMENTE
-- para `authenticated`, com as claims de JWT.
-- ---------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('teste.admin_a'), 'role', 'authenticated')::text, true);
end;
$$;

set role authenticated;

do $$
declare
  v_novo_id uuid;
  v_row record;
begin
  v_novo_id := public.aprovar_cenario_comercial(
    current_setting('teste.projeto_a')::uuid, 'atual', current_date, current_date + 10,
    50000.00, 0, 0, 0, 0, 62000.00,
    jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
    null
  );

  if v_novo_id is null then
    raise exception 'TESTE 0 FALHOU: RPC antiga (via authenticated) deveria continuar funcionando depois destas migrations aditivas.';
  end if;

  select * into v_row from public.cenarios_comerciais_aprovados where id = v_novo_id;
  if v_row.assinatura_tecnica is not null or v_row.chave_idempotencia is not null then
    raise exception 'TESTE 0 FALHOU: cenário aprovado pela RPC ANTIGA nunca deveria gravar assinatura_tecnica/chave_idempotencia (colunas novas, RPC antiga não as conhece).';
  end if;

  perform set_config('teste.id_cenario_a_rpc_antiga', v_novo_id::text, true);
  raise notice 'TESTE 0 OK: RPC antiga continua funcionando para authenticated (id=%, colunas novas NULL como esperado).', v_novo_id;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 1a/1b: `authenticated`/`anon` negados por ACL (42501) na RPC
-- NOVA - nunca chegam a executar o corpo da função.
-- ---------------------------------------------------------------------
set role authenticated;

do $$
declare
  v_sqlstate text;
begin
  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_a')::uuid, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      repeat('a', 64), 'chave-teste-1a', repeat('h', 64), null
    );
    raise exception 'TESTE 1a FALHOU: authenticated conseguiu chamar aprovar_cenario_comercial_v2 diretamente.';
  exception
    when others then
      v_sqlstate := sqlstate;
      if sqlerrm like 'TESTE 1a FALHOU%' then raise; end if;
  end;

  if v_sqlstate is distinct from '42501' then
    raise exception 'TESTE 1a FALHOU: authenticated foi rejeitado, mas com sqlstate errado (esperava 42501, achou %).', v_sqlstate;
  end if;
  raise notice 'TESTE 1a OK: authenticated negado por ACL na RPC NOVA (sqlstate 42501).';
end;
$$;

reset role;

set role anon;

do $$
declare
  v_sqlstate text;
begin
  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_a')::uuid, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      repeat('a', 64), 'chave-teste-1b', repeat('h', 64), null
    );
    raise exception 'TESTE 1b FALHOU: anon conseguiu chamar aprovar_cenario_comercial_v2 diretamente.';
  exception
    when others then
      v_sqlstate := sqlstate;
      if sqlerrm like 'TESTE 1b FALHOU%' then raise; end if;
  end;

  if v_sqlstate is distinct from '42501' then
    raise exception 'TESTE 1b FALHOU: anon foi rejeitado, mas com sqlstate errado (esperava 42501, achou %).', v_sqlstate;
  end if;
  raise notice 'TESTE 1b OK: anon negado por ACL na RPC nova (sqlstate 42501).';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 7: p_assinatura_tecnica nula ou malformada rejeitada na v2.
-- ---------------------------------------------------------------------
set role service_role;

do $$
begin
  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_a')::uuid, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      null, 'chave-teste-7a', repeat('h', 64), null
    );
    raise exception 'TESTE 7a FALHOU: p_assinatura_tecnica NULL deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 7a FALHOU%' then raise; end if;
      if sqlerrm not ilike '%assinatura_tecnica%' then
        raise exception 'TESTE 7a FALHOU: rejeitado, mas pelo motivo ERRADO (achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 7a OK: p_assinatura_tecnica NULL rejeitada (%).', sqlerrm;
  end;

  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_a')::uuid, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      'hash-curto-demais', 'chave-teste-7b', repeat('h', 64), null
    );
    raise exception 'TESTE 7b FALHOU: p_assinatura_tecnica malformada (não hex-64) deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 7b FALHOU%' then raise; end if;
      if sqlerrm not ilike '%assinatura_tecnica%' then
        raise exception 'TESTE 7b FALHOU: rejeitado, mas pelo motivo ERRADO (achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 7b OK: p_assinatura_tecnica malformada rejeitada (%).', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 10a (IDEMPOTÊNCIA): p_chave_idempotencia/p_hash_solicitacao
-- ausentes são rejeitados.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_a')::uuid, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      repeat('a', 64), null, repeat('h', 64), null
    );
    raise exception 'TESTE 10a FALHOU: p_chave_idempotencia NULL deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 10a FALHOU%' then raise; end if;
      if sqlerrm not ilike '%chave_idempotencia%' then
        raise exception 'TESTE 10a FALHOU: rejeitado, mas pelo motivo ERRADO (achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 10a OK: p_chave_idempotencia NULL rejeitada (%).', sqlerrm;
  end;

  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_a')::uuid, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      repeat('a', 64), 'chave-teste-10a2', null, null
    );
    raise exception 'TESTE 10a2 FALHOU: p_hash_solicitacao NULL deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 10a2 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%hash_solicitacao%' then
        raise exception 'TESTE 10a2 FALHOU: rejeitado, mas pelo motivo ERRADO (achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 10a2 OK: p_hash_solicitacao NULL rejeitada (%).', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 4: service_role aprova com sucesso via v2; aprovado_por =
-- EXATAMENTE p_aprovado_por.
-- ---------------------------------------------------------------------
do $$
declare
  v_novo_id uuid;
  v_row record;
begin
  v_novo_id := public.aprovar_cenario_comercial_v2(
    current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
    current_setting('teste.projeto_a')::uuid, 'atual', current_date, current_date + 10,
    50000.00, 0, 0, 0, 0, 62000.00,
    jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
    repeat('a', 64), 'chave-teste-4', repeat('h', 64),
    'Substitui o cenário aprovado pela RPC antiga no TESTE 0.'
  );

  if v_novo_id is null then
    raise exception 'TESTE 4 FALHOU: aprovar_cenario_comercial_v2 (service_role) deveria devolver um id.';
  end if;

  select * into v_row from public.cenarios_comerciais_aprovados where id = v_novo_id;

  if v_row.aprovado_por <> current_setting('teste.admin_a')::uuid then
    raise exception 'TESTE 4 FALHOU: aprovado_por (%) deveria ser EXATAMENTE p_aprovado_por.', v_row.aprovado_por;
  end if;
  if (v_row.snapshot ->> 'aprovadoPor') <> current_setting('teste.admin_a') then
    raise exception 'TESTE 4 FALHOU: snapshot.aprovadoPor deveria ser sobrescrito com p_aprovado_por.';
  end if;
  if v_row.assinatura_tecnica <> repeat('a', 64) then
    raise exception 'TESTE 4 FALHOU: assinatura_tecnica gravada não bate com o parâmetro enviado.';
  end if;
  if v_row.chave_idempotencia <> 'chave-teste-4' or v_row.hash_solicitacao <> repeat('h', 64) then
    raise exception 'TESTE 4 FALHOU: chave_idempotencia/hash_solicitacao gravados não batem com os parâmetros enviados.';
  end if;
  if v_row.empresa_id <> current_setting('teste.empresa_a')::uuid then
    raise exception 'TESTE 4 FALHOU: empresa_id gravado deveria ser EXATAMENTE p_empresa_id.';
  end if;

  if (select count(*) from public.cenarios_comerciais_aprovados where projeto_id = current_setting('teste.projeto_a')::uuid and vigente = true) <> 1 then
    raise exception 'TESTE 4 FALHOU: deveria haver exatamente 1 vigente para o projeto (v2 substituindo o vigente da RPC antiga).';
  end if;
  if (select vigente from public.cenarios_comerciais_aprovados where id = current_setting('teste.id_cenario_a_rpc_antiga')::uuid) is not false then
    raise exception 'TESTE 4 FALHOU: o cenário aprovado pela RPC ANTIGA deveria ter deixado de ser vigente após a v2 substituí-lo.';
  end if;

  perform set_config('teste.id_cenario_a', v_novo_id::text, true);
  raise notice 'TESTE 4 OK: service_role aprovou com sucesso via v2 (id=%).', v_novo_id;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 10b (IDEMPOTÊNCIA - o núcleo do achado desta rodada): repetir a
-- MESMA chamada exata (mesma chave, mesmo projeto, mesmo hash) do
-- TESTE 4 - simula um retry após "gravação incerta" (conexão caiu antes
-- da resposta chegar, mas a escrita já tinha acontecido). Deve devolver
-- o MESMO id, sem criar linha nova, sem re-executar a lógica de
-- substituição (o cenário da RPC antiga já está marcado como não
-- vigente - não pode virar não-vigente "de novo" por engano nem gerar
-- um 2º registro de substituição).
-- ---------------------------------------------------------------------
do $$
declare
  v_id_original uuid := current_setting('teste.id_cenario_a')::uuid;
  v_id_repeticao uuid;
  v_qtd_linhas_antes bigint;
  v_qtd_linhas_depois bigint;
begin
  select count(*) into v_qtd_linhas_antes from public.cenarios_comerciais_aprovados where projeto_id = current_setting('teste.projeto_a')::uuid;

  v_id_repeticao := public.aprovar_cenario_comercial_v2(
    current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
    current_setting('teste.projeto_a')::uuid, 'atual', current_date, current_date + 10,
    50000.00, 0, 0, 0, 0, 62000.00,
    jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
    repeat('a', 64), 'chave-teste-4', repeat('h', 64),
    'Substitui o cenário aprovado pela RPC antiga no TESTE 0.'
  );

  select count(*) into v_qtd_linhas_depois from public.cenarios_comerciais_aprovados where projeto_id = current_setting('teste.projeto_a')::uuid;

  if v_id_repeticao <> v_id_original then
    raise exception 'TESTE 10b FALHOU: repetir a MESMA chave/conteúdo deveria devolver o MESMO id (esperava %, achou %).', v_id_original, v_id_repeticao;
  end if;
  if v_qtd_linhas_depois <> v_qtd_linhas_antes then
    raise exception 'TESTE 10b FALHOU: repetir a MESMA chave/conteúdo não deveria criar nenhuma linha nova (antes=%, depois=%).', v_qtd_linhas_antes, v_qtd_linhas_depois;
  end if;
  raise notice 'TESTE 10b OK: repetição idempotente (mesma chave, mesmo conteúdo) devolveu o cenário já gravado (id=%), nenhuma linha nova criada.', v_id_repeticao;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 10c (IDEMPOTÊNCIA): mesma chave, MESMO projeto, mas HASH
-- diferente - erro de integridade, nunca devolve o cenário existente
-- nem cria um novo.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_a')::uuid, 'ajustado', current_date, current_date + 30,
      99999.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'ajustado'),
      repeat('9', 64), 'chave-teste-4', repeat('9', 64),
      'Tentativa de reusar a chave com conteúdo diferente.'
    );
    raise exception 'TESTE 10c FALHOU: mesma chave com hash diferente deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 10c FALHOU%' then raise; end if;
      if sqlerrm not ilike '%conflito de idempotência%' then
        raise exception 'TESTE 10c FALHOU: rejeitado, mas pelo motivo ERRADO (esperava "conflito de idempotência", achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 10c OK: mesma chave com hash diferente rejeitada como conflito de integridade (%).', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 10d (IDEMPOTÊNCIA): mesma chave, MESMO hash, MESMA empresa, mas
-- PROJETO diferente (projeto_a2, também da empresa A - nunca projeto_b,
-- que já seria rejeitado antes por tenant) - também erro de
-- integridade, nunca devolve o cenário de outro projeto.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_a2')::uuid, 'atual', current_date, current_date + 10,
      50000.00, 0, 0, 0, 0, 62000.00,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      repeat('a', 64), 'chave-teste-4', repeat('h', 64), null
    );
    raise exception 'TESTE 10d FALHOU: mesma chave para um projeto diferente (mesma empresa) deveria ter sido rejeitada (nunca devolve cenário de outro projeto).';
  exception
    when others then
      if sqlerrm like 'TESTE 10d FALHOU%' then raise; end if;
      if sqlerrm not ilike '%conflito de idempotência%' then
        raise exception 'TESTE 10d FALHOU: rejeitado, mas pelo motivo ERRADO (esperava "conflito de idempotência", achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 10d OK: mesma chave para projeto diferente (mesma empresa) rejeitada como conflito de integridade (%).', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 10e (IDEMPOTÊNCIA - isolamento entre empresas): a MESMA string
-- de chave usada pela empresa A (TESTE 4) não colide com uma aprovação
-- NOVA da empresa B - o índice único é (empresa_id, chave_idempotencia),
-- nunca só chave_idempotencia isolada.
-- ---------------------------------------------------------------------
do $$
declare
  v_novo_id uuid;
begin
  v_novo_id := public.aprovar_cenario_comercial_v2(
    current_setting('teste.empresa_b')::uuid, current_setting('teste.admin_b')::uuid,
    current_setting('teste.projeto_b')::uuid, 'atual', current_date, current_date + 5,
    9000.00, 0, 0, 0, 0, null,
    jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
    repeat('f', 64), 'chave-teste-4', repeat('g', 64), null
  );

  if v_novo_id is null then
    raise exception 'TESTE 10e FALHOU: empresa B deveria conseguir usar a MESMA string de chave que a empresa A usou (índice único é por empresa, não global).';
  end if;
  raise notice 'TESTE 10e OK: mesma string de chave em empresas diferentes não colide (índice único é (empresa_id, chave_idempotencia)) - id=%.', v_novo_id;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 4b (regressão): substituição - motivo obrigatório e só 1
-- vigente por projeto continuam funcionando na v2.
-- ---------------------------------------------------------------------
do $$
declare
  v_anterior_id uuid := current_setting('teste.id_cenario_a')::uuid;
  v_novo_id uuid;
begin
  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_a')::uuid, 'ajustado', current_date, current_date + 20,
      50000.00, 1000.00, 0, 0, 0, 62000.00,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'ajustado'),
      repeat('b', 64), 'chave-teste-4b-sem-motivo', repeat('h', 64), null
    );
    raise exception 'TESTE 4b FALHOU: substituir um cenário vigente sem motivo deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 4b FALHOU%' then raise; end if;
      raise notice 'TESTE 4b OK (parte 1): substituição sem motivo rejeitada (%).', sqlerrm;
  end;

  v_novo_id := public.aprovar_cenario_comercial_v2(
    current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
    current_setting('teste.projeto_a')::uuid, 'ajustado', current_date, current_date + 20,
    50000.00, 1000.00, 0, 0, 0, 62000.00,
    jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'ajustado'),
    repeat('b', 64), 'chave-teste-4b-com-motivo', repeat('h', 64),
    'Motivo de teste - substituição legítima.'
  );

  if (select count(*) from public.cenarios_comerciais_aprovados where projeto_id = current_setting('teste.projeto_a')::uuid and vigente = true) <> 1 then
    raise exception 'TESTE 4b FALHOU: deveria haver exatamente 1 vigente para o projeto após a substituição.';
  end if;
  if (select vigente from public.cenarios_comerciais_aprovados where id = v_anterior_id) is not false then
    raise exception 'TESTE 4b FALHOU: o cenário anterior deveria ter deixado de ser vigente.';
  end if;
  raise notice 'TESTE 4b OK (parte 2): substituição com motivo aprovada, só 1 vigente por projeto preservado.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 5: usuário sem nível admin (operador_a) rejeitado na v2.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.operador_a')::uuid,
      current_setting('teste.projeto_a')::uuid, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      repeat('c', 64), 'chave-teste-5', repeat('h', 64), 'Tentativa por não-admin.'
    );
    raise exception 'TESTE 5 FALHOU: operador (nivel_acesso<>admin) conseguiu aprovar um cenário comercial.';
  exception
    when others then
      if sqlerrm like 'TESTE 5 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%administrad%' then
        raise exception 'TESTE 5 FALHOU: rejeitado, mas pelo motivo ERRADO (achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 5 OK: usuário sem nivel_acesso=admin rejeitado (%).', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 6/6b: p_empresa_id não bate com o perfil / projeto de outra
-- empresa - rejeitados na v2.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_b')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_b')::uuid, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      repeat('d', 64), 'chave-teste-6', repeat('h', 64), null
    );
    raise exception 'TESTE 6 FALHOU: admin_a (empresa A) conseguiu aprovar informando p_empresa_id da empresa B.';
  exception
    when others then
      if sqlerrm like 'TESTE 6 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%empresa informada%' then
        raise exception 'TESTE 6 FALHOU: rejeitado, mas pelo motivo ERRADO (achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 6 OK: usuário de outra empresa rejeitado (%).', sqlerrm;
  end;
end;
$$;

do $$
begin
  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_b')::uuid, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      repeat('e', 64), 'chave-teste-6b', repeat('h', 64), null
    );
    raise exception 'TESTE 6b FALHOU: admin da empresa A conseguiu aprovar um cenário para um projeto da empresa B.';
  exception
    when others then
      if sqlerrm like 'TESTE 6b FALHOU%' then raise; end if;
      if sqlerrm not ilike '%pertence%' then
        raise exception 'TESTE 6b FALHOU: rejeitado, mas pelo motivo ERRADO (achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 6b OK: projeto de outra empresa rejeitado (%).', sqlerrm;
  end;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 8: cenário LEGADO (estilo 260007 - aprovado pela RPC ANTIGA)
-- permanece com assinatura_tecnica/chave_idempotencia NULL.
-- ---------------------------------------------------------------------
do $$
declare
  v_id_legado uuid;
  v_assinatura_depois text;
  v_chave_depois text;
begin
  insert into public.cenarios_comerciais_aprovados (
    empresa_id, projeto_id, vigente, tipo_cenario, aprovado_por,
    data_solicitada_cliente, prazo_proposto, diferenca_em_dias,
    custo_tecnico_atual, custo_adicional_total, novo_custo_tecnico,
    snapshot, versao_snapshot
  ) values (
    current_setting('teste.empresa_b')::uuid, current_setting('teste.projeto_b')::uuid, false, 'atual', current_setting('teste.admin_b')::uuid,
    current_date, current_date + 5, 5,
    4920.00, 0, 4920.00,
    jsonb_build_object('versaoFormato', 1, 'aprovadoPor', current_setting('teste.admin_b')), 1
  )
  returning id into v_id_legado;

  select assinatura_tecnica, chave_idempotencia into v_assinatura_depois, v_chave_depois
  from public.cenarios_comerciais_aprovados where id = v_id_legado;

  if v_assinatura_depois is not null or v_chave_depois is not null then
    raise exception 'TESTE 8 FALHOU: cenário legado deveria ter assinatura_tecnica/chave_idempotencia NULL.';
  end if;
  raise notice 'TESTE 8 OK: cenário legado permanece com colunas novas NULL, sem erro de CHECK (id=%).', v_id_legado;
end;
$$;

-- ROLLBACK obrigatório - nenhuma linha/fixture sintética fica gravada.
rollback;
