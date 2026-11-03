-- NEXOTFE-PCP-ETAPA2O.5G — Integridade, isolamento multiempresa e
-- concorrência das operações da OF (OP/Y/Z/dependências).
--
-- *** MIGRATION CANDIDATA — ARTEFATO DE DESENVOLVIMENTO ***
-- Validada integralmente em sandbox PostgreSQL local descartável
-- (`nexotfe-sbx-pcp-fatia1`, Docker Desktop, fora do repositório) —
-- NÃO aplicada contra o banco remoto/produção (`supabase db push`
-- ou equivalente) até autorização expressa e separada, por escrita
-- específica (CLAUDE.md Regra 9). Nenhuma linha deste arquivo foi
-- aplicada a nenhum ambiente real até o momento em que este comentário
-- foi escrito.
--
-- Origem: cada função abaixo foi extraída via `pg_get_functiondef`
-- diretamente do sandbox, após a correção ter sido testada lá — nunca
-- reconstruída de memória ou de resumo de relatório. Comparada contra
-- a última versão realmente aplicada no repositório antes de escrever
-- este arquivo (não contra a versão original do P6E, quando uma versão
-- mais recente existia — achado real desta rodada: `registrar_
-- apontamento` tinha sido alterada de novo em 20261016090000/PCP-P7C,
-- e uma reconstrução ingênua a partir do P6E teria perdido essa regra;
-- corrigido antes de escrever este arquivo).
--
-- Contagem exata: 7 correções funcionais, distribuídas em 6 funções
-- (regularizar_apontamento, alterar_y_operacao, marcar_op_nao_aplicavel,
-- alterar_dependencia_operacao e criar_op_no_y recebem 1 correção cada;
-- registrar_apontamento recebe 2 — reordenação do lock de nível 3/4 e
-- o novo lock de nível 2 + checagem de OF encerrada).
--
-- Nenhuma assinatura, tipo de retorno ou GRANT foi alterado — CREATE OR
-- REPLACE FUNCTION preserva os GRANTs existentes (service_role apenas,
-- já concedidos em 20261015170000) porque nenhuma assinatura mudou.
-- Confirmado por pg_get_function_identity_arguments no sandbox, antes e
-- depois de cada correção.
--
-- Hierarquia de locks (advisory, por hashtextextended), única e
-- obrigatória em ordem não decrescente para toda função desta família,
-- presente ou futura — evita ciclo de espera formado só entre advisory
-- locks (não elimina deadlock por completo: locks implícitos de linha
-- do Postgres podem, em tese, formar um ciclo com um advisory lock de
-- outra transação mais longa; o detector de deadlock nativo do Postgres
-- continua sendo a rede de segurança final nesse caso — aborta uma das
-- transações, nunca trava o sistema. O chamador precisa estar preparado
-- para capturar esse erro e tentar de novo):
--   nível 1 — 'of_dependencias:<of_id>'               (grafo de dependências da OF)
--   nível 2 — 'ordens_fabricacao:<of_id>'              (ciclo de vida da OF)
--   nível 3 — 'ordens_fabricacao_operacoes:<op_id>'    (Y/execução de uma OP)
--   nível 4 — 'funcionario_apontamento:<funcionario_id>' (limites por colaborador)
-- Quando uma função precisa de dois locks do MESMO nível (ex.: as duas
-- OPs de uma dependência), a ordem entre eles é sempre pelo texto do
-- UUID — nunca pela ordem dos parâmetros do chamador.
--
-- Todas as verificações de negócio (motivo obrigatório, cross-tenant,
-- bloqueio por execução, dependências pendentes) ocorrem SEMPRE depois
-- de todos os locks já adquiridos, nunca antes — fecha a classe de erro
-- de leitura obsoleta (TOCTOU) comprovada em sandbox para
-- alterar_y_operacao antes desta correção.
--
-- Escopo EXCLUÍDO desta migration, por decisão explícita, pendente de
-- nova rodada de decisão de negócio:
--   - Alerta/registro de divergência quando uma OP inicia sem que uma
--     dependência obrigatória tenha sido concluída (proposta "alertar,
--     não bloquear" já aprovada em princípio, ainda não especificada).
--   - Bloqueio automático de início de apontamento por dependência não
--     concluída.
--   - Qualquer nova lógica de sequência numérica (sequencia_vigente
--     continua sendo só planejamento/apresentação, nunca dependência
--     implícita — confirmado por teste real, não precisa de correção).
--   - Validação de sequência lógica dos eventos de apontamento
--     (hoje aceita 'finalizar' sem 'iniciar' prévio) — registrado como
--     pendência separada, fora do escopo de integridade/concorrência.
--   - Motor PCP, Simulação Comercial, Server Actions, migration
--     Revisão 3 (confirmação de necessidades) — nenhum tocado aqui.
begin;

-- =====================================================================
-- 1/7 — regularizar_apontamento
-- ANTES: p_op_id e p_apontamento_id eram parâmetros independentes, sem
-- validação cruzada — um apontamento real de uma OP podia ser
-- referenciado com p_op_id de OUTRA OP. Efeito comprovado em sandbox:
-- o evento real desaparecia de of_apontamentos_efetivos(OP verdadeira)
-- e um evento FABRICADO (inclusive 'finalizar', por default de
-- coalesce) aparecia em of_apontamentos_efetivos(OP informada) — capaz
-- de fazer op_esta_resolvida() mentir nos dois sentidos.
-- DEPOIS: quando p_apontamento_id não é nulo, op_id/empresa_id são
-- SEMPRE derivados do apontamento original (nunca aceitos do parâmetro
-- p_op_id nesse caso) — divergência é rejeitada explicitamente antes de
-- qualquer escrita.
-- =====================================================================
create or replace function public.regularizar_apontamento(p_op_id uuid, p_funcionario_id uuid, p_apontamento_id uuid, p_valor_novo jsonb, p_data_execucao_real timestamp with time zone, p_retroativo boolean, p_corrigido_por uuid, p_motivo text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_of_id uuid;
  v_estado_execucao text;
  v_valor_anterior jsonb;
  v_novo_id uuid;
  v_corrigido_por_empresa_id uuid;
  v_apontamento_op_id uuid;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'motivo e obrigatorio para toda regularizacao/correcao (PCP-P6B.2).';
  end if;

  if p_apontamento_id is not null then
    select op_id, empresa_id, to_jsonb(a) into v_apontamento_op_id, v_empresa_id, v_valor_anterior
    from public.of_apontamentos a where a.id = p_apontamento_id;

    if v_apontamento_op_id is null then
      raise exception 'regularizar_apontamento: apontamento % nao encontrado.', p_apontamento_id;
    end if;

    if v_apontamento_op_id is distinct from p_op_id then
      raise exception 'regularizar_apontamento: apontamento % pertence a OP %, nao a OP % informada - divergencia rejeitada.', p_apontamento_id, v_apontamento_op_id, p_op_id;
    end if;
  else
    select empresa_id into v_empresa_id from public.ordens_fabricacao_operacoes where id = p_op_id;
  end if;

  select of_id into v_of_id from public.ordens_fabricacao_operacoes where id = p_op_id;

  if v_empresa_id is null then
    raise exception 'OP % nao encontrada.', p_op_id;
  end if;

  select empresa_id into v_corrigido_por_empresa_id from public.usuarios where id = p_corrigido_por;
  if v_corrigido_por_empresa_id is null or v_corrigido_por_empresa_id is distinct from v_empresa_id then
    raise exception 'regularizar_apontamento: corrigido_por % nao e um usuario valido da empresa % do apontamento/OP %.', p_corrigido_por, v_empresa_id, p_op_id;
  end if;

  select estado_execucao into v_estado_execucao from public.ordens_fabricacao where id = v_of_id;
  if v_estado_execucao = 'concluida' then
    raise exception 'OF % esta encerrada - regularizacao so e permitida com a OF aberta (PCP-P6B.2).', v_of_id;
  end if;

  insert into public.of_apontamento_correcoes (
    empresa_id, apontamento_id, op_id, funcionario_id, valor_anterior, valor_novo,
    data_execucao_real, retroativo, corrigido_por, motivo
  ) values (
    v_empresa_id, p_apontamento_id, p_op_id, p_funcionario_id, v_valor_anterior, p_valor_novo,
    p_data_execucao_real, p_retroativo, p_corrigido_por, p_motivo
  )
  returning id into v_novo_id;

  return v_novo_id;
end;
$function$;

comment on function public.regularizar_apontamento(uuid, uuid, uuid, jsonb, timestamptz, boolean, uuid, text) is
  'ETAPA 2O.5G: op_id/empresa_id agora derivados do apontamento original quando p_apontamento_id e informado - nunca aceitos do parametro solto. Corrige vulnerabilidade real comprovada em sandbox (mismatch permitia esconder execucao real e fabricar conclusao de outra OP). Mantem motivo obrigatorio, validacao cross-tenant de corrigido_por e bloqueio com OF encerrada, exatamente como na Etapa 2O.5F.';

-- =====================================================================
-- 2/7 — alterar_y_operacao
-- ANTES: lia os valores "anteriores" (recurso/tempo/sequencia) ANTES de
-- adquirir o advisory lock - duas chamadas concorrentes na mesma OP
-- podiam capturar o mesmo snapshot desatualizado, gravando um
-- valor_anterior incorreto na auditoria (comprovado por teste real sob
-- carga concorrente - trilha final ficou coerente só depois da
-- correcao). Também não existia NENHUM bloqueio de execucao - uma OP
-- com apontamento real podia ter Y alterado livremente.
-- DEPOIS: lock adquirido primeiro; bloqueio de execucao via
-- of_apontamentos CRUA (nunca of_apontamentos_efetivos, por ser
-- manipulavel - ver correcao 1/7); cross-tenant preservado.
-- =====================================================================
create or replace function public.alterar_y_operacao(p_op_id uuid, p_alterado_por uuid, p_recurso_vigente_id uuid DEFAULT NULL::uuid, p_tempo_vigente_minutos numeric DEFAULT NULL::numeric, p_sequencia_vigente smallint DEFAULT NULL::smallint, p_motivo text DEFAULT NULL::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_recurso_anterior uuid;
  v_tempo_anterior numeric;
  v_sequencia_anterior smallint;
  v_alterado_por_empresa_id uuid;
begin
  if p_alterado_por is null then
    raise exception 'p_alterado_por e obrigatorio.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao_operacoes:' || p_op_id::text, 0));

  select empresa_id, recurso_vigente_id, tempo_vigente_minutos, sequencia_vigente
    into v_empresa_id, v_recurso_anterior, v_tempo_anterior, v_sequencia_anterior
  from public.ordens_fabricacao_operacoes
  where id = p_op_id;

  if v_empresa_id is null then
    raise exception 'OP % nao encontrada.', p_op_id;
  end if;

  select empresa_id into v_alterado_por_empresa_id from public.usuarios where id = p_alterado_por;
  if v_alterado_por_empresa_id is null or v_alterado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'alterar_y_operacao: alterado_por % nao e um usuario valido da empresa % da OP %.', p_alterado_por, v_empresa_id, p_op_id;
  end if;

  if exists (select 1 from public.of_apontamentos where op_id = p_op_id) then
    raise exception 'alterar_y_operacao: OP % ja tem execucao registrada - planejamento (Y) bloqueado apos inicio.', p_op_id;
  end if;

  if p_recurso_vigente_id is not null and p_recurso_vigente_id is distinct from v_recurso_anterior then
    update public.ordens_fabricacao_operacoes set recurso_vigente_id = p_recurso_vigente_id where id = p_op_id;
    insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
      values (v_empresa_id, p_op_id, 'recurso_vigente_id', v_recurso_anterior::text, p_recurso_vigente_id::text, p_alterado_por, p_motivo);
  end if;

  if p_tempo_vigente_minutos is not null and p_tempo_vigente_minutos is distinct from v_tempo_anterior then
    update public.ordens_fabricacao_operacoes set tempo_vigente_minutos = p_tempo_vigente_minutos where id = p_op_id;
    insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
      values (v_empresa_id, p_op_id, 'tempo_vigente_minutos', v_tempo_anterior::text, p_tempo_vigente_minutos::text, p_alterado_por, p_motivo);
  end if;

  if p_sequencia_vigente is not null and p_sequencia_vigente is distinct from v_sequencia_anterior then
    update public.ordens_fabricacao_operacoes set sequencia_vigente = p_sequencia_vigente where id = p_op_id;
    insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
      values (v_empresa_id, p_op_id, 'sequencia_vigente', v_sequencia_anterior::text, p_sequencia_vigente::text, p_alterado_por, p_motivo);
  end if;
end;
$function$;

comment on function public.alterar_y_operacao(uuid, uuid, uuid, numeric, smallint, text) is
  'ETAPA 2O.5G: lock de nivel 3 adquirido ANTES de qualquer leitura (fecha TOCTOU comprovado sob concorrencia real) + bloqueio individual por OP (nunca geral da OF) via of_apontamentos crua quando ja existe execucao registrada. Cross-tenant da Etapa 2O.5F preservado.';

-- =====================================================================
-- 3/7 — marcar_op_nao_aplicavel
-- ANTES: sem validacao cross-tenant; sem checagem de dependencias
-- relacionadas (podia "esconder" uma OP que ainda era origem/destino de
-- uma aresta); sem bloqueio de execucao.
-- DEPOIS: exige ausencia de dependencias relacionadas (lista quais,
-- pede revisao explicita via alterar_dependencia_operacao - nunca
-- remove nada automaticamente) e ausencia de execucao, nessa ordem;
-- locks hierarquicos (nivel 1 -> nivel 3); cross-tenant.
-- =====================================================================
create or replace function public.marcar_op_nao_aplicavel(p_op_id uuid, p_marcado_por uuid, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_of_id uuid;
  v_marcado_por_empresa_id uuid;
  v_deps_pendentes text;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'motivo e obrigatorio para marcar OP como nao aplicavel.';
  end if;

  select empresa_id, of_id into v_empresa_id, v_of_id from public.ordens_fabricacao_operacoes where id = p_op_id;
  if v_empresa_id is null then
    raise exception 'OP % nao encontrada.', p_op_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of_dependencias:' || v_of_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao_operacoes:' || p_op_id::text, 0));

  select empresa_id into v_marcado_por_empresa_id from public.usuarios where id = p_marcado_por;
  if v_marcado_por_empresa_id is null or v_marcado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'marcar_op_nao_aplicavel: marcado_por % nao e um usuario valido da empresa % da OP %.', p_marcado_por, v_empresa_id, p_op_id;
  end if;

  select string_agg(distinct d.op_origem_id::text || '->' || d.op_dependente_id::text, ', ')
    into v_deps_pendentes
  from public.of_operacao_dependencias d
  where d.op_origem_id = p_op_id or d.op_dependente_id = p_op_id;

  if v_deps_pendentes is not null then
    raise exception 'marcar_op_nao_aplicavel: OP % tem dependencias relacionadas (%) - revise ou remova via alterar_dependencia_operacao antes de marcar como nao aplicavel.', p_op_id, v_deps_pendentes;
  end if;

  if exists (select 1 from public.of_apontamentos where op_id = p_op_id) then
    raise exception 'marcar_op_nao_aplicavel: OP % ja tem execucao registrada - remocao operacional bloqueada apos inicio.', p_op_id;
  end if;

  update public.ordens_fabricacao_operacoes
  set nao_aplicavel = true, motivo_nao_aplicavel = p_motivo
  where id = p_op_id;

  insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
    values (v_empresa_id, p_op_id, 'nao_aplicavel', 'false', 'true', p_marcado_por, p_motivo);
