-- Incremento 4D0, segunda fatia — Incremento 6/9: decisão automática e
-- atômica de Consumo Interno (CI) / Compra Externa (CE) para as
-- necessidades de matéria-prima de uma OF, disparada dentro de
-- aprovar_of, na mesma transação, logo após gerar_necessidades_de_of.
--
-- Decisões desta migration (usuário, não inferidas — consolidadas ao longo
-- de 3 revisões de investigação, todas sem escrita, antes desta migration):
--
--   1. necessidades_of_material é a única fonte de demanda para este
--      fluxo. As views legadas que recalculavam o BOM em 1 nível
--      (vw_demanda_bom_of, vw_of_consumo_detalhado) são reescritas para
--      ler de necessidades_of_material (já expandida recursivamente pelo
--      Incremento 5) — nunca mais recalculam bom_itens diretamente.
--   2. A decisão CI/CE roda automaticamente dentro de aprovar_of, mesma
--      transação, depois de gerar_necessidades_de_of.
--   3. Uma única função interna nova (decidir_ci_ce_de_of) processa TODAS
--      as necessidades da OF — sem RPC pública por necessidade nesta
--      etapa.
--   4. registrar_consumo_interno e registrar_requisicao_compra_material
--      ficam com EXECUTE fechado para PUBLIC/anon/authenticated/
--      service_role — corpo preservado (podem servir de referência /
--      uso administrativo futuro via service_role explícito, se um dia
--      necessário), mas deixam de ser ponto de entrada. A função nova NÃO
--      as chama (nenhuma das duas aceita necessidade_id na assinatura, e
--      a assinatura delas foi deliberadamente preservada intacta) — ela
--      implementa a escrita diretamente, já orientada por necessidade_id.
--   5. processar_necessidade_material permanece descontinuada (EXECUTE já
--      fechado desde 20260830134415) — não volta a ser ponto de entrada.
--   6. Saldo parcial: CI = LEAST(saldo_livre, quantidade_necessaria); CE =
--      restante. Nunca desperdiça saldo disponível, nunca força um único
--      caminho. Ausência de linha em estoque_saldos == saldo_livre 0 ==
--      CE 100% (a função nova nunca levanta exceção por saldo ausente,
--      diferente de registrar_consumo_interno — que segue exigindo saldo
--      cadastrado quando chamada diretamente, corpo preservado).
--   7. Fixtures sintéticas de estoque nos testes (preflight) — saldo real
--      é só baseline, nunca consumido.
--   8. numeracao_configuracoes.entidade='of' permanece fora de escopo,
--      registrado como legado aparentemente inativo (achado da
--      investigação: sequencia_atual=0, nenhuma função viva o usa para
--      numerar OF hoje — só gerar_numero_of/numeracao_of_projoto fazem
--      isso).
--
-- ACHADO REAL GRAVE desta investigação, corrigido por esta migration:
-- as 7 views deste domínio (vw_demanda_bom_of, vw_demanda_estoque,
-- vw_demanda_consumo_compra, vw_of_consumo_detalhado,
-- vw_of_fluxo_operacional, vw_decisao_material_of, vw_of_fluxo_industrial)
-- são todas de propriedade de "postgres", que tem rolbypassrls=true
-- (confirmado por introspecção direta) — sem security_invoker=true
-- (default histórico do Postgres para views), toda consulta a qualquer
-- uma delas roda com as permissões do DONO da view, NÃO do usuário que
-- consulta, ignorando RLS das tabelas de origem inteiramente. Ou seja,
-- HOJE, qualquer authenticated com GRANT SELECT numa dessas views
-- enxerga dados de TODAS as empresas através dela, não só da própria —
-- vazamento cross-tenant real e ativo (vw_of_consumo_detalhado tem
-- consumidor real de produção: src/app/ordens/[id]/page.tsx). Esta
-- migration fecha isso em TODAS as 7 views (security_invoker=true), não
-- só nas 2 reescritas.
--
-- ACHADO REAL adicional: consumos_internos_unidade_chk e
-- requisicao_compra_itens_unidade_chk só permitem
-- ('kg','metro','barra','chapa','peca') — não incluem 'litro', que é
-- unidade real de matérias-primas reais da ENIFER (ex.: ZARCÃO,
-- TINTA-A-601GL, TINNER-L, confirmadas na árvore real de P-6158 usada no
-- Incremento 5). Sem corrigir, a função nova falharia com exceção real
-- para qualquer necessidade dessas matérias-primas. Ampliados para o
-- mesmo domínio de 9 valores já usado em ordens_fabricacao_unidade_chk.
--
-- estoque_movimentacoes não tem coluna "unidade" (confirmado por
-- introspecção) — nada a ampliar lá.
--
-- Investigação por leitura (3 rodadas, sem escrita) confirmou: zero
-- linhas hoje em consumos_internos/requisicao_compra_itens em todo o
-- banco (todas as empresas) — as novas unicidades parciais não têm
-- nenhuma duplicidade pré-existente para resolver. local_estoque='principal'
-- é o único valor em uso em todo o banco e já é hardcoded no frontend
-- (useMateriaPrimaForm.ts) — sem ambiguidade de local a resolver nesta
-- fatia. Nenhuma função SQL consulta as 7 views. Único consumidor real de
-- qualquer uma delas é a página de detalhe de OF (2 views:
-- vw_of_consumo_detalhado e vw_of_fluxo_operacional).
--
-- Fora de escopo, confirmado por leitura: numeração (numeracao_configuracoes),
-- planejamentos_compra/pedidos_compra (pipeline já existente do
-- Incremento 4A-4C, não tocado), qualquer tela nova.
--
-- Arquivo inteiro é uma transação.

