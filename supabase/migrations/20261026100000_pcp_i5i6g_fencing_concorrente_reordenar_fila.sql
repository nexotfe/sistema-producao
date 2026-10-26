-- NEXOTFE-PCP-ETAPA2O.8B-I5/I6-G: correcao da falha de fencing sob
-- concorrencia real confirmada em teste descartavel com duas sessoes
-- (ver knowledge/arquitetura-tecnica/DEC-009_Recuperacao_Supervisor_Motor_PCP.md,
-- Secao 6-A). Migration incremental - NAO altera as duas migrations I5
-- ja registradas (20261025100000, 20261025110000), substitui apenas a
-- implementacao de reordenar_fila_pcp via CREATE OR REPLACE FUNCTION.
--
-- Problema corrigido: reordenar_fila_pcp lia e validava a reserva
-- (empresa/execucao_id/situacao/contexto) ANTES de disputar o
-- pg_advisory_xact_lock de pcp_fila_projetos. Se essa chamada ficasse
-- suspensa nesse lock, outra sessao podia recuperar a execucao
-- abandonada e adquirir uma nova reserva enquanto a primeira
-- permanecia suspensa - ao ser desbloqueada, a chamada suspensa ainda
-- escrevia na fila e no Historico de Prioridades usando o execucao_id
-- ja superado, sem revalidar depois do lock. Confirmado com RPC real,
-- duas sessoes reais e sincronizacao controlada (nunca por
-- temporizacao) em sandbox descartavel, nunca aplicado em producao
-- antes desta correcao.
--
-- Correcao: adquirir, ANTES de ler/validar a reserva, o MESMO
-- pg_advisory_xact_lock('pcp_recalculo_execucao:'+empresa_id) que
-- iniciar_recalculo_pcp / confirmar_recuperacao_pcp / finalizar_recalculo_pcp
-- ja usam (mesma chave de bloqueio das RPCs de reserva, nenhuma nova
-- introduzida), e ler a reserva com "for update" - mesmo padrao dessas
-- tres funcoes sobre a mesma linha. A protecao e mantida por toda a
-- transacao (inclusive durante a escrita da fila e do Historico).
-- Ordem de aquisicao mantida fixa: pcp_recalculo_execucao PRIMEIRO,
-- pcp_fila_projetos DEPOIS - auditoria de todo o schema (todo
-- pg_advisory_xact_lock/FOR UPDATE e todo trigger sobre as duas
-- tabelas) nao encontrou nenhuma outra funcao que dispute as duas
-- chaves ao mesmo tempo nem em ordem invertida; essa conclusao cobre
-- os caminhos examinados nesta auditoria, nao e uma prova formal de
-- impossibilidade de ciclo em qualquer caminho futuro.
--
-- Revalidado em sandbox descartavel (migration candidata, nunca
-- aplicada em producao antes desta): as duas intercalacoes do teste
-- original, o teste sequencial I5/I6-F completo (sem regressao) e o
-- isolamento entre empresas distintas. Nenhum deadlock observado.
--
-- Preservado sem alteracao nesta migration: assinatura da funcao
-- (mesmos 7 parametros, mesmo retorno), SECURITY DEFINER, search_path,
-- toda validacao de negocio existente (motivo obrigatorio, empresa de
-- movido_por, execucao_id/situacao/contexto da reserva, vizinhos,
-- calculo de rank intermediario), gravacao atomica de prioridade e
-- Historico, e as permissoes efetivas (revoke de public/anon/
-- authenticated, grant execute apenas a service_role). Nenhuma
-- funcionalidade nova introduzida - so os dois pontos marcados
-- "CORRECAO I5/I6-G" abaixo mudam em relacao a 20261025110000.
begin;

