-- Entrega 2 do PAD-008 v2.0 (secao 19): distribuicao parcial da carga
-- de uma operacao entre o recurso original e recursos compativeis, na
-- ordem cadastrada, consumindo cada candidato por completo antes de
-- passar ao proximo. Tambem corrige o comprometimento de capacidade
-- (calcular_comprometido_v1 contava qualquer projeto com simulacao
-- aprovada internamente - a regra correta e' que so' pedido real do
-- cliente, confirmado, compromete capacidade).
--
-- Aditiva, mesmo padrao das transicoes anteriores (v1 -> v2 -> v3):
-- NAO remove nem altera aprovar_projeto_com_simulacao_v3 nem
-- calcular_comprometido_v1. Ambas continuam existindo, sem EXECUTE para
-- authenticated (nunca tiveram), como caminho de rollback tecnico.
--
-- Rollout em 3 fases (ver auditoria de 2026-08-02):
--   1) Esta migration (schema apenas) - aditiva, sem risco, nada chama
--      v4/calcular_comprometido_v2 ainda.
--   2) Deploy do codigo com leitura compativel com versao_resultado_motor
--      1 (legado) E 2 (novo) - ainda escrevendo via v3.
--   3) Só depois da fase 2 validada em producao: Server Action passa a
--      chamar aprovar_projeto_com_simulacao_v4 em vez de _v3.
-- Rollback da aplicacao so e' seguro para uma versao >= fase 2 - uma
-- versao anterior a fase 2 nao sabe ler versao_resultado_motor=2 e
-- exibiria incorretamente deficit total para uma distribuicao parcial
-- real.
--
-- APLICACAO NO BANCO REMOTO SOMENTE PELO SQL EDITOR, APOS REVISAO
-- EXPLICITA. NAO UTILIZAR `supabase db push` devido ao historico de
-- migrations antigas dessincronizadas.
--
-- Migration inteira envolvida em transacao explicita - ou tudo e'
-- aplicado (pre-requisito de FK composta, coluna de versao, CHECK novo,
-- tabela filha, trigger de pedido_recebido, calcular_comprometido_v2,
-- RPC v4, grants), ou nada e' aplicado.

begin;

-- =========================================================
-- Regra de comprometimento: pedido_recebido exige simulacao vigente
-- =========================================================
-- "Somente pedido real do cliente com status aprovado consome
-- capacidade da empresa" (auditoria de 2026-08-02). situacao_comercial
-- ja e' o eixo que representa esse fato observado (202607190005) - esta
-- trigger so' impede a inconsistencia de marcar pedido_recebido sem
-- nenhuma Simulacao Comercial vigente aprovada por tras, o que geraria
-- um "pedido real" comprometendo zero hora. Nao cria entidade Pedido,
-- nao implementa PCP - so' protege a regra ja fechada sobre o que ja
-- existe hoje.
--
-- Cobre INSERT e UPDATE. Sem clausula WHEN: Postgres proibe referenciar
-- OLD na WHEN de um trigger que tambem dispara em INSERT (nao ha linha
-- anterior nesse caso) - a checagem de "mudou de fato" mora dentro da
-- funcao, usando TG_OP para so' tocar OLD quando for UPDATE.
create or replace function public.trg_projetos_validar_pedido_recebido()
returns trigger
language plpgsql
as $function$
begin
  if new.situacao_comercial = 'pedido_recebido'
     and (tg_op = 'INSERT' or old.situacao_comercial is distinct from new.situacao_comercial) then
    if not exists (
      select 1 from public.simulacoes_comerciais sc
      where sc.projeto_id = new.id and sc.vigente = true
    ) then
      raise exception
        'situacao_comercial nao pode ser pedido_recebido sem uma Simulacao Comercial vigente aprovada para o projeto % - regra de comprometimento de capacidade.',
        new.id;
    end if;
  end if;
  return new;
end;
$function$;

comment on function public.trg_projetos_validar_pedido_recebido() is
  'Bloqueia projetos.situacao_comercial=pedido_recebido sem uma simulacoes_comerciais vigente para o projeto - protege a regra "so pedido real compromete capacidade" (calcular_comprometido_v2). Nao cria entidade Pedido, nao implementa PCP.';

drop trigger if exists projetos_validar_pedido_recebido on public.projetos;
create trigger projetos_validar_pedido_recebido
  before insert or update of situacao_comercial on public.projetos
  for each row
  execute function public.trg_projetos_validar_pedido_recebido();

-- =========================================================
-- versao_resultado_motor: identificador explicito de formato
-- =========================================================
-- Sem isso, um item novo (Entrega 2) com deficit total (0 linhas
-- filhas) seria indistinguivel de um item legado com deficit total -
-- ambos teriam os 5 campos escalares NULL e deficit=necessario. Fica no
-- ITEM (nao so no cabecalho simulacoes_comerciais) porque precisa
-- participar do CHECK abaixo, e CHECK nao enxerga outra tabela.
-- Default 1 cobre todo o historico existente sem UPDATE em massa.
alter table public.simulacao_comercial_itens
  add column versao_resultado_motor smallint not null default 1
    check (versao_resultado_motor in (1, 2));

