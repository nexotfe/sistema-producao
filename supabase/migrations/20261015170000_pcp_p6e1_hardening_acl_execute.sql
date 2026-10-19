-- PCP-P6E.1 - Hardening emergencial de ACL (EXECUTE) das RPCs/funcoes
-- criadas pela migration 20261015120000 (PCP-P6E).
--
-- ACHADO REAL (verificacao pos-aplicacao da P6E, 2026-10-15): a migration
-- 20261015120000 criou 8 RPCs SECURITY DEFINER e 4 funcoes auxiliares sem
-- o revoke/grant de EXECUTE que e o padrao JA ESTABELECIDO neste projeto
-- para toda RPC SECURITY DEFINER sensivel (ver 20261009120000, bloco de
-- aprovar_cenario_comercial_v3: "revoke all ... from public, anon,
-- authenticated; grant execute ... to service_role;"). Sem esse bloco, o
-- Postgres concede EXECUTE a authenticated por padrao na criacao da
-- funcao - confirmado via dump pos-aplicacao, nao presumido. Resultado:
-- qualquer usuario autenticado do app podia chamar criar_of_retrabalho,
-- registrar_apontamento etc. diretamente via supabase.rpc(), contornando
-- a camada de autorizacao do Server Action - varias dessas RPCs nao tem
-- nenhuma validacao interna de que o chamador pertence a empresa dos
-- registros envolvidos, por terem sido desenhadas assumindo acesso
-- exclusivo de service_role.
--
-- Verificado no momento deste achado: as 5 tabelas novas e
-- ordens_fabricacao tinham 0 linhas - sem evidencia de exploracao.
--
-- Esta migration NAO altera tabelas, triggers, dados ou logica de
-- negocio - exclusivamente ACL de EXECUTE sobre as 12 funcoes abaixo.
-- A migration 20261015120000 (ja aplicada em producao) nao e editada
-- retroativamente - o reparo vive em migration propria, para que o
-- historico de replay continue fiel ao que de fato ocorreu (aplicar com
-- o bug, depois corrigir), em vez de fingir que a ACL correta sempre
-- esteve lá.
--
-- Regra permanente adotada a partir deste achado: toda funcao SECURITY
-- DEFINER nova deve nascer fail-closed tambem no EXECUTE - o bloco
-- revoke+grant abaixo e obrigatorio no mesmo bloco de CREATE FUNCTION de
-- qualquer RPC sensivel futura, nunca deixado para depois.

-- ---------------------------------------------------------------------
-- 1. As 8 RPCs SECURITY DEFINER (criam/alteram estado) - service_role
--    apenas, igual ao padrao de aprovar_cenario_comercial_v3.
-- ---------------------------------------------------------------------

revoke all on function public.criar_of_retrabalho(uuid, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.criar_of_retrabalho(uuid, numeric, uuid, text) to service_role;

revoke all on function public.registrar_apontamento(uuid, uuid, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.registrar_apontamento(uuid, uuid, text, timestamptz, uuid) to service_role;

revoke all on function public.regularizar_apontamento(uuid, uuid, uuid, jsonb, timestamptz, boolean, uuid, text) from public, anon, authenticated;
grant execute on function public.regularizar_apontamento(uuid, uuid, uuid, jsonb, timestamptz, boolean, uuid, text) to service_role;

revoke all on function public.alterar_y_operacao(uuid, uuid, uuid, numeric, smallint, text) from public, anon, authenticated;
grant execute on function public.alterar_y_operacao(uuid, uuid, uuid, numeric, smallint, text) to service_role;

revoke all on function public.criar_op_no_y(uuid, uuid, text, text, smallint, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.criar_op_no_y(uuid, uuid, text, text, smallint, uuid, numeric, text) to service_role;

revoke all on function public.marcar_op_nao_aplicavel(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.marcar_op_nao_aplicavel(uuid, uuid, text) to service_role;

revoke all on function public.alterar_dependencia_operacao(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.alterar_dependencia_operacao(uuid, uuid, text, uuid) to service_role;

revoke all on function public.encerrar_of(uuid, uuid) from public, anon, authenticated;
grant execute on function public.encerrar_of(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 2. As 4 funcoes auxiliares (SECURITY INVOKER - nao configuram
--    elevacao de privilegio hoje, RLS nas tabelas de base ja bloqueia
--    leitura real por anon/authenticated sem politica propria; mas sao
--    funcoes internas do motor, nao API publica - sem motivo para
--    manter EXECUTE exposto). Chamadas internas pelas 8 RPCs acima
--    continuam funcionando sem alteracao: essas RPCs sao SECURITY
--    DEFINER (rodam como o owner, postgres), que nunca e bloqueado por
--    GRANT/REVOKE.
-- ---------------------------------------------------------------------

revoke all on function public.of_apontamentos_efetivos(uuid) from public, anon, authenticated;
grant execute on function public.of_apontamentos_efetivos(uuid) to service_role;

revoke all on function public.existe_caminho_dependencia(uuid, uuid) from public, anon, authenticated;
grant execute on function public.existe_caminho_dependencia(uuid, uuid) to service_role;

revoke all on function public.of_pode_encerrar(uuid) from public, anon, authenticated;
grant execute on function public.of_pode_encerrar(uuid) to service_role;

revoke all on function public.op_esta_resolvida(uuid) from public, anon, authenticated;
grant execute on function public.op_esta_resolvida(uuid) to service_role;
