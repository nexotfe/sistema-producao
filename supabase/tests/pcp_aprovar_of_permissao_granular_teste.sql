-- TESTE (pré-aplicação, ambiente DESCARTÁVEL) da migration candidata
-- 20261112160000_candidata_pcp_aprovar_of_permissao_granular.sql - NÃO é
-- uma migration, vive em supabase/tests/, NUNCA deve ser aplicado em
-- produção nem no banco vinculado. Assume que a candidata já foi
-- aplicada (via `supabase db reset` local, que replica TODO o histórico
-- de supabase/migrations/ + a candidata) - NÃO embute o DDL dela.
--
-- Mesmo atalho de fixture da rodada anterior (rastreabilidade): liga
-- 'pcp.ci_ce_momento_y.ativo' para a empresa sintética, SÓ dentro desta
-- transação descartável, para evitar reconstruir uma árvore de BOM real
-- (irrelevante para o que este teste verifica: autorização granular).
--
-- Checklist coberto:
--   1. Chave pcp.aprovar_of existe no catálogo global.
--   2. Continuidade: administrador real (grupo ADM) continua aprovando
--      sem nenhuma mudança de comportamento.
--   3. Operador SEM a permissão granular concedida é rejeitado -
--      prova que o modelo antigo (admin/papel_funcional) não é mais a
--      fonte de autorização.
--   4. Operador COM a permissão granular concedida explicitamente (via
--      Grupo de Acesso, sem ser admin) consegue aprovar - prova que o
--      modelo novo (Grupos de Acesso por ação) funciona de ponta a
--      ponta, não só a continuidade do ADM.
--   5. Idempotência preservada (ja_aprovada, sem erro, sem reexecutar
--      gerar_necessidades_de_of/decidir_ci_ce_de_of).
--   6. Isolamento entre empresas preservado (OF de outra empresa nunca
--      encontrada).

begin;

do $$
declare
  v_empresa_a uuid := gen_random_uuid();
  v_empresa_b uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_operador_sem uuid := gen_random_uuid();
  v_operador_com uuid := gen_random_uuid();
  v_grupo_adm uuid := gen_random_uuid();
  v_grupo_operador_sem uuid := gen_random_uuid();
  v_grupo_operador_com uuid := gen_random_uuid();
  v_permissao_id uuid;
  v_produto uuid := gen_random_uuid();
  v_projeto uuid := gen_random_uuid();
  v_of1 uuid := gen_random_uuid();
  v_of2 uuid := gen_random_uuid();
  v_of3 uuid := gen_random_uuid();
  v_of_empresa_b uuid := gen_random_uuid();
