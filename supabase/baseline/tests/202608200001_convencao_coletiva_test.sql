-- Teste da evolução canônica supabase/baseline/evolutivas/202608200001_
-- convencao_coletiva.sql - roda DEPOIS do baseline completo (001..015).
--
-- O QUE ESTE TESTE VALIDA (e o que NÃO valida): a portabilidade
-- FUNCIONAL da feature "convenção coletiva de horas adicionais" para a
-- arquitetura canônica do baseline (public.usuarios/permissoes +
-- public.usuario_tem_permissao()) - schema, trigger, RLS, RPCs e
-- controle de permissão por CAPACIDADE (não por rótulo de papel). Este
-- arquivo NÃO valida byte a byte a migration histórica
-- supabase/migrations/202608130001_empresa_convencao_horas_adicionais.sql
-- (essa continua coberta por supabase/tests/fase8b_convencao_horas_adicionais_teste.sql,
-- rodando contra a arquitetura de produção com public.profiles/
-- usuario_e_admin()) - são duas trilhas paralelas, nunca a mesma
-- validação.
--
-- Fixtures próprias e descartáveis (nunca dado ambiente): 2 empresas,
-- 4 identidades auth.users/usuarios, todas com prefixo determinístico
-- ...9001-9004 e e-mail @nexotfe.test (mesmo idioma de
-- 002_security_test.sql) - nenhum teste fica PULADO por falta de
-- fixture, porque todo fixture necessário é criado aqui mesmo.
--
-- Estrutura: BEGIN; fixtures; cenários; ROLLBACK obrigatório no final -
-- nenhuma linha fica de fato gravada, e o schema (nunca tocado por este
-- arquivo, só pela evolução em si) permanece intacto.

begin;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000009001', 'admin-convencao@nexotfe.test'),
  ('10000000-0000-0000-0000-000000009002', 'sem-permissao@nexotfe.test'),
  ('10000000-0000-0000-0000-000000009003', 'papel-admin-sem-capacidade@nexotfe.test'),
  ('10000000-0000-0000-0000-000000009004', 'admin-empresa-b@nexotfe.test'),
  ('10000000-0000-0000-0000-000000009005', 'admin-fluxo-rpc@nexotfe.test');

insert into public.empresas (id, nome, slug) values
  ('20000000-0000-0000-0000-000000009001', 'Empresa Convenção A', 'empresa-convencao-a'),
  ('20000000-0000-0000-0000-000000009002', 'Empresa Convenção B', 'empresa-convencao-b'),
  -- Empresa DEDICADA ao fluxo via RPC (TESTES 4-9C) - nunca a mesma da
  -- Empresa A (TESTE 1/2, que já grava uma linha direta em
  -- [current_date, current_date+10]): usar a mesma empresa colidiria de
  -- verdade com a checagem de sobreposição da RPC (achado real, corrigido
  -- nesta revisão - a 1ª execução do teste local pegou exatamente essa
  -- colisão).
  ('20000000-0000-0000-0000-000000009003', 'Empresa Convenção C (fluxo RPC)', 'empresa-convencao-c');

