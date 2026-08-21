-- TESTE da migration 202608130001_empresa_convencao_horas_adicionais.sql
-- - NÃO É UMA MIGRATION - vive em supabase/tests/, fora do padrão de
-- nome de migration, NUNCA deve ser aplicado em produção.
--
-- Revisão 4 (correção pedida pelo usuário, 2026-08-20): convertido de
-- teste PRÉ-aplicação para teste PÓS-migration. A migration
-- 202608130001 já está aplicada em produção (confirmado por
-- introspecção somente-leitura: tabela, constraints, índices, policy
-- RLS, trigger e as 3 functions batem byte a byte com o arquivo da
-- migration) - a Revisão 3 deste arquivo ainda recriava a tabela/
-- functions/trigger/policies do zero (cópia da migration, "PARTE 1"),
-- o que agora FALHA de imediato (`relation already exists`) contra
-- qualquer banco onde a migration já rodou. Este arquivo NUNCA MAIS
-- recria schema - assume que tabela, functions, trigger e policies já
-- existem (criados pela migration real) e só cria/valida DADOS de
-- teste (linhas em empresa_convencao_horas_adicionais, e um
-- rebaixamento TEMPORÁRIO de profiles.nivel_acesso no TESTE 13) dentro
-- de uma transação, sempre desfeitos pelo ROLLBACK final - nunca a
-- estrutura em si. Os valores inseridos (0.99, -0.10, 0.20, 0.40 etc.)
-- são deliberadamente reconhecíveis como dado de teste (nunca uma
-- convenção coletiva real plausível), e nenhuma linha sobrevive ao
-- ROLLBACK de qualquer forma.
--
-- AMBIENTE DE EXECUÇÃO (pedido explícito do usuário): este arquivo deve
-- rodar em ambiente local/scratch (ex.: `supabase start` local via
-- Docker, ou um projeto Supabase descartável) - NUNCA rotineiramente
-- contra o projeto vinculado de produção, mesmo estando dentro de
-- BEGIN...ROLLBACK. A introspecção somente-leitura já confirmou que o
-- schema do projeto vinculado bate com a migration; este arquivo existe
-- para provar o COMPORTAMENTO (RPC, trigger, RLS) de forma executável e
-- repetível, não para validar o schema remoto de novo a cada rodada.
--
-- Revisões anteriores (histórico, mantido para contexto):
-- Revisão 1: 3 problemas encontrados na auditoria estática (cópia da
-- migration incompleta, contagem de BEGIN/COMMIT/ROLLBACK, só 9 dos 14
-- cenários pedidos, 2 deles fracos) - todos corrigidos na Revisão 2.
-- Revisão 3: execução real do BEGIN...ROLLBACK (então ainda contra um
-- banco SEM a migration aplicada) encontrou um bug real na RPC
-- (checagem de sobreposição rodava ANTES do fechamento da vigência
-- aberta, rejeitando por engano todo fluxo normal de sucessão) -
-- corrigido na migration real (202608130001) e a cópia deste arquivo
-- (então ainda existente) foi atualizada para refletir a correção.
--
-- Escopo (inalterado desde a Revisão 2): estrutura, imutabilidade de
-- conteúdo, checagem de sobreposição (operador isolado E via RPC com
-- cenário fora de ordem), vigência nunca retroativa (mensagem
-- específica), cadastro inicial via RPC, convenção futura agendada,
-- resolução por data consultada (nunca pelo atalho "vigente_ate is
-- null"), janela atravessando duas vigências, lacuna de vigência
-- detectada, INSERT/UPDATE/DELETE diretos bloqueados por RLS (role
-- authenticated de verdade, não só superusuário), isolamento entre
-- empresas, e admin-only.
--
-- Estrutura: BEGIN; só cenários de teste (nenhuma recriação de schema);
-- ROLLBACK obrigatório no final - nenhuma linha fica de fato gravada.
--
-- NOTA sobre autenticação: `set_config('request.jwt.claims', ...)` +
-- `set_config('role', 'authenticated', true)` simulam auth.uid()/
-- empresa_atual_id()/usuario_e_admin() para RPCs SECURITY DEFINER (não
-- precisam do ROLE real do Postgres, só das claims). Testes que
-- verificam RLS de verdade (INSERT/UPDATE/DELETE diretos, isolamento
-- entre empresas) precisam adicionalmente de `SET ROLE authenticated`
-- de verdade - superusuário/dono de tabela ignora RLS mesmo com as
-- claims certas, o que daria falso-positivo se não trocado. Os blocos
-- que fazem isso trazem `RESET ROLE` explícito ao final.
--
-- NOTA sobre dados do ambiente (verificado por introspecção somente-
-- leitura antes de escrever este script, sem nenhuma escrita real):
-- 2 empresas, 3 perfis admin ativos, 0 perfis NÃO-admin ativos no
-- projeto vinculado no momento desta auditoria. Como não há usuário
-- não-admin ativo pronto para uso, TESTE 13 (só admin pode registrar)
-- usa 2 dos 3 admins reais dentro da própria transação: um permanece
-- admin (controle positivo), o outro é rebaixado TEMPORARIAMENTE para
-- 'operador' (valor de ENUM confirmado por introspecção prévia, nunca
-- inventado) só para o teste negativo, e nunca restaurado manualmente -
-- o ROLLBACK final desfaz o rebaixamento junto com todo o resto. Não
-- fica PULADO nesta configuração de dados. Um ambiente local/scratch
-- recém-provisionado (sem esses fixtures) fará os TESTES que dependem
-- deles reportar PULADO explicitamente - nunca falhar silenciosamente.

begin;

-- ---------------------------------------------------------------------
-- TESTE 1: estrutura - CHECK de percentual não-negativo, CHECK de
-- vigência (vigente_ate >= vigente_desde), índice único parcial (só 1
-- linha aberta por empresa). Roda como superusuário (RLS não se aplica
-- aqui - isto testa CHECK/índice, não RLS; RLS é o TESTE 11).
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa_id uuid;
  v_user_id uuid;
begin
  select id into v_empresa_id from public.empresas order by id limit 1;
  select id into v_user_id from auth.users limit 1;

  if v_empresa_id is null or v_user_id is null then
    raise notice 'TESTE 1 PULADO: nenhuma empresa/usuário no ambiente para ancorar o teste.';
    return;
  end if;

  begin
    insert into public.empresa_convencao_horas_adicionais
      (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, created_by)
    values (v_empresa_id, -0.10, 0, 0, 0, current_date, v_user_id);
    raise exception 'TESTE 1a FALHOU: percentual negativo deveria ter sido rejeitado pelo CHECK.';
  exception
    when others then
      if sqlerrm like 'TESTE 1a FALHOU%' then raise; end if;
      raise notice 'TESTE 1a OK: percentual negativo rejeitado (%).', sqlerrm;
  end;

  begin
    insert into public.empresa_convencao_horas_adicionais
      (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, vigente_ate, created_by)
    values (v_empresa_id, 0.30, 0.50, 1.00, 1.00, current_date, current_date - 1, v_user_id);
    raise exception 'TESTE 1b FALHOU: vigente_ate anterior a vigente_desde deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 1b FALHOU%' then raise; end if;
      raise notice 'TESTE 1b OK: vigencia_chk rejeitou vigente_ate < vigente_desde (%).', sqlerrm;
  end;

  insert into public.empresa_convencao_horas_adicionais
    (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, created_by)
  values (v_empresa_id, 0.30, 0.50, 1.00, 1.00, current_date, v_user_id);

  begin
    insert into public.empresa_convencao_horas_adicionais
      (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, created_by)
    values (v_empresa_id, 0.40, 0.60, 1.00, 1.00, current_date + 30, v_user_id);
    raise exception 'TESTE 1c FALHOU: 2ª linha aberta (vigente_ate is null) para a mesma empresa deveria ter sido rejeitada pelo índice único parcial.';
  exception
    when others then
      if sqlerrm like 'TESTE 1c FALHOU%' then raise; end if;
      raise notice 'TESTE 1c OK: índice único parcial rejeitou 2ª linha aberta (%).', sqlerrm;
  end;
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 2: imutabilidade de conteúdo histórico (item 8 da lista pedida)
-- - alterar conteúdo de linha aberta falha; fechar (setar vigente_ate)
-- funciona; alterar linha já fechada falha. NOTA: roda como
-- superusuário - isto prova que o TRIGGER (que vale para qualquer
-- role) protege o conteúdo; não prova RLS (isso é o TESTE 11).
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.empresa_convencao_horas_adicionais
  where percentual_segunda_sexta = 0.30 and vigente_ate is null
  limit 1;

  if v_id is null then
    raise notice 'TESTE 2 PULADO: fixture do TESTE 1 não encontrada.';
    return;
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
-- TESTE 3: checagem de sobreposição - operador isolado (daterange/&&,
-- sem btree_gist). Complementado pelo TESTE 10 (mesma checagem
-- integrada na RPC, com dado fora de ordem).
-- ---------------------------------------------------------------------
do $$
declare
  v_sobrepoe boolean;
begin
  select daterange('2026-01-01'::date, '2026-07-01'::date) && daterange('2026-06-01'::date, 'infinity'::date)
  into v_sobrepoe;
  if v_sobrepoe is not true then
    raise exception 'TESTE 3a FALHOU: intervalos deveriam sobrepor.';
  end if;
  raise notice 'TESTE 3a OK: sobreposição detectada corretamente.';

  select daterange('2026-01-01'::date, '2026-06-01'::date) && daterange('2026-06-01'::date, 'infinity'::date)
  into v_sobrepoe;
  if v_sobrepoe is not false then
    raise exception 'TESTE 3b FALHOU: intervalos adjacentes (fim exclusivo = início do próximo) não deveriam sobrepor.';
  end if;
  raise notice 'TESTE 3b OK: intervalos adjacentes corretamente NÃO sobrepõem.';
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 4: vigência retroativa rejeitada VIA RPC (item 6) - checa o
-- TEXTO da mensagem ("passado"), não só "qualquer exceção".
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa_id uuid;
  v_admin_id uuid;
begin
  select p.empresa_id, p.id into v_empresa_id, v_admin_id
  from public.profiles p
  where p.nivel_acesso = 'admin' and p.ativo = true
  order by p.empresa_id
  limit 1;

  if v_admin_id is null then
    raise notice 'TESTE 4 PULADO: nenhum usuário admin (profiles.nivel_acesso=admin, ativo=true) no ambiente.';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);

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
end;
$$;


