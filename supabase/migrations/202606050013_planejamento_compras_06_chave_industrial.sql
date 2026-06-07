-- NEXOTFE - Planejamento de Compras - Parte 06
-- Chave industrial e modo de agrupamento do comprador.

alter table public.planejamentos_compra
  add column if not exists material_base text,
  add column if not exists forma_material text,
  add column if not exists bitola_ou_espessura text,
  add column if not exists chave_industrial_compra text,
  add column if not exists modo_planejamento text not null default 'manual',
  add column if not exists criterio_calculo text not null default 'manual';

alter table public.planejamentos_compra
  add constraint planejamentos_compra_forma_material_chk check (
    forma_material is null
    or forma_material in ('barra', 'chapa', 'bloco', 'tubo', 'perfil', 'peca')
  );

alter table public.planejamentos_compra
  add constraint planejamentos_compra_modo_chk check (
    modo_planejamento in ('manual', 'somar_todas', 'por_of', 'agrupamento_parcial')
  );

alter table public.planejamentos_compra
  add constraint planejamentos_compra_criterio_chk check (
    criterio_calculo in ('manual', 'comprimento', 'area', 'volume', 'peca')
  );
