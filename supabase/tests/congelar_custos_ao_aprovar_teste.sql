-- TESTE da migration 202608220001_congelar_custos_ao_aprovar.sql - NAO
-- E' UMA MIGRATION - vive em supabase/tests/, fora do padrao de nome de
-- migration, NUNCA deve ser aplicado em producao.
--
-- AMBIENTE DE EXECUCAO: rodar SOMENTE em ambiente local/scratch
-- (`supabase start` local via Docker, ou um projeto Supabase
-- descartavel) com a migration 202608220001 ja aplicada - NUNCA contra
-- o projeto vinculado de producao.
--
-- Revisao 2 (correcao de 4 bloqueios apontados em revisao, 2026-08-22):
-- 1. TESTE 2 agora troca de verdade para o role que a aplicacao REALMENTE
--    usa para chamar aprovar_projeto_com_simulacao_v5 - nao authenticated.
--    Confirmado por introspeccao direta no projeto vinculado (proacl):
--    esta RPC tem EXECUTE somente para postgres/service_role, NUNCA para
--    authenticated - e o codigo real
--    (aprovarSimulacaoComercialAction.ts -> createSupabaseServiceClient())
--    chama via service_role depois de validar o usuario na SESSAO, nunca
--    como authenticated diretamente. Testar como authenticated aqui
--    falharia com permission denied antes de alcancar o trigger - nao
--    provaria nada sobre o guard.
-- 2. TESTES 3/4/5/8/9 nao usam mais `when others` genérico: cada um
--    exige a MENSAGEM exata do guard (3/4/5) ou SQLSTATE 42501
--    insufficient_privilege (8/9) - qualquer outro erro (RLS por motivo
--    errado, coluna inexistente, fixture ausente) FALHA o teste em vez
--    de ser confundido com sucesso. Cada teste de bloqueio de status
--    tambem confirma, depois, que o status realmente nao mudou.
--    Acrescentado um caso adicional com service_role (bypassa RLS, mas
--    current_user continua <> 'postgres') em 3/4/5, provando que o
--    guard e' do BANCO, nao um efeito colateral de RLS.
-- 3. TESTE 10 agora CRIA explicitamente o item do projeto aprovado
--    (mesmo mecanismo do TESTE 6: insert num projeto ja aprovado nasce
--    congelado sozinho) e FALHA se ele nao nascer congelado - antes,
--    a existencia era so procurada (`select ... where projeto_id = ...`)
--    e a asserção pulava silenciosamente se nao encontrasse nada.
-- 4. O arquivo agora cria sua PROPRIA fixture deterministica (empresa,
--    usuario, produto, grupo de recursos, recurso, bom, operacao) logo
--    no topo, com UUIDs fixos - nenhum teste depende mais de dado
--    externo nem usa "PULADO"; roda por completo a partir de um schema
--    scratch limpo, sem preparacao manual.
--
-- NOTA sobre autenticacao (mesmo padrao de
-- supabase/tests/fase8b_convencao_horas_adicionais_teste.sql):
-- `set_config('request.jwt.claims', ...)` simula auth.uid()/
-- empresa_atual_id() para RPCs SECURITY DEFINER. Testes que precisam
-- provar RLS/grant de verdade (UPDATE direto, SELECT na tabela de
-- backup, EXECUTE de function) trocam de verdade para o role via
-- `SET ROLE` - superusuario/dono de tabela ignora RLS e grants mesmo
-- com as claims certas. Blocos que fazem isso trazem `RESET ROLE`
-- explicito ao final. Passagem de dado entre blocos "do $$...$$"
-- antes/depois de um SET ROLE usa um GUC customizado auxiliar
-- (teste.*), transaction-local (is_local=true) - nunca sobrevive alem
-- do ROLLBACK final deste arquivo.
begin;

