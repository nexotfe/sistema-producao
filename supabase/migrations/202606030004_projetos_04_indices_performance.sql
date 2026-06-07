-- NEXOTFE - Projetos/Orcamentos - Parte 04
-- Indices para listagem, busca, filtros e preparacao da evolucao futura.

create index if not exists projetos_empresa_id_idx
  on public.projetos (empresa_id);

create index if not exists projetos_numero_projeto_idx
  on public.projetos (numero_projeto);

create index if not exists projetos_cliente_id_idx
  on public.projetos (cliente_id);

create index if not exists projetos_status_idx
  on public.projetos (status);

create index if not exists projetos_prioridade_idx
  on public.projetos (prioridade);

create index if not exists projetos_data_objetivo_idx
  on public.projetos (data_objetivo);

create index if not exists projeto_itens_empresa_id_idx
  on public.projeto_itens (empresa_id);

create index if not exists projeto_itens_projeto_id_idx
  on public.projeto_itens (projeto_id);

create index if not exists projeto_itens_produto_id_idx
  on public.projeto_itens (produto_id);

create index if not exists projeto_itens_pn_idx
  on public.projeto_itens (pn);
