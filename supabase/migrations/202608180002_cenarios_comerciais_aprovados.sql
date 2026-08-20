-- DEC-007 §6.2/Fase 8b (redesenho: aprovação do cenário comercial +
-- resumo financeiro) - decisão comercial LEVE e SEPARADA da família
-- aprovar_projeto_com_simulacao_v* (simulacoes_comerciais): esta tabela
-- registra só a decisão do orçamentista de aprovar um cenário calculado
-- pela Previsão comercial por capacidade (avaliarPrevisaoComercialFlexivel/
-- montarPrevisaoComercialProjeto, TypeScript) - nunca cria OF, nunca
-- programa/reserva capacidade no PCP, nunca aprova o orçamento em si.
-- Decoupled de propósito de simulacoes_comerciais (que já tem
-- ajuste_cenario/custo_adicional_total reservados para uma "RPC v6"
-- nunca implementada, ligada à família v5 - service_role, efeitos de
-- PCP): esse acoplamento contradiria "não usa service_role"/"não cria
-- OF"/"não programa PCP", por isso NÃO foi reaproveitado aqui (decisão
-- confirmada com o usuário).
--
-- CONTRATO DE SEGURANÇA - LEIA ANTES DE ALTERAR (correção explícita
-- pedida pelo usuário, para nunca ser descrito de forma enganosa):
-- o cálculo da previsão comercial (prazo, horas efetivamente utilizadas,
-- custo por categoria) existe SÓ em TypeScript
-- (avaliarPrevisaoComercialFlexivel.ts/montarPrevisaoComercialProjeto.ts) -
-- não há, e não pode haver, uma segunda implementação em SQL. Portanto:
--   - o caminho OFICIAL da aplicação é a Server Action
--     (aprovarCenarioComercialAction.ts/orquestrarAprovacaoCenarioComercial.ts),
--     que RECALCULA tudo no servidor (client de sessão, nunca
--     service_role) e só chama esta RPC com o resultado recalculado;
--   - esta RPC verifica o que É verificável em SQL: autenticação,
--     empresa do projeto, permissão do usuário, forma/coerência das
--     datas e das somas de custo, e a regra de "só 1 vigente por
--     projeto" - ela NUNCA reconstrói nem confirma sozinha a previsão
--     operacional (prazo/horas/custo) a partir de dado bruto;
--   - o snapshot gravado é, por isso, uma DECISÃO COMERCIAL ATESTADA
--     pelo administrador que aprovou (aprovado_por/aprovado_em, escritos
--     só por esta RPC, nunca aceitos de parâmetro) - não uma prova
--     independente do banco de que a previsão está correta. Chamar esta
--     RPC diretamente (fora da Server Action) é tecnicamente possível
--     para um admin autenticado, mas produz uma decisão comercial sem o
--     recálculo/comparação de divergência que a Server Action faz -
--     por isso ela é o único caminho oficial, nunca "a única forma
--     tecnicamente possível".
--
-- Padrões reaproveitados (mesmo idioma de 202608110001/202608130001):
-- índice único parcial "1 vigente por projeto"; 2 triggers de
-- imutabilidade (trava de vigente por marca de transação + conteúdo
-- imutável via to_jsonb); pg_advisory_xact_lock para serializar por
-- projeto; usuario_e_admin()/empresa_atual_id() para autorização.
-- Diferença deliberada: chave de marca de transação PRÓPRIA
-- (app.aprovacao_cenario_comercial_em_andamento_projeto_id, nunca a
-- mesma de simulacoes_comerciais) - as duas aprovações são conceitos
-- independentes, nunca acoplados por uma GUC compartilhada.

-- =====================================================================
-- 1. Tabela
-- =====================================================================

