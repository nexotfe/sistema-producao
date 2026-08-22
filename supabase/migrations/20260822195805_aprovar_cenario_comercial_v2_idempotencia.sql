-- DEC-007 §6.2/Fase 8b (continuação da Fase 1 da transição em duas
-- fases - migration 20260822165408) - correção de um achado real: a
-- aprovação de um cenário comercial travou em "Aprovando..." no
-- orçamento 260007 (suspeita mais provável: o mesmo tipo de lock
-- interno do client Supabase já documentado em AuthGate.tsx -
-- "getSession() pode travar para sempre sem lançar erro nenhum" - a
-- correção de timeout por etapa, do lado TypeScript, está fora desta
-- migration). O que ESTA migration resolve é a pergunta que sobra
-- mesmo com timeout: se a chamada a aprovar_cenario_comercial_v2 falhar
-- de forma AMBÍGUA (conexão caiu depois de iniciar a gravação, resposta
-- nunca chegou), como o cliente pode tentar de novo sem correr o risco
-- de duplicar a aprovação (ou, pior, aprovar duas vezes com conteúdo
-- diferente sob a mesma tentativa)?
--
-- Solução: chave de idempotência, EXATO mesmo padrão já usado e
-- comprovado por aprovar_projeto_com_simulacao_v5 (chave_idempotencia +
-- hash_solicitacao, índice único parcial por empresa, checagem otimista
-- + re-checagem sob a trava, insert com "on conflict do nothing" e
-- re-seleção). Diferença deliberada (decisão do usuário): além de
-- empresa_id/chave_idempotencia baterem, o projeto e o hash do conteúdo
-- também precisam bater - mesma chave reaproveitada para um projeto ou
-- conteúdo diferente é um ERRO de integridade, nunca devolve
-- silenciosamente outro cenário.
--
-- Como a RPC v2 nunca foi usada em produção (Fase 1, ainda 0 aprovações
-- gravadas por ela - confirmado por leitura antes desta migration), sua
-- assinatura pode ser trocada em bloco (DROP + CREATE) sem risco de
-- quebrar nenhum caminho real - diferente da RPC ANTIGA
-- (aprovar_cenario_comercial, 12 parâmetros), que continua INTOCADA,
-- ainda usada pelo código em produção até a Fase 2 desta transição.

-- =====================================================================
-- 1. Colunas novas - nullable, sem backfill (linhas existentes, todas
--    gravadas antes desta migration, nunca tiveram chave/hash).
-- =====================================================================

alter table public.cenarios_comerciais_aprovados
  add column chave_idempotencia text;

alter table public.cenarios_comerciais_aprovados
  add column hash_solicitacao text;

comment on column public.cenarios_comerciais_aprovados.chave_idempotencia is
  'UUID gerado no CLIENTE (crypto.randomUUID()) quando o modal de confirmação de aprovação abre - reaproveitado em qualquer nova tentativa da MESMA confirmação (só muda se o usuário fechar e reabrir o modal). NULL para linhas gravadas antes desta migration ou pela RPC antiga (aprovar_cenario_comercial).';
comment on column public.cenarios_comerciais_aprovados.hash_solicitacao is
  'SHA-256 hex de TUDO que será persistido nesta aprovação (calcularHashSolicitacaoAprovacaoCenario.ts) - usado junto com chave_idempotencia para distinguir uma repetição legítima (mesma chave, mesmo conteúdo - devolve o cenário já gravado) de reuso indevido da chave (mesma chave, conteúdo/projeto diferente - rejeitado como erro de integridade).';

-- =====================================================================
-- 2. Índice único parcial por empresa - mesmo padrão de
--    simulacoes_comerciais_chave_idempotencia_unica (v5).
-- =====================================================================

create unique index cenarios_comerciais_aprovados_idempotencia_unica
  on public.cenarios_comerciais_aprovados (empresa_id, chave_idempotencia)
  where chave_idempotencia is not null;

-- =====================================================================
-- 3. Remove a assinatura ANTERIOR de aprovar_cenario_comercial_v2 (15
--    parâmetros, Fase 1) - nunca usada em produção, seguro substituir
--    em bloco. A RPC ANTIGA (aprovar_cenario_comercial, 12 parâmetros)
--    não é tocada por este bloco.
-- =====================================================================

revoke all on function public.aprovar_cenario_comercial_v2(
  uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text
) from public, anon, authenticated, service_role;

drop function public.aprovar_cenario_comercial_v2(
  uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text
);

-- =====================================================================
-- 4. RPC v2 NOVA (17 parâmetros - acrescenta p_chave_idempotencia/
--    p_hash_solicitacao antes do já existente p_motivo_substituicao,
--    que continua opcional/último). Mesma autorização/validações da
--    versão anterior (ver migration 20260822165408) - só a lógica de
--    idempotência é nova.
-- =====================================================================