-- ---------------------------------------------------------------------
-- TESTES 5-9: fluxo via RPC (cadastro inicial, convenção futura
-- agendada, resolução por data consultada, janela atravessando duas
-- vigências, lacuna de vigência detectada) - itens 1, 2, 3, 4, 5 da
-- lista pedida. Usa uma empresa DIFERENTE da usada nos TESTES 1/2/3
-- (que já inserem uma linha aberta por acesso direto) para não colidir
-- com o índice único parcial.
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa_1_direto uuid;
  v_empresa_id uuid;
  v_admin_id uuid;
  v_id_primeira uuid;
  v_id_futura uuid;
  v_id_terceira uuid;
  v_qtd int;
  v_qtd2 int;
  v_row record;
  v_vigente_ate_primeira date;
  v_vigente_ate_segunda date;
begin
  select id into v_empresa_1_direto from public.empresas order by id limit 1;

  select p.empresa_id, p.id into v_empresa_id, v_admin_id
  from public.profiles p
  where p.nivel_acesso = 'admin' and p.ativo = true
    and p.empresa_id is distinct from v_empresa_1_direto
  order by p.empresa_id
  limit 1;

  if v_admin_id is null then
    raise notice 'TESTES 5-9 PULADOS: não há um 2º admin em empresa diferente da usada pelo TESTE 1 (só 1 empresa com admin no ambiente, ou dado insuficiente).';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);

  -- TESTE 5 (item 1 - cadastro inicial via RPC, sucesso).
  v_id_primeira := public.registrar_convencao_horas_adicionais(0.30, 0.50, 1.00, 1.00, current_date);
  if v_id_primeira is null then
    raise exception 'TESTE 5 FALHOU: registrar_convencao_horas_adicionais deveria devolver um id.';
  end if;
  raise notice 'TESTE 5 OK: cadastro inicial via RPC bem-sucedido (id=%).', v_id_primeira;

  -- TESTE 6 (item 2 - convenção futura agendada, sem afetar "hoje").
  v_id_futura := public.registrar_convencao_horas_adicionais(0.35, 0.55, 1.00, 1.00, current_date + 60);

  select count(*) into v_qtd from public.convencoes_horas_adicionais_no_periodo(current_date, current_date);
  if v_qtd <> 1 then
    raise exception 'TESTE 6a FALHOU: deveria haver exatamente 1 convenção vigente hoje (achou %).', v_qtd;
  end if;
  raise notice 'TESTE 6a OK: convenção agendada para o futuro NÃO aparece como vigente hoje (só a 1ª convenção conta).';

  select count(*) into v_qtd from public.convencoes_horas_adicionais_no_periodo(current_date + 60, current_date + 60);
  if v_qtd <> 1 then
    raise exception 'TESTE 6b FALHOU: a convenção agendada deveria aparecer ao consultar sua própria data de início.';
  end if;
  raise notice 'TESTE 6b OK: convenção agendada aparece ao consultar a data futura correta (id=%).', v_id_futura;

  -- TESTE 6c (confirma que a 1ª convenção foi REALMENTE fechada na
  -- tabela, vigente_ate = véspera da 2ª, não só que a leitura por
  -- período "parece certa").
  select vigente_ate into v_vigente_ate_primeira
  from public.empresa_convencao_horas_adicionais
  where id = v_id_primeira;
  if v_vigente_ate_primeira is distinct from (current_date + 60 - 1) then
    raise exception 'TESTE 6c FALHOU: a 1ª convenção deveria estar fechada em % (véspera da 2ª), achou %.', (current_date + 60 - 1), v_vigente_ate_primeira;
  end if;
  raise notice 'TESTE 6c OK: a 1ª convenção foi fechada corretamente em % ao registrar a 2ª.', v_vigente_ate_primeira;

  -- TESTE 7 (item 3 - resolução pela data consultada, explícita, 3
  -- pontos: dentro da 1ª vigência, dentro da 2ª, e no dia exato da
  -- transição - NUNCA pelo atalho "vigente_ate is null").
  select percentual_segunda_sexta into v_row
  from public.convencoes_horas_adicionais_no_periodo(current_date + 30, current_date + 30);
  if v_row.percentual_segunda_sexta is distinct from 0.30 then
    raise exception 'TESTE 7a FALHOU: data dentro da 1ª vigência deveria resolver para 0.30 (achou %).', v_row.percentual_segunda_sexta;
  end if;
  raise notice 'TESTE 7a OK: data dentro da 1ª vigência resolve para a convenção certa (0.30).';

  select percentual_segunda_sexta into v_row
  from public.convencoes_horas_adicionais_no_periodo(current_date + 90, current_date + 90);
  if v_row.percentual_segunda_sexta is distinct from 0.35 then
    raise exception 'TESTE 7b FALHOU: data dentro da 2ª vigência deveria resolver para 0.35 (achou %).', v_row.percentual_segunda_sexta;
  end if;
  raise notice 'TESTE 7b OK: data dentro da 2ª vigência resolve para a convenção certa (0.35) - a linha "aberta" não foi usada por atalho, foi resolvida pela data.';

  select percentual_segunda_sexta into v_row
  from public.convencoes_horas_adicionais_no_periodo(current_date + 59, current_date + 59);
  if v_row.percentual_segunda_sexta is distinct from 0.30 then
    raise exception 'TESTE 7c FALHOU: último dia da 1ª vigência (véspera da transição) deveria resolver para 0.30 (achou %).', v_row.percentual_segunda_sexta;
  end if;
  raise notice 'TESTE 7c OK: último dia da 1ª vigência (véspera da transição) resolve corretamente.';

  -- TESTE 8 (item 4 - janela atravessando duas vigências).
  select count(*) into v_qtd from public.convencoes_horas_adicionais_no_periodo(current_date, current_date + 90);
  if v_qtd <> 2 then
    raise exception 'TESTE 8 FALHOU: janela [hoje, hoje+90] cruza as 2 vigências - deveria devolver 2 linhas (achou %).', v_qtd;
  end if;
  raise notice 'TESTE 8 OK: janela atravessando 2 vigências devolve as 2 convenções.';

  -- TESTE 9 (item 5 - lacuna de vigência detectada: período inteiramente
  -- antes da 1ª convenção desta empresa).
  select count(*) into v_qtd from public.convencoes_horas_adicionais_no_periodo(current_date - 100, current_date - 50);
  if v_qtd <> 0 then
    raise exception 'TESTE 9 FALHOU: período antes de qualquer convenção cadastrada deveria devolver 0 linhas (achou %).', v_qtd;
  end if;
  raise notice 'TESTE 9 OK: lacuna de vigência (nenhuma convenção aplicável) devolve 0 linhas, nunca um valor presumido.';

  -- TESTE 9B (registrar uma 3ª convenção enquanto a 2ª está aberta -
  -- cenário que exercita o fluxo normal de sucessão. Também confirma o
  -- fechamento efetivo da 2ª, igual ao 6c.)
  v_id_terceira := public.registrar_convencao_horas_adicionais(0.40, 0.60, 1.00, 1.00, current_date + 150);
  if v_id_terceira is null then
    raise exception 'TESTE 9B FALHOU: registrar uma 3ª convenção enquanto a 2ª está aberta deveria ter sucesso.';
  end if;
  raise notice 'TESTE 9B OK: 3ª convenção registrada com sucesso enquanto a 2ª estava aberta (id=%).', v_id_terceira;

  select vigente_ate into v_vigente_ate_segunda
  from public.empresa_convencao_horas_adicionais
  where id = v_id_futura;
  if v_vigente_ate_segunda is distinct from (current_date + 150 - 1) then
    raise exception 'TESTE 9B FALHOU: a 2ª convenção deveria estar fechada em % (véspera da 3ª), achou %.', (current_date + 150 - 1), v_vigente_ate_segunda;
  end if;
  raise notice 'TESTE 9B OK: a 2ª convenção foi fechada corretamente em % ao registrar a 3ª.', v_vigente_ate_segunda;

  -- TESTE 9C (fronteira exata entre 2 vigências não cria lacuna nem
  -- sobreposição): a véspera da 3ª ainda pertence à 2ª (0.35), o
  -- próprio dia de início da 3ª já pertence à 3ª (0.40), e uma janela
  -- cobrindo só esses 2 dias consecutivos devolve exatamente 2 linhas
  -- (nem 0 - lacuna, nem sobrepondo a mesma data 2x).
  select percentual_segunda_sexta into v_row
  from public.convencoes_horas_adicionais_no_periodo(current_date + 149, current_date + 149);
  if v_row.percentual_segunda_sexta is distinct from 0.35 then
    raise exception 'TESTE 9C FALHOU: véspera da 3ª vigência deveria resolver para a 2ª (0.35), achou %.', v_row.percentual_segunda_sexta;
  end if;

  select percentual_segunda_sexta into v_row
  from public.convencoes_horas_adicionais_no_periodo(current_date + 150, current_date + 150);
  if v_row.percentual_segunda_sexta is distinct from 0.40 then
    raise exception 'TESTE 9C FALHOU: data de início da 3ª vigência deveria resolver para a 3ª (0.40), achou %.', v_row.percentual_segunda_sexta;
  end if;

  select count(*) into v_qtd
  from public.convencoes_horas_adicionais_no_periodo(current_date + 149, current_date + 150);
  if v_qtd <> 2 then
    raise exception 'TESTE 9C FALHOU: janela [véspera, início da 3ª] deveria devolver exatamente as 2 convenções adjacentes (achou %) - sinal de lacuna ou sobreposição.', v_qtd;
  end if;
  raise notice 'TESTE 9C OK: fronteira exata entre a 2ª e a 3ª vigência não tem lacuna nem sobreposição.';

  -- TESTE 9D (janela cobrindo as 3 vigências - extensão do TESTE 8 com a
  -- 3ª convenção).
  select count(*) into v_qtd
  from public.convencoes_horas_adicionais_no_periodo(current_date, current_date + 200);
  if v_qtd <> 3 then
    raise exception 'TESTE 9D FALHOU: janela cobrindo as 3 vigências deveria devolver 3 linhas (achou %).', v_qtd;
  end if;
  raise notice 'TESTE 9D OK: janela cobrindo as 3 vigências devolve as 3 convenções.';

  -- TESTE 9E (qualquer erro deixa todas as linhas anteriores intactas,
  -- caminho de rejeição PRECOCE: falha na checagem de monotonicidade,
  -- antes de qualquer UPDATE de fechamento ser tentado. Confirma
  -- contagem de linhas da empresa E o fechamento da 2ª->3ª inalterados
  -- depois do erro.)
  select count(*) into v_qtd
  from public.empresa_convencao_horas_adicionais
  where empresa_id = v_empresa_id;

  begin
    perform public.registrar_convencao_horas_adicionais(0.99, 0.99, 0.99, 0.99, current_date + 100);
    raise exception 'TESTE 9E FALHOU: vigência fora de ordem (anterior à já aberta) deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 9E FALHOU%' then raise; end if;
      raise notice 'TESTE 9E OK: tentativa fora de ordem rejeitada (%).', sqlerrm;
  end;

  select count(*) into v_qtd2
  from public.empresa_convencao_horas_adicionais
  where empresa_id = v_empresa_id;
  if v_qtd2 <> v_qtd then
    raise exception 'TESTE 9E FALHOU: contagem de linhas da empresa mudou depois do erro (antes=%, depois=%) - resíduo de uma tentativa rejeitada.', v_qtd, v_qtd2;
  end if;

  select vigente_ate into v_vigente_ate_segunda
  from public.empresa_convencao_horas_adicionais
  where id = v_id_futura;
  if v_vigente_ate_segunda is distinct from (current_date + 150 - 1) then
    raise exception 'TESTE 9E FALHOU: a tentativa rejeitada alterou o fechamento da 2ª convenção (esperado %, achou %).', (current_date + 150 - 1), v_vigente_ate_segunda;
  end if;
  raise notice 'TESTE 9E OK: nenhuma linha anterior foi alterada pela tentativa rejeitada (contagem e fechamento intactos).';
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 10 (item 7 - sobreposição rejeitada VIA RPC, cenário fora de
-- ordem): a monotonicidade (nova vigência > vigência aberta atual) já
-- evita sobreposição no fluxo normal - para provar que a checagem
-- EXPLÍCITA (daterange/&&) é um reforço de verdade, e não código morto,
-- este teste cria uma linha histórica FORA DE ORDEM por acesso direto
-- (fora da RPC, simulando um dado corrigido manualmente) e confirma que
-- a RPC rejeita uma nova vigência que passaria no teste de
-- monotonicidade mas colide com essa linha histórica.
--
-- Isolamento de empresa: usa a MESMA empresa do TESTE 1/2 (ordenação
-- ascendente por empresa_id, igual ao TESTE 1/4) - não a empresa do
-- TESTE 5-9, que termina com uma convenção aberta (a 3ª, TESTE 9B) e
-- colidiria com o índice único parcial ao tentar inserir outra linha
-- aberta aqui. A empresa do TESTE 1/2 termina com exatamente 1 linha
-- FECHADA (TESTE 2b fecha a única linha aberta que o TESTE 1 criou) -
-- livre para uma nova linha aberta sem colidir com nada.
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa_id uuid;
  v_admin_id uuid;
  v_user_id uuid;
  v_id_aberta uuid;
  v_vigente_ate_aberta date;
