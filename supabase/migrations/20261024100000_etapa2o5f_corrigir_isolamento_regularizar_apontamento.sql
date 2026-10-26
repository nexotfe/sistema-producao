-- NEXOTFE-PCP-ETAPA2O.5F: corrige a vulnerabilidade real identificada e
-- comprovada em sandbox na Etapa 2O.5C - regularizar_apontamento aceitava
-- p_corrigido_por de QUALQUER empresa, sem nenhuma validação cruzada
-- contra a empresa do apontamento/OP sendo corrigido.
--
-- Causa exata: a função nunca resolvia nem comparava a empresa de
-- p_corrigido_por - diferente de toda outra RPC administrativa do PCP
-- (liberar_of, cancelar_of, desdobrar_of, reordenar_fila_pcp,
-- estimar_saldo_operacao), que já validam isso desde a origem.
--
-- Escopo desta correção (menor correção necessária, Etapa 2O.5F):
-- só adiciona a MESMA validação de empresa já usada em todas as RPCs
-- citadas acima - nenhuma permissão nova, nenhum contrato quebrado
-- (esta RPC não tem, hoje, nenhum chamador real em src/, confirmado por
-- busca antes desta migration - nenhuma Server Action depende do
-- comportamento atual).
--
-- Não resolve, de propósito, a identidade completa do ator (comparação
-- com a sessão realmente autenticada) - isso é responsabilidade da
-- futura Server Action que chamar esta RPC (mesmo padrão já usado em
-- solicitarCalculoProgramacaoPcpAction.ts/moverPrioridadeProjetoPcpAction.ts:
-- o client de sessão resolve auth.getUser() e passa o id real, nunca
-- aceito do corpo da requisição) - está fora do alcance de uma RPC
-- SECURITY DEFINER chamada por service_role, que não tem JWT confiável.
-- Registrado como pré-requisito de arquitetura para quando essa Server
-- Action for construída, não implementado aqui.
begin;

create or replace function public.regularizar_apontamento(
  p_op_id uuid,
  p_funcionario_id uuid,
  p_apontamento_id uuid,
  p_valor_novo jsonb,
  p_data_execucao_real timestamptz,
  p_retroativo boolean,
  p_corrigido_por uuid,
  p_motivo text
)
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
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'motivo e obrigatorio para toda regularizacao/correcao (PCP-P6B.2).';
  end if;

  select op.empresa_id, op.of_id into v_empresa_id, v_of_id
  from public.ordens_fabricacao_operacoes op
  where op.id = p_op_id;

  if v_empresa_id is null then
    raise exception 'OP % nao encontrada.', p_op_id;
  end if;

  -- CORRECAO ETAPA 2O.5F: p_corrigido_por precisa pertencer a MESMA
  -- empresa da OP/apontamento sendo corrigido - mesma validacao ja
  -- aplicada em liberar_of/cancelar_of/desdobrar_of/reordenar_fila_pcp/
  -- estimar_saldo_operacao desde a origem. Antes desta correcao, nenhuma
  -- checagem existia aqui (vulnerabilidade real, comprovada em sandbox
  -- na Etapa 2O.5C).
  select empresa_id into v_corrigido_por_empresa_id from public.usuarios where id = p_corrigido_por;
  if v_corrigido_por_empresa_id is null or v_corrigido_por_empresa_id is distinct from v_empresa_id then
    raise exception 'regularizar_apontamento: corrigido_por % nao e um usuario valido da empresa % do apontamento/OP %.', p_corrigido_por, v_empresa_id, p_op_id;
  end if;

  select estado_execucao into v_estado_execucao from public.ordens_fabricacao where id = v_of_id;
  if v_estado_execucao = 'concluida' then
    raise exception 'OF % esta encerrada - regularizacao so e permitida com a OF aberta (PCP-P6B.2).', v_of_id;
  end if;

  if p_apontamento_id is not null then
    select to_jsonb(a) into v_valor_anterior from public.of_apontamentos a where a.id = p_apontamento_id;
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
  'Correcao/regularizacao retroativa de Z - nunca edita of_apontamentos original (PCP-P6C.3 Parte J, modelo A). funcionario_id = quem executou; corrigido_por = usuario do ERP que regularizou (PCP-P6D.1 Parte 6/23). Motivo sempre obrigatorio. So com OF aberta. ETAPA 2O.5F: corrigido_por validado contra a empresa da OP/apontamento - correcao de vulnerabilidade real (cross-tenant), comprovada em sandbox na Etapa 2O.5C. Identidade completa do ator (sessao realmente autenticada) permanece responsabilidade da Server Action chamadora, ainda nao construida.';

commit;
