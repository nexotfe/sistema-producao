-- NEXOTFE - Planejamento de Compras - Parte 08
-- Documenta chave industrial e escolha do comprador.

comment on column public.planejamentos_compra.chave_industrial_compra is
  'Chave para agrupar materiais compativeis, como SAE 1020|chapa|3/4.';

comment on column public.planejamentos_compra.modo_planejamento is
  'Decisao do comprador: manual, somar todas, por OF ou agrupamento parcial.';

comment on column public.planejamentos_compra.criterio_calculo is
  'Como comparar necessidades: comprimento, area, volume, peca ou manual.';

comment on column public.planejamento_compra_origens.dimensao_operacional is
  'Dimensao da necessidade da OF, preservada para rastreabilidade.';

comment on column public.planejamento_compra_origens.incluir_no_planejamento is
  'Permite deixar uma origem fora deste planejamento e criar outro grupo.';