create or replace function public.reordenar_fila_pcp(
  p_empresa_id uuid,
  p_projeto_id uuid,
  p_movido_por uuid,
  p_execucao_id uuid,
  p_motivo text,
  p_vizinho_anterior_projeto_id uuid default null,
  p_vizinho_seguinte_projeto_id uuid default null
)
returns table (posicao_nova numeric, evento_historico_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_movido_por_empresa_id uuid;
  v_reserva record;
  v_existe boolean;
  v_pos_anterior numeric;
  v_pos_seguinte numeric;
  v_posicao_atual numeric;
  v_nova_posicao numeric;
  v_evento_id uuid;
begin
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'reordenar_fila_pcp: motivo e obrigatorio.';
  end if;

  select empresa_id into v_movido_por_empresa_id from public.usuarios where id = p_movido_por;
  if v_movido_por_empresa_id is null or v_movido_por_empresa_id is distinct from p_empresa_id then
    raise exception 'reordenar_fila_pcp: movido_por % nao e um usuario valido da empresa %.', p_movido_por, p_empresa_id;
  end if;

  -- CORRECAO I5/I6-G (1/2): protege a reserva ANTES de le-la/valida-la -
  -- mesma chave de advisory lock que iniciar_recalculo_pcp,
  -- confirmar_recuperacao_pcp e finalizar_recalculo_pcp ja usam.
  -- Mantida at e o fim da transacao (inclusive durante a escrita da
  -- fila e do Historico) - fecha a janela em que outra sessao podia
  -- recuperar e adquirir uma nova execucao enquanto esta chamada
  -- ficava suspensa so no lock de pcp_fila_projetos (ver DEC-009,
  -- Secao 6-A).
  perform pg_advisory_xact_lock(hashtextextended('pcp_recalculo_execucao:' || p_empresa_id::text, 0));

  -- CORRECAO I5/I6-G (2/2): for update, mesmo padrao usado por
  -- iniciar_recalculo_pcp/confirmar_recuperacao_pcp sobre a mesma linha.
  select * into v_reserva from public.pcp_recalculo_execucao where empresa_id = p_empresa_id for update;
  if v_reserva is null or v_reserva.situacao != 'em_andamento' or v_reserva.execucao_id != p_execucao_id then
    raise exception 'reordenar_fila_pcp: execucao_id % nao corresponde a uma reserva em_andamento valida da empresa %.', p_execucao_id, p_empresa_id;
  end if;
  if v_reserva.iniciado_por is distinct from p_movido_por then
    raise exception 'reordenar_fila_pcp: movido_por % nao corresponde ao usuario que iniciou a execucao %.', p_movido_por, p_execucao_id;
  end if;

  -- CORRECAO (auditoria Parte 3, preservada desde 20261025110000): a
  -- reserva pode ter sido adquirida para dois contextos distintos
  -- (iniciar_recalculo_pcp). Mover a fila so e aceito se a reserva foi
  -- adquirida especificamente para alterar_prioridade.
  if v_reserva.contexto is distinct from 'alterar_prioridade' then
    raise exception 'reordenar_fila_pcp: execucao_id % foi adquirida no contexto % - apenas reservas do contexto alterar_prioridade podem mover a fila.', p_execucao_id, v_reserva.contexto;
  end if;

  if p_vizinho_anterior_projeto_id is null and p_vizinho_seguinte_projeto_id is null then
    raise exception 'reordenar_fila_pcp: informe ao menos um vizinho (anterior ou seguinte) - nao aceita posicao arbitraria sem contexto.';
  end if;
  if p_vizinho_anterior_projeto_id is not null and p_vizinho_anterior_projeto_id = p_projeto_id then
    raise exception 'reordenar_fila_pcp: vizinho anterior nao pode ser o proprio projeto movido.';
  end if;
  if p_vizinho_seguinte_projeto_id is not null and p_vizinho_seguinte_projeto_id = p_projeto_id then
    raise exception 'reordenar_fila_pcp: vizinho seguinte nao pode ser o proprio projeto movido.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pcp_fila_projetos:' || p_empresa_id::text, 0));

  select posicao into v_posicao_atual from public.pcp_fila_projetos
    where empresa_id = p_empresa_id and projeto_id = p_projeto_id;
  if v_posicao_atual is null then
    raise exception 'reordenar_fila_pcp: projeto % nao esta na fila da empresa %.', p_projeto_id, p_empresa_id;
  end if;

  if p_vizinho_anterior_projeto_id is not null then
    select posicao into v_pos_anterior from public.pcp_fila_projetos
      where empresa_id = p_empresa_id and projeto_id = p_vizinho_anterior_projeto_id;
    if v_pos_anterior is null then
      raise exception 'reordenar_fila_pcp: vizinho anterior % nao esta na fila da empresa %.', p_vizinho_anterior_projeto_id, p_empresa_id;
    end if;
  end if;

  if p_vizinho_seguinte_projeto_id is not null then
    select posicao into v_pos_seguinte from public.pcp_fila_projetos
      where empresa_id = p_empresa_id and projeto_id = p_vizinho_seguinte_projeto_id;
    if v_pos_seguinte is null then
      raise exception 'reordenar_fila_pcp: vizinho seguinte % nao esta na fila da empresa %.', p_vizinho_seguinte_projeto_id, p_empresa_id;
    end if;
  end if;

  if v_pos_anterior is not null and v_pos_seguinte is not null then
    v_nova_posicao := (v_pos_anterior + v_pos_seguinte) / 2;
  elsif v_pos_anterior is not null then
    v_nova_posicao := v_pos_anterior + 1000;
  else
    v_nova_posicao := v_pos_seguinte - 1000;
  end if;

  update public.pcp_fila_projetos
    set posicao = v_nova_posicao, atualizado_em = now(), atualizado_por = p_movido_por
    where empresa_id = p_empresa_id and projeto_id = p_projeto_id;

  -- Historico gravado na MESMA transacao - se isto falhar, o update
  -- acima tambem e desfeito (mesma funcao, mesmo bloco implicito).
  insert into public.pcp_fila_projetos_historico
    (empresa_id, projeto_id, posicao_anterior, posicao_nova, movido_por, execucao_id, motivo)
  values
    (p_empresa_id, p_projeto_id, v_posicao_atual, v_nova_posicao, p_movido_por, p_execucao_id, p_motivo)
  returning id into v_evento_id;

  return query select v_nova_posicao, v_evento_id;
end;
$function$;

comment on function public.reordenar_fila_pcp(uuid, uuid, uuid, uuid, text, uuid, uuid) is
  'ETAPA 2O.8B-I5/I6-G: protege a reserva com pg_advisory_xact_lock(pcp_recalculo_execucao) + SELECT FOR UPDATE ANTES de validar execucao_id/situacao/contexto, mantido at e o fim da transacao - fecha a janela de concorrencia confirmada em teste real com duas sessoes (DEC-009, Secao 6-A), em que outra sessao podia recuperar e adquirir uma nova execucao enquanto esta chamada ficava suspensa so no lock de pcp_fila_projetos. Ordem fixa de locks: pcp_recalculo_execucao primeiro, pcp_fila_projetos depois - auditoria de todo o schema nao encontrou outra funcao que dispute as duas chaves. Validacao de reserva (empresa/execucao_id/iniciado_por/contexto), motivo obrigatorio, vizinhos, calculo de rank intermediario e gravacao atomica do Historico preservados sem alteracao desde 20261025110000.';

revoke all on function public.reordenar_fila_pcp(uuid, uuid, uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reordenar_fila_pcp(uuid, uuid, uuid, uuid, text, uuid, uuid) to service_role;

commit;
