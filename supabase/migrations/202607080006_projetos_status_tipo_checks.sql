-- Fase B do modulo Projeto - Passo 1 e 2.
-- Tabela projetos esta vazia (0 linhas) - sem risco de migracao de dado.
--
-- Passo 1: o CHECK real de status em producao (orcamento/aprovado/producao/
-- finalizado/cancelado) havia divergido do que o codigo (constants.ts,
-- types.ts, StatusBadge.tsx) sempre assumiu (em_elaboracao/em_analise/
-- aprovado/perdido/cancelado). Redefinido para os 4 valores decididos
-- nesta sessao: rascunho, em_analise, reprovado, aprovado.
alter table public.projetos
  drop constraint projetos_status_chk;

alter table public.projetos
  add constraint projetos_status_chk check (
    status in ('rascunho', 'em_analise', 'reprovado', 'aprovado')
  );

-- Passo 2: Natureza (tipo_projeto) expandida para incluir Industrializacao
-- e Servico, alem de Fabricacao e Desenvolvimento ja existentes.
alter table public.projetos
  drop constraint projetos_tipo_chk;

alter table public.projetos
  add constraint projetos_tipo_chk check (
    tipo_projeto in ('fabricacao', 'desenvolvimento', 'industrializacao', 'servico')
  );
