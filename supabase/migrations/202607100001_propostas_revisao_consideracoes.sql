-- Proposta Comercial - Passo 2 e 3: revisao manual e consideracoes editaveis.
-- O numero da proposta deixa de ter numeracao propria (tabela "propostas"
-- fica sem uso, ver useProposta.ts) e passa a ser o proprio numero_projeto.
-- Revisao e Consideracoes viram controlados pelo usuario, por projeto.
alter table public.projetos
  add column if not exists proposta_revisao text not null default 'A',
  add column if not exists proposta_consideracoes text;

alter table public.projetos
  add constraint projetos_proposta_revisao_chk check (proposta_revisao ~ '^[A-Z]+$');

comment on column public.projetos.proposta_revisao is
  'Revisao atual da Proposta Comercial (A, B, C...), avancada manualmente pelo usuario via botao "Nova Revisao".';

comment on column public.projetos.proposta_consideracoes is
  'Texto de "Consideracoes" da Proposta Comercial, editavel por projeto. Nulo = ainda nao editado pelo usuario (frontend mostra texto padrao como sugestao, sem persistir).';
