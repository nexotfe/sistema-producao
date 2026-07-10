-- Fase B do modulo Projeto - Passo 5.
-- A tabela public.projetos nunca teve uma coluna de descricao/nome - nem
-- na migration original (202606030001) nem no schema real em producao.
-- O card "Identificacao do Projeto" sempre exibiu "Descricao do Projeto"
-- como mock puro, sem coluna correspondente. Tabela vazia (0 linhas) -
-- sem risco de migracao de dado.
alter table public.projetos
  add column nome text not null default '';

alter table public.projetos
  alter column nome drop default;

comment on column public.projetos.nome is
  'Descricao do projeto (Identificacao do Projeto na tela).';
