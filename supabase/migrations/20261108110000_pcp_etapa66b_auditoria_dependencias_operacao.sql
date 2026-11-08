-- ETAPA 66B — candidata (NÃO aplicada em produção nesta etapa).
--
-- Objetivo: evoluir alterar_dependencia_operacao para exigir justificativa
-- obrigatória e gravar auditoria permanente, atômica com a escrita
-- operacional, só quando houver alteração EFETIVA (nunca em chamada
-- idempotente: criar vínculo já existente, remover vínculo inexistente).
--
-- Escritores confirmados de of_operacao_dependencias em produção (Etapa
-- 66B item 2, leitura direta do catálogo - nenhum outro encontrado):
--   1. alterar_dependencia_operacao - ação manual do PCP. Grava
--      auditoria com origem='manual'.
--   2. desdobrar_of - cópia administrativa automática das dependências
--      da OF-mãe para cada OF-filha (insert direto, nunca passa por
--      alterar_dependencia_operacao). ETAPA 66C: agora também grava
--      auditoria, com origem='desdobramento' e of_origem_desdobramento_id
--      apontando para a OF-mãe - análise de impacto apresentada no
--      relatório da Etapa 66C antes desta alteração. Nenhum lock novo
--      foi necessário (os locks de nível "of-transição"/nível 2 já
--      existentes em desdobrar_of, tomados sobre a OF-mãe antes de
--      qualquer inserção, já serializam qualquer desdobramento
--      concorrente da mesma OF-mãe - as OFs/OPs/dependências novas não
--      são visíveis a nenhuma outra sessão até o commit).
--
-- Dependências da assinatura antiga (4 parâmetros) confirmadas vazias em
-- produção antes de escrever esta migration (pg_depend e pg_shdepend,
-- Etapa 66B item 4) - só ownership (postgres) e o GRANT a service_role,
-- os dois removidos automaticamente pelo DROP abaixo. Nenhum outro
-- objeto referencia essa assinatura. DROP simples, sem CASCADE.
begin;

-- =====================================================================
-- 1/4 — tabela de auditoria dedicada, append-only, mesmo padrão de
-- of_operacao_auditoria/of_apontamentos (reaproveita a função de trigger
-- genérica já existente, nenhuma função nova).
-- =====================================================================
create table public.of_operacao_dependencia_auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  of_id uuid not null,
  op_origem_id uuid not null,
  op_dependente_id uuid not null,
  acao text not null check (acao in ('criada', 'removida')),
  -- ETAPA 66C: distingue a origem administrativa da alteração. Quando
  -- 'desdobramento', of_origem_desdobramento_id SEMPRE aponta para a
  -- OF-mãe (nunca nulo nesse caso - checagem abaixo garante o par).
  origem text not null default 'manual' check (origem in ('manual', 'desdobramento')),
  of_origem_desdobramento_id uuid,
  motivo text not null check (btrim(motivo) <> ''),
  alterado_por uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check ((origem = 'desdobramento') = (of_origem_desdobramento_id is not null)),
  foreign key (of_id, empresa_id) references public.ordens_fabricacao (id, empresa_id),
  foreign key (op_origem_id, empresa_id) references public.ordens_fabricacao_operacoes (id, empresa_id),
  foreign key (op_dependente_id, empresa_id) references public.ordens_fabricacao_operacoes (id, empresa_id),
  foreign key (of_origem_desdobramento_id, empresa_id) references public.ordens_fabricacao (id, empresa_id)
);

comment on table public.of_operacao_dependencia_auditoria is
  'ETAPA 66B/66C: histórico permanente e imutável de criação/remoção de dependências entre OPs, manual (alterar_dependencia_operacao) ou automática (desdobrar_of, origem=''desdobramento''). Só grava quando a escrita em of_operacao_dependencias afeta de fato uma linha (nunca em chamada idempotente).';

alter table public.of_operacao_dependencia_auditoria enable row level security;

create policy of_operacao_dependencia_auditoria_select_tenant
  on public.of_operacao_dependencia_auditoria for select to authenticated
  using (empresa_id = public.empresa_atual_id());

