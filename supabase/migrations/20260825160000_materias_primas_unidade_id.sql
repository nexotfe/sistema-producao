-- Etapa 2 (de 8) do rollout de Cadastro de Unidades por Empresa - ver
-- desenho tecnico "Cadastro de Unidades por Empresa" (parte 4) e a
-- Etapa 1 ja aplicada (20260825150000_unidades_medida_catalogo_por_empresa.sql).
-- Vincula SOMENTE materias_primas ao catalogo unidades_medida. BOM
-- (bom_itens) e Compras (requisicao_compra_itens, planejamentos_compra,
-- planejamento_compra_origens, pedido_compra_itens) NAO sao tocados
-- aqui - ficam para as Etapas 3-4.
--
-- Aditivo em toda a extensao do termo: unidade_id nasce NULLABLE (nao
-- NOT NULL) e a coluna de texto unidade permanece intocada - nem
-- renomeada, nem com default alterado, nem removida. Um INSERT feito
-- pelo caminho de codigo atual (que so conhece a coluna unidade, ainda
-- nao foi alterado - isso e Etapa 7) continua funcionando exatamente
-- igual, simplesmente deixando unidade_id NULL. A FK composta abaixo
-- usa MATCH SIMPLE (padrao do Postgres): uma linha com unidade_id NULL
-- nunca viola a FK, so linhas com unidade_id preenchido sao checadas.
--
-- Fail-fast ANTES de qualquer escrita: um bloco de pre-checagem roda
-- primeiro e aborta a migration inteira (transacao unica, nada fica
-- pela metade) se encontrar qualquer materia-prima cujo texto de
-- unidade nao corresponda a exatamente um codigo do catalogo da MESMA
-- empresa - mesmo padrao ja usado na migration de numeracao de OF
-- (checagem de duplicidade antes de criar a constraint de unicidade).
-- Como unidades_medida_empresa_codigo_unique e UNIQUE(empresa_id,
-- codigo), "mais de uma correspondencia" e estruturalmente impossivel -
-- na pratica a unica falha possivel e ZERO correspondencias.
--
-- BEGIN/COMMIT explicito: mesma licao das duas migrations anteriores.

begin;

-- ============================================================
-- 1. Coluna aditiva, nullable
-- ============================================================
alter table public.materias_primas
  add column unidade_id uuid;

comment on column public.materias_primas.unidade_id is
  'FK composta (unidade_id, empresa_id) para unidades_medida - Etapa 2 do rollout de unidades. Nullable de proposito: um INSERT feito pelo caminho de codigo atual (que ainda so conhece a coluna de texto unidade, trocado somente na Etapa 7) continua valido, deixando esta coluna NULL ate a interface ser atualizada. unidade (texto) permanece a fonte de verdade ate la - nao decidir qual coluna "vale mais" nesta etapa.';

-- ============================================================
-- 2. Pre-checagem: aborta ANTES de alterar mais nada se qualquer
--    materia-prima nao resolver para exatamente uma unidade do
--    catalogo da mesma empresa. Cobre TODA linha da tabela,
--    independente de ativo/deleted_at - um registro historico
--    desativado tambem precisa de rastreabilidade correta.
-- ============================================================
do $$
declare
  v_ruim record;
  v_total_ruim int := 0;
begin
  for v_ruim in
    select mp.id, mp.empresa_id, mp.unidade
    from public.materias_primas mp
    where not exists (
      select 1
      from public.unidades_medida um
      where um.empresa_id = mp.empresa_id
        and um.codigo = lower(btrim(mp.unidade))
    )
  loop
    v_total_ruim := v_total_ruim + 1;
    raise warning 'materia-prima sem unidade correspondente no catalogo: id=%, empresa_id=%, unidade=%',
      v_ruim.id, v_ruim.empresa_id, v_ruim.unidade;
  end loop;

  if v_total_ruim > 0 then
    raise exception 'Existem % materia(s)-prima(s) cujo texto de unidade nao corresponde a nenhum codigo do catalogo unidades_medida da mesma empresa - corrija manualmente (ajuste o texto ou cadastre a unidade faltante em unidades_medida) antes de reaplicar esta migration. Ver RAISE WARNING acima para os IDs exatos.', v_total_ruim;
  end if;
end $$;

-- ============================================================
-- 3. Backfill - so preenche onde ainda esta NULL (idempotente: uma
--    reexecucao apos falha parcial em outro ponto nao duplica nem
--    sobrescreve nada ja resolvido).
-- ============================================================
update public.materias_primas mp
set unidade_id = um.id
from public.unidades_medida um
where um.empresa_id = mp.empresa_id
  and um.codigo = lower(btrim(mp.unidade))
  and mp.unidade_id is null;

-- ============================================================
-- 4. Asserção pos-backfill - defesa em profundidade. A pre-checagem
--    do passo 2 ja deveria garantir isto; se mesmo assim sobrar
--    NULL, algo mudou entre a checagem e o UPDATE (nao deveria ser
--    possivel dentro de uma unica transacao) - aborta com
--    diagnostico em vez de deixar a FK do passo 5 silenciosamente
--    aceitar linhas NULL que na verdade deveriam ter resolvido.
-- ============================================================
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.materias_primas where unidade_id is null;
  if v_count > 0 then
    raise exception 'Apos o backfill, % materia(s)-prima(s) continuam com unidade_id NULL - abortando (a pre-checagem do passo 2 deveria ter barrado isso antes)', v_count;
  end if;
end $$;

-- ============================================================
-- 5. FK composta - mesmo padrao ja em producao desde a Etapa 1
--    (recurso_produtivo_compatibilidades, unidades_medida_id_empresa_uniq).
--    MATCH SIMPLE (padrao): linhas com unidade_id NULL nunca violam
--    esta constraint, so linhas preenchidas sao checadas.
-- ============================================================
alter table public.materias_primas
  add constraint materias_primas_unidade_id_empresa_fkey
  foreign key (unidade_id, empresa_id)
  references public.unidades_medida (id, empresa_id);

-- ============================================================
-- 6. Indice COMPOSTO (empresa_id, unidade_id) - nao so unidade_id
--    sozinho. Coerente com o resto do desenho: a FK do passo 5 e
--    composta pelas mesmas duas colunas, e toda consulta real desta
--    tabela ja filtra por empresa_id primeiro (isolamento
--    multi-tenant, RLS de materias_primas). Um indice so em
--    unidade_id serviria mal esse padrao de acesso - o composto
--    cobre tanto "unidades de uma empresa" quanto, como prefixo,
--    buscas so por empresa_id.
-- ============================================================
create index materias_primas_empresa_unidade_id_idx
  on public.materias_primas (empresa_id, unidade_id);

commit;