comment on column public.simulacao_comercial_itens.versao_resultado_motor is
  '1 = modelo legado (recurso_considerado_id escalar, ate 1 recurso por operacao - v1/v2/v3). 2 = distribuicao parcial (Entrega 2, PAD-008 v2.0 secao 19) - detalhe por recurso em simulacao_comercial_item_distribuicoes, os 5 campos escalares desta linha ficam NULL. Participa do CHECK simulacao_comercial_itens_motivo_consistente_chk para nao deixar os dois formatos ambiguos entre si.';

-- CHECK corrigido: os 3 estados legados agora exigem versao=1
-- explicitamente; o estado novo (4) exige versao=2 e cobre tanto
-- deficit total (0 linhas filhas) quanto distribuicao parcial (1+
-- linhas), unificados - a granularidade por recurso migrou para a
-- tabela filha.
alter table public.simulacao_comercial_itens
  drop constraint simulacao_comercial_itens_motivo_consistente_chk;

alter table public.simulacao_comercial_itens
  add constraint simulacao_comercial_itens_motivo_consistente_chk
  check (
    ( -- estado 1 (legado): deficit total
      versao_resultado_motor = 1
      and recurso_considerado_id is null
      and motivo_consideracao is null
      and capacidade_bruta is null
      and capacidade_efetiva is null
      and capacidade_disponivel is null
      and comprometido is null
      and livre is null
      and deficit = necessario
      and deficit > 0
    )
    or
    ( -- estado 2 (legado): ORIGINAL comportou tudo
      versao_resultado_motor = 1
      and motivo_consideracao = 'ORIGINAL'
      and recurso_considerado_id = recurso_original_id
      and capacidade_bruta is not null
      and capacidade_efetiva is not null
      and capacidade_disponivel is not null
      and comprometido is not null
      and livre is not null
      and deficit = 0
    )
    or
    ( -- estado 3 (legado): COMPATIBILIDADE comportou tudo
      versao_resultado_motor = 1
      and motivo_consideracao = 'COMPATIBILIDADE'
      and recurso_considerado_id is not null
      and recurso_considerado_id <> recurso_original_id
      and capacidade_bruta is not null
      and capacidade_efetiva is not null
      and capacidade_disponivel is not null
      and comprometido is not null
      and livre is not null
      and deficit = 0
    )
    or
    ( -- estado 4 (novo, Entrega 2): distribuicao parcial, 0..N linhas
      -- filhas em simulacao_comercial_item_distribuicoes. Consistencia
      -- aritmetica com as linhas filhas (soma = necessario - deficit)
      -- NAO e verificavel por CHECK (Postgres nao permite subquery
      -- entre tabelas em CHECK) - validada pela RPC antes do INSERT.
      versao_resultado_motor = 2
      and recurso_considerado_id is null
      and motivo_consideracao is null
      and capacidade_bruta is null
      and capacidade_efetiva is null
      and capacidade_disponivel is null
      and comprometido is null
      and livre is null
      and deficit >= 0
      and deficit <= necessario
    )
  );

-- =========================================================
-- Pre-requisito: unique(id, empresa_id), mesmo padrao ja usado para
-- recursos_produtivos em 202607200001 - necessario para a FK composta
-- da tabela filha abaixo garantir tenant isolation estrutural.
-- =========================================================
alter table public.simulacao_comercial_itens
  add constraint simulacao_comercial_itens_id_empresa_uniq unique (id, empresa_id);