create trigger of_operacao_dependencia_auditoria_append_only
  before update or delete on public.of_operacao_dependencia_auditoria
  for each row execute function public.impedir_update_delete_historico();

revoke all on public.of_operacao_dependencia_auditoria from public, anon, authenticated;
grant select on public.of_operacao_dependencia_auditoria to authenticated;
grant select, insert on public.of_operacao_dependencia_auditoria to service_role;

-- =====================================================================
-- 2/4 — catálogo de permissões: 2 chaves novas, categoria sensível,
-- mesmo padrão da Etapa 65C (ON CONFLICT DO NOTHING - idempotente,
-- nenhum grupo/usuário alterado aqui).
-- =====================================================================
insert into public.permissoes (chave, recurso, acao, categoria, nome, descricao) values
  ('pcp.criar_dependencia_operacao', 'pcp', 'criar_dependencia_operacao', 'sensivel',
   'Criar dependência entre operações de produção',
   'Permite adicionar um pré-requisito (dependência) entre duas OPs da mesma OF.'),
  ('pcp.remover_dependencia_operacao', 'pcp', 'remover_dependencia_operacao', 'sensivel',
   'Remover dependência entre operações de produção',
   'Permite remover explicitamente um vínculo de pré-requisito entre duas OPs da mesma OF.')
on conflict (chave) do nothing;

-- =====================================================================
-- 3/4 — assinatura antiga (4 parâmetros, sem justificativa, sem
-- auditoria) é removida por completo. Sem CASCADE - a ausência de
-- dependências foi confirmada antes desta migration (item 4); se o DROP
-- falhar por dependência inesperada, a migration inteira é abortada
-- (estamos dentro de uma transação).
-- =====================================================================
drop function public.alterar_dependencia_operacao(uuid, uuid, text, uuid);

