-- PCP-P8H: persistencia e versionamento do resultado do Motor B (DEC-P8-04
-- em diante). Camada estritamente POSTERIOR ao assembler/Motor - nunca os
-- altera. Ver memoria pcp_p8_motor_b_integracao.md para o historico
-- completo das decisoes (DEC-P8-01 a 04) que levam a este desenho.
--
-- Revisao P8H (7 correcoes antes do sandbox):
-- 1. Concorrencia: releitura de empresa_capacidade_versoes.versao e'
--    SELECT ... FOR UPDATE (nunca SELECT simples) - fecha a janela entre
--    checar e persistir, contendo com o UPDATE implicito de QUALQUER
--    trigger de bump na mesma linha, sem precisar coordenar com as RPCs
--    operacionais (elas nunca precisam saber desta RPC).
-- 2. Identidade: mesmo modelo de confianca de liberar_of/cancelar_of/
--    criar_of_substituta (ator explicito validado contra usuarios,
--    nunca auth.uid(), service_role-only) - reforcado com checagem de
--    profiles.ativo=true (usuario desativado nunca autora uma versao).
-- 3. FKs compostas (id, empresa_id) em toda tabela nova - confirmado por
--    leitura real do catalogo que ordens_fabricacao_operacoes nao tem
--    DELETE concedido a service_role/authenticated, nunca orfaniza.
-- 4. Validacao completa do JSONB recebido, ANTES de qualquer INSERT.
-- 5. Triggers de staleness cobrindo ordens_fabricacao_operacoes (todo o
--    Y), of_operacao_dependencias, pcp_fila_projetos, e eventos reais de
--    Z (of_apontamentos, so iniciar/finalizar) E of_apontamento_correcoes
--    (achado do P8H: faltava, uma correcao pode mudar retroativamente a
--    classificacao efetiva de uma OP).
-- 6. Coluna renomeada para status_calculo_motor (nunca "status" solto) -
--    nunca confundir com estado real de execucao (op_esta_resolvida/Z).
-- 7. Chave do advisory lock explicita via hashtextextended, mesma
--    convencao de todo o ciclo ('of-transicao:', 'funcionario_apontamento:').
--
-- Append-only: tabelas filhas via impedir_update_delete_historico() (ja
-- existente, reaproveitada sem alteracao). Cabecalho via funcao propria
-- que so permite UPDATE da coluna vigente.

begin;

-- =====================================================================
-- 1. Triggers novos de staleness em empresa_capacidade_versoes.
-- =====================================================================
create trigger ordens_fabricacao_operacoes_bump_capacidade_versao
  after insert or update or delete on public.ordens_fabricacao_operacoes
  for each row execute function public.trg_bump_capacidade_versao_por_empresa_id();

create trigger of_operacao_dependencias_bump_capacidade_versao
  after insert or update or delete on public.of_operacao_dependencias
  for each row execute function public.trg_bump_capacidade_versao_por_empresa_id();

create trigger pcp_fila_projetos_bump_capacidade_versao
  after insert or update or delete on public.pcp_fila_projetos
  for each row execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- INV-P8G-01: so iniciar/finalizar mudam a classificacao operacional
-- relevante da OP (nunca_iniciada -> iniciada, iniciada -> resolvida).
-- pausar/retomar nunca disparam.
create trigger of_apontamentos_bump_capacidade_versao
  after insert on public.of_apontamentos
  for each row
  when (new.tipo_evento in ('iniciar', 'finalizar'))
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- Achado do P8H: faltava. Correcao/regularizacao pode mudar
-- retroativamente a classificacao efetiva (of_apontamentos_efetivos) -
-- bump incondicional (evento raro, conservador, nunca falso negativo).
create trigger of_apontamento_correcoes_bump_capacidade_versao
  after insert on public.of_apontamento_correcoes
  for each row execute function public.trg_bump_capacidade_versao_por_empresa_id();

