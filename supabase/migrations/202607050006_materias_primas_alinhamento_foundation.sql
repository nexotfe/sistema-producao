alter table public.materias_primas
  add column if not exists familia text,
  add column if not exists bitola text,
  add column if not exists dimensao text,
  add column if not exists ncm text,
  add column if not exists endereco text,
  add column if not exists fabricante text,
  add column if not exists marca text,
  add column if not exists norma text,
  add column if not exists peso_especifico text,
  add column if not exists observacoes_tecnicas text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materias_primas'
      and column_name = 'especificacao'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materias_primas'
      and column_name = 'material_especificacao'
  ) then
    alter table public.materias_primas
      rename column especificacao to material_especificacao;
  end if;
end $$;

alter table public.materias_primas
  drop constraint if exists materias_primas_unidade_chk;

alter table public.materias_primas
  add constraint materias_primas_unidade_chk
  check (btrim(unidade) <> '');

alter table public.materias_primas
  drop constraint if exists materias_primas_codigo_chk;

alter table public.materias_primas
  add constraint materias_primas_codigo_chk
  check (codigo is null or btrim(codigo) <> '');

alter table public.materias_primas
  drop constraint if exists materias_primas_descricao_chk;

alter table public.materias_primas
  add constraint materias_primas_descricao_chk
  check (btrim(descricao) <> '');

create index if not exists materias_primas_empresa_ativo_idx
  on public.materias_primas (empresa_id, ativo)
  where deleted_at is null;