-- =====================================================================
-- 4/4 — nova assinatura (5 parâmetros, p_motivo obrigatório). Corpo
-- idêntico ao anterior (todas as proteções preservadas linha a linha:
-- locks de nível 1 e nível 3 ordenados por texto do UUID, cross-tenant,
-- mesma-OF, bloqueio por apontamento em qualquer uma das 2 OPs, checagem
-- de ciclo via existe_caminho_dependencia), com 2 adições: validação de
-- motivo não vazio (mesmo padrão de criar_op_no_y/marcar_op_nao_aplicavel
-- - checada ANTES de qualquer leitura, igual às outras 3 RPCs da
-- família) e auditoria atômica só quando a escrita afeta uma linha de
-- verdade (FOUND após INSERT...ON CONFLICT DO NOTHING; ROW_COUNT após
-- DELETE).
-- =====================================================================
create function public.alterar_dependencia_operacao(
  p_op_origem_id uuid,
  p_op_dependente_id uuid,
  p_acao text,
  p_alterado_por uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_empresa_dependente uuid;
  v_of_origem uuid;
  v_of_dependente uuid;
  v_alterado_por_empresa_id uuid;
  v_primeiro uuid;
  v_segundo uuid;
  v_linhas_afetadas int;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'alterar_dependencia_operacao: motivo e obrigatorio para toda criacao/remocao de dependencia.';
  end if;

  if p_acao not in ('criar', 'remover') then
    raise exception 'p_acao invalida: % (esperado criar ou remover).', p_acao;
  end if;

  select empresa_id, of_id into v_empresa_id, v_of_origem from public.ordens_fabricacao_operacoes where id = p_op_origem_id;
  select empresa_id, of_id into v_empresa_dependente, v_of_dependente from public.ordens_fabricacao_operacoes where id = p_op_dependente_id;

  if v_empresa_id is null or v_empresa_dependente is null then
    raise exception 'OP origem ou dependente nao encontrada.';
  end if;
  if v_empresa_id is distinct from v_empresa_dependente then
    raise exception 'OPs pertencem a empresas diferentes.';
  end if;
  if v_of_origem is distinct from v_of_dependente then
    raise exception 'Dependencia so e permitida entre OPs da MESMA OF (PCP-P6C.3 Parte 19).';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of_dependencias:' || v_of_origem::text, 0));

  if p_op_origem_id::text < p_op_dependente_id::text then
    v_primeiro := p_op_origem_id; v_segundo := p_op_dependente_id;
  else
    v_primeiro := p_op_dependente_id; v_segundo := p_op_origem_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao_operacoes:' || v_primeiro::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao_operacoes:' || v_segundo::text, 0));

  select empresa_id into v_alterado_por_empresa_id from public.usuarios where id = p_alterado_por;
  if v_alterado_por_empresa_id is null or v_alterado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'alterar_dependencia_operacao: alterado_por % nao e um usuario valido da empresa %.', p_alterado_por, v_empresa_id;
  end if;

  if exists (select 1 from public.of_apontamentos where op_id in (p_op_origem_id, p_op_dependente_id)) then
    raise exception 'alterar_dependencia_operacao: uma das OPs (% ou %) ja tem execucao registrada - dependencia nao pode mais ser alterada.', p_op_origem_id, p_op_dependente_id;
  end if;

  if p_acao = 'criar' then
    if public.existe_caminho_dependencia(p_op_dependente_id, p_op_origem_id) then
      raise exception 'Dependencia rejeitada: criaria ciclo (ja existe caminho de % para %).', p_op_dependente_id, p_op_origem_id;
    end if;

    insert into public.of_operacao_dependencias (empresa_id, op_origem_id, op_dependente_id, created_by)
    values (v_empresa_id, p_op_origem_id, p_op_dependente_id, p_alterado_por)
    on conflict (op_origem_id, op_dependente_id) do nothing;

    get diagnostics v_linhas_afetadas = row_count;
    if v_linhas_afetadas > 0 then
      insert into public.of_operacao_dependencia_auditoria
        (empresa_id, of_id, op_origem_id, op_dependente_id, acao, origem, motivo, alterado_por)
      values
        (v_empresa_id, v_of_origem, p_op_origem_id, p_op_dependente_id, 'criada', 'manual', p_motivo, p_alterado_por);
    end if;
  else
    delete from public.of_operacao_dependencias
    where op_origem_id = p_op_origem_id and op_dependente_id = p_op_dependente_id;

    get diagnostics v_linhas_afetadas = row_count;
    if v_linhas_afetadas > 0 then
      insert into public.of_operacao_dependencia_auditoria
        (empresa_id, of_id, op_origem_id, op_dependente_id, acao, origem, motivo, alterado_por)
      values
        (v_empresa_id, v_of_origem, p_op_origem_id, p_op_dependente_id, 'removida', 'manual', p_motivo, p_alterado_por);
    end if;
  end if;
end;
$function$;

comment on function public.alterar_dependencia_operacao(uuid, uuid, text, uuid, text) is
  'ETAPA 66B: motivo passa a ser obrigatorio (nao existia na assinatura anterior, removida nesta mesma migration); auditoria permanente em of_operacao_dependencia_auditoria, na MESMA transacao, e so quando a escrita afeta uma linha de verdade (GET DIAGNOSTICS apos INSERT ON CONFLICT DO NOTHING / DELETE) - chamada idempotente (criar vinculo ja existente, remover vinculo inexistente) nunca gera auditoria. Todas as protecoes da versao anterior preservadas linha a linha: locks de nivel 1 e 3, cross-tenant, mesma-OF, bloqueio por apontamento, ciclo via existe_caminho_dependencia.';

