-- NEXOTFE - Consumo Interno - Parte 03
-- Documenta a funcao operacional de CI.

comment on function public.registrar_consumo_interno(
  uuid,
  text,
  uuid,
  numeric,
  text,
  numeric,
  text,
  date,
  text
) is
  'Gera Consumo Interno quando ha saldo livre suficiente e reserva o material no estoque.';
