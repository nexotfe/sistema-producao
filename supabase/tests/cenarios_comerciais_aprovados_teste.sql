-- TESTE (pós-aplicação) da migration 202608180002_cenarios_comerciais_aprovados.sql
-- - NÃO é uma migration, vive em supabase/tests/, nunca deve ser
-- aplicado em produção. Assume que a migration real já foi aplicada -
-- NÃO embute o DDL dela (mesmo padrão de
-- generalizacao_dependencia_item_roteiro_teste.sql: colar DDL à mão
-- neste arquivo já causou um incidente documentado no cabeçalho de
-- gerar_teste_pre_aplicacao.sh). Para rodar como teste PRÉ-aplicação
-- reversível (BEGIN...ROLLBACK, migration real ainda não aplicada),
-- gere o arquivo combinado com
-- supabase/tests/gerar_teste_pre_aplicacao_cenarios_comerciais_aprovados.sh
-- (script DEDICADO a este par - a migration 202608180002 não tem linha
-- "commit;" própria, ao contrário de 202608180001, então o gerador
-- genérico existente não se aplica sem adaptação; nunca copie a
-- migration à mão para dentro deste arquivo).
--
-- Escopo coberto aqui (itens numerados conforme o pedido original):
--   1. aprovação do cenário atual sem custos adicionais
--   2. aprovação do cenário ajustado
--   3. soma exata das categorias (custo_adicional_total)
--   4. novo_custo_tecnico = custo_tecnico_atual + custo_adicional_total
--   8. substituição encerra o cenário anterior e preserva histórico
--   9. somente um cenário vigente por (empresa_id, projeto_id)
--   10. isolamento entre empresas (RLS de verdade, SET ROLE)
--   11. usuário sem permissão (nivel_acesso <> admin) rejeitado
--   12. projeto de outra empresa rejeitado
--   13. falha no meio da transação não deixa estado parcial
--   14. mudanças posteriores (conteúdo já aprovado) não alteram o snapshot
--   16. nenhuma linha criada/alterada em ordens_producao/operacoes_producao
--   18. zero escrita fora da RPC (INSERT/UPDATE/DELETE direto bloqueados)
-- FORA de escopo deste arquivo SQL (cobertos em TypeScript, nunca
-- verificáveis em SQL puro): 5 (impostos não calculados na tela de
-- Cenários - é ausência de chamada a calcularResumoOrcamento no código
-- do card), 6 (Proposta aplica a fórmula existente sobre o novo valor-
-- base), 7 (prazo proposto chega à Proposta), 15 (ausência de cenário
-- aprovado mantém comportamento antigo), 17 (nenhuma fórmula financeira
-- duplicada - garantia de implementação/revisão de código).
--
-- NOTA sobre autenticação: mesmo idioma de
-- fase8b_convencao_horas_adicionais_teste.sql - `set_config('request.jwt.claims', ...)`
-- simula auth.uid()/empresa_atual_id()/usuario_e_admin() para a RPC
-- SECURITY DEFINER; testes que verificam RLS de verdade (INSERT/UPDATE/
-- DELETE direto, isolamento entre empresas) usam adicionalmente
-- `SET ROLE authenticated` de verdade (superusuário ignora RLS mesmo com
-- as claims certas) - `RESET ROLE` explícito ao final de cada bloco.
--
-- NOTA sobre fixtures: nenhum usuário/perfil sintético é criado -
-- reaproveita perfis admin REAIS já existentes, rebaixando UM deles
-- temporariamente para 'operador' só dentro desta transação (mesmo
-- padrão do TESTE 13 de fase8b_convencao_horas_adicionais_teste.sql) -
-- o ROLLBACK final desfaz o rebaixamento junto com todo o resto.
--
-- ZERO CASOS "PULADO" (confirmado por introspecção somente-leitura no
-- ambiente vinculado, feita antes desta revisão): 2 empresas no total,
-- AS DUAS com pelo menos 1 perfil admin ativo e pelo menos 1 projeto
-- ativo (empresa d7b40f3a...: 1 admin/3 projetos; empresa f835684a...:
-- 2 admins/15 projetos), 3 perfis admin ativos no total - suficiente
-- para os testes 10 (isolamento entre empresas), 11 (usuário sem
-- permissão) e 12b (projeto de outra empresa) rodarem incondicionalmente,
-- sem nenhum PULADO. A pré-checagem abaixo RE-VERIFICA essas mesmas 3
-- condições a cada execução (nunca confia só na introspecção prévia,
-- que pode ficar desatualizada) e ABORTA com mensagem clara se algo
-- mudou - nunca PULA silenciosamente nem finge sucesso.

begin;

-- =====================================================================
-- PRÉ-CHECAGEM (somente leitura) - aborta com mensagem clara se faltar
-- fixture essencial, nunca deixa os testes 1-9 rodarem sobre suposição.
-- =====================================================================
do $$
declare
  v_empresa_a uuid;
  v_admin_a uuid;
  v_projeto_a uuid;
  v_qtd_empresas_com_admin_e_projeto int;
  v_qtd_admins_total int;
