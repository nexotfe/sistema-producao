-- Incremento 4D0-A (3/3) — hierarquia recursiva OF-mãe/OFs-filhas, com
-- detecção de ciclo, rastreabilidade até a OF-raiz, validação diferida de soma
-- (distinguindo "nunca dividida" de "dividida, todas as filhas canceladas") e
-- bloqueio estrutural de DELETE físico (trigger, não só RLS — alcança
-- service_role/dono, que RLS não alcança). Plano aprovado:
-- polymorphic-tinkering-lightning (Revisão 5, seção A.2). Arquivo inteiro é
-- uma transação — qualquer falha desfaz tudo.

begin;

-- 1. Alvo de FK composta para as duas colunas de auto-referência.
alter table public.ordens_fabricacao
  add constraint ordens_fabricacao_id_empresa_uniq unique (id, empresa_id);

-- 2. of_pai_id — mesma empresa garantida estruturalmente pela FK composta.
alter table public.ordens_fabricacao
  add column of_pai_id uuid null;

alter table public.ordens_fabricacao
  add constraint ordens_fabricacao_of_pai_id_fkey
    foreign key (of_pai_id, empresa_id)
    references public.ordens_fabricacao (id, empresa_id),
  add constraint ordens_fabricacao_of_pai_nao_e_a_propria_of_chk
    check (of_pai_id is distinct from id);

-- 3. of_raiz_id — nullable primeiro para backfill seguro, NOT NULL depois.
--    Hoje toda linha existente (se houver) não tem of_pai_id (coluna recém
--    criada, tudo null) — of_raiz_id = id para todas.
alter table public.ordens_fabricacao
  add column of_raiz_id uuid null;

update public.ordens_fabricacao set of_raiz_id = id where of_raiz_id is null;

alter table public.ordens_fabricacao
  alter column of_raiz_id set not null;

alter table public.ordens_fabricacao
  add constraint ordens_fabricacao_of_raiz_id_fkey
    foreign key (of_raiz_id, empresa_id)
    references public.ordens_fabricacao (id, empresa_id);

comment on column public.ordens_fabricacao.of_pai_id is
  '4D0: OF-mãe, se esta linha for uma OF-filha (subdivisão de lote). Cadeia sem limite de nível, ciclo bloqueado por trigger.';
comment on column public.ordens_fabricacao.of_raiz_id is
  '4D0: OF-raiz da árvore de subdivisão (aponta para a própria linha quando of_pai_id é nulo). Mantida por trigger, não calculada em tempo de leitura.';

-- 4. Divergência de quantidade mãe×filhas — justificativa e aprovador sempre
--    juntos, nunca string vazia.
alter table public.ordens_fabricacao
  add column divergencia_quantidade_justificativa text null,
  add column divergencia_quantidade_aprovada_por uuid null references auth.users(id);

alter table public.ordens_fabricacao
  add constraint ordens_fabricacao_divergencia_par_chk
    check (
      (divergencia_quantidade_justificativa is null) = (divergencia_quantidade_aprovada_por is null)
    ),
  add constraint ordens_fabricacao_divergencia_nao_vazia_chk
    check (
      divergencia_quantidade_justificativa is null
      or length(trim(divergencia_quantidade_justificativa)) > 0
    );

-- 5. Detecção de ciclo + resolução de of_raiz_id — um único trigger BEFORE,
--    porque as duas coisas disparam na mesma condição (of_pai_id sendo
--    definido/alterado) e a segunda depende da primeira já ter validado que
--    não há ciclo. empresa_id filtrado em toda etapa da recursão — defesa em
--    profundidade além da FK composta, mesmo padrão já usado em 4A-4C.
create or replace function public.validar_e_resolver_of_pai()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_ciclo_detectado boolean;
  v_profundidade_excedida boolean;
  v_raiz_do_pai uuid;