comment on trigger ordens_fabricacao_operacoes_bump_capacidade_versao on public.ordens_fabricacao_operacoes is
  'PCP-P8H: fecha o gap de staleness do Y (recurso/tempo/sequencia/nao_aplicavel/saldo estimado) encontrado no P8G - antes nenhuma mudanca de Y invalidava empresa_capacidade_versoes.';
comment on trigger pcp_fila_projetos_bump_capacidade_versao on public.pcp_fila_projetos is
  'PCP-P8H: fecha o gap de staleness da fila - antes mudar a posicao de um projeto nao invalidava empresa_capacidade_versoes.';

-- =====================================================================
-- 2. pcp_programacoes - cabecalho, 1 linha por versao, imutavel exceto
--    a coluna vigente.
-- =====================================================================
create table public.pcp_programacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  versao_sequencial bigint not null,
  vigente boolean not null default true,
  versao_formato_programacao smallint not null default 1,
  empresa_capacidade_versao_origem bigint not null,
  janela_inicio date not null,
  janela_fim date not null,
  criada_em timestamptz not null default now(),
  criada_por uuid not null references auth.users (id),
  motivo text null,

  constraint pcp_programacoes_empresa_versao_uniq unique (empresa_id, versao_sequencial),
  constraint pcp_programacoes_id_empresa_uniq unique (id, empresa_id),
  constraint pcp_programacoes_janela_chk check (janela_fim >= janela_inicio)
);

comment on table public.pcp_programacoes is
  'PCP-P8H: 1 linha por versao calculada do Motor B, imutavel apos criada (so a coluna vigente pode mudar). empresa_capacidade_versao_origem = snapshot do contador no instante do calculo, usado para detectar desatualizacao na leitura (versao_atual != origem) - nunca persistido como boolean derivavel.';
comment on column public.pcp_programacoes.versao_formato_programacao is
  'Versao do FORMATO/contrato produzido por este desenho da persistencia (nunca do calculo em si) - mesmo papel de versao_resultado_motor/versao_snapshot do Comercial.';

create unique index pcp_programacoes_empresa_vigente_uniq
  on public.pcp_programacoes (empresa_id)
  where vigente = true;

create index pcp_programacoes_empresa_versao_desc_idx
  on public.pcp_programacoes (empresa_id, versao_sequencial desc);

create or replace function public.impedir_alteracao_programacao_exceto_vigente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'pcp_programacoes: delete fisico nunca permitido (historico append-only).';
  end if;

  if new.empresa_id is distinct from old.empresa_id
     or new.versao_sequencial is distinct from old.versao_sequencial
     or new.versao_formato_programacao is distinct from old.versao_formato_programacao
     or new.empresa_capacidade_versao_origem is distinct from old.empresa_capacidade_versao_origem
     or new.janela_inicio is distinct from old.janela_inicio
     or new.janela_fim is distinct from old.janela_fim
     or new.criada_em is distinct from old.criada_em
     or new.criada_por is distinct from old.criada_por
     or new.motivo is distinct from old.motivo
  then
    raise exception 'pcp_programacoes: so a coluna vigente pode ser alterada depois de criada.';
  end if;

  return new;
end;
$function$;

create trigger pcp_programacoes_impedir_alteracao
  before update or delete on public.pcp_programacoes
  for each row execute function public.impedir_alteracao_programacao_exceto_vigente();