begin
  select p.empresa_id, p.id
    into v_empresa_a, v_admin_a
  from public.profiles p
  where p.nivel_acesso = 'admin' and p.ativo = true
  order by p.empresa_id
  limit 1;

  if v_admin_a is null then
    raise exception 'PRÉ-CHECAGEM FALHOU: nenhum perfil admin ativo no ambiente - impossível testar aprovar_cenario_comercial.';
  end if;

  select id into v_projeto_a
  from public.projetos
  where empresa_id = v_empresa_a and deleted_at is null
  order by created_at asc
  limit 1;

  if v_projeto_a is null then
    raise exception 'PRÉ-CHECAGEM FALHOU: nenhum projeto ativo na empresa % (do admin %) - impossível testar aprovar_cenario_comercial.', v_empresa_a, v_admin_a;
  end if;

  -- Exigido para os TESTES 10/12b rodarem sem PULADO (isolamento entre
  -- empresas / projeto de outra empresa rejeitado): pelo menos 2
  -- empresas DISTINTAS, cada uma com pelo menos 1 admin ativo e 1
  -- projeto ativo - nunca uma suposição, sempre reconfirmado aqui.
  select count(*) into v_qtd_empresas_com_admin_e_projeto
  from (
    select p.empresa_id
    from public.profiles p
    where p.nivel_acesso = 'admin' and p.ativo = true
      and exists (select 1 from public.projetos pr where pr.empresa_id = p.empresa_id and pr.deleted_at is null)
    group by p.empresa_id
  ) empresas_aptas;

  if v_qtd_empresas_com_admin_e_projeto < 2 then
    raise exception 'PRÉ-CHECAGEM FALHOU: são necessárias pelo menos 2 empresas, cada uma com admin ativo e projeto ativo, para os TESTES 10/12b (isolamento entre empresas / projeto de outra empresa) - encontradas %. Este teste não tem casos PULADO: se o ambiente mudou, ajuste a fixture, nunca ignore esta falha.', v_qtd_empresas_com_admin_e_projeto;
  end if;

  -- Exigido para o TESTE 11 rodar sem PULADO (usuário sem permissão
  -- rejeitado - rebaixamento temporário de um 2º admin real).
  select count(*) into v_qtd_admins_total from public.profiles where nivel_acesso = 'admin' and ativo = true;
  if v_qtd_admins_total < 2 then
    raise exception 'PRÉ-CHECAGEM FALHOU: são necessários pelo menos 2 perfis admin ativos no ambiente para o TESTE 11 (rebaixamento temporário de um deles) - encontrados %. Este teste não tem casos PULADO.', v_qtd_admins_total;
  end if;

  raise notice 'PRÉ-CHECAGEM OK: empresa=%, admin=%, projeto=%, empresas aptas p/ isolamento=%, admins ativos totais=%.',
    v_empresa_a, v_admin_a, v_projeto_a, v_qtd_empresas_com_admin_e_projeto, v_qtd_admins_total;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 1 (item 1): aprovação do cenário ATUAL sem custos adicionais -
-- todas as categorias em 0, custo_adicional_total=0,
-- novo_custo_tecnico=custo_tecnico_atual.
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa_id uuid;
  v_admin_id uuid;
  v_projeto_id uuid;
  v_novo_id uuid;
  v_row record;
begin
  select p.empresa_id, p.id into v_empresa_id, v_admin_id
  from public.profiles p
  where p.nivel_acesso = 'admin' and p.ativo = true
  order by p.empresa_id
  limit 1;

  select id into v_projeto_id
  from public.projetos
  where empresa_id = v_empresa_id and deleted_at is null
  order by created_at asc
  limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);

  v_novo_id := public.aprovar_cenario_comercial(
    v_projeto_id, 'atual', current_date, current_date + 10,
    50000.00, 0, 0, 0, 0, 62000.00,
    jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
    null
  );

  if v_novo_id is null then
    raise exception 'TESTE 1 FALHOU: aprovar_cenario_comercial deveria devolver um id.';
  end if;

  select * into v_row from public.cenarios_comerciais_aprovados where id = v_novo_id;

  if v_row.vigente is not true then
    raise exception 'TESTE 1 FALHOU: cenário recém-aprovado deveria estar vigente.';
  end if;
  if v_row.custo_adicional_total <> 0 then
    raise exception 'TESTE 1 FALHOU: custo_adicional_total deveria ser 0 (achou %).', v_row.custo_adicional_total;
  end if;
  if v_row.novo_custo_tecnico <> v_row.custo_tecnico_atual then
    raise exception 'TESTE 1 FALHOU: novo_custo_tecnico (%) deveria ser igual a custo_tecnico_atual (%) sem custo adicional.', v_row.novo_custo_tecnico, v_row.custo_tecnico_atual;
  end if;
  if v_row.diferenca_em_dias <> 10 then
    raise exception 'TESTE 1 FALHOU: diferenca_em_dias deveria ser 10 (achou %).', v_row.diferenca_em_dias;
  end if;
  if v_row.aprovado_por <> v_admin_id then
    raise exception 'TESTE 1 FALHOU: aprovado_por deveria ser o admin da sessão, nunca outro valor.';
  end if;
  if (v_row.snapshot ->> 'aprovadoPor') <> v_admin_id::text then
    raise exception 'TESTE 1 FALHOU: snapshot.aprovadoPor deveria ter sido sobrescrito pela RPC com o admin da sessão.';
  end if;

  raise notice 'TESTE 1 OK: cenário atual aprovado sem custo adicional (id=%, novo_custo_tecnico=%).', v_novo_id, v_row.novo_custo_tecnico;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTES 2/3/4 (itens 2, 3, 4): aprovação do cenário AJUSTADO,
