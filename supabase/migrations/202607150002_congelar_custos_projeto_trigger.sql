-- Congela/descongela projeto_itens.custo_congelado conforme o Projeto
-- entra ou sai de "rascunho" (Em elaboracao), e congela itens novos
-- inseridos num projeto que ja esta fora de rascunho. Replica a mesma
-- resolucao de BOM/materia-prima ja usada (e duplicada) em
-- useOrcamento.ts, useProjeto.ts e useProposta.ts.
create or replace function public.congelar_custos_projeto(p_projeto_id uuid)
returns void
language plpgsql
as $function$
declare
  v_tipo_projeto text;
  v_excluir_materia_prima boolean;
  v_item record;
  v_bom_id uuid;
  v_custo_unitario numeric;
begin
  select tipo_projeto into v_tipo_projeto
  from public.projetos
  where id = p_projeto_id;

  v_excluir_materia_prima := (v_tipo_projeto = 'industrializacao');

  for v_item in
    select id, produto_id
    from public.projeto_itens
    where projeto_id = p_projeto_id
      and ativo = true
      and deleted_at is null
  loop
    select id into v_bom_id
    from public.boms
    where produto_id = v_item.produto_id
      and deleted_at is null
    order by (status = 'ativo') desc, created_at desc
    limit 1;

    v_custo_unitario := 0;

    if v_bom_id is not null then
      select t.valor into v_custo_unitario
      from public.calcular_custo_bom(v_bom_id, 0, v_excluir_materia_prima) t
      where t.categoria = 'total';
    end if;

    update public.projeto_itens
    set custo_congelado = coalesce(v_custo_unitario, 0),
        custo_congelado_em = now(),
        custo_editado_manualmente = false
    where id = v_item.id;
  end loop;
end;
$function$;

create or replace function public.descongelar_custos_projeto(p_projeto_id uuid)
returns void
language plpgsql
as $function$
begin
  update public.projeto_itens
  set custo_congelado = null,
      custo_congelado_em = null,
      custo_editado_manualmente = false
  where projeto_id = p_projeto_id;
end;
$function$;

create or replace function public.trg_projetos_congelar_custos()
returns trigger
language plpgsql
as $function$
begin
  if old.status = 'rascunho' and new.status <> 'rascunho' then
    perform public.congelar_custos_projeto(new.id);
  elsif old.status <> 'rascunho' and new.status = 'rascunho' then
    perform public.descongelar_custos_projeto(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists projetos_congelar_custos on public.projetos;
create trigger projetos_congelar_custos
  after update of status on public.projetos
  for each row
  when (old.status is distinct from new.status)
  execute function public.trg_projetos_congelar_custos();

-- Item novo inserido num projeto ja fora de rascunho nasce congelado -
-- sem isso, ficaria com custo_congelado nulo e cairia de volta no
-- calculo ao vivo, reabrindo a brecha so para esse item.
create or replace function public.trg_projeto_itens_congelar_ao_inserir()
returns trigger
language plpgsql
as $function$
declare
  v_status text;
  v_tipo_projeto text;
  v_bom_id uuid;
  v_custo_unitario numeric;
begin
  select status, tipo_projeto into v_status, v_tipo_projeto
  from public.projetos
  where id = new.projeto_id;

  if v_status is distinct from 'rascunho' then
    select id into v_bom_id
    from public.boms
    where produto_id = new.produto_id
      and deleted_at is null
    order by (status = 'ativo') desc, created_at desc
    limit 1;

    v_custo_unitario := 0;

    if v_bom_id is not null then
      select t.valor into v_custo_unitario
      from public.calcular_custo_bom(v_bom_id, 0, (v_tipo_projeto = 'industrializacao')) t
      where t.categoria = 'total';
    end if;

    new.custo_congelado := coalesce(v_custo_unitario, 0);
    new.custo_congelado_em := now();
  end if;

  return new;
end;
$function$;

drop trigger if exists projeto_itens_congelar_ao_inserir on public.projeto_itens;
create trigger projeto_itens_congelar_ao_inserir
  before insert on public.projeto_itens
  for each row
  execute function public.trg_projeto_itens_congelar_ao_inserir();
