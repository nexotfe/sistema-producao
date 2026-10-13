-- PCP-P4Q/R/S - Snapshot Técnico Histórico v2 + aprovar_cenario_comercial_v3.
--
-- Investigação prévia (PCP-P4I/P4J/P4Q): o que hoje é persistido sobre a
-- base técnica que sustentou um cenário comercial aprovado é SÓ o hash
-- (`cenarios_comerciais_aprovados.assinatura_tecnica`, SHA-256 do
-- `DocumentoAssinaturaTecnica` canonicalizado em TypeScript) - nunca o
-- conteúdo em si. Um hash prova "mudou/não mudou", nunca permite
-- reconstruir valores históricos se o Roteiro Mestre mudar depois. Esta
-- migration persiste o CONTEÚDO completo (não substitui o hash, que
-- continua sendo calculado e gravado exatamente como hoje).
--
-- Decisões já congeladas (PCP-P4Q/R/S, não decididas nesta migration):
--   1. Tabela destino continua cenarios_comerciais_aprovados - sem
--      JOIN novo, reaproveita imutabilidade/auditoria já existentes.
--   2. jsonb (não tabela normalizada) - é uma fotografia imutável,
--      nunca consultada operacionalmente, mesma lógica já usada em
--      `snapshot`/`assinatura_tecnica` desta própria tabela.
--   3. snapshot_tecnico_versao é conceito DIFERENTE de versao_snapshot
--      (que já existe nesta tabela, sempre 1, para o snapshot
--      COMERCIAL) - duas versões independentes para dois documentos
--      independentes (técnico vs. comercial), nunca confundidas.
--   4. PCP-P4R.1 (prova empírica real, sandbox descartável): mudar a
--      aridade de uma função via CREATE OR REPLACE NÃO a substitui -
--      cria uma segunda sobrecarga, e PostgREST rejeita com PGRST203
--      ("Could not choose the best candidate function") qualquer
--      chamada antiga que incida na ambiguidade. Por isso esta
--      migration NUNCA toca aprovar_cenario_comercial_v2 (17
--      parâmetros, 20260822195805) - cria aprovar_cenario_comercial_v3
--      como função NOVA, nome distinto, mesmo princípio já usado e
--      documentado na transição v1->v2 (20260822165408).
--   5. Legado: as colunas novas nascem nullable, SEM default. Nenhum
--      backfill - mesmo princípio já aplicado a assinatura_tecnica
--      (20260822165408: "cenários aprovados antes... não têm como ser
--      assinados retroativamente... nunca um backfill forjado").
--
-- Fora de escopo desta migration (PCP-P4Q/R/S, registrado para as
-- próximas fatias): Condição Final da Venda; OP/dependência física;
-- alteração de Status=Aprovado; Motor B; endurecimento fail-closed de
-- v3 para todo caller (ainda não existe nenhum caller real da v3 -
-- aplicação migra para ela só depois desta migration, código separado).

-- =====================================================================
-- 1. Colunas novas - nullable, sem backfill.
-- =====================================================================

alter table public.cenarios_comerciais_aprovados
  add column snapshot_tecnico jsonb;

alter table public.cenarios_comerciais_aprovados
  add column snapshot_tecnico_versao smallint;

alter table public.cenarios_comerciais_aprovados
  add constraint cenarios_comerciais_aprovados_snapshot_tecnico_versao_chk
  check (snapshot_tecnico_versao is null or snapshot_tecnico_versao = 2);

-- Defesa em profundidade: mesmo molde já usado para
-- _snapshot_forma_chk (snapshot/versao_snapshot) - garante coerência
-- entre a versão gravada DENTRO do documento e a coluna própria,
-- independente do caminho de escrita.
alter table public.cenarios_comerciais_aprovados
  add constraint cenarios_comerciais_aprovados_snapshot_tecnico_coerente_chk
  check (snapshot_tecnico is null or (snapshot_tecnico ->> 'versao')::int = snapshot_tecnico_versao);

comment on column public.cenarios_comerciais_aprovados.snapshot_tecnico is
  'Snapshot Técnico Histórico completo (DocumentoAssinaturaTecnica v2, construirDocumentoAssinaturaTecnica.ts) - por operação: bomOperacaoId, necessarioHorasPadrao, recursoOriginalId, codigoOperacaoOrigem/descricaoOperacaoOrigem/tempoUnitarioMinutos (bom_operacoes.ordem/descricao/tempo_estimado_minutos no momento da aprovação); também recursos (valorHora histórico), materiais/terceiros/transportes (árvore de custos), dependencias[] (grafo completo), calendário/convenções. NULL = cenário aprovado antes desta coluna existir (v2, 17 parâmetros, ou a RPC ainda mais antiga) - nunca backfillado (reconstituir a base técnica exata do momento original é impossível, mesmo princípio já aplicado a assinatura_tecnica). Gravado só por aprovar_cenario_comercial_v3 - toda aprovação por ela grava um documento válido, nunca NULL. assinatura_tecnica continua sendo o hash SHA-256 deste mesmo documento, calculado em TypeScript ANTES da chamada - nunca recalculado a partir de snapshot_tecnico::text (canonicalização/hash são autoridade exclusiva do TypeScript, nunca duplicados em SQL).';
comment on column public.cenarios_comerciais_aprovados.snapshot_tecnico_versao is
  'Versão do formato de snapshot_tecnico (sempre igual a (snapshot_tecnico->>''versao'')::int, ver CHECK de coerência) - conceito INDEPENDENTE de versao_snapshot (que é do snapshot COMERCIAL, sempre 1). NULL quando snapshot_tecnico também é NULL (legado). Hoje só a versão 2 é suportada.';

-- =====================================================================
-- 2. aprovar_cenario_comercial_v3 - NOVA função (nunca substitui/altera
--    a v2). Mesma base funcional da v2 (autorização, idempotência,
--    advisory lock, substituição de vigente, retornos) - único
--    acréscimo real é p_snapshot_tecnico/p_snapshot_tecnico_versao.
-- =====================================================================

create function public.aprovar_cenario_comercial_v3(
  p_empresa_id uuid,
  p_aprovado_por uuid,
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
  p_assinatura_tecnica text,
  p_chave_idempotencia text,
  p_hash_solicitacao text,
  p_snapshot_tecnico jsonb,
  p_snapshot_tecnico_versao smallint,
  p_motivo_substituicao text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_projeto_empresa_id uuid;
  v_perfil_empresa_id uuid;
  v_perfil_nivel_acesso text;
  v_perfil_ativo boolean;
  v_anterior_id uuid;
  v_diferenca_em_dias integer;
  v_custo_adicional_total numeric;
  v_novo_custo_tecnico numeric;
  v_snapshot_final jsonb;
  v_novo_id uuid;
  v_id_existente uuid;
  v_projeto_existente uuid;
  v_hash_existente text;
begin
  if p_empresa_id is null then
    raise exception 'p_empresa_id é obrigatório - deve vir de public.profiles do aprovador, resolvido pela Server Action antes da chamada, nunca de parâmetro do navegador.';
  end if;

  if p_aprovado_por is null then
    raise exception 'p_aprovado_por é obrigatório - deve vir de auth.getUser() no servidor, nunca de parâmetro do navegador.';
  end if;

  -- Autorização (4 exceções distintas, cada uma auditável) - reproduz
  -- EXATAMENTE o predicado hoje aplicado por usuario_e_admin() sobre
  -- public.profiles (id = <usuário>, ativo = true, nivel_acesso =
  -- 'admin'), sem introduzir nem afrouxar nenhuma condição - mesma
  -- autorização da v2, intocada.
  select empresa_id, nivel_acesso, ativo
    into v_perfil_empresa_id, v_perfil_nivel_acesso, v_perfil_ativo
  from public.profiles
  where id = p_aprovado_por;

  if not found then
    raise exception 'Usuário aprovador % não possui perfil cadastrado (public.profiles).', p_aprovado_por;
  end if;

  if not v_perfil_ativo then
    raise exception 'Usuário aprovador % está inativo.', p_aprovado_por;
  end if;

  if v_perfil_empresa_id is distinct from p_empresa_id then
    raise exception 'Usuário aprovador % não pertence à empresa informada (p_empresa_id).', p_aprovado_por;
  end if;

  if v_perfil_nivel_acesso is distinct from 'admin' then
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
  if v_projeto_empresa_id is distinct from p_empresa_id then
    raise exception 'Projeto % não pertence à empresa informada (p_empresa_id).', p_projeto_id;
  end if;

  if p_assinatura_tecnica is null or p_assinatura_tecnica !~ '^[0-9a-f]{64}$' then
    raise exception 'p_assinatura_tecnica é obrigatória e precisa ser um hash SHA-256 hexadecimal (64 caracteres).';
  end if;

  if p_chave_idempotencia is null or btrim(p_chave_idempotencia) = '' then
    raise exception 'p_chave_idempotencia é obrigatória.';
  end if;

  if p_hash_solicitacao is null or btrim(p_hash_solicitacao) = '' then
    raise exception 'p_hash_solicitacao é obrigatório.';
  end if;

  if jsonb_typeof(p_snapshot) is distinct from 'object' then
    raise exception 'snapshot precisa ser um objeto JSON.';
  end if;
  if (p_snapshot ->> 'versaoFormato') is distinct from '1' then
    raise exception 'snapshot.versaoFormato precisa ser 1 (versão atual do formato comercial).';
  end if;

  -- PCP-P4Q/R/S: Snapshot Técnico Histórico - obrigatório nesta RPC
  -- (fail-closed, nunca fallback para BOM vivo) e validado em 2 frentes
  -- (forma do documento + versão declarada DENTRO dele, coerente com o
  -- parâmetro próprio) - mesmo princípio já aplicado ao snapshot
  -- comercial acima.
  if p_snapshot_tecnico is null then
    raise exception 'p_snapshot_tecnico é obrigatório - deve ser o DocumentoAssinaturaTecnica completo que também produziu p_assinatura_tecnica, nunca reconstruído à parte.';
  end if;

  if jsonb_typeof(p_snapshot_tecnico) is distinct from 'object' then
    raise exception 'p_snapshot_tecnico precisa ser um objeto JSON.';
  end if;

  if (p_snapshot_tecnico ->> 'versao') is distinct from '2' then
    raise exception 'p_snapshot_tecnico.versao precisa ser 2 (única versão suportada do Snapshot Técnico Histórico).';
  end if;

  if p_snapshot_tecnico_versao is null or p_snapshot_tecnico_versao <> 2 then
    raise exception 'p_snapshot_tecnico_versao precisa ser 2 (única versão suportada do Snapshot Técnico Histórico).';
  end if;

  -- =========================================================
  -- IDEMPOTÊNCIA - checagem OTIMISTA (antes da trava) - mesma lógica
  -- da v2, intocada.
  -- =========================================================
  select id, projeto_id, hash_solicitacao
    into v_id_existente, v_projeto_existente, v_hash_existente
  from public.cenarios_comerciais_aprovados
  where empresa_id = p_empresa_id and chave_idempotencia = p_chave_idempotencia;

  if v_id_existente is not null then
    if v_projeto_existente is distinct from p_projeto_id or v_hash_existente is distinct from p_hash_solicitacao then
      raise exception 'Conflito de idempotência: chave % já foi usada para um projeto ou conteúdo diferente.', p_chave_idempotencia;
    end if;
    return v_id_existente;
  end if;

  -- MESMA chave de advisory lock da v2/RPC antiga (por projeto) - as
  -- três RPCs escrevem na mesma tabela e disputam o mesmo "1 vigente
  -- por projeto", precisam se serializar entre si.
  perform pg_advisory_xact_lock(hashtextextended('cenarios_comerciais_aprovados:' || p_projeto_id::text, 0));

  -- Re-checagem AUTORITATIVA sob a trava - mesma lógica da v2.
  select id, projeto_id, hash_solicitacao
    into v_id_existente, v_projeto_existente, v_hash_existente
  from public.cenarios_comerciais_aprovados
  where empresa_id = p_empresa_id and chave_idempotencia = p_chave_idempotencia;

  if v_id_existente is not null then
    if v_projeto_existente is distinct from p_projeto_id or v_hash_existente is distinct from p_hash_solicitacao then
      raise exception 'Conflito de idempotência: chave % já foi usada para um projeto ou conteúdo diferente.', p_chave_idempotencia;
    end if;
    return v_id_existente;
  end if;

  select id into v_anterior_id
  from public.cenarios_comerciais_aprovados
  where empresa_id = p_empresa_id and projeto_id = p_projeto_id and vigente = true;

  if v_anterior_id is not null and coalesce(btrim(p_motivo_substituicao), '') = '' then
    raise exception 'Motivo obrigatório para substituir o cenário comercial já vigente deste projeto.';
  end if;

  v_diferenca_em_dias := p_prazo_proposto - p_data_solicitada_cliente;
  v_custo_adicional_total := p_custo_negociacao_material + p_custo_hora_adicional + p_custo_recurso_temporario + p_custo_terceirizacao;
  v_novo_custo_tecnico := p_custo_tecnico_atual + v_custo_adicional_total;

  v_snapshot_final := p_snapshot || jsonb_build_object('aprovadoPor', p_aprovado_por::text, 'aprovadoEm', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

  perform set_config('app.aprovacao_cenario_comercial_em_andamento_projeto_id', p_projeto_id::text, true);

  if v_anterior_id is not null then
    update public.cenarios_comerciais_aprovados
    set vigente = false
    where id = v_anterior_id;
  end if;

  -- ON CONFLICT como defesa em profundidade (mesmo padrão da v2/v5).
  insert into public.cenarios_comerciais_aprovados (
    empresa_id, projeto_id, vigente, tipo_cenario, aprovado_por, substituiu_cenario_id, motivo_substituicao,
    data_solicitada_cliente, prazo_proposto, diferenca_em_dias,
    custo_tecnico_atual, custo_negociacao_material, custo_hora_adicional, custo_recurso_temporario, custo_terceirizacao,
    custo_adicional_total, novo_custo_tecnico, valor_comercial_atual_referencia, snapshot, versao_snapshot,
    assinatura_tecnica, chave_idempotencia, hash_solicitacao, snapshot_tecnico, snapshot_tecnico_versao
  ) values (
    p_empresa_id, p_projeto_id, true, p_tipo_cenario, p_aprovado_por, v_anterior_id, p_motivo_substituicao,
    p_data_solicitada_cliente, p_prazo_proposto, v_diferenca_em_dias,
    p_custo_tecnico_atual, p_custo_negociacao_material, p_custo_hora_adicional, p_custo_recurso_temporario, p_custo_terceirizacao,
    v_custo_adicional_total, v_novo_custo_tecnico, p_valor_comercial_atual_referencia, v_snapshot_final, 1,
    p_assinatura_tecnica, p_chave_idempotencia, p_hash_solicitacao, p_snapshot_tecnico, p_snapshot_tecnico_versao
  )
  on conflict (empresa_id, chave_idempotencia) where chave_idempotencia is not null
  do nothing
  returning id into v_novo_id;

  if v_novo_id is null then
    select id, projeto_id, hash_solicitacao
      into v_id_existente, v_projeto_existente, v_hash_existente
    from public.cenarios_comerciais_aprovados
    where empresa_id = p_empresa_id and chave_idempotencia = p_chave_idempotencia;

    if v_id_existente is null then
      raise exception 'Falha ao localizar cenário após conflito de inserção para a chave %.', p_chave_idempotencia;
    end if;
    if v_projeto_existente is distinct from p_projeto_id or v_hash_existente is distinct from p_hash_solicitacao then
      raise exception 'Conflito de idempotência: chave % já foi usada para um projeto ou conteúdo diferente.', p_chave_idempotencia;
    end if;
    return v_id_existente;
  end if;

  return v_novo_id;
end;
$function$;

comment on function public.aprovar_cenario_comercial_v3(uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text, text, jsonb, smallint, text) is
  'RPC v3 (PCP-P4S) - NOVA, nunca substitui aprovar_cenario_comercial_v2 (17 parâmetros, 20260822195805, que fica INTOCADA) nem a RPC ainda mais antiga (12 parâmetros, 202608180002). Mesma base funcional da v2 (autorização=usuario_e_admin() reproduzida com parâmetros explícitos, idempotência por chave_idempotencia/hash_solicitacao, advisory lock por projeto, substituição de vigente com motivo obrigatório). Único acréscimo real: p_snapshot_tecnico (DocumentoAssinaturaTecnica v2 completo, JSONB) + p_snapshot_tecnico_versao (smallint, só 2 suportado hoje) - ambos obrigatórios e validados (forma do JSON + versão declarada dentro dele coerente com o parâmetro), fail-closed, nunca fallback para BOM/Roteiro Mestre vivo. p_assinatura_tecnica continua sendo o hash SHA-256 do MESMO documento, calculado em TypeScript - esta RPC nunca recalcula nem reconstrói a canonicalização/hash em SQL. SERVICE_ROLE-ONLY.';

revoke all on function public.aprovar_cenario_comercial_v3(uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text, text, jsonb, smallint, text) from public, anon, authenticated;
grant execute on function public.aprovar_cenario_comercial_v3(uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text, text, jsonb, smallint, text) to service_role;