insert into public.usuarios (
  id, auth_user_id, empresa_id, nome, email, papel, permissoes
) values
  (
    '30000000-0000-0000-0000-000000009001',
    '10000000-0000-0000-0000-000000009001',
    '20000000-0000-0000-0000-000000009001',
    'Admin Convenção A', 'admin-convencao@nexotfe.test', 'gestor',
    array['admin.convencao_coletiva.gerenciar']
  ),
  (
    -- Usuário ATIVO, sem a permissão administrativa - item explicitamente
    -- pedido na cobertura mínima ("um usuário ativo sem a permissão
    -- administrativa").
    '30000000-0000-0000-0000-000000009002',
    '10000000-0000-0000-0000-000000009002',
    '20000000-0000-0000-0000-000000009001',
    'Sem Permissão A', 'sem-permissao@nexotfe.test', 'operador',
    array[]::text[]
  ),
  (
    -- papel='admin' (texto) mas SEM admin.convencao_coletiva.gerenciar
    -- na lista explícita - prova que a checagem é por CAPACIDADE
    -- (usuario_tem_permissao), nunca por rótulo de papel.
    '30000000-0000-0000-0000-000000009003',
    '10000000-0000-0000-0000-000000009003',
    '20000000-0000-0000-0000-000000009001',
    'Papel Admin Sem Capacidade', 'papel-admin-sem-capacidade@nexotfe.test', 'admin',
    array[]::text[]
  ),
  (
    '30000000-0000-0000-0000-000000009004',
    '10000000-0000-0000-0000-000000009004',
    '20000000-0000-0000-0000-000000009002',
    'Admin Convenção B', 'admin-empresa-b@nexotfe.test', 'gestor',
    array['admin.convencao_coletiva.gerenciar']
  ),
  (
    '30000000-0000-0000-0000-000000009005',
    '10000000-0000-0000-0000-000000009005',
    '20000000-0000-0000-0000-000000009003',
    'Admin Fluxo RPC', 'admin-fluxo-rpc@nexotfe.test', 'gestor',
    array['admin.convencao_coletiva.gerenciar']
  );

-- ---------------------------------------------------------------------
-- TESTE 1: CHECK de percentual não-negativo, CHECK de vigência
-- (vigente_ate >= vigente_desde), índice único parcial (só 1 linha
-- aberta por empresa). Roda como superusuário (RLS não se aplica aqui -
-- isto testa CHECK/índice, não RLS; RLS é o TESTE 12).
-- ---------------------------------------------------------------------
do $$
begin
  begin
    insert into public.empresa_convencao_horas_adicionais
      (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, created_by)
    values ('20000000-0000-0000-0000-000000009001', -0.10, 0, 0, 0, current_date, '10000000-0000-0000-0000-000000009001');
    raise exception 'TESTE 1a FALHOU: percentual negativo deveria ter sido rejeitado pelo CHECK.';
  exception
    when others then
      if sqlerrm like 'TESTE 1a FALHOU%' then raise; end if;
      raise notice 'TESTE 1a OK: percentual negativo rejeitado (%).', sqlerrm;
  end;

  begin
    insert into public.empresa_convencao_horas_adicionais
      (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, vigente_ate, created_by)
    values ('20000000-0000-0000-0000-000000009001', 0.30, 0.50, 1.00, 1.00, current_date, current_date - 1, '10000000-0000-0000-0000-000000009001');
    raise exception 'TESTE 1b FALHOU: vigente_ate anterior a vigente_desde deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 1b FALHOU%' then raise; end if;
      raise notice 'TESTE 1b OK: vigencia_chk rejeitou vigente_ate < vigente_desde (%).', sqlerrm;
  end;

  insert into public.empresa_convencao_horas_adicionais
    (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, created_by)
  values ('20000000-0000-0000-0000-000000009001', 0.30, 0.50, 1.00, 1.00, current_date, '10000000-0000-0000-0000-000000009001');

  begin
    insert into public.empresa_convencao_horas_adicionais
      (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, created_by)
    values ('20000000-0000-0000-0000-000000009001', 0.40, 0.60, 1.00, 1.00, current_date + 30, '10000000-0000-0000-0000-000000009001');
    raise exception 'TESTE 1c FALHOU: 2ª linha aberta (vigente_ate is null) para a mesma empresa deveria ter sido rejeitada pelo índice único parcial.';
  exception
    when others then
      if sqlerrm like 'TESTE 1c FALHOU%' then raise; end if;
      raise notice 'TESTE 1c OK: índice único parcial rejeitou 2ª linha aberta (%).', sqlerrm;
  end;
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 2: imutabilidade de conteúdo histórico - alterar conteúdo de
-- linha aberta falha; fechar (setar vigente_ate) funciona; alterar
-- linha já fechada falha. Roda como superusuário - prova que o TRIGGER
-- (vale para qualquer role) protege o conteúdo; RLS é o TESTE 12.
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.empresa_convencao_horas_adicionais
  where empresa_id = '20000000-0000-0000-0000-000000009001' and percentual_segunda_sexta = 0.30 and vigente_ate is null;

  if v_id is null then
    raise exception 'TESTE 2 FALHOU: fixture do TESTE 1 não encontrada - falha de setup do próprio teste, nunca PULADO.';
  end if;

  begin
    update public.empresa_convencao_horas_adicionais set percentual_sabado = 0.99 where id = v_id;
    raise exception 'TESTE 2a FALHOU: alterar percentual de uma linha aberta deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 2a FALHOU%' then raise; end if;
      raise notice 'TESTE 2a OK: alteração de conteúdo rejeitada (%).', sqlerrm;
  end;

  update public.empresa_convencao_horas_adicionais set vigente_ate = current_date + 10 where id = v_id;
  raise notice 'TESTE 2b OK: fechar a vigência (setar vigente_ate) foi aceito.';

  begin
    update public.empresa_convencao_horas_adicionais set vigente_ate = current_date + 20 where id = v_id;
    raise exception 'TESTE 2c FALHOU: reabrir/re-tocar uma linha já encerrada deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 2c FALHOU%' then raise; end if;
      raise notice 'TESTE 2c OK: linha já encerrada não pôde ser tocada de novo (%).', sqlerrm;
  end;
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 3: checagem de sobreposição - operador isolado (daterange/&&).
-- ---------------------------------------------------------------------
do $$
declare
  v_sobrepoe boolean;
begin
  select daterange('2026-01-01'::date, '2026-07-01'::date) && daterange('2026-06-01'::date, 'infinity'::date) into v_sobrepoe;
  if v_sobrepoe is not true then
    raise exception 'TESTE 3a FALHOU: intervalos deveriam sobrepor.';
  end if;
  raise notice 'TESTE 3a OK: sobreposição detectada corretamente.';

  select daterange('2026-01-01'::date, '2026-06-01'::date) && daterange('2026-06-01'::date, 'infinity'::date) into v_sobrepoe;
  if v_sobrepoe is not false then
    raise exception 'TESTE 3b FALHOU: intervalos adjacentes não deveriam sobrepor.';
  end if;
  raise notice 'TESTE 3b OK: intervalos adjacentes corretamente NÃO sobrepõem.';
end;
$$;


-- ---------------------------------------------------------------------
-- TESTES 4-9: fluxo via RPC como o admin AUTORIZADO da Empresa C (item
-- "permitir a RPC ao usuário autorizado" - checagem por CAPACIDADE, não
-- por rótulo de papel: este usuário tem papel='gestor', autorizado só
-- porque 'admin.convencao_coletiva.gerenciar' está no array
-- permissoes). Empresa DEDICADA (9003, nunca a Empresa A do TESTE 1/2) -
-- a Empresa A já tem uma linha FECHADA em [current_date, current_date+10]
-- por acesso direto; reaproveitá-la aqui colidiria de verdade com a
-- checagem de sobreposição da RPC (current_date, usado por este bloco,
-- cairia dentro daquele intervalo) - achado real, corrigido nesta
-- revisão.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000009005', true);

do $$
declare
  v_id_primeira uuid;
  v_id_futura uuid;
  v_id_terceira uuid;
  v_qtd int;
  v_qtd2 int;
  v_row record;
  v_vigente_ate_primeira date;
  v_vigente_ate_segunda date;
begin
  -- TESTE 4 (vigência retroativa rejeitada VIA RPC).
  begin
    perform public.registrar_convencao_horas_adicionais(0.30, 0.50, 1.00, 1.00, current_date - 1);
    raise exception 'TESTE 4 FALHOU: vigência retroativa deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 4 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%passado%' then
        raise exception 'TESTE 4 FALHOU: rejeitado, mas pelo motivo ERRADO (esperava menção a "passado", recebeu: %).', sqlerrm;
      end if;
      raise notice 'TESTE 4 OK: vigência retroativa rejeitada com a mensagem certa (%).', sqlerrm;
  end;

  -- TESTE 5 (cadastro inicial via RPC, sucesso - também é o teste
  -- "permitir a RPC ao usuário autorizado").
  v_id_primeira := public.registrar_convencao_horas_adicionais(0.30, 0.50, 1.00, 1.00, current_date);
  if v_id_primeira is null then
    raise exception 'TESTE 5 FALHOU: registrar_convencao_horas_adicionais deveria devolver um id.';
  end if;
  raise notice 'TESTE 5 OK: cadastro inicial via RPC bem-sucedido pelo usuário autorizado (id=%).', v_id_primeira;

  -- TESTE 6 (convenção futura agendada, fecha corretamente a anterior).
  v_id_futura := public.registrar_convencao_horas_adicionais(0.35, 0.55, 1.00, 1.00, current_date + 60);

  select count(*) into v_qtd from public.convencoes_horas_adicionais_no_periodo(current_date, current_date);
  if v_qtd <> 1 then
    raise exception 'TESTE 6a FALHOU: deveria haver exatamente 1 convenção vigente hoje (achou %).', v_qtd;
  end if;

  select vigente_ate into v_vigente_ate_primeira from public.empresa_convencao_horas_adicionais where id = v_id_primeira;
  if v_vigente_ate_primeira is distinct from (current_date + 60 - 1) then
    raise exception 'TESTE 6b FALHOU: a 1ª convenção deveria estar fechada em % (véspera da 2ª), achou %.', (current_date + 60 - 1), v_vigente_ate_primeira;
  end if;
  raise notice 'TESTE 6 OK: convenção futura agendada, e a anterior foi fechada corretamente em %.', v_vigente_ate_primeira;

  -- TESTE 7 (resolução pela data consultada - 3 pontos, NUNCA pelo
  -- atalho "vigente_ate is null").
  select percentual_segunda_sexta into v_row from public.convencoes_horas_adicionais_no_periodo(current_date + 30, current_date + 30);
  if v_row.percentual_segunda_sexta is distinct from 0.30 then
    raise exception 'TESTE 7a FALHOU: data dentro da 1ª vigência deveria resolver para 0.30 (achou %).', v_row.percentual_segunda_sexta;
  end if;

  select percentual_segunda_sexta into v_row from public.convencoes_horas_adicionais_no_periodo(current_date + 90, current_date + 90);
  if v_row.percentual_segunda_sexta is distinct from 0.35 then
    raise exception 'TESTE 7b FALHOU: data dentro da 2ª vigência deveria resolver para 0.35 (achou %).', v_row.percentual_segunda_sexta;
  end if;

  select percentual_segunda_sexta into v_row from public.convencoes_horas_adicionais_no_periodo(current_date + 59, current_date + 59);
  if v_row.percentual_segunda_sexta is distinct from 0.30 then
    raise exception 'TESTE 7c FALHOU: véspera da transição deveria resolver para 0.30 (achou %).', v_row.percentual_segunda_sexta;
  end if;
  raise notice 'TESTE 7 OK: resolução pela data consultada correta nos 3 pontos (1ª vigência, 2ª vigência, véspera da transição).';

  -- TESTE 8 (janela atravessando duas vigências).
  select count(*) into v_qtd from public.convencoes_horas_adicionais_no_periodo(current_date, current_date + 90);
  if v_qtd <> 2 then
    raise exception 'TESTE 8 FALHOU: janela cruzando as 2 vigências deveria devolver 2 linhas (achou %).', v_qtd;
  end if;
  raise notice 'TESTE 8 OK: janela atravessando 2 vigências devolve as 2 convenções.';

  -- TESTE 9 (lacuna de vigência detectada).
  select count(*) into v_qtd from public.convencoes_horas_adicionais_no_periodo(current_date - 100, current_date - 50);
  if v_qtd <> 0 then
    raise exception 'TESTE 9 FALHOU: período antes de qualquer convenção deveria devolver 0 linhas (achou %).', v_qtd;
  end if;
  raise notice 'TESTE 9 OK: lacuna de vigência devolve 0 linhas, nunca um valor presumido.';

  -- TESTE 9B (atomicidade: 3ª convenção enquanto a 2ª está aberta -
  -- fluxo normal de sucessão continua funcionando).
  v_id_terceira := public.registrar_convencao_horas_adicionais(0.40, 0.60, 1.00, 1.00, current_date + 150);
  if v_id_terceira is null then
    raise exception 'TESTE 9B FALHOU: registrar 3ª convenção enquanto a 2ª está aberta deveria ter sucesso.';
  end if;

  select vigente_ate into v_vigente_ate_segunda from public.empresa_convencao_horas_adicionais where id = v_id_futura;
  if v_vigente_ate_segunda is distinct from (current_date + 150 - 1) then
    raise exception 'TESTE 9B FALHOU: a 2ª convenção deveria estar fechada em % (véspera da 3ª), achou %.', (current_date + 150 - 1), v_vigente_ate_segunda;
  end if;
  raise notice 'TESTE 9B OK: 3ª convenção registrada, 2ª fechada corretamente.';

  -- TESTE 9C (atomicidade após erro - rejeição PRECOCE, antes de
  -- qualquer fechamento ser tentado - nenhuma linha anterior muda).
  select count(*) into v_qtd from public.empresa_convencao_horas_adicionais where empresa_id = '20000000-0000-0000-0000-000000009003';
  begin
    perform public.registrar_convencao_horas_adicionais(0.99, 0.99, 0.99, 0.99, current_date + 100);
    raise exception 'TESTE 9C FALHOU: vigência fora de ordem (anterior à já aberta) deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 9C FALHOU%' then raise; end if;
      raise notice 'TESTE 9C OK: tentativa fora de ordem rejeitada (%).', sqlerrm;
  end;
  select count(*) into v_qtd2 from public.empresa_convencao_horas_adicionais where empresa_id = '20000000-0000-0000-0000-000000009003';
  if v_qtd2 <> v_qtd then
    raise exception 'TESTE 9C FALHOU: contagem de linhas mudou depois do erro (antes=%, depois=%) - resíduo de tentativa rejeitada.', v_qtd, v_qtd2;
  end if;
  raise notice 'TESTE 9C OK: atomicidade comprovada - nenhuma linha alterada pela tentativa rejeitada.';
end;
$$;

reset role;


-- ---------------------------------------------------------------------
-- TESTE 10 (sobreposição rejeitada VIA RPC, cenário fora de ordem - a
-- monotonicidade sozinha não pegaria isto; só a checagem explícita
-- daterange/&& pega). Cria uma linha histórica fora de ordem por acesso
-- direto (superusuário, fora da RPC - simula correção manual de dado),
-- depois confirma via RPC como o admin autorizado. Também comprova
-- atomicidade na rejeição TARDIA (a function chega a fechar a linha
-- aberta antes de ser rejeitada - a exceção desfaz o fechamento
-- junto).
-- ---------------------------------------------------------------------
-- Setup fora de ordem, por acesso direto (superusuário, fora da RPC -
-- simula correção manual de dado). Guarda o id da linha aberta numa GUC
-- (nunca uma variável PL/pgSQL - o bloco seguinte, depois da troca de
-- role, precisa ler o mesmo id sem compartilhar escopo de variável).
do $$
declare
  v_id_aberta uuid;
begin
  insert into public.empresa_convencao_horas_adicionais
    (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, created_by)
  values ('20000000-0000-0000-0000-000000009002', 0.20, 0.40, 0.80, 0.80, current_date, '10000000-0000-0000-0000-000000009004')
  returning id into v_id_aberta;

  insert into public.empresa_convencao_horas_adicionais
    (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, vigente_ate, created_by)
  values ('20000000-0000-0000-0000-000000009002', 0.99, 0.99, 0.99, 0.99, current_date + 50, current_date + 60, '10000000-0000-0000-0000-000000009004');

  perform set_config('app.teste10_id_aberta', v_id_aberta::text, true);
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000009004', true);
end;
$$;

-- SET ROLE precisa ser instrução de topo (nunca dentro de "do $$ $$" -
-- não é um statement PL/pgSQL válido ali, achado real em revisão
-- anterior desta mesma sessão).
set local role authenticated;

do $$
begin
  begin
    perform public.registrar_convencao_horas_adicionais(0.10, 0.10, 0.10, 0.10, current_date + 55);
    raise exception 'TESTE 10 FALHOU: deveria ter sido rejeitado por sobreposição com a linha histórica fora de ordem.';
  exception
    when others then
      if sqlerrm like 'TESTE 10 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%sobreposi%' then
        raise exception 'TESTE 10 FALHOU: rejeitado, mas pelo motivo ERRADO (esperava "sobreposição", recebeu: %).', sqlerrm;
      end if;
      raise notice 'TESTE 10 OK: sobreposição com linha histórica fora de ordem rejeitada pela checagem explícita (%).', sqlerrm;
  end;
end;
$$;

reset role;

do $$
declare
  v_id_aberta uuid := current_setting('app.teste10_id_aberta', true)::uuid;
begin
  if (select vigente_ate from public.empresa_convencao_horas_adicionais where id = v_id_aberta) is not null then
    raise exception 'TESTE 10B FALHOU: a linha aberta foi fechada mesmo com a RPC rejeitada - a exceção deveria ter desfeito o fechamento junto.';
  end if;
  raise notice 'TESTE 10B OK: rejeição tardia desfez o fechamento parcial junto, mesma transação.';
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 11 (RPC - permissão por CAPACIDADE, não por rótulo de papel -
-- pedido explícito do usuário):
-- 11a) usuário SEM a permissão administrativa (papel='operador',
--      permissoes=[]) é rejeitado com SQLSTATE 42501 (insufficient_privilege).
-- 11b) usuário cujo papel É 'admin' (texto) mas SEM a permissão
--      explícita também é rejeitado com SQLSTATE 42501 - prova que
--      usuario_tem_permissao() nunca lê o rótulo papel, só o array
--      permissoes.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000009002', true);

