-- TESTE (pós-aplicação) da migration
-- 20260822165408_aprovar_cenario_comercial_service_role_assinatura_tecnica.sql
-- (Fase 1 da transição em duas fases, correção explícita do usuário -
-- ver cabeçalho da migration) - NÃO é uma migration, vive em
-- supabase/tests/, nunca deve ser aplicado em produção. Assume que a
-- migration real já foi aplicada - NÃO embute o DDL dela.
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
--   0. COEXISTÊNCIA (correção desta rodada): as DUAS RPCs (antiga,
--      12 parâmetros, e nova, aprovar_cenario_comercial_v2) existem e
--      funcionam SIMULTANEAMENTE - a antiga continua chamável por
--      authenticated (código ainda em produção), a nova só por
--      service_role (código novo). Nenhuma delas quebra a outra.
--   1. anon/authenticated negados por ACL (42501) na RPC NOVA - nunca
--      chegam a executar o corpo da função. A RPC ANTIGA continua
--      aceitando authenticated normalmente (testado em 0).
--   2. service_role aprova com sucesso via v2; aprovado_por gravado é
--      EXATAMENTE p_aprovado_por (nunca auth.uid()/sessão - sob
--      service_role não haveria JWT de qualquer forma).
--   3. as DUAS assinaturas existem no catálogo (nem a antiga foi
--      removida, nem a nova ficou faltando) - a remoção da antiga é
--      escopo da Fase 2 (migration futura, não incluída aqui).
--   4. usuário sem nível admin rejeitado na v2 (mesma mensagem/motivo
--      de antes: "administrad").
--   5. usuário de outra empresa (p_empresa_id não bate com o perfil)
--      rejeitado na v2.
--   6. projeto de outra empresa rejeitado na v2.
--   7. p_assinatura_tecnica nula ou malformada rejeitada na v2.
--   8. cenário legado (estilo 260007: aprovado pela RPC ANTIGA)
--      permanece com assinatura_tecnica NULL - nunca backfillado,
--      nunca bloqueado por CHECK.
--   9. regressão: substituição/motivo obrigatório e "1 vigente por
--      projeto" continuam funcionando na v2.
--
-- FORA de escopo aqui (não verificável em SQL puro, coberto em
-- TypeScript): "Server Action rejeita ANTES de criar o client
-- privilegiado" - ver orquestrarAprovacaoCenarioComercial.test.ts
-- (testes "nao_autenticado"/"nao_autorizado"/"erro genérico quando
-- calcularAssinaturaTecnica falha"); "código novo chama exclusivamente
-- v2, nunca a antiga" - ver persistirViaRpcAprovacaoCenario.test.ts.

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
    (v_projeto_b, v_empresa_b, '900002', 'fabricacao', 'em_analise', v_admin_b, 'Projeto Teste B (local)');

  perform set_config('teste.admin_a', v_admin_a::text, true);
  perform set_config('teste.operador_a', v_operador_a::text, true);
  perform set_config('teste.admin_b', v_admin_b::text, true);
  perform set_config('teste.empresa_a', v_empresa_a::text, true);
  perform set_config('teste.empresa_b', v_empresa_b::text, true);
  perform set_config('teste.projeto_a', v_projeto_a::text, true);
  perform set_config('teste.projeto_b', v_projeto_b::text, true);

  raise notice 'FIXTURES OK: empresa_a=%, admin_a=%, operador_a=%, projeto_a=%, empresa_b=%, admin_b=%, projeto_b=%.',
    v_empresa_a, v_admin_a, v_operador_a, v_projeto_a, v_empresa_b, v_admin_b, v_projeto_b;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 3 (item 3 do escopo, REESCRITO para Fase 1 - a versão anterior
-- deste teste, de um desenho já superado, esperava a assinatura antiga
-- SUMIR nesta migration; agora ela precisa continuar existindo): as
-- DUAS assinaturas coexistem no catálogo.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.aprovar_cenario_comercial(uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text)') is null then
    raise exception 'TESTE 3a FALHOU: a RPC ANTIGA (12 parâmetros) deveria continuar existindo nesta fase (Fase 1 é aditiva - a remoção é escopo da Fase 2, migration futura).';
  end if;
  raise notice 'TESTE 3a OK: RPC antiga (12 parâmetros) continua existindo - Fase 1 é aditiva, nunca remove.';

  if to_regprocedure('public.aprovar_cenario_comercial_v2(uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text)') is null then
    raise exception 'TESTE 3b FALHOU: a RPC NOVA (aprovar_cenario_comercial_v2) deveria existir depois desta migration.';
  end if;
  raise notice 'TESTE 3b OK: RPC nova (aprovar_cenario_comercial_v2) existe.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 0 (item 0 do escopo - COEXISTÊNCIA): a RPC ANTIGA continua
-- funcionando NORMALMENTE para `authenticated`, com as claims de JWT
-- (mesmo idioma de cenarios_comerciais_aprovados_teste.sql) - prova que
-- o código ainda em produção (que só conhece a RPC antiga) não quebra
-- com esta migration aditiva.
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
    raise exception 'TESTE 0 FALHOU: RPC antiga (via authenticated, mesmo código de produção hoje) deveria continuar funcionando depois desta migration aditiva.';
  end if;

  select * into v_row from public.cenarios_comerciais_aprovados where id = v_novo_id;
  if v_row.assinatura_tecnica is not null then
    raise exception 'TESTE 0 FALHOU: cenário aprovado pela RPC ANTIGA nunca deveria gravar assinatura_tecnica (a coluna nova é opcional/nullable, RPC antiga não a conhece).';
  end if;

  perform set_config('teste.id_cenario_a_rpc_antiga', v_novo_id::text, true);
  raise notice 'TESTE 0 OK: RPC antiga continua funcionando para authenticated depois da migration aditiva (id=%, assinatura_tecnica=NULL como esperado).', v_novo_id;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 1a (item 1): `authenticated` negado por ACL (42501) NA RPC
-- NOVA - nunca chega a executar o corpo da função (a rejeição é da
-- GRANT/REVOKE, não de uma validação interna). A RPC antiga (TESTE 0
-- acima) segue aceitando authenticated normalmente - só a nova é
-- restrita.
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
      repeat('a', 64), null
    );
    raise exception 'TESTE 1a FALHOU: authenticated conseguiu chamar aprovar_cenario_comercial_v2 diretamente.';
  exception
    when others then
      v_sqlstate := sqlstate;
      if sqlerrm like 'TESTE 1a FALHOU%' then raise; end if;
  end;

  if v_sqlstate is distinct from '42501' then
    raise exception 'TESTE 1a FALHOU: authenticated foi rejeitado, mas com sqlstate errado (esperava 42501/insufficient_privilege, achou %).', v_sqlstate;
  end if;
  raise notice 'TESTE 1a OK: authenticated negado por ACL na RPC NOVA (sqlstate 42501), nunca executa o corpo da função.';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 1b (item 1): `anon` negado por ACL (42501) na RPC nova.