create function public.aprovar_cenario_comercial_v2(
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
  -- 'admin'), sem introduzir nem afrouxar nenhuma condição.
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

  -- Datas/somas SÃO verificáveis em SQL - recalculadas aqui, nunca
  -- confiadas a um total pronto vindo do chamador.
  v_diferenca_em_dias := p_prazo_proposto - p_data_solicitada_cliente;
  v_custo_adicional_total := p_custo_negociacao_material + p_custo_hora_adicional + p_custo_recurso_temporario + p_custo_terceirizacao;
  v_novo_custo_tecnico := p_custo_tecnico_atual + v_custo_adicional_total;

  if jsonb_typeof(p_snapshot) is distinct from 'object' then
    raise exception 'snapshot precisa ser um objeto JSON.';
  end if;
  if (p_snapshot ->> 'versaoFormato') is distinct from '1' then
    raise exception 'snapshot.versaoFormato precisa ser 1 (versão atual do formato).';
  end if;

  -- =========================================================
  -- IDEMPOTÊNCIA - checagem OTIMISTA (antes da trava): só uma
  -- otimização (evita repetir toda a validação para uma repetição
  -- óbvia) - a proteção real está na re-checagem sob a trava, logo
  -- abaixo. mesma chave + mesmo projeto + mesmo hash = devolve o
  -- cenário já gravado (idempotente). mesma chave + projeto OU hash
  -- diferente = erro de integridade, NUNCA devolve outro cenário.
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

  perform pg_advisory_xact_lock(hashtextextended('cenarios_comerciais_aprovados:' || p_projeto_id::text, 0));

  -- Re-checagem AUTORITATIVA sob a trava - protege a corrida em que
  -- duas chamadas concorrentes com a MESMA chave (ex.: clique duplo +
  -- retry simultâneo) passaram pela checagem otimista acima antes de
  -- qualquer uma commitar.
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

  v_snapshot_final := p_snapshot || jsonb_build_object('aprovadoPor', p_aprovado_por::text, 'aprovadoEm', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

  perform set_config('app.aprovacao_cenario_comercial_em_andamento_projeto_id', p_projeto_id::text, true);

  if v_anterior_id is not null then
    update public.cenarios_comerciais_aprovados
    set vigente = false
    where id = v_anterior_id;
  end if;

  -- ON CONFLICT como defesa em profundidade (mesmo padrão de v5) -
  -- sob a trava + re-checagem acima, normalmente não deveria mais ser
  -- alcançado, mas cobre qualquer janela residual.
  insert into public.cenarios_comerciais_aprovados (
    empresa_id, projeto_id, vigente, tipo_cenario, aprovado_por, substituiu_cenario_id, motivo_substituicao,
    data_solicitada_cliente, prazo_proposto, diferenca_em_dias,
    custo_tecnico_atual, custo_negociacao_material, custo_hora_adicional, custo_recurso_temporario, custo_terceirizacao,
    custo_adicional_total, novo_custo_tecnico, valor_comercial_atual_referencia, snapshot, versao_snapshot,
    assinatura_tecnica, chave_idempotencia, hash_solicitacao
  ) values (
    p_empresa_id, p_projeto_id, true, p_tipo_cenario, p_aprovado_por, v_anterior_id, p_motivo_substituicao,
    p_data_solicitada_cliente, p_prazo_proposto, v_diferenca_em_dias,
    p_custo_tecnico_atual, p_custo_negociacao_material, p_custo_hora_adicional, p_custo_recurso_temporario, p_custo_terceirizacao,
    v_custo_adicional_total, v_novo_custo_tecnico, p_valor_comercial_atual_referencia, v_snapshot_final, 1,
    p_assinatura_tecnica, p_chave_idempotencia, p_hash_solicitacao
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

comment on function public.aprovar_cenario_comercial_v2(uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text, text, text) is
  'RPC v2 (17 parâmetros - Fase 1 da transição, com idempotência adicionada nesta migration). SERVICE_ROLE-ONLY. Autorização reproduz usuario_e_admin() via public.profiles com parâmetros explícitos. p_chave_idempotencia/p_hash_solicitacao (mesmo padrão de aprovar_projeto_com_simulacao_v5): uma repetição com a MESMA chave e MESMO hash devolve o cenário já gravado (idempotente, nunca insere de novo); mesma chave com projeto ou hash diferente é erro de integridade, nunca devolve outro cenário. RPC antiga (aprovar_cenario_comercial, 12 parâmetros) continua intocada e em uso pelo código em produção até a Fase 2 desta transição remover.';

revoke all on function public.aprovar_cenario_comercial_v2(uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.aprovar_cenario_comercial_v2(uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text, text, text) to service_role;