begin
  select p.empresa_id, p.id into v_empresa_id, v_admin_id
  from public.profiles p
  where p.nivel_acesso = 'admin' and p.ativo = true
  order by p.empresa_id
  limit 1;
  select id into v_user_id from auth.users limit 1;

  if v_admin_id is null or v_user_id is null then
    raise notice 'TESTE 10 PULADO: nenhum admin/usuário disponível no ambiente.';
    return;
  end if;

  -- Setup fora de ordem, por acesso direto (superusuário, fora da RPC):
  -- linha aberta "normal" começando hoje...
  insert into public.empresa_convencao_horas_adicionais
    (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, created_by)
  values (v_empresa_id, 0.20, 0.40, 0.80, 0.80, current_date, v_user_id)
  returning id into v_id_aberta;

  -- ...e uma linha HISTÓRICA (já fechada) só, propositalmente, com
  -- vigente_desde POSTERIOR à linha aberta acima - situação que a RPC
  -- nunca produziria sozinha (ela sempre fecha a antiga ANTES de abrir
  -- a nova), mas que pode existir por correção manual de dado.
  insert into public.empresa_convencao_horas_adicionais
    (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, vigente_ate, created_by)
  values (v_empresa_id, 0.99, 0.99, 0.99, 0.99, current_date + 50, current_date + 60, v_user_id);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);

  begin
    -- current_date + 55 é POSTERIOR à vigência aberta (current_date) -
    -- passaria na checagem de monotonicidade sozinha - mas cai DENTRO
    -- de [current_date+50, current_date+60], a linha histórica fora de
    -- ordem. Só a checagem explícita (daterange/&&, item 7) pega isto.
    perform public.registrar_convencao_horas_adicionais(0.10, 0.10, 0.10, 0.10, current_date + 55);
    raise exception 'TESTE 10 FALHOU: deveria ter sido rejeitado por sobreposição com a linha histórica fora de ordem.';
  exception
    when others then
      if sqlerrm like 'TESTE 10 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%sobreposi%' then
        raise exception 'TESTE 10 FALHOU: rejeitado, mas pelo motivo ERRADO (esperava menção a "sobreposição", recebeu: %).', sqlerrm;
      end if;
      raise notice 'TESTE 10 OK: sobreposição com linha histórica fora de ordem rejeitada pela checagem explícita (%).', sqlerrm;
  end;

  -- TESTE 10B (qualquer erro deixa todas as linhas anteriores intactas,
  -- caminho de rejeição TARDIA: a chamada acima passa na checagem de
  -- monotonicidade, então a function CHEGA A FECHAR a linha aberta, e
  -- só DEPOIS disso é rejeitada pela checagem de sobreposição contra o
  -- estado final - prova direta de que a exceção desfaz o fechamento
  -- parcial junto, mesma transação, sem nenhuma lógica de desfazimento
  -- manual na function.)
  select vigente_ate into v_vigente_ate_aberta
  from public.empresa_convencao_horas_adicionais
  where id = v_id_aberta;
  if v_vigente_ate_aberta is not null then
    raise exception 'TESTE 10B FALHOU: a linha aberta foi fechada (vigente_ate=%) mesmo com a RPC tendo sido rejeitada - a exceção deveria ter desfeito o fechamento junto.', v_vigente_ate_aberta;
  end if;
  raise notice 'TESTE 10B OK: a linha aberta continua aberta (vigente_ate is null) depois da tentativa rejeitada - a exceção desfez o fechamento parcial junto, mesma transação.';
