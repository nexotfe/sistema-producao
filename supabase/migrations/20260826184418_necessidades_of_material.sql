-- Incremento 4D0-B — identidade estrutural, versionamento e unicidade de
-- necessidade de material. Fecha o P0 de requisição duplicada com uma chave
-- real (empresa+OF+material+origem+versão), não só histórico solto. Depende
-- de 4D0-A (FK composta usa ordens_fabricacao_id_empresa_uniq) e de 4D0-C
-- (policies de escrita usam usuario_tem_papel_funcional). Plano aprovado:
-- polymorphic-tinkering-lightning (Revisão 5, seção 4D0-B, com correções da
-- rodada de revisão pós-preparação local). Arquivo inteiro é uma transação.

begin;

-- 1. necessidades_of_material — âncora de identidade, não a tabela de decisão
--    CI/CE (essa continua fora deste plano).
create table public.necessidades_of_material (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  of_id uuid not null,
  materia_prima_id uuid not null,
  origem_logica text not null default 'bom_expansao',
  versao integer not null default 1,
  versao_anterior_id uuid null,
  quantidade_necessaria numeric not null,
  versao_atual boolean not null default true,
  ativo boolean not null default true,
  deleted_at timestamptz null,
  deleted_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

comment on table public.necessidades_of_material is
  '4D0: identidade e versão da necessidade de uma matéria-prima dentro de uma OF. Não é a decisão CI/CE (fora deste plano) — só dá identidade estável ao que hoje é calculado e descartado.';
comment on column public.necessidades_of_material.origem_logica is
  'Discriminador da origem do cálculo — hoje só ''bom_expansao'', mantido extensível.';
comment on column public.necessidades_of_material.versao_atual is
  'Marca a versão vigente da cadeia. Nome deliberadamente diferente de ''ativo'' (soft-delete de linha criada por engano é outra coisa).';

alter table public.necessidades_of_material
  add constraint necessidades_of_material_id_empresa_uniq unique (id, empresa_id);

alter table public.necessidades_of_material
  add constraint necessidades_of_material_of_id_fkey
    foreign key (of_id, empresa_id) references public.ordens_fabricacao (id, empresa_id),
  add constraint necessidades_of_material_materia_prima_fkey
    foreign key (materia_prima_id, empresa_id) references public.materias_primas (id, empresa_id),
  add constraint necessidades_of_material_versao_anterior_fkey
    foreign key (versao_anterior_id, empresa_id) references public.necessidades_of_material (id, empresa_id);

alter table public.necessidades_of_material
  add constraint necessidades_of_material_versao_chk check (versao >= 1),
  add constraint necessidades_of_material_quantidade_chk check (quantidade_necessaria > 0),
  add constraint necessidades_of_material_origem_normalizada_chk
    check (origem_logica = lower(trim(origem_logica)) and length(origem_logica) > 0),
  add constraint necessidades_of_material_coerencia_delecao_chk
    check (
      (ativo = true and deleted_at is null and deleted_by is null)
      or (ativo = false and deleted_at is not null and deleted_by is not null)
    ),
  -- CORREÇÃO: sem isto, versao=2 (ou 999) com versao_anterior_id=NULL passava
  -- pelo trigger — uma "raiz" de cadeia inválida, deslocada da versão 1 real.
  add constraint necessidades_of_material_versao_raiz_chk
    check ((versao = 1) = (versao_anterior_id is null));

-- Impede duas linhas reivindicando o mesmo número de versão da mesma necessidade.
alter table public.necessidades_of_material
  add constraint necessidades_of_material_versao_numero_uniq
    unique (empresa_id, of_id, materia_prima_id, origem_logica, versao);

-- Impede ramificação: uma versao_anterior_id só pode ter UMA sucessora, para
-- sempre — sem "where ativo=true" (uma sucessora soft-deletada continua
-- bloqueando uma segunda; senão o histórico ramifica).
create unique index necessidades_of_material_versao_anterior_uniq
  on public.necessidades_of_material (versao_anterior_id)
  where versao_anterior_id is not null;

-- Fecha o P0 de duplicidade: só uma versão vigente por empresa+OF+material+origem.
create unique index necessidades_of_material_vigente_uniq
  on public.necessidades_of_material (empresa_id, of_id, materia_prima_id, origem_logica)
  where versao_atual = true and ativo = true;

-- 2. Cadeia linear por construção — versao_anterior_id só pode apontar para a
--    versão imediatamente anterior da MESMA necessidade. Ciclo estruturalmente
--    impossível (não dá pra apontar pra frente nem pular versão).
create or replace function public.validar_cadeia_versao_necessidade()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_anterior record;
begin
  -- CORREÇÃO (rodada seguinte): a checagem de versao_atual=true cobria só a
  -- sucessora (dentro do bloco "versao_anterior_id não é nulo"). Uma RAIZ
  -- (versao=1, versao_anterior_id=NULL) podia nascer com versao_atual=false
  -- via INSERT direto, criando uma cadeia sem nenhuma versão vigente desde o
  -- nascimento — o `return new` abaixo, antes desta checagem, deixava esse
  -- caminho passar batido. Movida para antes do "return new" da raiz:
  -- aplica a toda linha nova, raiz ou sucessora, sem exceção.
  if new.versao_atual is not true then
    raise exception 'necessidades_of_material: toda necessidade nasce versao_atual=true — raiz ou sucessora, sem exceção (empresa=%, of=%, materia_prima=%)', new.empresa_id, new.of_id, new.materia_prima_id;
  end if;

  -- CORREÇÃO: mesma classe de problema para ativo/deleted_at/deleted_by —
  -- uma necessidade não pode nascer já soft-deletada. A CHECK de coerência
  -- (necessidades_of_material_coerencia_delecao_chk) permite ativo=false com
  -- deleted_at/deleted_by preenchidos em qualquer INSERT bem-formado; só este
  -- trigger, BEFORE INSERT, pode restringir especificamente o nascimento.
  if new.ativo is not true or new.deleted_at is not null or new.deleted_by is not null then
    raise exception 'necessidades_of_material: uma necessidade não pode nascer soft-deletada — INSERT exige ativo=true, deleted_at e deleted_by nulos (empresa=%, of=%, materia_prima=%)', new.empresa_id, new.of_id, new.materia_prima_id;
  end if;

  if new.versao_anterior_id is null then
    return new;
  end if;

  select empresa_id, of_id, materia_prima_id, origem_logica, versao
    into v_anterior
  from public.necessidades_of_material
  where id = new.versao_anterior_id;

  if not found then
    raise exception 'necessidades_of_material: versao_anterior_id % não encontrado', new.versao_anterior_id;
  end if;

  if v_anterior.empresa_id is distinct from new.empresa_id
     or v_anterior.of_id is distinct from new.of_id
     or v_anterior.materia_prima_id is distinct from new.materia_prima_id
     or v_anterior.origem_logica is distinct from new.origem_logica
     or v_anterior.versao is distinct from new.versao - 1 then
    raise exception 'necessidades_of_material: versao_anterior_id % não é a versão imediatamente anterior desta necessidade (esperado versao=%, mesma empresa/of/material/origem)', new.versao_anterior_id, new.versao - 1;
  end if;

  return new;
end;
$$;

comment on function public.validar_cadeia_versao_necessidade() is
  '4D0: valida invariantes de nascimento (versao_atual=true e não-soft-deletada, para raiz e sucessora) e, quando sucessora, a linearidade da cadeia.';

-- CORREÇÃO (achado real): pg_default_acl concede EXECUTE a anon/authenticated
-- individualmente em toda função nova — REVOKE FROM PUBLIC sozinho não
-- alcançava essas concessões individuais.
revoke execute on function public.validar_cadeia_versao_necessidade() from public, anon, authenticated;

create trigger validar_cadeia_versao_necessidade
  before insert on public.necessidades_of_material
  for each row
  execute function public.validar_cadeia_versao_necessidade();

-- 3. avancar_versao_necessidade — BEFORE INSERT, não AFTER: se fosse AFTER, a
--    nova linha (versao_atual=true) seria gravada antes do trigger desativar
--    a anterior, colidindo com o índice único parcial de versão vigente no
--    instante entre o INSERT e o trigger rodar. Sendo BEFORE, a UPDATE que
--    desativa a anterior roda primeiro, dentro da mesma instrução atômica —
--    se validar_cadeia_versao_necessidade rejeitar depois (ordem alfabética
--    de trigger não importa aqui: a instrução inteira é atômica, uma
--    exceção em qualquer trigger desfaz tudo, inclusive este UPDATE).
-- CORREÇÃO (rodada de revisão seguinte): a versão anterior deste arquivo
-- protegia versao_atual com uma flag de sessão (set_config/current_setting)
-- checada por um trigger BEFORE UPDATE. Isso não é uma barreira de
-- segurança — set_config é chamável por qualquer conexão SQL comum, sem
-- checagem de privilégio nenhuma; um cliente mal-intencionado podia rodar
-- `select set_config('necessidades_of_material.transicao_interna','true',true);`
-- e em seguida a UPDATE direta, contornando tudo. Removida por completo.
--
-- Proteção real, por privilégio estrutural: authenticated perde UPDATE sobre
-- a tabela inteira (revogado mais abaixo, seção 4) e recebe de volta só as
-- colunas realmente editáveis por cliente (ativo, deleted_at, deleted_by) —
-- versao_atual nunca aparece nessa lista, então uma UPDATE de authenticated
-- que tente tocá-la falha com "permission denied for column" antes mesmo de
-- chegar a RLS ou a qualquer trigger. A única gravadora de versao_atual=false
-- é esta função, agora SECURITY DEFINER (roda com o privilégio de quem a
-- definiu — a role de migration, que tem UPDATE irrestrito), com
-- search_path fixo (evita sequestro de search_path, prática padrão de
-- hardening de SECURITY DEFINER), corpo estritamente limitado (nenhum SQL
-- dinâmico, um único UPDATE com WHERE fechado por id + toda a identidade da
-- cadeia + versao_atual=true — nunca alcança linha fora desse escopo exato,
-- mesmo sob privilégio elevado) e EXECUTE revogado de PUBLIC, anon e
-- authenticated (só dispara via o mecanismo de trigger, nunca por chamada
-- direta — RLS da linha nova continua se aplicando normalmente ao INSERT que
-- disparou o trigger; se o INSERT falhar por RLS depois, a instrução inteira
-- aborta e desfaz esta UPDATE também, por atomicidade padrão do Postgres).
create or replace function public.avancar_versao_necessidade()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.versao_anterior_id is not null and new.versao_atual then
    update public.necessidades_of_material
    set versao_atual = false
    where id = new.versao_anterior_id
      and empresa_id = new.empresa_id
      and of_id = new.of_id
      and materia_prima_id = new.materia_prima_id
      and origem_logica = new.origem_logica
      and versao = new.versao - 1
      and versao_atual = true;
  end if;
  return new;
end;
$$;

comment on function public.avancar_versao_necessidade() is
  '4D0: SECURITY DEFINER — única gravadora de versao_atual=false. WHERE fechado por id+empresa_id+identidade completa da cadeia+versao_atual=true. EXECUTE revogado de todos os papéis de aplicação; só dispara via trigger.';

revoke all on function public.avancar_versao_necessidade() from public, anon, authenticated;

create trigger avancar_versao_necessidade
  before insert on public.necessidades_of_material
  for each row
  execute function public.avancar_versao_necessidade();

-- 3b-ii. created_by sempre auth.uid() real, nunca o que o cliente enviar —
--        mesmo padrão de atribuido_por em usuarios_papeis_funcionais.
--        Imutabilidade depois do INSERT já é coberta por
--        impedir_alteracao_necessidade_imutavel (abaixo), que já protege
--        created_by na lista de campos travados.
create or replace function public.forcar_created_by_necessidade()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

comment on function public.forcar_created_by_necessidade() is
  '4D0: created_by é sempre o chamador real (auth.uid()), nunca um UUID enviado pelo cliente.';

revoke execute on function public.forcar_created_by_necessidade() from public, anon, authenticated;

create trigger forcar_created_by_necessidade
  before insert on public.necessidades_of_material
  for each row
  execute function public.forcar_created_by_necessidade();

-- 3b. Imutabilidade dos campos de identidade/cadeia/quantidade depois do
--     INSERT. Deliberadamente NÃO protege versao_atual/ativo/deleted_at/
--     deleted_by — esses continuam mutáveis (é assim que
--     avancar_versao_necessidade desativa a versão anterior, e como o
--     soft-delete funciona). Para o papel authenticated, estes 9 campos já
--     ficam inacessíveis mais cedo, por privilégio de coluna (seção 4, GRANT
--     UPDATE restrito a ativo/deleted_at/deleted_by) — este trigger é a
--     camada de defesa em profundidade contra qualquer papel com privilégio
--     de UPDATE mais amplo sobre a tabela (ex.: service_role, que ignora RLS
--     mas não ignora trigger), não a primeira barreira para o cliente comum.
create or replace function public.impedir_alteracao_necessidade_imutavel()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $$
begin
  if new.empresa_id is distinct from old.empresa_id
     or new.of_id is distinct from old.of_id
     or new.materia_prima_id is distinct from old.materia_prima_id
     or new.origem_logica is distinct from old.origem_logica
     or new.versao is distinct from old.versao
     or new.versao_anterior_id is distinct from old.versao_anterior_id
     or new.quantidade_necessaria is distinct from old.quantidade_necessaria
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
  then
    raise exception 'necessidades_of_material: campos de identidade/cadeia/quantidade (empresa_id, of_id, materia_prima_id, origem_logica, versao, versao_anterior_id, quantidade_necessaria, created_at, created_by) são imutáveis após o INSERT (id=%)', old.id;
  end if;
  return new;
end;
$$;

comment on function public.impedir_alteracao_necessidade_imutavel() is
  '4D0: bloqueia reescrita direta do histórico — só versao_atual/ativo/deleted_at/deleted_by continuam mutáveis.';

revoke execute on function public.impedir_alteracao_necessidade_imutavel() from public, anon, authenticated;

create trigger impedir_alteracao_necessidade_imutavel
  before update on public.necessidades_of_material
  for each row
  execute function public.impedir_alteracao_necessidade_imutavel();

-- 4. RLS — SELECT tenant-scoped para qualquer autenticado; escrita restrita a
--    admin ou papel funcional PCP (correção 8 do plano — o RBAC de 4D0-C
--    existe precisamente para isso).
alter table public.necessidades_of_material enable row level security;

create policy necessidades_of_material_select_tenant
  on public.necessidades_of_material
  for select
  to authenticated
  using (empresa_id = public.empresa_atual_id() and ativo = true);

-- CORREÇÃO (achado real via diagnóstico isolado): sem esta policy, o
-- soft-delete de necessidades_of_material (UPDATE ativo=false, feito pelo
-- próprio PCP, exatamente o caminho que o GRANT de coluna da seção 4 libera)
-- era rejeitado com "new row violates row-level security policy" — SQLSTATE
-- 42501 — mesmo o WITH CHECK de necessidades_of_material_update_tenant não
-- mencionando `ativo`. Causa comprovada: o Postgres também exige que a linha
-- resultante de um UPDATE continue visível por alguma policy de SELECT
-- aplicável; a única policy de SELECT existente (acima) exige ativo=true,
-- então toda transição ativo=true->false ficava irrealizável para qualquer
-- authenticated, mesmo PCP/admin. Como policies permissivas se combinam por
-- OR, esta segunda policy de SELECT (histórico, restrita a quem já tem
-- alçada de escrita) restaura a visibilidade da linha pós-soft-delete só
-- para quem pode legitimamente fazê-lo — sem alterar a visibilidade para o
-- authenticated comum (que continua só enxergando ativo=true) nem conceder
-- nenhum privilégio novo de escrita.
create policy necessidades_of_material_select_historico_pcp
  on public.necessidades_of_material
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and (
      public.usuario_e_admin()
      or public.usuario_tem_papel_funcional('pcp')
    )
  );

