-- PAD-004 secao 2 - Lote B. Remove o filtro deleted_at is null das
-- policies de SELECT e da clausula USING de UPDATE de materias_primas e
-- materias_primas_fornecedores. Mesmo padrao do Lote A
-- (202607190001_rls_soft_delete_lote_a.sql): a policy de SELECT
-- filtrando deleted_at rejeitava o proprio UPDATE que grava
-- deleted_at = now(), porque a linha resultante deixava de satisfazer
-- essa mesma policy (AUD-2026-07-19_Soft_Delete.md).
--
-- O filtro deleted_at ja foi removido das queries da aplicacao das 2
-- tabelas (AUD-2026-07-19 secao 4 / PAD-004 secao 3), pre-condicao
-- desta migration. Corrigido tambem nesta rodada: duas lacunas novas
-- encontradas ao mapear os consumidores (carregarMateriaPrima em
-- useMateriaPrimaForm.ts, busca por id em useRoteiro.ts) - commit
-- separado de frontend.
--
-- O filtro ativo = true permanece em materias_primas (ja existia antes
-- desta migration) - mesma divida tecnica consciente registrada na
-- secao 2 do PAD-004 no Lote A, remocao pendente de auditoria propria.
-- materias_primas_fornecedores nunca teve filtro de ativo.

-- materias_primas
alter policy materias_primas_select_tenant
  on public.materias_primas
  using (
    (empresa_id = empresa_atual_id())
    and (ativo = true)
  );

alter policy materias_primas_update_tenant
  on public.materias_primas
  using (
    (empresa_id = empresa_atual_id())
    and (ativo = true)
  )
  with check (empresa_id = empresa_atual_id());

-- materias_primas_fornecedores
alter policy materias_primas_fornecedores_select_tenant
  on public.materias_primas_fornecedores
  using (empresa_id = empresa_atual_id());

alter policy materias_primas_fornecedores_update_tenant
  on public.materias_primas_fornecedores
  using (empresa_id = empresa_atual_id())
  with check (empresa_id = empresa_atual_id());
