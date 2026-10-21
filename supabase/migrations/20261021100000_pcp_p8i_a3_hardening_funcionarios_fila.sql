-- PCP-P8I-A3: hardening de 2 achados comprovados por investigacao
-- (PCP-P8I-A3.1/A3.2), nenhum explorado hoje pela aplicacao real -
-- confirmado por leitura de codigo + catalogo de producao antes desta
-- migration. Migration isolada, exclusiva para esses 2 objetos.

-- =====================================================================
-- A3.1 — funcionarios: TRUNCATE concedido a anon/authenticated desde o
-- bootstrap (202606200001_bootstrap_retroativo_julho.sql), nunca
-- revisado pelas correcoes posteriores que so trataram DELETE
-- (202607050003/202607070003/202607070004). PostgREST nao expoe
-- TRUNCATE como operacao HTTP e nenhuma RPC/codigo da aplicacao o
-- executa (confirmado por grep em src/ e supabase/migrations/) -
-- privilegio concedido mas inalcancavel pelos caminhos reais de hoje.
-- TRUNCATE ignora RLS (ao contrario de DELETE/UPDATE/SELECT), por isso
-- vale fechar mesmo sem exploracao confirmada. Demais privilegios
-- (DELETE/INSERT/UPDATE/SELECT) permanecem intocados.
-- =====================================================================
revoke truncate on public.funcionarios from anon, authenticated;

-- =====================================================================
-- A3.2 — pcp_fila_projetos: unica tabela do PCP onde service_role nunca
-- foi revogado (diferente das 5 tabelas P6E, com hardening desde
-- 20261015170000_pcp_p6e1_hardening_acl_execute.sql). As 4 funcoes/
-- triggers que escrevem na tabela (trg_projetos_entrar_fila_pcp,
-- reordenar_fila_pcp, carregar_estado_motor_pcp,
-- pcp_fila_projetos_bump_capacidade_versao) sao todas SECURITY DEFINER
-- com owner postgres - executam sempre como postgres, nunca como
-- service_role (confirmado via pg_proc.proowner) - revogar de
-- service_role nao afeta nenhuma delas. Nenhum consumidor real usa
-- service_role direto nessa tabela hoje (confirmado - so mocks de
-- teste). SELECT restabelecido para service_role pela necessidade
-- confirmada de carregar_estado_motor_pcp ler a tabela.
-- =====================================================================
revoke all on public.pcp_fila_projetos from service_role;
grant select on public.pcp_fila_projetos to service_role;