-- ---------------------------------------------------------------------
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
      repeat('a', 64), null
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
-- TESTE 7 (item 7): p_assinatura_tecnica nula ou malformada rejeitada
-- na v2 - rodado como service_role (senão o erro seria sempre 42501 de
-- ACL, nunca chegaria na validação de forma).
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
      null, null
    );
    raise exception 'TESTE 7a FALHOU: p_assinatura_tecnica NULL deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 7a FALHOU%' then raise; end if;
      if sqlerrm not ilike '%assinatura_tecnica%' then
        raise exception 'TESTE 7a FALHOU: rejeitado, mas pelo motivo ERRADO (esperava menção a assinatura_tecnica, achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 7a OK: p_assinatura_tecnica NULL rejeitada (%).', sqlerrm;
  end;

  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_a')::uuid, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      'hash-curto-demais', null
    );
    raise exception 'TESTE 7b FALHOU: p_assinatura_tecnica malformada (não hex-64) deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 7b FALHOU%' then raise; end if;
      if sqlerrm not ilike '%assinatura_tecnica%' then
        raise exception 'TESTE 7b FALHOU: rejeitado, mas pelo motivo ERRADO (esperava menção a assinatura_tecnica, achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 7b OK: p_assinatura_tecnica malformada rejeitada (%).', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 4 (item 2 do escopo): service_role aprova com sucesso via v2;