end;
$$;


-- ---------------------------------------------------------------------
-- TESTE 11 (item 9 - INSERT/UPDATE/DELETE diretos bloqueados por RLS
-- para authenticated): diferente dos TESTES 1/2 (que rodam como
-- superusuário e por isso NÃO testam RLS, só CHECK/trigger), este teste
-- troca de verdade para o role `authenticated` (SET ROLE, não só as
-- claims) - superusuário ignora RLS mesmo com as claims certas.
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa_id uuid;
  v_admin_id uuid;
  v_id_alvo uuid;
begin
  select id into v_empresa_id from public.empresas order by id limit 1;
  select id into v_id_alvo from public.empresa_convencao_horas_adicionais limit 1;

  select p.id into v_admin_id
  from public.profiles p
  where p.ativo = true
  limit 1;

  if v_admin_id is null or v_id_alvo is null then
    raise notice 'TESTE 11 PULADO: nenhum usuário/linha-alvo disponível no ambiente.';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
end;
$$;

set role authenticated;

do $$
declare
  v_empresa_id uuid;
  v_id_alvo uuid;
begin
  select id into v_empresa_id from public.empresas order by id limit 1;
  select id into v_id_alvo from public.empresa_convencao_horas_adicionais limit 1;

  begin
    insert into public.empresa_convencao_horas_adicionais
      (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, created_by)
    values (v_empresa_id, 0.10, 0.10, 0.10, 0.10, current_date + 200, auth.uid());
    raise exception 'TESTE 11a FALHOU: INSERT direto (fora da RPC) deveria ter sido rejeitado por RLS para authenticated.';
  exception
    when others then
      if sqlerrm like 'TESTE 11a FALHOU%' then raise; end if;
      raise notice 'TESTE 11a OK: INSERT direto bloqueado por RLS/grant para authenticated (%).', sqlerrm;
  end;

  if v_id_alvo is not null then
    begin
      update public.empresa_convencao_horas_adicionais set percentual_sabado = 0.01 where id = v_id_alvo;
      raise exception 'TESTE 11b FALHOU: UPDATE direto (fora da RPC) deveria ter sido rejeitado por RLS para authenticated.';
    exception
      when others then
        if sqlerrm like 'TESTE 11b FALHOU%' then raise; end if;
        raise notice 'TESTE 11b OK: UPDATE direto bloqueado por RLS/grant para authenticated (%).', sqlerrm;
    end;

    begin
      delete from public.empresa_convencao_horas_adicionais where id = v_id_alvo;
      raise exception 'TESTE 11c FALHOU: DELETE direto (fora da RPC) deveria ter sido rejeitado por RLS para authenticated.';
    exception
      when others then
        if sqlerrm like 'TESTE 11c FALHOU%' then raise; end if;
        raise notice 'TESTE 11c OK: DELETE direto bloqueado por RLS/grant para authenticated (%).', sqlerrm;
    end;
  else
    raise notice 'TESTE 11b/11c PULADOS: nenhuma linha-alvo para tentar UPDATE/DELETE.';
  end if;
