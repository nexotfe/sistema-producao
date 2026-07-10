-- Fase B do modulo Orcamento - Passo 1.
-- margem_lucro_percent: sugestao configuravel (default 20.00), ajustavel
-- pelo orcamentista por orcamento (projeto).
-- carga_tributaria_percent: nullable - quando null, a tela usa a sugestao
-- por Natureza (configuracoes_empresa 'carga_tributaria_por_natureza').
alter table public.projetos
  add column margem_lucro_percent numeric not null default 20.00,
  add column carga_tributaria_percent numeric;

alter table public.projetos
  add constraint projetos_margem_lucro_chk check (margem_lucro_percent >= 0),
  add constraint projetos_carga_tributaria_chk check (
    carga_tributaria_percent is null or carga_tributaria_percent >= 0
  );

comment on column public.projetos.margem_lucro_percent is
  'Margem de lucro % sugerida (default 20.00), ajustavel pelo orcamentista por orcamento.';

comment on column public.projetos.carga_tributaria_percent is
  'Carga tributaria % ajustada pelo orcamentista. Null = usa a sugestao da Natureza (configuracoes_empresa.carga_tributaria_por_natureza).';
