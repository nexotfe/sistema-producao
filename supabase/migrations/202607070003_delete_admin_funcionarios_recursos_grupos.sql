-- Libera DELETE fisico (restrito a admin da empresa) em funcionarios,
-- recursos_produtivos e grupos_recursos.
--
-- funcionarios e grupos_recursos tinham uma policy FOR DELETE USING (false)
-- que bloqueava qualquer exclusao incondicionalmente - a FK RESTRICT de
-- recursos_produtivos.grupo_id -> grupos_recursos nunca chegava a ser
-- testada, porque a RLS barrava antes. recursos_produtivos nao tinha
-- nenhuma policy de DELETE (mesmo efeito: com RLS habilitado e sem
-- policy, nenhuma linha e deletavel).
--
-- Troca pelo mesmo padrao ja usado em tecnologias_aplicadas e
-- bom_operacoes: FOR DELETE USING (empresa_id = empresa_atual_id() AND
-- usuario_e_admin()). A FK RESTRICT continua sendo o guarda real contra
-- exclusao de registros com vinculo em producao - nao alteramos nenhuma
-- constraint de FK aqui.

drop policy if exists "funcionarios_delete_blocked" on public.funcionarios;
create policy "nexotfe funcionarios delete admin mesma empresa"
  on public.funcionarios for delete
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

drop policy if exists "grupos_recursos_delete_blocked" on public.grupos_recursos;
create policy "nexotfe grupos recursos delete admin mesma empresa"
  on public.grupos_recursos for delete
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

create policy "nexotfe recursos produtivos delete admin mesma empresa"
  on public.recursos_produtivos for delete
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());
