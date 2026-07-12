-- VAZAMENTO ENTRE EMPRESAS (critico): a policy de SELECT de
-- recursos_produtivos usava "USING (true)" - sem nenhum filtro por
-- empresa_id. Qualquer usuario autenticado, de qualquer empresa, via
-- TODOS os recursos produtivos de TODAS as empresas.
--
-- Diferente do padrao ja corrigido em 202607100003 (policies com
-- usuario_e_admin() sem exigir empresa_id = empresa_atual_id(), que so
-- vazava para admins) - aqui nao havia filtro nenhum, vazava para
-- qualquer usuario autenticado. Confirmado ao simular sessao RLS real
-- do usuario da Enifer: via os 5 recursos da NEXOTFE Demo.
--
-- Varredura em todas as tabelas com coluna empresa_id confirmou que
-- essa e a UNICA policy de SELECT sem escopo de tenant remanescente.
drop policy "nexotfe recursos produtivos select autenticado" on public.recursos_produtivos;

create policy "nexotfe recursos produtivos select mesma empresa"
  on public.recursos_produtivos
  for select
  to authenticated
  using (
    empresa_id = empresa_atual_id()
    and deleted_at is null
  );