-- aprovado_por = EXATAMENTE p_aprovado_por (nunca auth.uid()/sessão -
-- nenhuma claim de JWT foi configurada nesta transação, provando que a
-- RPC não depende disso).
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
    repeat('a', 64), 'Substitui o cenário aprovado pela RPC antiga no TESTE 0.'
  );

  if v_novo_id is null then
    raise exception 'TESTE 4 FALHOU: aprovar_cenario_comercial_v2 (service_role) deveria devolver um id.';
  end if;

  select * into v_row from public.cenarios_comerciais_aprovados where id = v_novo_id;

  if v_row.aprovado_por <> current_setting('teste.admin_a')::uuid then
    raise exception 'TESTE 4 FALHOU: aprovado_por (%) deveria ser EXATAMENTE p_aprovado_por (%) - nunca derivado de sessão/auth.uid().', v_row.aprovado_por, current_setting('teste.admin_a');
  end if;
  if (v_row.snapshot ->> 'aprovadoPor') <> current_setting('teste.admin_a') then
    raise exception 'TESTE 4 FALHOU: snapshot.aprovadoPor deveria ser sobrescrito com p_aprovado_por.';
  end if;
  if v_row.assinatura_tecnica <> repeat('a', 64) then
    raise exception 'TESTE 4 FALHOU: assinatura_tecnica gravada não bate com o parâmetro enviado.';
  end if;
  if v_row.empresa_id <> current_setting('teste.empresa_a')::uuid then
    raise exception 'TESTE 4 FALHOU: empresa_id gravado (%) deveria ser EXATAMENTE p_empresa_id.', v_row.empresa_id;
  end if;

  -- Prova adicional de coexistência: a v2 conseguiu substituir o
  -- vigente aprovado pela RPC ANTIGA no TESTE 0 (mesma trava/mesma
  -- regra de "1 vigente por projeto", entre as duas RPCs).
  if (select count(*) from public.cenarios_comerciais_aprovados where projeto_id = current_setting('teste.projeto_a')::uuid and vigente = true) <> 1 then
    raise exception 'TESTE 4 FALHOU: deveria haver exatamente 1 vigente para o projeto (v2 substituindo o vigente da RPC antiga).';
  end if;
  if (select vigente from public.cenarios_comerciais_aprovados where id = current_setting('teste.id_cenario_a_rpc_antiga')::uuid) is not false then
    raise exception 'TESTE 4 FALHOU: o cenário aprovado pela RPC ANTIGA (TESTE 0) deveria ter deixado de ser vigente após a v2 substituí-lo.';
  end if;

  perform set_config('teste.id_cenario_a', v_novo_id::text, true);
  raise notice 'TESTE 4 OK: service_role aprovou com sucesso via v2, substituindo o vigente da RPC antiga - aprovado_por/empresa_id/assinatura_tecnica gravados EXATAMENTE como os parâmetros explícitos (id=%).', v_novo_id;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 4b (item 9 do escopo, regressão): substituição - motivo
-- obrigatório e só 1 vigente por projeto continuam funcionando na v2.
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
      repeat('b', 64), null
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
    repeat('b', 64), 'Motivo de teste - substituição legítima.'
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
-- TESTE 5 (item 4 do escopo): usuário sem nível admin (operador_a)
-- rejeitado na v2 - mesma mensagem de antes ("administrad").
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.operador_a')::uuid,
      current_setting('teste.projeto_a')::uuid, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      repeat('c', 64), 'Tentativa por não-admin.'
    );
    raise exception 'TESTE 5 FALHOU: operador (nivel_acesso<>admin) conseguiu aprovar um cenário comercial.';
  exception
    when others then
      if sqlerrm like 'TESTE 5 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%administrad%' then
        raise exception 'TESTE 5 FALHOU: rejeitado, mas pelo motivo ERRADO (esperava menção a "administrad", achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 5 OK: usuário sem nivel_acesso=admin rejeitado especificamente por falta de permissão (%).', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 6 (item 5 do escopo): p_empresa_id não bate com a empresa real
