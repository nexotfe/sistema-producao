-- Reforco preventivo (nao correcao de vazamento ativo confirmado — mesma
-- classificacao de 202607130001_clientes_ativos_security_invoker.sql): a
-- view public.funcionarios_ativos (criada em
-- 202607050003_funcionarios_alinhamento_foundation.sql) nao tem
-- security_invoker = true (default false, roda como Security Definer com
-- os privilegios do dono "postgres", que tem rolbypassrls=true).
--
-- Investigacao nesta sessao confirmou que o proprio WHERE da view ja
-- filtra "where empresa_id = public.empresa_atual_id() and ativo = true
-- and deleted_at is null" — como empresa_atual_id()/auth.uid() leem a
-- sessao de quem esta consultando (nao dependem de quem e' dono da view),
-- esse filtro ja isola por tenant hoje, mesmo sem security_invoker. A
-- tabela base public.funcionarios tambem tem RLS correta (policy
-- funcionarios_select_tenant, mesmo filtro). Diferente de
-- vw_planejamento_compras_operacional (202609041... fix), aqui nao ha'
-- vazamento cross-tenant ativo — anon cai em empresa_id = NULL, que nunca
-- bate com nada, retornando 0 linhas.
--
-- Ainda assim, ligamos security_invoker = true como camada extra (mesma
-- logica de 202607130001): garante que a view sempre respeite a RLS de
-- quem esta consultando, mesmo que uma edicao futura remova o filtro
-- explicito do WHERE. Fecha tambem o ACL: dump real do schema confirma
-- GRANT ALL herdado por anon e service_role (nunca revogado explicitamente,
-- apesar do GRANT SELECT TO authenticated ja existir desde a criacao) — so'
-- authenticated deveria ter privilegio nesta view.
alter view public.funcionarios_ativos set (security_invoker = true);

revoke all privileges on public.funcionarios_ativos from anon, service_role;
grant select on public.funcionarios_ativos to authenticated;
