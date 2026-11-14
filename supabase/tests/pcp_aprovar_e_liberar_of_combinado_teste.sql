-- TESTE (pré-aplicação, ambiente DESCARTÁVEL) da migration candidata
-- 20261113100000_candidata_pcp_aprovar_e_liberar_of_combinado.sql - NÃO
-- é uma migration, vive em supabase/tests/, NUNCA deve ser aplicado em
-- produção nem no banco vinculado. Assume que a candidata já foi
-- aplicada (via `supabase db reset` local) - NÃO embute o DDL dela.
--
-- Checklist pedido pelo usuário, coberto:
--   A. Caminho combinado real (aguardando_auditoria -> aprovada ->
--      liberada), com BOM real (sem atalho de fixture) - 2 linhas de
--      histórico, mesmo ator.
--   A2/A3. Nem pcp.liberar_of nem pcp.aprovar_of isoladas bastam no
--      caminho combinado - as duas são exigidas.
--   B. OF já aprovada+planejada: só libera, nunca reaprova.
--   C. OF já liberada: idempotente, nunca duplica histórico nem
--      reatribui autoria.
--   D. ROLLBACK: aprovação ocorre, liberação falha (Momento Y
--      pendente) na MESMA transação - estado final deve ser como se
--      nada tivesse acontecido (sem aprovação parcial, sem histórico
--      novo, sem necessidade/CI-CE gerada).
--   E. Estado incompatível (cancelada): rejeitado pela checagem já
--      existente em liberar_of.
--   F. GRANT: só `authenticated` pode chamar - `anon`/`service_role`
--      rejeitados por ACL (42501), nunca chegam a executar o corpo.
--
-- Fora de escopo deste arquivo (documentado no relatório, não
-- fingido aqui): concorrência real com 2 conexões simultâneas - este
-- script é sequencial numa única sessão psql.

begin;

do $$
declare
  v_empresa_a uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_operador_so_libera uuid := gen_random_uuid();
  v_operador_so_aprova uuid := gen_random_uuid();
  v_grupo_adm uuid;
  v_grupo_so_libera uuid := gen_random_uuid();
  v_grupo_so_aprova uuid := gen_random_uuid();
  v_permissao_aprovar_id uuid;
  v_permissao_liberar_id uuid;
  v_produto uuid := gen_random_uuid();
  v_materia_prima uuid := gen_random_uuid();
  v_bom uuid := gen_random_uuid();
  v_projeto uuid := gen_random_uuid();
  v_of_a uuid := gen_random_uuid();
  v_of_b uuid := gen_random_uuid();
  v_of_c uuid := gen_random_uuid();
  v_of_d uuid := gen_random_uuid();
  v_of_e uuid := gen_random_uuid();
  v_of_a2 uuid := gen_random_uuid();
  v_of_a3 uuid := gen_random_uuid();