do $$
begin
  begin
    perform public.registrar_convencao_horas_adicionais(0.15, 0.15, 0.15, 0.15, current_date + 500);
    raise exception 'TESTE 11a FALHOU: usuário sem a permissão administrativa conseguiu registrar uma convenção.';
  exception
    when insufficient_privilege then
      raise notice 'TESTE 11a OK: usuário sem admin.convencao_coletiva.gerenciar rejeitado com SQLSTATE 42501 (%).', sqlerrm;
    when others then
      if sqlerrm like 'TESTE 11a FALHOU%' then raise; end if;
      raise exception 'TESTE 11a FALHOU: rejeitado, mas com SQLSTATE % (esperado 42501/insufficient_privilege) - %', sqlstate, sqlerrm;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000009003', true);

do $$
begin
  begin
    perform public.registrar_convencao_horas_adicionais(0.16, 0.16, 0.16, 0.16, current_date + 510);
    raise exception 'TESTE 11b FALHOU: usuário com papel=''admin'' mas SEM a permissão explícita conseguiu registrar uma convenção - checagem está lendo o rótulo de papel, não a capacidade.';
  exception
    when insufficient_privilege then
      raise notice 'TESTE 11b OK: papel=''admin'' sem admin.convencao_coletiva.gerenciar explícito rejeitado com SQLSTATE 42501 (%) - checagem é por capacidade, nunca por rótulo.', sqlerrm;
    when others then
      if sqlerrm like 'TESTE 11b FALHOU%' then raise; end if;
      raise exception 'TESTE 11b FALHOU: rejeitado, mas com SQLSTATE % (esperado 42501/insufficient_privilege) - %', sqlstate, sqlerrm;
  end;
