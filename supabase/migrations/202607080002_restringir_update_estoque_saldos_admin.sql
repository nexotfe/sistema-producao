-- Reforco de seguranca: a policy de UPDATE de estoque_saldos permitia
-- qualquer usuario autenticado da mesma empresa, nao so admin - a
-- protecao "so admin" existia apenas dentro de
-- ajustar_estoque_materia_prima() (SECURITY DEFINER), nao na tabela em
-- si. Um usuario nao-admin podia alterar saldo diretamente via API,
-- por fora da function. Esta migration fecha essa porta na propria
-- policy, mesmo padrao "mesma empresa AND usuario_e_admin()" ja usado
-- em outras tabelas (ex: funcionarios, recursos, grupos_recursos).
--
-- Verificacao previa (antes de aplicar): 3 functions referenciam
-- estoque_saldos (prosrc ilike '%estoque_saldos%'):
--   - ajustar_estoque_materia_prima: SECURITY DEFINER, ja bypassa RLS -
--     nao afetada.
--   - processar_necessidade_material: so SELECT (leitura) - nao afetada.
--   - criar_ordem_fabricacao_operacional: so SELECT ... FOR UPDATE (lock
--     de leitura, regido pela policy de SELECT, nao a de UPDATE) - nao
--     afetada.
--   - registrar_consumo_interno: SECURITY INVOKER (rodava com o papel do
--     usuario chamador) e faz um UPDATE real em estoque_saldos
--     (incrementa saldo_reservado ao gerar uma reserva de consumo). Essa
--     e a UNICA function que quebraria para usuario nao-admin com a
--     policy restrita - registrar consumo interno e uma acao operacional
--     normal (chao de fabrica), nao deveria virar admin-only como efeito
--     colateral. Por isso ela tambem foi convertida para SECURITY
--     DEFINER nesta mesma migration (ja validava tudo manualmente:
--     empresa_atual_id(), quantidade > 0, saldo suficiente - mesmo
--     estilo "seguro para definer" ja usado em ajustar_estoque_materia_prima).

alter policy estoque_saldos_update_tenant on estoque_saldos
  using (empresa_id = empresa_atual_id() and usuario_e_admin())
  with check (empresa_id = empresa_atual_id() and usuario_e_admin());

create or replace function public.registrar_consumo_interno(
  p_projeto_id uuid,
  p_of_numero text,
  p_materia_prima_id uuid,
  p_quantidade numeric,
  p_unidade text,
  p_custo_unitario_material numeric default 0,
  p_local_estoque text default 'principal',
  p_data_movimentacao date default current_date,
  p_observacoes text default null,
  p_of_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_saldo_livre numeric;
  v_movimentacao_id uuid;
  v_consumo_id uuid;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if p_quantidade <= 0 then
    raise exception 'Quantidade do consumo interno deve ser maior que zero.';
  end if;

  if p_custo_unitario_material < 0 then
    raise exception 'Custo unitario do material nao pode ser negativo.';
  end if;

  if p_unidade not in ('kg', 'metro', 'barra', 'chapa', 'peca') then
    raise exception 'Unidade invalida para consumo interno.';
  end if;

  select saldo_livre into v_saldo_livre
  from public.estoque_saldos
  where empresa_id = v_empresa_id
    and materia_prima_id = p_materia_prima_id
    and local_estoque = p_local_estoque
  for update;

  if v_saldo_livre is null then
    raise exception 'Saldo de estoque nao encontrado para a materia-prima.';
  end if;

  if v_saldo_livre < p_quantidade then
    raise exception 'Saldo livre insuficiente para gerar consumo interno.';
  end if;

  update public.estoque_saldos
  set saldo_reservado = saldo_reservado + p_quantidade
  where empresa_id = v_empresa_id
    and materia_prima_id = p_materia_prima_id
    and local_estoque = p_local_estoque;

  insert into public.estoque_movimentacoes (
    empresa_id, materia_prima_id, local_estoque, tipo_movimento, quantidade,
    projeto_id, of_numero, of_id, observacoes, created_by
  )
  values (
    v_empresa_id, p_materia_prima_id, p_local_estoque, 'reserva', p_quantidade,
    p_projeto_id, p_of_numero, p_of_id,
    coalesce(p_observacoes, 'Reserva gerada por Consumo Interno'), auth.uid()
  )
  returning id into v_movimentacao_id;

  insert into public.consumos_internos (
    empresa_id, projeto_id, of_numero, of_id, materia_prima_id,
    estoque_movimentacao_id, local_estoque, quantidade, unidade,
    saldo_consumido, custo_unitario_material, data_movimentacao,
    observacoes, created_by
  )
  values (
    v_empresa_id, p_projeto_id, p_of_numero, p_of_id, p_materia_prima_id,
    v_movimentacao_id, p_local_estoque, p_quantidade, p_unidade,
    p_quantidade, p_custo_unitario_material, p_data_movimentacao,
    p_observacoes, auth.uid()
  )
  returning id into v_consumo_id;

  return v_consumo_id;
end;
$function$;

comment on function public.registrar_consumo_interno(uuid, text, uuid, numeric, text, numeric, text, date, text, uuid) is
  'Registra consumo interno de materia-prima (gera reserva de estoque + linha em consumos_internos) de forma atomica. SECURITY DEFINER: valida tudo manualmente (empresa, quantidade, saldo) para continuar funcionando para usuarios nao-admin apos a policy de UPDATE de estoque_saldos ter sido restrita a admin.';

grant execute on function public.registrar_consumo_interno(uuid, text, uuid, numeric, text, numeric, text, date, text, uuid) to anon, authenticated;
