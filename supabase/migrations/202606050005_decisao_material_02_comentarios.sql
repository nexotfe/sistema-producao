-- NEXOTFE - Decisao Material - Parte 02
-- Documenta funcoes operacionais de suprimentos.

comment on function public.registrar_requisicao_compra_material(
  uuid,
  text,
  uuid,
  numeric,
  text,
  date,
  text
) is
  'Gera requisicao de compra externa para falta de materia-prima.';

comment on function public.processar_necessidade_material(
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
  'Decide automaticamente entre CI total, compra total ou CI parcial com compra complementar.';