end;
$$;

reset role;


-- ---------------------------------------------------------------------
-- TESTE 12 (INSERT/UPDATE/DELETE diretos bloqueados por RLS para
-- authenticated - diferente dos TESTES 1/2, que rodam como superusuário
-- e por isso não testam RLS, só CHECK/trigger). SET ROLE de verdade -
-- superusuário ignora RLS mesmo com as claims certas.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000009001', true);

do $$
declare
  v_id_alvo uuid;
begin
  select id into v_id_alvo from public.empresa_convencao_horas_adicionais where empresa_id = '20000000-0000-0000-0000-000000009001' limit 1;

  begin
    insert into public.empresa_convencao_horas_adicionais
      (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, created_by)
    values ('20000000-0000-0000-0000-000000009001', 0.10, 0.10, 0.10, 0.10, current_date + 900, auth.uid());
    raise exception 'TESTE 12a FALHOU: INSERT direto (fora da RPC) deveria ter sido rejeitado por RLS para authenticated.';
  exception
    when others then
      if sqlerrm like 'TESTE 12a FALHOU%' then raise; end if;
      raise notice 'TESTE 12a OK: INSERT direto bloqueado por RLS/grant para authenticated (%).', sqlerrm;
  end;

  begin
    update public.empresa_convencao_horas_adicionais set percentual_sabado = 0.01 where id = v_id_alvo;
    raise exception 'TESTE 12b FALHOU: UPDATE direto (fora da RPC) deveria ter sido rejeitado por RLS para authenticated.';
  exception
    when others then
      if sqlerrm like 'TESTE 12b FALHOU%' then raise; end if;
      raise notice 'TESTE 12b OK: UPDATE direto bloqueado por RLS/grant para authenticated (%).', sqlerrm;
  end;

  begin
    delete from public.empresa_convencao_horas_adicionais where id = v_id_alvo;
    raise exception 'TESTE 12c FALHOU: DELETE direto (fora da RPC) deveria ter sido rejeitado por RLS para authenticated.';
  exception
    when others then
      if sqlerrm like 'TESTE 12c FALHOU%' then raise; end if;
      raise notice 'TESTE 12c OK: DELETE direto bloqueado por RLS/grant para authenticated (%).', sqlerrm;
  end;
