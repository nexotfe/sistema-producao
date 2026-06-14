-- NEXOTFE - Fornecedores - Parte 02
-- Libera acesso da API para usuarios autenticados, mantendo RLS por empresa.

grant select, insert, update on table public.fornecedores to authenticated;
