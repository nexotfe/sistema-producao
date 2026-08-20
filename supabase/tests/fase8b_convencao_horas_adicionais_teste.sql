-- TESTE da migration 202608130001_empresa_convencao_horas_adicionais.sql
-- - NÃO É UMA MIGRATION - vive em supabase/tests/, fora do padrão de
-- nome de migration, NUNCA deve ser aplicado em produção.
--
-- Revisão 2 (auditoria estática pedida pelo usuário, ainda sem
-- execução): a Revisão 1 deste arquivo tinha 3 problemas encontrados na
-- auditoria, corrigidos abaixo:
-- 1. A cópia da migration (PARTE 1) omitia os `comment on table/column/
--    function` da migration real - o cabeçalho antigo afirmava "cópia
--    INTEGRAL... idêntica", o que não era literalmente verdade. Corrigido:
--    os comentários agora estão incluídos, cópia byte-a-byte das
--    instruções SQL da migration real (só os comentários DESTE arquivo,
--    fora da PARTE 1, são novos). NENHUMA mudança na migration real foi
--    feita por causa disto - só a cópia neste script.
-- 2. Ponto crítico verificado: a migration real (202608130001) NÃO
--    contém nenhum BEGIN/COMMIT/ROLLBACK (confirmado por grep) - não
--    havia nenhum delimitador de transação para remover da cópia. A
--    contagem exigida está no relatório de auditoria, não neste
--    comentário.
-- 3. A Revisão 1 só cobria 9 dos 14 cenários pedidos, e 2 dos 9 (TESTE 4,
--    "vigência retroativa") eram fracos (aceitavam qualquer exceção,
--    sem checar a mensagem - não distinguiam "rejeitado pelo motivo
--    certo" de "falhou por outro motivo"). TESTES 5-13 são novos;
--    TESTE 4 foi reforçado para checar o texto da mensagem.
--
-- Revisão 3 (execução real do BEGIN...ROLLBACK no projeto remoto
-- vinculado encontrou um bug real, não corrigida ainda nesta versão do
-- arquivo até agora): a checagem explícita de sobreposição em
-- registrar_convencao_horas_adicionais rodava ANTES de fechar a
-- convenção aberta atual, comparando contra TODAS as linhas da empresa -
-- inclusive a própria linha aberta que estava sendo substituída. Como
-- toda linha aberta tem vigente_ate=null (range até o infinito), ela
-- sempre "sobrepunha" a nova vigência futura, rejeitando por engano todo
-- fluxo normal de sucessão (TESTE 6 original). Corrigido na migration
-- real (202608130001) e replicado aqui na PARTE 1: a ordem passa a ser
-- localizar a aberta -> validar posterioridade -> FECHAR -> só então
-- checar sobreposição contra o ESTADO FINAL resultante (nunca contra o
-- estado anterior ao fechamento) - se a checagem rejeitar depois do
-- fechamento, a exceção desfaz o fechamento junto, mesma transação, sem
-- nenhuma lógica de desfazimento manual. TESTES novos desta revisão:
-- 6c (fechamento efetivo confirmado na tabela), 9B (3ª convenção sucede
-- a 2ª aberta - o cenário exato que revelou o bug), 9C (fronteira exata
-- entre vigências, sem lacuna nem sobreposição), 9D (janela cobrindo as
-- 3 vigências), 9E (erro de rejeição PRECOCE - monotonicidade - não
-- deixa resíduo), 10B (erro de rejeição TARDIA - depois do fechamento
-- parcial - desfaz o fechamento junto, prova direta do mecanismo).
--
-- Escopo agora: estrutura, imutabilidade de conteúdo, checagem de
-- sobreposição (operador isolado E via RPC com cenário fora de ordem),
-- vigência nunca retroativa (mensagem específica), cadastro inicial via
-- RPC, convenção futura agendada, resolução por data consultada
-- (nunca pelo atalho "vigente_ate is null"), janela atravessando duas
-- vigências, lacuna de vigência detectada, INSERT/UPDATE/DELETE diretos
-- bloqueados por RLS (role authenticated de verdade, não só superusuário),
-- isolamento entre empresas, e admin-only.
--
-- Estrutura: BEGIN; conteúdo INTEGRAL da migration; só então os cenários
-- deste script; ROLLBACK obrigatório no final - nenhuma linha fica de
-- fato gravada (mesmo padrão dos scripts fase6/fase7 já existentes em
-- supabase/tests/).
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
-- fica PULADO nesta configuração de dados.

begin;

-- =====================================================================
-- PARTE 1: conteúdo INTEGRAL da migration 202608130001 (idêntico,
-- incluindo comentários - corrigido nesta revisão)
-- =====================================================================

create table public.empresa_convencao_horas_adicionais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  percentual_segunda_sexta numeric not null check (percentual_segunda_sexta >= 0),
  percentual_sabado numeric not null check (percentual_sabado >= 0),
  percentual_domingo numeric not null check (percentual_domingo >= 0),
  percentual_feriado numeric not null check (percentual_feriado >= 0),
  vigente_desde date not null,
  vigente_ate date,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  constraint empresa_convencao_horas_adicionais_vigencia_chk
    check (vigente_ate is null or vigente_ate >= vigente_desde)
);