begin
  insert into auth.users (id, is_sso_user, is_anonymous) values
    (v_admin, false, false),
    (v_operador_so_libera, false, false),
    (v_operador_so_aprova, false, false);

  insert into public.empresas (id, nome, slug, codigo, created_by) values
    (v_empresa_a, 'Empresa Teste A (aprovar+liberar combinado, local)', 'empresa-teste-combinado-a', 900301, v_admin);

  select id into v_grupo_adm from public.grupos_acesso where empresa_id = v_empresa_a and e_grupo_adm = true;
  if v_grupo_adm is null then
    raise exception 'PRÉ-CHECAGEM FALHOU: nenhum grupo ADM automático foi criado para a empresa sintética.';
  end if;

  insert into public.grupos_acesso (id, empresa_id, nome, e_grupo_adm, created_by) values
    (v_grupo_so_libera, v_empresa_a, 'Só libera (teste)', false, v_admin),
    (v_grupo_so_aprova, v_empresa_a, 'Só aprova (teste)', false, v_admin);

  select id into v_permissao_aprovar_id from public.permissoes where chave = 'pcp.aprovar_of';
  select id into v_permissao_liberar_id from public.permissoes where chave = 'pcp.liberar_of';
  if v_permissao_aprovar_id is null or v_permissao_liberar_id is null then
    raise exception 'PRÉ-CHECAGEM FALHOU: pcp.aprovar_of/pcp.liberar_of não existem no catálogo - migrations anteriores não aplicadas neste ambiente.';
  end if;

  insert into public.grupo_permissoes (grupo_id, empresa_id, permissao_id, created_by) values
    (v_grupo_so_libera, v_empresa_a, v_permissao_liberar_id, v_admin),
    (v_grupo_so_aprova, v_empresa_a, v_permissao_aprovar_id, v_admin);

  insert into public.profiles (id, empresa_id, nome, nivel_acesso, ativo, grupo_id) values
    (v_admin, v_empresa_a, 'Admin PCP (teste)', 'admin', true, v_grupo_adm),
    (v_operador_so_libera, v_empresa_a, 'Operador so libera (teste)', 'operador', true, v_grupo_so_libera),
    (v_operador_so_aprova, v_empresa_a, 'Operador so aprova (teste)', 'operador', true, v_grupo_so_aprova);

  insert into public.usuarios (id, empresa_id, nome, email, nivel_acesso) values
    (v_admin, v_empresa_a, 'Admin PCP (teste)', 'admin.teste@combinado.local', 'admin'),
    (v_operador_so_libera, v_empresa_a, 'Operador so libera (teste)', 'so.libera.teste@combinado.local', 'operador'),
    (v_operador_so_aprova, v_empresa_a, 'Operador so aprova (teste)', 'so.aprova.teste@combinado.local', 'operador');

  insert into public.itens_industriais (id, empresa_id, codigo, descricao, unidade, tipo_item, created_by) values
    (v_produto, v_empresa_a, '900301-PROD-1', 'Produto teste combinado', 'unidade', 'produto acabado', v_admin);

  -- BOM real (sem atalho de fixture) - necessário para o caminho A, que
  -- precisa de aprovar_of gerando necessidades REAIS (regime 'legado'),
  -- para que liberar_of, na mesma chamada, não seja bloqueada por
  -- Momento Y pendente.
  insert into public.materias_primas (id, empresa_id, descricao, unidade, created_by) values
    (v_materia_prima, v_empresa_a, 'Matéria-prima teste combinado', 'kg', v_admin);

  insert into public.boms (id, empresa_id, produto_id, created_by) values
    (v_bom, v_empresa_a, v_produto, v_admin);

  insert into public.bom_itens (bom_id, empresa_id, materia_prima_id, componente_tipo, quantidade, unidade, created_by) values
    (v_bom, v_empresa_a, v_materia_prima, 'materia_prima', 2, 'kg', v_admin);

  insert into public.projetos (id, empresa_id, numero_projeto, tipo_projeto, status, created_by, nome) values
    (v_projeto, v_empresa_a, '900301', 'fabricacao', 'em_analise', v_admin, 'Projeto teste combinado');

  -- OF_A: aguardando_auditoria+planejada, COM bom_id real e quantidade
  -- planejada > 0 - caminho A (feliz, combinado, sem atalho).
  insert into public.ordens_fabricacao (id, empresa_id, projeto_id, produto_id, bom_id, numero_of, unidade, quantidade_planejada, created_by, estado_aprovacao, estado_execucao) values
    (v_of_a, v_empresa_a, v_projeto, v_produto, v_bom, '900301-0001', 'unidade', 10, v_admin, 'aguardando_auditoria', 'planejada');

  -- OF_B: já aprovada+planejada - caminho B (só libera).
  insert into public.ordens_fabricacao (id, empresa_id, projeto_id, produto_id, numero_of, unidade, quantidade_planejada, created_by, estado_aprovacao, estado_execucao, necessidades_confirmadas_em) values
    (v_of_b, v_empresa_a, v_projeto, v_produto, '900301-0002', 'unidade', 10, v_admin, 'aprovada', 'planejada', now());

  -- OF_C: já aprovada+liberada - caminho C (idempotente).
  insert into public.ordens_fabricacao (id, empresa_id, projeto_id, produto_id, numero_of, unidade, quantidade_planejada, created_by, estado_aprovacao, estado_execucao, estado_execucao_por, estado_execucao_em, necessidades_confirmadas_em) values
    (v_of_c, v_empresa_a, v_projeto, v_produto, '900301-0003', 'unidade', 10, v_admin, 'aprovada', 'liberada', v_admin, now(), now());

  -- OF_D: aguardando_auditoria+planejada, SEM bom_id (regime ficará
  -- pendente_momento_y após a aprovação) - caminho D (rollback).
  insert into public.ordens_fabricacao (id, empresa_id, projeto_id, produto_id, numero_of, unidade, quantidade_planejada, created_by, estado_aprovacao, estado_execucao) values
    (v_of_d, v_empresa_a, v_projeto, v_produto, '900301-0004', 'unidade', 10, v_admin, 'aguardando_auditoria', 'planejada');

  -- OF_D precisa de um BOM válido para aprovar_of não falhar por outro
  -- motivo (bom_id nulo faria gerar_necessidades_de_of rejeitar antes
  -- de chegar no ponto que queremos testar) - usa o MESMO BOM real de
  -- OF_A. O regime pendente_momento_y em OF_D vem de ligar o
  -- interruptor Momento Y só para esta OF via override local, não de
  -- faltar BOM - ver abaixo.
  update public.ordens_fabricacao set bom_id = v_bom where id = v_of_d;

  -- OF_E: cancelada - caminho E (estado incompatível).
  insert into public.ordens_fabricacao (id, empresa_id, projeto_id, produto_id, numero_of, unidade, quantidade_planejada, created_by, estado_aprovacao, estado_execucao) values
    (v_of_e, v_empresa_a, v_projeto, v_produto, '900301-0005', 'unidade', 10, v_admin, 'aprovada', 'cancelada');

  -- OF_A2/OF_A3: mesmo par aguardando_auditoria+planejada de OF_A,
  -- usadas só para os testes de permissão isolada (nunca chegam a
  -- escrever de verdade, a rejeição ocorre antes).
  insert into public.ordens_fabricacao (id, empresa_id, projeto_id, produto_id, bom_id, numero_of, unidade, quantidade_planejada, created_by, estado_aprovacao, estado_execucao) values
    (v_of_a2, v_empresa_a, v_projeto, v_produto, v_bom, '900301-0006', 'unidade', 10, v_admin, 'aguardando_auditoria', 'planejada'),
    (v_of_a3, v_empresa_a, v_projeto, v_produto, v_bom, '900301-0007', 'unidade', 10, v_admin, 'aguardando_auditoria', 'planejada');

  perform set_config('teste.empresa_a', v_empresa_a::text, true);
  perform set_config('teste.admin', v_admin::text, true);
  perform set_config('teste.operador_so_libera', v_operador_so_libera::text, true);
  perform set_config('teste.operador_so_aprova', v_operador_so_aprova::text, true);
  perform set_config('teste.of_a', v_of_a::text, true);
  perform set_config('teste.of_b', v_of_b::text, true);
  perform set_config('teste.of_c', v_of_c::text, true);
  perform set_config('teste.of_d', v_of_d::text, true);
  perform set_config('teste.of_e', v_of_e::text, true);
  perform set_config('teste.of_a2', v_of_a2::text, true);
  perform set_config('teste.of_a3', v_of_a3::text, true);

  raise notice 'FIXTURES OK: empresa_a=%, admin=%, of_a=%, of_b=%, of_c=%, of_d=%, of_e=%.',
    v_empresa_a, v_admin, v_of_a, v_of_b, v_of_c, v_of_d, v_of_e;
