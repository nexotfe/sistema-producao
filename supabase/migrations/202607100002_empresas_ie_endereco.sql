-- Onboarding manual da Enifer (direto no banco, sem tela de onboarding
-- ainda). Faltavam colunas para Inscricao Estadual e Endereco em
-- empresas - dados oficiais que ja existem em documento da empresa e
-- nao tem onde ir hoje (site vai para configuracoes_empresa, que ja e
-- o padrao usado para dado extra por empresa).
alter table public.empresas
  add column if not exists inscricao_estadual text,
  add column if not exists endereco text;

comment on column public.empresas.inscricao_estadual is
  'Inscricao Estadual da empresa, quando aplicavel.';

comment on column public.empresas.endereco is
  'Endereco completo da empresa (texto livre, sem normalizacao em campos separados nesta fase).';
