-- Estrutura o campo de capacidade de recursos_produtivos em uma coluna
-- numerica (horas/dia), preparando para a Simulacao Comercial de
-- Capacidade. A coluna de texto "capacidade" e mantida intacta por ora -
-- nenhuma tela ou consulta existente depende da nova coluna ainda.
alter table public.recursos_produtivos
  add column if not exists capacidade_horas_dia numeric;

alter table public.recursos_produtivos
  add constraint recursos_produtivos_capacidade_horas_dia_chk
  check (capacidade_horas_dia is null or capacidade_horas_dia >= 0);

comment on column public.recursos_produtivos.capacidade_horas_dia is
  'Capacidade produtiva estruturada em horas/dia. Migrada a partir da coluna de texto "capacidade" (ex.: "18h" -> 18). Nula = sem capacidade cadastrada.';

-- Migracao dos valores existentes: remove sufixo "h" (case-insensitive)
-- e espacos, converte para numeric. Valores que nao forem numericos apos
-- a limpeza permanecem nulos (nao ha nenhum caso assim nos dados atuais).
update public.recursos_produtivos
set capacidade_horas_dia = nullif(regexp_replace(trim(capacidade), '[Hh]$', ''), '')::numeric
where capacidade is not null
  and regexp_replace(trim(capacidade), '[Hh]$', '') ~ '^[0-9]+(\.[0-9]+)?$';
