-- Produtividade efetiva do recurso: valor especifico (sobrescrita),
-- ou herdado do Grupo quando o recurso nao tem sobrescrita propria.
-- Funcao reaproveitavel para evitar duplicar esta regra de heranca em
-- cada consumidor (Simulacao Comercial, futuro PCP) - mesmo motivo que
-- levou a criar calcular_custo_bom em vez de repetir a logica de custo
-- em useOrcamento/useProjeto/useProposta.
create or replace function public.calcular_produtividade_efetiva(p_recurso_id uuid)
returns numeric
language sql
stable
as $function$
  select coalesce(rp.produtividade, gr.produtividade_padrao)
  from public.recursos_produtivos rp
  join public.grupos_recursos gr on gr.id = rp.grupo_id
  where rp.id = p_recurso_id
    and rp.deleted_at is null
    and gr.deleted_at is null;
$function$;

comment on function public.calcular_produtividade_efetiva(uuid) is
  'Produtividade efetiva do recurso: recursos_produtivos.produtividade se preenchida, senao grupos_recursos.produtividade_padrao do grupo do recurso. Retorna NULL se nenhum dos dois estiver definido, ou se o recurso nao existir/nao pertencer a empresa do usuario atual (RLS, security invoker).';
