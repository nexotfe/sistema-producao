-- A migration 202607070003 criou as policies de DELETE admin, mas
-- funcionarios e grupos_recursos nunca tiveram o GRANT DELETE concedido a
-- authenticated/anon (confirmado testando de verdade via UI: PostgREST
-- devolvia 42501 "permission denied for table", nao a policy - o GRANT e
-- uma camada anterior a RLS). recursos_produtivos ja tinha esse grant.
--
-- Concede DELETE nas mesmas duas roles que ja tem INSERT/UPDATE/SELECT
-- nessas tabelas, espelhando o padrao ja existente em recursos_produtivos
-- (DELETE concedido a anon e authenticated; a policy de RLS e que
-- efetivamente restringe a admin da empresa).

grant delete on table public.funcionarios to anon, authenticated;
grant delete on table public.grupos_recursos to anon, authenticated;