comment on table public.empresa_convencao_horas_adicionais is
  'Percentuais de acréscimo de hora adicional (fração, ex.: 0.30 = 30%) por natureza de dia, globais por empresa, com vigência histórica real (DEC-007, redesenho Fase 8b). 1 linha por vigência, layout largo (4 percentuais juntos, já que uma convenção coletiva nova normalmente muda os 4 ao mesmo tempo). Append-only por natureza: nenhuma linha já vigente (vigente_ate preenchido) pode ser alterada; toda escrita passa por registrar_convencao_horas_adicionais (seção 3).';
comment on column public.empresa_convencao_horas_adicionais.percentual_segunda_sexta is
  'Acréscimo sobre valor_hora para hora adicional em dia útil (natureza=hora_extra no motor em memória) - fração, não percentual inteiro (0.30, não 30).';
comment on column public.empresa_convencao_horas_adicionais.vigente_desde is
  'Data em que esta convenção passa a valer - nunca retroativa (registrar_convencao_horas_adicionais exige >= current_date no momento do cadastro), mas pode ser uma data FUTURA (agendamento permitido).';
comment on column public.empresa_convencao_horas_adicionais.vigente_ate is
  'NULL enquanto esta é a convenção mais recente cadastrada ("aberta") - preenchido automaticamente pela function de transição quando uma convenção mais nova é registrada. Nunca editável diretamente (trigger de imutabilidade, seção 2).';

create unique index empresa_convencao_horas_adicionais_aberta_uniq
  on public.empresa_convencao_horas_adicionais (empresa_id)
  where vigente_ate is null;

create index empresa_convencao_horas_adicionais_empresa_periodo_idx
  on public.empresa_convencao_horas_adicionais (empresa_id, vigente_desde);

-- =====================================================================
-- 2. RLS - só SELECT direto para authenticated; toda escrita via a
--    function SECURITY DEFINER da seção 3 (mesmo padrão de
--    simulacoes_comerciais - histórico crítico não fica exposto a
--    INSERT/UPDATE/DELETE direto, mesmo de admin).
-- =====================================================================

alter table public.empresa_convencao_horas_adicionais enable row level security;

create policy empresa_convencao_horas_adicionais_select_tenant
  on public.empresa_convencao_horas_adicionais
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

revoke all on public.empresa_convencao_horas_adicionais from public, anon, authenticated;
grant select on public.empresa_convencao_horas_adicionais to authenticated;

-- =====================================================================
-- 3. Imutabilidade de conteúdo (mesmo idioma de
--    impedir_alteracao_conteudo_snapshot, 202608110001) - nenhuma coluna
--    pode mudar depois de gravada, exceto vigente_ate, e mesmo assim só
--    de NULL para uma data (nunca reaberta).
-- =====================================================================

create or replace function public.impedir_alteracao_convencao_horas_adicionais()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.vigente_ate is not null then
    raise exception 'Convenção já encerrada (vigente_ate=%) - não pode ser alterada.', old.vigente_ate;
  end if;
  if (to_jsonb(old) - 'vigente_ate') is distinct from (to_jsonb(new) - 'vigente_ate') then
    raise exception 'Conteúdo de uma convenção já vigente é imutável - só vigente_ate pode ser preenchido, e só pela function de transição (registrar_convencao_horas_adicionais).';
  end if;
  return new;