create policy necessidades_of_material_insert_tenant
  on public.necessidades_of_material
  for insert
  to authenticated
  with check (
    empresa_id = public.empresa_atual_id()
    and (public.usuario_e_admin() or public.usuario_tem_papel_funcional('pcp'))
  );

create policy necessidades_of_material_update_tenant
  on public.necessidades_of_material
  for update
  to authenticated
  using (
    empresa_id = public.empresa_atual_id() and ativo = true
    and (public.usuario_e_admin() or public.usuario_tem_papel_funcional('pcp'))
  )
  with check (
    empresa_id = public.empresa_atual_id()
    and (public.usuario_e_admin() or public.usuario_tem_papel_funcional('pcp'))
  );

create policy necessidades_of_material_delete_blocked
  on public.necessidades_of_material
  for delete
  to authenticated
  using (false);

-- CORREÇÃO (achado real via has_table_privilege/has_column_privilege em
-- execução isolada): "REVOKE ALL FROM PUBLIC, anon" não incluía
-- `authenticated` — a concessão individual de authenticated vinda de
-- pg_default_acl (INSERT/UPDATE/DELETE de tabela inteira) continuava valendo
-- por baixo do GRANT UPDATE (colunas) abaixo, tornando a restrição de coluna
-- inteiramente inefetiva: authenticated ainda tinha UPDATE de tabela inteira,
-- incluindo versao_atual. authenticated agora entra explicitamente no
-- REVOKE, sempre antes de qualquer GRANT — só depois disso o GRANT UPDATE
-- (colunas) passa a ser a única fonte de verdade.
revoke all on public.necessidades_of_material from public, anon, authenticated;
grant select, insert on public.necessidades_of_material to authenticated;
-- Só as colunas que um cliente legitimamente edita direto (soft-delete)
-- ficam liberadas; versao_atual não entra nesta lista em hipótese nenhuma.
grant update (ativo, deleted_at, deleted_by) on public.necessidades_of_material to authenticated;