end;
$$;

reset role;


-- ---------------------------------------------------------------------
-- TESTE 12 (item 10 - isolamento entre empresas): com role authenticated
-- de verdade (mesmo motivo do TESTE 11 - superusuário ignora RLS), a
-- sessão de um usuário da empresa A não pode ver linhas da empresa B.
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa_a uuid;
  v_empresa_b uuid;
  v_user_a uuid;
begin
  select id into v_empresa_a from public.empresas order by id limit 1;
  select id into v_empresa_b from public.empresas where id is distinct from v_empresa_a order by id limit 1;

  if v_empresa_b is null then
    raise notice 'TESTE 12 PULADO: só 1 empresa no ambiente - isolamento entre empresas não é verificável.';
    return;
  end if;

  select p.id into v_user_a
  from public.profiles p
  where p.empresa_id = v_empresa_a and p.ativo = true
  limit 1;

  if v_user_a is null then
    raise notice 'TESTE 12 PULADO: nenhum usuário ativo vinculado à empresa A.';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
end;
$$;

set role authenticated;

do $$
declare
  v_empresa_a uuid;
  v_empresa_b uuid;
  v_qtd_empresa_errada int;
begin
  select id into v_empresa_a from public.empresas order by id limit 1;
  select id into v_empresa_b from public.empresas where id is distinct from v_empresa_a order by id limit 1;

  if v_empresa_b is null then
    return; -- já reportado como PULADO no bloco de setup acima.
  end if;

  select count(*) into v_qtd_empresa_errada
  from public.empresa_convencao_horas_adicionais
  where empresa_id = v_empresa_b;

  if v_qtd_empresa_errada <> 0 then
    raise exception 'TESTE 12 FALHOU: sessão da empresa A conseguiu ver % linha(s) da empresa B - isolamento de tenant violado.', v_qtd_empresa_errada;
  end if;
  raise notice 'TESTE 12 OK: sessão da empresa A não vê nenhuma linha da empresa B (RLS de tenant funcionando).';
