-- Incremento 4B (de 4A-4D) do fluxo vertical de Compras - ver "Desenho
-- Tecnico - Fluxo Vertical de Compras" (parte 8) e o Incremento 4A ja
-- aplicado (materia_prima_unidade_conversoes). Este incremento cobre
-- SOMENTE estrutura nas 4 tabelas do pipeline de Compras - nenhuma
-- RPC (4C), nenhuma tela (4D). Nenhuma das 4 tabelas tem linha hoje
-- (confirmado na investigacao da Etapa 4 e reconfirmado antes desta
-- migration) - toda coluna nova e aditiva e nullable, exceto
-- chave_idempotencia (ver PARTE 3, justificativa ali).
--
-- Cinco partes, na mesma ordem em que foram pedidas:
-- 1. requisicao_compra_itens - unidade_id (unidade tecnica)
-- 2. planejamento_compra_origens - origem_ativa + indice unico
--    parcial (garantia estrutural contra vinculo duplicado)
-- 3. planejamentos_compra - colunas de decisao + chave_idempotencia
--    NOT NULL com UNIQUE completo (nao parcial) - correcao ja aprovada:
--    como o pipeline esta vazio, a chave e obrigatoria desde o
--    primeiro planejamento real, nunca reutilizavel mesmo apos
--    cancelamento (a linha nunca e apagada, so status='cancelado').
-- 4. pedido_compra_itens - colunas de snapshot + trigger de
--    imutabilidade (BEFORE UPDATE, dispara para qualquer role,
--    inclusive futura RPC SECURITY DEFINER mal desenhada - nao
--    depende so da policy de UPDATE ja bloqueada)
-- 5. Trigger de cancelamento - desativa as origens de um planejamento
--    na MESMA transacao em que o status vira 'cancelado' (AFTER
--    UPDATE em planejamentos_compra, usa somente a coluna status ja
--    existente - nao depende de nenhuma coluna nova da PARTE 3)
--
-- BEGIN/COMMIT explicito: mesma licao das migrations anteriores.

begin;

-- ============================================================
-- PARTE 1: requisicao_compra_itens - unidade tecnica
-- ============================================================

alter table public.requisicao_compra_itens
  add column unidade_id uuid;

comment on column public.requisicao_compra_itens.unidade_id is
  'FK composta (unidade_id, empresa_id) para unidades_medida - Incremento 4B do fluxo vertical de Compras. Nullable de proposito: nenhuma RPC ainda grava este campo (isso e o Incremento 4C) - unidade (texto) permanece a fonte de verdade ate la.';

