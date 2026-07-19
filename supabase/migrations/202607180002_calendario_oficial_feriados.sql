-- Calendario Oficial de feriados - global, mantido pela SISARE,
-- somente leitura pelo ERP. Ver
-- ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secao 7.1.
create table public.calendario_oficial_feriados (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  abrangencia text not null check (abrangencia in ('nacional','estadual','municipal')),
  pais_codigo text not null default 'BR',
  uf_codigo text,
  municipio_codigo text,
  descricao text not null,
  created_at timestamptz not null default now(),
  constraint calendario_oficial_feriados_abrangencia_chk check (
    (abrangencia = 'nacional' and uf_codigo is null and municipio_codigo is null) or
    (abrangencia = 'estadual' and uf_codigo is not null and municipio_codigo is null) or
    (abrangencia = 'municipal' and uf_codigo is not null and municipio_codigo is not null)
  ),
  constraint calendario_oficial_feriados_unico unique (data, abrangencia, pais_codigo, uf_codigo, municipio_codigo)
);

comment on table public.calendario_oficial_feriados is
  'Calendario Oficial de feriados - global, mantido pela SISARE, somente leitura pelo ERP. Ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secao 7.1.';

create index calendario_oficial_feriados_data_idx on public.calendario_oficial_feriados (data);
create index calendario_oficial_feriados_uf_municipio_idx on public.calendario_oficial_feriados (uf_codigo, municipio_codigo);

alter table public.calendario_oficial_feriados enable row level security;

create policy calendario_oficial_feriados_select_all
  on public.calendario_oficial_feriados
  for select to authenticated
  using (true);

-- Seed: feriados nacionais 2026
insert into public.calendario_oficial_feriados (data, abrangencia, descricao) values
  ('2026-01-01','nacional','Confraternização Universal'),
  ('2026-02-16','nacional','Carnaval (segunda-feira)'),
  ('2026-02-17','nacional','Carnaval (terça-feira)'),
  ('2026-04-03','nacional','Sexta-feira Santa'),
  ('2026-04-21','nacional','Tiradentes'),
  ('2026-05-01','nacional','Dia do Trabalho'),
  ('2026-06-04','nacional','Corpus Christi'),
  ('2026-09-07','nacional','Independência do Brasil'),
  ('2026-10-12','nacional','Nossa Senhora Aparecida'),
  ('2026-11-02','nacional','Finados'),
  ('2026-11-15','nacional','Proclamação da República'),
  ('2026-11-20','nacional','Dia Nacional de Zumbi e da Consciência Negra'),
  ('2026-12-25','nacional','Natal');

-- Seed: feriado estadual SP 2026
insert into public.calendario_oficial_feriados (data, abrangencia, uf_codigo, descricao) values
  ('2026-07-09','estadual','SP','Revolução Constitucionalista de 1932');

-- Seed: feriado municipal Sao Jose dos Campos 2026
insert into public.calendario_oficial_feriados (data, abrangencia, uf_codigo, municipio_codigo, descricao) values
  ('2026-07-27','municipal','SP','3549904','Aniversário de São José dos Campos');