-- 5. requisicao_compra_itens — vínculo com a necessidade (nullable nesta
--    fatia: registrar_requisicao_compra_material, já publicada, não sabe
--    desta coluna ainda — promoção a NOT NULL só junto com a atualização
--    atômica dessa função, fora deste plano, para nunca deixar uma função
--    pública quebrada entre incrementos) + versionamento do item em si.
alter table public.requisicao_compra_itens
  add constraint requisicao_compra_itens_id_empresa_uniq unique (id, empresa_id);

alter table public.requisicao_compra_itens
  add column necessidade_id uuid null,
  add column item_anterior_id uuid null,
  add column status_versao text not null default 'ativa';

alter table public.requisicao_compra_itens
  add constraint requisicao_compra_itens_necessidade_fkey
    foreign key (necessidade_id, empresa_id) references public.necessidades_of_material (id, empresa_id),
  add constraint requisicao_compra_itens_item_anterior_fkey
    foreign key (item_anterior_id, empresa_id) references public.requisicao_compra_itens (id, empresa_id),
  add constraint requisicao_compra_itens_status_versao_chk
    check (status_versao in ('ativa', 'substituida', 'congelada', 'excesso_previsto'));

comment on column public.requisicao_compra_itens.necessidade_id is
  '4D0: vínculo com a identidade/versão da necessidade (necessidades_of_material). Nullable nesta fatia — registrar_requisicao_compra_material ainda não o preenche.';
comment on column public.requisicao_compra_itens.item_anterior_id is
  '4D0: encadeamento de versão do item — parcela já cotada/pedida fica congelada; nunca sobrescrita.';

commit;
