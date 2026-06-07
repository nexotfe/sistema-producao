-- NEXOTFE - Planejamento de Compras - Parte 02
-- Documenta a camada entre requisicao e pedido.

comment on table public.planejamentos_compra is
  'Planejamento de Compras agrupa requisicoes compativeis antes do pedido.';

comment on table public.planejamento_compra_origens is
  'Origens de OF/projeto que compoem um planejamento de compras.';

comment on column public.planejamentos_compra.quantidade_necessaria_total is
  'Soma das necessidades originadas pelas requisicoes vinculadas.';

comment on column public.planejamentos_compra.quantidade_planejada_compra is
  'Quantidade que o comprador decidiu comprar na unidade comercial.';

comment on column public.planejamentos_compra.sobra_prevista is
  'Diferenca prevista entre compra planejada e necessidades vinculadas.';