end;
$function$;

comment on function public.impedir_alteracao_convencao_horas_adicionais() is
  'Trava de imutabilidade: uma linha já encerrada (vigente_ate not null) nunca pode ser tocada de novo; uma linha aberta só pode ter vigente_ate preenchido (fechamento), nenhuma outra coluna. Mesmo idioma de impedir_alteracao_conteudo_snapshot (202608110001).';

revoke execute on function public.impedir_alteracao_convencao_horas_adicionais() from public, anon, authenticated;

drop trigger if exists empresa_convencao_horas_adicionais_impedir_alteracao on public.empresa_convencao_horas_adicionais;
create trigger empresa_convencao_horas_adicionais_impedir_alteracao
  before update on public.empresa_convencao_horas_adicionais
  for each row
  execute function public.impedir_alteracao_convencao_horas_adicionais();

-- =====================================================================
-- 4. Leitura centralizada - "quais convenções cruzam o período
--    [p_data_inicio, p_data_fim]" (chamando com data_inicio=data_fim,
--    responde "qual vale NESSA data específica"). SECURITY INVOKER -
--    nunca eleva privilégio para leitura, RLS do chamador já filtra por
--    empresa (o WHERE explícito abaixo é defensivo/redundante com a
--    RLS, não uma segunda fonte de verdade). Usada tanto pela tela
--    administrativa (nunca pelo atalho "linha com vigente_ate is null",
--    que pode ser uma vigência agendada para o futuro - proteção A
--    pedida pelo usuário) quanto pelo carregamento de base de um
--    cenário (todas as vigências que cruzam a janela produtiva).
-- =====================================================================

create or replace function public.convencoes_horas_adicionais_no_periodo(
  p_data_inicio date,
  p_data_fim date
)
returns setof public.empresa_convencao_horas_adicionais
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select *
  from public.empresa_convencao_horas_adicionais
  where empresa_id = public.empresa_atual_id()
    and vigente_desde <= p_data_fim
    and (vigente_ate is null or vigente_ate >= p_data_inicio)
  order by vigente_desde asc;
$function$;

comment on function public.convencoes_horas_adicionais_no_periodo(date, date) is
  'Todas as convenções da empresa atual cujo intervalo [vigente_desde, vigente_ate] tem interseção com [p_data_inicio, p_data_fim]. Chamar com p_data_inicio=p_data_fim para "qual convenção vale nesta data específica" - NUNCA usar o atalho "linha com vigente_ate is null" para essa pergunta, pois a linha aberta pode ser uma vigência agendada para o futuro, distinta da que vale hoje.';

revoke execute on function public.convencoes_horas_adicionais_no_periodo(date, date) from public, anon;
grant execute on function public.convencoes_horas_adicionais_no_periodo(date, date) to authenticated;

-- =====================================================================
-- 5. Function de transição (mesmo padrão de registrar_revisao_item,
--    202607070007) - único caminho de escrita. Serializa por empresa
--    (pg_advisory_xact_lock, mesmo padrão de validar_dependencia_subconjunto
--    e aprovar_projeto_com_simulacao_v5, ambas em 202608110001) e rejeita
--    qualquer sobreposição de vigência explicitamente (daterange/&&,
--    nativo do Postgres - reforço além da monotonicidade já garantida
--    pelo fluxo fechar-então-inserir, proteção B pedida pelo usuário,
--    "mesmo sem btree_gist"). Ordem importa: localizar a aberta -> validar
--    posterioridade -> FECHAR -> só então checar sobreposição contra o
--    estado final resultante (nunca antes de fechar - isso rejeitaria por
--    engano toda sucessão normal, já que uma linha aberta se estende até
--    o infinito; corrigido depois de um erro real pego pelo próprio teste
--    reversível, ver TESTE 6/6b abaixo). Segunda correção, mesma causa:
--    "v_atual is not null" (record) é sempre FALSO para a linha que esta
--    própria consulta encontra, porque ela filtra "vigente_ate is null" -
--    e para tipos linha/composto, "IS NOT NULL" só é verdadeiro quando
--    TODOS os campos são não-nulos. Isso fazia o fechamento ser pulado
--    silenciosamente mesmo com uma linha aberta real encontrada - também
--    encontrado pelo teste reversível (TESTE 6 continuava rejeitando
--    mesmo depois da 1ª correção). Testado agora por "v_atual.id is not
--    null" (campo escalar, nunca nulo quando a linha existe).
-- =====================================================================