end;
$function$;

comment on function public.marcar_op_nao_aplicavel(uuid, uuid, text) is
  'ETAPA 2O.5G: exige dependencias relacionadas ja revisadas/removidas (nunca remove automaticamente) e ausencia de execucao registrada, antes de marcar nao_aplicavel. Locks de nivel 1 (dependencias) e nivel 3 (OP). Cross-tenant adicionado (classe de vulnerabilidade igual a corrigida em alterar_y_operacao na Etapa 2O.5F, nunca replicada aqui antes).';

-- =====================================================================
-- 4/7 — alterar_dependencia_operacao
-- ANTES: sem validacao cross-tenant de p_alterado_por; sem bloqueio de
-- execucao - uma dependencia podia ser criada/removida envolvendo uma
-- OP que ja tinha apontamento real, alterando retroativamente o
-- planejamento de uma OP iniciada.
-- DEPOIS: cross-tenant adicionado; bloqueio por execucao em QUALQUER
-- uma das duas OPs; locks de nivel 3 nas duas OPs, SEMPRE ordenados
-- pelo texto do UUID (nunca pela ordem dos parametros) - fecha o risco
-- de deadlock entre duas chamadas concorrentes com o par invertido,
-- comprovado sem deadlock em teste real (T4).
-- =====================================================================
create or replace function public.alterar_dependencia_operacao(p_op_origem_id uuid, p_op_dependente_id uuid, p_acao text, p_alterado_por uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_empresa_dependente uuid;
  v_of_origem uuid;
  v_of_dependente uuid;
  v_alterado_por_empresa_id uuid;
  v_primeiro uuid;
  v_segundo uuid;
begin
  if p_acao not in ('criar', 'remover') then
    raise exception 'p_acao invalida: % (esperado criar ou remover).', p_acao;
  end if;

  select empresa_id, of_id into v_empresa_id, v_of_origem from public.ordens_fabricacao_operacoes where id = p_op_origem_id;
  select empresa_id, of_id into v_empresa_dependente, v_of_dependente from public.ordens_fabricacao_operacoes where id = p_op_dependente_id;

  if v_empresa_id is null or v_empresa_dependente is null then
    raise exception 'OP origem ou dependente nao encontrada.';
  end if;
  if v_empresa_id is distinct from v_empresa_dependente then
    raise exception 'OPs pertencem a empresas diferentes.';
  end if;
  if v_of_origem is distinct from v_of_dependente then
    raise exception 'Dependencia so e permitida entre OPs da MESMA OF (PCP-P6C.3 Parte 19).';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of_dependencias:' || v_of_origem::text, 0));

  if p_op_origem_id::text < p_op_dependente_id::text then
    v_primeiro := p_op_origem_id; v_segundo := p_op_dependente_id;
  else
    v_primeiro := p_op_dependente_id; v_segundo := p_op_origem_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao_operacoes:' || v_primeiro::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao_operacoes:' || v_segundo::text, 0));

  select empresa_id into v_alterado_por_empresa_id from public.usuarios where id = p_alterado_por;
  if v_alterado_por_empresa_id is null or v_alterado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'alterar_dependencia_operacao: alterado_por % nao e um usuario valido da empresa %.', p_alterado_por, v_empresa_id;
  end if;

  if exists (select 1 from public.of_apontamentos where op_id in (p_op_origem_id, p_op_dependente_id)) then
    raise exception 'alterar_dependencia_operacao: uma das OPs (% ou %) ja tem execucao registrada - dependencia nao pode mais ser alterada.', p_op_origem_id, p_op_dependente_id;
  end if;

  if p_acao = 'criar' then
    if public.existe_caminho_dependencia(p_op_dependente_id, p_op_origem_id) then
      raise exception 'Dependencia rejeitada: criaria ciclo (ja existe caminho de % para %).', p_op_dependente_id, p_op_origem_id;
    end if;

    insert into public.of_operacao_dependencias (empresa_id, op_origem_id, op_dependente_id, created_by)
    values (v_empresa_id, p_op_origem_id, p_op_dependente_id, p_alterado_por)
    on conflict (op_origem_id, op_dependente_id) do nothing;
  else
    delete from public.of_operacao_dependencias
    where op_origem_id = p_op_origem_id and op_dependente_id = p_op_dependente_id;
  end if;
