-- DEC-007 §6.2/Fase 8b (redesenho: regras semanais compactas + convenção
-- coletiva) - configuração financeira global por empresa dos percentuais
-- de acréscimo de hora adicional (segunda a sexta/sábado/domingo/
-- feriado), com vigência histórica real: alterar a convenção para o
-- futuro NUNCA pode mudar snapshots ou cálculos já feitos no passado.
--
-- Desenho revisado e aprovado (2 rodadas de revisão com o usuário,
-- documentado em C:\Users\...\plans\scalable-wondering-hare.md):
-- - Padrão de vigência copiado de revisoes_itens (202607070006) -
--   vigente_desde/vigente_ate por data, índice único parcial só sobre a
--   linha "aberta" (vigente_ate is null).
-- - Imutabilidade de conteúdo copiada de simulacoes_comerciais
--   (202608110001, impedir_alteracao_conteudo_snapshot) - nenhuma linha
--   já vigente pode ter seu conteúdo alterado, só vigente_ate pode ser
--   preenchido, e só pela function de transição.
-- - btree_gist CONFIRMADO AUSENTE no projeto remoto (verificado em modo
--   somente-leitura, npx supabase db query --linked, extensões
--   instaladas: pg_stat_statements/pgcrypto/plpgsql/supabase_vault/
--   uuid-ossp) - nenhuma instalação proposta aqui. Proteção contra
--   sobreposição de vigências fica 100% procedural: trava por
--   pg_advisory_xact_lock (mesmo padrão já usado em
--   validar_dependencia_subconjunto/202608110001 e em
--   aprovar_projeto_com_simulacao_v5/202608110001 seção 9.1) + checagem
--   explícita de sobreposição via daterange/&& (operador nativo do
--   Postgres, não depende de nenhuma extensão - só um EXCLUDE CONSTRAINT
--   declarativo exigiria btree_gist, e esse reforço fica fora do
--   desenho).
-- - Vigência nunca retroativa (vigente_desde >= current_date) - decisão
--   confirmada com o usuário; agendar uma vigência futura continua
--   permitido.
-- - Bloqueio explícito: se não existir convenção cadastrada cobrindo uma
--   data, o consumidor (TypeScript, lib/cenarios/) bloqueia a regra -
--   nunca assume acréscimo 0 silenciosamente. Aqui no banco isso só
--   significa "nenhuma linha compatível é devolvida", nunca um valor
--   default.
-- - Leitura "qual convenção vale na data X" (ou "quais convenções cruzam
--   o período X-Y") centralizada em UMA função (
--   convencoes_horas_adicionais_no_periodo, seção 4) - reaproveitada
--   tanto pela tela administrativa (mostrar "vigente hoje" - NUNCA por
--   atalho "linha com vigente_ate is null", que pode ser uma vigência já
--   agendada para o futuro, distinta do que vale hoje) quanto pelo
--   carregamento de base de um cenário (todas as vigências que cruzam a
--   janela produtiva).

-- =====================================================================
-- 1. Tabela
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
