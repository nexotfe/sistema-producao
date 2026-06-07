-- NEXOTFE - Planejamento de Compras - Parte 05
-- Indices operacionais.

create index if not exists planejamentos_compra_empresa_status_idx
  on public.planejamentos_compra (empresa_id, status);

create index if not exists planejamentos_compra_material_idx
  on public.planejamentos_compra (materia_prima_id);

create index if not exists planejamento_compra_origens_planejamento_idx
  on public.planejamento_compra_origens (planejamento_compra_id);

create index if not exists planejamento_compra_origens_requisicao_idx
  on public.planejamento_compra_origens (requisicao_compra_id);

create index if not exists planejamento_compra_origens_of_idx
  on public.planejamento_compra_origens (of_numero);
