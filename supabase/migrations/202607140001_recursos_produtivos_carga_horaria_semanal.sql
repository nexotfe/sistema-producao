-- Carga Horaria Semanal + Dias Trabalhados por Semana: campos estruturados
-- que, preenchidos juntos no formulario de Recurso, calculam e gravam
-- capacidade_horas_dia automaticamente (media diaria). capacidade_horas_dia
-- ja existia (202607120001) mas estava orfa - nenhuma tela lia ou gravava
-- nela. Aditiva: nao mexe em capacidade_horas_dia nem no campo de texto
-- livre antigo "capacidade".
alter table public.recursos_produtivos
  add column if not exists carga_horaria_semanal numeric,
  add column if not exists dias_trabalhados_semana smallint;

alter table public.recursos_produtivos
  add constraint recursos_produtivos_carga_horaria_semanal_chk
  check (carga_horaria_semanal is null or carga_horaria_semanal >= 0);

alter table public.recursos_produtivos
  add constraint recursos_produtivos_dias_trabalhados_semana_chk
  check (dias_trabalhados_semana is null or dias_trabalhados_semana between 1 and 7);

comment on column public.recursos_produtivos.carga_horaria_semanal is
  'Carga horaria semanal (horas). Junto com dias_trabalhados_semana, calcula capacidade_horas_dia automaticamente no formulario. Nula = capacidade_horas_dia foi definida de outra forma (ex.: migracao do campo texto antigo "capacidade").';

comment on column public.recursos_produtivos.dias_trabalhados_semana is
  'Dias por semana trabalhados (1 a 7). Usado junto com carga_horaria_semanal para calcular capacidade_horas_dia.';