begin
  insert into auth.users (id, is_sso_user, is_anonymous) values
    (v_admin, false, false),
    (v_operador_sem, false, false),
    (v_operador_com, false, false);

  insert into public.empresas (id, nome, slug, codigo, created_by) values
    (v_empresa_a, 'Empresa Teste A (aprovar_of granular, local)', 'empresa-teste-aprovar-of-a', 900201, v_admin),
    (v_empresa_b, 'Empresa Teste B (aprovar_of granular, local)', 'empresa-teste-aprovar-of-b', 900202, v_admin);

  -- A empresa já nasce com um grupo ADM automático (trigger) - nunca
  -- inserir um 2º, só reaproveitar o existente.
  select id into v_grupo_adm from public.grupos_acesso where empresa_id = v_empresa_a and e_grupo_adm = true;
  if v_grupo_adm is null then
    raise exception 'PRÉ-CHECAGEM FALHOU: nenhum grupo ADM automático foi criado para a empresa sintética.';
  end if;

  -- 2 grupos não-admin DISTINTOS - só o do operador_com recebe a
  -- permissão granular, o do operador_sem fica sem nenhuma linha em
  -- grupo_permissoes (nunca o mesmo grupo para os dois, senão o teste
  -- não provaria nada sobre o grupo em si).
  insert into public.grupos_acesso (id, empresa_id, nome, e_grupo_adm, created_by) values
    (v_grupo_operador_sem, v_empresa_a, 'Operador sem permissao (teste)', false, v_admin),
    (v_grupo_operador_com, v_empresa_a, 'Operador com permissao (teste)', false, v_admin);

  select id into v_permissao_id from public.permissoes where chave = 'pcp.aprovar_of';
  if v_permissao_id is null then
    raise exception 'PRÉ-CHECAGEM FALHOU: chave pcp.aprovar_of não existe no catálogo - a candidata não foi aplicada neste ambiente local.';
  end if;

  insert into public.grupo_permissoes (grupo_id, empresa_id, permissao_id, created_by) values
    (v_grupo_operador_com, v_empresa_a, v_permissao_id, v_admin);

  insert into public.profiles (id, empresa_id, nome, nivel_acesso, ativo, grupo_id) values
    (v_admin, v_empresa_a, 'Admin PCP (teste)', 'admin', true, v_grupo_adm),
    (v_operador_sem, v_empresa_a, 'Operador sem permissao (teste)', 'operador', true, v_grupo_operador_sem),
    (v_operador_com, v_empresa_a, 'Operador com permissao (teste)', 'operador', true, v_grupo_operador_com);

  insert into public.usuarios (id, empresa_id, nome, email, nivel_acesso) values
    (v_admin, v_empresa_a, 'Admin PCP (teste)', 'admin.teste@aprovarof.local', 'admin'),
    (v_operador_sem, v_empresa_a, 'Operador sem permissao (teste)', 'operador.sem.teste@aprovarof.local', 'operador'),
    (v_operador_com, v_empresa_a, 'Operador com permissao (teste)', 'operador.com.teste@aprovarof.local', 'operador');

  -- Atalho de fixture (ver cabeçalho) - só para evitar reconstruir uma
  -- árvore de BOM real, irrelevante para autorização granular.
  insert into public.configuracoes_empresa (empresa_id, chave, valor, ativo, created_by) values
    (v_empresa_a, 'pcp.ci_ce_momento_y.ativo', 'true'::jsonb, true, v_admin);

  insert into public.itens_industriais (id, empresa_id, codigo, descricao, unidade, tipo_item, created_by) values
    (v_produto, v_empresa_a, '900201-PROD-1', 'Produto teste aprovar_of granular', 'unidade', 'produto acabado', v_admin);

  insert into public.projetos (id, empresa_id, numero_projeto, tipo_projeto, status, created_by, nome) values
    (v_projeto, v_empresa_a, '900201', 'fabricacao', 'em_analise', v_admin, 'Projeto teste aprovar_of granular');

  insert into public.ordens_fabricacao (id, empresa_id, projeto_id, produto_id, numero_of, unidade, created_by, estado_aprovacao, estado_execucao) values
    (v_of1, v_empresa_a, v_projeto, v_produto, '900201-0001', 'unidade', v_admin, 'aguardando_auditoria', 'planejada'),
    (v_of2, v_empresa_a, v_projeto, v_produto, '900201-0002', 'unidade', v_admin, 'aguardando_auditoria', 'planejada'),
    (v_of3, v_empresa_a, v_projeto, v_produto, '900201-0003', 'unidade', v_admin, 'aguardando_auditoria', 'planejada');

  insert into public.ordens_fabricacao (id, empresa_id, projeto_id, produto_id, numero_of, unidade, created_by, estado_aprovacao, estado_execucao) values
    (v_of_empresa_b, v_empresa_b, v_projeto, v_produto, '900202-0001', 'unidade', v_admin, 'aguardando_auditoria', 'planejada');

  perform set_config('teste.empresa_a', v_empresa_a::text, true);
  perform set_config('teste.admin', v_admin::text, true);
  perform set_config('teste.operador_sem', v_operador_sem::text, true);
  perform set_config('teste.operador_com', v_operador_com::text, true);
  perform set_config('teste.of1', v_of1::text, true);
  perform set_config('teste.of2', v_of2::text, true);
  perform set_config('teste.of3', v_of3::text, true);
  perform set_config('teste.of_empresa_b', v_of_empresa_b::text, true);

  raise notice 'FIXTURES OK: empresa_a=%, admin=%, operador_sem=%, operador_com=%, of1=%, of2=%, of3=%, of_empresa_b=%.',
    v_empresa_a, v_admin, v_operador_sem, v_operador_com, v_of1, v_of2, v_of3, v_of_empresa_b;
end;
$$;

-- Helper de leitura só para este teste - ver justificativa idêntica no
-- arquivo de rastreabilidade (SECURITY DEFINER, dono = superuser,
-- usado só para verificar o que a própria RPC, também SECURITY
-- DEFINER, já gravou).
create function pg_temp.ler_of_teste(p_id uuid) returns public.ordens_fabricacao
  language sql security definer as $$ select * from public.ordens_fabricacao where id = p_id $$;

