-- NEXOTFE-PCP-ETAPA2O.5F: corrige a vulnerabilidade real identificada e
-- comprovada em sandbox na Etapa 2O.5E - alterar_y_operacao aceitava
-- p_alterado_por de QUALQUER empresa, sem nenhuma validação cruzada
-- contra a empresa da OP sendo alterada.
--
-- Causa exata: mesma classe de falha da migration anterior
-- (20261024100000) - a função nunca resolvia nem comparava a empresa de
-- p_alterado_por, diferente de toda outra RPC administrativa do PCP.
--
-- Escopo desta correção (menor correção necessária, Etapa 2O.5F):
-- só adiciona a MESMA validação de empresa já usada nas demais RPCs -
-- nenhuma permissão nova, nenhum contrato quebrado (esta RPC não tem,
-- hoje, nenhum chamador real em src/, confirmado por busca antes desta
-- migration). Preserva integralmente a capacidade do PCP/Líder de
-- alterar o recurso/tempo/sequência vigente, e a auditoria em
-- of_operacao_auditoria, exatamente como já funcionava.
--
-- Identidade completa do ator (sessão realmente autenticada) permanece
-- responsabilidade da futura Server Action chamadora - mesma observação
-- da migration anterior, não resolvida aqui por estar fora do alcance
-- de uma RPC SECURITY DEFINER sob service_role.
begin;

create or replace function public.alterar_y_operacao(
  p_op_id uuid,
  p_alterado_por uuid,
  p_recurso_vigente_id uuid default null,
  p_tempo_vigente_minutos numeric default null,
  p_sequencia_vigente smallint default null,
  p_motivo text default null
)
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

  select empresa_id, recurso_vigente_id, tempo_vigente_minutos, sequencia_vigente
    into v_empresa_id, v_recurso_anterior, v_tempo_anterior, v_sequencia_anterior
  from public.ordens_fabricacao_operacoes
  where id = p_op_id;

  if v_empresa_id is null then
    raise exception 'OP % nao encontrada.', p_op_id;
  end if;

  -- CORRECAO ETAPA 2O.5F: p_alterado_por precisa pertencer a MESMA
  -- empresa da OP sendo alterada - mesma validacao ja aplicada em
  -- liberar_of/cancelar_of/desdobrar_of/reordenar_fila_pcp/
  -- estimar_saldo_operacao desde a origem. Antes desta correcao,
  -- nenhuma checagem existia aqui (vulnerabilidade real, comprovada em
  -- sandbox na Etapa 2O.5E).
  select empresa_id into v_alterado_por_empresa_id from public.usuarios where id = p_alterado_por;
  if v_alterado_por_empresa_id is null or v_alterado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'alterar_y_operacao: alterado_por % nao e um usuario valido da empresa % da OP %.', p_alterado_por, v_empresa_id, p_op_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao_operacoes:' || p_op_id::text, 0));

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
  'Unica RPC para PCP OU Lider alterarem Y (recurso/tempo/sequencia) - distincao de quem pode chamar fica inteiramente no Grupo de Acesso/Permissoes (PCP-P6D.1 Parte 18/L, corrigido: nunca domain CHECK de papel no banco). Cada campo alterado grava 1 linha de auditoria, so se o valor realmente mudou. p_alterado_por resolvido pelo chamador (Server Action), nunca inferido de auth.uid() sem JWT real. ETAPA 2O.5F: alterado_por validado contra a empresa da OP - correcao de vulnerabilidade real (cross-tenant), comprovada em sandbox na Etapa 2O.5E. Identidade completa do ator (sessao realmente autenticada) permanece responsabilidade da Server Action chamadora, ainda nao construida.';

commit;