end;
$$;

reset role;


-- ---------------------------------------------------------------------
-- TESTE 13 (item 11 - só administrador pode registrar): usa 2 admins
-- reais dentro da MESMA transação: um permanece admin (controle
-- positivo, TESTE 13a), o outro é rebaixado TEMPORARIAMENTE para
-- 'operador' (TESTE 13b) - `nivel_acesso` é um ENUM Postgres, 'operador'
-- é o próprio valor DEFAULT da coluna, nenhum valor inventado. O
-- rebaixamento NUNCA é restaurado manualmente - o ROLLBACK final (fim
-- deste arquivo) desfaz o UPDATE de nivel_acesso junto com todo o
-- resto, exatamente como qualquer outra escrita deste script.
-- ---------------------------------------------------------------------
do $$
declare
  v_admin_controle_id uuid;
  v_admin_rebaixado_id uuid;
begin
  select p.id into v_admin_controle_id
  from public.profiles p
  where p.nivel_acesso = 'admin' and p.ativo = true
  order by p.id
  limit 1;

  select p.id into v_admin_rebaixado_id
  from public.profiles p
  where p.nivel_acesso = 'admin' and p.ativo = true and p.id is distinct from v_admin_controle_id
  order by p.id
  limit 1;

  if v_admin_controle_id is null or v_admin_rebaixado_id is null then
    raise notice 'TESTE 13 PULADO: menos de 2 administradores ativos no ambiente.';
    return;
  end if;

  -- TESTE 13a - controle positivo: sessão do admin que PERMANECE admin.
  -- A RPC não pode rejeitá-lo por FALTA DE PERMISSÃO (pode rejeitar por
  -- outro motivo legítimo, ex.: sobreposição com dado de outro teste -
  -- o que importa aqui é que a mensagem NUNCA seja a de permissão).
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_controle_id, 'role', 'authenticated')::text, true);
  begin
    perform public.registrar_convencao_horas_adicionais(0.11, 0.11, 0.11, 0.11, current_date + 400);
    raise notice 'TESTE 13a OK: admin de controle conseguiu registrar - permissão não é o problema para ele.';
  exception
    when others then
      if sqlerrm ilike '%administrad%' then
        raise exception 'TESTE 13a FALHOU: admin de controle foi rejeitado por permissão - não deveria (%).', sqlerrm;
      end if;
      raise notice 'TESTE 13a OK: admin de controle não foi rejeitado por permissão (rejeitado por outro motivo, aceitável aqui: %).', sqlerrm;
  end;

  -- Rebaixamento temporário - só dentro desta transação.
  update public.profiles set nivel_acesso = 'operador' where id = v_admin_rebaixado_id;

  -- TESTE 13b - o mesmo usuário, agora sem nivel_acesso=admin, precisa
  -- ser rejeitado ESPECIFICAMENTE por falta de permissão.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_rebaixado_id, 'role', 'authenticated')::text, true);
  begin
    perform public.registrar_convencao_horas_adicionais(0.12, 0.12, 0.12, 0.12, current_date + 410);
    raise exception 'TESTE 13b FALHOU: usuário rebaixado para operador conseguiu registrar uma convenção.';
  exception
    when others then
      if sqlerrm like 'TESTE 13b FALHOU%' then raise; end if;
      if sqlerrm not ilike '%administrad%' then
        raise exception 'TESTE 13b FALHOU: rejeitado, mas pelo motivo ERRADO (esperava menção a "administrad", recebeu: %).', sqlerrm;
      end if;
      raise notice 'TESTE 13b OK: usuário rebaixado (nivel_acesso=operador) rejeitado especificamente por falta de permissão (%).', sqlerrm;
  end;