end;
$$;

-- Helper de leitura só para este teste - ver justificativa idêntica nos
-- arquivos de teste anteriores (SECURITY DEFINER, dono = superuser,
-- usado só para verificar o que a própria RPC já gravou).
create function pg_temp.ler_of_teste(p_id uuid) returns public.ordens_fabricacao
  language sql security definer as $$ select * from public.ordens_fabricacao where id = p_id $$;

create function pg_temp.contar_historico_teste(p_of_id uuid) returns bigint
  language sql security definer as $$ select count(*) from public.ordens_fabricacao_historico_estados where of_id = p_of_id $$;

create function pg_temp.ler_historico_aprovacao_teste(p_of_id uuid) returns public.ordens_fabricacao_historico_estados
  language sql security definer as $$
    select * from public.ordens_fabricacao_historico_estados
    where of_id = p_of_id and estado_aprovacao_anterior = 'aguardando_auditoria' and estado_aprovacao_novo = 'aprovada'
  $$;

create function pg_temp.ler_historico_liberacao_teste(p_of_id uuid) returns public.ordens_fabricacao_historico_estados
  language sql security definer as $$
    select * from public.ordens_fabricacao_historico_estados
    where of_id = p_of_id and estado_execucao_anterior = 'planejada' and estado_execucao_novo = 'liberada'
  $$;

create function pg_temp.contar_necessidades_teste(p_of_id uuid) returns bigint
  language sql security definer as $$ select count(*) from public.necessidades_of_material where of_id = p_of_id $$;

