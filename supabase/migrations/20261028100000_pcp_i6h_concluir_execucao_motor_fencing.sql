-- NEXOTFE-PCP-ETAPA2O.8B-I6H: via unica de conclusao de uma execucao do
-- Motor PCP, com persistencia oficial (P8H) e fencing (DEC-009)
-- integrados na MESMA transacao. Proposta de migration, NAO aplicada em
-- producao nesta rodada - validada em 3 rodadas de sandbox descartavel
-- (versionamento/obsolescencia, transacao unica com supervisor real,
-- RLS/multiempresa/retencao do historico tecnico).
--
-- Problema corrigido: persistir_programacao_pcp (P8H) usava uma chave
-- de advisory lock PROPRIA ('pcp_programacao:'), diferente da usada por
-- iniciar/confirmar/finalizar_recalculo_pcp ('pcp_recalculo_execucao:')
-- - e nunca recebia p_execucao_id, nunca revalidando identidade da
-- reserva antes de escrever. Isso significava que, na pratica, nada no
-- banco impedia duas EXECUCOES REAIS do Motor rodarem ao mesmo tempo
-- para a mesma empresa (so a checagem de versao protegia contra
-- publicar um resultado OBSOLETO, nunca contra a concorrencia de
-- processamento em si) - mesma classe de lacuna que o DEC-009 encontrou
-- e corrigiu em reordenar_fila_pcp (migration 20261026100000), ainda
-- nao replicada aqui antes desta migration.
--
-- concluir_execucao_motor_pcp substitui, para os ORQUESTRADORES novos
-- (src/modules/pcp/actions/orquestrarSolicitacaoCalculoPcp.ts e
-- orquestrarMovimentoPrioridadePcp.ts), a dupla
-- persistir_programacao_pcp + finalizar_recalculo_pcp. As duas funcoes
-- antigas NAO sao removidas nem alteradas - preservadas exatamente como
-- estao, sem nenhum consumidor novo apontando para elas a partir desta
-- migration (confirmado por grep em src/ antes de aplicar esta
-- mudanca de codigo).
--
-- Historico tecnico novo (pcp_recalculo_execucao_historico): 1 linha
-- por execucao_id, nunca sobrescrita - resolve a necessidade de
-- consultar o resultado de uma execucao especifica mesmo depois que
-- pcp_recalculo_execucao (1 linha por EMPRESA, sobrescrita a cada nova
-- execucao) ja foi assumida por uma execucao mais nova. Validado com
-- sessoes/identidades reais distintas em sandbox: isolamento
-- multiempresa, bloqueio de DML direto, atomicidade com a programacao
-- oficial. NUNCA substitui pcp_recalculo_execucao como fonte de verdade
-- da reserva viva, nem pcp_programacoes como fonte de verdade da
-- programacao vigente - e so um log de resultado por execucao, nunca
-- decide recuperacao (isso continua exclusivo de confirmar_recuperacao_pcp,
-- DEC-009). Retencao: proposta de referencia e 12-24 meses para este
-- historico TECNICO (distinto do Historico de Prioridades,
-- pcp_fila_projetos_historico, que e decisao de negocio do PCP e
-- permanece permanente) - nenhuma exclusao automatica implementada
-- nesta migration, decisao de prazo exato pendente de aprovacao do
-- proprietario.
begin;

create table public.pcp_recalculo_execucao_historico (
  execucao_id uuid primary key,
  empresa_id uuid not null references public.empresas (id),
  iniciado_por uuid not null references public.usuarios (id),
  contexto text not null,
  resultado text not null check (resultado in ('concluido', 'obsoleto', 'falhou_recuperavel')),
  programacao_id uuid null,
  motivo text null,
  iniciado_em timestamptz not null,
  concluido_em timestamptz not null default now(),

  constraint pcp_recalculo_execucao_historico_programacao_fk
    foreign key (programacao_id, empresa_id) references public.pcp_programacoes (id, empresa_id)
);

comment on table public.pcp_recalculo_execucao_historico is
  'ETAPA 2O.8B-I6H: historico tecnico append-only de toda conclusao de execucao do Motor PCP, 1 linha por execucao_id (nunca sobrescrita). Permite consultar o resultado de uma execucao especifica mesmo depois que pcp_recalculo_execucao (1 linha por empresa) ja foi assumida por uma execucao mais nova. NUNCA decide recuperacao - isso continua exclusivo de confirmar_recuperacao_pcp (DEC-009). Retencao de referencia proposta: 12-24 meses (nao implementada aqui - decisao de prazo exato pendente).';