begin
  if new.of_pai_id is null then
    new.of_raiz_id := new.id;
    return new;
  end if;

  -- profundidade < 50 barra a expansão da CTE no nível 50; se, ao parar, o(s)
  -- registro(s) de profundidade=50 AINDA tiverem of_pai_id não-nulo, há
  -- ancestral pendente que nunca foi verificado — silenciosamente aceitar
  -- nesse caso deixaria passar um ciclo cujo retorno ao início acontece além
  -- do limite. Aborta com diagnóstico em vez de concluir "sem ciclo" por
  -- busca incompleta.
  with recursive ancestrais as (
    select o.id, o.of_pai_id, 1 as profundidade
    from public.ordens_fabricacao o
    where o.id = new.of_pai_id and o.empresa_id = new.empresa_id
    union all
    select o.id, o.of_pai_id, a.profundidade + 1
    from public.ordens_fabricacao o
    join ancestrais a on o.id = a.of_pai_id
    where o.empresa_id = new.empresa_id and a.profundidade < 50
  )
  select
    exists(select 1 from ancestrais where id = new.id),
    exists(select 1 from ancestrais where profundidade = 50 and of_pai_id is not null)
  into v_ciclo_detectado, v_profundidade_excedida;

  if v_profundidade_excedida then
    raise exception 'ordens_fabricacao: cadeia de hierarquia a partir de of_pai_id=% excede a profundidade defensiva de 50 níveis sem concluir a busca por ciclo — abortando por segurança (OF %)', new.of_pai_id, new.id;
  end if;

  if v_ciclo_detectado then
    raise exception 'ordens_fabricacao: of_pai_id proposto (%) criaria um ciclo na hierarquia mãe/filha (OF %)', new.of_pai_id, new.id;
  end if;

  select of_raiz_id into v_raiz_do_pai
  from public.ordens_fabricacao
  where id = new.of_pai_id and empresa_id = new.empresa_id;

  if v_raiz_do_pai is null then
    raise exception 'ordens_fabricacao: of_pai_id % não encontrado na mesma empresa (OF %)', new.of_pai_id, new.id;
  end if;

  new.of_raiz_id := v_raiz_do_pai;
  return new;
end;
$$;

comment on function public.validar_e_resolver_of_pai() is
  '4D0: detecta ciclo na hierarquia mãe/filha e resolve of_raiz_id a partir do pai. empresa_id filtrado em cada nível da recursão.';

-- ACL: função de trigger, nunca chamada diretamente — mecanismo de trigger
-- não exige EXECUTE do disparador. CORREÇÃO (achado real): pg_default_acl
-- concede EXECUTE a anon/authenticated individualmente em toda função nova,
-- não só via PUBLIC — as quatro funções de trigger desta migration revogam
-- dos três explicitamente, sem conceder a ninguém de volta.
revoke execute on function public.validar_e_resolver_of_pai() from public, anon, authenticated;

create trigger validar_e_resolver_of_pai
  before insert or update of of_pai_id on public.ordens_fabricacao
  for each row
  execute function public.validar_e_resolver_of_pai();

-- 6. Propagação de of_raiz_id pra subárvore inteira quando uma OF com
--    descendentes é remanejada — atomicamente, na mesma transação (opção
--    recomendada no plano, em vez de bloquear o remanejamento). Só toca
--    of_raiz_id nos descendentes, nunca of_pai_id — não redispara o trigger
--    acima, sem risco de loop.
create or replace function public.propagar_of_raiz_subarvore()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $$
begin
  if new.of_raiz_id is distinct from old.of_raiz_id then
    with recursive descendentes as (
      select o.id
      from public.ordens_fabricacao o
      where o.of_pai_id = new.id and o.empresa_id = new.empresa_id
      union all
      select o.id
      from public.ordens_fabricacao o
      join descendentes d on o.of_pai_id = d.id
      where o.empresa_id = new.empresa_id
    )
    update public.ordens_fabricacao
    set of_raiz_id = new.of_raiz_id
    where empresa_id = new.empresa_id
      and id in (select id from descendentes);
  end if;
  return null;
end;
$$;

comment on function public.propagar_of_raiz_subarvore() is
  '4D0: quando of_raiz_id de uma OF muda (remanejamento), propaga o novo valor para toda a subárvore de descendentes, na mesma transação.';

revoke execute on function public.propagar_of_raiz_subarvore() from public, anon, authenticated;

create trigger propagar_of_raiz_subarvore
  after update of of_pai_id on public.ordens_fabricacao
  for each row
  execute function public.propagar_of_raiz_subarvore();

