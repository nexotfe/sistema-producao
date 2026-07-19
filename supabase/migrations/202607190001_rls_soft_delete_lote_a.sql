-- PAD-004 secao 2 - remove o filtro deleted_at is null das policies de
-- SELECT e da clausula USING de UPDATE do Lote A (clientes, fornecedores,
-- projetos, projeto_itens). A policy de SELECT filtrando deleted_at is
-- null rejeitava o proprio UPDATE que grava deleted_at = now() (linha
-- resultante deixava de satisfazer a policy de SELECT) - mesmo bug
-- documentado em AUD-2026-07-19_Soft_Delete.md.
--
-- O filtro deleted_at ja foi removido das 4 tabelas nas queries da
-- aplicacao (AUD-2026-07-19 secao 4, PAD-004 secao 3), pre-condicao
-- para esta migration.
--
-- O filtro ativo = true permanece nas policies de fornecedores, projetos
-- e projeto_itens nesta migration - ainda nao ha auditoria das queries
-- de aplicacao equivalente a AUD-2026-07-19 para esse campo. Registrado
-- como divida tecnica consciente em PAD-004_Politica_Exclusao_Registros.md
-- secao 2, remocao pendente de auditoria propria.
--
-- A checagem de autorizacao (created_by = auth.uid()) OR usuario_e_admin()
-- em clientes e fornecedores tambem permanece - nao e um filtro de
-- estado do registro (nao e deleted_at nem ativo), e sim regra de quem
-- pode editar; fora do escopo desta migration.

-- clientes
alter policy clientes_select
  on public.clientes
  using (empresa_id = empresa_atual_id());

alter policy clientes_update
  on public.clientes
  using (
    (empresa_id = empresa_atual_id())
    and ((created_by = auth.uid()) or usuario_e_admin())
  )
  with check (
    (empresa_id = empresa_atual_id())
    and ((created_by = auth.uid()) or usuario_e_admin())
  );

-- fornecedores
alter policy fornecedores_select_tenant
  on public.fornecedores
  using (
    (empresa_id = empresa_atual_id())
    and (ativo = true)
  );

alter policy fornecedores_update_tenant
  on public.fornecedores
  using (
    (empresa_id = empresa_atual_id())
    and (ativo = true)
    and ((created_by = auth.uid()) or usuario_e_admin())
  )
  with check (
    (empresa_id = empresa_atual_id())
    and ((created_by = auth.uid()) or usuario_e_admin())
  );

-- projetos
alter policy projetos_select_tenant
  on public.projetos
  using (
    (empresa_id = empresa_atual_id())
    and (ativo = true)
  );

alter policy projetos_update_tenant
  on public.projetos
  using (
    (empresa_id = empresa_atual_id())
    and (ativo = true)
  )
  with check (empresa_id = empresa_atual_id());

-- projeto_itens
alter policy projeto_itens_select_tenant
  on public.projeto_itens
  using (
    (empresa_id = empresa_atual_id())
    and (ativo = true)
  );

alter policy projeto_itens_update_tenant
  on public.projeto_itens
  using (
    (empresa_id = empresa_atual_id())
    and (ativo = true)
  )
  with check (empresa_id = empresa_atual_id());
