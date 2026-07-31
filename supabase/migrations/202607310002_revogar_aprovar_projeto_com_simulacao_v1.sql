begin;

-- Fase final do rollout gradual do RPC v2 de aprovacao (PAD-008,
-- secoes 7-8): revoga o EXECUTE direto de 'authenticated' na v1
-- (aprovar_projeto_com_simulacao), depois de v2 confirmado
-- funcionando ponta a ponta - 7 cenarios de teste reais, todos
-- confirmados por leitura direta no banco (nao so pela resposta da
-- API): payload divergente (bloqueado, nada persistido), idempotencia
-- (mesma chave -> mesmo id, 1 linha so), RPC v2 chamada direto por
-- sessao normal (42501, nada persistido), tenant cruzado camada 1 via
-- RLS (bloqueado), tenant cruzado camada 2 via checagem interna da
-- RPC (bloqueado, mensagem exata confirmada), RPC v1 direta por sessao
-- normal (aprovada corretamente, mesma empresa), bundle de producao
-- (build ok, SUPABASE_SERVICE_ROLE_KEY nao aparece no client).
--
-- A partir desta migration, o unico caminho valido para aprovar um
-- projeto com simulacao comercial e a Server Action
-- aprovarSimulacaoComercialAction -> aprovar_projeto_com_simulacao_v2
-- (service_role). A function v1 CONTINUA EXISTINDO no banco - so o
-- EXECUTE de 'authenticated' e removido. Isso permite rollback rapido
-- (um unico GRANT) se algo inesperado aparecer em producao depois
-- desta fase, sem precisar recriar a function do zero.
--
-- service_role mantem EXECUTE (nao revogado) - ja e um papel
-- totalmente privilegiado, revogar dele nao adiciona protecao real e
-- so complicaria um eventual rollback administrativo direto.

revoke execute on function public.aprovar_projeto_com_simulacao(
  uuid, text, text, date, integer, date, date, jsonb
) from authenticated;

commit;
