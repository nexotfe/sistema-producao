-- RPC v2 de aprovacao da Simulacao Comercial - correcao da aprovacao
-- autoritativa (PAD-008, secoes 7-8: Divergencia arquitetural
-- conhecida / Decisao arquitetural).
--
-- Aditiva: nao remove nem altera aprovar_projeto_com_simulacao (v1).
-- Rollout gradual - v1 continua concedida a authenticated ate a
-- migration seguinte (202607300002) revogar isso, depois que o novo
-- fluxo (Server Action -> client privilegiado -> v2) estiver
-- confirmado ponta a ponta.
--
-- Diferencas reais da v1, nao cosmeticas:
-- 1) EXECUTE concedido so a service_role - nenhum papel alcancavel
--    pelo navegador pode chamar esta function.
-- 2) p_aprovado_por e parametro obrigatorio, resolvido pelo chamador
--    (Server Action) a partir de auth.getUser() no servidor - nunca
--    de dado enviado pelo navegador. A empresa e determinada a partir
--    de public.usuarios.empresa_id do aprovador, nunca de parametro
--    ou de empresa_atual_id() (que depende de contexto de sessao que
--    o client privilegiado nao tem).
-- 3) Idempotencia por (p_chave_idempotencia, p_hash_solicitacao):
--    chamar duas vezes com a mesma chave E o mesmo hash (mesma
--    empresa) retorna o mesmo snapshot ja gravado, sem duplicar.
--    Mesma chave com hash DIFERENTE e conflito - rejeitada, nunca
--    tratada como sucesso nem sobrescreve o snapshot existente. O
--    hash amarra a chave ao conteudo real da solicitacao (projeto,
--    aprovador, parametros comerciais, itens) - sem ele, encontrar a
--    chave sozinha nao prova que a repeticao e da MESMA aprovacao.
--    Protecao real contra corrida e INSERT ... ON CONFLICT DO NOTHING
--    (nao um SELECT previo seguido de INSERT separado) - duas chamadas
--    concorrentes com a mesma chave nunca conseguem inserir duas
--    linhas.

-- =========================================================
-- Colunas + indice de idempotencia
-- =========================================================
alter table public.simulacoes_comerciais
  add column chave_idempotencia text,
  add column hash_solicitacao text;

comment on column public.simulacoes_comerciais.chave_idempotencia is
  'Chave de idempotencia da solicitacao de aprovacao (gerada uma vez por tentativa, no cliente, antes da Server Action). NULL em linhas gravadas pela v1 - nao participa do indice unico parcial abaixo nesse caso. Reenvio com a mesma chave E o mesmo hash_solicitacao (mesma empresa) retorna o snapshot ja existente em vez de duplicar; mesma chave com hash diferente e conflito, rejeitado.';

comment on column public.simulacoes_comerciais.hash_solicitacao is
  'Hash (sha256, calculado na Server Action) do conteudo canonico da solicitacao - projeto, aprovador, parametros comerciais e itens recalculados no servidor. Usado junto com chave_idempotencia para confirmar que uma repeticao de chave corresponde de verdade a mesma solicitacao, nao a uma chave reaproveitada por engano ou adulterada para uma aprovacao diferente. NULL em linhas gravadas pela v1.';

create unique index simulacoes_comerciais_empresa_idempotencia_uniq
  on public.simulacoes_comerciais (empresa_id, chave_idempotencia)
  where chave_idempotencia is not null;

