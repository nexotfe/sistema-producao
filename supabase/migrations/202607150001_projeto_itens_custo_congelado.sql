-- Custo de projeto_itens hoje e sempre recalculado ao vivo (join com
-- materias_primas.custo_referencia via calcular_custo_bom) - editar o
-- preco de uma materia-prima no catalogo muda retroativamente o custo
-- de projetos ja aprovados. Estas colunas guardam o snapshot do custo
-- unitario no momento em que o Projeto sai de "rascunho" (Em
-- elaboracao). Ver 202607150002 para os triggers que as populam.
alter table public.projeto_itens
  add column if not exists custo_congelado numeric,
  add column if not exists custo_congelado_em timestamptz,
  add column if not exists custo_editado_manualmente boolean not null default false;

comment on column public.projeto_itens.custo_congelado is
  'Custo unitario (material + mao de obra) congelado no momento em que o Projeto saiu de "rascunho" (Em elaboracao). Nulo enquanto em rascunho - nesse caso o custo e sempre calculado ao vivo via calcular_custo_bom. Multiplicado por projeto_itens.quantidade na exibicao do total; se a Quantidade mudar depois do congelamento, o total acompanha, mas o valor unitario fica fixo.';

comment on column public.projeto_itens.custo_congelado_em is
  'Data/hora do ultimo congelamento ou descongelamento de custo_congelado.';

comment on column public.projeto_itens.custo_editado_manualmente is
  'true quando o orcamentista sobrescreveu manualmente custo_congelado apos o congelamento automatico. Volta a false quando o item e descongelado (projeto volta para rascunho) ou recongelado.';
