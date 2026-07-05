alter table public.recursos_produtivos
  add column if not exists valor_hora numeric(12,2) not null default 0;

alter table public.recursos_produtivos
  drop constraint if exists recursos_produtivos_valor_hora_non_negative;

alter table public.recursos_produtivos
  add constraint recursos_produtivos_valor_hora_non_negative
  check (valor_hora >= 0);