-- =========================================================
-- aprovar_projeto_com_simulacao_v2
-- =========================================================
create or replace function public.aprovar_projeto_com_simulacao_v2(
  p_aprovado_por uuid,
  p_projeto_id uuid,
  p_cenario_demanda text,
  p_modo_producao text,
  p_data_necessidade date,
  p_margem_seguranca_dias integer,
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
  v_bom_operacao_empresa_id uuid;
  v_recurso_original_empresa_id uuid;
  v_recurso_considerado_empresa_id uuid;
  v_motivo text;
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

  -- Fonte unica de empresa: o registro de usuarios do aprovador
  -- validado, nunca parametro do chamador nem empresa_atual_id() (o
  -- client privilegiado nao carrega o contexto de sessao de que
  -- empresa_atual_id() depende).
  select empresa_id into v_empresa_id
  from public.usuarios
  where id = p_aprovado_por;

  if v_empresa_id is null then
    raise exception 'Usuario aprovador % nao encontrado em public.usuarios.', p_aprovado_por;
  end if;

  -- Checagem ANTECIPADA de idempotencia - so OTIMIZACAO (evita todo o
  -- trabalho de validacao abaixo quando ja sabemos que e repeticao),
  -- NAO e a protecao real contra corrida: duas chamadas concorrentes
  -- com a mesma chave podem passar por este SELECT antes de qualquer
  -- uma delas inserir. A protecao real esta no INSERT ... ON CONFLICT
  -- mais abaixo (linha ~265) - esta checagem so acelera o caminho
  -- feliz (chave repetida, sem corrida) para nao repetir toda a
  -- validacao de itens a toa.
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

  -- Validacao por item (1 por operacao de roteiro) - mesma logica da
  -- v1, reaproveitada sem alteracao: operacao e recursos existem e
  -- pertencem a empresa resolvida, motivo_consideracao consistente
  -- com original/considerado/deficit, valores nao-negativos.
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    if not (v_item ? 'bom_operacao_id') or not (v_item ? 'recurso_original_id') or not (v_item ? 'recurso_considerado_id') or not (v_item ? 'motivo_consideracao') then
      raise exception 'Item de simulacao incompleto - bom_operacao_id, recurso_original_id, recurso_considerado_id e motivo_consideracao sao obrigatorios: %', v_item;
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

    v_motivo := v_item->>'motivo_consideracao';

    if v_motivo is null and (v_item->>'recurso_considerado_id') is not null then
      raise exception 'motivo_consideracao NULL exige recurso_considerado_id tambem NULL (deficit total): %', v_item;
    end if;

    if v_motivo is not null and (v_item->>'recurso_considerado_id') is null then
      raise exception 'recurso_considerado_id NULL exige motivo_consideracao tambem NULL (deficit total): %', v_item;
    end if;

    if v_motivo is not null and v_motivo not in ('ORIGINAL', 'COMPATIBILIDADE') then
      raise exception 'motivo_consideracao invalido (%) - esperado ORIGINAL, COMPATIBILIDADE ou NULL (deficit total).', v_motivo;
    end if;

    if v_motivo = 'ORIGINAL' and (v_item->>'recurso_original_id') <> (v_item->>'recurso_considerado_id') then
      raise exception 'motivo_consideracao=ORIGINAL exige recurso_considerado_id igual a recurso_original_id: %', v_item;
    end if;

    if v_motivo = 'COMPATIBILIDADE' and (v_item->>'recurso_original_id') = (v_item->>'recurso_considerado_id') then
      raise exception 'motivo_consideracao=COMPATIBILIDADE exige recurso_considerado_id diferente de recurso_original_id: %', v_item;
    end if;

    if v_motivo is null and (
      (nullif(v_item->>'deficit', ''))::numeric <> (nullif(v_item->>'necessario', ''))::numeric
      or (nullif(v_item->>'deficit', ''))::numeric <= 0
    ) then
      raise exception 'Operacao em deficit total (motivo_consideracao NULL) exige deficit = necessario e > 0: %', v_item;
    end if;

    if v_motivo is not null and (nullif(v_item->>'deficit', ''))::numeric <> 0 then
      raise exception 'Operacao com recurso considerado (motivo_consideracao=%) exige deficit = 0: %', v_motivo, v_item;
    end if;

    if (v_item->>'recurso_considerado_id') is null then
      if (v_item->>'capacidade_bruta') is not null
        or (v_item->>'capacidade_efetiva') is not null
        or (v_item->>'capacidade_disponivel') is not null
        or (v_item->>'comprometido') is not null
        or (v_item->>'livre') is not null
      then
        raise exception 'Operacao em deficit total (recurso_considerado_id NULL) exige capacidade_bruta, capacidade_efetiva, capacidade_disponivel, comprometido e livre tambem NULL: %', v_item;
      end if;
    else
      if (v_item->>'capacidade_bruta') is null
        or (v_item->>'capacidade_efetiva') is null
        or (v_item->>'capacidade_disponivel') is null
        or (v_item->>'comprometido') is null
        or (v_item->>'livre') is null
      then
        raise exception 'Operacao com recurso considerado exige capacidade_bruta, capacidade_efetiva, capacidade_disponivel, comprometido e livre preenchidos: %', v_item;
      end if;
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

    if (v_item->>'recurso_considerado_id') is not null then
      select empresa_id into v_recurso_considerado_empresa_id
      from public.recursos_produtivos
      where id = (nullif(v_item->>'recurso_considerado_id', ''))::uuid;

      if v_recurso_considerado_empresa_id is null then
        raise exception 'Recurso considerado % nao encontrado.', v_item->>'recurso_considerado_id';
      end if;

      if v_recurso_considerado_empresa_id <> v_empresa_id then
        raise exception 'Recurso considerado % nao pertence a empresa do aprovador.', v_item->>'recurso_considerado_id';
      end if;
    end if;

    if (nullif(v_item->>'necessario', ''))::numeric < 0
      or (nullif(v_item->>'capacidade_bruta', ''))::numeric < 0
      or (nullif(v_item->>'capacidade_efetiva', ''))::numeric < 0
      or (nullif(v_item->>'capacidade_disponivel', ''))::numeric < 0
      or (nullif(v_item->>'comprometido', ''))::numeric < 0
      or (nullif(v_item->>'livre', ''))::numeric < 0
      or (nullif(v_item->>'deficit', ''))::numeric < 0
    then
      raise exception 'Item de simulacao com valor negativo na operacao %: %', v_item->>'bom_operacao_id', v_item;
    end if;
  end loop;

  -- Insercao atomica com tratamento de conflito - a checagem SELECT
  -- feita antes (linha ~108) e so otimizacao para o caminho feliz
  -- (evita todo o trabalho de validacao abaixo quando ja sabemos que e
  -- repeticao); ela NAO e a protecao real contra corrida, porque duas
  -- chamadas concorrentes podem passar pelo SELECT antes de qualquer
  -- uma inserir. A protecao real e o ON CONFLICT aqui: so uma das
  -- chamadas concorrentes consegue inserir de verdade (a outra recebe
  -- NULL de volta, nunca duas linhas para a mesma chave).
  --
  -- Insere com vigente=false de proposito: inserir ja como vigente=true
  -- aqui violaria simulacoes_comerciais_vigente_unico (no maximo 1
  -- vigente por projeto) enquanto a simulacao anterior ainda estiver
  -- vigente=true - so depois de confirmar que VENCEMOS a insercao
  -- (nao so tentamos) e que e seguro desativar a anterior e ativar
  -- esta.
  insert into public.simulacoes_comerciais (
    empresa_id, projeto_id, cenario_demanda, modo_producao, data_necessidade,
    margem_seguranca_dias, janela_inicio, janela_fim, aprovado_por,
    chave_idempotencia, hash_solicitacao, vigente
  )
  values (
    v_empresa_id, p_projeto_id, p_cenario_demanda, p_modo_producao, p_data_necessidade,
    p_margem_seguranca_dias, p_janela_inicio, p_janela_fim, p_aprovado_por,
    p_chave_idempotencia, p_hash_solicitacao, false
  )
  on conflict (empresa_id, chave_idempotencia) where chave_idempotencia is not null
  do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    -- Perdemos a corrida: outra chamada concorrente com a MESMA chave
    -- inseriu primeiro, entre a checagem antecipada e este INSERT.
    -- Busca o que foi gravado de verdade e decide por hash - nunca
    -- trata isso como sucesso silencioso nem tenta inserir de novo.
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

  -- Vencemos a insercao de verdade (RETURNING confirmou, nao so
  -- tentativa) - agora e seguro desativar a simulacao vigente anterior
  -- e ativar esta, sem risco de deixar duas vigentes nem nenhuma.
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
      empresa_id, simulacao_comercial_id,
      bom_operacao_id, recurso_original_id, recurso_considerado_id, motivo_consideracao,
      necessario, capacidade_bruta, capacidade_efetiva, capacidade_disponivel,
      comprometido, livre, deficit
    )
    values (
      v_empresa_id, v_snapshot_id,
      (nullif(v_item->>'bom_operacao_id', ''))::uuid,
      (nullif(v_item->>'recurso_original_id', ''))::uuid, (nullif(v_item->>'recurso_considerado_id', ''))::uuid, v_item->>'motivo_consideracao',
      (nullif(v_item->>'necessario', ''))::numeric, (nullif(v_item->>'capacidade_bruta', ''))::numeric,
      (nullif(v_item->>'capacidade_efetiva', ''))::numeric, (nullif(v_item->>'capacidade_disponivel', ''))::numeric,
      (nullif(v_item->>'comprometido', ''))::numeric, (nullif(v_item->>'livre', ''))::numeric, (nullif(v_item->>'deficit', ''))::numeric
    );
  end loop;

  -- Mesma flag de transacao que a trigger projetos_bloquear_aprovacao_direta
  -- exige (ver 202607190006) - v2 precisa seta-la tambem, e' uma
  -- function diferente da v1 aos olhos da trigger.
  perform set_config('app.aprovacao_via_function', 'true', true);

  update public.projetos
  set status = 'aprovado'
  where id = p_projeto_id;

  return v_snapshot_id;