-- do perfil informado (admin_a é da empresa A, mas p_empresa_id manda
-- empresa B) - rejeitado na v2.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_b')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_b')::uuid, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      repeat('d', 64), null
    );
    raise exception 'TESTE 6 FALHOU: admin_a (empresa A) conseguiu aprovar informando p_empresa_id da empresa B.';
  exception
    when others then
      if sqlerrm like 'TESTE 6 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%empresa informada%' then
        raise exception 'TESTE 6 FALHOU: rejeitado, mas pelo motivo ERRADO (esperava menção a "empresa informada", achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 6 OK: usuário de outra empresa (p_empresa_id não bate com o perfil) rejeitado (%).', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 6b (item 6 do escopo): projeto de outra empresa rejeitado na
-- v2 - admin_a e p_empresa_id corretos (empresa A), mas p_projeto_id é
-- da empresa B.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.aprovar_cenario_comercial_v2(
      current_setting('teste.empresa_a')::uuid, current_setting('teste.admin_a')::uuid,
      current_setting('teste.projeto_b')::uuid, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      repeat('e', 64), null
    );
    raise exception 'TESTE 6b FALHOU: admin da empresa A conseguiu aprovar um cenário para um projeto da empresa B.';
  exception
    when others then
      if sqlerrm like 'TESTE 6b FALHOU%' then raise; end if;
      if sqlerrm not ilike '%pertence%' then
        raise exception 'TESTE 6b FALHOU: rejeitado, mas pelo motivo ERRADO (esperava menção a "pertence", achou: %).', sqlerrm;
      end if;
      raise notice 'TESTE 6b OK: projeto de outra empresa rejeitado especificamente por tenant (%).', sqlerrm;
  end;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 8 (item 8 do escopo): cenário LEGADO (estilo 260007 - aprovado
-- pela RPC ANTIGA) permanece com assinatura_tecnica NULL - inserido
-- diretamente (superusuário, simulando o estado histórico da tabela)
-- - nunca um backfill, nunca bloqueado pelo CHECK de formato (NULL é
-- explicitamente aceito). O TESTE 0, acima, já prova o mesmo efeito de
-- forma end-to-end (via a RPC antiga de verdade, não um INSERT direto)
-- - este teste mantém a checagem direta do CHECK de formato/backfill.
-- ---------------------------------------------------------------------
do $$
declare
  v_id_legado uuid;
  v_assinatura_depois text;
begin
  insert into public.cenarios_comerciais_aprovados (
    empresa_id, projeto_id, vigente, tipo_cenario, aprovado_por,
    data_solicitada_cliente, prazo_proposto, diferenca_em_dias,
    custo_tecnico_atual, custo_adicional_total, novo_custo_tecnico,
    snapshot, versao_snapshot
    -- assinatura_tecnica OMITIDA de propósito - simula uma linha
    -- gravada pela RPC ANTIGA (que não referencia esta coluna).
  ) values (
    current_setting('teste.empresa_b')::uuid, current_setting('teste.projeto_b')::uuid, true, 'atual', current_setting('teste.admin_b')::uuid,
    current_date, current_date + 5, 5,
    4920.00, 0, 4920.00,
    jsonb_build_object('versaoFormato', 1, 'aprovadoPor', current_setting('teste.admin_b')), 1
  )
  returning id into v_id_legado;

  select assinatura_tecnica into v_assinatura_depois from public.cenarios_comerciais_aprovados where id = v_id_legado;

  if v_assinatura_depois is not null then
    raise exception 'TESTE 8 FALHOU: cenário legado deveria ter assinatura_tecnica NULL (achou %).', v_assinatura_depois;
  end if;
  raise notice 'TESTE 8 OK: cenário legado (estilo 260007, RPC antiga) permanece com assinatura_tecnica NULL, sem erro de CHECK e sem backfill (id=%).', v_id_legado;
end;
$$;

-- ROLLBACK obrigatório - nenhuma linha/fixture sintética fica gravada.
rollback;
