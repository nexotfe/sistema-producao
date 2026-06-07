-- NEXOTFE - Planejamento de Compras - Parte 14
-- Campo textual para decisao real do comprador.

alter table public.planejamentos_compra
  add column if not exists comprar_descricao text;

comment on column public.planejamentos_compra.comprar_descricao is
  'Texto informado pelo comprador sobre o que sera comprado.';