create or replace function public.registrar_convencao_horas_adicionais(
  p_percentual_segunda_sexta numeric,
  p_percentual_sabado numeric,
  p_percentual_domingo numeric,
  p_percentual_feriado numeric,
  p_vigente_desde date
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_atual record;
  v_novo_id uuid;
begin
  if not public.usuario_e_admin() then
    raise exception 'Só administradores podem alterar a convenção coletiva.';
  end if;

  if v_empresa_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  -- Serializa por empresa: só uma transação por vez pode registrar uma
  -- nova convenção para esta empresa, mesmo sem EXCLUDE constraint
  -- (btree_gist ausente, confirmado). Lock liberado automaticamente no
  -- fim da transação (commit ou rollback) - nunca precisa ser liberado
  -- manualmente.
  perform pg_advisory_xact_lock(hashtextextended('empresa_convencao_horas_adicionais:' || v_empresa_id::text, 0));

  if p_vigente_desde < current_date then
    raise exception 'A vigência não pode começar no passado (%) - use uma data igual ou posterior a hoje (%). Agendar para o futuro continua permitido.', p_vigente_desde, current_date;
  end if;

  select * into v_atual
  from public.empresa_convencao_horas_adicionais
  where empresa_id = v_empresa_id and vigente_ate is null;

  -- v_atual.id IS NOT NULL - nunca "v_atual IS NOT NULL" sozinho: v_atual
  -- é um record e, para tipos linha/composto, "row IS NOT NULL" só é
  -- verdadeiro quando TODOS os campos são não-nulos (semântica SQL
  -- padrão para comparação de row). Como esta consulta filtra
  -- explicitamente "vigente_ate is null", QUALQUER linha encontrada tem,
  -- por definição, esse campo nulo - "v_atual IS NOT NULL" avaliava
  -- sempre falso mesmo com uma linha real encontrada, pulando
  -- silenciosamente o fechamento abaixo (bug real, encontrado pelo
  -- próprio teste reversível: a linha aberta nunca era fechada, ficando
  -- sempre com range até o infinito, e por isso colidindo com toda
  -- tentativa seguinte de sucessão). Testar um campo ESCALAR que nunca é
  -- nulo quando a linha existe (id) evita a armadilha por completo.
  if v_atual.id is not null and p_vigente_desde <= v_atual.vigente_desde then
    raise exception 'A nova vigência (%) precisa ser posterior à vigência atual (%).', p_vigente_desde, v_atual.vigente_desde;
  end if;

  if v_atual.id is not null then
    update public.empresa_convencao_horas_adicionais
    set vigente_ate = p_vigente_desde - 1
    where id = v_atual.id;
  end if;

  -- Rejeita qualquer sobreposição com QUALQUER linha existente da
  -- empresa (não só a que acabou de ser fechada) - reforço explícito
  -- além da monotonicidade já garantida acima, pedido do usuário como
  -- proteção independente ("mesmo sem btree_gist"). daterange/&& é
  -- operador nativo do Postgres (core, sem extensão) - só um EXCLUDE
  -- CONSTRAINT declarativo exigiria btree_gist, e esse reforço fica fora
  -- do desenho (extensão confirmada ausente, não instalada).
  --
  -- Roda DEPOIS do fechamento acima, contra o ESTADO FINAL que
  -- resultaria da gravação - nunca contra o estado anterior a ele. Se a
  -- convenção aberta acabou de ser fechada em p_vigente_desde - 1, seu
  -- range deixou de se estender até o infinito e passa a ser adjacente
  -- (nunca sobreposto) ao range [p_vigente_desde, infinity) da nova
  -- convenção - isso evita o falso positivo que o fluxo normal de
  -- sucessão (encerrar a atual e abrir a próxima) produzia quando esta
  -- checagem rodava ANTES do fechamento. Continua pegando qualquer linha
  -- HISTÓRICA fora de ordem (nunca tocada pelo fechamento acima) sem
  -- precisar excluir nenhum id explicitamente - testa exatamente o
  -- estado que ficará gravado. Se detectar sobreposição aqui, a exceção
  -- propaga e desfaz o UPDATE de fechamento junto, pois está tudo na
  -- mesma transação.
  if exists (
    select 1
    from public.empresa_convencao_horas_adicionais c
    where c.empresa_id = v_empresa_id
      and daterange(c.vigente_desde, coalesce(c.vigente_ate + 1, 'infinity'::date))
          && daterange(p_vigente_desde, 'infinity'::date)
  ) then
    raise exception 'Sobreposição de vigência detectada para esta empresa - já existe uma convenção cobrindo parte do período a partir de %.', p_vigente_desde;
  end if;

  insert into public.empresa_convencao_horas_adicionais
    (empresa_id, percentual_segunda_sexta, percentual_sabado, percentual_domingo, percentual_feriado, vigente_desde, created_by)
  values (v_empresa_id, p_percentual_segunda_sexta, p_percentual_sabado, p_percentual_domingo, p_percentual_feriado, p_vigente_desde, auth.uid())
  returning id into v_novo_id;

  return v_novo_id;
end;
$function$;

comment on function public.registrar_convencao_horas_adicionais(numeric, numeric, numeric, numeric, date) is
  'Único caminho de escrita para empresa_convencao_horas_adicionais (DEC-007, redesenho Fase 8b) - só admin (usuario_e_admin), serializado por empresa (pg_advisory_xact_lock), rejeita vigência retroativa (vigente_desde >= current_date) e qualquer sobreposição de período (daterange/&&, sem depender de btree_gist). Fecha a convenção aberta anterior (vigente_ate = nova vigente_desde - 1) e insere a nova, atomicamente.';

revoke execute on function public.registrar_convencao_horas_adicionais(numeric, numeric, numeric, numeric, date) from public, anon;
grant execute on function public.registrar_convencao_horas_adicionais(numeric, numeric, numeric, numeric, date) to authenticated;


-- =====================================================================
-- PARTE 2: cenários de teste
-- =====================================================================

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
-- TESTE 4: vigência retroativa rejeitada VIA RPC (item 6) - reforçado
-- nesta revisão: checa o TEXTO da mensagem ("passado"), não só
-- "qualquer exceção" (a Revisão 1 não distinguia rejeição pelo motivo
-- certo de falha por outro motivo, ex.: admin/empresa).
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

  -- TESTE 6c (regressão pós-correção do bug de falso-positivo de
  -- sobreposição no fluxo normal de sucessão, encontrado pelo próprio
  -- teste reversível): confirma que a 1ª convenção foi REALMENTE fechada
  -- na tabela (vigente_ate = véspera da 2ª), não só que a leitura por
  -- período "parece certa".
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

  -- TESTE 9B (regressão pós-correção - registrar uma 3ª convenção
  -- enquanto a 2ª está aberta: é EXATAMENTE o cenário que revelou o bug
  -- original de falso-positivo de sobreposição - a checagem explícita
  -- rodava antes do fechamento e rejeitava por engano qualquer sucessão
  -- normal). Também confirma o fechamento efetivo da 2ª, igual ao 6c.
  v_id_terceira := public.registrar_convencao_horas_adicionais(0.40, 0.60, 1.00, 1.00, current_date + 150);
  if v_id_terceira is null then
    raise exception 'TESTE 9B FALHOU: registrar uma 3ª convenção enquanto a 2ª está aberta deveria ter sucesso (regressão do bug de sobreposição no fluxo normal de sucessão).';
  end if;
  raise notice 'TESTE 9B OK: 3ª convenção registrada com sucesso enquanto a 2ª estava aberta (id=%).', v_id_terceira;

  select vigente_ate into v_vigente_ate_segunda
  from public.empresa_convencao_horas_adicionais
  where id = v_id_futura;
  if v_vigente_ate_segunda is distinct from (current_date + 150 - 1) then
    raise exception 'TESTE 9B FALHOU: a 2ª convenção deveria estar fechada em % (véspera da 3ª), achou %.', (current_date + 150 - 1), v_vigente_ate_segunda;
  end if;
  raise notice 'TESTE 9B OK: a 2ª convenção foi fechada corretamente em % ao registrar a 3ª.', v_vigente_ate_segunda;

  -- TESTE 9C (item novo - fronteira exata entre 2 vigências não cria
  -- lacuna nem sobreposição): a véspera da 3ª ainda pertence à 2ª
  -- (0.35), o próprio dia de início da 3ª já pertence à 3ª (0.40), e uma
  -- janela cobrindo só esses 2 dias consecutivos devolve exatamente 2
  -- linhas (nem 0 - lacuna, nem sobrepondo a mesma data 2x).
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

  -- TESTE 9E (item novo - qualquer erro deixa todas as linhas anteriores
  -- intactas, caminho de rejeição PRECOCE: falha na checagem de
  -- monotonicidade, antes de qualquer UPDATE de fechamento ser tentado).
  -- Confirma contagem de linhas da empresa E o fechamento da 2ª->3ª
  -- inalterados depois do erro.
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
-- livre para uma nova linha aberta sem colidir com nada (bug de
-- isolamento entre testes encontrado pelo próprio teste reversível,
-- corrigido nesta revisão).
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

  -- TESTE 10B (item novo - qualquer erro deixa todas as linhas
  -- anteriores intactas, caminho de rejeição TARDIA: a chamada acima
  -- passa na checagem de monotonicidade, então a function CHEGA A
  -- FECHAR a linha aberta, e só DEPOIS disso é rejeitada pela checagem
  -- de sobreposição contra o estado final - prova direta de que a
  -- exceção desfaz o fechamento parcial junto, mesma transação, sem
  -- nenhuma lógica de desfazimento manual na function).
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
-- TESTE 13 (item 11 - só administrador pode registrar): o ambiente não
-- tem nenhum perfil não-admin ATIVO hoje (confirmado por introspecção
-- somente-leitura antes desta revisão), mas tem 3 admins ativos - em vez
-- de pular, usa 2 deles dentro da MESMA transação: um permanece admin
-- (controle positivo, TESTE 13a), o outro é rebaixado TEMPORARIAMENTE
-- para 'operador' (TESTE 13b) - `nivel_acesso` é um ENUM Postgres com
-- exatamente 4 valores, confirmados por introspecção somente-leitura
-- antes de escrever este teste (`select enumlabel from pg_enum join
-- pg_type ... where typname='nivel_acesso'`): admin, gestor, operador,
-- leitura - 'operador' é o próprio valor DEFAULT da coluna, nenhum valor
-- inventado. O rebaixamento NUNCA é restaurado manualmente - o ROLLBACK
-- final (fim deste arquivo) desfaz o UPDATE de nivel_acesso junto com
-- todo o resto, exatamente como qualquer outra escrita deste script.
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
    raise notice 'TESTE 13 PULADO: menos de 2 administradores ativos no ambiente (a introspecção prévia a esta revisão confirmou 3 - se isto disparar, os dados do ambiente mudaram desde então).';
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


-- ROLLBACK obrigatório - nenhuma linha fica de fato gravada.
rollback;

-- =====================================================================
-- Consulta separada de resíduos (item 14) - rodar DEPOIS deste script,
-- numa NOVA conexão/aba (fora desta transação, já encerrada pelo
-- ROLLBACK acima). As 3 linhas abaixo precisam devolver, respectivamente:
-- "schema NÃO existe" / null (0 linhas) / null (0 linhas).
-- =====================================================================
-- select case when to_regclass('public.empresa_convencao_horas_adicionais') is null
--   then 'schema NÃO existe (ROLLBACK ok)' else 'RESÍDUO - tabela existe, ROLLBACK falhou' end as tabela;
-- select case when to_regprocedure('public.registrar_convencao_horas_adicionais(numeric,numeric,numeric,numeric,date)') is null
--   then 'function NÃO existe (ROLLBACK ok)' else 'RESÍDUO - function existe, ROLLBACK falhou' end as function_escrita;
-- select case when to_regprocedure('public.convencoes_horas_adicionais_no_periodo(date,date)') is null
--   then 'function NÃO existe (ROLLBACK ok)' else 'RESÍDUO - function existe, ROLLBACK falhou' end as function_leitura;
