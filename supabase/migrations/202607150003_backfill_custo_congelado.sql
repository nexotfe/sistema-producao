-- Backfill retroativo: projetos ja fora de "rascunho" hoje nao tem
-- historico de preco real (nunca foi guardado) - congela com o preco
-- de catalogo atual, a unica opcao possivel. Decisao de negocio
-- confirmada pelo usuario (projetos existentes sao ficticios/teste).
do $$
declare
  v_projeto record;
begin
  for v_projeto in
    select id from public.projetos where status <> 'rascunho'
  loop
    perform public.congelar_custos_projeto(v_projeto.id);
  end loop;
end;
$$;