create table public.cenarios_comerciais_aprovados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  projeto_id uuid not null references public.projetos(id),
  vigente boolean not null default true,
  tipo_cenario text not null check (tipo_cenario in ('atual', 'ajustado')),
  aprovado_por uuid not null references auth.users(id),
  aprovado_em timestamptz not null default now(),
  substituiu_cenario_id uuid references public.cenarios_comerciais_aprovados(id),
  motivo_substituicao text,
  data_solicitada_cliente date not null,
  prazo_proposto date not null,
  diferenca_em_dias integer not null,
  -- "Valor atual do orçamento" no sentido desta feature = custo TÉCNICO
  -- (soma dos itens, calcularValorComercialProjeto().custoTotal) - SEM
  -- margem/imposto/desconto (decisão confirmada com o usuário: o
  -- "novo valor-base" precisa ficar "ainda sem impostos" para a Proposta
  -- aplicar a fórmula existente uma única vez, sem dupla aplicação).
  custo_tecnico_atual numeric not null check (custo_tecnico_atual >= 0),
  custo_negociacao_material numeric not null default 0 check (custo_negociacao_material >= 0),
  custo_hora_adicional numeric not null default 0 check (custo_hora_adicional >= 0),
  custo_recurso_temporario numeric not null default 0 check (custo_recurso_temporario >= 0),
  -- Sempre 0 hoje - avaliarPrevisaoComercialFlexivel.ts não cobre
  -- terceirização ainda (fora deste incremento, documentado em
  -- necessidadeCapacidadeFlexivel.ts). Coluna existe para o dia em que
  -- cobrir, sem migration nova - nunca inferida por ausência de uso
  -- (Regra 7 do CLAUDE.md: ausência de consumidor não é abandono).
  custo_terceirizacao numeric not null default 0 check (custo_terceirizacao >= 0),
  custo_adicional_total numeric not null check (custo_adicional_total >= 0),
  novo_custo_tecnico numeric not null check (novo_custo_tecnico >= 0),
  -- Só informativo (valorComercial atual, já com margem/imposto/desconto
  -- embutidos) - NUNCA usado na soma que produz novo_custo_tecnico,
  -- exatamente para não misturar um valor já precificado com custo cru.
  valor_comercial_atual_referencia numeric,
  snapshot jsonb not null,
  versao_snapshot smallint not null default 1,
  created_at timestamptz not null default now(),
  constraint cenarios_comerciais_aprovados_custo_adicional_coerente_chk
    check (
      abs(custo_adicional_total - (custo_negociacao_material + custo_hora_adicional + custo_recurso_temporario + custo_terceirizacao)) < 0.01
    ),
  constraint cenarios_comerciais_aprovados_novo_custo_coerente_chk
    check (abs(novo_custo_tecnico - (custo_tecnico_atual + custo_adicional_total)) < 0.01),
  -- Defesa em profundidade: mesmo que a RPC (única via de escrita) já
  -- calcule estes 2 campos, um CHECK garante a coerência independente do
  -- caminho de escrita - nunca uma segunda fonte de verdade sem
  -- validação cruzada.
  constraint cenarios_comerciais_aprovados_snapshot_forma_chk
    check (
      jsonb_typeof(snapshot) = 'object'
      and (snapshot ->> 'versaoFormato')::int = versao_snapshot
      and snapshot ->> 'aprovadoPor' = aprovado_por::text
    ),
  constraint cenarios_comerciais_aprovados_substituicao_chk
    check (substituiu_cenario_id is null or motivo_substituicao is not null)
);

comment on table public.cenarios_comerciais_aprovados is
  'Decisão comercial do orçamentista (DEC-007, Fase 8b) sobre um cenário calculado pela Previsão comercial por capacidade - nunca cria OF, nunca programa/reserva capacidade no PCP, nunca aprova o orçamento em si. Decoupled de simulacoes_comerciais/aprovar_projeto_com_simulacao_v* de propósito (motor diferente, sem service_role, sem efeito de PCP). Snapshot é uma decisão ATESTADA pelo administrador, nunca uma prova independente do banco sobre a previsão operacional (ver cabeçalho desta migration) - só 1 vigente por (empresa_id, projeto_id), histórico preservado, conteúdo imutável após a inserção (ver triggers).';
comment on column public.cenarios_comerciais_aprovados.aprovado_por is
  'auth.uid() capturado DENTRO da RPC aprovar_cenario_comercial - nunca aceito como parâmetro do navegador.';
comment on column public.cenarios_comerciais_aprovados.motivo_substituicao is
  'Obrigatório (exigido pela própria RPC, reforçado pelo CHECK _substituicao_chk) sempre que já existir um cenário vigente para o projeto - nunca uma substituição silenciosa.';
