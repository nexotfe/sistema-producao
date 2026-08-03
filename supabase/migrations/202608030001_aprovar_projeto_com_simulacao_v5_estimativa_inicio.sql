-- Entrega 3 do PAD-008 v2.1 (secao 20 - Calculador Reverso / Data de
-- Inicio Necessaria). Persiste a Estimativa de Inicio Necessario
-- calculada no preview (Fase 3, ja validada por E2E manual contra o
-- projeto de teste 260010/ENIFER) - so os 3 estados comerciais
-- persistiveis (viavel, viavel_no_limite, janela_insuficiente).
-- dados_insuficientes/horizonte_tecnico_excedido SAO ESTADOS TECNICOS
-- QUE BLOQUEIAM A APROVACAO NO CLIENTE E NA SERVER ACTION - nunca
-- deveriam alcancar esta RPC; a validacao abaixo e uma segunda linha de
-- defesa, nao a primeira.
--
-- Aditiva, mesmo padrao das transicoes anteriores (v1 -> v2 -> v3 -> v4):
-- NAO remove nem altera aprovar_projeto_com_simulacao_v4. A v4 continua
-- existindo, sem EXECUTE para authenticated (nunca teve), como caminho
-- de rollback. As 4 colunas novas sao NULLABLE - v4 continua inserindo
-- normalmente, com esses 4 campos implicitamente NULL (satisfaz o ramo
-- "legado" da constraint abaixo) - rollback de aplicacao (reverter o
-- codigo para chamar v4) nao exige nenhuma acao no banco.
--
-- Rollout em 4 fases (mesmo espirito de 202608020001):
--   1) Esta migration (schema + RPC v5) - aditiva, sem risco, nada
--      chama v5 ainda.
--   2) Verificacao read-only.
--   3) Server Action passa a chamar aprovar_projeto_com_simulacao_v5 em
--      vez de _v4, e o hash de idempotencia (calculado em TypeScript,
--      orquestrarAprovacaoAutoritativa.ts) passa a incluir os 4 campos
--      novos, recalculados no servidor.
--   4) E2E final com escrita real.
--
-- APLICACAO NO BANCO REMOTO SOMENTE PELO SQL EDITOR, APOS REVISAO
-- EXPLICITA. NAO UTILIZAR `supabase db push` devido ao historico de
-- migrations antigas dessincronizadas (TROUBLESHOOTING.md #3).
--
-- Migration inteira envolvida em transacao explicita - ou tudo e
-- aplicado (colunas, constraint, RPC v5, grants), ou nada e aplicado.

begin;

-- =========================================================
-- Colunas novas em simulacoes_comerciais - todas NULLABLE
-- =========================================================
alter table public.simulacoes_comerciais
  add column estimativa_inicio_necessario date,
  add column estimativa_estado text,
  add column estimativa_metodo_versao smallint,
  add column folga_dias_produtivos integer;

comment on column public.simulacoes_comerciais.estimativa_inicio_necessario is
  'D* - a data em que a producao precisaria comecar para o roteiro caber entre ela e o Prazo Interno (janela_fim), sem nenhum deficit (PAD-008 v2.1 secao 20, Calculador Reverso). Calculada pela mesma busca binaria/Motor do preview (estimarInicioNecessario.ts), nunca digitada. Nunca posterior a janela_fim (buscarMaiorIndiceViavel so escolhe indices dentro de P, limitada a [floorDate, prazoInterno]) - ver constraint simulacoes_comerciais_estimativa_coerente_chk. NULL em snapshots anteriores a esta migration (v1-v4) - feature nao existia.';

comment on column public.simulacoes_comerciais.estimativa_estado is
  'Um de: viavel, viavel_no_limite, janela_insuficiente - os 3 estados comerciais persistiveis do Calculador Reverso (PAD-008 v2.1 secao 20). dados_insuficientes e horizonte_tecnico_excedido sao estados TECNICOS que bloqueiam a aprovacao antes de chegar aqui (cliente e Server Action) - nunca aparecem nesta coluna; a constraint abaixo rejeita qualquer INSERT que tente. NULL em snapshots anteriores a esta migration.';

comment on column public.simulacoes_comerciais.estimativa_metodo_versao is
  'Versao do algoritmo de calculo da estimativa (ESTIMATIVA_METODO_VERSAO em estimarInicioNecessario.ts) - existe para uma evolucao futura do metodo nao confundir a leitura de snapshots calculados por uma versao anterior. A coluna aceita qualquer valor positivo (evolucao futura sem exigir nova migration de schema); cada versao da RPC (aprovar_projeto_com_simulacao_v5, v6...) so aceita a versao do metodo que ela propria implementa - v5 so aceita 1. NULL em snapshots anteriores a esta migration.';

comment on column public.simulacoes_comerciais.folga_dias_produtivos is
  'Distancia produtiva com sinal entre janela_inicio (Data de Disponibilidade para Producao) e estimativa_inicio_necessario (D*) - positivo = folga (viavel), zero = exatamente no limite (viavel_no_limite), negativo = insuficiencia, em dias produtivos (janela_insuficiente). NULL em snapshots anteriores a esta migration.';

-- =========================================================
-- Constraint de coerencia - os 4 unicos formatos validos:
-- (a) snapshot legado (v1-v4): os 4 campos NULL;
-- (b) viavel: campos presentes, folga > 0, janela_inicio < estimativa, estimativa <= janela_fim;
-- (c) viavel_no_limite: campos presentes, folga = 0, janela_inicio = estimativa, estimativa <= janela_fim;
-- (d) janela_insuficiente: campos presentes, folga < 0, janela_inicio > estimativa, estimativa <= janela_fim.
-- Qualquer outra combinacao (incluindo estimativa_estado = 'dados_insuficientes'
-- ou 'horizonte_tecnico_excedido', folga com sinal incoerente com o
-- estado, data incoerente com a folga, ou estimativa posterior ao Prazo
-- Interno) e REJEITADA pelo banco - defesa em profundidade, independente
-- da RPC ja validar o mesmo antes.
--
-- A expressao inteira (os 4 ramos combinados por "or") e envolvida em
-- "is true": no Postgres, um CHECK cujo resultado e NULL (nao FALSE) e
-- silenciosamente aceito - qualquer coluna NULL onde nao deveria estar
-- (ex.: folga_dias_produtivos nulo com estimativa_estado='viavel_no_limite')
-- faria um ramo inteiro avaliar para NULL em vez de FALSE, e esse NULL
-- passaria despercebido pelo "or" dos outros ramos. "(...) is true"
-- converte esse NULL em FALSE explicitamente - so TRUE literal e aceito.
-- Cada ramo tambem tem seus proprios "is not null" explicitos (defesa
-- redundante, independente do "is true" externo).
-- =========================================================
alter table public.simulacoes_comerciais
  add constraint simulacoes_comerciais_estimativa_coerente_chk
  check (
    (
      ( -- (a) legado - antes desta migration, feature nao existia
        estimativa_inicio_necessario is null
        and estimativa_estado is null
        and estimativa_metodo_versao is null
        and folga_dias_produtivos is null
      )
      or
      ( -- (b) viavel - material disponivel ANTES do inicio necessario,
        -- D* nunca posterior ao Prazo Interno (janela_fim)
        estimativa_estado = 'viavel'
        and estimativa_inicio_necessario is not null
        and estimativa_metodo_versao is not null
        and estimativa_metodo_versao > 0
        and folga_dias_produtivos is not null
        and folga_dias_produtivos > 0
        and janela_inicio is not null
        and janela_fim is not null
        and janela_inicio < estimativa_inicio_necessario
        and estimativa_inicio_necessario <= janela_fim
      )
      or
      ( -- (c) viavel_no_limite - material disponivel EXATAMENTE no inicio necessario
        estimativa_estado = 'viavel_no_limite'
        and estimativa_inicio_necessario is not null
        and estimativa_metodo_versao is not null
        and estimativa_metodo_versao > 0
        and folga_dias_produtivos is not null
        and folga_dias_produtivos = 0
        and janela_inicio is not null
        and janela_fim is not null
        and janela_inicio = estimativa_inicio_necessario
        and estimativa_inicio_necessario <= janela_fim
      )
      or
      ( -- (d) janela_insuficiente - material disponivel DEPOIS do inicio necessario
        estimativa_estado = 'janela_insuficiente'
        and estimativa_inicio_necessario is not null
        and estimativa_metodo_versao is not null
        and estimativa_metodo_versao > 0
        and folga_dias_produtivos is not null
        and folga_dias_produtivos < 0
        and janela_inicio is not null
        and janela_fim is not null
        and janela_inicio > estimativa_inicio_necessario
        and estimativa_inicio_necessario <= janela_fim
      )
    ) is true
  );

-- =========================================================
-- aprovar_projeto_com_simulacao_v5: adiciona a Estimativa de Inicio
-- Necessario ao snapshot - corpo identico ao da v4 (nenhuma validacao
-- existente foi reescrita), com os acrescimos comentados "NOVO NA V5".
-- =========================================================
create or replace function public.aprovar_projeto_com_simulacao_v5(
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
  p_estimativa_inicio_necessario date,   -- NOVO NA V5
  p_estimativa_estado text,              -- NOVO NA V5
  p_estimativa_metodo_versao smallint,   -- NOVO NA V5
  p_folga_dias_produtivos integer,       -- NOVO NA V5
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
    raise exception 'p_data_prevista_aprovacao_pedido e obrigatoria (PAD-008 v2.1 secao 17).';
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

  -- ===== NOVO NA V5: obrigatoriedade e coerencia da estimativa =====
  if p_estimativa_estado is null or btrim(p_estimativa_estado) = '' then
    raise exception 'p_estimativa_estado e obrigatorio - a aprovacao via v5 exige uma Estimativa de Inicio Necessario ja calculada (estados tecnicos dados_insuficientes/horizonte_tecnico_excedido bloqueiam a aprovacao antes do cliente chegar aqui).';
  end if;

  if p_estimativa_estado not in ('viavel', 'viavel_no_limite', 'janela_insuficiente') then
    raise exception 'p_estimativa_estado invalido (%) - esperado viavel, viavel_no_limite ou janela_insuficiente (dados_insuficientes/horizonte_tecnico_excedido nunca sao persistidos).', p_estimativa_estado;
  end if;

  if p_estimativa_inicio_necessario is null then
    raise exception 'p_estimativa_inicio_necessario e obrigatorio.';
  end if;

  -- Esta versao da RPC (v5) so reconhece a versao 1 do metodo de
  -- calculo - diferente da COLUNA (estimativa_metodo_versao > 0 no
  -- CHECK), que fica aberta para versoes futuras do metodo sem exigir
  -- nova migration a cada evolucao do algoritmo. Cada versao da RPC so
  -- aceita a versao do metodo que ela propria implementa - uma v6
  -- futura, se o algoritmo mudar, aceitaria 2, nunca 1 nem qualquer
  -- positivo.
  if p_estimativa_metodo_versao is null or p_estimativa_metodo_versao <> 1 then
    raise exception 'p_estimativa_metodo_versao invalido (%) - esta versao da RPC (v5) so reconhece a versao 1 do metodo de calculo (ESTIMATIVA_METODO_VERSAO em estimarInicioNecessario.ts).', p_estimativa_metodo_versao;
  end if;

  if p_folga_dias_produtivos is null then
    raise exception 'p_folga_dias_produtivos e obrigatorio.';
  end if;

  -- D* nunca pode ser posterior ao Prazo Interno - a busca binaria
  -- (buscarMaiorIndiceViavel) so escolhe indices dentro de P, que e
  -- limitada a [floorDate, prazoInterno]; um p_estimativa_inicio_necessario
  -- > p_janela_fim so pode vir de um cliente adulterado ou de um bug -
  -- rejeitado aqui, antes de chegar perto do CHECK da tabela.
  if p_estimativa_inicio_necessario > p_janela_fim then
    raise exception 'p_estimativa_inicio_necessario (%) nao pode ser posterior a p_janela_fim/Prazo Interno (%).', p_estimativa_inicio_necessario, p_janela_fim;
  end if;

  if p_estimativa_estado = 'viavel'
     and (p_folga_dias_produtivos <= 0 or p_janela_inicio >= p_estimativa_inicio_necessario) then
    raise exception 'Inconsistencia em viavel: p_folga_dias_produtivos=%, p_janela_inicio=%, p_estimativa_inicio_necessario=% - exige folga > 0 e janela_inicio < estimativa.', p_folga_dias_produtivos, p_janela_inicio, p_estimativa_inicio_necessario;
  end if;

  if p_estimativa_estado = 'viavel_no_limite'
     and (p_folga_dias_produtivos <> 0 or p_janela_inicio <> p_estimativa_inicio_necessario) then
    raise exception 'Inconsistencia em viavel_no_limite: p_folga_dias_produtivos=%, p_janela_inicio=%, p_estimativa_inicio_necessario=% - exige folga = 0 e janela_inicio = estimativa.', p_folga_dias_produtivos, p_janela_inicio, p_estimativa_inicio_necessario;
  end if;

  if p_estimativa_estado = 'janela_insuficiente'
     and (p_folga_dias_produtivos >= 0 or p_janela_inicio <= p_estimativa_inicio_necessario) then
    raise exception 'Inconsistencia em janela_insuficiente: p_folga_dias_produtivos=%, p_janela_inicio=%, p_estimativa_inicio_necessario=% - exige folga < 0 e janela_inicio > estimativa.', p_folga_dias_produtivos, p_janela_inicio, p_estimativa_inicio_necessario;
  end if;
  -- ===== FIM NOVO NA V5 =====

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
  -- Insercao atomica com tratamento de conflito - mesma logica da v4,
  -- com os 4 campos novos de estimativa incluidos.
  -- =========================================================
  insert into public.simulacoes_comerciais (
    empresa_id, projeto_id, cenario_demanda, modo_producao, data_necessidade,
    margem_seguranca_dias, data_prevista_aprovacao_pedido, data_chegada_prevista,
    janela_inicio, janela_fim,
    estimativa_inicio_necessario, estimativa_estado, estimativa_metodo_versao, folga_dias_produtivos,
    aprovado_por,
    chave_idempotencia, hash_solicitacao, vigente
  )
  values (
    v_empresa_id, p_projeto_id, p_cenario_demanda, p_modo_producao, p_data_necessidade,
    p_margem_seguranca_dias, p_data_prevista_aprovacao_pedido, p_data_chegada_prevista,
    p_janela_inicio, p_janela_fim,
    p_estimativa_inicio_necessario, p_estimativa_estado, p_estimativa_metodo_versao, p_folga_dias_produtivos,
    p_aprovado_por,
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

comment on function public.aprovar_projeto_com_simulacao_v5(uuid, uuid, text, text, date, integer, date, date, date, date, date, text, smallint, integer, jsonb, text, text) is
  'Versao 5 da aprovacao da Simulacao Comercial (PAD-008 v2.1, secao 20 - Calculador Reverso) - so chamavel por service_role. Aditiva sobre a v4, que permanece intacta como caminho de rollback. Acrescenta a Estimativa de Inicio Necessario ao snapshot (estimativa_inicio_necessario, estimativa_estado, estimativa_metodo_versao, folga_dias_produtivos) - so os 3 estados comerciais persistiveis (viavel, viavel_no_limite, janela_insuficiente); dados_insuficientes e horizonte_tecnico_excedido bloqueiam a aprovacao antes de chegar aqui e sao rejeitados explicitamente se, por algum bug, chegarem mesmo assim. Esta versao da RPC so aceita estimativa_metodo_versao = 1 (a coluna aceita qualquer valor positivo, para versoes futuras do metodo nao exigirem nova migration de schema, mas cada versao da RPC so reconhece a versao que ela propria implementa). Valida tambem que estimativa_inicio_necessario nunca e posterior a p_janela_fim (Prazo Interno) - a busca binaria de origem (buscarMaiorIndiceViavel) e limitada a P, que nunca ultrapassa o Prazo Interno. Mesma validacao/idempotencia/atomicidade da v4 para tudo o mais (nenhuma logica existente foi alterada, so acrescentada). Nao recalcula os valores recebidos a partir de cadastros atuais - responsabilidade de quem chama (Server Action, que recalcula tudo no servidor antes de chamar).';

revoke execute on function public.aprovar_projeto_com_simulacao_v5(uuid, uuid, text, text, date, integer, date, date, date, date, date, text, smallint, integer, jsonb, text, text) from public;
revoke execute on function public.aprovar_projeto_com_simulacao_v5(uuid, uuid, text, text, date, integer, date, date, date, date, date, text, smallint, integer, jsonb, text, text) from anon;
revoke execute on function public.aprovar_projeto_com_simulacao_v5(uuid, uuid, text, text, date, integer, date, date, date, date, date, text, smallint, integer, jsonb, text, text) from authenticated;
grant execute on function public.aprovar_projeto_com_simulacao_v5(uuid, uuid, text, text, date, integer, date, date, date, date, date, text, smallint, integer, jsonb, text, text) to service_role;

commit;