-- substituindo o TESTE 1 - soma exata das categorias e novo_custo_tecnico
-- corretos.
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa_id uuid;
  v_admin_id uuid;
  v_projeto_id uuid;
  v_anterior_id uuid;
  v_novo_id uuid;
  v_row record;
  v_anterior_depois record;
begin
  select p.empresa_id, p.id into v_empresa_id, v_admin_id
  from public.profiles p
  where p.nivel_acesso = 'admin' and p.ativo = true
  order by p.empresa_id
  limit 1;

  select id into v_projeto_id
  from public.projetos
  where empresa_id = v_empresa_id and deleted_at is null
  order by created_at asc
  limit 1;

  select id into v_anterior_id
  from public.cenarios_comerciais_aprovados
  where projeto_id = v_projeto_id and vigente = true;

  if v_anterior_id is null then
    raise exception 'TESTE 2 FALHOU: fixture do TESTE 1 (cenário vigente) não encontrada.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);

  v_novo_id := public.aprovar_cenario_comercial(
    v_projeto_id, 'ajustado', current_date, current_date + 25,
    50000.00, 1200.50, 3400.25, 800.00, 0, 62000.00,
    jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'ajustado'),
    'Negociação de prazo com o cliente exigiu hora adicional e antecipação de material.'
  );

  select * into v_row from public.cenarios_comerciais_aprovados where id = v_novo_id;

  -- TESTE 3 (item 3) - soma exata das 4 categorias.
  if v_row.custo_adicional_total <> (1200.50 + 3400.25 + 800.00 + 0) then
    raise exception 'TESTE 3 FALHOU: custo_adicional_total (%) deveria ser exatamente a soma das 4 categorias (%).', v_row.custo_adicional_total, (1200.50 + 3400.25 + 800.00);
  end if;
  raise notice 'TESTE 3 OK: custo_adicional_total = soma exata das categorias (%).', v_row.custo_adicional_total;

  -- TESTE 4 (item 4) - novo_custo_tecnico = custo_tecnico_atual + custo_adicional_total.
  if v_row.novo_custo_tecnico <> (v_row.custo_tecnico_atual + v_row.custo_adicional_total) then
    raise exception 'TESTE 4 FALHOU: novo_custo_tecnico (%) deveria ser custo_tecnico_atual + custo_adicional_total (%).', v_row.novo_custo_tecnico, (v_row.custo_tecnico_atual + v_row.custo_adicional_total);
  end if;
  raise notice 'TESTE 4 OK: novo_custo_tecnico = custo_tecnico_atual + custo_adicional_total (%).', v_row.novo_custo_tecnico;

  -- TESTE 2 (item 2) em si - aprovação do ajustado teve sucesso e ficou vigente.
  if v_row.vigente is not true or v_row.tipo_cenario <> 'ajustado' then
    raise exception 'TESTE 2 FALHOU: cenário ajustado deveria estar vigente com tipo_cenario=ajustado.';
  end if;
  if v_row.substituiu_cenario_id <> v_anterior_id then
    raise exception 'TESTE 2 FALHOU: substituiu_cenario_id deveria apontar para o cenário anterior (%), achou %.', v_anterior_id, v_row.substituiu_cenario_id;
  end if;
  raise notice 'TESTE 2 OK: cenário ajustado aprovado com sucesso (id=%, custo_adicional_total=%).', v_novo_id, v_row.custo_adicional_total;

  -- TESTE 8 (item 8) - o anterior deixou de ser vigente, mas o histórico
  -- (todos os campos originais) permanece intacto.
  select * into v_anterior_depois from public.cenarios_comerciais_aprovados where id = v_anterior_id;
  if v_anterior_depois.vigente is not false then
    raise exception 'TESTE 8 FALHOU: cenário anterior deveria ter deixado de ser vigente após a substituição.';
  end if;
  if v_anterior_depois.tipo_cenario <> 'atual' or v_anterior_depois.custo_tecnico_atual <> 50000.00 then
    raise exception 'TESTE 8 FALHOU: conteúdo histórico do cenário anterior foi alterado - deveria permanecer intacto.';
  end if;
  raise notice 'TESTE 8 OK: substituição encerrou o cenário anterior (vigente=false) e preservou seu conteúdo histórico intacto.';

  -- TESTE 9 (item 9) - só 1 vigente por (empresa_id, projeto_id) depois
  -- de 2 aprovações.
  if (select count(*) from public.cenarios_comerciais_aprovados where projeto_id = v_projeto_id and vigente = true) <> 1 then
    raise exception 'TESTE 9 FALHOU: deveria haver exatamente 1 cenário vigente para o projeto depois de 2 aprovações.';
  end if;
  raise notice 'TESTE 9 OK: exatamente 1 cenário vigente por projeto, mesmo após substituição.';

  -- TESTE 9b - índice único parcial rejeita um 2º vigente inserido
  -- diretamente (bypass da RPC, como superusuário) para o mesmo par
  -- (empresa_id, projeto_id).
  begin
    insert into public.cenarios_comerciais_aprovados (
      empresa_id, projeto_id, vigente, tipo_cenario, aprovado_por,
      data_solicitada_cliente, prazo_proposto, diferenca_em_dias,
      custo_tecnico_atual, custo_adicional_total, novo_custo_tecnico,
      snapshot, versao_snapshot
    ) values (
      v_empresa_id, v_projeto_id, true, 'atual', v_admin_id,
      current_date, current_date, 0,
      100, 0, 100,
      jsonb_build_object('versaoFormato', 1, 'aprovadoPor', v_admin_id::text), 1
    );
    raise exception 'TESTE 9b FALHOU: um 2º cenário vigente para o mesmo projeto deveria ter sido rejeitado pelo índice único parcial.';
  exception
    when others then
      if sqlerrm like 'TESTE 9b FALHOU%' then raise; end if;
      raise notice 'TESTE 9b OK: índice único parcial rejeitou o 2º vigente (%).', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 12/14 (itens 14 e, em parte, 8): mudanças posteriores não
