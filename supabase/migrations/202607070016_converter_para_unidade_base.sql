-- Conversao entre unidades de consumo e unidade de preco da materia-prima.
-- Hoje so cobre mm/cm -> metro (unico caso real pedido); mesma unidade
-- retorna sem alteracao; qualquer outra combinacao e erro claro (evita
-- calculo silenciosamente errado por incompatibilidade de unidade).
create or replace function public.converter_para_unidade_base(
  quantidade numeric,
  unidade_origem text,
  unidade_destino text
)
returns numeric
language plpgsql
immutable
as $function$
begin
  if unidade_origem = unidade_destino then
    return quantidade;
  end if;

  if unidade_origem = 'mm' and unidade_destino = 'metro' then
    return quantidade / 1000;
  end if;

  if unidade_origem = 'cm' and unidade_destino = 'metro' then
    return quantidade / 100;
  end if;

  raise exception 'Conversao de unidade invalida: % para %.', unidade_origem, unidade_destino;
end;
$function$;

comment on function public.converter_para_unidade_base(numeric, text, text) is
  'Converte quantidade da unidade de consumo (bom_itens.unidade) para a unidade de preco da materia-prima (materias_primas.unidade). Suporta mm/cm -> metro e mesma unidade; outras combinacoes geram erro.';

grant execute on function public.converter_para_unidade_base(numeric, text, text) to anon, authenticated;
