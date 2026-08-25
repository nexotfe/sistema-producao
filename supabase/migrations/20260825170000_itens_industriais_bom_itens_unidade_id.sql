-- Etapa 3 (de 8, restrita) do rollout de Cadastro de Unidades por
-- Empresa - ver desenho tecnico "Cadastro de Unidades por Empresa"
-- (parte 4) e a investigacao "Etapa 3 - Vinculo de Unidades em
-- Producao" (parte 5). Vincula SOMENTE itens_industriais e bom_itens
-- ao catalogo unidades_medida - decisao explicita do usuario apos a
-- investigacao: ordens_fabricacao e consumos_internos ficam de fora
-- desta migration (0 linhas nas duas, nenhuma RPC que as escreve e
-- chamada em nenhum lugar do frontend hoje - serao estruturadas
-- quando o modulo operacional/PCP for implementado, com teste do
-- fluxo de verdade, nao com dado sintetico). grupos_recursos.
-- unidade_capacidade tambem fica de fora - conceito diferente
-- (capacidade produtiva, nao unidade de material), nunca fez parte
-- do escopo real. Compras (requisicao_compra_itens,
-- planejamentos_compra, planejamento_compra_origens,
-- pedido_compra_itens) continua para a Etapa 4. materias_primas ja
-- concluida na Etapa 2.
--
-- Uma unica transacao cobrindo as duas tabelas aprovadas juntas: se a
-- pre-checagem de qualquer uma das duas encontrar dado incompativel,
-- a migration inteira aborta, nenhuma das duas fica parcialmente
-- migrada - as duas foram aprovadas com a mesma evidencia (dado real,
-- uso ativo, 100% de resolucao contra o catalogo), faz sentido
-- tratarem como uma unidade de aplicacao.
--
-- Mesmo padrao de cada passo ja aprovado e aplicado em
-- materias_primas (20260825160000_materias_primas_unidade_id.sql):
-- unidade_id nullable sem default, pre-checagem que aborta com
-- diagnostico antes de qualquer escrita, backfill idempotente,
-- assercao pos-backfill, FK composta (unidade_id, empresa_id), indice
-- composto comecando por empresa_id. unidade (texto) preservada
-- integralmente nas duas tabelas, em todo passo - nenhum ALTER
-- COLUMN, nenhum DROP, nenhum default novo, nenhum CHECK alterado.
-- unidade_id nasce nullable e continua nullable ao final - nenhuma
-- tela, hook ou RPC que ainda so grava texto e alterada aqui.
--
-- BEGIN/COMMIT explicito: mesma licao das migrations anteriores.

begin;

-- ============================================================
-- PARTE 1: itens_industriais
-- ============================================================

-- 1.1 Coluna aditiva, nullable
alter table public.itens_industriais
  add column unidade_id uuid;

comment on column public.itens_industriais.unidade_id is
  'FK composta (unidade_id, empresa_id) para unidades_medida - Etapa 3 do rollout de unidades. Nullable de proposito: os fluxos de gravacao atuais (useNovoProduto.ts, useEditarProduto.ts, e a RPC duplicar_produto_com_roteiro) ainda so conhecem a coluna de texto unidade - continuam validos, deixando esta coluna NULL ate a interface ser atualizada (Etapa 7). unidade (texto) permanece a fonte de verdade ate la.';

-- 1.2 Pre-checagem: aborta ANTES de alterar mais nada se qualquer
-- item industrial nao resolver para exatamente uma unidade do
-- catalogo da mesma empresa. Cobre TODA linha da tabela,
-- independente de ativo/deleted_at.
do $$
declare
  v_ruim record;
  v_total_ruim int := 0;
begin
  for v_ruim in
    select ii.id, ii.empresa_id, ii.unidade
    from public.itens_industriais ii
    where not exists (
      select 1
      from public.unidades_medida um
      where um.empresa_id = ii.empresa_id
        and um.codigo = lower(btrim(ii.unidade))
    )
  loop
    v_total_ruim := v_total_ruim + 1;
    raise warning 'item industrial sem unidade correspondente no catalogo: id=%, empresa_id=%, unidade=%',
      v_ruim.id, v_ruim.empresa_id, v_ruim.unidade;
  end loop;

  if v_total_ruim > 0 then
    raise exception 'Existem % item(ns) industrial(is) cujo texto de unidade nao corresponde a nenhum codigo do catalogo unidades_medida da mesma empresa - corrija manualmente (ajuste o texto ou cadastre a unidade faltante em unidades_medida) antes de reaplicar esta migration. Ver RAISE WARNING acima para os IDs exatos.', v_total_ruim;
  end if;