-- =====================================================================
-- 3. pcp_programacao_operacoes - 1 linha por ocorrencia, identidade =
--    op_id (nunca bom_operacao_id). Append-only.
-- =====================================================================
create table public.pcp_programacao_operacoes (
  id uuid primary key default gen_random_uuid(),
  programacao_id uuid not null,
  empresa_id uuid not null references public.empresas (id),
  op_id uuid not null,
  of_id uuid not null,
  projeto_id uuid not null,
  prioridade_usada numeric not null,
  status_calculo_motor text not null,
  data_inicio_prevista date null,
  data_fim_prevista date null,
  deficit_residual_horas_padrao numeric not null default 0,

  constraint pcp_programacao_operacoes_id_empresa_uniq unique (id, empresa_id),
  constraint pcp_programacao_operacoes_programacao_fk
    foreign key (programacao_id, empresa_id) references public.pcp_programacoes (id, empresa_id),
  constraint pcp_programacao_operacoes_op_fk
    foreign key (op_id, empresa_id) references public.ordens_fabricacao_operacoes (id, empresa_id),
  constraint pcp_programacao_operacoes_of_fk
    foreign key (of_id, empresa_id) references public.ordens_fabricacao (id, empresa_id),
  constraint pcp_programacao_operacoes_programacao_op_uniq unique (programacao_id, op_id),
  constraint pcp_programacao_operacoes_status_chk
    check (status_calculo_motor in ('concluida', 'bloqueada_por_deficit', 'bloqueada_por_predecessora'))
);

comment on column public.pcp_programacao_operacoes.status_calculo_motor is
  'PCP-P8H: status do CALCULO do Motor para esta ocorrencia (contrato de StatusOcorrenciaEscalonada) - nunca o estado real de execucao da OP (isso e op_esta_resolvida()/Z). Nome nunca "status" solto, de proposito.';

create index pcp_programacao_operacoes_programacao_idx on public.pcp_programacao_operacoes (programacao_id);
create index pcp_programacao_operacoes_op_idx on public.pcp_programacao_operacoes (op_id);

create trigger pcp_programacao_operacoes_impedir_alteracao
  before update or delete on public.pcp_programacao_operacoes
  for each row execute function public.impedir_update_delete_historico();

-- =====================================================================
-- 4. pcp_programacao_alocacoes - N linhas por OP/data/recurso. Append-only.
-- =====================================================================
create table public.pcp_programacao_alocacoes (
  id uuid primary key default gen_random_uuid(),
  programacao_operacao_id uuid not null,
  empresa_id uuid not null references public.empresas (id),
  data date not null,
  recurso_id uuid not null,
  natureza text not null,
  horas_maquina numeric not null,
  horas_padrao numeric not null,

  constraint pcp_programacao_alocacoes_operacao_fk
    foreign key (programacao_operacao_id, empresa_id) references public.pcp_programacao_operacoes (id, empresa_id),
  constraint pcp_programacao_alocacoes_recurso_fk
    foreign key (recurso_id, empresa_id) references public.recursos_produtivos (id, empresa_id),
  constraint pcp_programacao_alocacoes_natureza_chk
    check (natureza in ('normal', 'hora_extra', 'sabado', 'domingo', 'feriado')),
  constraint pcp_programacao_alocacoes_horas_maquina_chk check (horas_maquina > 0),
  constraint pcp_programacao_alocacoes_horas_padrao_chk check (horas_padrao > 0)
);

create index pcp_programacao_alocacoes_operacao_idx on public.pcp_programacao_alocacoes (programacao_operacao_id);
create index pcp_programacao_alocacoes_recurso_data_idx on public.pcp_programacao_alocacoes (recurso_id, data);

create trigger pcp_programacao_alocacoes_impedir_alteracao
  before update or delete on public.pcp_programacao_alocacoes
  for each row execute function public.impedir_update_delete_historico();

-- =====================================================================
-- 5. RLS/ACL - mesmo padrao real das demais tabelas do PCP: SELECT
--    restrito a tenant para authenticated, zero DML direto para
--    qualquer papel de cliente, escrita so pela RPC abaixo.
-- =====================================================================
alter table public.pcp_programacoes enable row level security;
alter table public.pcp_programacao_operacoes enable row level security;
alter table public.pcp_programacao_alocacoes enable row level security;

create policy pcp_programacoes_select_tenant on public.pcp_programacoes
  for select to authenticated using (empresa_id = public.empresa_atual_id());
