-- NEXOTFE - Normaliza policies para TO authenticated explicito
--
-- Achado: 15 tabelas tinham policies criadas sem clausula TO, o que
-- equivale a TO public (aplica tambem ao role anon). Na pratica o acesso
-- de anon ja era bloqueado porque empresa_atual_id() retorna NULL sem
-- auth.uid(), e comparacoes com NULL avaliam falso em USING/WITH CHECK.
-- Ainda assim, e uma protecao implicita e mais fragil que o padrao
-- TO authenticated explicito usado nas outras 18 tabelas do projeto.
--
-- Esta migration recria as 60 policies das 15 tabelas abaixo com
-- TO authenticated explicito, mantendo EXATAMENTE a mesma condicao
-- USING/WITH CHECK que ja existia (nenhuma logica de negocio mudou).
--
-- Tabelas: consumos_internos, estoque_movimentacoes, estoque_saldos,
-- materias_primas, numeracao_configuracoes, ordens_fabricacao,
-- pedido_compra_itens, pedidos_compra, planejamento_compra_origens,
-- planejamentos_compra, producao_configuracoes, projeto_itens,
-- projetos, requisicao_compra_itens, requisicoes_compra.

drop policy consumos_internos_delete_blocked on public.consumos_internos;
create policy consumos_internos_delete_blocked on public.consumos_internos for DELETE to authenticated using (false);
drop policy consumos_internos_insert_tenant on public.consumos_internos;
create policy consumos_internos_insert_tenant on public.consumos_internos for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy consumos_internos_select_tenant on public.consumos_internos;
create policy consumos_internos_select_tenant on public.consumos_internos for SELECT to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL)));
drop policy consumos_internos_update_tenant on public.consumos_internos;
create policy consumos_internos_update_tenant on public.consumos_internos for UPDATE to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL))) with check ((empresa_id = empresa_atual_id()));
drop policy estoque_movimentacoes_delete_blocked on public.estoque_movimentacoes;
create policy estoque_movimentacoes_delete_blocked on public.estoque_movimentacoes for DELETE to authenticated using (false);
drop policy estoque_movimentacoes_insert_tenant on public.estoque_movimentacoes;
create policy estoque_movimentacoes_insert_tenant on public.estoque_movimentacoes for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy estoque_movimentacoes_select_tenant on public.estoque_movimentacoes;
create policy estoque_movimentacoes_select_tenant on public.estoque_movimentacoes for SELECT to authenticated using ((empresa_id = empresa_atual_id()));
drop policy estoque_movimentacoes_update_blocked on public.estoque_movimentacoes;
create policy estoque_movimentacoes_update_blocked on public.estoque_movimentacoes for UPDATE to authenticated using (false);
drop policy estoque_saldos_delete_blocked on public.estoque_saldos;
create policy estoque_saldos_delete_blocked on public.estoque_saldos for DELETE to authenticated using (false);
drop policy estoque_saldos_insert_tenant on public.estoque_saldos;
create policy estoque_saldos_insert_tenant on public.estoque_saldos for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy estoque_saldos_select_tenant on public.estoque_saldos;
create policy estoque_saldos_select_tenant on public.estoque_saldos for SELECT to authenticated using ((empresa_id = empresa_atual_id()));
drop policy estoque_saldos_update_tenant on public.estoque_saldos;
create policy estoque_saldos_update_tenant on public.estoque_saldos for UPDATE to authenticated using ((empresa_id = empresa_atual_id())) with check ((empresa_id = empresa_atual_id()));
drop policy materias_primas_delete_blocked on public.materias_primas;
create policy materias_primas_delete_blocked on public.materias_primas for DELETE to authenticated using (false);
drop policy materias_primas_insert_tenant on public.materias_primas;
create policy materias_primas_insert_tenant on public.materias_primas for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy materias_primas_select_tenant on public.materias_primas;
create policy materias_primas_select_tenant on public.materias_primas for SELECT to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL)));
drop policy materias_primas_update_tenant on public.materias_primas;
create policy materias_primas_update_tenant on public.materias_primas for UPDATE to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL))) with check ((empresa_id = empresa_atual_id()));
drop policy numeracao_configuracoes_delete_blocked on public.numeracao_configuracoes;
create policy numeracao_configuracoes_delete_blocked on public.numeracao_configuracoes for DELETE to authenticated using (false);
drop policy numeracao_configuracoes_insert_tenant on public.numeracao_configuracoes;
create policy numeracao_configuracoes_insert_tenant on public.numeracao_configuracoes for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy numeracao_configuracoes_select_tenant on public.numeracao_configuracoes;
create policy numeracao_configuracoes_select_tenant on public.numeracao_configuracoes for SELECT to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL)));
drop policy numeracao_configuracoes_update_tenant on public.numeracao_configuracoes;
create policy numeracao_configuracoes_update_tenant on public.numeracao_configuracoes for UPDATE to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL))) with check ((empresa_id = empresa_atual_id()));
drop policy ordens_fabricacao_delete_blocked on public.ordens_fabricacao;
create policy ordens_fabricacao_delete_blocked on public.ordens_fabricacao for DELETE to authenticated using (false);
drop policy ordens_fabricacao_insert_tenant on public.ordens_fabricacao;
create policy ordens_fabricacao_insert_tenant on public.ordens_fabricacao for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy ordens_fabricacao_select_tenant on public.ordens_fabricacao;
create policy ordens_fabricacao_select_tenant on public.ordens_fabricacao for SELECT to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL)));
drop policy ordens_fabricacao_update_tenant on public.ordens_fabricacao;
create policy ordens_fabricacao_update_tenant on public.ordens_fabricacao for UPDATE to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL))) with check ((empresa_id = empresa_atual_id()));
drop policy pedido_compra_itens_delete_blocked on public.pedido_compra_itens;
create policy pedido_compra_itens_delete_blocked on public.pedido_compra_itens for DELETE to authenticated using (false);
drop policy pedido_compra_itens_insert_tenant on public.pedido_compra_itens;
create policy pedido_compra_itens_insert_tenant on public.pedido_compra_itens for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy pedido_compra_itens_select_tenant on public.pedido_compra_itens;
create policy pedido_compra_itens_select_tenant on public.pedido_compra_itens for SELECT to authenticated using ((empresa_id = empresa_atual_id()));
drop policy pedido_compra_itens_update_blocked on public.pedido_compra_itens;
create policy pedido_compra_itens_update_blocked on public.pedido_compra_itens for UPDATE to authenticated using (false);
drop policy pedidos_compra_delete_blocked on public.pedidos_compra;
create policy pedidos_compra_delete_blocked on public.pedidos_compra for DELETE to authenticated using (false);
drop policy pedidos_compra_insert_tenant on public.pedidos_compra;
create policy pedidos_compra_insert_tenant on public.pedidos_compra for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy pedidos_compra_select_tenant on public.pedidos_compra;
create policy pedidos_compra_select_tenant on public.pedidos_compra for SELECT to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL)));
drop policy pedidos_compra_update_tenant on public.pedidos_compra;
create policy pedidos_compra_update_tenant on public.pedidos_compra for UPDATE to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL))) with check ((empresa_id = empresa_atual_id()));
drop policy planejamento_compra_origens_delete_blocked on public.planejamento_compra_origens;
create policy planejamento_compra_origens_delete_blocked on public.planejamento_compra_origens for DELETE to authenticated using (false);
drop policy planejamento_compra_origens_insert_tenant on public.planejamento_compra_origens;
create policy planejamento_compra_origens_insert_tenant on public.planejamento_compra_origens for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy planejamento_compra_origens_select_tenant on public.planejamento_compra_origens;
create policy planejamento_compra_origens_select_tenant on public.planejamento_compra_origens for SELECT to authenticated using ((empresa_id = empresa_atual_id()));
drop policy planejamento_compra_origens_update_tenant on public.planejamento_compra_origens;
create policy planejamento_compra_origens_update_tenant on public.planejamento_compra_origens for UPDATE to authenticated using ((empresa_id = empresa_atual_id())) with check ((empresa_id = empresa_atual_id()));
drop policy planejamentos_compra_delete_blocked on public.planejamentos_compra;
create policy planejamentos_compra_delete_blocked on public.planejamentos_compra for DELETE to authenticated using (false);
drop policy planejamentos_compra_insert_tenant on public.planejamentos_compra;
create policy planejamentos_compra_insert_tenant on public.planejamentos_compra for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy planejamentos_compra_select_tenant on public.planejamentos_compra;
create policy planejamentos_compra_select_tenant on public.planejamentos_compra for SELECT to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL)));
drop policy planejamentos_compra_update_tenant on public.planejamentos_compra;
create policy planejamentos_compra_update_tenant on public.planejamentos_compra for UPDATE to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL))) with check ((empresa_id = empresa_atual_id()));
drop policy producao_configuracoes_delete_blocked on public.producao_configuracoes;
create policy producao_configuracoes_delete_blocked on public.producao_configuracoes for DELETE to authenticated using (false);
drop policy producao_configuracoes_insert_tenant on public.producao_configuracoes;
create policy producao_configuracoes_insert_tenant on public.producao_configuracoes for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy producao_configuracoes_select_tenant on public.producao_configuracoes;
create policy producao_configuracoes_select_tenant on public.producao_configuracoes for SELECT to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL)));
drop policy producao_configuracoes_update_tenant on public.producao_configuracoes;
create policy producao_configuracoes_update_tenant on public.producao_configuracoes for UPDATE to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL))) with check ((empresa_id = empresa_atual_id()));
drop policy projeto_itens_delete_blocked on public.projeto_itens;
create policy projeto_itens_delete_blocked on public.projeto_itens for DELETE to authenticated using (false);
drop policy projeto_itens_insert_tenant on public.projeto_itens;
create policy projeto_itens_insert_tenant on public.projeto_itens for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy projeto_itens_select_tenant on public.projeto_itens;
create policy projeto_itens_select_tenant on public.projeto_itens for SELECT to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL)));
drop policy projeto_itens_update_tenant on public.projeto_itens;
create policy projeto_itens_update_tenant on public.projeto_itens for UPDATE to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL))) with check ((empresa_id = empresa_atual_id()));
drop policy projetos_delete_blocked on public.projetos;
create policy projetos_delete_blocked on public.projetos for DELETE to authenticated using (false);
drop policy projetos_insert_tenant on public.projetos;
create policy projetos_insert_tenant on public.projetos for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy projetos_select_tenant on public.projetos;
create policy projetos_select_tenant on public.projetos for SELECT to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL)));
drop policy projetos_update_tenant on public.projetos;
create policy projetos_update_tenant on public.projetos for UPDATE to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL))) with check ((empresa_id = empresa_atual_id()));
drop policy requisicao_compra_itens_delete_blocked on public.requisicao_compra_itens;
create policy requisicao_compra_itens_delete_blocked on public.requisicao_compra_itens for DELETE to authenticated using (false);
drop policy requisicao_compra_itens_insert_tenant on public.requisicao_compra_itens;
create policy requisicao_compra_itens_insert_tenant on public.requisicao_compra_itens for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy requisicao_compra_itens_select_tenant on public.requisicao_compra_itens;
create policy requisicao_compra_itens_select_tenant on public.requisicao_compra_itens for SELECT to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL)));
drop policy requisicao_compra_itens_update_tenant on public.requisicao_compra_itens;
create policy requisicao_compra_itens_update_tenant on public.requisicao_compra_itens for UPDATE to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL))) with check ((empresa_id = empresa_atual_id()));
drop policy requisicoes_compra_delete_blocked on public.requisicoes_compra;
create policy requisicoes_compra_delete_blocked on public.requisicoes_compra for DELETE to authenticated using (false);
drop policy requisicoes_compra_insert_tenant on public.requisicoes_compra;
create policy requisicoes_compra_insert_tenant on public.requisicoes_compra for INSERT to authenticated with check ((empresa_id = empresa_atual_id()));
drop policy requisicoes_compra_select_tenant on public.requisicoes_compra;
create policy requisicoes_compra_select_tenant on public.requisicoes_compra for SELECT to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL)));
drop policy requisicoes_compra_update_tenant on public.requisicoes_compra;
create policy requisicoes_compra_update_tenant on public.requisicoes_compra for UPDATE to authenticated using (((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL))) with check ((empresa_id = empresa_atual_id()));