comment on column public.cenarios_comerciais_aprovados.custo_tecnico_atual is
  '"Valor atual do orçamento" = custo TÉCNICO (custoTotal, sem margem/imposto/desconto) no momento da aprovação - a Proposta aplica a fórmula financeira (calcularResumoOrcamento) uma única vez sobre novo_custo_tecnico, nunca duplicada aqui.';
comment on column public.cenarios_comerciais_aprovados.snapshot is
  'CenarioComercialAprovadoSnapshot completo (TypeScript, versaoFormato=1) - inclui o SaidaPrevisaoComercial inteiro, premissas, decisões de capacidade adicional, disponibilidade de material. aprovadoPor/aprovadoEm dentro do JSON são SEMPRE sobrescritos pela RPC (nunca confiados ao payload recebido) - ver CHECK _snapshot_forma_chk.';

create unique index cenarios_comerciais_aprovados_vigente_unico
  on public.cenarios_comerciais_aprovados (empresa_id, projeto_id)
  where vigente = true;

create index cenarios_comerciais_aprovados_projeto_idx
  on public.cenarios_comerciais_aprovados (projeto_id, aprovado_em desc);

-- =====================================================================
-- 2. RLS - só SELECT direto para authenticated (tela de Orçamento/
--    Proposta lê o vigente diretamente, sem RPC); toda escrita é
--    bloqueada para authenticated, mesmo para admin - único caminho de
--    escrita é aprovar_cenario_comercial (SECURITY DEFINER, seção 4).
-- =====================================================================

alter table public.cenarios_comerciais_aprovados enable row level security;

create policy cenarios_comerciais_aprovados_select_tenant
  on public.cenarios_comerciais_aprovados
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

create policy cenarios_comerciais_aprovados_insert_blocked
  on public.cenarios_comerciais_aprovados
  for insert to authenticated
  with check (false);

create policy cenarios_comerciais_aprovados_update_blocked
  on public.cenarios_comerciais_aprovados
  for update to authenticated
  using (false);

create policy cenarios_comerciais_aprovados_delete_blocked
  on public.cenarios_comerciais_aprovados
  for delete to authenticated
  using (false);

revoke all on public.cenarios_comerciais_aprovados from public, anon, authenticated;
grant select on public.cenarios_comerciais_aprovados to authenticated;

-- =====================================================================
-- 3. Triggers de imutabilidade - mesmo idioma de
--    impedir_alteracao_vigente_sem_marca/impedir_alteracao_conteudo_snapshot
--    (202608110001), com chave de marca de transação PRÓPRIA (nunca
--    compartilhada com simulacoes_comerciais - os dois fluxos de
--    aprovação são independentes).
-- =====================================================================

create or replace function public.impedir_alteracao_vigente_cenario_comercial_sem_marca()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_marca text;
begin
  v_marca := current_setting('app.aprovacao_cenario_comercial_em_andamento_projeto_id', true);
  if v_marca is null or v_marca is distinct from old.projeto_id::text then
    raise exception 'Alteração de vigente só é permitida dentro da RPC aprovar_cenario_comercial, para o projeto em andamento.';
  end if;
  if old.vigente = false and new.vigente = true then
    raise exception 'Reativação direta de um cenário comercial antigo não é permitida, mesmo com a marca presente.';
  end if;
  return new;
end;
$function$;

comment on function public.impedir_alteracao_vigente_cenario_comercial_sem_marca() is
  'Trava: só aprovar_cenario_comercial pode mudar vigente (via set_config transacional), e nunca reativa um cenário já encerrado. Mesmo idioma de impedir_alteracao_vigente_sem_marca (202608110001), chave de marca própria - nunca compartilhada com simulacoes_comerciais.';

revoke execute on function public.impedir_alteracao_vigente_cenario_comercial_sem_marca() from public, anon, authenticated;

drop trigger if exists cenarios_comerciais_aprovados_impedir_alteracao_vigente on public.cenarios_comerciais_aprovados;
create trigger cenarios_comerciais_aprovados_impedir_alteracao_vigente
  before update of vigente on public.cenarios_comerciais_aprovados
  for each row
  when (old.vigente is distinct from new.vigente)
  execute function public.impedir_alteracao_vigente_cenario_comercial_sem_marca();