-- ---------------------------------------------------------------------
-- FIXTURE: empresa/usuario/produto/grupo de recursos/recurso/bom/
-- operacao deterministicos (UUIDs fixos, prefixo aaaaaaaa-...) - unica
-- fonte de dado base para todos os testes abaixo. Nada aqui e' dado
-- real; tudo desfeito pelo ROLLBACK final.
-- ---------------------------------------------------------------------
do $$
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'teste-congelar@local.test', crypt('teste123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}');

  insert into public.empresas (id, nome, slug, codigo)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Empresa Teste Congelamento', 'empresa-teste-congelamento-fixture', 999001);

  insert into public.usuarios (id, nome, email, nivel_acesso, empresa_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Usuario Teste Congelamento', 'teste-congelar@local.test', 'admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2');

  insert into public.itens_industriais (id, empresa_id, codigo, descricao, unidade, tipo_item, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'COD-FIXTURE-TESTE', 'Produto fixture teste', 'peca', 'produto acabado', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');

  insert into public.grupos_recursos (id, empresa_id, nome, codigo, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Grupo Fixture Teste', 'GRP-FIXTURE', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');

  insert into public.recursos_produtivos (id, empresa_id, grupo_id, nome, codigo, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Recurso Fixture Teste', 'REC-FIXTURE', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');

  insert into public.boms (id, empresa_id, produto_id, status, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'ativo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');

  insert into public.bom_operacoes (id, empresa_id, bom_id, ordem, descricao, tempo_estimado_minutos, recurso_produtivo_id, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 1, 'Operacao fixture teste', 60, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');

  raise notice 'FIXTURE OK: empresa/usuario/produto/grupo/recurso/bom/operacao criados de forma deterministica.';
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 1: rascunho -> em_analise -> reprovado -> rascunho nunca
-- congela custo_congelado.
-- ---------------------------------------------------------------------
do $$
declare
  v_projeto_id uuid;
  v_item_id uuid;
begin
  insert into public.projetos (empresa_id, numero_projeto, nome, tipo_projeto, status, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '900011', 'Teste congelamento 1', 'fabricacao', 'rascunho', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_projeto_id;

  insert into public.projeto_itens (empresa_id, projeto_id, produto_id, pn, descricao, quantidade, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', v_projeto_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'PN-TESTE-1', 'Item teste 1', 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_item_id;

  update public.projetos set status = 'em_analise' where id = v_projeto_id;
  if exists (select 1 from public.projeto_itens where id = v_item_id and custo_congelado is not null) then
    raise exception 'TESTE 1 FALHOU: rascunho->em_analise nao deveria congelar.';
  end if;

  update public.projetos set status = 'reprovado' where id = v_projeto_id;
  if exists (select 1 from public.projeto_itens where id = v_item_id and custo_congelado is not null) then
    raise exception 'TESTE 1 FALHOU: em_analise->reprovado nao deveria congelar.';
  end if;

  update public.projetos set status = 'rascunho' where id = v_projeto_id;
  if exists (select 1 from public.projeto_itens where id = v_item_id and custo_congelado is not null) then
    raise exception 'TESTE 1 FALHOU: reprovado->rascunho nao deveria congelar.';
  end if;

  raise notice 'TESTE 1 OK: rascunho/em_analise/reprovado nunca congelam custo_congelado.';
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 2: aprovacao REAL via aprovar_projeto_com_simulacao_v5, chamada
-- como service_role - o role que a aplicacao efetivamente usa (ver nota
-- no cabecalho do arquivo). NUNCA como authenticated: essa RPC nao tem
-- EXECUTE para authenticated (confirmado por introspeccao no projeto
-- vinculado).
-- ---------------------------------------------------------------------
do $$
declare
  v_projeto_id uuid;
  v_item_id uuid;
begin
  insert into public.projetos (empresa_id, numero_projeto, nome, tipo_projeto, status, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '900021', 'Teste congelamento 2', 'fabricacao', 'em_analise', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_projeto_id;

  insert into public.projeto_itens (empresa_id, projeto_id, produto_id, pn, descricao, quantidade, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', v_projeto_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'PN-TESTE-2', 'Item teste 2', 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_item_id;

  if exists (select 1 from public.projeto_itens where id = v_item_id and custo_congelado is not null) then
    raise exception 'TESTE 2 FALHOU (pre-condicao): item nasceu congelado num projeto em_analise.';
  end if;

  perform set_config('teste.projeto_id_2', v_projeto_id::text, true);
  perform set_config('teste.item_id_2', v_item_id::text, true);
end;
$$;

set role service_role;

do $$
declare
  v_projeto_id uuid := nullif(current_setting('teste.projeto_id_2', true), '')::uuid;
  v_item_id uuid := nullif(current_setting('teste.item_id_2', true), '')::uuid;
  v_itens jsonb;
  v_snapshot uuid;
  v_chave text := 'teste-congelar-2-' || gen_random_uuid()::text;
begin
  v_itens := jsonb_build_array(jsonb_build_object(
    'bom_operacao_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7',
    'recurso_original_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
    'necessario', 10,
    'deficit', 0,
    'distribuicoes', jsonb_build_array(jsonb_build_object(
      'recurso_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
      'origem', 'ORIGINAL',
      'ordem_consideracao', 0,
      'capacidade_bruta_periodo', 100,
      'produtividade_considerada', 0.8,
      'capacidade_efetiva', 80,
      'comprometido_inicial', 0,
      'capacidade_disponivel_inicial', 80,
      'capacidade_disponivel_antes', 80,
      'horas_padrao_alocadas', 10,
      'horas_maquina_estimadas', 12.5,
      'capacidade_disponivel_depois', 70
    ))
  ));

  v_snapshot := public.aprovar_projeto_com_simulacao_v5(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, v_projeto_id::uuid, 'teste-congelar'::text, 'sob_encomenda'::text, current_date::date,
    0::integer, current_date::date, current_date::date,
    current_date::date, (current_date + 60)::date,
    (current_date + 10)::date, 'viavel'::text, 1::smallint, 5::integer,
    v_itens::jsonb, v_chave::text, 'hash-teste-congelar-2'::text
  );

  if not exists (select 1 from public.projetos where id = v_projeto_id and status = 'aprovado') then
    raise exception 'TESTE 2 FALHOU: projeto deveria estar aprovado apos aprovar_projeto_com_simulacao_v5.';
  end if;

  if not exists (select 1 from public.projeto_itens where id = v_item_id and custo_congelado is not null and custo_congelado_em is not null) then
    raise exception 'TESTE 2 FALHOU: item deveria ter custo_congelado preenchido apos a aprovacao real via RPC.';
  end if;
end;
$$;

reset role;

do $$
begin
  raise notice 'TESTE 2 OK: aprovar_projeto_com_simulacao_v5 chamada como service_role (role real usada pela aplicacao via createSupabaseServiceClient - authenticated nunca teve EXECUTE nesta RPC) aprova o projeto e congela o custo do item.';
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 3: UPDATE direto de status para 'aprovado' rejeitado - (a)
-- authenticated sem flag; (b) authenticated forjando a flag antiga
-- app.aprovacao_via_function; (c) service_role, que ULTRAPASSA RLS mas
-- continua com current_user='service_role' <> 'postgres'. Exige a
-- MENSAGEM exata do guard nos 3 casos, nunca `when others` genérico, e
-- confirma ao final que o status nunca mudou.
-- ---------------------------------------------------------------------
do $$
declare
  v_projeto_id uuid;
begin
  insert into public.projetos (empresa_id, numero_projeto, nome, tipo_projeto, status, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '900031', 'Teste congelamento 3', 'fabricacao', 'em_analise', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_projeto_id;

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'role', 'authenticated')::text, true);
  perform set_config('teste.projeto_id_3', v_projeto_id::text, true);
end;
$$;

set role authenticated;

do $$
declare
  v_projeto_id uuid := nullif(current_setting('teste.projeto_id_3', true), '')::uuid;
  v_msg_esperada constant text := 'Transicao de status para aprovado so pode ser feita via aprovar_projeto_com_simulacao().';
begin
  begin
    update public.projetos set status = 'aprovado' where id = v_projeto_id;
    raise exception 'TESTE 3a FALHOU: authenticated conseguiu aprovar via UPDATE direto.';
  exception
    when others then
      if sqlerrm like 'TESTE 3a FALHOU%' then raise; end if;
      if sqlerrm <> v_msg_esperada then
        raise exception 'TESTE 3a FALHOU: erro inesperado, nao o do guard de entrada: % (sqlstate=%)', sqlerrm, sqlstate;
      end if;
  end;

  begin
    perform set_config('app.aprovacao_via_function', 'true', true);
    update public.projetos set status = 'aprovado' where id = v_projeto_id;
    raise exception 'TESTE 3b FALHOU: authenticated conseguiu aprovar setando a flag app.aprovacao_via_function manualmente.';
  exception
    when others then
      if sqlerrm like 'TESTE 3b FALHOU%' then raise; end if;
      if sqlerrm <> v_msg_esperada then
        raise exception 'TESTE 3b FALHOU: erro inesperado, nao o do guard de entrada: % (sqlstate=%)', sqlerrm, sqlstate;
      end if;
  end;
end;
$$;

reset role;

set role service_role;

do $$
declare
  v_projeto_id uuid := nullif(current_setting('teste.projeto_id_3', true), '')::uuid;
  v_msg_esperada constant text := 'Transicao de status para aprovado so pode ser feita via aprovar_projeto_com_simulacao().';
begin
  begin
    update public.projetos set status = 'aprovado' where id = v_projeto_id;
    raise exception 'TESTE 3c FALHOU: service_role conseguiu aprovar via UPDATE direto (RLS ultrapassada, o guard de current_user deveria ter barrado mesmo assim).';
  exception
    when others then
      if sqlerrm like 'TESTE 3c FALHOU%' then raise; end if;
      if sqlerrm <> v_msg_esperada then
        raise exception 'TESTE 3c FALHOU: erro inesperado, nao o do guard de entrada: % (sqlstate=%)', sqlerrm, sqlstate;
      end if;
  end;
end;
$$;

reset role;

do $$
declare
  v_projeto_id uuid := nullif(current_setting('teste.projeto_id_3', true), '')::uuid;
begin
  if exists (select 1 from public.projetos where id = v_projeto_id and status <> 'em_analise') then
    raise exception 'TESTE 3 FALHOU: status do projeto mudou apesar das 3 tentativas rejeitadas.';
  end if;
  raise notice 'TESTE 3 OK: UPDATE direto para aprovado rejeitado (mensagem exata do guard) para authenticated com e sem forjar a flag antiga, e para service_role (RLS ultrapassada); status permaneceu em_analise nas 3 tentativas.';
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 4: projeto ja 'aprovado' - saida bloqueada, sem excecao, para
-- authenticated E para service_role (RLS ultrapassada). Exige mensagem
-- exata e confirma status inalterado ao final.
-- ---------------------------------------------------------------------
do $$
declare
  v_projeto_id uuid;
begin
  insert into public.projetos (empresa_id, numero_projeto, nome, tipo_projeto, status, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '900041', 'Teste congelamento 4', 'fabricacao', 'rascunho', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_projeto_id;

  -- Como postgres (current_user=postgres): passa no guard de entrada,
  -- igual a uma aprovacao real via RPC.
  update public.projetos set status = 'aprovado' where id = v_projeto_id;

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'role', 'authenticated')::text, true);
  perform set_config('teste.projeto_id_4', v_projeto_id::text, true);
end;
$$;

set role authenticated;

do $$
declare
  v_projeto_id uuid := nullif(current_setting('teste.projeto_id_4', true), '')::uuid;
  v_msg_esperada constant text := 'Projeto aprovado nao pode ter o status alterado. A reabertura de um orcamento aprovado exige uma RPC formal de revisao, ainda nao implementada neste sistema.';
begin
  begin
    update public.projetos set status = 'em_analise' where id = v_projeto_id;
    raise exception 'TESTE 4a FALHOU: authenticated conseguiu tirar o projeto de aprovado.';
  exception
    when others then
      if sqlerrm like 'TESTE 4a FALHOU%' then raise; end if;
      if sqlerrm <> v_msg_esperada then
        raise exception 'TESTE 4a FALHOU: erro inesperado, nao o do guard de saida: % (sqlstate=%)', sqlerrm, sqlstate;
      end if;
  end;
end;
$$;

reset role;

set role service_role;

do $$
declare
  v_projeto_id uuid := nullif(current_setting('teste.projeto_id_4', true), '')::uuid;
  v_msg_esperada constant text := 'Projeto aprovado nao pode ter o status alterado. A reabertura de um orcamento aprovado exige uma RPC formal de revisao, ainda nao implementada neste sistema.';
begin
  begin
    update public.projetos set status = 'em_analise' where id = v_projeto_id;
    raise exception 'TESTE 4b FALHOU: service_role conseguiu tirar o projeto de aprovado (RLS ultrapassada, o guard deveria ter barrado mesmo assim).';
  exception
    when others then
      if sqlerrm like 'TESTE 4b FALHOU%' then raise; end if;
      if sqlerrm <> v_msg_esperada then
        raise exception 'TESTE 4b FALHOU: erro inesperado, nao o do guard de saida: % (sqlstate=%)', sqlerrm, sqlstate;
      end if;
  end;
end;
$$;

reset role;

do $$
declare
  v_projeto_id uuid := nullif(current_setting('teste.projeto_id_4', true), '')::uuid;
begin
  if not exists (select 1 from public.projetos where id = v_projeto_id and status = 'aprovado') then
    raise exception 'TESTE 4 FALHOU: status do projeto nao permaneceu aprovado apos as tentativas rejeitadas.';
  end if;
  raise notice 'TESTE 4 OK: saida de aprovado bloqueada (mensagem exata) para authenticated e para service_role; status permaneceu aprovado.';
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 5: mesmo caso do TESTE 4, mas tentando ANTES definir uma flag
-- de sessao - o nome que a Revisao 1 deste desenho chegou a propor
-- (app.reabertura_projeto_aprovado, nunca implementado) e um nome
-- arbitrario. Testado para authenticated E service_role. Nenhum dos
-- dois tem efeito - o bloqueio de saida e' incondicional no codigo,
-- nao le nenhum GUC.
-- ---------------------------------------------------------------------
do $$
declare
  v_projeto_id uuid;
begin
  insert into public.projetos (empresa_id, numero_projeto, nome, tipo_projeto, status, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '900051', 'Teste congelamento 5', 'fabricacao', 'rascunho', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_projeto_id;

  update public.projetos set status = 'aprovado' where id = v_projeto_id;

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'role', 'authenticated')::text, true);
  perform set_config('teste.projeto_id_5', v_projeto_id::text, true);
end;
$$;

set role authenticated;

do $$
declare
  v_projeto_id uuid := nullif(current_setting('teste.projeto_id_5', true), '')::uuid;
  v_msg_esperada constant text := 'Projeto aprovado nao pode ter o status alterado. A reabertura de um orcamento aprovado exige uma RPC formal de revisao, ainda nao implementada neste sistema.';
begin
  begin
    perform set_config('app.reabertura_projeto_aprovado', 'true', true);
    perform set_config('app.flag_totalmente_inventada_para_este_teste', 'true', true);
    update public.projetos set status = 'rascunho' where id = v_projeto_id;
    raise exception 'TESTE 5a FALHOU: uma flag de sessao (nomeada ou inventada) permitiu sair de aprovado (authenticated).';
  exception
    when others then
      if sqlerrm like 'TESTE 5a FALHOU%' then raise; end if;
      if sqlerrm <> v_msg_esperada then
        raise exception 'TESTE 5a FALHOU: erro inesperado, nao o do guard de saida: % (sqlstate=%)', sqlerrm, sqlstate;
      end if;
  end;
end;
$$;

reset role;

set role service_role;

do $$
declare
  v_projeto_id uuid := nullif(current_setting('teste.projeto_id_5', true), '')::uuid;
  v_msg_esperada constant text := 'Projeto aprovado nao pode ter o status alterado. A reabertura de um orcamento aprovado exige uma RPC formal de revisao, ainda nao implementada neste sistema.';
begin
  begin
    perform set_config('app.reabertura_projeto_aprovado', 'true', true);
    update public.projetos set status = 'rascunho' where id = v_projeto_id;
    raise exception 'TESTE 5b FALHOU: uma flag de sessao permitiu sair de aprovado (service_role, RLS ultrapassada).';
  exception
    when others then
      if sqlerrm like 'TESTE 5b FALHOU%' then raise; end if;
      if sqlerrm <> v_msg_esperada then
        raise exception 'TESTE 5b FALHOU: erro inesperado, nao o do guard de saida: % (sqlstate=%)', sqlerrm, sqlstate;
      end if;
  end;
end;
$$;

reset role;

do $$
declare
  v_projeto_id uuid := nullif(current_setting('teste.projeto_id_5', true), '')::uuid;
begin
  if not exists (select 1 from public.projetos where id = v_projeto_id and status = 'aprovado') then
    raise exception 'TESTE 5 FALHOU: status nao permaneceu aprovado apos as tentativas com flags.';
  end if;
  raise notice 'TESTE 5 OK: nenhuma flag de sessao (nomeada ou inventada) muda o resultado, nem para authenticated nem para service_role; status permaneceu aprovado.';
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 6/7: item novo inserido - so nasce congelado se o projeto ja
-- estiver 'aprovado'; num projeto 'em_analise' nasce sem congelamento.
-- ---------------------------------------------------------------------
do $$
declare
  v_projeto_aprovado_id uuid;
  v_projeto_em_analise_id uuid;
  v_item_aprovado_id uuid;
  v_item_em_analise_id uuid;
begin
  insert into public.projetos (empresa_id, numero_projeto, nome, tipo_projeto, status, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '900061', 'Teste congelamento 6', 'fabricacao', 'rascunho', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_projeto_aprovado_id;
  update public.projetos set status = 'aprovado' where id = v_projeto_aprovado_id;

  insert into public.projetos (empresa_id, numero_projeto, nome, tipo_projeto, status, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '900071', 'Teste congelamento 7', 'fabricacao', 'em_analise', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_projeto_em_analise_id;

  insert into public.projeto_itens (empresa_id, projeto_id, produto_id, pn, descricao, quantidade, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', v_projeto_aprovado_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'PN-TESTE-6', 'Item teste 6', 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_item_aprovado_id;

  insert into public.projeto_itens (empresa_id, projeto_id, produto_id, pn, descricao, quantidade, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', v_projeto_em_analise_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'PN-TESTE-7', 'Item teste 7', 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_item_em_analise_id;

  if not exists (select 1 from public.projeto_itens where id = v_item_aprovado_id and custo_congelado is not null) then
    raise exception 'TESTE 6 FALHOU: item inserido num projeto aprovado deveria nascer congelado.';
  end if;
  raise notice 'TESTE 6 OK: item novo em projeto aprovado nasce congelado.';

  if exists (select 1 from public.projeto_itens where id = v_item_em_analise_id and custo_congelado is not null) then
    raise exception 'TESTE 7 FALHOU: item inserido num projeto em_analise nao deveria nascer congelado.';
  end if;
  raise notice 'TESTE 7 OK: item novo em projeto em_analise nasce sem congelamento.';
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 8: descongelar_custos_projeto negada para authenticated - exige
-- SQLSTATE 42501 (insufficient_privilege), nunca qualquer erro.
-- ---------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'role', 'authenticated')::text, true);
end;
$$;

set role authenticated;

do $$
begin
  begin
    perform public.descongelar_custos_projeto(gen_random_uuid());
    raise exception 'TESTE 8 FALHOU: authenticated conseguiu executar descongelar_custos_projeto.';
  exception
    when others then
      if sqlerrm like 'TESTE 8 FALHOU%' then raise; end if;
      if sqlstate <> '42501' then
        raise exception 'TESTE 8 FALHOU: erro inesperado, esperava 42501 insufficient_privilege: % (sqlstate=%)', sqlerrm, sqlstate;
      end if;
      raise notice 'TESTE 8 OK: descongelar_custos_projeto negada para authenticated com SQLSTATE 42501 (%).', sqlerrm;
  end;
end;
$$;

reset role;


-- ---------------------------------------------------------------------
-- TESTE 9: leitura da tabela de backup negada para authenticated -
-- exige SQLSTATE 42501.
-- ---------------------------------------------------------------------
set role authenticated;

do $$
begin
  begin
    perform 1 from public._backfill_202608220001_custo_congelado_backup limit 1;
    raise exception 'TESTE 9 FALHOU: authenticated conseguiu ler a tabela de backup.';
  exception
    when others then
      if sqlerrm like 'TESTE 9 FALHOU%' then raise; end if;
      if sqlstate <> '42501' then
        raise exception 'TESTE 9 FALHOU: erro inesperado, esperava 42501 insufficient_privilege: % (sqlstate=%)', sqlerrm, sqlstate;
      end if;
      raise notice 'TESTE 9 OK: leitura da tabela de backup negada para authenticated com SQLSTATE 42501 (%).', sqlerrm;
  end;
end;
$$;

reset role;


-- ---------------------------------------------------------------------
-- TESTE 10: backfill - mesma function chamada pela migration
-- (_backfill_202608220001_limpar_congelamento_prematuro, nunca uma
-- copia do SQL). 3 fixtures: nao-aprovado sem edicao manual (deve ser
-- limpo), nao-aprovado com edicao manual (NUNCA deve ser limpo),
-- aprovado (o item e' CRIADO explicitamente - nasce congelado sozinho,
-- mesmo mecanismo do TESTE 6 - e sua existencia congelada e' exigida
-- como pre-condicao, nunca so procurada). Confirma backup com o valor
-- original e idempotencia.
-- ---------------------------------------------------------------------
do $$
declare
  v_projeto_nao_aprovado_id uuid;
  v_projeto_nao_aprovado_manual_id uuid;
  v_projeto_aprovado_id uuid;
  v_item_limpar_id uuid;
  v_item_manual_id uuid;
  v_item_aprovado_id uuid;
  v_count_backup_1a integer;
  v_count_backup_2a integer;
begin
  insert into public.projetos (empresa_id, numero_projeto, nome, tipo_projeto, status, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '900101', 'Teste backfill nao aprovado', 'fabricacao', 'em_analise', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_projeto_nao_aprovado_id;

  insert into public.projetos (empresa_id, numero_projeto, nome, tipo_projeto, status, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '900102', 'Teste backfill nao aprovado manual', 'fabricacao', 'em_analise', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_projeto_nao_aprovado_manual_id;

  insert into public.projetos (empresa_id, numero_projeto, nome, tipo_projeto, status, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '900103', 'Teste backfill aprovado', 'fabricacao', 'rascunho', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_projeto_aprovado_id;
  update public.projetos set status = 'aprovado' where id = v_projeto_aprovado_id;

  -- Insercao direta ja com custo_congelado preenchido (bypassa o
  -- calculo real da trigger de proposito - este teste valida o
  -- BACKFILL, nao o calculo de custo, ja coberto pelos TESTES 2/6).
  insert into public.projeto_itens (empresa_id, projeto_id, produto_id, pn, descricao, quantidade, created_by, custo_congelado, custo_congelado_em, custo_editado_manualmente)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', v_projeto_nao_aprovado_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'PN-TESTE-10A', 'Item backfill a limpar', 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 999.99, now() - interval '30 days', false)
  returning id into v_item_limpar_id;

  insert into public.projeto_itens (empresa_id, projeto_id, produto_id, pn, descricao, quantidade, created_by, custo_congelado, custo_congelado_em, custo_editado_manualmente)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', v_projeto_nao_aprovado_manual_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'PN-TESTE-10B', 'Item editado manualmente', 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 888.88, now() - interval '30 days', true)
  returning id into v_item_manual_id;

  -- Item do projeto APROVADO: criado DEPOIS do projeto virar aprovado,
  -- entao trg_projeto_itens_congelar_ao_inserir ja o congela sozinha
  -- (mesmo mecanismo do TESTE 6) - nunca so' procurado.
  insert into public.projeto_itens (empresa_id, projeto_id, produto_id, pn, descricao, quantidade, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', v_projeto_aprovado_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'PN-TESTE-10C', 'Item projeto aprovado', 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
  returning id into v_item_aprovado_id;

  if not exists (select 1 from public.projeto_itens where id = v_item_aprovado_id and custo_congelado is not null) then
    raise exception 'TESTE 10 FALHOU (pre-condicao): item do projeto aprovado deveria ter nascido congelado - sem isso o teste nao comprova preservacao de nada.';
  end if;

  -- 1a chamada - mesma function usada pela migration.
  perform public._backfill_202608220001_limpar_congelamento_prematuro();

  if exists (select 1 from public.projeto_itens where id = v_item_limpar_id and custo_congelado is not null) then
    raise exception 'TESTE 10 FALHOU: item nao-aprovado sem edicao manual deveria ter sido limpo.';
  end if;

  if not exists (select 1 from public.projeto_itens where id = v_item_manual_id and custo_congelado = 888.88) then
    raise exception 'TESTE 10 FALHOU: item com custo_editado_manualmente=true NUNCA deveria ser limpo.';
  end if;

  if not exists (select 1 from public.projeto_itens where id = v_item_aprovado_id and custo_congelado is not null) then
    raise exception 'TESTE 10 FALHOU: item de projeto aprovado nao deveria ter sido tocado pelo backfill.';
  end if;

  if not exists (select 1 from public._backfill_202608220001_custo_congelado_backup where projeto_itens_id = v_item_limpar_id and custo_congelado = 999.99) then
    raise exception 'TESTE 10 FALHOU: valor original (999.99) deveria estar preservado no backup.';
  end if;

  if exists (select 1 from public._backfill_202608220001_custo_congelado_backup where projeto_itens_id = v_item_manual_id) then
    raise exception 'TESTE 10 FALHOU: item com edicao manual nao deveria ter entrado no backup (nunca foi limpo).';
  end if;

  if exists (select 1 from public._backfill_202608220001_custo_congelado_backup where projeto_itens_id = v_item_aprovado_id) then
    raise exception 'TESTE 10 FALHOU: item de projeto aprovado nao deveria ter entrado no backup.';
  end if;

  select count(*) into v_count_backup_1a from public._backfill_202608220001_custo_congelado_backup;

  -- 2a chamada (idempotencia) - nao pode alterar nem duplicar nada.
  perform public._backfill_202608220001_limpar_congelamento_prematuro();

  select count(*) into v_count_backup_2a from public._backfill_202608220001_custo_congelado_backup;

  if v_count_backup_2a <> v_count_backup_1a then
    raise exception 'TESTE 10 FALHOU: segunda chamada do backfill deveria ser idempotente - backup foi de % para % linhas.', v_count_backup_1a, v_count_backup_2a;
  end if;

  raise notice 'TESTE 10 OK: backfill (mesma function chamada pela migration) limpa so o item elegivel, preserva edicao manual e projeto aprovado (item aprovado criado e comprovado explicitamente, nunca so procurado), backup guarda o valor original, segunda chamada e idempotente.';
end;
$$;


rollback;