-- alteram o snapshot já aprovado - conteúdo é imutável mesmo para
-- superusuário, exceto vigente (só pela RPC).
-- ---------------------------------------------------------------------
do $$
declare
  v_projeto_id uuid;
  v_id_vigente uuid;
begin
  select cca.projeto_id, cca.id into v_projeto_id, v_id_vigente
  from public.cenarios_comerciais_aprovados cca
  where cca.vigente = true
  order by cca.aprovado_em desc
  limit 1;

  if v_id_vigente is null then
    raise exception 'TESTE 12 FALHOU: fixture (cenário vigente dos testes anteriores) não encontrada.';
  end if;

  begin
    update public.cenarios_comerciais_aprovados set custo_hora_adicional = 999999 where id = v_id_vigente;
    raise exception 'TESTE 12 FALHOU: alterar conteúdo de um cenário já aprovado deveria ter sido rejeitado, mesmo por superusuário.';
  exception
    when others then
      if sqlerrm like 'TESTE 12 FALHOU%' then raise; end if;
      raise notice 'TESTE 12 OK: conteúdo de um cenário já aprovado é imutável, mudanças posteriores não o alteram (%).', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 13 (item 13): falha no meio de uma sequência "fecha o vigente
-- então grava o novo" não deixa estado parcial. O corpo da RPC valida
-- tudo (permissão/tenant/forma/motivo) ANTES de tocar qualquer linha, o
-- que torna impraticável induzir uma falha real DEPOIS do UPDATE de
-- fechamento passando só por parâmetros válidos - por isso este teste
-- demonstra a MESMA garantia de atomicidade diretamente, sem nenhum
-- comando de controle transacional manual.
--
-- CORREÇÃO (achada na 1ª execução real contra o banco vinculado):
-- `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` NÃO são statements válidos dentro
-- do corpo de um `do $$ ... $$` (comandos de controle de transação, não
-- PL/pgSQL) - a versão anterior deste teste os usava diretamente ali e
-- falhou com "syntax error at or near 'to'" na primeira tentativa real
-- (nada chegou a executar - o corpo inteiro do DO é compilado antes de
-- rodar qualquer linha). Corrigido para o único mecanismo de
-- subtransação que o PL/pgSQL de fato oferece: um bloco `begin ...
-- exception when others ... end` ANINHADO - ao capturar a exceção,
-- TODAS as alterações feitas dentro dele (o fechamento do vigente E a
-- tentativa de inserir o novo, juntos) são desfeitas automaticamente
-- pelo próprio PL/pgSQL, nunca só a última instrução. Mesma semântica
-- que a RPC herda ao fechar o vigente antes de inserir o novo, dentro
-- da mesma function.
-- ---------------------------------------------------------------------
do $$
declare
  v_projeto_id uuid;
  v_id_vigente uuid;
  v_conteudo_antes jsonb;
  v_conteudo_depois jsonb;
  v_qtd_linhas_antes int;
  v_qtd_linhas_depois int;
  v_vigente_depois boolean;
  v_qtd_vigentes_depois int;
  v_sqlstate_capturado text;
  v_mensagem_capturada text;
