-- Fecha uma falha real de isolamento multi-tenant em recursos_produtivos.
--
-- Diagnostico confirmado por leitura direta de pg_policies (nao presumido):
-- existiam DUAS policies de INSERT com o mesmo efeito insuficiente
-- ("Authenticated users can insert recursos" e "usuarios autenticados
-- criam recursos produtivos", ambas so exigindo created_by = auth.uid(),
-- sem checar empresa_id) - residuo de refatoracao nunca limpo. Como o
-- Postgres combina policies permissivas do mesmo comando com OR, remover
-- so uma nao teria fechado nada; as duas precisam sair juntas.
--
-- A policy de UPDATE tinha o mesmo problema no ramo do criador:
-- (created_by = auth.uid()) OR (usuario_e_admin() AND empresa_id =
-- empresa_atual_id()) - o primeiro ramo nao exigia empresa_id =
-- empresa_atual_id(). Na pratica, o SELECT ja escondia a maior parte do
-- efeito (uma linha de outra empresa nem aparece na listagem), mas a
-- regra continuava incompleta e permitia, em tese, alterar empresa_id de
-- um recurso proprio para o de outra empresa via UPDATE direto (ex.: API
-- REST chamada fora da tela) - por isso a correcao inclui USING e WITH
-- CHECK simetricos, nao so USING.
--
-- SELECT e DELETE ja exigiam empresa_id = empresa_atual_id() em todos os
-- ramos - nao sao tocadas nesta migration.
--
-- Fora de escopo deliberadamente (decisao do usuario): empresa_id
-- continua nullable (nenhuma linha nula hoje, confirmado via SELECT
-- count(*) filter (where empresa_id is null) = 0 em 48 linhas / 2
-- empresas - tornar NOT NULL e mudanca de schema separada); o modelo de
-- permissao de quem pode inserir (hoje qualquer authenticated, nao so
-- admin) tambem nao muda - so a checagem de empresa que faltava.

drop policy "Authenticated users can insert recursos" on public.recursos_produtivos;
drop policy "usuarios autenticados criam recursos produtivos" on public.recursos_produtivos;

create policy "nexotfe recursos produtivos insert mesma empresa"
  on public.recursos_produtivos for insert
  to authenticated
  with check (
    empresa_id = public.empresa_atual_id()
    and created_by = auth.uid()
  );

drop policy "nexotfe recursos produtivos update criador ou admin" on public.recursos_produtivos;

create policy "nexotfe recursos produtivos update mesma empresa"
  on public.recursos_produtivos for update
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and (created_by = auth.uid() or public.usuario_e_admin())
  )
  with check (
    empresa_id = public.empresa_atual_id()
    and (created_by = auth.uid() or public.usuario_e_admin())
  );
