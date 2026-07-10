-- Ajuste manual de estoque de produto, espelhando EXATAMENTE
-- ajustar_estoque_materia_prima (mesma logica: SECURITY DEFINER, checa
-- usuario_e_admin(), abs(diferenca) para respeitar
-- produto_movimentacoes_quantidade_chk (quantidade > 0), sinal do ajuste
-- registrado em observacoes, diferenca zero nao gera movimentacao,
-- saldo_reservado > novo saldo e erro claro.
create or replace function public.ajustar_estoque_produto(
  p_item_id uuid,
  p_saldo_real numeric,
  p_justificativa text,
  p_local_estoque text default 'principal'
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_saldo_atual numeric;
  v_saldo_reservado numeric;
  v_existe boolean := false;
  v_diferenca numeric;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if not public.usuario_e_admin() then
    raise exception 'Apenas administradores podem ajustar estoque.';
  end if;

  if p_justificativa is null or btrim(p_justificativa) = '' then
    raise exception 'Justificativa e obrigatoria para ajuste de estoque.';
  end if;

  if p_saldo_real is null or p_saldo_real < 0 then
    raise exception 'Saldo real deve ser um numero maior ou igual a zero.';
  end if;

  if not exists (
    select 1 from public.itens_industriais
     where id = p_item_id
       and empresa_id = v_empresa_id
       and ativo = true
       and deleted_at is null
  ) then
    raise exception 'Produto nao encontrado para a empresa atual.';
  end if;

  select saldo_disponivel, saldo_reservado, true
    into v_saldo_atual, v_saldo_reservado, v_existe
  from public.produto_saldos
  where item_id = p_item_id
    and empresa_id = v_empresa_id
    and local_estoque = p_local_estoque;

  if not found then
    v_saldo_atual := 0;
    v_saldo_reservado := 0;
    v_existe := false;
  end if;

  if v_saldo_reservado > p_saldo_real then
    raise exception 'Saldo reservado (%) e maior que o novo saldo informado (%) - libere as reservas antes de ajustar.',
      v_saldo_reservado, p_saldo_real;
  end if;

  v_diferenca := p_saldo_real - v_saldo_atual;

  if v_diferenca <> 0 then
    insert into public.produto_movimentacoes (
      empresa_id, item_id, local_estoque, tipo_movimento,
      quantidade, observacoes, created_by
    )
    values (
      v_empresa_id, p_item_id, p_local_estoque, 'ajuste',
      abs(v_diferenca),
      format(
        'Ajuste de estoque: saldo anterior %s, novo saldo %s (%s%s). Justificativa: %s',
        v_saldo_atual, p_saldo_real,
        case when v_diferenca > 0 then '+' else '' end,
        v_diferenca,
        btrim(p_justificativa)
      ),
      auth.uid()
    );
  end if;

  if v_existe then
    update public.produto_saldos
       set saldo_disponivel = p_saldo_real
     where item_id = p_item_id
       and empresa_id = v_empresa_id
       and local_estoque = p_local_estoque;
  else
    insert into public.produto_saldos (
      empresa_id, item_id, local_estoque, saldo_disponivel, saldo_reservado
    )
    values (
      v_empresa_id, p_item_id, p_local_estoque, p_saldo_real, 0
    );
  end if;
end;
$function$;

comment on function public.ajustar_estoque_produto(uuid, numeric, text, text) is
  'Ajuste manual atomico de saldo de estoque de produto, restrito a administradores. Registra a movimentacao (tipo ajuste) e atualiza/insere o saldo. Espelha ajustar_estoque_materia_prima.';

grant execute on function public.ajustar_estoque_produto(uuid, numeric, text, text) to authenticated;

-- Reforco de seguranca desde ja (mesma correcao aplicada em
-- estoque_saldos): nenhuma function hoje escreve em produto_saldos por
-- fora de ajustar_estoque_produto (verificado: 0 functions referenciam
-- produto_saldos antes desta migration), entao restringir a policy de
-- UPDATE para admin-only e seguro, sem risco de quebrar outro fluxo.
alter policy produto_saldos_update_tenant on produto_saldos
  using (empresa_id = empresa_atual_id() and usuario_e_admin())
  with check (empresa_id = empresa_atual_id() and usuario_e_admin());