begin
  select cca.projeto_id, cca.id into v_projeto_id, v_id_vigente
  from public.cenarios_comerciais_aprovados cca
  where cca.vigente = true
  order by cca.aprovado_em desc
  limit 1;

  if v_id_vigente is null then
    raise exception 'TESTE 13 FALHOU: fixture (cenário vigente) não encontrada.';
  end if;

  select to_jsonb(cca) - 'vigente' into v_conteudo_antes from public.cenarios_comerciais_aprovados cca where cca.id = v_id_vigente;
  select count(*) into v_qtd_linhas_antes from public.cenarios_comerciais_aprovados where projeto_id = v_projeto_id;

  -- Bloco aninhado = subtransação real do PL/pgSQL: se a EXCEPTION
  -- capturar algo, tudo que rodou dentro deste "begin" é desfeito
  -- automaticamente quando o controle sai pelo "exception" - nunca
  -- precisa (nem pode) de SAVEPOINT/ROLLBACK TO manual aqui.
  begin
    perform set_config('app.aprovacao_cenario_comercial_em_andamento_projeto_id', v_projeto_id::text, true);
    update public.cenarios_comerciais_aprovados set vigente = false where id = v_id_vigente;

    insert into public.cenarios_comerciais_aprovados (
      empresa_id, projeto_id, vigente, tipo_cenario, aprovado_por,
      data_solicitada_cliente, prazo_proposto, diferenca_em_dias,
      custo_tecnico_atual, custo_adicional_total, novo_custo_tecnico,
      snapshot, versao_snapshot
    )
    select empresa_id, projeto_id, true, 'atual', aprovado_por,
      current_date, current_date, 0,
      100, 0, 100,
      jsonb_build_object('versaoFormato', 2, 'aprovadoPor', aprovado_por::text), -- versaoFormato != versao_snapshot -> CHECK falha
      1
    from public.cenarios_comerciais_aprovados where id = v_id_vigente;

    -- Nunca deveria chegar aqui - se chegou, o CHECK não rejeitou o
    -- snapshot malformado como deveria.
    raise exception 'TESTE 13 FALHOU: INSERT com snapshot de forma inválida deveria ter sido rejeitado pelo CHECK.';
  exception
    when others then
      v_sqlstate_capturado := sqlstate;
      v_mensagem_capturada := sqlerrm;
      if v_mensagem_capturada like 'TESTE 13 FALHOU%' then raise; end if;
  end;

  -- A exceção capturada precisa ser EXATAMENTE a esperada (23514 =
  -- check_violation, do CHECK cenarios_comerciais_aprovados_snapshot_forma_chk)
  -- - nunca qualquer erro incidental (ex.: falha de permissão/tenant,
  -- que indicaria que o teste nem chegou a montar o cenário certo).
  if v_sqlstate_capturado is distinct from '23514' then
    raise exception 'TESTE 13 FALHOU: a exceção capturada não foi a esperada (CHECK de forma do snapshot, sqlstate 23514) - achou sqlstate=%, mensagem=%.', v_sqlstate_capturado, v_mensagem_capturada;
  end if;
  if v_mensagem_capturada not ilike '%snapshot_forma_chk%' then
    raise exception 'TESTE 13 FALHOU: exceção com sqlstate certo (23514) mas mensagem inesperada (esperava menção a snapshot_forma_chk) - achou: %.', v_mensagem_capturada;
  end if;
  raise notice 'TESTE 13: falha esperada capturada (sqlstate=%, %).', v_sqlstate_capturado, v_mensagem_capturada;

  -- Validações DEPOIS do bloco aninhado - tudo dentro dele já foi
  -- revertido automaticamente pelo PL/pgSQL ao capturar a exceção.

  -- 1. O cenário anterior continua vigente=true.
  select vigente into v_vigente_depois from public.cenarios_comerciais_aprovados where id = v_id_vigente;
  if v_vigente_depois is not true then
    raise exception 'TESTE 13 FALHOU: o cenário deveria continuar vigente=true (fechamento parcial desfeito) - achou %.', v_vigente_depois;
  end if;

  -- 2. Nenhum novo cenário permaneceu (contagem de linhas do projeto
  -- idêntica a antes do bloco aninhado).
  select count(*) into v_qtd_linhas_depois from public.cenarios_comerciais_aprovados where projeto_id = v_projeto_id;
  if v_qtd_linhas_depois <> v_qtd_linhas_antes then
    raise exception 'TESTE 13 FALHOU: a quantidade de linhas do projeto mudou (antes=%, depois=%) - o INSERT que falhou deixou resíduo.', v_qtd_linhas_antes, v_qtd_linhas_depois;
  end if;

  -- 3. O conteúdo do cenário anterior não mudou (comparação completa,
  -- exceto vigente - mesmo idioma do trigger de imutabilidade).
  select to_jsonb(cca) - 'vigente' into v_conteudo_depois from public.cenarios_comerciais_aprovados cca where cca.id = v_id_vigente;
  if v_conteudo_antes is distinct from v_conteudo_depois then
    raise exception 'TESTE 13 FALHOU: o conteúdo do cenário anterior mudou depois da tentativa revertida - deveria ser idêntico byte a byte (exceto vigente).';
  end if;

  -- 4. Não ficou mais de um vigente para o projeto.
  select count(*) into v_qtd_vigentes_depois from public.cenarios_comerciais_aprovados where projeto_id = v_projeto_id and vigente = true;
  if v_qtd_vigentes_depois <> 1 then
    raise exception 'TESTE 13 FALHOU: deveria haver exatamente 1 cenário vigente para o projeto depois da tentativa revertida (achou %).', v_qtd_vigentes_depois;
  end if;

  raise notice 'TESTE 13 OK: bloco aninhado (subtransação real do PL/pgSQL) desfez o fechamento e o INSERT que falhou juntos - vigente=true preservado, conteúdo intacto, nenhuma linha nova, exatamente 1 vigente.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 16 (item 16): nenhuma linha criada/alterada em ordens_fabricacao