begin;

-- =============================================================================
-- 1. Schema: necessidade_id (nullable, FK composta) em consumos_internos e
--    estoque_movimentacoes — ponte para necessidades_of_material.
--    requisicao_compra_itens já tinha essa ponte (migration anterior).
-- =============================================================================

alter table public.consumos_internos
  add column necessidade_id uuid null;

alter table public.consumos_internos
  add constraint consumos_internos_necessidade_fkey
  foreign key (necessidade_id, empresa_id)
  references public.necessidades_of_material (id, empresa_id);

alter table public.estoque_movimentacoes
  add column necessidade_id uuid null;

alter table public.estoque_movimentacoes
  add constraint estoque_movimentacoes_necessidade_fkey
  foreign key (necessidade_id, empresa_id)
  references public.necessidades_of_material (id, empresa_id);

comment on column public.consumos_internos.necessidade_id is
  '4D0, Incremento 6: ponte para necessidades_of_material (Incremento 5). Nullable por compatibilidade histórica (linhas legadas, se existirem no futuro, nunca tiveram necessidade formal) — nunca populada por escrita legada (registrar_consumo_interno preserva assinatura, não recebe este parâmetro); só decidir_ci_ce_de_of grava.';
comment on column public.estoque_movimentacoes.necessidade_id is
  '4D0, Incremento 6: ponte para necessidades_of_material, para rastreabilidade granular da reserva (além de of_id, já existente). Nullable, sem unicidade — uma necessidade pode gerar mais de uma movimentação ao longo do tempo (ex.: liberação futura de reserva, fora de escopo desta fatia).';

-- =============================================================================
-- 2. Unicidade parcial por necessidade — só quando necessidade_id IS NOT
--    NULL (nunca aplica à escrita legada, que não preenche a coluna).
--    Não criada em estoque_movimentacoes (decisão explícita — pode haver
--    mais de uma movimentação por necessidade ao longo do tempo).
-- =============================================================================

create unique index consumos_internos_necessidade_uniq
  on public.consumos_internos (necessidade_id)
  where necessidade_id is not null;

create unique index requisicao_compra_itens_necessidade_uniq
  on public.requisicao_compra_itens (necessidade_id)
  where necessidade_id is not null;

comment on index public.consumos_internos_necessidade_uniq is
  '4D0, Incremento 6: no máximo 1 linha de consumo interno por necessidade — garantia estrutural contra reprocessamento duplicado, além da checagem de invariante em decidir_ci_ce_de_of.';