-- =========================================================
-- Tabela filha: uma linha por alocacao (operacao x recurso)
-- =========================================================
create table public.simulacao_comercial_item_distribuicoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  simulacao_comercial_item_id uuid not null,
  recurso_id uuid not null,
  ordem_consideracao integer not null,
  origem text not null check (origem in ('ORIGINAL', 'COMPATIBILIDADE')),

  -- Base do calculo no momento da simulacao - nunca recalculada a
  -- partir de cadastros (recursos_produtivos.produtividade,
  -- capacidade_horas_dia etc) que podem mudar depois.
  capacidade_bruta_periodo numeric not null check (capacidade_bruta_periodo >= 0),
  produtividade_considerada numeric not null check (produtividade_considerada > 0 and produtividade_considerada <= 1),
  capacidade_efetiva numeric not null check (capacidade_efetiva >= 0),
  comprometido_inicial numeric not null check (comprometido_inicial >= 0),
  capacidade_disponivel_inicial numeric not null check (capacidade_disponivel_inicial >= 0),

  -- Saldo progressivo desta alocacao especifica, dentro da execucao
  -- sequencial do Motor.
  capacidade_disponivel_antes numeric not null check (capacidade_disponivel_antes >= 0),
  horas_padrao_alocadas numeric not null check (horas_padrao_alocadas > 0),
  horas_maquina_estimadas numeric not null check (horas_maquina_estimadas > 0),
  capacidade_disponivel_depois numeric not null check (capacidade_disponivel_depois >= 0),

  created_at timestamptz not null default now(),

  constraint simulacao_comercial_item_distribuicoes_saldo_coerente
    check (abs(capacidade_disponivel_depois - (capacidade_disponivel_antes - horas_padrao_alocadas)) < 0.000001),
  constraint simulacao_comercial_item_distribuicoes_horas_maquina_coerente
    check (abs(horas_maquina_estimadas - (horas_padrao_alocadas / produtividade_considerada)) < 0.000001),
  constraint simulacao_comercial_item_distribuicoes_capacidade_efetiva_coerente
    check (abs(capacidade_efetiva - (capacidade_bruta_periodo * produtividade_considerada)) < 0.000001),
  constraint simulacao_comercial_item_distribuicoes_disponivel_inicial_coerente
    check (abs(capacidade_disponivel_inicial - greatest(0, capacidade_efetiva - comprometido_inicial)) < 0.000001),

  constraint simulacao_comercial_item_distribuicoes_recurso_unico
    unique (simulacao_comercial_item_id, recurso_id),
  constraint simulacao_comercial_item_distribuicoes_ordem_unica
    unique (simulacao_comercial_item_id, ordem_consideracao),

  -- FK composta: impossivel a distribuicao pertencer a uma empresa
  -- diferente do item ou do recurso que ela referencia - o banco
  -- recusa antes de qualquer logica de aplicacao rodar, mesmo padrao
  -- de recurso_produtivo_compatibilidades (202607200001).
  constraint simulacao_comercial_item_distribuicoes_item_fkey
    foreign key (simulacao_comercial_item_id, empresa_id)
    references public.simulacao_comercial_itens (id, empresa_id),
  constraint simulacao_comercial_item_distribuicoes_recurso_fkey
    foreign key (recurso_id, empresa_id)
    references public.recursos_produtivos (id, empresa_id)
);

comment on table public.simulacao_comercial_item_distribuicoes is
  'Uma linha por fatia de operacao alocada a um recurso (Entrega 2 - distribuicao parcial, PAD-008 v2.0 secao 19). So existe para simulacao_comercial_itens.versao_resultado_motor=2. Consistencia aritmetica com o pai (soma das horas_padrao_alocadas + deficit = necessario) validada pela RPC antes do INSERT, nao por CHECK (Postgres nao permite subquery entre tabelas em CHECK).';
comment on column public.simulacao_comercial_item_distribuicoes.ordem_consideracao is
  'So para persistencia/auditoria - 0 para ORIGINAL, prioridade cadastrada (sempre > 0) para COMPATIBILIDADE. Nao participa da decisao do nucleo (motorAvaliacaoSequencial.ts constroi a ordem explicitamente, sem depender deste valor).';
comment on column public.simulacao_comercial_item_distribuicoes.capacidade_disponivel_antes is
  'Saldo do recurso imediatamente ANTES desta alocacao - igual a capacidade_disponivel_inicial na 1a alocacao do recurso nesta simulacao, ou igual a capacidade_disponivel_depois da alocacao anterior do MESMO recurso nas seguintes.';

create index simulacao_comercial_item_distribuicoes_recurso_idx
  on public.simulacao_comercial_item_distribuicoes (recurso_id);

alter table public.simulacao_comercial_item_distribuicoes enable row level security;

create policy simulacao_comercial_item_distribuicoes_select_tenant
  on public.simulacao_comercial_item_distribuicoes
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

-- Append-only real, mesmo padrao de simulacao_comercial_itens/
-- simulacoes_comerciais - nenhuma policy permissiva de escrita para
-- authenticated. A unica gravacao possivel e via aprovar_projeto_com_simulacao_v4
-- (SECURITY DEFINER).
revoke all on public.simulacao_comercial_item_distribuicoes from public, anon, authenticated;
grant select on public.simulacao_comercial_item_distribuicoes to authenticated;