-- ---------------------------------------------------------------------
-- TESTE F: GRANT - anon/service_role nunca chegam a executar o corpo.
-- ---------------------------------------------------------------------
set role anon;

do $$
declare
  v_sqlstate text;
begin
  begin
    perform public.aprovar_e_liberar_of(current_setting('teste.of_a')::uuid, null, null);
    raise exception 'TESTE Fa FALHOU: anon conseguiu chamar aprovar_e_liberar_of.';
  exception
    when others then
      v_sqlstate := sqlstate;
      if sqlerrm like 'TESTE Fa FALHOU%' then raise; end if;
  end;
  if v_sqlstate is distinct from '42501' then
    raise exception 'TESTE Fa FALHOU: rejeitado, mas com sqlstate errado (esperava 42501, achou %).', v_sqlstate;
  end if;
  raise notice 'TESTE Fa OK: anon negado por ACL (42501).';
end;
$$;

reset role;
set role service_role;

do $$
declare
  v_sqlstate text;
begin
  begin
    perform public.aprovar_e_liberar_of(current_setting('teste.of_a')::uuid, null, null);
    raise exception 'TESTE Fb FALHOU: service_role conseguiu chamar aprovar_e_liberar_of.';
  exception
    when others then
      v_sqlstate := sqlstate;
      if sqlerrm like 'TESTE Fb FALHOU%' then raise; end if;
  end;
  if v_sqlstate is distinct from '42501' then
    raise exception 'TESTE Fb FALHOU: rejeitado, mas com sqlstate errado (esperava 42501, achou %).', v_sqlstate;
  end if;
  raise notice 'TESTE Fb OK: service_role negado por ACL (42501) - a RPC combinada nunca é chamável por esse caminho.';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE A2/A3: nem pcp.liberar_of nem pcp.aprovar_of isoladas bastam no
-- caminho combinado (aguardando_auditoria+planejada).
-- ---------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('teste.operador_so_libera'), 'role', 'authenticated')::text, true);
end;
$$;

set role authenticated;

do $$
begin
  begin
    perform public.aprovar_e_liberar_of(current_setting('teste.of_a2')::uuid, null, null);
    raise exception 'TESTE A2 FALHOU: operador só com pcp.liberar_of conseguiu executar o caminho combinado.';
  exception
    when others then
      if sqlerrm like 'TESTE A2 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%permissao para aprovar%' then
        raise exception 'TESTE A2 FALHOU: rejeitado, mas pelo motivo ERRADO (achou: %).', sqlerrm;
      end if;
  end;
  raise notice 'TESTE A2 OK: só pcp.liberar_of não basta no caminho combinado - pcp.aprovar_of também é exigida.';
end;
$$;

reset role;

do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('teste.operador_so_aprova'), 'role', 'authenticated')::text, true);
end;
$$;

set role authenticated;

do $$
begin
  begin
    perform public.aprovar_e_liberar_of(current_setting('teste.of_a3')::uuid, null, null);
    raise exception 'TESTE A3 FALHOU: operador só com pcp.aprovar_of conseguiu executar o caminho combinado.';
  exception
    when others then
      if sqlerrm like 'TESTE A3 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%permissao para liberar%' then
        raise exception 'TESTE A3 FALHOU: rejeitado, mas pelo motivo ERRADO (achou: %).', sqlerrm;
      end if;
  end;
  raise notice 'TESTE A3 OK: só pcp.aprovar_of não basta no caminho combinado - pcp.liberar_of também é exigida.';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE A: caminho feliz combinado, COM BOM real (sem atalho de
-- fixture) - admin (grupo ADM, tem as duas permissões por autoridade
-- total). Aprova e libera na mesma chamada; 2 linhas de histórico,
-- mesmo ator.
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
  v_hist_aprov record;
  v_hist_lib record;