comment on index public.requisicao_compra_itens_necessidade_uniq is
  '4D0, Incremento 6: no máximo 1 item de requisição de compra por necessidade — mesma garantia estrutural do lado CE.';

-- =============================================================================
-- 3. Amplia os CHECKs de unidade que não incluíam 'litro' (achado real,
--    ver cabeçalho) — mesmo domínio de 9 valores de
--    ordens_fabricacao_unidade_chk.
-- =============================================================================

alter table public.consumos_internos
  drop constraint consumos_internos_unidade_chk;
alter table public.consumos_internos
  add constraint consumos_internos_unidade_chk
  check (unidade = any (array['kg','metro','barra','chapa','peca','conjunto','unidade','litro','pacote']));

alter table public.requisicao_compra_itens
  drop constraint requisicao_compra_itens_unidade_chk;
alter table public.requisicao_compra_itens
  add constraint requisicao_compra_itens_unidade_chk
  check (unidade = any (array['kg','metro','barra','chapa','peca','conjunto','unidade','litro','pacote']));

-- =============================================================================
-- 4. decidir_ci_ce_de_of — função interna nova. Processa TODAS as
--    necessidades ativas de uma OF, em ordem determinística
--    (materia_prima_id, id) para reduzir risco de deadlock entre OFs
--    concorrentes disputando o mesmo saldo. INTERNA: sem EXECUTE para
--    nenhum papel de cliente — chamada só por aprovar_of.
-- =============================================================================