revoke all on function public.alterar_dependencia_operacao(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.alterar_dependencia_operacao(uuid, uuid, text, uuid, text) to service_role;

-- =====================================================================
-- 5/5 (ETAPA 66C) — desdobrar_of: mesma assinatura, corpo idêntico ao
-- vigente em produção EXCETO o laço de cópia de dependências, que
-- agora grava auditoria (origem='desdobramento') quando a cópia é
-- efetiva. Motivo gerado automaticamente (nunca exige input humano por
-- aresta - "não exigir justificativa manual por dependência copiada",
-- Etapa 66C item 3). Nenhum lock novo: os locks de nível
-- "of-transição"/nível 2 sobre a OF-mãe, já tomados mais acima na
-- função, já serializam qualquer desdobramento concorrente da mesma
-- OF-mãe antes de qualquer insert de dependência.
-- =====================================================================
create or replace function public.desdobrar_of(p_of_mae_id uuid, p_desdobrado_por uuid, p_filhas jsonb, p_motivo text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mae record;
  v_empresa_id uuid;
  v_desdobrado_por_empresa_id uuid;
  v_existe_apontamento boolean;
  v_filha jsonb;
  v_nova_of_id uuid;
  v_novo_numero text;
  v_resultado jsonb := '[]'::jsonb;
  v_op_mae record;
  v_nova_op_id uuid;
  v_map_ops jsonb;
  v_dep record;
  v_sub_anterior text;
  v_linhas_dependencia int;
begin
  if jsonb_typeof(p_filhas) is distinct from 'array' or jsonb_array_length(p_filhas) < 1 then
    raise exception 'desdobrar_of: p_filhas precisa ser um array JSON com pelo menos 1 elemento.';
  end if;

  select empresa_id into v_empresa_id from public.ordens_fabricacao where id = p_of_mae_id;
  if v_empresa_id is null then
    raise exception 'desdobrar_of: OF % nao encontrada.', p_of_mae_id;
  end if;

  select empresa_id into v_desdobrado_por_empresa_id from public.usuarios where id = p_desdobrado_por;
  if v_desdobrado_por_empresa_id is null or v_desdobrado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'desdobrar_of: desdobrado_por % nao e um usuario valido da empresa % da OF %.', p_desdobrado_por, v_empresa_id, p_of_mae_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_mae_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao:' || p_of_mae_id::text, 0));

  select * into v_mae from public.ordens_fabricacao where id = p_of_mae_id;

  if v_mae.estado_aprovacao is distinct from 'aprovada' then
    raise exception 'desdobrar_of: OF % precisa estar aprovada (estado_aprovacao=%).', p_of_mae_id, v_mae.estado_aprovacao;
  end if;

  if v_mae.estado_execucao not in ('planejada', 'liberada') then
    raise exception 'desdobrar_of: OF % em estado_execucao=% nao pode ser desdobrada - so planejada ou liberada, nunca em_producao.', p_of_mae_id, v_mae.estado_execucao;
  end if;

  select exists(
    select 1
    from public.of_apontamentos a
    join public.ordens_fabricacao_operacoes op on op.id = a.op_id
    where op.of_id = p_of_mae_id
  ) into v_existe_apontamento;

  if v_existe_apontamento then
    raise exception 'desdobrar_of: OF % ja possui apontamento registrado - desdobramento nao e permitido depois do primeiro apontamento.', p_of_mae_id;
  end if;

  v_sub_anterior := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', p_desdobrado_por::text, true);

  for v_filha in select * from jsonb_array_elements(p_filhas)
  loop
    if not (v_filha ? 'quantidade') or (v_filha->>'quantidade')::numeric <= 0 then
      raise exception 'desdobrar_of: cada filha precisa de quantidade > 0: %', v_filha;
    end if;

    insert into public.ordens_fabricacao (
      empresa_id, projeto_id, projeto_item_id, produto_id, bom_id,
      quantidade_planejada, unidade, created_by,
      estado_aprovacao, estado_execucao, of_pai_id
    ) values (
      v_empresa_id, v_mae.projeto_id, v_mae.projeto_item_id, v_mae.produto_id, v_mae.bom_id,
      (v_filha->>'quantidade')::numeric, v_mae.unidade, p_desdobrado_por,
      'aprovada', 'planejada', p_of_mae_id
    )
    returning id, numero_of into v_nova_of_id, v_novo_numero;

    v_map_ops := '{}'::jsonb;

    for v_op_mae in
      select * from public.ordens_fabricacao_operacoes where of_id = p_of_mae_id
    loop
      insert into public.ordens_fabricacao_operacoes (
        empresa_id, of_id, origem, bom_operacao_id,
        codigo_operacional, descricao, recurso_vigente_id, tempo_vigente_minutos,
        sequencia_vigente, nao_aplicavel, motivo_nao_aplicavel, observacao, created_by
      ) values (
        v_empresa_id, v_nova_of_id, v_op_mae.origem, v_op_mae.bom_operacao_id,
        v_op_mae.codigo_operacional, v_op_mae.descricao, v_op_mae.recurso_vigente_id, v_op_mae.tempo_vigente_minutos,
        v_op_mae.sequencia_vigente, v_op_mae.nao_aplicavel, v_op_mae.motivo_nao_aplicavel, v_op_mae.observacao, p_desdobrado_por
      )
      returning id into v_nova_op_id;

      insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
        values (v_empresa_id, v_nova_op_id, 'criacao', null, 'OP criada por desdobramento de lote (Y vigente copiado da OP ' || v_op_mae.id::text || ' da OF-mae)', p_desdobrado_por, p_motivo);

      v_map_ops := v_map_ops || jsonb_build_object(v_op_mae.id::text, v_nova_op_id::text);
    end loop;

    for v_dep in
      select d.op_origem_id, d.op_dependente_id
      from public.of_operacao_dependencias d
      join public.ordens_fabricacao_operacoes op on op.id = d.op_origem_id
      where op.of_id = p_of_mae_id
    loop
      insert into public.of_operacao_dependencias (empresa_id, op_origem_id, op_dependente_id, created_by)
      values (
        v_empresa_id,
        (v_map_ops ->> v_dep.op_origem_id::text)::uuid,
        (v_map_ops ->> v_dep.op_dependente_id::text)::uuid,
        p_desdobrado_por
      )
      on conflict (op_origem_id, op_dependente_id) do nothing;

      -- ETAPA 66C: só audita a dependência que foi REALMENTE inserida
      -- nesta iteração (GET DIAGNOSTICS reflete exatamente o INSERT
      -- imediatamente anterior, nunca o acumulado do laço).
      get diagnostics v_linhas_dependencia = row_count;
      if v_linhas_dependencia > 0 then
        insert into public.of_operacao_dependencia_auditoria
          (empresa_id, of_id, op_origem_id, op_dependente_id, acao, origem, of_origem_desdobramento_id, motivo, alterado_por)
        values (
          v_empresa_id, v_nova_of_id,
          (v_map_ops ->> v_dep.op_origem_id::text)::uuid,
          (v_map_ops ->> v_dep.op_dependente_id::text)::uuid,
          'criada', 'desdobramento', p_of_mae_id,
          'Copiada automaticamente por desdobramento da OF ' || v_mae.numero_of,
          p_desdobrado_por
        );
      end if;
    end loop;

    v_resultado := v_resultado || jsonb_build_object('of_id', v_nova_of_id, 'numero_of', v_novo_numero, 'quantidade', (v_filha->>'quantidade')::numeric);
  end loop;

  update public.ordens_fabricacao
    set estado_execucao = 'desdobrada',
        estado_execucao_observacao = p_motivo
    where id = p_of_mae_id
      and estado_execucao = v_mae.estado_execucao;

  if not found then
    raise exception 'desdobrar_of: falha ao marcar OF % como desdobrada - estado mudou durante a operacao.', p_of_mae_id;
  end if;

  perform set_config('request.jwt.claim.sub', v_sub_anterior, true);

  return jsonb_build_object('resultado', 'desdobrada', 'of_mae_id', p_of_mae_id, 'filhas', v_resultado);
end;
$function$;

comment on function public.desdobrar_of(uuid, uuid, jsonb, text) is
  'ETAPA 66C: cada dependencia efetivamente copiada para uma OF-filha agora gera auditoria em of_operacao_dependencia_auditoria (origem=desdobramento, of_origem_desdobramento_id=OF-mae, motivo automatico, alterado_por=p_desdobrado_por) - nunca em copia idempotente. Nenhuma outra linha de comportamento alterada: locks, validacoes de estado/apontamento, copia de OPs e auditoria de OP (of_operacao_auditoria) preservados identicos a producao.';

commit;