end;
$$;


-- ROLLBACK obrigatório - nenhuma linha fica de fato gravada, e o schema
-- (tabela/functions/trigger/policies, nunca tocado por este arquivo)
-- permanece exatamente como estava antes de rodar.
rollback;

-- =====================================================================
-- Consulta separada de resíduos - rodar DEPOIS deste script, numa NOVA
-- conexão/aba (fora desta transação, já encerrada pelo ROLLBACK acima).
-- Diferente da versão pré-migration deste arquivo: o schema DEVE
-- continuar existindo (este teste nunca o cria nem o derruba) - o que
-- se verifica aqui é ausência de DADOS de teste, nunca do schema.
-- =====================================================================
-- select case when to_regclass('public.empresa_convencao_horas_adicionais') is null
--   then 'RESÍDUO GRAVE - tabela não existe (este teste nunca deveria apagá-la)' else 'schema intacto (esperado)' end as tabela;
-- select count(*) as linhas_de_teste_residuais
--   from public.empresa_convencao_horas_adicionais
--   where percentual_segunda_sexta in (-0.10, 0.30, 0.40, 0.99, 0.20, 0.10, 0.35, 0.11, 0.12)
--     and created_at > now() - interval '1 hour';
-- -- linhas_de_teste_residuais precisa ser 0 - qualquer valor > 0 é RESÍDUO (ROLLBACK falhou ou o script rodou fora de uma transação).