begin
  v_resultado := public.aprovar_e_liberar_of(current_setting('teste.of_a')::uuid, 'Teste combinado - aprovação', 'Teste combinado - liberação');

  if v_resultado->>'resultado' <> 'liberada' then
    raise exception 'TESTE A FALHOU: resultado final deveria ser liberada (veio %).', v_resultado;
  end if;
  if (v_resultado->>'aprovacao_realizada')::boolean is not true then
    raise exception 'TESTE A FALHOU: aprovacao_realizada deveria ser true (veio %).', v_resultado->>'aprovacao_realizada';
  end if;

  select * into v_of from pg_temp.ler_of_teste(current_setting('teste.of_a')::uuid);
  if v_of.estado_aprovacao <> 'aprovada' or v_of.estado_execucao <> 'liberada' then
    raise exception 'TESTE A FALHOU: OF deveria estar aprovada+liberada (veio %/%).', v_of.estado_aprovacao, v_of.estado_execucao;
  end if;
  if v_of.estado_aprovacao_por <> current_setting('teste.admin')::uuid or v_of.estado_execucao_por <> current_setting('teste.admin')::uuid then
    raise exception 'TESTE A FALHOU: autoria deveria ser o admin nas duas transições (aprovacao_por=%, execucao_por=%).', v_of.estado_aprovacao_por, v_of.estado_execucao_por;
  end if;

  select * into v_hist_aprov from pg_temp.ler_historico_aprovacao_teste(current_setting('teste.of_a')::uuid);
  select * into v_hist_lib from pg_temp.ler_historico_liberacao_teste(current_setting('teste.of_a')::uuid);
  if v_hist_aprov.alterado_por is distinct from current_setting('teste.admin')::uuid then
    raise exception 'TESTE A FALHOU: linha de histórico da aprovação ausente ou com autor errado.';
  end if;
  if v_hist_lib.alterado_por is distinct from current_setting('teste.admin')::uuid then
    raise exception 'TESTE A FALHOU: linha de histórico da liberação ausente ou com autor errado.';
  end if;
  if (select pg_temp.contar_necessidades_teste(current_setting('teste.of_a')::uuid)) <> 1 then
    raise exception 'TESTE A FALHOU: deveria haver exatamente 1 necessidade real gerada pelo BOM (sem atalho de fixture).';
  end if;

  raise notice 'TESTE A OK: caminho combinado real (com BOM) aprovou e liberou na mesma chamada - 2 linhas de histórico, mesmo ator (%), 1 necessidade real gerada.', v_hist_aprov.alterado_por;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE B: OF já aprovada+planejada - só libera, nunca reaprova (nunca
-- exige pcp.aprovar_of aqui).
-- ---------------------------------------------------------------------
do $$
declare
  v_resultado jsonb;
begin
  v_resultado := public.aprovar_e_liberar_of(current_setting('teste.of_b')::uuid, null, 'Teste combinado - só liberação');

  if v_resultado->>'resultado' <> 'liberada' then
    raise exception 'TESTE B FALHOU: resultado deveria ser liberada (veio %).', v_resultado;
  end if;
  if (v_resultado->>'aprovacao_realizada')::boolean is not false then
    raise exception 'TESTE B FALHOU: aprovacao_realizada deveria ser false (OF já estava aprovada) - veio %.', v_resultado->>'aprovacao_realizada';
  end if;

  raise notice 'TESTE B OK: OF já aprovada+planejada - só a liberação ocorreu, aprovação nunca reexecutada.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE C: OF já liberada - idempotente, nunca duplica histórico nem
-- reatribui autoria (chamando com um ator diferente do admin que já
-- liberou na fixture).
-- ---------------------------------------------------------------------
reset role;

do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('teste.operador_so_libera'), 'role', 'authenticated')::text, true);
end;
$$;

set role authenticated;

do $$
declare
  v_resultado jsonb;
  v_of record;
  v_qtd_historico bigint;
begin
  v_qtd_historico := pg_temp.contar_historico_teste(current_setting('teste.of_c')::uuid);

  v_resultado := public.aprovar_e_liberar_of(current_setting('teste.of_c')::uuid, null, null);

  if v_resultado->>'resultado' <> 'ja_liberada' then
    raise exception 'TESTE C FALHOU: resultado deveria ser ja_liberada (veio %).', v_resultado;
  end if;

  select * into v_of from pg_temp.ler_of_teste(current_setting('teste.of_c')::uuid);
  if v_of.estado_execucao_por <> current_setting('teste.admin')::uuid then
    raise exception 'TESTE C FALHOU: a chamada idempotente reatribuiu estado_execucao_por (era admin, ficou %).', v_of.estado_execucao_por;
  end if;

  if pg_temp.contar_historico_teste(current_setting('teste.of_c')::uuid) <> v_qtd_historico then
    raise exception 'TESTE C FALHOU: a chamada idempotente deveria ter criado ZERO linhas de histórico novas.';
  end if;

  raise notice 'TESTE C OK: OF já liberada - idempotente, autoria original preservada, nenhum histórico novo.';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE D (ROLLBACK - núcleo do pedido de atomicidade): liga o
