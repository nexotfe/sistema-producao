-- Correcao de vazamento ATIVO confirmado (nao preventivo): a view
-- public.vw_planejamento_compras_operacional (criada em
-- 202606050017_planejamento_compras_10_view_operacional.sql, redefinida
-- em 202606050019 e por ultimo em
-- 202606050026_planejamento_compras_19_view_comprar.sql) nao tem
-- security_invoker = true (default false, roda como Security Definer com
-- os privilegios do dono "postgres", que tem rolbypassrls=true).
--
-- Diferente do caso de public.clientes_ativos (202607130001, so' reforco
-- preventivo) e de public.funcionarios_ativos (mesma classe de achado, mas
-- corrigida em migration separada): o WHERE desta view (p.ativo = true and
-- p.deleted_at is null) NUNCA filtrou por empresa_id. Investigacao nesta
-- sessao (Security Advisor do Supabase + leitura do schema real) confirmou:
--   - as 3 tabelas base (planejamentos_compra, materias_primas,
--     planejamento_compra_origens) tem RLS habilitada e todas filtram
--     corretamente por empresa_id = empresa_atual_id();
--   - a view, por rodar com os privilegios do dono (bypassa RLS) e sem
--     filtro de tenant proprio, expunha TODAS as empresas atraves dela;
--   - o dump real do schema confirma GRANT ALL concedido a anon,
--     authenticated e service_role nesta view (nunca houve REVOKE
--     explicito) — ou seja, ate' um chamador nao autenticado (anon) podia
--     ler dados de planejamento de compra de todas as empresas.
-- Nenhum consumidor real foi encontrado em src/ (grep exaustivo), mas isso
-- nao muda a gravidade do vazamento em si.
--
-- Ligar security_invoker = true faz a view passar a respeitar a RLS das 3
-- tabelas base (que ja esta correta) — fecha o vazamento. Fecha tambem o
-- ACL: so' authenticated mantem SELECT; anon e service_role perdem
-- qualquer privilegio nesta view (nao ha' necessidade de service_role
-- acessar esta view diretamente; se algum uso interno via service_role
-- surgir no futuro, precisa de GRANT explicito e justificado, nao herdado
-- por omissao).
alter view public.vw_planejamento_compras_operacional set (security_invoker = true);

revoke all privileges on public.vw_planejamento_compras_operacional from anon, service_role;
grant select on public.vw_planejamento_compras_operacional to authenticated;
