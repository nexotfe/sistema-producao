-- NEXOTFE - Planejamento de Compras - Parte 07
-- Dimensoes industriais preservadas por OF/origem.

alter table public.planejamento_compra_origens
  add column if not exists quantidade_pecas numeric,
  add column if not exists comprimento_necessario numeric,
  add column if not exists largura_necessaria numeric,
  add column if not exists espessura_necessaria text,
  add column if not exists dimensao_operacional text,
  add column if not exists incluir_no_planejamento boolean not null default true,
  add column if not exists ordem_agrupamento integer;

alter table public.planejamento_compra_origens
  add constraint planejamento_compra_origens_dimensoes_chk check (
    (quantidade_pecas is null or quantidade_pecas > 0)
    and (comprimento_necessario is null or comprimento_necessario > 0)
    and (largura_necessaria is null or largura_necessaria > 0)
  );
