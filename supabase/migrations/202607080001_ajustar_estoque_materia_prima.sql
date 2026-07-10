-- Ajuste manual de estoque de materia-prima, restrito a administradores
-- (mesmo padrao de usuario_e_admin() ja usado em
-- Colaboradores/Recursos/Grupos de Recursos). SECURITY DEFINER porque a
-- policy de UPDATE de estoque_saldos hoje permite qualquer usuario da
-- mesma empresa (nao so admin) - o gate de admin e feito aqui dentro,
-- explicitamente, antes de qualquer escrita.
--
-- Nota sobre a assinatura: o parametro com default (p_local_estoque)
-- precisa ficar por ultimo - Postgres exige que parametros com default
-- fiquem no final da lista. Isso nao muda nada para quem chama via
-- supabase.rpc(), que sempre passa argumentos nomeados.
--
-- Nota sobre quantidade da movimentacao: estoque_movimentacoes tem
-- CHECK (quantidade > 0) - nao aceita zero nem negativo. Por isso a
-- movimentacao grava sempre o valor ABSOLUTO da diferenca, e o sinal
-- (ajuste para cima ou para baixo) fica registrado em texto em
-- observacoes junto com o saldo anterior/novo, preservando a
-- rastreabilidade completa sem violar a constraint. Quando a diferenca e
-- exatamente zero, nenhuma movimentacao e criada (nao houve ajuste real).
create or replace function public.ajustar_estoque_materia_prima(
  p_materia_prima_id uuid,
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
    select 1 from public.materias_primas
     where id = p_materia_prima_id
       and empresa_id = v_empresa_id
       and ativo = true
       and deleted_at is null
  ) then
    raise exception 'Materia-prima nao encontrada para a empresa atual.';
  end if;

  select saldo_disponivel, saldo_reservado, true
    into v_saldo_atual, v_saldo_reservado, v_existe
  from public.estoque_saldos
  where materia_prima_id = p_materia_prima_id
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
    insert into public.estoque_movimentacoes (
      empresa_id, materia_prima_id, local_estoque, tipo_movimento,
      quantidade, observacoes, created_by
    )
    values (
      v_empresa_id, p_materia_prima_id, p_local_estoque, 'ajuste',
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
    update public.estoque_saldos
       set saldo_disponivel = p_saldo_real
     where materia_prima_id = p_materia_prima_id
       and empresa_id = v_empresa_id
       and local_estoque = p_local_estoque;
  else
    insert into public.estoque_saldos (
      empresa_id, materia_prima_id, local_estoque, saldo_disponivel, saldo_reservado
    )
    values (
      v_empresa_id, p_materia_prima_id, p_local_estoque, p_saldo_real, 0
    );
  end if;
end;
$function$;

comment on function public.ajustar_estoque_materia_prima(uuid, numeric, text, text) is
  'Ajuste manual atomico de saldo de estoque de materia-prima, restrito a administradores. Registra a movimentacao (tipo ajuste) e atualiza/insere o saldo.';

grant execute on function public.ajustar_estoque_materia_prima(uuid, numeric, text, text) to authenticated;