create or replace function public.decidir_ci_ce_de_of(p_of_id uuid, p_empresa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid uuid;
  v_of_projeto_id uuid;
  v_of_numero text;
  v_necessidade record;
  v_saldo_livre numeric;
  v_qtd_ci numeric;
  v_qtd_ce numeric;
  v_movimentacao_id uuid;
  v_requisicao_id uuid;
  v_total_necessidades integer := 0;
  v_total_ci integer := 0;
  v_total_ce integer := 0;
begin
  -- auth.uid() não atravessa fronteira de chamada entre funções PL/pgSQL —
  -- precisa ser lido de novo aqui, mesmo padrão de gerar_necessidades_de_of.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'decidir_ci_ce_de_of: sessao invalida (auth.uid() nulo).';
  end if;

  select projeto_id, numero_of into v_of_projeto_id, v_of_numero
  from public.ordens_fabricacao
  where id = p_of_id and empresa_id = p_empresa_id;

  if not found then
    raise exception 'decidir_ci_ce_de_of: OF % nao encontrada na empresa %.', p_of_id, p_empresa_id;
  end if;

  for v_necessidade in
    select n.id, n.materia_prima_id, n.quantidade_necessaria, mp.unidade as mp_unidade
    from public.necessidades_of_material n
    join public.materias_primas mp on mp.id = n.materia_prima_id and mp.empresa_id = n.empresa_id
    where n.of_id = p_of_id and n.empresa_id = p_empresa_id and n.ativo = true
    order by n.materia_prima_id, n.id
  loop
    v_total_necessidades := v_total_necessidades + 1;

    -- Invariante: nenhum CI ou CE pode preexistir para esta necessidade —
    -- decidir_ci_ce_de_of nunca reprocessa, nunca cria uma segunda versão.
    if exists (
      select 1 from public.consumos_internos
      where necessidade_id = v_necessidade.id and ativo = true
    ) or exists (
      select 1 from public.requisicao_compra_itens
      where necessidade_id = v_necessidade.id and ativo = true
    ) then
      raise exception 'decidir_ci_ce_de_of: invariante violada - ja existe CI ou CE para a necessidade %.', v_necessidade.id;
    end if;

    -- Trava a linha de saldo (se existir) — mesma disciplina das funções
    -- legadas. Ausência de linha (v_saldo_livre fica NULL) é tratada como
    -- saldo 0 (decisão 6), nunca levanta exceção aqui.
    select saldo_livre into v_saldo_livre
    from public.estoque_saldos
    where empresa_id = p_empresa_id
      and materia_prima_id = v_necessidade.materia_prima_id
      and local_estoque = 'principal'
    for update;

    v_saldo_livre := coalesce(v_saldo_livre, 0);
    v_qtd_ci := least(v_saldo_livre, v_necessidade.quantidade_necessaria);
    v_qtd_ce := v_necessidade.quantidade_necessaria - v_qtd_ci;

    if v_qtd_ci > 0 then
      update public.estoque_saldos
        set saldo_reservado = saldo_reservado + v_qtd_ci
        where empresa_id = p_empresa_id
          and materia_prima_id = v_necessidade.materia_prima_id
          and local_estoque = 'principal';

      insert into public.estoque_movimentacoes (
        empresa_id, materia_prima_id, local_estoque, tipo_movimento, quantidade,
        projeto_id, of_numero, of_id, necessidade_id, observacoes, created_by
      ) values (
        p_empresa_id, v_necessidade.materia_prima_id, 'principal', 'reserva', v_qtd_ci,
        v_of_projeto_id, v_of_numero, p_of_id, v_necessidade.id,
        'Reserva gerada por decisao CI/CE automatica na aprovacao da OF (Incremento 6).', v_uid
      ) returning id into v_movimentacao_id;

      insert into public.consumos_internos (
        empresa_id, projeto_id, of_numero, of_id, necessidade_id, materia_prima_id,
        estoque_movimentacao_id, local_estoque, quantidade, unidade,
        saldo_consumido, custo_unitario_material, data_movimentacao, observacoes, created_by
      ) values (
        p_empresa_id, v_of_projeto_id, v_of_numero, p_of_id, v_necessidade.id, v_necessidade.materia_prima_id,
        v_movimentacao_id, 'principal', v_qtd_ci, v_necessidade.mp_unidade,
        v_qtd_ci, 0, current_date,
        'Consumo interno gerado por decisao CI/CE automatica na aprovacao da OF (Incremento 6).', v_uid
      );

      v_total_ci := v_total_ci + 1;
    end if;

    if v_qtd_ce > 0 then
      -- Cabeçalho de requisição de compra criado uma única vez por OF
      -- (preguiçoso — só na primeira necessidade que realmente precisa de
      -- CE), reaproveitado para todas as necessidades seguintes desta
      -- mesma chamada. Decisão de desenho explícita: evita N cabeçalhos
      -- para N necessidades da mesma OF.
      if v_requisicao_id is null then
        insert into public.requisicoes_compra (
          empresa_id, projeto_id, of_numero, of_id, data_necessidade_material, status, observacoes, created_by
        ) values (
          p_empresa_id, v_of_projeto_id, v_of_numero, p_of_id, current_date, 'aberta',
          'Requisicao gerada por decisao CI/CE automatica na aprovacao da OF (Incremento 6).', v_uid
        ) returning id into v_requisicao_id;
      end if;

      insert into public.requisicao_compra_itens (
        empresa_id, requisicao_compra_id, necessidade_id, materia_prima_id,
        quantidade_necessaria, unidade, observacoes, created_by
      ) values (
        p_empresa_id, v_requisicao_id, v_necessidade.id, v_necessidade.materia_prima_id,
        v_qtd_ce, v_necessidade.mp_unidade,
        'Compra externa gerada por decisao CI/CE automatica na aprovacao da OF (Incremento 6).', v_uid
      );

      v_total_ce := v_total_ce + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'total_necessidades', v_total_necessidades,
    'necessidades_com_ci', v_total_ci,
    'necessidades_com_ce', v_total_ce,
    'requisicao_compra_id', v_requisicao_id
  );
end;
$$;

