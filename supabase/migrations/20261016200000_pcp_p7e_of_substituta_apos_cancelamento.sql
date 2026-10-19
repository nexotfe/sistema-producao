-- PCP-P7E: OF substituta apos cancelamento (INV-PCP-27).
--
-- Gap real encontrado durante a validacao funcional do P7D (Step 4):
-- o indice unico ordens_fabricacao_projeto_item_raiz_uniq (corrigido no
-- P7C) ja permite uma nova OF-raiz para um projeto_item_id cuja OF
-- anterior foi cancelada, mas nao existe nenhuma operacao funcional que
-- crie essa nova OF. criar_ofs_de_projeto_aprovado nao serve para isso -
-- ela e exclusiva do momento de aprovacao do Projeto (dispara uma unica
-- vez via trigger, e sua propria checagem de "ja existe OF para este
-- item" nao exclui cancelada, entao ela nunca tentaria recriar).
--
-- INV-PCP-27 - OF substituta apos cancelamento: uma OF substituta e uma
-- nova OF raiz criada para dar continuidade a uma necessidade cuja OF
-- anterior foi cancelada. Ela nasce planejada, usa o Roteiro Mestre
-- vigente, mantem vinculo explicito e multiempresa seguro com a OF
-- cancelada imediatamente anterior e inicia novo ciclo Y/Z. Cada OF
-- cancelada pode originar no maximo uma substituta direta. A quantidade
-- da substituta nunca deve ser inferida integralmente da OF cancelada
-- quando ja existir producao real; nesse caso, a quantidade e decisao
-- explicita autorizada.
--
-- Substituta != retrabalho (nao usa of_origem_retrabalho_id).
-- Substituta != desdobramento (nao usa of_pai_id, nao herda Y da
-- cancelada - usa o Roteiro Mestre vigente no momento da substituicao,
-- porque a condicao que levou ao cancelamento pode ter mudado).
-- criar_ofs_de_projeto_aprovado NAO e alterada por este incremento.

begin;

-- =====================================================================
-- 1. Coluna de vinculo + protecao multiempresa + cadeia linear.
-- =====================================================================
alter table public.ordens_fabricacao
  add column of_substitui_id uuid null;

comment on column public.ordens_fabricacao.of_substitui_id is
  'PCP-P7E/INV-PCP-27: aponta para a OF cancelada que esta OF substitui. So preenchida por criar_of_substituta, nunca por UPDATE posterior. Null para toda OF que nao e substituta.';

-- FK composta (of_substitui_id, empresa_id) -> (id, empresa_id): impede
-- vinculo cross-tenant mesmo que uma RPC futura ou um bug escreva essa
-- coluna por outro caminho - protecao no banco, nao so na RPC.
alter table public.ordens_fabricacao
  add constraint ordens_fabricacao_substitui_empresa_fk
  foreign key (of_substitui_id, empresa_id)
  references public.ordens_fabricacao (id, empresa_id);

-- Cada OF cancelada pode originar no maximo uma substituta direta -
-- cadeia sempre linear (A cancelada -> B substitui A -> B cancelada ->
-- C substitui B), nunca ramificada (nunca duas substitutas para a
-- mesma OF cancelada).
create unique index ordens_fabricacao_substitui_uniq
  on public.ordens_fabricacao (of_substitui_id)
  where of_substitui_id is not null;

comment on index public.ordens_fabricacao_substitui_uniq is
  'PCP-P7E/INV-PCP-27: no maximo uma substituta direta por OF cancelada - garante cadeia linear, nunca ramificada.';

-- =====================================================================
-- 2. criar_of_substituta - nova OF raiz para continuar a necessidade de
--    um projeto_item cuja OF anterior foi cancelada. service_role-only,
--    fail-closed desde o nascimento (mesma convencao de liberar_of/
--    cancelar_of/desdobrar_of: ator explicito por parametro, nao
--    auth.uid() - a autorizacao por Grupo de Acesso/Permissao fica para
--    gate futuro, mesma pendencia ja registrada no P7C).
-- =====================================================================
create or replace function public.criar_of_substituta(
  p_of_cancelada_id uuid,
  p_criado_por uuid,
  p_quantidade_planejada numeric default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_of_cancelada record;
  v_empresa_id uuid;
  v_criado_por_empresa_id uuid;
  v_tem_producao_real boolean;
  v_quantidade numeric;
  v_bom_id uuid;
  v_sub_anterior text;
  v_novo_of_id uuid;
  v_novo_numero text;
  v_bom_op record;
  v_seq smallint;
begin
  select empresa_id into v_criado_por_empresa_id from public.usuarios where id = p_criado_por;
  if v_criado_por_empresa_id is null then
    raise exception 'criar_of_substituta: criado_por % nao e um usuario valido.', p_criado_por;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_cancelada_id::text, 0));

  select * into v_of_cancelada from public.ordens_fabricacao where id = p_of_cancelada_id;
  if not found then
    raise exception 'criar_of_substituta: OF % nao encontrada.', p_of_cancelada_id;
  end if;

  v_empresa_id := v_of_cancelada.empresa_id;
  if v_criado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'criar_of_substituta: criado_por % nao pertence a empresa % da OF cancelada.', p_criado_por, v_empresa_id;
  end if;

  if v_of_cancelada.of_pai_id is not null or v_of_cancelada.of_origem_retrabalho_id is not null then
    raise exception 'criar_of_substituta: OF % nao e uma OF-raiz genuina (e filha de desdobramento ou de retrabalho) - substituicao se aplica so a OF-raiz.', v_of_cancelada.numero_of;
  end if;

  if v_of_cancelada.estado_execucao is distinct from 'cancelada' then
    raise exception 'criar_of_substituta: OF % em estado_execucao=% - so uma OF cancelada pode receber substituta.', v_of_cancelada.numero_of, v_of_cancelada.estado_execucao;
  end if;

  if v_of_cancelada.projeto_item_id is not null and exists (
    select 1 from public.ordens_fabricacao
    where projeto_item_id = v_of_cancelada.projeto_item_id
      and of_pai_id is null
      and estado_execucao is distinct from 'cancelada'
  ) then
    raise exception 'criar_of_substituta: ja existe uma OF-raiz ativa (nao cancelada) para o item % - nao e possivel substituir.', v_of_cancelada.projeto_item_id;
  end if;

  if exists (select 1 from public.ordens_fabricacao where of_substitui_id = p_of_cancelada_id) then
    raise exception 'criar_of_substituta: OF % ja possui uma substituta - cada OF cancelada origina no maximo uma substituta direta.', v_of_cancelada.numero_of;
  end if;

  -- Quantidade (INV-PCP-27): se houve qualquer apontamento real contra
  -- esta OF, a quantidade da substituta nunca e inferida automaticamente
  -- - precisa ser decisao explicita do PCP. Sem producao real, o default
  -- (quantidade da cancelada) e seguro, mas pode ser sobrescrito.
  select exists(
    select 1
    from public.of_apontamentos a
    join public.ordens_fabricacao_operacoes op on op.id = a.op_id
    where op.of_id = p_of_cancelada_id
  ) into v_tem_producao_real;

  if v_tem_producao_real then
    if p_quantidade_planejada is null then
      raise exception 'criar_of_substituta: OF % teve producao real (apontamentos existentes) - a quantidade da substituta precisa ser informada explicitamente, nunca inferida da OF cancelada.', v_of_cancelada.numero_of;
    end if;
    v_quantidade := p_quantidade_planejada;
  else
    v_quantidade := coalesce(p_quantidade_planejada, v_of_cancelada.quantidade_planejada);
  end if;

  if v_quantidade is null or not (v_quantidade > 0) or v_quantidade = 'infinity'::numeric or v_quantidade = '-infinity'::numeric or v_quantidade = 'NaN'::numeric then
    raise exception 'criar_of_substituta: quantidade da substituta invalida (%) - precisa ser finita e maior que zero.', v_quantidade;
  end if;

  -- Y novo: Roteiro Mestre vigente no momento da substituicao, nunca o
  -- da OF cancelada - a necessidade pode existir justamente porque a
  -- condicao mudou (diferente de desdobramento, que herda o Y vigente
  -- da mae porque e continuidade da MESMA OF).
  v_bom_id := public.resolver_bom_ativo_produto(v_empresa_id, v_of_cancelada.produto_id);
  if v_bom_id is null then
    raise exception 'criar_of_substituta: produto % nao possui Roteiro Mestre vigente - OF substituta nao pode nascer sem Roteiro.', v_of_cancelada.produto_id;
  end if;

  -- aprovar_projeto_com_simulacao_v5/criar_ofs_de_projeto_aprovado ja
  -- usam a mesma correcao: esta RPC e service_role-only, auth.uid() e
  -- NULL nesse contexto, e gerar_numero_of (via set_ordem_fabricacao_numero)
  -- depende de empresa_atual_id() -> precisa de request.jwt.claim.sub.
  v_sub_anterior := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', p_criado_por::text, true);

  -- Daqui em diante, qualquer excecao (inclusive a de "nenhuma OP
  -- valida" abaixo) desfaz TUDO nesta chamada - OF + OPs sao uma unica
  -- transacao implicita desta RPC, sem savepoint intermediario (ao
  -- contrario de criar_ofs_de_projeto_aprovado, que tem savepoint por
  -- item porque itera varios itens independentes; aqui ha uma OF so,
  -- entao tudo-ou-nada e o comportamento natural do bloco).
  insert into public.ordens_fabricacao (
    empresa_id, projeto_id, projeto_item_id, produto_id, bom_id,
    quantidade_planejada, unidade, created_by,
    estado_aprovacao, estado_execucao, of_substitui_id
  ) values (
    v_empresa_id, v_of_cancelada.projeto_id, v_of_cancelada.projeto_item_id, v_of_cancelada.produto_id, v_bom_id,
    v_quantidade, v_of_cancelada.unidade, p_criado_por,
    'aguardando_auditoria', 'planejada', p_of_cancelada_id
  )
  returning id, numero_of into v_novo_of_id, v_novo_numero;

  v_seq := 0;
  for v_bom_op in
    select id, ordem, descricao, tempo_estimado_minutos, recurso_produtivo_id
    from public.bom_operacoes
    where bom_id = v_bom_id and empresa_id = v_empresa_id
      and ativo = true and deleted_at is null
    order by ordem
  loop
    v_seq := v_seq + 1;
    insert into public.ordens_fabricacao_operacoes (
      empresa_id, of_id, origem, bom_operacao_id,
      codigo_operacional, descricao, recurso_vigente_id, tempo_vigente_minutos,
      sequencia_vigente, created_by
    ) values (
      v_empresa_id, v_novo_of_id, 'roteiro', v_bom_op.id,
      'OP' || v_bom_op.ordem::text, v_bom_op.descricao, v_bom_op.recurso_produtivo_id, v_bom_op.tempo_estimado_minutos,
      v_seq, p_criado_por
    );
  end loop;

  if v_seq = 0 then
    raise exception 'criar_of_substituta: Roteiro % nao possui nenhuma operacao ativa - OF nao pode nascer sem OP.', v_bom_id;
  end if;

  perform set_config('request.jwt.claim.sub', v_sub_anterior, true);

  return jsonb_build_object(
    'resultado', 'criada',
    'of_id', v_novo_of_id,
    'numero_of', v_novo_numero,
    'of_substitui_id', p_of_cancelada_id,
    'quantidade_planejada', v_quantidade,
    'bom_id', v_bom_id,
    'ops_criadas', v_seq
  );
end;
$function$;

comment on function public.criar_of_substituta(uuid, uuid, numeric, text) is
  'PCP-P7E/INV-PCP-27: cria uma nova OF-raiz para continuar a necessidade de um projeto_item cuja OF anterior foi cancelada. Nasce aguardando_auditoria+planejada, Y do Roteiro Mestre vigente (nunca da cancelada), vinculo explicito via of_substitui_id. Nao e retrabalho, nao e desdobramento, nao altera criar_ofs_de_projeto_aprovado. Quantidade: default = quantidade da cancelada SE nao houve producao real (nenhum of_apontamentos contra ela); COM producao real, quantidade precisa ser informada explicitamente (nunca inferida). Idempotencia: rejeita se ja existe OF-raiz ativa para o item, ou se a OF cancelada ja tem substituta. ACL tecnica: service_role-only (mesma pendencia de Grupo de Acesso/Permissao do P7C).';

revoke all on function public.criar_of_substituta(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.criar_of_substituta(uuid, uuid, numeric, text) to service_role;

commit;