-- =========================================================
-- calcular_comprometido_v2: corrige forma (soma por recurso quando uma
-- operacao tem N recursos) E regra de negocio (so pedido_recebido
-- compromete capacidade) na mesma function - nao faz sentido publicar
-- uma v2 carregando conscientemente a regra errada da v1.
-- =========================================================
-- Interface CONGELADA (recurso_produtivo_id, projeto_excluido_id) ->
-- numeric, igual a v1. UNIAO obrigatoria entre linhas legadas (sem
-- filho na tabela nova) e linhas novas (com filho) - sem isso, todo o
-- comprometido de simulacoes aprovadas ANTES desta entrega some do
-- calculo no dia do deploy.
create or replace function public.calcular_comprometido_v2(
  p_recurso_produtivo_id uuid,
  p_projeto_excluido_id uuid
)
returns numeric
language sql
stable
as $function$
  with legado as (
    select sci.necessario as horas
    from public.simulacao_comercial_itens sci
    join public.simulacoes_comerciais sc on sc.id = sci.simulacao_comercial_id
    join public.projetos p on p.id = sc.projeto_id
    where sci.versao_resultado_motor = 1
      and sci.recurso_considerado_id = p_recurso_produtivo_id
      and sc.vigente = true
      and sc.projeto_id <> p_projeto_excluido_id
      and sc.empresa_id = public.empresa_atual_id()
      and p.situacao_comercial = 'pedido_recebido'
  ),
  novo as (
    select d.horas_padrao_alocadas as horas
    from public.simulacao_comercial_item_distribuicoes d
    join public.simulacao_comercial_itens sci on sci.id = d.simulacao_comercial_item_id
    join public.simulacoes_comerciais sc on sc.id = sci.simulacao_comercial_id
    join public.projetos p on p.id = sc.projeto_id
    where sci.versao_resultado_motor = 2
      and d.recurso_id = p_recurso_produtivo_id
      and sc.vigente = true
      and sc.projeto_id <> p_projeto_excluido_id
      and sc.empresa_id = public.empresa_atual_id()
      and p.situacao_comercial = 'pedido_recebido'
  )
  select coalesce((select sum(horas) from legado), 0) + coalesce((select sum(horas) from novo), 0);
$function$;

comment on function public.calcular_comprometido_v2(uuid, uuid) is
  'Substitui calcular_comprometido_v1 (preservada, sem alteracao, como caminho de rollback): soma horas comprometidas por OUTROS projetos no recurso informado, considerando snapshots legados (versao_resultado_motor=1) e novos (versao_resultado_motor=2, tabela filha). So conta projetos com situacao_comercial=pedido_recebido - aprovacao interna da Simulacao Comercial (projetos.status=aprovado) e decisao do orcamentista, nao confirmacao do cliente, e nunca compromete capacidade sozinha (auditoria de 2026-08-02).';

revoke execute on function public.calcular_comprometido_v2(uuid, uuid) from public;
revoke execute on function public.calcular_comprometido_v2(uuid, uuid) from anon;
grant execute on function public.calcular_comprometido_v2(uuid, uuid) to authenticated;