comment on function public.decidir_ci_ce_de_of(uuid, uuid) is
  '4D0, Incremento 6: decide Consumo Interno vs Compra Externa para TODAS as necessidades ativas de uma OF, em ordem deterministica (materia_prima_id, id). CI = LEAST(saldo_livre, necessidade); CE = restante — nunca desperdica saldo, nunca forca um unico caminho. Ausencia de linha em estoque_saldos = saldo 0 = CE total (nunca levanta excecao por saldo ausente). Invariante: qualquer CI/CE pre-existente para a necessidade aborta a funcao inteira (sem reprocessamento). local_estoque fixo em "principal" (unico valor em uso real, achado da investigacao). INTERNA: sem EXECUTE para nenhum papel de cliente, chamada so por aprovar_of. Nao decide sobre planejamento nem pedido de compra (fora de escopo).';

revoke all on function public.decidir_ci_ce_de_of(uuid, uuid)
  from public, anon, authenticated, service_role;

-- =============================================================================
-- 5. aprovar_of — chama decidir_ci_ce_de_of logo apos gerar_necessidades_de_of,
--    mesma transacao. Corpo integralmente reproduzido a partir da definicao
--    real vigente (Incremento 5) — unica mudanca e a linha nova.
-- =============================================================================

create or replace function public.aprovar_of(p_of_id uuid, p_observacao text default null)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid uuid;
  v_empresa_id uuid;
  v_of record;
  v_rows integer;
  v_necessidades jsonb;
  v_ci_ce jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'aprovar_of: sessao invalida.';
  end if;

  v_empresa_id := public.empresa_atual_id();
  if v_empresa_id is null then
    raise exception 'aprovar_of: empresa atual nao encontrada.';
  end if;

  if not (coalesce(public.usuario_e_admin(), false) or coalesce(public.usuario_tem_papel_funcional('pcp'), false)) then
    raise exception 'aprovar_of: usuario sem permissao para aprovar OF.';
  end if;

  -- Busca filtrada por id+empresa_id, SEM lock ainda — nunca associa o
  -- advisory lock a um of_id antes de confirmar que ele pertence a este
  -- tenant (evita vazamento temporal pelo lock, que e global ao banco).
  perform 1 from public.ordens_fabricacao where id = p_of_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'aprovar_of: OF nao encontrada.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));

  -- Rele a OF sob o lock — a decisao de transicao usa SEMPRE esta
  -- segunda leitura, nunca a primeira.
  select * into v_of from public.ordens_fabricacao where id = p_of_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'aprovar_of: OF nao encontrada.';
  end if;

  if v_of.estado_aprovacao is not distinct from 'aprovada'
     and v_of.estado_execucao is not distinct from 'planejada' then
    return jsonb_build_object('resultado', 'ja_aprovada', 'of_id', v_of.id, 'numero_of', v_of.numero_of);
  end if;

  if v_of.estado_aprovacao is distinct from 'aguardando_auditoria'
     or v_of.estado_execucao is distinct from 'planejada' then
    raise exception 'aprovar_of: transicao invalida - OF % em %/%.', v_of.numero_of, v_of.estado_aprovacao, v_of.estado_execucao;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('subconjunto-grafo:' || v_empresa_id::text, 0));

  update public.ordens_fabricacao
    set estado_aprovacao = 'aprovada',
        estado_execucao = 'planejada',
        estado_aprovacao_em = now(),
        estado_aprovacao_por = v_uid,
        estado_aprovacao_observacao = p_observacao
    where id = p_of_id
      and empresa_id = v_empresa_id
      and estado_aprovacao = 'aguardando_auditoria'
      and estado_execucao = 'planejada';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'aprovar_of: falha ao aprovar OF % - estado mudou durante a operacao.', p_of_id;
  end if;

  v_necessidades := public.gerar_necessidades_de_of(p_of_id, v_empresa_id);

  -- NOVO (Incremento 6): decisao automatica CI/CE, mesma transacao, sem
  -- handler — falha aqui desfaz TUDO (aprovacao + necessidades geradas),
  -- mesma propagacao natural ja usada entre aprovar_of/gerar_necessidades_de_of.
  v_ci_ce := public.decidir_ci_ce_de_of(p_of_id, v_empresa_id);

  return jsonb_build_object(
    'resultado', 'aprovada', 'of_id', p_of_id, 'numero_of', v_of.numero_of,
    'necessidades', v_necessidades,
    'decisao_ci_ce', v_ci_ce
  );
