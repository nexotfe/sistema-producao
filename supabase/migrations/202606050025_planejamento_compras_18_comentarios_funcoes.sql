-- NEXOTFE - Planejamento de Compras - Parte 18
-- Documenta persistencia da decisao do comprador.

comment on function public.atualizar_planejamento_compra_decisao(
  uuid,
  text,
  text,
  numeric,
  text,
  numeric
) is
  'Salva modo, campo Comprar, unidade, quantidade e sobra prevista.';

comment on function public.definir_planejamento_compra_origem(
  uuid,
  boolean,
  integer
) is
  'Define se uma origem/OF participa deste planejamento de compras.';