create policy pcp_programacao_operacoes_select_tenant on public.pcp_programacao_operacoes
  for select to authenticated using (empresa_id = public.empresa_atual_id());
create policy pcp_programacao_alocacoes_select_tenant on public.pcp_programacao_alocacoes
  for select to authenticated using (empresa_id = public.empresa_atual_id());

revoke all privileges on table public.pcp_programacoes from public, anon, authenticated, service_role;
revoke all privileges on table public.pcp_programacao_operacoes from public, anon, authenticated, service_role;
revoke all privileges on table public.pcp_programacao_alocacoes from public, anon, authenticated, service_role;

grant select on table public.pcp_programacoes to authenticated;
grant select on table public.pcp_programacao_operacoes to authenticated;
grant select on table public.pcp_programacao_alocacoes to authenticated;

-- =====================================================================
-- 6. persistir_programacao_pcp - unica via de escrita. SECURITY
--    DEFINER, fail-closed, service_role-only.
-- =====================================================================
create or replace function public.persistir_programacao_pcp(
  p_criado_por uuid,
  p_empresa_capacidade_versao_origem bigint,
  p_janela_inicio date,
  p_janela_fim date,
  p_ocorrencias jsonb,
  p_motivo text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_ativo boolean;
  v_versao_atual bigint;
  v_proxima_versao bigint;
  v_programacao_id uuid;
  v_ocorrencia jsonb;
  v_alocacao jsonb;
  v_op_id uuid;
  v_programacao_operacao_id uuid;
  v_chaves_vistas uuid[] := array[]::uuid[];
begin
  if p_janela_fim < p_janela_inicio then
    raise exception 'persistir_programacao_pcp: janela_fim (%) anterior a janela_inicio (%).', p_janela_fim, p_janela_inicio;
  end if;

  -- Identidade (P8H correcao 2): ator validado contra usuarios + ativo
  -- em profiles - usuario desativado nunca autora uma versao vigente.
  select u.empresa_id, coalesce(pr.ativo, false) into v_empresa_id, v_ativo
  from public.usuarios u
  left join public.profiles pr on pr.id = u.id
  where u.id = p_criado_por;

  if v_empresa_id is null then
    raise exception 'persistir_programacao_pcp: criado_por % nao e um usuario valido.', p_criado_por;
  end if;
  if not v_ativo then
    raise exception 'persistir_programacao_pcp: criado_por % nao esta ativo.', p_criado_por;
  end if;

  if p_ocorrencias is null or jsonb_typeof(p_ocorrencias) <> 'array' then
    raise exception 'persistir_programacao_pcp: p_ocorrencias precisa ser um array JSON (pode ser vazio).';
  end if;

  -- Concorrencia (P8H correcao 1): advisory lock so serializa chamadas
  -- desta RPC entre si; o SELECT ... FOR UPDATE abaixo e' quem fecha a
  -- janela contra QUALQUER trigger de bump concorrente na mesma linha.
  perform pg_advisory_xact_lock(hashtextextended('pcp_programacao:' || v_empresa_id::text, 0));

  select versao into v_versao_atual
  from public.empresa_capacidade_versoes
  where empresa_id = v_empresa_id
  for update;

  if v_versao_atual is null then
    raise exception 'persistir_programacao_pcp: empresa_capacidade_versoes nao encontrada para empresa %.', v_empresa_id;
  end if;

  if v_versao_atual is distinct from p_empresa_capacidade_versao_origem then
    raise exception 'persistir_programacao_pcp: versao de capacidade desatualizada (origem=%, atual=%) - recalcule antes de persistir.',
      p_empresa_capacidade_versao_origem, v_versao_atual;
  end if;

  -- Validacao completa do JSON (P8H correcao 4) - ANTES de qualquer
  -- escrita, para nunca deixar a vigente anterior parcialmente trocada.
  for v_ocorrencia in select * from jsonb_array_elements(p_ocorrencias)
  loop
    if not (v_ocorrencia ? 'op_id') or not (v_ocorrencia ? 'of_id') or not (v_ocorrencia ? 'projeto_id')
       or not (v_ocorrencia ? 'status_calculo_motor') or not (v_ocorrencia ? 'prioridade_usada')
       or not (v_ocorrencia ? 'deficit_residual_horas_padrao') or not (v_ocorrencia ? 'alocacoes') then
      raise exception 'persistir_programacao_pcp: ocorrencia incompleta: %', v_ocorrencia;
    end if;

    v_op_id := (v_ocorrencia->>'op_id')::uuid;
    if v_op_id = any(v_chaves_vistas) then
      raise exception 'persistir_programacao_pcp: op_id % duplicado no array de ocorrencias.', v_op_id;
    end if;
    v_chaves_vistas := array_append(v_chaves_vistas, v_op_id);

    -- Integridade OP -> OF -> Projeto (PCP-P8H-F3): as FKs compostas
    -- (op_id,empresa_id) e (of_id,empresa_id) sao validadas de forma
    -- isolada entre si - nao garantem que a OP informada realmente
    -- pertence a OF informada, nem que essa OF realmente pertence ao
    -- projeto informado. Confirma a cadeia real via ordens_fabricacao_
    -- operacoes.of_id e ordens_fabricacao.projeto_id, nunca inferida
    -- do JSON do chamador.
    if not exists (
      select 1
      from public.ordens_fabricacao_operacoes op
      join public.ordens_fabricacao of2
        on of2.id = op.of_id and of2.empresa_id = op.empresa_id
      where op.id = v_op_id
        and op.empresa_id = v_empresa_id
        and op.of_id = (v_ocorrencia->>'of_id')::uuid
        and of2.projeto_id = (v_ocorrencia->>'projeto_id')::uuid
    ) then
      raise exception 'persistir_programacao_pcp: inconsistencia OP/OF/projeto na ocorrencia % (of_id=%, projeto_id=%) - a OP nao pertence a OF informada ou a OF nao pertence ao projeto informado.',
        v_op_id, v_ocorrencia->>'of_id', v_ocorrencia->>'projeto_id';
    end if;

    if (v_ocorrencia->>'status_calculo_motor') not in ('concluida', 'bloqueada_por_deficit', 'bloqueada_por_predecessora') then
      raise exception 'persistir_programacao_pcp: status_calculo_motor invalido na ocorrencia %: %', v_op_id, v_ocorrencia->>'status_calculo_motor';
    end if;

    if jsonb_typeof(v_ocorrencia->'alocacoes') is distinct from 'array' then
      raise exception 'persistir_programacao_pcp: alocacoes precisa ser array na ocorrencia %.', v_op_id;
    end if;

    if (v_ocorrencia->>'status_calculo_motor') = 'concluida' and jsonb_array_length(v_ocorrencia->'alocacoes') = 0 then
      raise exception 'persistir_programacao_pcp: ocorrencia % concluida sem nenhuma alocacao.', v_op_id;
    end if;

    for v_alocacao in select * from jsonb_array_elements(v_ocorrencia->'alocacoes')
    loop
      if not (v_alocacao ? 'data') or not (v_alocacao ? 'recurso_id') or not (v_alocacao ? 'natureza')
         or not (v_alocacao ? 'horas_maquina') or not (v_alocacao ? 'horas_padrao') then
        raise exception 'persistir_programacao_pcp: alocacao incompleta na ocorrencia %: %', v_op_id, v_alocacao;
      end if;
      if (v_alocacao->>'natureza') not in ('normal', 'hora_extra', 'sabado', 'domingo', 'feriado') then
        raise exception 'persistir_programacao_pcp: natureza invalida na ocorrencia %: %', v_op_id, v_alocacao->>'natureza';
      end if;
      if (nullif(v_alocacao->>'horas_maquina', ''))::numeric <= 0 or (nullif(v_alocacao->>'horas_padrao', ''))::numeric <= 0 then
        raise exception 'persistir_programacao_pcp: horas invalidas na ocorrencia %: %', v_op_id, v_alocacao;
      end if;
      if (v_alocacao->>'data')::date < p_janela_inicio or (v_alocacao->>'data')::date > p_janela_fim then
        raise exception 'persistir_programacao_pcp: alocacao fora da janela na ocorrencia %: %', v_op_id, v_alocacao->>'data';
      end if;
    end loop;
  end loop;

  update public.pcp_programacoes set vigente = false where empresa_id = v_empresa_id and vigente = true;

  select coalesce(max(versao_sequencial), 0) + 1 into v_proxima_versao
  from public.pcp_programacoes where empresa_id = v_empresa_id;

  insert into public.pcp_programacoes (
    empresa_id, versao_sequencial, vigente, empresa_capacidade_versao_origem,
    janela_inicio, janela_fim, criada_por, motivo
  ) values (
    v_empresa_id, v_proxima_versao, true, p_empresa_capacidade_versao_origem,
    p_janela_inicio, p_janela_fim, p_criado_por, p_motivo
  )
  returning id into v_programacao_id;

  for v_ocorrencia in select * from jsonb_array_elements(p_ocorrencias)
  loop
    insert into public.pcp_programacao_operacoes (
      programacao_id, empresa_id, op_id, of_id, projeto_id, prioridade_usada,
      status_calculo_motor, data_inicio_prevista, data_fim_prevista, deficit_residual_horas_padrao
    ) values (
      v_programacao_id, v_empresa_id,
      (v_ocorrencia->>'op_id')::uuid, (v_ocorrencia->>'of_id')::uuid, (v_ocorrencia->>'projeto_id')::uuid,
      (v_ocorrencia->>'prioridade_usada')::numeric,
      v_ocorrencia->>'status_calculo_motor',
      nullif(v_ocorrencia->>'data_inicio_prevista', '')::date,
      nullif(v_ocorrencia->>'data_fim_prevista', '')::date,
      coalesce((v_ocorrencia->>'deficit_residual_horas_padrao')::numeric, 0)
    )
    returning id into v_programacao_operacao_id;

    for v_alocacao in select * from jsonb_array_elements(v_ocorrencia->'alocacoes')
    loop
      insert into public.pcp_programacao_alocacoes (
        programacao_operacao_id, empresa_id, data, recurso_id, natureza, horas_maquina, horas_padrao
      ) values (
        v_programacao_operacao_id, v_empresa_id,
        (v_alocacao->>'data')::date, (v_alocacao->>'recurso_id')::uuid, v_alocacao->>'natureza',
        (v_alocacao->>'horas_maquina')::numeric, (v_alocacao->>'horas_padrao')::numeric
      );
    end loop;
  end loop;

  return v_programacao_id;
end;
$function$;

comment on function public.persistir_programacao_pcp(uuid, bigint, date, date, jsonb, text) is
  'PCP-P8H: unica via de escrita da programacao versionada do PCP. Rejeita (sem gravar nada) se empresa_capacidade_versoes.versao (sob FOR UPDATE) divergir de p_empresa_capacidade_versao_origem - nunca persiste um calculo que ja nasceu desatualizado. p_ocorrencias pode ser array vazio (resultado valido). Identidade: p_criado_por validado contra usuarios + profiles.ativo=true, empresa SEMPRE resolvida pelo ator, nunca por parametro solto. ACL: service_role-only, fail-closed desde o nascimento.';

revoke all on function public.persistir_programacao_pcp(uuid, bigint, date, date, jsonb, text) from public, anon, authenticated;
grant execute on function public.persistir_programacao_pcp(uuid, bigint, date, date, jsonb, text) to service_role;

commit;