-- =========================================================
-- aprovar_projeto_com_simulacao_v4: distribuicao parcial
-- =========================================================
create or replace function public.aprovar_projeto_com_simulacao_v4(
  p_aprovado_por uuid,
  p_projeto_id uuid,
  p_cenario_demanda text,
  p_modo_producao text,
  p_data_necessidade date,
  p_margem_seguranca_dias integer,
  p_data_prevista_aprovacao_pedido date,
  p_data_chegada_prevista date,
  p_janela_inicio date,
  p_janela_fim date,
  p_itens jsonb,
  p_chave_idempotencia text,
  p_hash_solicitacao text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_projeto_empresa_id uuid;
  v_snapshot_id uuid;
  v_hash_existente text;
  v_item jsonb;
  v_dist jsonb;
  v_bom_operacao_empresa_id uuid;
  v_recurso_original_empresa_id uuid;
  v_recurso_empresa_id uuid;
  v_recurso_key text;
  v_recursos_vistos_no_item text[];
  v_base_por_recurso jsonb := '{}'::jsonb;
  v_base_existente jsonb;
  v_saldo_esperado numeric;
  v_soma_alocada numeric;
  v_item_id uuid;
begin
  if p_aprovado_por is null then
    raise exception 'p_aprovado_por e obrigatorio - deve vir de auth.getUser() no servidor, nunca de parametro do navegador.';
  end if;

  if p_chave_idempotencia is null or btrim(p_chave_idempotencia) = '' then
    raise exception 'p_chave_idempotencia e obrigatoria.';
  end if;

  if p_hash_solicitacao is null or btrim(p_hash_solicitacao) = '' then
    raise exception 'p_hash_solicitacao e obrigatorio.';
  end if;

  if p_data_prevista_aprovacao_pedido is null then
    raise exception 'p_data_prevista_aprovacao_pedido e obrigatoria (PAD-008 v2.0 secao 17).';
  end if;

  if p_data_chegada_prevista is null then
    raise exception 'p_data_chegada_prevista e obrigatoria - deve vir do recalculo autoritativo no servidor.';
  end if;

  if p_janela_inicio is null or p_janela_fim is null then
    raise exception 'p_janela_inicio e p_janela_fim sao obrigatorios.';
  end if;

  if p_janela_fim < p_janela_inicio then
    raise exception 'p_janela_fim (%) nao pode ser anterior a p_janela_inicio (%).', p_janela_fim, p_janela_inicio;
  end if;

  select empresa_id into v_empresa_id
  from public.usuarios
  where id = p_aprovado_por;

  if v_empresa_id is null then
    raise exception 'Usuario aprovador % nao encontrado em public.usuarios.', p_aprovado_por;
  end if;

  -- Checagem antecipada de idempotencia - so' otimizacao, a protecao
  -- real esta no INSERT ... ON CONFLICT mais abaixo.
  select id, hash_solicitacao into v_snapshot_id, v_hash_existente
  from public.simulacoes_comerciais
  where empresa_id = v_empresa_id
    and chave_idempotencia = p_chave_idempotencia;

  if v_snapshot_id is not null then
    if v_hash_existente is distinct from p_hash_solicitacao then
      raise exception 'Conflito de idempotencia: chave % ja foi usada para uma solicitacao com conteudo diferente.', p_chave_idempotencia;
    end if;

    return v_snapshot_id;
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'p_itens nao pode ser vazio - uma simulacao sem nenhum recurso nao e valida.';
  end if;

  select empresa_id into v_projeto_empresa_id
  from public.projetos
  where id = p_projeto_id;

  if v_projeto_empresa_id is null then
    raise exception 'Projeto % nao encontrado.', p_projeto_id;
  end if;

  if v_projeto_empresa_id is distinct from v_empresa_id then
    raise exception 'Projeto % nao pertence a empresa do aprovador.', p_projeto_id;
  end if;

  -- =========================================================
  -- Validacao por item + cadeia matematica completa das distribuicoes.
  -- v_base_por_recurso acumula, POR RECURSO, a base de calculo (bruta,
  -- produtividade, efetiva, comprometido inicial, disponivel inicial) e
  -- o saldo corrente - unico para a simulacao INTEIRA, nao reiniciado
  -- por item, espelhando o capacidadeRemanescente compartilhado do
  -- nucleo TypeScript.
  -- =========================================================
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    if not (v_item ? 'bom_operacao_id') or not (v_item ? 'recurso_original_id')
       or not (v_item ? 'necessario') or not (v_item ? 'deficit') or not (v_item ? 'distribuicoes') then
      raise exception 'Item de simulacao incompleto - bom_operacao_id, recurso_original_id, necessario, deficit e distribuicoes sao obrigatorios: %', v_item;
    end if;

    select empresa_id into v_bom_operacao_empresa_id
    from public.bom_operacoes
    where id = (nullif(v_item->>'bom_operacao_id', ''))::uuid;

    if v_bom_operacao_empresa_id is null then
      raise exception 'Operacao de roteiro % nao encontrada.', v_item->>'bom_operacao_id';
    end if;

    if v_bom_operacao_empresa_id <> v_empresa_id then
      raise exception 'Operacao de roteiro % nao pertence a empresa do aprovador.', v_item->>'bom_operacao_id';
    end if;

    select empresa_id into v_recurso_original_empresa_id
    from public.recursos_produtivos
    where id = (nullif(v_item->>'recurso_original_id', ''))::uuid;

    if v_recurso_original_empresa_id is null then
      raise exception 'Recurso original % nao encontrado.', v_item->>'recurso_original_id';
    end if;

    if v_recurso_original_empresa_id <> v_empresa_id then
      raise exception 'Recurso original % nao pertence a empresa do aprovador.', v_item->>'recurso_original_id';
    end if;

    if (nullif(v_item->>'necessario', ''))::numeric < 0 or (nullif(v_item->>'deficit', ''))::numeric < 0 then
      raise exception 'Item de simulacao com necessario/deficit negativo na operacao %: %', v_item->>'bom_operacao_id', v_item;
    end if;

    if (nullif(v_item->>'deficit', ''))::numeric > (nullif(v_item->>'necessario', ''))::numeric then
      raise exception 'deficit maior que necessario na operacao %: %', v_item->>'bom_operacao_id', v_item;
    end if;

    if jsonb_typeof(v_item->'distribuicoes') <> 'array' then
      raise exception 'distribuicoes precisa ser um array na operacao %.', v_item->>'bom_operacao_id';
    end if;

    v_soma_alocada := 0;
    v_recursos_vistos_no_item := array[]::text[];

    for v_dist in select * from jsonb_array_elements(v_item->'distribuicoes')
    loop
      if not (v_dist ? 'recurso_id') or not (v_dist ? 'origem')
         or not (v_dist ? 'capacidade_bruta_periodo') or not (v_dist ? 'produtividade_considerada')
         or not (v_dist ? 'capacidade_efetiva') or not (v_dist ? 'comprometido_inicial')
         or not (v_dist ? 'capacidade_disponivel_inicial') or not (v_dist ? 'capacidade_disponivel_antes')
         or not (v_dist ? 'horas_padrao_alocadas') or not (v_dist ? 'horas_maquina_estimadas')
         or not (v_dist ? 'capacidade_disponivel_depois') then
        raise exception 'Distribuicao incompleta na operacao %: %', v_item->>'bom_operacao_id', v_dist;
      end if;

      v_recurso_key := v_dist->>'recurso_id';

      if v_recurso_key = any(v_recursos_vistos_no_item) then
        raise exception 'Recurso % duplicado entre as distribuicoes da operacao % - corrupcao de dado.', v_recurso_key, v_item->>'bom_operacao_id';
      end if;
      v_recursos_vistos_no_item := array_append(v_recursos_vistos_no_item, v_recurso_key);

      if (v_dist->>'origem') not in ('ORIGINAL', 'COMPATIBILIDADE') then
        raise exception 'origem invalida (%) na distribuicao do recurso % - esperado ORIGINAL ou COMPATIBILIDADE.', v_dist->>'origem', v_recurso_key;
      end if;

      -- ordem_consideracao: 0 exatamente para ORIGINAL, > 0 exatamente
      -- para COMPATIBILIDADE (prioridade cadastrada, sempre > 0 por
      -- recurso_produtivo_compatibilidades_prioridade_check).
      if v_dist->>'origem' = 'ORIGINAL' and (nullif(v_dist->>'ordem_consideracao', ''))::integer <> 0 then
        raise exception 'ordem_consideracao precisa ser 0 para origem ORIGINAL no recurso %.', v_recurso_key;
      end if;

      if v_dist->>'origem' = 'COMPATIBILIDADE' and (nullif(v_dist->>'ordem_consideracao', ''))::integer <= 0 then
        raise exception 'ordem_consideracao precisa ser > 0 para origem COMPATIBILIDADE no recurso %.', v_recurso_key;
      end if;

      select empresa_id into v_recurso_empresa_id
      from public.recursos_produtivos
      where id = (nullif(v_recurso_key, ''))::uuid;

      if v_recurso_empresa_id is null then
        raise exception 'Recurso % nao encontrado.', v_recurso_key;
      end if;

      if v_recurso_empresa_id <> v_empresa_id then
        raise exception 'Recurso % nao pertence a empresa do aprovador.', v_recurso_key;
      end if;

      if (nullif(v_dist->>'produtividade_considerada', ''))::numeric <= 0
         or (nullif(v_dist->>'produtividade_considerada', ''))::numeric > 1 then
        raise exception 'produtividade_considerada fora da faixa (0,1] para o recurso % - mesma faixa do cadastro (recursos_produtivos.produtividade).', v_recurso_key;
      end if;

      if (nullif(v_dist->>'horas_padrao_alocadas', ''))::numeric <= 0 then
        raise exception 'horas_padrao_alocadas precisa ser positiva para o recurso %.', v_recurso_key;
      end if;

      if (nullif(v_dist->>'capacidade_bruta_periodo', ''))::numeric < 0
         or (nullif(v_dist->>'capacidade_efetiva', ''))::numeric < 0
         or (nullif(v_dist->>'comprometido_inicial', ''))::numeric < 0
         or (nullif(v_dist->>'capacidade_disponivel_inicial', ''))::numeric < 0
         or (nullif(v_dist->>'capacidade_disponivel_antes', ''))::numeric < 0
         or (nullif(v_dist->>'capacidade_disponivel_depois', ''))::numeric < 0 then
        raise exception 'Distribuicao do recurso % com valor negativo.', v_recurso_key;
      end if;

      -- capacidade efetiva = bruta x produtividade
      if abs((v_dist->>'capacidade_efetiva')::numeric
           - (v_dist->>'capacidade_bruta_periodo')::numeric * (v_dist->>'produtividade_considerada')::numeric) > 0.000001 then
        raise exception 'capacidade_efetiva incoerente com capacidade_bruta_periodo x produtividade para o recurso %.', v_recurso_key;
      end if;

      -- capacidade disponivel inicial = max(0, efetiva - comprometido)
      if abs((v_dist->>'capacidade_disponivel_inicial')::numeric
           - greatest(0, (v_dist->>'capacidade_efetiva')::numeric - (v_dist->>'comprometido_inicial')::numeric)) > 0.000001 then
        raise exception 'capacidade_disponivel_inicial incoerente para o recurso %.', v_recurso_key;
      end if;

      if v_base_por_recurso ? v_recurso_key then
        v_base_existente := v_base_por_recurso -> v_recurso_key;

        -- 2a+ aparicao do MESMO recurso nesta simulacao: a base inteira
        -- (nao so o saldo) precisa ser identica a 1a aparicao - senao
        -- o snapshot fica contraditorio (mesmo recurso, mesmo periodo,
        -- "capacidades" diferentes em linhas diferentes).
        if abs((v_dist->>'capacidade_bruta_periodo')::numeric - (v_base_existente->>'capacidade_bruta_periodo')::numeric) > 0.000001
        or abs((v_dist->>'produtividade_considerada')::numeric - (v_base_existente->>'produtividade_considerada')::numeric) > 0.000001
        or abs((v_dist->>'capacidade_efetiva')::numeric - (v_base_existente->>'capacidade_efetiva')::numeric) > 0.000001
        or abs((v_dist->>'comprometido_inicial')::numeric - (v_base_existente->>'comprometido_inicial')::numeric) > 0.000001
        or abs((v_dist->>'capacidade_disponivel_inicial')::numeric - (v_base_existente->>'capacidade_disponivel_inicial')::numeric) > 0.000001
        then
          raise exception
            'Base de calculo do recurso % mudou entre alocacoes da mesma simulacao - capacidade bruta/produtividade/efetiva/comprometido/disponivel inicial devem ser identicos toda vez que o mesmo recurso aparece.',
            v_recurso_key;
        end if;

        v_saldo_esperado := (v_base_existente->>'saldo_atual')::numeric;
      else
        v_saldo_esperado := (v_dist->>'capacidade_disponivel_inicial')::numeric;
      end if;

      if abs((v_dist->>'capacidade_disponivel_antes')::numeric - v_saldo_esperado) > 0.000001 then
        raise exception
          'capacidade_disponivel_antes nao bate com o saldo acumulado do recurso % - capacidade artificial entre operacoes.',
          v_recurso_key;
      end if;

      if abs((v_dist->>'capacidade_disponivel_depois')::numeric
           - ((v_dist->>'capacidade_disponivel_antes')::numeric - (v_dist->>'horas_padrao_alocadas')::numeric)) > 0.000001 then
        raise exception 'Saldo apos alocacao incoerente para o recurso %.', v_recurso_key;
      end if;

      if abs((v_dist->>'horas_maquina_estimadas')::numeric
           - ((v_dist->>'horas_padrao_alocadas')::numeric / (v_dist->>'produtividade_considerada')::numeric)) > 0.000001 then
        raise exception 'Horas de maquina incoerentes para o recurso %.', v_recurso_key;
      end if;

      v_base_por_recurso := jsonb_set(
        v_base_por_recurso, array[v_recurso_key],
        jsonb_build_object(
          'capacidade_bruta_periodo', (v_dist->>'capacidade_bruta_periodo')::numeric,
          'produtividade_considerada', (v_dist->>'produtividade_considerada')::numeric,
          'capacidade_efetiva', (v_dist->>'capacidade_efetiva')::numeric,
          'comprometido_inicial', (v_dist->>'comprometido_inicial')::numeric,
          'capacidade_disponivel_inicial', (v_dist->>'capacidade_disponivel_inicial')::numeric,
          'saldo_atual', (v_dist->>'capacidade_disponivel_depois')::numeric
        )
      );

      v_soma_alocada := v_soma_alocada + (v_dist->>'horas_padrao_alocadas')::numeric;
    end loop;

    if abs(v_soma_alocada + (v_item->>'deficit')::numeric - (v_item->>'necessario')::numeric) > 0.000001 then
      raise exception 'Soma das distribuicoes + deficit diferente de necessario para a operacao %.', v_item->>'bom_operacao_id';
    end if;
  end loop;

  -- =========================================================
  -- Insercao atomica com tratamento de conflito - mesma logica da v3.
  -- =========================================================
  insert into public.simulacoes_comerciais (
    empresa_id, projeto_id, cenario_demanda, modo_producao, data_necessidade,
    margem_seguranca_dias, data_prevista_aprovacao_pedido, data_chegada_prevista,
    janela_inicio, janela_fim, aprovado_por,
    chave_idempotencia, hash_solicitacao, vigente
  )
  values (
    v_empresa_id, p_projeto_id, p_cenario_demanda, p_modo_producao, p_data_necessidade,
    p_margem_seguranca_dias, p_data_prevista_aprovacao_pedido, p_data_chegada_prevista,
    p_janela_inicio, p_janela_fim, p_aprovado_por,
    p_chave_idempotencia, p_hash_solicitacao, false
  )
  on conflict (empresa_id, chave_idempotencia) where chave_idempotencia is not null
  do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select id, hash_solicitacao into v_snapshot_id, v_hash_existente
    from public.simulacoes_comerciais
    where empresa_id = v_empresa_id
      and chave_idempotencia = p_chave_idempotencia;

    if v_snapshot_id is null then
      raise exception 'Falha ao localizar snapshot apos conflito de insercao para chave %.', p_chave_idempotencia;
    end if;

    if v_hash_existente is distinct from p_hash_solicitacao then
      raise exception 'Conflito de idempotencia: chave % ja foi usada para uma solicitacao com conteudo diferente.', p_chave_idempotencia;
    end if;

    return v_snapshot_id;
  end if;

  update public.simulacoes_comerciais
  set vigente = false
  where projeto_id = p_projeto_id
    and vigente = true;

  update public.simulacoes_comerciais
  set vigente = true
  where id = v_snapshot_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into public.simulacao_comercial_itens (
      empresa_id, simulacao_comercial_id, versao_resultado_motor,
      bom_operacao_id, recurso_original_id,
      necessario, deficit
    )
    values (
      v_empresa_id, v_snapshot_id, 2,
      (nullif(v_item->>'bom_operacao_id', ''))::uuid,
      (nullif(v_item->>'recurso_original_id', ''))::uuid,
      (nullif(v_item->>'necessario', ''))::numeric,
      (nullif(v_item->>'deficit', ''))::numeric
    )
    returning id into v_item_id;

    for v_dist in select * from jsonb_array_elements(v_item->'distribuicoes')
    loop
      insert into public.simulacao_comercial_item_distribuicoes (
        empresa_id, simulacao_comercial_item_id, recurso_id, ordem_consideracao, origem,
        capacidade_bruta_periodo, produtividade_considerada, capacidade_efetiva,
        comprometido_inicial, capacidade_disponivel_inicial,
        capacidade_disponivel_antes, horas_padrao_alocadas, horas_maquina_estimadas,
        capacidade_disponivel_depois
      )
      values (
        v_empresa_id, v_item_id, (nullif(v_dist->>'recurso_id', ''))::uuid,
        (nullif(v_dist->>'ordem_consideracao', ''))::integer,
        v_dist->>'origem',
        (nullif(v_dist->>'capacidade_bruta_periodo', ''))::numeric,
        (nullif(v_dist->>'produtividade_considerada', ''))::numeric,
        (nullif(v_dist->>'capacidade_efetiva', ''))::numeric,
        (nullif(v_dist->>'comprometido_inicial', ''))::numeric,
        (nullif(v_dist->>'capacidade_disponivel_inicial', ''))::numeric,
        (nullif(v_dist->>'capacidade_disponivel_antes', ''))::numeric,
        (nullif(v_dist->>'horas_padrao_alocadas', ''))::numeric,
        (nullif(v_dist->>'horas_maquina_estimadas', ''))::numeric,
        (nullif(v_dist->>'capacidade_disponivel_depois', ''))::numeric
      );
    end loop;
  end loop;

  perform set_config('app.aprovacao_via_function', 'true', true);

  update public.projetos
  set status = 'aprovado'
  where id = p_projeto_id;

  return v_snapshot_id;
end;
$function$;

comment on function public.aprovar_projeto_com_simulacao_v4(uuid, uuid, text, text, date, integer, date, date, date, date, jsonb, text, text) is
  'Versao 4 da aprovacao da Simulacao Comercial (PAD-008 v2.0, secao 19 - Entrega 2, distribuicao parcial) - so chamavel por service_role. Aditiva sobre a v3, que permanece intacta como caminho de rollback. p_itens agora traz um array aninhado "distribuicoes" por operacao (0..N recursos participantes, em vez de um unico recurso_considerado_id escalar). Grava versao_resultado_motor=2 nos itens e popula simulacao_comercial_item_distribuicoes. Valida a cadeia matematica completa antes de persistir (capacidade efetiva = bruta x produtividade; disponivel inicial = max(0, efetiva - comprometido); saldo antes/depois coerente e continuo por recurso ao longo de toda a simulacao; base de calculo identica em toda aparicao do mesmo recurso; soma das alocacoes + deficit = necessario), com tolerancia 0.000001. Mesma resolucao de empresa, mesma idempotencia por (empresa_id, chave_idempotencia, hash_solicitacao) da v3. Nao recalcula os valores recebidos a partir de cadastros atuais - a garantia de que vieram de uma execucao real e responsabilidade de quem chama esta function (Server Action, que recalcula no servidor antes de chamar).';

revoke execute on function public.aprovar_projeto_com_simulacao_v4(uuid, uuid, text, text, date, integer, date, date, date, date, jsonb, text, text) from public;
revoke execute on function public.aprovar_projeto_com_simulacao_v4(uuid, uuid, text, text, date, integer, date, date, date, date, jsonb, text, text) from anon;
revoke execute on function public.aprovar_projeto_com_simulacao_v4(uuid, uuid, text, text, date, integer, date, date, date, date, jsonb, text, text) from authenticated;
grant execute on function public.aprovar_projeto_com_simulacao_v4(uuid, uuid, text, text, date, integer, date, date, date, date, jsonb, text, text) to service_role;

commit;
