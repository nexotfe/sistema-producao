-- Localizacao da empresa (Pais/UF/Municipio) - usada para filtrar o
-- Calendario Oficial. Nullable inicialmente, com backfill das
-- empresas reais existentes. Ver
-- ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secao 7.5.
alter table public.empresas
  add column if not exists pais_codigo text,
  add column if not exists uf_codigo text,
  add column if not exists municipio_codigo text;

comment on column public.empresas.pais_codigo is 'Codigo ISO do pais (ex: BR). Nullable inicialmente - ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secao 7.5.';
comment on column public.empresas.uf_codigo is 'Sigla da UF (ex: SP). Usado para filtrar o Calendario Oficial.';
comment on column public.empresas.municipio_codigo is 'Codigo IBGE do municipio (ex: 3549904 = Sao Jose dos Campos). Usado para filtrar o Calendario Oficial.';

update public.empresas
set pais_codigo = 'BR', uf_codigo = 'SP', municipio_codigo = '3549904'
where id in ('f835684a-0400-43a5-ba54-dd4629230c3c', 'd7b40f3a-91f9-492a-893e-50770480327b');