end;
$function$;

comment on function public.alterar_dependencia_operacao(uuid, uuid, text, uuid) is
  'ETAPA 2O.5G: cross-tenant adicionado; bloqueia criar/remover quando qualquer uma das duas OPs ja tem execucao registrada (revisao de dependencia nunca altera retroativamente planejamento de OP iniciada); locks de nivel 3 em ambas as OPs, ordenados por texto do UUID para nunca formar ciclo de espera com uma chamada concorrente de par invertido.';

-- =====================================================================
-- 5/7 — criar_op_no_y
-- ANTES: p_motivo era opcional; sem validacao cross-tenant; sem lock -
-- corria risco de uma OP nova ser inserida na janela exata em que
-- encerrar_of decide que a OF pode ser encerrada (comprovado sem
-- contencao em teste real antes da correcao).
-- DEPOIS: motivo obrigatorio (regra de negocio "toda OP nova exige
-- justificativa e autoria"); cross-tenant; lock de nivel 2 (mesmo
-- dominio de encerrar_of) antes do insert. PRESERVADO: OP nova continua
-- permitida em OF liberada ou em producao (nunca bloqueada so por haver
-- outras OPs ja executadas) - confirmado por teste real com OF em
-- execucao.
-- =====================================================================
create or replace function public.criar_op_no_y(p_of_id uuid, p_criado_por uuid, p_codigo_operacional text, p_descricao text, p_sequencia_vigente smallint, p_recurso_vigente_id uuid DEFAULT NULL::uuid, p_tempo_vigente_minutos numeric DEFAULT NULL::numeric, p_motivo text DEFAULT NULL::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_novo_op_id uuid;
  v_criado_por_empresa_id uuid;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'criar_op_no_y: motivo/justificativa e obrigatorio para toda OP nova no Y.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao:' || p_of_id::text, 0));

  select empresa_id into v_empresa_id from public.ordens_fabricacao where id = p_of_id;
  if v_empresa_id is null then
    raise exception 'OF % nao encontrada.', p_of_id;
  end if;

  select empresa_id into v_criado_por_empresa_id from public.usuarios where id = p_criado_por;
  if v_criado_por_empresa_id is null or v_criado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'criar_op_no_y: criado_por % nao e um usuario valido da empresa % da OF %.', p_criado_por, v_empresa_id, p_of_id;
  end if;

  insert into public.ordens_fabricacao_operacoes (
    empresa_id, of_id, origem, codigo_operacional, descricao,
    recurso_vigente_id, tempo_vigente_minutos, sequencia_vigente, created_by
  ) values (
    v_empresa_id, p_of_id, 'y', p_codigo_operacional, p_descricao,
    p_recurso_vigente_id, p_tempo_vigente_minutos, p_sequencia_vigente, p_criado_por
  )
  returning id into v_novo_op_id;

  insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
    values (v_empresa_id, v_novo_op_id, 'criacao', null, 'OP criada operacionalmente (origem=y)', p_criado_por, p_motivo);

  return v_novo_op_id;