-- 7. Validação diferida de soma mãe×filhas — distingue "nunca dividida" (não
--    valida) de "dividida, todas canceladas" (valida soma=0, exige
--    justificativa) e "tem filhas ativas" (valida soma normal). Reúne o
--    conjunto a revalidar a partir de NEW.id, OLD.of_pai_id e NEW.of_pai_id —
--    cobre tanto a mãe editada diretamente quanto uma filha sendo movida.
--    DEFERRABLE INITIALLY DEFERRED: revalida o estado real no fim da
--    transação, não os valores de trânsito — necessário para inserir várias
--    filhas de uma vez sem falhar a cada linha individual.
create or replace function public.validar_hierarquia_of()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_ids_a_checar uuid[];
  v_mae_id uuid;
  v_mae_empresa_id uuid;
  v_quantidade_mae numeric;
  v_justificativa text;
  v_aprovador uuid;
  v_tem_filhas boolean;
  v_soma_ativas numeric;
begin
  v_ids_a_checar := array_remove(
    array[new.id, old.of_pai_id, new.of_pai_id],
    null
  );

  foreach v_mae_id in array v_ids_a_checar loop
    select empresa_id, quantidade_planejada,
           divergencia_quantidade_justificativa, divergencia_quantidade_aprovada_por
      into v_mae_empresa_id, v_quantidade_mae, v_justificativa, v_aprovador
    from public.ordens_fabricacao
    where id = v_mae_id;

    if not found then
      continue;
    end if;

    select exists(
      select 1 from public.ordens_fabricacao
      where of_pai_id = v_mae_id and empresa_id = v_mae_empresa_id
    ) into v_tem_filhas;

    if not v_tem_filhas then
      continue; -- OF nunca foi dividida: não é cobrada por soma nenhuma
    end if;

    select coalesce(sum(quantidade_planejada), 0)
      into v_soma_ativas
    from public.ordens_fabricacao
    where of_pai_id = v_mae_id
      and empresa_id = v_mae_empresa_id
      and ativo = true
      and estado_execucao <> 'cancelada';
    -- soma=0 aqui cobre tanto "todas as filhas canceladas" quanto "todas
    -- soft-deletadas" — cai na mesma exigência de justificativa abaixo, sem
    -- regra especial (decisão do usuário: sem reversão automática da mãe).

    if v_soma_ativas is distinct from v_quantidade_mae then
      if v_justificativa is null or v_aprovador is null then
        raise exception 'ordens_fabricacao: soma das filhas ativas (%) diverge da quantidade planejada da OF-mãe % (%) sem justificativa+aprovador registrados', v_soma_ativas, v_mae_id, v_quantidade_mae;
      end if;
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.validar_hierarquia_of() is
  '4D0: valida, no fim da transação, que a soma das filhas ativas fecha com a quantidade da mãe — só para OFs que já foram divididas ao menos uma vez.';

revoke execute on function public.validar_hierarquia_of() from public, anon, authenticated;

create constraint trigger validar_hierarquia_of
  after insert or update on public.ordens_fabricacao
  deferrable initially deferred
  for each row
  execute function public.validar_hierarquia_of();

-- 8. Bloqueio estrutural de DELETE físico — trigger, não só policy de RLS.
--    RLS (ordens_fabricacao_delete_blocked, já existente) barra o papel
--    authenticated, mas não alcança o dono da tabela nem service_role. Esta
--    trigger aborta SEMPRE, para qualquer executor — é a prova real por trás
--    do EXISTS histórico usado na validação de hierarquia acima. Exceção
--    administrativa só via ALTER TABLE ... DISABLE TRIGGER explícito, sob o
--    checkpoint de escrita padrão do projeto (Regra 9).
create or replace function public.bloquear_delete_fisico_of()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  raise exception 'ordens_fabricacao: DELETE físico não é permitido — cancelamento é mudança de estado (estado_execucao/estado_aprovacao), nunca exclusão da linha. Exceção administrativa exige ALTER TABLE ... DISABLE TRIGGER explícito, sob checkpoint de escrita.';
  return null;
end;
$$;

comment on function public.bloquear_delete_fisico_of() is
  '4D0: aborta incondicionalmente todo DELETE em ordens_fabricacao, inclusive por service_role/dono — RLS sozinha não alcança esses papéis.';

revoke execute on function public.bloquear_delete_fisico_of() from public, anon, authenticated;

create trigger bloquear_delete_fisico_of
  before delete on public.ordens_fabricacao
  for each row
  execute function public.bloquear_delete_fisico_of();

commit;