-- interruptor Momento Y SÓ para esta transação de teste, SÓ para a
-- empresa sintética (nunca a real, nunca persistido) - faz aprovar_of
-- tomar o caminho de retorno antecipado (sem gerar necessidades),
-- deixando a OF em regime pendente_momento_y. A liberação, na MESMA
-- chamada, falha em seguida por Momento Y pendente - prova que a
-- aprovação é revertida integralmente junto com a falha da liberação.
-- ---------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('teste.admin'), 'role', 'authenticated')::text, true);
end;
$$;

set role authenticated;

do $$
declare
  v_of_antes record;
  v_of_depois record;
begin
  select * into v_of_antes from pg_temp.ler_of_teste(current_setting('teste.of_d')::uuid);

  -- Interruptor ligado só nesta transação de teste (nunca a real) -
  -- força aprovar_of a NÃO gerar necessidades (caminho momento_y_ativo
  -- = true), deixando o regime pendente_momento_y mesmo com BOM real.
  insert into public.configuracoes_empresa (empresa_id, chave, valor, ativo, created_by)
  values (current_setting('teste.empresa_a')::uuid, 'pcp.ci_ce_momento_y.ativo', 'true'::jsonb, true, current_setting('teste.admin')::uuid);

  begin
    perform public.aprovar_e_liberar_of(current_setting('teste.of_d')::uuid, 'Teste rollback - aprovação', 'Teste rollback - liberação');
    raise exception 'TESTE D FALHOU: a chamada combinada deveria ter falhado na etapa de liberação (Momento Y pendente).';
  exception
    when others then
      if sqlerrm like 'TESTE D FALHOU%' then raise; end if;
      if sqlerrm not ilike '%Momento Y pendente%' then
        raise exception 'TESTE D FALHOU: falhou, mas pelo motivo ERRADO (esperava Momento Y pendente, achou: %).', sqlerrm;
      end if;
  end;

  select * into v_of_depois from pg_temp.ler_of_teste(current_setting('teste.of_d')::uuid);

  if v_of_depois.estado_aprovacao <> v_of_antes.estado_aprovacao or v_of_depois.estado_execucao <> v_of_antes.estado_execucao then
    raise exception 'TESTE D FALHOU: a OF deveria continuar EXATAMENTE como antes (era %/%, ficou %/%) - a aprovação NÃO foi revertida junto com a falha da liberação.',
      v_of_antes.estado_aprovacao, v_of_antes.estado_execucao, v_of_depois.estado_aprovacao, v_of_depois.estado_execucao;
  end if;
  if v_of_depois.estado_aprovacao_por is not null or v_of_depois.estado_aprovacao_em is not null then
    raise exception 'TESTE D FALHOU: estado_aprovacao_por/em deveriam continuar NULL - a aprovação parcial não foi revertida.';
  end if;

  if pg_temp.contar_historico_teste(current_setting('teste.of_d')::uuid) <> 1 then
    raise exception 'TESTE D FALHOU: deveria haver só a linha de histórico da CRIAÇÃO da OF (1) - nenhuma linha de aprovação deveria ter sobrevivido ao rollback.';
  end if;
  if pg_temp.contar_necessidades_teste(current_setting('teste.of_d')::uuid) <> 0 then
    raise exception 'TESTE D FALHOU: nenhuma necessidade de material deveria existir - o rollback deveria ter desfeito qualquer geração parcial.';
  end if;

  raise notice 'TESTE D OK: falha na liberação reverteu INTEGRALMENTE a aprovação feita na mesma transação - estado, autoria, histórico e necessidades, todos como se nada tivesse ocorrido.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE E: estado incompatível (cancelada) - rejeitado pela checagem
-- já existente em liberar_of, sem nenhum contorno.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform public.aprovar_e_liberar_of(current_setting('teste.of_e')::uuid, null, null);
    raise exception 'TESTE E FALHOU: OF cancelada foi liberada pela ação combinada.';
  exception
    when others then
      if sqlerrm like 'TESTE E FALHOU%' then raise; end if;
      if sqlerrm not ilike '%nao pode ser liberada%' then
        raise exception 'TESTE E FALHOU: rejeitado, mas pelo motivo ERRADO (achou: %).', sqlerrm;
      end if;
  end;
  raise notice 'TESTE E OK: OF em estado incompatível (cancelada) rejeitada pela checagem já existente em liberar_of.';
end;
$$;

reset role;

-- ROLLBACK obrigatório - nenhuma linha/fixture sintética fica gravada.
rollback;