end;
$function$;

comment on function public.criar_op_no_y(uuid, uuid, text, text, smallint, uuid, numeric, text) is
  'ETAPA 2O.5G: motivo passa a ser obrigatorio sempre (regra de negocio, nao so quando a OF ja esta em execucao); cross-tenant adicionado; lock de nivel 2 antes do insert, mesmo dominio de encerrar_of. Inclusao de OP em OF ja em execucao continua permitida - confirmado por teste real (Y/apontamentos de OPs ja iniciadas permanecem intocados).';

-- =====================================================================
-- 6/7 e 7/7 — registrar_apontamento
-- ANTES (duas lacunas distintas):
--   a) Nenhum lock compartilhado com alterar_y_operacao - um apontamento
--      podia ser inserido ao mesmo tempo em que o Y da mesma OP estava
--      sendo alterado, sem nenhuma serializacao (comprovado: chamada
--      concorrente completava em 0s onde deveria esperar).
--   b) Nenhum lock compartilhado com encerrar_of - um apontamento podia
--      ser inserido na janela exata entre of_pode_encerrar()=true e o
--      COMMIT do encerramento, deixando a OF concluida com uma OP em
--      sessao aberta (reproduzido de ponta a ponta em sandbox, com
--      estado final inconsistente comprovado, nao so tempo de espera).
-- DEPOIS: lock de nivel 2 (OF) adquirido primeiro, com checagem
-- explicita de OF encerrada; lock de nivel 3 (OP) adquirido depois,
-- antes do lock de nivel 4 (funcionario) que ja existia. A validacao de
-- estado da OF para 'iniciar'/'retomar' (PCP-P7C, migration
-- 20261016090000) foi criteriosamente preservada linha a linha - achado
-- real desta rodada: uma reconstrucao a partir da versao original do
-- P6E teria perdido essa regra; a versao abaixo foi conferida contra a
-- ultima versao realmente aplicada no repositorio antes de ser escrita.
-- =====================================================================
create or replace function public.registrar_apontamento(p_op_id uuid, p_funcionario_id uuid, p_tipo_evento text, p_ocorrido_em timestamp with time zone, p_recurso_real_id uuid DEFAULT NULL::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_of_id uuid;
  v_estado_execucao_of text;
  v_timezone text;
  v_dia_local date;
  v_pausas_hoje integer;
  v_sessoes_ativas integer;
  v_novo_id uuid;
begin
  if p_tipo_evento not in ('iniciar', 'pausar', 'retomar', 'finalizar') then
    raise exception 'tipo_evento invalido: %.', p_tipo_evento;
  end if;

  select op.empresa_id, op.of_id into v_empresa_id, v_of_id
  from public.ordens_fabricacao_operacoes op
  where op.id = p_op_id;

  if v_empresa_id is null then
    raise exception 'OP % nao encontrada.', p_op_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao:' || v_of_id::text, 0));

  select estado_execucao into v_estado_execucao_of from public.ordens_fabricacao where id = v_of_id;

  if v_estado_execucao_of = 'concluida' then
    raise exception 'registrar_apontamento: OF % ja esta encerrada - nenhum apontamento novo e permitido.', v_of_id;
  end if;

  -- PCP-P7C (preservado - NAO reescrever): iniciar exige OF liberada ou
  -- ja em producao; retomar exige OF ja em producao. pausar/finalizar
  -- nunca bloqueados por liberacao - so encerram trabalho ja em curso.
  if p_tipo_evento = 'iniciar' then
    if v_estado_execucao_of not in ('liberada', 'em_producao') then
      raise exception 'OF % nao esta liberada (estado_execucao=%) - nao e possivel iniciar apontamento.', v_of_id, v_estado_execucao_of;
    end if;
  elsif p_tipo_evento = 'retomar' then
    if v_estado_execucao_of is distinct from 'em_producao' then
      raise exception 'OF % nao esta em producao (estado_execucao=%) - nao e possivel retomar apontamento.', v_of_id, v_estado_execucao_of;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao_operacoes:' || p_op_id::text, 0));

  select timezone into v_timezone from public.empresas where id = v_empresa_id;
  v_dia_local := (p_ocorrido_em at time zone v_timezone)::date;

  perform pg_advisory_xact_lock(hashtextextended('funcionario_apontamento:' || p_funcionario_id::text, 0));

  if p_tipo_evento = 'pausar' then
    select count(*) into v_pausas_hoje
    from public.of_apontamentos
    where funcionario_id = p_funcionario_id
      and tipo_evento = 'pausar'
      and (ocorrido_em at time zone v_timezone)::date = v_dia_local;

    if v_pausas_hoje >= 4 then
      raise exception 'Funcionario % ja realizou 4 pausas hoje (dia local %) - limite diario atingido (PCP-P6C.4).', p_funcionario_id, v_dia_local;
    end if;
  end if;

  if p_tipo_evento = 'iniciar' then
    select count(*) into v_sessoes_ativas
    from (
      select distinct a.op_id
      from public.of_apontamentos a
      where a.funcionario_id = p_funcionario_id
        and a.ocorrido_em = (
          select max(a2.ocorrido_em) from public.of_apontamentos a2
          where a2.funcionario_id = p_funcionario_id and a2.op_id = a.op_id
        )
        and a.tipo_evento in ('iniciar', 'retomar')
    ) ativas;

    if v_sessoes_ativas >= 3 then
      raise exception 'Funcionario % ja possui 3 OPs simultaneamente ativas - limite atingido (PCP-P6C.4).', p_funcionario_id;
    end if;
  end if;

  insert into public.of_apontamentos (
    empresa_id, of_id, op_id, funcionario_id, recurso_real_id, tipo_evento, ocorrido_em
  ) values (
    v_empresa_id, v_of_id, p_op_id, p_funcionario_id, p_recurso_real_id, p_tipo_evento, p_ocorrido_em
  )
  returning id into v_novo_id;

  return v_novo_id;
end;
$function$;

comment on function public.registrar_apontamento(uuid, uuid, text, timestamptz, uuid) is
  'ETAPA 2O.5G: lock de nivel 2 (OF) adquirido primeiro, com checagem explicita de OF encerrada - fecha corrida real comprovada contra encerrar_of (OF podia ficar concluida com OP em sessao aberta). Lock de nivel 3 (OP) adquirido antes do lock de nivel 4 (funcionario) - fecha corrida real comprovada contra alterar_y_operacao. Validacao de estado da OF para iniciar/retomar (PCP-P7C, 20261016090000) preservada integralmente.';

commit;