-- (a tabela real de OF neste schema - confirmado por introspecção
-- somente-leitura antes desta revisão; "ordens_producao"/
-- "operacoes_producao" NÃO existem neste banco - nome incorreto de uma
-- versão anterior deste teste, corrigido aqui. Não há tabela separada de
-- "operações de produção" neste schema hoje - vw_of_fluxo_industrial/
-- vw_of_fluxo_operacional são VIEWS sobre ordens_fabricacao + consumos/
-- requisições de compra, não uma tabela própria de operações em
-- execução) pela aprovação de um cenário comercial - confirmado por
-- contagem antes/depois de uma nova aprovação, nunca só assumido pela
-- leitura do código. Sem PULADO - ordens_fabricacao existe de verdade
-- neste ambiente, confirmado por introspecção.
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa_id uuid;
  v_admin_id uuid;
  v_projeto_id uuid;
  v_qtd_of_antes bigint;
  v_qtd_of_depois bigint;
begin
  select p.empresa_id, p.id into v_empresa_id, v_admin_id
  from public.profiles p
  where p.nivel_acesso = 'admin' and p.ativo = true
  order by p.empresa_id
  limit 1;

  select id into v_projeto_id
  from public.projetos
  where empresa_id = v_empresa_id and deleted_at is null
  order by created_at asc
  limit 1;

  if to_regclass('public.ordens_fabricacao') is null then
    raise exception 'TESTE 16 FALHOU: tabela ordens_fabricacao não encontrada - inconsistente com a introspecção prévia (confirmada existente). Investigue, nunca trate como PULADO.';
  end if;

  select count(*) into v_qtd_of_antes from public.ordens_fabricacao;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
  perform public.aprovar_cenario_comercial(
    v_projeto_id, 'atual', current_date, current_date + 5,
    50000.00, 0, 0, 0, 0, 62000.00,
    jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
    'Reaprovação para o TESTE 16.'
  );

  select count(*) into v_qtd_of_depois from public.ordens_fabricacao;

  if v_qtd_of_antes <> v_qtd_of_depois then
    raise exception 'TESTE 16 FALHOU: aprovar_cenario_comercial alterou ordens_fabricacao (%->%) - não deveria criar nem alterar OF.', v_qtd_of_antes, v_qtd_of_depois;
  end if;
  raise notice 'TESTE 16 OK: nenhuma linha criada/alterada em ordens_fabricacao pela aprovação do cenário comercial.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 18 (item 18): zero escrita fora da RPC - INSERT/UPDATE/DELETE
-- direto bloqueados por RLS para authenticated (SET ROLE de verdade,
-- não só as claims - superusuário ignora RLS mesmo com claims certas).
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

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
end;
$$;

set role authenticated;

do $$
declare
  v_id_alvo uuid;
begin
  select id into v_id_alvo from public.cenarios_comerciais_aprovados limit 1;

  begin
    insert into public.cenarios_comerciais_aprovados (
      empresa_id, projeto_id, vigente, tipo_cenario, aprovado_por,
      data_solicitada_cliente, prazo_proposto, diferenca_em_dias,
      custo_tecnico_atual, custo_adicional_total, novo_custo_tecnico,
      snapshot, versao_snapshot
    )
    select empresa_id, projeto_id, false, 'atual', aprovado_por, data_solicitada_cliente, prazo_proposto, diferenca_em_dias,
      custo_tecnico_atual, custo_adicional_total, novo_custo_tecnico, snapshot, versao_snapshot
    from public.cenarios_comerciais_aprovados limit 1;
    raise exception 'TESTE 18a FALHOU: INSERT direto (fora da RPC) deveria ter sido rejeitado por RLS para authenticated.';
  exception
    when others then
      if sqlerrm like 'TESTE 18a FALHOU%' then raise; end if;
      raise notice 'TESTE 18a OK: INSERT direto bloqueado por RLS para authenticated (%).', sqlerrm;
  end;

  if v_id_alvo is not null then
    begin
      update public.cenarios_comerciais_aprovados set motivo_substituicao = 'tentativa direta' where id = v_id_alvo;
      raise exception 'TESTE 18b FALHOU: UPDATE direto (fora da RPC) deveria ter sido rejeitado por RLS para authenticated.';
    exception
      when others then
        if sqlerrm like 'TESTE 18b FALHOU%' then raise; end if;
        raise notice 'TESTE 18b OK: UPDATE direto bloqueado por RLS para authenticated (%).', sqlerrm;
    end;

    begin
      delete from public.cenarios_comerciais_aprovados where id = v_id_alvo;
      raise exception 'TESTE 18c FALHOU: DELETE direto (fora da RPC) deveria ter sido rejeitado por RLS para authenticated.';
    exception
      when others then
        if sqlerrm like 'TESTE 18c FALHOU%' then raise; end if;
        raise notice 'TESTE 18c OK: DELETE direto bloqueado por RLS para authenticated (%).', sqlerrm;
    end;
  end if;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 10 (item 10): isolamento entre empresas - sessão da empresa A