end $$;

-- 1.3 Backfill idempotente
update public.itens_industriais ii
set unidade_id = um.id
from public.unidades_medida um
where um.empresa_id = ii.empresa_id
  and um.codigo = lower(btrim(ii.unidade))
  and ii.unidade_id is null;

-- 1.4 Assercao pos-backfill - defesa em profundidade
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.itens_industriais where unidade_id is null;
  if v_count > 0 then
    raise exception 'Apos o backfill, % item(ns) industrial(is) continuam com unidade_id NULL - abortando (a pre-checagem do passo 1.2 deveria ter barrado isso antes)', v_count;
  end if;
end $$;

-- 1.5 FK composta - MATCH SIMPLE (padrao): linhas com unidade_id NULL
-- nunca violam esta constraint.
alter table public.itens_industriais
  add constraint itens_industriais_unidade_id_empresa_fkey
  foreign key (unidade_id, empresa_id)
  references public.unidades_medida (id, empresa_id);

-- 1.6 Indice composto, empresa_id primeiro - mesmo raciocinio da
-- Etapa 2 (coerente com a FK composta e com o padrao de acesso real,
-- que ja filtra por empresa_id via RLS).
create index itens_industriais_empresa_unidade_id_idx
  on public.itens_industriais (empresa_id, unidade_id);

-- ============================================================
-- PARTE 2: bom_itens
-- ============================================================

-- 2.1 Coluna aditiva, nullable
alter table public.bom_itens
  add column unidade_id uuid;

comment on column public.bom_itens.unidade_id is
  'FK composta (unidade_id, empresa_id) para unidades_medida - Etapa 3 do rollout de unidades. Nullable de proposito: os fluxos de gravacao atuais (useRoteiro.ts adicionarMaterial/adicionarSubconjunto, editarMaterial.ts, e a RPC duplicar_produto_com_roteiro) ainda so conhecem a coluna de texto unidade - continuam validos, deixando esta coluna NULL ate a interface ser atualizada (Etapa 7). unidade (texto) permanece a fonte de verdade ate la.';

-- 2.2 Pre-checagem: mesmo formato do passo 1.2, para bom_itens.
do $$
declare
  v_ruim record;
  v_total_ruim int := 0;
begin
  for v_ruim in
    select bi.id, bi.empresa_id, bi.unidade
    from public.bom_itens bi
    where not exists (
      select 1
      from public.unidades_medida um
      where um.empresa_id = bi.empresa_id
        and um.codigo = lower(btrim(bi.unidade))
    )
  loop
    v_total_ruim := v_total_ruim + 1;
    raise warning 'item de roteiro (bom_itens) sem unidade correspondente no catalogo: id=%, empresa_id=%, unidade=%',
      v_ruim.id, v_ruim.empresa_id, v_ruim.unidade;
  end loop;

  if v_total_ruim > 0 then
    raise exception 'Existem % item(ns) de roteiro (bom_itens) cujo texto de unidade nao corresponde a nenhum codigo do catalogo unidades_medida da mesma empresa - corrija manualmente (ajuste o texto ou cadastre a unidade faltante em unidades_medida) antes de reaplicar esta migration. Ver RAISE WARNING acima para os IDs exatos.', v_total_ruim;
  end if;
end $$;

-- 2.3 Backfill idempotente
update public.bom_itens bi
set unidade_id = um.id
from public.unidades_medida um
where um.empresa_id = bi.empresa_id
  and um.codigo = lower(btrim(bi.unidade))
  and bi.unidade_id is null;

-- 2.4 Assercao pos-backfill
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.bom_itens where unidade_id is null;
  if v_count > 0 then
    raise exception 'Apos o backfill, % item(ns) de roteiro (bom_itens) continuam com unidade_id NULL - abortando (a pre-checagem do passo 2.2 deveria ter barrado isso antes)', v_count;
  end if;
end $$;

-- 2.5 FK composta
alter table public.bom_itens
  add constraint bom_itens_unidade_id_empresa_fkey
  foreign key (unidade_id, empresa_id)
  references public.unidades_medida (id, empresa_id);

-- 2.6 Indice composto, empresa_id primeiro
create index bom_itens_empresa_unidade_id_idx
  on public.bom_itens (empresa_id, unidade_id);

commit;