-- ---------------------------------------------------------------------
-- TESTE 2: administrador real (grupo ADM) continua aprovando - nenhuma
-- mudança de comportamento para quem já tinha acesso.
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
begin
  v_resultado := public.aprovar_of(current_setting('teste.of1')::uuid, 'Teste continuidade admin');
  if v_resultado->>'resultado' <> 'aprovada' then
    raise exception 'TESTE 2 FALHOU: admin (grupo ADM) deveria continuar conseguindo aprovar (veio %).', v_resultado;
  end if;

  select * into v_of from pg_temp.ler_of_teste(current_setting('teste.of1')::uuid);
  if v_of.estado_aprovacao_por <> current_setting('teste.admin')::uuid then
    raise exception 'TESTE 2 FALHOU: estado_aprovacao_por deveria ser o admin (veio %).', v_of.estado_aprovacao_por;
  end if;

  raise notice 'TESTE 2 OK: administrador (grupo ADM) continua aprovando sem nenhuma mudança de comportamento.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 5 (idempotência, reaproveitando a OF1 já aprovada no TESTE 2):
-- repetir aprovar_of na mesma OF devolve ja_aprovada, sem erro.
-- ---------------------------------------------------------------------
do $$
declare
  v_resultado jsonb;
begin
  v_resultado := public.aprovar_of(current_setting('teste.of1')::uuid, null);
  if v_resultado->>'resultado' <> 'ja_aprovada' then
    raise exception 'TESTE 5 FALHOU: repetir aprovar_of numa OF já aprovada deveria devolver ja_aprovada (veio %).', v_resultado;
  end if;
  raise notice 'TESTE 5 OK: repetição idempotente devolveu ja_aprovada, sem erro.';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: operador SEM a permissão granular (mesmo grupo não-admin,
-- sem a linha em grupo_permissoes) é REJEITADO - prova que o modelo
-- antigo (admin/papel_funcional) deixou de ser a fonte de autorização.
-- ---------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('teste.operador_sem'), 'role', 'authenticated')::text, true);
end;
$$;

set role authenticated;

do $$
begin
  begin
    perform public.aprovar_of(current_setting('teste.of2')::uuid, null);
    raise exception 'TESTE 3 FALHOU: operador sem a permissão granular conseguiu aprovar a OF.';
  exception
    when others then
      if sqlerrm like 'TESTE 3 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%sem permissao%' then
        raise exception 'TESTE 3 FALHOU: rejeitado, mas pelo motivo ERRADO (achou: %).', sqlerrm;
      end if;
  end;
  raise notice 'TESTE 3 OK: operador sem a permissão granular pcp.aprovar_of rejeitado.';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: operador COM a permissão granular concedida explicitamente
-- (mesmo grupo não-admin do TESTE 3, mas com a linha em
-- grupo_permissoes) consegue aprovar - prova o modelo novo de ponta a
-- ponta, não só a continuidade do ADM.
-- ---------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('teste.operador_com'), 'role', 'authenticated')::text, true);
end;
$$;

set role authenticated;

do $$
declare
  v_resultado jsonb;
  v_of record;
begin
  v_resultado := public.aprovar_of(current_setting('teste.of2')::uuid, 'Teste permissao granular concedida');
  if v_resultado->>'resultado' <> 'aprovada' then
    raise exception 'TESTE 4 FALHOU: operador com a permissao granular concedida deveria conseguir aprovar (veio %).', v_resultado;
  end if;

  select * into v_of from pg_temp.ler_of_teste(current_setting('teste.of2')::uuid);
  if v_of.estado_aprovacao_por <> current_setting('teste.operador_com')::uuid then
    raise exception 'TESTE 4 FALHOU: estado_aprovacao_por deveria ser o operador_com (veio %).', v_of.estado_aprovacao_por;
  end if;

  raise notice 'TESTE 4 OK: operador NAO-admin com permissao granular concedida via Grupo de Acesso conseguiu aprovar (modelo novo funciona de ponta a ponta).';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 6: OF de OUTRA empresa nunca é encontrada - isolamento
-- preservado, inalterado por esta migration.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.aprovar_of(current_setting('teste.of_empresa_b')::uuid, null);
    raise exception 'TESTE 6 FALHOU: operador da empresa A conseguiu aprovar uma OF da empresa B.';
  exception
    when others then
      if sqlerrm like 'TESTE 6 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%nao encontrada%' then
        raise exception 'TESTE 6 FALHOU: rejeitado, mas pelo motivo ERRADO (achou: %).', sqlerrm;
      end if;
  end;
  raise notice 'TESTE 6 OK: OF de outra empresa nunca encontrada - isolamento preservado.';
end;
$$;

reset role;

-- ROLLBACK obrigatório - nenhuma linha/fixture sintética fica gravada.
rollback;