create or replace function public.impedir_alteracao_conteudo_cenario_comercial_aprovado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (to_jsonb(old) - 'vigente') is distinct from (to_jsonb(new) - 'vigente') then
    raise exception 'Conteúdo de um cenário comercial aprovado é imutável - só vigente pode mudar, e só pela RPC aprovar_cenario_comercial. Mudanças posteriores no roteiro/recursos/capacidade/convenção/orçamento nunca alteram um snapshot já aprovado - aprove um novo cenário para refleti-las.';
  end if;
  return new;
end;
$function$;

comment on function public.impedir_alteracao_conteudo_cenario_comercial_aprovado() is
  'Imutabilidade total de conteúdo (compara to_jsonb inteiro, cobre qualquer coluna futura automaticamente) - só vigente pode mudar. Mesmo idioma de impedir_alteracao_conteudo_snapshot (202608110001).';

revoke execute on function public.impedir_alteracao_conteudo_cenario_comercial_aprovado() from public, anon, authenticated;

drop trigger if exists cenarios_comerciais_aprovados_impedir_alteracao_conteudo on public.cenarios_comerciais_aprovados;
create trigger cenarios_comerciais_aprovados_impedir_alteracao_conteudo
  before update on public.cenarios_comerciais_aprovados
  for each row
  execute function public.impedir_alteracao_conteudo_cenario_comercial_aprovado();

-- =====================================================================
-- 4. RPC aprovar_cenario_comercial - único caminho de escrita.
--    SECURITY DEFINER, chamável DIRETAMENTE por authenticated (nunca
--    service_role - decisão confirmada com o usuário) - autorização
--    (usuario_e_admin) e validação de tenant (empresa_atual_id) feitas
--    INTEIRAMENTE dentro da função, nunca delegadas a um chamador
--    privilegiado. Ver CONTRATO DE SEGURANÇA no cabeçalho desta
--    migration: esta função valida autenticação/empresa/permissão/forma
--    das datas/coerência das somas - NUNCA reconstrói nem confirma
--    sozinha a previsão operacional (isso é responsabilidade exclusiva
--    da Server Action, que recalcula tudo em TypeScript antes de chamar
--    esta RPC com o resultado já recalculado no servidor).
-- =====================================================================