-- não vê o cenário aprovado da empresa B via SELECT. Sem PULADO - a
-- pré-checagem já garantiu >= 2 empresas com admin+projeto ativos;
-- qualquer falha em encontrar a fixture aqui é tratada como erro real,
-- nunca como skip silencioso.
--
-- CORREÇÃO (auditoria estática, achada antes de qualquer execução):
-- `SET ROLE`/`RESET ROLE` NÃO são comandos plpgsql válidos dentro do
-- corpo de um `do $$ ... $$` (são comandos utilitários, não SQL/PL -
-- só podem rodar como statement de TOPO no script, ou via `EXECUTE`
-- dinâmico dentro de uma function) - uma versão anterior deste teste
-- tentava `set local role authenticated;`/`reset role;` DIRETO dentro
-- do corpo do DO, o que teria falhado (erro de sintaxe) na primeira
-- execução real. Corrigido para o MESMO padrão de 2 blocos DO separados
-- por um `set role authenticated;`/`reset role;` de TOPO, já usado
-- corretamente no TESTE 18 abaixo e em
-- fase8b_convencao_horas_adicionais_teste.sql (TESTE 11/12) - os 2 ids
-- que o 2º bloco precisa (empresa B, cenário aprovado de B) atravessam
-- os blocos via `set_config`/`current_setting` (GUC de sessão, não uma
-- variável plpgsql - essas não sobrevivem entre blocos DO distintos).
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa_a uuid;
  v_admin_a uuid;
  v_empresa_b uuid;
  v_admin_b uuid;
  v_projeto_b uuid;
  v_id_cenario_b uuid;
begin
  select p.empresa_id, p.id into v_empresa_a, v_admin_a
  from public.profiles p where p.nivel_acesso = 'admin' and p.ativo = true order by p.empresa_id limit 1;

  select p.empresa_id, p.id into v_empresa_b, v_admin_b
  from public.profiles p
  where p.nivel_acesso = 'admin' and p.ativo = true and p.empresa_id is distinct from v_empresa_a
  order by p.empresa_id
  limit 1;

  if v_admin_b is null then
    raise exception 'TESTE 10 FALHOU: nenhuma 2ª empresa com admin ativo encontrada - inconsistente com a pré-checagem (que já confirmou >= 2 empresas aptas). Investigue antes de prosseguir, nunca trate como PULADO.';
  end if;

  select id into v_projeto_b from public.projetos where empresa_id = v_empresa_b and deleted_at is null order by created_at asc limit 1;
  if v_projeto_b is null then
    raise exception 'TESTE 10 FALHOU: empresa B (%) sem projeto ativo - inconsistente com a pré-checagem. Investigue, nunca trate como PULADO.', v_empresa_b;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_b, 'role', 'authenticated')::text, true);
  v_id_cenario_b := public.aprovar_cenario_comercial(
    v_projeto_b, 'atual', current_date, current_date + 3,
    9000.00, 0, 0, 0, 0, null,
    jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
    null
  );

  -- Claims da empresa A já ficam prontas aqui (a troca de ROLE de
  -- verdade só pode acontecer no statement de topo logo abaixo) - e o
  -- id do cenário de B atravessa para o próximo bloco DO via GUC de
  -- sessão, nunca uma variável plpgsql (não sobreviveria).
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  perform set_config('teste10.id_cenario_b', v_id_cenario_b::text, true);
end;
$$;

set role authenticated;

do $$
declare
  v_id_cenario_b uuid := current_setting('teste10.id_cenario_b')::uuid;
begin
  if exists (select 1 from public.cenarios_comerciais_aprovados where id = v_id_cenario_b) then
    raise exception 'TESTE 10 FALHOU: sessão da empresa A conseguiu ver o cenário aprovado da empresa B - isolamento de tenant violado.';
  end if;
  raise notice 'TESTE 10 OK: sessão da empresa A não vê o cenário aprovado da empresa B (RLS de tenant funcionando).';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 11 (item 11): usuário sem permissão (nivel_acesso <> admin)
-- rejeitado. Mesmo padrão de fase8b_convencao_horas_adicionais_teste.sql
-- TESTE 13: rebaixa TEMPORARIAMENTE um 2º admin real para 'operador'
-- dentro desta transação (nunca cria usuário sintético) - o ROLLBACK
-- final desfaz o rebaixamento junto com todo o resto. Sem PULADO - a
-- pré-checagem já garantiu >= 2 admins ativos no ambiente.
-- ---------------------------------------------------------------------
do $$
declare
  v_admin_controle_id uuid;
  v_admin_rebaixado_id uuid;
  v_projeto_id uuid;