end;
$$;

reset role;


-- ---------------------------------------------------------------------
-- TESTE 13 (isolamento entre empresas): sessão do admin da Empresa B
-- não pode ver nenhuma linha da Empresa A.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000009004', true);

do $$
declare
  v_qtd_empresa_errada int;
begin
  select count(*) into v_qtd_empresa_errada
  from public.empresa_convencao_horas_adicionais
  where empresa_id = '20000000-0000-0000-0000-000000009001';

  if v_qtd_empresa_errada <> 0 then
    raise exception 'TESTE 13 FALHOU: sessão da Empresa B conseguiu ver % linha(s) da Empresa A - isolamento de tenant violado.', v_qtd_empresa_errada;
  end if;
  raise notice 'TESTE 13 OK: sessão da Empresa B não vê nenhuma linha da Empresa A (RLS de tenant funcionando).';
end;
$$;

reset role;


-- ROLLBACK obrigatório - nenhuma linha fica de fato gravada, e o schema
-- (tabela/functions/trigger/policy, nunca tocado por este arquivo)
-- permanece exatamente como estava antes de rodar.
rollback;

-- =====================================================================
-- Consulta separada de resíduos - rodar DEPOIS deste script, numa NOVA
-- conexão/sessão (fora desta transação, já encerrada pelo ROLLBACK
-- acima). O schema DEVE continuar existindo (este teste nunca o cria
-- nem o derruba) - o que se verifica aqui é ausência de DADOS de teste.
-- =====================================================================
-- select case when to_regclass('public.empresa_convencao_horas_adicionais') is null
--   then 'RESÍDUO GRAVE - tabela não existe (este teste nunca deveria apagá-la)' else 'schema intacto (esperado)' end as tabela;
-- select count(*) as linhas_de_teste_residuais
--   from public.empresa_convencao_horas_adicionais
--   where empresa_id in (
--     '20000000-0000-0000-0000-000000009001', '20000000-0000-0000-0000-000000009002',
--     '20000000-0000-0000-0000-000000009003'
--   );
-- select count(*) as usuarios_de_teste_residuais
--   from public.usuarios
--   where id in (
--     '30000000-0000-0000-0000-000000009001', '30000000-0000-0000-0000-000000009002',
--     '30000000-0000-0000-0000-000000009003', '30000000-0000-0000-0000-000000009004',
--     '30000000-0000-0000-0000-000000009005'
--   );
-- select count(*) as empresas_de_teste_residuais
--   from public.empresas
--   where id in (
--     '20000000-0000-0000-0000-000000009001', '20000000-0000-0000-0000-000000009002',
--     '20000000-0000-0000-0000-000000009003'
--   );
-- select count(*) as auth_users_de_teste_residuais
--   from auth.users
--   where id in (
--     '10000000-0000-0000-0000-000000009001', '10000000-0000-0000-0000-000000009002',
--     '10000000-0000-0000-0000-000000009003', '10000000-0000-0000-0000-000000009004',
--     '10000000-0000-0000-0000-000000009005'
--   );
-- -- Todas as 4 consultas de contagem acima precisam devolver 0 - qualquer valor > 0 é RESÍDUO.
