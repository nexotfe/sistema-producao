-- DEC-001: Desconto Comercial do Orcamento.
-- desconto_percentual: nullable, default null = sem desconto. Aplicado
-- exclusivamente sobre o Valor Tecnico do Orcamento (ja calculado, com
-- impostos) - nunca recalcula custo, imposto ou margem.
-- desconto_motivo: nullable, texto livre opcional (ex: "Negociacao
-- Comercial"). Campo unico, sem historico de alteracoes (DEC-001,
-- secao "Escopo desta versao").
alter table public.projetos
  add column desconto_percentual numeric,
  add column desconto_motivo text;

alter table public.projetos
  add constraint projetos_desconto_percentual_chk check (
    desconto_percentual is null
    or (desconto_percentual >= 0 and desconto_percentual < 100)
  );

comment on column public.projetos.desconto_percentual is
  'Desconto comercial % aplicado sobre o Valor Tecnico do Orcamento. Null = sem desconto. DEC-001.';

comment on column public.projetos.desconto_motivo is
  'Motivo do desconto comercial, texto livre opcional (ex: Negociacao Comercial). DEC-001.';
