-- NEXOTFE - Planejamento de Compras - Parte 09
-- Indices para agrupamento industrial.

create index if not exists planejamentos_compra_chave_industrial_idx
  on public.planejamentos_compra (empresa_id, chave_industrial_compra);

create index if not exists planejamentos_compra_modo_idx
  on public.planejamentos_compra (empresa_id, modo_planejamento);

create index if not exists planejamento_compra_origens_incluir_idx
  on public.planejamento_compra_origens (
    planejamento_compra_id,
    incluir_no_planejamento
  );