end;
$$;

comment on function public.aprovar_of(uuid, text) is
  '4D0, Incremento 5+6: aprova uma OF em aguardando_auditoria+planejada (gate PCP/admin), gera necessidades de materia-prima E decide CI/CE automaticamente, atomicamente (gerar_necessidades_de_of + decidir_ci_ce_de_of, mesma transacao, sem handler). Idempotente SOMENTE para aprovada+planejada (retorna ja_aprovada, sem efeito colateral). Qualquer outro estado e erro de transicao. Comparacoes de estado null-safe (IS DISTINCT FROM). Advisory lock of-transicao:<id> compartilhado com reprovar_of/resubmeter_of_para_auditoria; lock subconjunto-grafo:<empresa> antes do UPDATE. UPDATE inclui o estado esperado no WHERE e valida ROW_COUNT=1.';

-- ACL de aprovar_of nao muda (ja e authenticated-only desde o Incremento 5) —
-- reafirmada aqui so por clareza, sem efeito pratico (idempotente).
revoke all on function public.aprovar_of(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.aprovar_of(uuid, text) to authenticated;

-- =============================================================================
-- 6. Fecha EXECUTE das 2 funcoes legadas de registro (decisao 4) — corpo
--    preservado integralmente, nunca redefinido nesta migration.
-- =============================================================================

revoke all on function public.registrar_consumo_interno(uuid, text, uuid, numeric, text, numeric, text, date, text, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.registrar_requisicao_compra_material(uuid, text, uuid, numeric, text, date, text, uuid)
  from public, anon, authenticated, service_role;

-- processar_necessidade_material ja estava fechada desde 20260830134415 —
-- reconfirmada aqui, sem efeito pratico (idempotente).
revoke all on function public.processar_necessidade_material(uuid, text, uuid, numeric, text, numeric, text, date, text)
  from public, anon, authenticated, service_role;

-- =============================================================================
-- 7. Reescreve vw_demanda_bom_of e vw_of_consumo_detalhado para ler de
--    necessidades_of_material (ja recursiva, Incremento 5) — nunca mais
--    recalculam bom_itens em 1 nivel so. Contratos de coluna (nome, ordem,
--    tipo) preservados integralmente — colunas que so faziam sentido no
--    modelo antigo (identidade de uma linha de bom_itens especifica, ou
--    do componente quando era subconjunto) ficam NULL, documentado abaixo.
--    Decisao 8 (Revisao 3): antes da aprovacao, necessidades_of_material
--    nao tem linha para a OF - a view naturalmente nao retorna nenhuma
--    linha de demanda para ela (INNER JOIN, nao mais LEFT JOIN no BOM cru).
--    security_invoker=true (achado real do cabecalho desta migration).
-- =============================================================================

create or replace view public.vw_demanda_bom_of
with (security_invoker = true) as
select
  n.empresa_id,
  n.of_id,
  ofx.numero_of,
  ofx.projeto_id,
  ofx.projeto_item_id,
  ofx.produto_id,
  ip.pn as produto_pn,
  ip.descricao as produto_descricao,
  ofx.bom_id,
  b.versao as bom_versao,
  b.descricao as bom_descricao,
  null::uuid as bom_item_id,
  'materia_prima'::text as componente_tipo,
  n.materia_prima_id,
  mp.codigo as materia_codigo,
  mp.descricao as materia_descricao,
  null::uuid as componente_produto_id,
  null::text as componente_pn,
  null::text as componente_descricao,
  null::numeric as bom_quantidade,
  ofx.quantidade_planejada,
  ofx.unidade as of_unidade,
  mp.unidade as componente_unidade,
  n.quantidade_necessaria as quantidade_demanda,
  'materia_prima'::text as demanda_tipo
from public.necessidades_of_material n
join public.ordens_fabricacao ofx on ofx.id = n.of_id and ofx.empresa_id = n.empresa_id
left join public.itens_industriais ip on ip.id = ofx.produto_id
left join public.boms b on b.id = ofx.bom_id
join public.materias_primas mp on mp.id = n.materia_prima_id and mp.empresa_id = n.empresa_id
where n.ativo = true and n.origem_logica = 'bom_expansao' and ofx.ativo = true;

comment on view public.vw_demanda_bom_of is
  '4D0, Incremento 6: reescrita para ler de necessidades_of_material (ja expandida recursivamente pelo Incremento 5), nunca mais recalcula bom_itens em 1 nivel so (achado real corrigido: a versao anterior subcontava subconjuntos, nunca descia ao BOM do componente). Contrato de colunas preservado; bom_item_id/componente_produto_id/componente_pn/componente_descricao/bom_quantidade ficam sempre NULL (nao ha mais uma linha de bom_itens singular equivalente apos a agregacao) — componente_tipo/demanda_tipo ficam sempre "materia_prima" (necessidades_of_material so representa folha ja expandida). Antes da aprovacao da OF, nenhuma linha existe para ela (INNER JOIN em necessidades_of_material). security_invoker=true (achado real: sem isso, a view roda com bypass de RLS do dono, vazando dados entre empresas).';

create or replace view public.vw_of_consumo_detalhado
with (security_invoker = true) as
select
  n.empresa_id,
  n.of_id,
  ofx.numero_of,
  ofx.projeto_id,
  ofx.produto_id,
  ip.pn as produto_pn,
  ip.descricao as produto_descricao,
  ofx.bom_id,
  b.versao as bom_versao,
  null::uuid as bom_item_id,
  'materia_prima'::text as componente_tipo,
  n.materia_prima_id,
  mp.codigo as materia_codigo,
  mp.descricao as materia_descricao,
  null::uuid as componente_produto_id,
  null::text as componente_pn,
  null::text as componente_descricao,
  null::numeric as bom_quantidade,
  mp.unidade as bom_unidade,
  ofx.quantidade_planejada,
  ofx.unidade as of_unidade,
  n.quantidade_necessaria as quantidade_demanda,
  coalesce(es.saldo_livre, 0) as estoque_saldo_livre,
  coalesce(ci.quantidade, 0) as quantidade_consumo_interno,
  coalesce(rci.quantidade_necessaria, 0) as quantidade_compra_externa,
  greatest(n.quantidade_necessaria - coalesce(es.saldo_livre, 0), 0) as quantidade_falta_estoque,
  coalesce(rci.quantidade_necessaria, 0) as quantidade_para_compra_externa,
  case
    when coalesce(ci.quantidade, 0) > 0 and coalesce(rci.quantidade_necessaria, 0) > 0 then 'ci_parcial_compra_parcial'
    when coalesce(ci.quantidade, 0) > 0 then 'ci_total'
    when coalesce(rci.quantidade_necessaria, 0) > 0 then 'compra_total'
    else 'pendente'
  end as status_fluxo
from public.necessidades_of_material n
join public.ordens_fabricacao ofx on ofx.id = n.of_id and ofx.empresa_id = n.empresa_id
left join public.itens_industriais ip on ip.id = ofx.produto_id
left join public.boms b on b.id = ofx.bom_id
join public.materias_primas mp on mp.id = n.materia_prima_id and mp.empresa_id = n.empresa_id
left join public.estoque_saldos es on es.empresa_id = n.empresa_id and es.materia_prima_id = n.materia_prima_id and es.local_estoque = 'principal'
left join public.consumos_internos ci on ci.necessidade_id = n.id and ci.ativo = true
left join public.requisicao_compra_itens rci on rci.necessidade_id = n.id and rci.ativo = true
where n.ativo = true and n.origem_logica = 'bom_expansao' and ofx.ativo = true;

comment on view public.vw_of_consumo_detalhado is
  '4D0, Incremento 6: reescrita para ler de necessidades_of_material, ligando diretamente a consumos_internos/requisicao_compra_itens via necessidade_id (unicidade parcial garante no maximo 1 linha de cada por necessidade — nunca duplica). status_fluxo="pendente" e um valor NOVO (necessidade existe mas decidir_ci_ce_de_of ainda nao processou - normalmente nao deveria ser visivel, pois a decisao roda atomicamente dentro de aprovar_of, mas mantido por seguranca/leitura intermediaria dentro da mesma transacao). quantidade_falta_estoque compara demanda contra saldo_livre ATUAL (pode mudar apos a decisao, por outros consumos futuros - mesma semantica da versao anterior). Contrato de colunas preservado (bom_item_id/componente_produto_id/componente_pn/componente_descricao/bom_quantidade sempre NULL, mesmo motivo de vw_demanda_bom_of). security_invoker=true.';

-- =============================================================================
-- 8. security_invoker=true nas 5 views restantes (decisao: aplica-se as 7,
--    nao so as 2 reescritas) — fecha o mesmo vazamento cross-tenant nelas,
--    sem mudar seu conteudo/contrato.
-- =============================================================================

alter view public.vw_demanda_estoque set (security_invoker = true);
alter view public.vw_demanda_consumo_compra set (security_invoker = true);
alter view public.vw_of_fluxo_operacional set (security_invoker = true);
alter view public.vw_decisao_material_of set (security_invoker = true);
alter view public.vw_of_fluxo_industrial set (security_invoker = true);

-- =============================================================================
-- 9. Fechamento de ACL — 5 tabelas + 7 views. REVOKE ALL de
--    public/anon/authenticated/service_role (tabela/view E colunas —
--    mesmo padrao do Incremento 5, mesmo sem residuo de coluna conhecido
--    hoje, para nao depender de nunca ter havido um GRANT direto de
--    coluna que a introspeccao anterior nao tenha pego). GRANT SELECT so
--    para authenticated (consumidores reais confirmados: estoque_saldos,
--    estoque_movimentacoes, vw_of_consumo_detalhado, vw_of_fluxo_operacional
--    — as demais 3 tabelas e 5 views sem consumidor real conhecido hoje,
--    mas mantidas com SELECT por serem naturalmente de leitura/relatorio,
--    nunca de escrita direta).
-- =============================================================================

do $$
declare
  v_tabela text;
  v_col record;
begin
  foreach v_tabela in array array[
    'consumos_internos','requisicoes_compra','requisicao_compra_itens',
    'estoque_movimentacoes','estoque_saldos',
    'vw_demanda_bom_of','vw_demanda_estoque','vw_demanda_consumo_compra',
    'vw_of_consumo_detalhado','vw_of_fluxo_operacional',
    'vw_decisao_material_of','vw_of_fluxo_industrial'
  ]
  loop
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_tabela);
    execute format('grant select on public.%I to authenticated', v_tabela);

    for v_col in
      select attname from pg_attribute
      where attrelid = format('public.%I', v_tabela)::regclass
        and attnum > 0 and not attisdropped
    loop
      execute format(
        'revoke all (%I) on public.%I from public, anon, authenticated, service_role',
        v_col.attname, v_tabela
      );
    end loop;
  end loop;
end $$;

comment on table public.consumos_internos is '4D0, Incremento 6: escrita direta fechada (REVOKE ALL de public/anon/authenticated/service_role, tabela e colunas) — GRANT SELECT so para authenticated. Toda escrita passa a exigir decidir_ci_ce_de_of (interna, chamada so por aprovar_of).';
comment on table public.requisicoes_compra is '4D0, Incremento 6: escrita direta fechada, mesmo padrao de consumos_internos.';
comment on table public.requisicao_compra_itens is '4D0, Incremento 6: escrita direta fechada, mesmo padrao de consumos_internos.';
comment on table public.estoque_movimentacoes is '4D0, Incremento 6: escrita direta fechada, mesmo padrao de consumos_internos.';
comment on table public.estoque_saldos is '4D0, Incremento 6: escrita direta fechada, mesmo padrao de consumos_internos. UPDATE de saldo_reservado agora exclusivo de decidir_ci_ce_de_of (e de registrar_consumo_interno, corpo preservado mas EXECUTE fechado).';

commit;