alter table public.pcp_recalculo_execucao_historico enable row level security;

create policy pcp_recalculo_execucao_historico_select_tenant on public.pcp_recalculo_execucao_historico
  for select to authenticated using (empresa_id = public.empresa_atual_id());

revoke all privileges on table public.pcp_recalculo_execucao_historico from public, anon, authenticated;
grant select on table public.pcp_recalculo_execucao_historico to authenticated;

create index pcp_recalculo_execucao_historico_empresa_criado_idx
  on public.pcp_recalculo_execucao_historico (empresa_id, concluido_em desc);

-- =====================================================================
-- concluir_execucao_motor_pcp: via unica de conclusao de uma execucao do
-- Motor PCP. Transacao unica: valida identidade da reserva (execucao_id
-- + situacao em_andamento) sob a MESMA chave de advisory lock de
-- iniciar/confirmar/finalizar_recalculo_pcp, decide obsolescencia por si
-- mesma (nunca confia no p_resultado que o chamador afirma), e so entao
-- grava pcp_programacoes/_operacoes/_alocacoes + encerra a reserva +
-- grava o historico - tudo ou nada.
-- =====================================================================
create or replace function public.concluir_execucao_motor_pcp(
  p_empresa_id uuid,
  p_execucao_id uuid,
  p_resultado text,
  p_empresa_capacidade_versao_origem bigint default null,
  p_janela_inicio date default null,
  p_janela_fim date default null,
  p_ocorrencias jsonb default null,
  p_motivo text default null
)
returns table (aceito boolean, resultado_efetivo text, programacao_id uuid, motivo_rejeicao text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reserva record;
  v_versao_atual bigint;
  v_proxima_versao bigint;
  v_programacao_id uuid := null;
  v_resultado_efetivo text;
  v_ocorrencia jsonb;
  v_alocacao jsonb;
  v_op_id uuid;
  v_programacao_operacao_id uuid;
  v_chaves_vistas uuid[] := array[]::uuid[];
begin
  if p_resultado not in ('concluido', 'obsoleto', 'falhou_recuperavel') then
    raise exception 'concluir_execucao_motor_pcp: p_resultado invalido (%) - precisa ser concluido, obsoleto ou falhou_recuperavel.', p_resultado;
  end if;

  -- MESMA chave de advisory lock de iniciar/confirmar/finalizar_recalculo_pcp
  -- (nunca uma chave propria separada, como persistir_programacao_pcp
  -- antiga usava) - unifica a protecao de concorrencia de execucao e
  -- persistencia num unico mecanismo.
  perform pg_advisory_xact_lock(hashtextextended('pcp_recalculo_execucao:' || p_empresa_id::text, 0));

  select * into v_reserva from public.pcp_recalculo_execucao where empresa_id = p_empresa_id for update;

  if v_reserva is null or v_reserva.situacao != 'em_andamento' or v_reserva.execucao_id != p_execucao_id then
    return query select false, null::text, null::uuid, 'execucao_nao_corresponde_a_reserva_vigente'::text;
    return;
  end if;

  v_resultado_efetivo := p_resultado;

  if p_resultado = 'concluido' then
    if p_empresa_capacidade_versao_origem is null or p_janela_inicio is null or p_janela_fim is null or p_ocorrencias is null then
      raise exception 'concluir_execucao_motor_pcp: resultado concluido exige empresa_capacidade_versao_origem, janela_inicio, janela_fim e ocorrencias.';
    end if;
    if p_janela_fim < p_janela_inicio then
      raise exception 'concluir_execucao_motor_pcp: janela_fim (%) anterior a janela_inicio (%).', p_janela_fim, p_janela_inicio;
    end if;
    if jsonb_typeof(p_ocorrencias) <> 'array' then
      raise exception 'concluir_execucao_motor_pcp: p_ocorrencias precisa ser um array JSON (pode ser vazio).';
    end if;

    select versao into v_versao_atual from public.empresa_capacidade_versoes where empresa_id = p_empresa_id for update;
    if v_versao_atual is null then
      raise exception 'concluir_execucao_motor_pcp: empresa_capacidade_versoes nao encontrada para empresa %.', p_empresa_id;
    end if;

    if v_versao_atual is distinct from p_empresa_capacidade_versao_origem then
      -- A FUNCAO decide, nunca confia no chamador: versao mudou -> obsoleto,
      -- mesmo que o chamador tenha afirmado 'concluido'.
      v_resultado_efetivo := 'obsoleto';
    else
      for v_ocorrencia in select * from jsonb_array_elements(p_ocorrencias) loop
        if not (v_ocorrencia ? 'op_id') or not (v_ocorrencia ? 'of_id') or not (v_ocorrencia ? 'projeto_id')
           or not (v_ocorrencia ? 'status_calculo_motor') or not (v_ocorrencia ? 'prioridade_usada')
           or not (v_ocorrencia ? 'deficit_residual_horas_padrao') or not (v_ocorrencia ? 'alocacoes') then
          raise exception 'concluir_execucao_motor_pcp: ocorrencia incompleta: %', v_ocorrencia;
        end if;

        v_op_id := (v_ocorrencia->>'op_id')::uuid;
        if v_op_id = any(v_chaves_vistas) then
          raise exception 'concluir_execucao_motor_pcp: op_id % duplicado no array de ocorrencias.', v_op_id;
        end if;
        v_chaves_vistas := array_append(v_chaves_vistas, v_op_id);

        -- Integridade OP -> OF -> Projeto confirmada via cadeia real
        -- (ordens_fabricacao_operacoes.of_id / ordens_fabricacao.projeto_id),
        -- nunca inferida do JSON do chamador - mesmo padrao de
        -- persistir_programacao_pcp (P8H).
        if not exists (
          select 1
          from public.ordens_fabricacao_operacoes op
          join public.ordens_fabricacao of2
            on of2.id = op.of_id and of2.empresa_id = op.empresa_id
          where op.id = v_op_id
            and op.empresa_id = p_empresa_id
            and op.of_id = (v_ocorrencia->>'of_id')::uuid
            and of2.projeto_id = (v_ocorrencia->>'projeto_id')::uuid
        ) then
          raise exception 'concluir_execucao_motor_pcp: inconsistencia OP/OF/projeto na ocorrencia % (of_id=%, projeto_id=%).',
            v_op_id, v_ocorrencia->>'of_id', v_ocorrencia->>'projeto_id';
        end if;

        if (v_ocorrencia->>'status_calculo_motor') not in ('concluida', 'bloqueada_por_deficit', 'bloqueada_por_predecessora') then
          raise exception 'concluir_execucao_motor_pcp: status_calculo_motor invalido na ocorrencia %: %', v_op_id, v_ocorrencia->>'status_calculo_motor';
        end if;

        if jsonb_typeof(v_ocorrencia->'alocacoes') is distinct from 'array' then
          raise exception 'concluir_execucao_motor_pcp: alocacoes precisa ser array na ocorrencia %.', v_op_id;
        end if;

        if (v_ocorrencia->>'status_calculo_motor') = 'concluida' and jsonb_array_length(v_ocorrencia->'alocacoes') = 0 then
          raise exception 'concluir_execucao_motor_pcp: ocorrencia % concluida sem nenhuma alocacao.', v_op_id;
        end if;

        for v_alocacao in select * from jsonb_array_elements(v_ocorrencia->'alocacoes') loop
          if not (v_alocacao ? 'data') or not (v_alocacao ? 'recurso_id') or not (v_alocacao ? 'natureza')
             or not (v_alocacao ? 'horas_maquina') or not (v_alocacao ? 'horas_padrao') then
            raise exception 'concluir_execucao_motor_pcp: alocacao incompleta na ocorrencia %: %', v_op_id, v_alocacao;
          end if;
          if (v_alocacao->>'natureza') not in ('normal', 'hora_extra', 'sabado', 'domingo', 'feriado') then
            raise exception 'concluir_execucao_motor_pcp: natureza invalida na ocorrencia %: %', v_op_id, v_alocacao->>'natureza';
          end if;
          if (nullif(v_alocacao->>'horas_maquina', ''))::numeric <= 0 or (nullif(v_alocacao->>'horas_padrao', ''))::numeric <= 0 then
            raise exception 'concluir_execucao_motor_pcp: horas invalidas na ocorrencia %: %', v_op_id, v_alocacao;
          end if;
          if (v_alocacao->>'data')::date < p_janela_inicio or (v_alocacao->>'data')::date > p_janela_fim then
            raise exception 'concluir_execucao_motor_pcp: alocacao fora da janela na ocorrencia %: %', v_op_id, v_alocacao->>'data';
          end if;
        end loop;
      end loop;

      update public.pcp_programacoes set vigente = false where empresa_id = p_empresa_id and vigente = true;
      select coalesce(max(versao_sequencial), 0) + 1 into v_proxima_versao from public.pcp_programacoes where empresa_id = p_empresa_id;

      insert into public.pcp_programacoes (
        empresa_id, versao_sequencial, vigente, empresa_capacidade_versao_origem,
        janela_inicio, janela_fim, criada_por, motivo
      ) values (
        p_empresa_id, v_proxima_versao, true, p_empresa_capacidade_versao_origem,
        p_janela_inicio, p_janela_fim, v_reserva.iniciado_por, p_motivo
      )
      returning id into v_programacao_id;

      for v_ocorrencia in select * from jsonb_array_elements(p_ocorrencias) loop
        insert into public.pcp_programacao_operacoes (
          programacao_id, empresa_id, op_id, of_id, projeto_id, prioridade_usada,
          status_calculo_motor, data_inicio_prevista, data_fim_prevista, deficit_residual_horas_padrao
        ) values (
          v_programacao_id, p_empresa_id,
          (v_ocorrencia->>'op_id')::uuid, (v_ocorrencia->>'of_id')::uuid, (v_ocorrencia->>'projeto_id')::uuid,
          (v_ocorrencia->>'prioridade_usada')::numeric,
          v_ocorrencia->>'status_calculo_motor',
          nullif(v_ocorrencia->>'data_inicio_prevista', '')::date,
          nullif(v_ocorrencia->>'data_fim_prevista', '')::date,
          coalesce((v_ocorrencia->>'deficit_residual_horas_padrao')::numeric, 0)
        )
        returning id into v_programacao_operacao_id;

        for v_alocacao in select * from jsonb_array_elements(v_ocorrencia->'alocacoes') loop
          insert into public.pcp_programacao_alocacoes (
            programacao_operacao_id, empresa_id, data, recurso_id, natureza, horas_maquina, horas_padrao
          ) values (
            v_programacao_operacao_id, p_empresa_id,
            (v_alocacao->>'data')::date, (v_alocacao->>'recurso_id')::uuid, v_alocacao->>'natureza',
            (v_alocacao->>'horas_maquina')::numeric, (v_alocacao->>'horas_padrao')::numeric
          );
        end loop;
      end loop;
    end if;
  end if;

  update public.pcp_recalculo_execucao
  set situacao = case when v_resultado_efetivo = 'concluido' then 'concluida' else 'falhou' end,
      atualizado_em = now()
  where empresa_id = p_empresa_id and execucao_id = p_execucao_id and situacao = 'em_andamento';

  insert into public.pcp_recalculo_execucao_historico
    (execucao_id, empresa_id, iniciado_por, contexto, resultado, programacao_id, motivo, iniciado_em)
  values
    (p_execucao_id, p_empresa_id, v_reserva.iniciado_por, v_reserva.contexto, v_resultado_efetivo, v_programacao_id, p_motivo, v_reserva.iniciado_em);

  return query select true, v_resultado_efetivo, v_programacao_id, null::text;
end;
$function$;

comment on function public.concluir_execucao_motor_pcp(uuid, uuid, text, bigint, date, date, jsonb, text) is
  'ETAPA 2O.8B-I6H: via unica de conclusao de uma execucao do Motor PCP - valida identidade da reserva (execucao_id + situacao em_andamento) sob a MESMA chave de advisory lock de iniciar/confirmar/finalizar_recalculo_pcp, decide obsolescencia por si mesma (nunca confia no p_resultado do chamador), grava pcp_programacoes/_operacoes/_alocacoes + encerra a reserva + grava pcp_recalculo_execucao_historico numa unica transacao atomica. Substitui persistir_programacao_pcp + finalizar_recalculo_pcp para os orquestradores do PCP - as duas funcoes antigas permanecem preservadas, sem consumidor novo.';

revoke all on function public.concluir_execucao_motor_pcp(uuid, uuid, text, bigint, date, date, jsonb, text) from public, anon, authenticated;
grant execute on function public.concluir_execucao_motor_pcp(uuid, uuid, text, bigint, date, date, jsonb, text) to service_role;

commit;
