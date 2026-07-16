-- Produtividade Padrao configuravel por Grupo de Recursos, com
-- sobrescrita individual no Recurso Produtivo. Ver
-- ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md, secao 8 -
-- sem categoria fixa do sistema; cada empresa decide livremente a
-- produtividade de cada um dos seus proprios Grupos.
alter table public.grupos_recursos
  add column if not exists produtividade_padrao numeric;

alter table public.grupos_recursos
  add constraint grupos_recursos_produtividade_padrao_chk
  check (produtividade_padrao is null or (produtividade_padrao > 0 and produtividade_padrao <= 1));

comment on column public.grupos_recursos.produtividade_padrao is
  'Produtividade padrao do grupo (fracao 0-1, ex: 0.85 = 85%). Usada pela Simulacao Comercial de Capacidade para reduzir a Capacidade Bruta. Configuravel livremente por empresa/grupo, sem categoria fixa do sistema (ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md, secao 8). Recursos do grupo herdam este valor, salvo sobrescrita individual em recursos_produtivos.produtividade.';

alter table public.recursos_produtivos
  add column if not exists produtividade numeric;

alter table public.recursos_produtivos
  add constraint recursos_produtivos_produtividade_chk
  check (produtividade is null or (produtividade > 0 and produtividade <= 1));

comment on column public.recursos_produtivos.produtividade is
  'Sobrescrita individual da Produtividade Padrao do Grupo (fracao 0-1). Nulo = herda grupos_recursos.produtividade_padrao do grupo_id deste recurso.';