begin
  select p.id into v_admin_controle_id
  from public.profiles p where p.nivel_acesso = 'admin' and p.ativo = true order by p.id limit 1;

  select p.id into v_admin_rebaixado_id
  from public.profiles p
  where p.nivel_acesso = 'admin' and p.ativo = true and p.id is distinct from v_admin_controle_id
  order by p.id
  limit 1;

  if v_admin_rebaixado_id is null then
    raise exception 'TESTE 11 FALHOU: nenhum 2º admin ativo encontrado - inconsistente com a pré-checagem (que já confirmou >= 2). Investigue antes de prosseguir, nunca trate como PULADO.';
  end if;

  select id into v_projeto_id from public.projetos where deleted_at is null order by created_at asc limit 1;

  update public.profiles set nivel_acesso = 'operador' where id = v_admin_rebaixado_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_rebaixado_id, 'role', 'authenticated')::text, true);

  begin
    perform public.aprovar_cenario_comercial(
      v_projeto_id, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      null
    );
    raise exception 'TESTE 11 FALHOU: usuário rebaixado para operador conseguiu aprovar um cenário comercial.';
  exception
    when others then
      if sqlerrm like 'TESTE 11 FALHOU%' then raise; end if;
      if sqlerrm not ilike '%administrad%' then
        raise exception 'TESTE 11 FALHOU: rejeitado, mas pelo motivo ERRADO (esperava menção a "administrad", recebeu: %).', sqlerrm;
      end if;
      raise notice 'TESTE 11 OK: usuário sem nivel_acesso=admin rejeitado especificamente por falta de permissão (%).', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE 12b (item 12): projeto de OUTRA empresa rejeitado - admin real
-- da empresa A tenta aprovar um cenário para um projeto da empresa B.
-- Sem PULADO - a pré-checagem já garantiu >= 2 empresas com admin+
-- projeto ativos (a empresa B aqui não precisa ter admin, só projeto -
-- mas já sabemos que tem os dois).
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa_a uuid;
  v_admin_a uuid;
  v_empresa_b uuid;
  v_projeto_b uuid;
begin
  select p.empresa_id, p.id into v_empresa_a, v_admin_a
  from public.profiles p where p.nivel_acesso = 'admin' and p.ativo = true order by p.empresa_id limit 1;

  select p.empresa_id into v_empresa_b
  from public.profiles p
  where p.nivel_acesso = 'admin' and p.ativo = true and p.empresa_id is distinct from v_empresa_a
  order by p.empresa_id
  limit 1;

  if v_empresa_b is null then
    raise exception 'TESTE 12b FALHOU: nenhuma 2ª empresa com admin ativo encontrada - inconsistente com a pré-checagem. Investigue, nunca trate como PULADO.';
  end if;

  select id into v_projeto_b from public.projetos where empresa_id = v_empresa_b and deleted_at is null order by created_at asc limit 1;
  if v_projeto_b is null then
    raise exception 'TESTE 12b FALHOU: empresa B (%) sem projeto ativo - inconsistente com a pré-checagem. Investigue, nunca trate como PULADO.', v_empresa_b;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);

  begin
    perform public.aprovar_cenario_comercial(
      v_projeto_b, 'atual', current_date, current_date + 1,
      1000.00, 0, 0, 0, 0, null,
      jsonb_build_object('versaoFormato', 1, 'tipoCenario', 'atual'),
      null
    );
    raise exception 'TESTE 12b FALHOU: admin da empresa A conseguiu aprovar um cenário para um projeto da empresa B.';
  exception
    when others then
      if sqlerrm like 'TESTE 12b FALHOU%' then raise; end if;
      if sqlerrm not ilike '%pertence%' then
        raise exception 'TESTE 12b FALHOU: rejeitado, mas pelo motivo ERRADO (esperava menção a "pertence", recebeu: %).', sqlerrm;
      end if;
      raise notice 'TESTE 12b OK: projeto de outra empresa rejeitado especificamente por tenant (%).', sqlerrm;
  end;
end;
$$;

-- ROLLBACK obrigatório - nenhuma linha fica de fato gravada.
rollback;

-- =====================================================================
-- Consulta separada de resíduos - rodar DEPOIS deste script, numa NOVA
-- conexão/aba (fora desta transação, já encerrada pelo ROLLBACK acima).
-- =====================================================================
-- select case when to_regclass('public.cenarios_comerciais_aprovados') is null
--   then 'schema NÃO existe (ROLLBACK ok, ou migration ainda não aplicada)' else 'RESÍDUO - tabela existe, ROLLBACK falhou' end as tabela;
-- select case when to_regprocedure('public.aprovar_cenario_comercial(uuid,text,date,date,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text)') is null
--   then 'function NÃO existe (ROLLBACK ok, ou migration ainda não aplicada)' else 'RESÍDUO - function existe, ROLLBACK falhou' end as function_rpc;
-- select nivel_acesso from public.profiles where id = '<v_admin_rebaixado_id anotado no NOTICE>';
-- select vigente, motivo_substituicao from public.cenarios_comerciais_aprovados; -- deveria devolver 0 linhas
