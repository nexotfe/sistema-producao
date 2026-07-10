-- PASSO 1 (Fase B Roteiro) - custo de referencia para materias_primas.
-- Hoje nao existe nenhuma coluna de custo/preco em materias_primas nem em
-- materias_primas_fornecedores (confirmado no levantamento anterior) - o
-- calculo de custo de materia-prima do Roteiro nao tem de onde ler.
--
-- custo_origem = 'manual': valor digitado por alguem, exige justificativa
-- quando ha valor preenchido (por que aquele numero foi usado). 'nf':
-- reservado para quando o modulo de Compras existir e puder derivar o
-- custo de notas fiscais reais - nesse caso nao exige justificativa (a
-- prova e a propria NF).

alter table public.materias_primas
  add column custo_referencia numeric,
  add column custo_origem text not null default 'manual',
  add column custo_justificativa text,
  add column custo_atualizado_em timestamptz,
  add column custo_atualizado_por uuid references auth.users(id);

alter table public.materias_primas
  add constraint materias_primas_custo_origem_chk
    check (custo_origem = any (array['manual', 'nf'])),
  add constraint materias_primas_custo_referencia_chk
    check (custo_referencia is null or custo_referencia >= 0),
  add constraint materias_primas_custo_justificativa_chk
    check (
      custo_origem <> 'manual'
      or custo_referencia is null
      or (custo_justificativa is not null and btrim(custo_justificativa) <> '')
    );

comment on column public.materias_primas.custo_referencia is
  'Custo de referencia usado no calculo de custo de materia-prima do Roteiro.';
comment on column public.materias_primas.custo_origem is
  'manual = valor digitado (exige justificativa); nf = derivado de nota fiscal real (Compras, uso futuro).';
comment on column public.materias_primas.custo_justificativa is
  'Obrigatoria quando custo_origem = manual e custo_referencia esta preenchido.';