create or replace function public.aprovar_cenario_comercial(
  p_projeto_id uuid,
  p_tipo_cenario text,
  p_data_solicitada_cliente date,
  p_prazo_proposto date,
  p_custo_tecnico_atual numeric,
  p_custo_negociacao_material numeric,
  p_custo_hora_adicional numeric,
  p_custo_recurso_temporario numeric,
  p_custo_terceirizacao numeric,
  p_valor_comercial_atual_referencia numeric,
  p_snapshot jsonb,
  p_motivo_substituicao text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_projeto_empresa_id uuid;
  v_anterior_id uuid;
  v_diferenca_em_dias integer;
  v_custo_adicional_total numeric;
  v_novo_custo_tecnico numeric;
  v_snapshot_final jsonb;
  v_novo_id uuid;
begin
  if v_empresa_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  if not public.usuario_e_admin() then
    raise exception 'Só administradores podem aprovar um cenário comercial.';
  end if;

  if p_tipo_cenario not in ('atual', 'ajustado') then
    raise exception 'tipo_cenario inválido: % (esperado "atual" ou "ajustado").', p_tipo_cenario;
  end if;

  if p_custo_tecnico_atual < 0 or p_custo_negociacao_material < 0 or p_custo_hora_adicional < 0
     or p_custo_recurso_temporario < 0 or p_custo_terceirizacao < 0 then
    raise exception 'Nenhuma categoria de custo pode ser negativa.';
  end if;

  select empresa_id into v_projeto_empresa_id from public.projetos where id = p_projeto_id;
  if v_projeto_empresa_id is null then
    raise exception 'Projeto % não encontrado.', p_projeto_id;
  end if;
  if v_projeto_empresa_id is distinct from v_empresa_id then
    raise exception 'Projeto % não pertence à empresa do usuário.', p_projeto_id;
  end if;

  -- Datas/somas SÃO verificáveis em SQL - recalculadas aqui, nunca
  -- confiadas a um total pronto vindo do chamador (mesmo que a Server
  -- Action já as tenha calculado do mesmo jeito - defesa em
  -- profundidade, nunca uma segunda fonte de verdade sem checagem).
  v_diferenca_em_dias := p_prazo_proposto - p_data_solicitada_cliente;
  v_custo_adicional_total := p_custo_negociacao_material + p_custo_hora_adicional + p_custo_recurso_temporario + p_custo_terceirizacao;
  v_novo_custo_tecnico := p_custo_tecnico_atual + v_custo_adicional_total;

  if jsonb_typeof(p_snapshot) is distinct from 'object' then
    raise exception 'snapshot precisa ser um objeto JSON.';
  end if;
  if (p_snapshot ->> 'versaoFormato') is distinct from '1' then
    raise exception 'snapshot.versaoFormato precisa ser 1 (versão atual do formato).';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cenarios_comerciais_aprovados:' || p_projeto_id::text, 0));

  select id into v_anterior_id
  from public.cenarios_comerciais_aprovados
  where empresa_id = v_empresa_id and projeto_id = p_projeto_id and vigente = true;

  if v_anterior_id is not null and coalesce(btrim(p_motivo_substituicao), '') = '' then
    raise exception 'Motivo obrigatório para substituir o cenário comercial já vigente deste projeto.';
  end if;

  -- aprovado_por/aprovado_em SEMPRE resolvidos aqui (auth.uid()/now()) -
  -- nunca aceitos de parâmetro. O mesmo par é forçado DENTRO do
  -- snapshot logo abaixo, para o JSON nunca divergir das colunas (ver
  -- CHECK _snapshot_forma_chk) mesmo que a Server Action tenha montado o
  -- snapshot com outro valor.
  v_snapshot_final := p_snapshot || jsonb_build_object('aprovadoPor', auth.uid()::text, 'aprovadoEm', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

  perform set_config('app.aprovacao_cenario_comercial_em_andamento_projeto_id', p_projeto_id::text, true);

  if v_anterior_id is not null then
    update public.cenarios_comerciais_aprovados
    set vigente = false
    where id = v_anterior_id;
  end if;

  insert into public.cenarios_comerciais_aprovados (
    empresa_id, projeto_id, vigente, tipo_cenario, aprovado_por, substituiu_cenario_id, motivo_substituicao,
    data_solicitada_cliente, prazo_proposto, diferenca_em_dias,
    custo_tecnico_atual, custo_negociacao_material, custo_hora_adicional, custo_recurso_temporario, custo_terceirizacao,
    custo_adicional_total, novo_custo_tecnico, valor_comercial_atual_referencia, snapshot, versao_snapshot
  ) values (
    v_empresa_id, p_projeto_id, true, p_tipo_cenario, auth.uid(), v_anterior_id, p_motivo_substituicao,
    p_data_solicitada_cliente, p_prazo_proposto, v_diferenca_em_dias,
    p_custo_tecnico_atual, p_custo_negociacao_material, p_custo_hora_adicional, p_custo_recurso_temporario, p_custo_terceirizacao,
    v_custo_adicional_total, v_novo_custo_tecnico, p_valor_comercial_atual_referencia, v_snapshot_final, 1
  )
  returning id into v_novo_id;

  return v_novo_id;
end;
$function$;

comment on function public.aprovar_cenario_comercial(uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text) is
  'Único caminho de escrita de cenarios_comerciais_aprovados (DEC-007, Fase 8b). SECURITY DEFINER chamável diretamente por authenticated (nunca service_role) - só admin (usuario_e_admin), tenant validado (empresa_atual_id), serializado por projeto (pg_advisory_xact_lock), só 1 vigente por (empresa_id, projeto_id), motivo obrigatório ao substituir, aprovado_por/aprovado_em resolvidos só aqui (auth.uid()/now(), nunca parâmetro) e forçados também dentro do snapshot. Verifica o que é verificável em SQL (tenant/permissão/forma das datas/coerência das somas) - NUNCA reconstrói nem confirma sozinha a previsão operacional (prazo/horas/custo), que só existe calculada em TypeScript pela Server Action chamadora (caminho oficial da aplicação, não o único tecnicamente possível). Não cria OF, não programa nem reserva capacidade no PCP, não aprova o orçamento em si - só registra a decisão comercial.';

revoke execute on function public.aprovar_cenario_comercial(uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text) from public, anon;
grant execute on function public.aprovar_cenario_comercial(uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text) to authenticated;
