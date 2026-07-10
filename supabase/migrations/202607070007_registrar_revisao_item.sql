-- Function que registra uma revisao de item_industrial de forma atomica.
--
-- Regra de negocio: ao aprovar uma nova revisao como vigente, fecha
-- automaticamente a revisao vigente anterior daquele item (vigente_ate =
-- current_date) - ela nao e removida nem bloqueada, so deixa de contar
-- como vigente (formula: vigente = aprovada_em is not null and
-- vigente_ate is null). Fechar a anterior e inserir a nova precisam
-- acontecer atomicamente: duas chamadas separadas via REST (update entao
-- insert) arriscam deixar o item sem nenhuma revisao vigente se o insert
-- falhar depois do update. Uma unica function e uma unica transacao do
-- ponto de vista do chamador - mesmo padrao ja usado em
-- registrar_consumo_interno (SECURITY INVOKER, nao definer - roda com o
-- papel do usuario chamador, sujeito as mesmas RLS policies das tabelas).

create or replace function public.registrar_revisao_item(
  p_item_industrial_id uuid,
  p_codigo_revisao text,
  p_aprovar_vigente boolean default false
)
returns uuid
language plpgsql
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_nova_id uuid;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if p_codigo_revisao is null or btrim(p_codigo_revisao) = '' then
    raise exception 'Codigo da revisao e obrigatorio.';
  end if;

  if not exists (
    select 1 from public.itens_industriais
     where id = p_item_industrial_id
       and empresa_id = v_empresa_id
       and deleted_at is null
  ) then
    raise exception 'Produto nao encontrado para a empresa atual.';
  end if;

  if p_aprovar_vigente then
    update public.revisoes_itens
       set vigente_ate = current_date
     where item_industrial_id = p_item_industrial_id
       and empresa_id = v_empresa_id
       and aprovada_em is not null
       and vigente_ate is null
       and deleted_at is null;
  end if;

  insert into public.revisoes_itens (
    empresa_id, item_industrial_id, codigo_revisao,
    aprovada_em, aprovada_por, vigente_desde, created_by
  )
  values (
    v_empresa_id,
    p_item_industrial_id,
    btrim(p_codigo_revisao),
    case when p_aprovar_vigente then now() else null end,
    case when p_aprovar_vigente then auth.uid() else null end,
    case when p_aprovar_vigente then current_date else null end,
    auth.uid()
  )
  returning id into v_nova_id;

  return v_nova_id;
end;
$function$;

comment on function public.registrar_revisao_item is
  'Registra revisao de itens_industriais; se aprovada como vigente, fecha atomicamente a vigente anterior do mesmo item antes de inserir a nova.';

grant execute on function public.registrar_revisao_item(uuid, text, boolean) to anon, authenticated;
