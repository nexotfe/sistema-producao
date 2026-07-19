-- Garante no máximo 1 evento ativo (deleted_at is null and ativo = true)
-- por empresa_id + data em calendario_empresa_eventos - pré-condição da
-- função resolverDiaProdutivo (Etapa 1 do motor de Simulação Comercial,
-- ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md seção 7.4),
-- que precisa buscar no máximo 1 evento aplicável sem ambiguidade.
--
-- Verifica duplicidade preexistente ANTES de criar o índice. Se houver
-- qualquer empresa_id+data com mais de 1 evento ativo, interrompe a
-- migration sem tocar em nenhum dado - a correção é decisão manual, feita
-- depois de ver o erro (não apagar, não atualizar, não desativar, não
-- escolher qual registro manter automaticamente).
do $$
declare
  v_conflitos text;
begin
  select string_agg(
    format('empresa_id=%s data=%s (ids: %s)', empresa_id, data, ids),
    E'\n'
  )
  into v_conflitos
  from (
    select empresa_id, data, string_agg(id::text, ', ') as ids
    from public.calendario_empresa_eventos
    where deleted_at is null and ativo = true
    group by empresa_id, data
    having count(*) > 1
  ) conflitantes;

  if v_conflitos is not null then
    raise exception E'Duplicidade de eventos ativos encontrada — corrija manualmente antes de aplicar esta migration:\n%', v_conflitos;
  end if;
end $$;

create unique index calendario_empresa_eventos_ativo_unico
  on public.calendario_empresa_eventos (empresa_id, data)
  where deleted_at is null and ativo = true;
