-- Estoque Minimo e Estoque Ideal em Materia-Prima, para alerta visual
-- de reposicao na listagem. Ambos opcionais (nullable) - sem forcar
-- preenchimento em cadastros existentes ou novos.
alter table public.materias_primas
  add column if not exists estoque_minimo numeric,
  add column if not exists estoque_ideal numeric;

alter table public.materias_primas
  add constraint materias_primas_estoque_minimo_chk check (estoque_minimo is null or estoque_minimo >= 0);

alter table public.materias_primas
  add constraint materias_primas_estoque_ideal_chk check (estoque_ideal is null or estoque_ideal >= 0);

alter table public.materias_primas
  add constraint materias_primas_estoque_ideal_vs_minimo_chk check (
    estoque_minimo is null or estoque_ideal is null or estoque_ideal >= estoque_minimo
  );

comment on column public.materias_primas.estoque_minimo is
  'Nivel de estoque abaixo do qual a listagem mostra alerta visual de reposicao. Nulo = sem alerta configurado.';

comment on column public.materias_primas.estoque_ideal is
  'Nivel de estoque ideal de referencia (>= estoque_minimo quando ambos preenchidos). Ainda sem uso automatizado alem do cadastro.';