end;
$function$;

comment on function public.aprovar_projeto_com_simulacao_v2(uuid, uuid, text, text, date, integer, date, date, jsonb, text, text) is
  'Versao 2 da aprovacao da Simulacao Comercial (PAD-008, secoes 7-8) - so chamavel por service_role, atraves de um client privilegiado server-only. Resolve empresa a partir de public.usuarios do aprovador (p_aprovado_por), nunca de parametro do chamador. Idempotente por (empresa_id, p_chave_idempotencia, p_hash_solicitacao): mesma chave e mesmo hash retornam o snapshot ja gravado; mesma chave com hash diferente e conflito, rejeitado (nunca sucesso, nunca sobrescreve). Mesma validacao estrutural e mesma atomicidade da v1 (aprovar_projeto_com_simulacao). Nao recalcula os valores numericos recebidos - a garantia de que eles vieram de uma execucao real do Motor e responsabilidade de quem chama esta function (Server Action, que recalcula no servidor antes de chamar), nao desta RPC.';

-- CREATE FUNCTION concede EXECUTE a PUBLIC por padrao, e o Supabase
-- aplica ALTER DEFAULT PRIVILEGES concedendo EXECUTE a anon e
-- authenticated tambem - os tres revokes abaixo sao necessarios,
-- nenhum e redundante. service_role mantem acesso por ja ser exempt
-- de RLS/grants restritivos por padrao no Supabase; o grant explicito
-- abaixo documenta essa intencao, nao e estritamente necessario para
-- funcionar.
revoke execute on function public.aprovar_projeto_com_simulacao_v2(uuid, uuid, text, text, date, integer, date, date, jsonb, text, text) from public;
revoke execute on function public.aprovar_projeto_com_simulacao_v2(uuid, uuid, text, text, date, integer, date, date, jsonb, text, text) from anon;
revoke execute on function public.aprovar_projeto_com_simulacao_v2(uuid, uuid, text, text, date, integer, date, date, jsonb, text, text) from authenticated;
grant execute on function public.aprovar_projeto_com_simulacao_v2(uuid, uuid, text, text, date, integer, date, date, jsonb, text, text) to service_role;