-- Pre-checagem: mesmo padrao das Etapas 2-3. Tabela vazia hoje, entao
-- este bloco nao deveria encontrar nada - mantido por consistencia
-- estrutural (o codigo precisa estar correto quando a Etapa 4C/4D
-- comecar a gerar dado real, nao so "funcionar por a tabela estar
-- vazia agora").
do $$
declare
  v_ruim record;
  v_total_ruim int := 0;
begin
  for v_ruim in
    select rci.id, rci.empresa_id, rci.unidade
    from public.requisicao_compra_itens rci
    where not exists (
      select 1
      from public.unidades_medida um
      where um.empresa_id = rci.empresa_id
        and um.codigo = lower(btrim(rci.unidade))
    )
  loop
    v_total_ruim := v_total_ruim + 1;
    raise warning 'item de requisicao de compra sem unidade correspondente no catalogo: id=%, empresa_id=%, unidade=%',
      v_ruim.id, v_ruim.empresa_id, v_ruim.unidade;
  end loop;

  if v_total_ruim > 0 then
    raise exception 'Existem % item(ns) de requisicao de compra cujo texto de unidade nao corresponde a nenhum codigo do catalogo unidades_medida da mesma empresa - corrija manualmente antes de reaplicar esta migration. Ver RAISE WARNING acima para os IDs exatos.', v_total_ruim;
  end if;
end $$;

update public.requisicao_compra_itens rci
set unidade_id = um.id
from public.unidades_medida um
where um.empresa_id = rci.empresa_id
  and um.codigo = lower(btrim(rci.unidade))
  and rci.unidade_id is null;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.requisicao_compra_itens where unidade_id is null;
  if v_count > 0 then
    raise exception 'Apos o backfill, % item(ns) de requisicao de compra continuam com unidade_id NULL - abortando', v_count;
  end if;
end $$;

alter table public.requisicao_compra_itens
  add constraint requisicao_compra_itens_unidade_id_empresa_fkey
  foreign key (unidade_id, empresa_id)
  references public.unidades_medida (id, empresa_id);

create index requisicao_compra_itens_empresa_unidade_id_idx
  on public.requisicao_compra_itens (empresa_id, unidade_id);

-- ============================================================
-- PARTE 2: planejamento_compra_origens - vinculo ativo, garantia
-- estrutural contra duplo vinculo
-- ============================================================

alter table public.planejamento_compra_origens
  add column origem_ativa boolean not null default true;

comment on column public.planejamento_compra_origens.origem_ativa is
  'Uma requisicao so pode ter no maximo 1 origem ativa por vez - garantido pelo indice unico parcial planejamento_compra_origens_requisicao_ativa_uniq, nao so por logica de aplicacao. Desativada automaticamente quando o planejamento pai e cancelado (ver trigger na PARTE 5).';

-- GARANTIA ESTRUTURAL: uma requisicao nunca tem mais de uma origem
-- ativa ao mesmo tempo - forcado pelo banco. Uma segunda tentativa de
-- vincular a mesma requisicao a outro planejamento (com a primeira
-- origem ainda ativa) falha nesta constraint, nao depende de nenhuma
-- RPC lembrar de checar isso primeiro.
create unique index planejamento_compra_origens_requisicao_ativa_uniq
  on public.planejamento_compra_origens (empresa_id, requisicao_compra_item_id)
  where origem_ativa = true;

-- ============================================================
-- PARTE 3: planejamentos_compra - colunas de decisao + idempotencia
-- ============================================================

-- chave_idempotencia NOT NULL sem DEFAULT: valido porque a tabela
-- esta vazia agora (confirmado). Se por algum motivo ja existisse
-- alguma linha sem chave no momento desta migration, o proprio
-- Postgres recusaria o ADD COLUMN com um erro claro ("column contains
-- null values") - nao precisa de uma pre-checagem customizada aqui,
-- ao contrario do backfill de unidade_id (onde o valor pode ser
-- resolvido a partir de dado existente, aqui nao ha valor nenhum para
-- inferir uma chave de idempotencia de uma linha que nunca teve uma).
alter table public.planejamentos_compra
  add column unidade_necessidade_id uuid,
  add column unidade_compra_id uuid,
  add column rendimento_aplicado numeric,
  add column multiplo_aplicado numeric,
  add column regra_arredondamento text,
  add column preco_unitario_estimado numeric,
  add column chave_idempotencia text not null;

comment on column public.planejamentos_compra.chave_idempotencia is
  'Fornecida pelo chamador da RPC de criacao (Incremento 4C) - permite reexecutar a mesma operacao com seguranca (replay real, nao so protecao contra duplicidade): mesma chave + mesmo conjunto de requisicoes retorna o planejamento ja criado, sem duplicar. NOT NULL e UNIQUE completo (nao parcial) por decisao explicita: a chave nunca deve ser reutilizada, nem apos o planejamento ser cancelado (a linha nunca e apagada fisicamente, so status=cancelado - a constraint continua bloqueando reuso da chave para sempre). btrim(...) <> '''' via planejamentos_compra_chave_idemp_nao_vazia_chk - NOT NULL sozinho nao barra string vazia ou so espacos.';

alter table public.planejamentos_compra
  add constraint planejamentos_compra_unid_necessidade_id_fkey
    foreign key (unidade_necessidade_id, empresa_id)
    references public.unidades_medida (id, empresa_id),
  add constraint planejamentos_compra_unid_compra_id_fkey
    foreign key (unidade_compra_id, empresa_id)
    references public.unidades_medida (id, empresa_id),
  add constraint planejamentos_compra_regra_arred_chk
    check (regra_arredondamento is null or regra_arredondamento in (
      'automatico_sem_regra', 'multiplo_inteiro', 'multiplo_fracionavel'
    )),
  add constraint planejamentos_compra_preco_estimado_chk
    check (preco_unitario_estimado is null or preco_unitario_estimado >= 0),
  add constraint planejamentos_compra_chave_idemp_nao_vazia_chk
    check (btrim(chave_idempotencia) <> '');

-- UNIQUE completo (nao parcial) - correcao aprovada explicitamente:
-- simplifica o futuro ON CONFLICT (empresa_id, chave_idempotencia) da
-- RPC de criacao (4C), que passa a bater exatamente com esta
-- constraint, sem precisar repetir nenhum predicado.
alter table public.planejamentos_compra
  add constraint planejamentos_compra_empresa_chave_idemp_uniq
  unique (empresa_id, chave_idempotencia);

-- ============================================================
-- PARTE 4: pedido_compra_itens - snapshot + imutabilidade
-- comprovada no banco (nao so pela policy de UPDATE ja bloqueada)
-- ============================================================

alter table public.pedido_compra_itens
  add column unidade_necessidade_id uuid,
  add column unidade_compra_id uuid,
  add column rendimento_aplicado numeric,
  add column multiplo_aplicado numeric,
  add column regra_arredondamento text,
  add column quantidade_necessaria numeric,
  add column sobra_calculada numeric,
  add column preco_unitario numeric;

alter table public.pedido_compra_itens
  add constraint pedido_compra_itens_unid_necessidade_id_fkey
    foreign key (unidade_necessidade_id, empresa_id)
    references public.unidades_medida (id, empresa_id),
  add constraint pedido_compra_itens_unid_compra_id_fkey
    foreign key (unidade_compra_id, empresa_id)
    references public.unidades_medida (id, empresa_id),
  add constraint pedido_compra_itens_regra_arred_chk
    check (regra_arredondamento is null or regra_arredondamento in (
      'automatico_sem_regra', 'multiplo_inteiro', 'multiplo_fracionavel'
    )),
  add constraint pedido_compra_itens_preco_chk
    check (preco_unitario is null or preco_unitario >= 0);

-- Trigger de imutabilidade: dispara para QUALQUER UPDATE que altere
-- um dos 9 campos de snapshot/preco, independente de quem executa -
-- nao e SECURITY DEFINER de proposito, nao precisa de privilegio
-- elevado, so precisa disparar sempre. A policy
-- pedido_compra_itens_update_blocked ja bloqueia UPDATE para
-- authenticated - este trigger cobre o que a policy sozinha nao cobre
-- (uma futura funcao SECURITY DEFINER mal desenhada, ou um UPDATE
-- direto de migration futura descuidada). Mesmo espirito de defesa em
-- profundidade ja usado no autoprovisionamento de numeracao de OF.
create or replace function public.trg_pedido_compra_itens_bloquear_alteracao_snapshot()
 returns trigger
 language plpgsql
as $function$
begin
  if new.unidade_necessidade_id is distinct from old.unidade_necessidade_id
    or new.unidade_compra_id is distinct from old.unidade_compra_id
    or new.rendimento_aplicado is distinct from old.rendimento_aplicado
    or new.multiplo_aplicado is distinct from old.multiplo_aplicado
    or new.regra_arredondamento is distinct from old.regra_arredondamento
    or new.quantidade_necessaria is distinct from old.quantidade_necessaria
    or new.quantidade is distinct from old.quantidade
    or new.sobra_calculada is distinct from old.sobra_calculada
    or new.preco_unitario is distinct from old.preco_unitario
  then
    raise exception 'Campos de snapshot/preco de pedido_compra_itens sao imutaveis apos a criacao - id=%', old.id;
  end if;
  return new;
end;
$function$;

comment on function public.trg_pedido_compra_itens_bloquear_alteracao_snapshot() is
  'Bloqueia alteracao dos campos de snapshot/preco de pedido_compra_itens apos a criacao, para qualquer role (nao so authenticated) - correcao explicita: nao basta a policy de UPDATE, esta e a garantia comprovada no banco. Nao protege contra DELETE feito como dono da tabela (postgres) - isso e limite conhecido e documentado, coberto por disciplina operacional, nao por constraint.';

create trigger pedido_compra_itens_bloquear_alteracao_snapshot
  before update on public.pedido_compra_itens
  for each row execute function public.trg_pedido_compra_itens_bloquear_alteracao_snapshot();

-- ============================================================
-- PARTE 5: trigger de cancelamento - desativa as origens do
-- planejamento NA MESMA TRANSACAO em que o status vira 'cancelado'
-- ============================================================

create or replace function public.trg_planejamentos_compra_cancelar_origens()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.status = 'cancelado' and old.status is distinct from 'cancelado' then
    update public.planejamento_compra_origens
       set origem_ativa = false
     where planejamento_compra_id = new.id
       and origem_ativa = true;
  end if;
  return new;
end;
$function$;

comment on function public.trg_planejamentos_compra_cancelar_origens() is
  'Ao marcar planejamentos_compra.status=cancelado, desativa automaticamente todas as origens ainda ativas desse planejamento, na mesma transacao - nao depende de toda RPC/fluxo que cancela um planejamento lembrar de fazer isso manualmente. SECURITY DEFINER porque quem cancela um planejamento pode nao ter permissao de UPDATE direto em planejamento_compra_origens (a policy de update dessa tabela nao exige admin, mas mesmo assim o disparo deve ser garantido independente de quem chamou o UPDATE original).';

create trigger planejamentos_compra_cancelar_origens
  after update on public.planejamentos_compra
  for each row execute function public.trg_planejamentos_compra_cancelar_origens();

commit;
