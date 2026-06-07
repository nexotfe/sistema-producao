-- NEXOTFE - Estoque - Parte 06
-- Indices para estoque e requisicoes de compra.

create index if not exists materias_primas_empresa_id_idx
  on public.materias_primas (empresa_id);

create index if not exists materias_primas_codigo_idx
  on public.materias_primas (codigo);

create index if not exists materias_primas_descricao_idx
  on public.materias_primas (descricao);

create index if not exists estoque_saldos_empresa_material_idx
  on public.estoque_saldos (empresa_id, materia_prima_id);

create index if not exists estoque_movimentacoes_empresa_material_idx
  on public.estoque_movimentacoes (empresa_id, materia_prima_id);

create index if not exists estoque_movimentacoes_projeto_idx
  on public.estoque_movimentacoes (projeto_id);

create index if not exists estoque_movimentacoes_of_numero_idx
  on public.estoque_movimentacoes (of_numero);

create index if not exists requisicoes_compra_empresa_status_idx
  on public.requisicoes_compra (empresa_id, status);

create index if not exists requisicoes_compra_projeto_idx
  on public.requisicoes_compra (projeto_id);

create index if not exists requisicoes_compra_of_numero_idx
  on public.requisicoes_compra (of_numero);

create index if not exists requisicao_compra_itens_requisicao_idx
  on public.requisicao_compra_itens (requisicao_compra_id);

create index if not exists requisicao_compra_itens_material_idx
  on public.requisicao_compra_itens (materia_prima_id);
