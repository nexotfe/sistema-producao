-- Incremento 4D0, segunda fatia — Incremento 7/9: ajustes controlados de
-- quantidade_planejada/bom_id numa OF já criada, antes da aprovação (ou
-- depois de reprovada), via nova RPC ajustar_of.
--
-- Decisões desta migration (usuário, não inferidas — consolidadas ao longo
-- de várias rodadas de investigação e revisão de contrato, todas sem
-- escrita, antes desta migration):
--
--   1. CI/CE já decidido: ajuste é permitido SOMENTE antes de
--      gerar_necessidades_de_of/decidir_ci_ce_de_of terem rodado para a OF.
--      Nenhum mecanismo de estorno/reprocessamento é criado nesta fatia —
--      fica registrado como possível incremento futuro dedicado. A RPC
--      bloqueia defensivamente qualquer OF que já tenha necessidade ou
--      materialização CI/CE, ativa OU histórica (não só ativa), mesmo que o
--      par de estado pareça permitir.
--   2. Estados permitidos: (aguardando_auditoria,planejada) e
--      (reprovada,planejada). Nenhum outro par, incluindo rascunho.
--   3. Campos ajustáveis: somente quantidade_planejada e bom_id. Produto,
--      projeto, numero_of, hierarquia e demais campos permanecem imutáveis
--      por esta RPC (numero_of já é estruturalmente imutável desde o
--      Incremento 1/9, trigger bloquear_alteracao_numero_of — não tocado
--      aqui).
--   4. OF com filhas (mãe): validar_hierarquia_of (constraint trigger já
--      existente, não tocado) é preservado integralmente. A RPC preenche
--      divergencia_quantidade_justificativa/_aprovada_por só quando a soma
--      das filhas ativas realmente diverge da nova quantidade, e os limpa
--      quando volta a coincidir. Nunca propaga quantidade automaticamente
--      para as filhas.
--   5. OF como filha: ajustar a quantidade de uma OF-filha muda a soma que a
--      validação da OF-mãe usa — a RPC recalcula e, se necessário, atualiza
--      TAMBÉM a divergência da mãe (efeito colateral auditado à parte,
--      tipo_registro='colateral_hierarquia'), sob o advisory lock da mãe,
--      adquirido ANTES do lock da própria OF (ordem determinística
--      pai→filho, documentada abaixo, evita deadlock).
--   6. Escopo: somente backend. Nenhuma tela nova, nenhuma RPC dos
--      Incrementos 5/6 reescrita, nenhum trigger existente alterado.
--   7. Auditoria: tabela nova append-only (ordens_fabricacao_ajustes),
--      separada do histórico de estados (ordens_fabricacao_historico_estados,
--      não tocado) — grava só mudanças efetivamente confirmadas (depois do
--      UPDATE correspondente já ter passado por ROW_COUNT=1).
--   8. Concorrência otimista: nova coluna versao_otimista (bigint), trigger
--      dedicado sobrescreve incondicionalmente com OLD+1 em toda UPDATE,
--      independente do valor enviado pelo cliente. Substitui updated_at como
--      token de trava (updated_at, via Date do JavaScript, causaria falso
--      conflito sistemático por perda de precisão de microssegundo — não
--      seria mais confiável que o inteiro dedicado).
--
-- Ordem formal dos advisory locks (documentada, não é escolha arbitrária):
-- sempre of-transicao:<pai_id> ANTES de of-transicao:<of_id>, nunca ao
-- contrário, em toda chamada de ajustar_of. Lock da mãe é adquirido de forma
-- conservadora sempre que a OF tem pai E p_quantidade_planejada foi
-- informado (mesmo que depois se revele no-op de quantidade) — decidir
-- depois de já ter lido a própria OF sob lock violaria a ordem pai-antes-do-
-- filho. Nenhum lock é liberado e readquirido (só pg_advisory_xact_lock,
-- transacional, liberado automaticamente no fim da transação). Prova de
-- ausência de deadlock para mãe sozinha / filha / duas irmãs / mãe+filha
-- simultâneas / OF intermediária: como toda transação multi-lock adquire ao
-- longo de um único caminho raiz→folha, sempre na mesma direção, dois
-- caminhos só podem disputar um nó compartilhado — quem chega primeiro
-- vence, a outra espera (serialização, nunca ciclo).
--
-- Capacidade (empresa_capacidade_versoes.versao, trigger
-- ordens_fabricacao_bump_capacidade_versao, FOR EACH ROW, não tocado): +0 no
-- no-op (zero UPDATE); +1 quando só a OF-alvo é tocada (inclusive
-- ajuste só de bom_id); +2 quando a OF-alvo E o ajuste colateral da mãe
-- ambos gravam. Não adulterado para forçar sempre +1.
--
-- Achado confirmado por introspecção direta antes desta migration: nenhuma
-- função hoje altera of_pai_id de uma linha já existente (as únicas
-- ocorrências de "of_pai_id" em cláusula UPDATE OF em todo o histórico de
-- migrations são as próprias definições de trigger, não escritas reais) —
-- o vínculo é estruturalmente imutável na prática atual, mesmo que o
-- trigger validar_e_resolver_of_pai suporte a coluna mudar no futuro. A RPC
-- ainda assim reconfere isso defensivamente (hint não travado vs. releitura
-- sob lock) por segurança, não por expectativa real de uso.
--
-- Superfície de leitura do token: ordens_fabricacao já tem GRANT SELECT
-- para authenticated com RLS tenant-scoped (ordens_fabricacao_select_tenant,
-- desde 202606050033, sem nenhuma restrição de ACL a nível de coluna) — a
-- nova coluna versao_otimista já nasce legível pela mesma policy, sem
-- nenhuma mudança de GRANT/RLS necessária nesta migration.
--
-- Arquivo inteiro é uma transação.

begin;

-- =============================================================================
-- 1. Concorrência otimista: nova coluna + trigger dedicado.
-- =============================================================================

alter table public.ordens_fabricacao
  add column versao_otimista bigint not null default 1;

create or replace function public.set_ordens_fabricacao_versao_otimista()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.versao_otimista := old.versao_otimista + 1;
  return new;
end;
$$;

revoke all on function public.set_ordens_fabricacao_versao_otimista() from public, anon, authenticated, service_role;

create or replace trigger set_ordens_fabricacao_versao_otimista
  before update on public.ordens_fabricacao
  for each row
  execute function public.set_ordens_fabricacao_versao_otimista();

comment on column public.ordens_fabricacao.versao_otimista is '4D0, Incremento 7: token de concorrencia otimista, incrementado incondicionalmente (OLD+1) por trigger dedicado em toda UPDATE, independente do valor enviado pelo cliente. Substitui updated_at como mecanismo de trava — timestamptz via Date do JavaScript perde precisao de microssegundo e causaria falso conflito sistematico.';

-- =============================================================================
-- 2. Tabela de auditoria — ordens_fabricacao_ajustes (append-only).
-- =============================================================================

create table public.ordens_fabricacao_ajustes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  of_id uuid not null,
  ajustado_por uuid not null references auth.users(id),
  ajustado_em timestamptz not null default now(),
  justificativa text not null,
  tipo_registro text not null,
  quantidade_planejada_anterior numeric not null,
  quantidade_planejada_nova numeric not null,
  bom_id_anterior uuid references public.boms(id),
  bom_id_novo uuid references public.boms(id),
  versao_otimista_anterior bigint not null,
  versao_otimista_nova bigint not null,
  divergencia_justificativa_anterior text,
  divergencia_justificativa_nova text,
  divergencia_aprovador_anterior uuid references auth.users(id),
  divergencia_aprovador_novo uuid references auth.users(id),
  constraint ordens_fabricacao_ajustes_of_empresa_fkey
    foreign key (of_id, empresa_id) references public.ordens_fabricacao(id, empresa_id),
  constraint ordens_fabricacao_ajustes_tipo_registro_chk
    check (tipo_registro in ('ajuste_direto', 'colateral_hierarquia')),
  constraint ordens_fabricacao_ajustes_justificativa_nao_vazia_chk
    check (length(trim(justificativa)) > 0),
  constraint ordens_fabricacao_ajustes_qtd_anterior_chk
    check (quantidade_planejada_anterior >= 0),
  constraint ordens_fabricacao_ajustes_qtd_nova_chk
    check (quantidade_planejada_nova >= 0),
  constraint ordens_fabricacao_ajustes_versao_coerente_chk
    check (versao_otimista_nova = versao_otimista_anterior + 1 and versao_otimista_anterior >= 1)
);

comment on table public.ordens_fabricacao_ajustes is '4D0, Incremento 7: auditoria append-only de ajustes de quantidade_planejada/bom_id via ajustar_of. tipo_registro=ajuste_direto e a OF pedida pelo chamador; colateral_hierarquia e o efeito colateral na OF-mae quando a divergencia dela precisa mudar em consequencia do ajuste na filha (quantidade_planejada_anterior=nova nesse caso, pois o valor dela nao muda, so a divergencia). Separada de ordens_fabricacao_historico_estados (que so registra mudanca de estado_aprovacao/estado_execucao) de proposito — sao conceitos de auditoria diferentes.';

create index ordens_fabricacao_ajustes_of_empresa_idx
  on public.ordens_fabricacao_ajustes (of_id, empresa_id);

create index ordens_fabricacao_ajustes_leitura_idx
  on public.ordens_fabricacao_ajustes (empresa_id, of_id, ajustado_em desc, id desc);

alter table public.ordens_fabricacao_ajustes enable row level security;

create policy ordens_fabricacao_ajustes_select_tenant on public.ordens_fabricacao_ajustes
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

revoke all privileges on table public.ordens_fabricacao_ajustes from public, anon, authenticated, service_role;
grant select on table public.ordens_fabricacao_ajustes to authenticated;

-- Bloqueio estrutural de UPDATE/DELETE/TRUNCATE, mesmo padrão já usado em
-- ordens_fabricacao_historico_estados — protege contra DML normal de
-- qualquer papel, inclusive service_role. Limite documentado: não protege
-- contra o dono da tabela desabilitando/removendo o próprio trigger via
-- DDL — isso é um limite estrutural de qualquer proteção baseada em
-- trigger no Postgres, não uma falha de desenho desta migration.

create or replace function public.bloquear_update_ordens_fabricacao_ajustes()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  raise exception 'ordens_fabricacao_ajustes: UPDATE nao e permitido nesta tabela append-only.';
end;
$$;
revoke all on function public.bloquear_update_ordens_fabricacao_ajustes() from public, anon, authenticated, service_role;

create or replace trigger bloquear_update_ordens_fabricacao_ajustes
  before update on public.ordens_fabricacao_ajustes
  for each row
  execute function public.bloquear_update_ordens_fabricacao_ajustes();

create or replace function public.bloquear_delete_ordens_fabricacao_ajustes()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  raise exception 'ordens_fabricacao_ajustes: DELETE nao e permitido nesta tabela append-only.';
end;
$$;
revoke all on function public.bloquear_delete_ordens_fabricacao_ajustes() from public, anon, authenticated, service_role;

create or replace trigger bloquear_delete_ordens_fabricacao_ajustes
  before delete on public.ordens_fabricacao_ajustes
  for each row
  execute function public.bloquear_delete_ordens_fabricacao_ajustes();

create or replace function public.bloquear_truncate_ordens_fabricacao_ajustes()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  raise exception 'ordens_fabricacao_ajustes: TRUNCATE nao e permitido nesta tabela append-only.';
end;
$$;
revoke all on function public.bloquear_truncate_ordens_fabricacao_ajustes() from public, anon, authenticated, service_role;

create or replace trigger bloquear_truncate_ordens_fabricacao_ajustes
  before truncate on public.ordens_fabricacao_ajustes
  for each statement
  execute function public.bloquear_truncate_ordens_fabricacao_ajustes();

-- =============================================================================
-- 3. RPC ajustar_of.
-- =============================================================================

create or replace function public.ajustar_of(
  p_of_id uuid,
  p_justificativa text,
  p_versao_otimista_esperada bigint,
  p_quantidade_planejada numeric default null,
  p_bom_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid;
  v_empresa_id uuid;
  v_pai_id_hint uuid;
  v_of record;
  v_pai record;
  v_nova_quantidade numeric;
  v_novo_bom uuid;
  v_quantidade_mudou boolean;
  v_tem_filhas_propria boolean;
  v_soma_filhas_propria numeric;
  v_div_just_propria text;
  v_div_aprov_propria uuid;
  v_soma_filhas_pai numeric;
  v_div_just_pai text;
  v_div_aprov_pai uuid;
  v_rows integer;
  v_versao_nova bigint;
  v_versao_pai_nova bigint;
  v_bom_valido uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'ajustar_of: sessao invalida.';
  end if;

  v_empresa_id := public.empresa_atual_id();
  if v_empresa_id is null then
    raise exception 'ajustar_of: empresa atual nao encontrada.';
  end if;

  if not (coalesce(public.usuario_e_admin(), false) or coalesce(public.usuario_tem_papel_funcional('pcp'), false)) then
    raise exception 'ajustar_of: usuario sem permissao para ajustar OF.';
  end if;

  if p_justificativa is null or length(trim(p_justificativa)) = 0 then
    raise exception 'ajustar_of: justificativa obrigatoria para ajustar uma OF.';
  end if;

  if p_versao_otimista_esperada is null then
    raise exception 'ajustar_of: p_versao_otimista_esperada obrigatoria - leia a OF antes de ajustar e informe a versao lida.';
  end if;

  perform 1 from public.ordens_fabricacao where id = p_of_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'ajustar_of: OF nao encontrada.';
  end if;

  -- Pre-leitura NAO travada, so para decidir a ordem dos advisory locks
  -- (mae antes da propria OF, sempre). Pode estar desatualizada - reconferida
  -- explicitamente apos a releitura autoritativa, sob lock.
  select of_pai_id into v_pai_id_hint
  from public.ordens_fabricacao
  where id = p_of_id and empresa_id = v_empresa_id;

  -- Lock da mae adquirido de forma conservadora sempre que a OF tem pai E o
  -- chamador informou p_quantidade_planejada (mesmo que depois se revele
  -- no-op de quantidade) - decidir isso depois de ja ter lido a propria OF
  -- sob lock violaria a ordem pai-antes-do-filho.
  if v_pai_id_hint is not null and p_quantidade_planejada is not null then
    perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || v_pai_id_hint::text, 0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));

  select id, numero_of, empresa_id, quantidade_planejada, bom_id, produto_id,
         estado_aprovacao, estado_execucao, versao_otimista, of_pai_id,
         divergencia_quantidade_justificativa, divergencia_quantidade_aprovada_por
    into v_of
  from public.ordens_fabricacao
  where id = p_of_id and empresa_id = v_empresa_id;

  if not found then
    raise exception 'ajustar_of: OF % nao encontrada apos travar.', p_of_id;
  end if;

  if v_of.of_pai_id is distinct from v_pai_id_hint then
    raise exception 'ajustar_of: of_pai_id da OF % mudou durante a operacao (era %, agora %) - ordem de locks pode estar incorreta, abortando por seguranca. Tente novamente.', p_of_id, v_pai_id_hint, v_of.of_pai_id;
  end if;

  if v_of.versao_otimista is distinct from p_versao_otimista_esperada then
    raise exception 'ajustar_of: conflito de edicao - a OF % foi alterada por outra operacao (versao esperada=%, atual=%). Recarregue e tente novamente.', v_of.numero_of, p_versao_otimista_esperada, v_of.versao_otimista;
  end if;

  if not (
    (v_of.estado_aprovacao = 'aguardando_auditoria' and v_of.estado_execucao = 'planejada')
    or (v_of.estado_aprovacao = 'reprovada' and v_of.estado_execucao = 'planejada')
  ) then
    raise exception 'ajustar_of: transicao invalida - OF % em %/%.', v_of.numero_of, v_of.estado_aprovacao, v_of.estado_execucao;
  end if;

  -- Bloqueio defensivo: qualquer necessidade/materializacao CI-CE, ativa OU
  -- historica, ja associada a esta OF impede o ajuste, mesmo que o par de
  -- estado acima pareca permitir. requisicao_compra_itens nao tem of_id
  -- direto - passa pelo cabecalho requisicoes_compra.
  if exists(select 1 from public.necessidades_of_material
             where of_id = p_of_id and empresa_id = v_empresa_id)
     or exists(select 1 from public.consumos_internos
                where of_id = p_of_id and empresa_id = v_empresa_id)
     or exists(select 1 from public.estoque_movimentacoes
                where of_id = p_of_id and empresa_id = v_empresa_id)
     or exists(select 1 from public.requisicoes_compra
                where of_id = p_of_id and empresa_id = v_empresa_id)
     or exists(
          select 1 from public.requisicao_compra_itens rci
          join public.requisicoes_compra rc on rc.id = rci.requisicao_compra_id
          where rc.of_id = p_of_id and rc.empresa_id = v_empresa_id
        )
  then
    raise exception 'ajustar_of: OF % ja possui necessidade ou materializacao CI/CE (ativa ou historica) - ajuste bloqueado.', v_of.numero_of;
  end if;

  if p_bom_id is not null then
    select b.id into v_bom_valido
    from public.boms b
    where b.id = p_bom_id
      and b.empresa_id = v_empresa_id
      and b.produto_id = v_of.produto_id
      and b.ativo = true
      and b.deleted_at is null
      and b.id = public.resolver_bom_ativo_produto(v_empresa_id, v_of.produto_id);
    if v_bom_valido is null then
      raise exception 'ajustar_of: bom_id informado (%) nao e o BOM ativo/resolvido do produto da OF %.', p_bom_id, v_of.numero_of;
    end if;
  end if;

  if p_quantidade_planejada is not null and p_quantidade_planejada < 0 then
    raise exception 'ajustar_of: quantidade_planejada nao pode ser negativa (recebido %).', p_quantidade_planejada;
  end if;

  v_nova_quantidade := coalesce(p_quantidade_planejada, v_of.quantidade_planejada);
  v_novo_bom := coalesce(p_bom_id, v_of.bom_id);

  if v_nova_quantidade = v_of.quantidade_planejada and v_novo_bom is not distinct from v_of.bom_id then
    return jsonb_build_object(
      'resultado', 'sem_alteracao',
      'of_id', p_of_id,
      'numero_of', v_of.numero_of,
      'versao_otimista', v_of.versao_otimista
    );
  end if;

  v_quantidade_mudou := p_quantidade_planejada is not null and v_nova_quantidade is distinct from v_of.quantidade_planejada;

  if v_quantidade_mudou then
    v_tem_filhas_propria := exists(select 1 from public.ordens_fabricacao
                                    where of_pai_id = p_of_id and empresa_id = v_empresa_id);
    if v_tem_filhas_propria then
      select coalesce(sum(quantidade_planejada), 0) into v_soma_filhas_propria
      from public.ordens_fabricacao
      where of_pai_id = p_of_id and empresa_id = v_empresa_id
        and ativo = true and estado_execucao <> 'cancelada';
      if v_soma_filhas_propria is distinct from v_nova_quantidade then
        v_div_just_propria := p_justificativa;
        v_div_aprov_propria := v_uid;
      else
        v_div_just_propria := null;
        v_div_aprov_propria := null;
      end if;
    else
      v_div_just_propria := v_of.divergencia_quantidade_justificativa;
      v_div_aprov_propria := v_of.divergencia_quantidade_aprovada_por;
    end if;
  else
    -- BOM-only (ou nenhum campo de quantidade mudou de fato): preserva
    -- exatamente os campos de divergencia atuais, sem recalcular hierarquia.
    v_div_just_propria := v_of.divergencia_quantidade_justificativa;
    v_div_aprov_propria := v_of.divergencia_quantidade_aprovada_por;
  end if;

  update public.ordens_fabricacao
  set quantidade_planejada = v_nova_quantidade,
      bom_id = v_novo_bom,
      divergencia_quantidade_justificativa = v_div_just_propria,
      divergencia_quantidade_aprovada_por = v_div_aprov_propria
  where id = p_of_id
    and empresa_id = v_empresa_id
    and estado_aprovacao = v_of.estado_aprovacao
    and estado_execucao = v_of.estado_execucao
    and versao_otimista = v_of.versao_otimista
  returning versao_otimista into v_versao_nova;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'ajustar_of: falha ao ajustar OF % - estado mudou durante a operacao.', p_of_id;
  end if;

  insert into public.ordens_fabricacao_ajustes (
    empresa_id, of_id, ajustado_por, justificativa, tipo_registro,
    quantidade_planejada_anterior, quantidade_planejada_nova,
    bom_id_anterior, bom_id_novo,
    versao_otimista_anterior, versao_otimista_nova,
    divergencia_justificativa_anterior, divergencia_justificativa_nova,
    divergencia_aprovador_anterior, divergencia_aprovador_novo
  ) values (
    v_empresa_id, p_of_id, v_uid, p_justificativa, 'ajuste_direto',
    v_of.quantidade_planejada, v_nova_quantidade,
    v_of.bom_id, v_novo_bom,
    v_of.versao_otimista, v_versao_nova,
    v_of.divergencia_quantidade_justificativa, v_div_just_propria,
    v_of.divergencia_quantidade_aprovada_por, v_div_aprov_propria
  );

  if v_quantidade_mudou and v_of.of_pai_id is not null then
    select id, empresa_id, quantidade_planejada, bom_id, versao_otimista,
           divergencia_quantidade_justificativa, divergencia_quantidade_aprovada_por
      into v_pai
    from public.ordens_fabricacao
    where id = v_of.of_pai_id and empresa_id = v_empresa_id;

    if not found then
      raise exception 'ajustar_of: OF pai % nao encontrada durante o ajuste da OF %.', v_of.of_pai_id, p_of_id;
    end if;

    select coalesce(sum(quantidade_planejada), 0) into v_soma_filhas_pai
    from public.ordens_fabricacao
    where of_pai_id = v_of.of_pai_id and empresa_id = v_empresa_id
      and ativo = true and estado_execucao <> 'cancelada';

    if v_soma_filhas_pai is distinct from v_pai.quantidade_planejada then
      v_div_just_pai := p_justificativa;
      v_div_aprov_pai := v_uid;
    else
      v_div_just_pai := null;
      v_div_aprov_pai := null;
    end if;

    if v_div_just_pai is distinct from v_pai.divergencia_quantidade_justificativa
       or v_div_aprov_pai is distinct from v_pai.divergencia_quantidade_aprovada_por then

      update public.ordens_fabricacao
      set divergencia_quantidade_justificativa = v_div_just_pai,
          divergencia_quantidade_aprovada_por = v_div_aprov_pai
      where id = v_of.of_pai_id
        and empresa_id = v_empresa_id
        and versao_otimista = v_pai.versao_otimista
      returning versao_otimista into v_versao_pai_nova;

      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception 'ajustar_of: falha ao atualizar divergencia da OF pai % - estado mudou durante a operacao.', v_of.of_pai_id;
      end if;

      insert into public.ordens_fabricacao_ajustes (
        empresa_id, of_id, ajustado_por, justificativa, tipo_registro,
        quantidade_planejada_anterior, quantidade_planejada_nova,
        bom_id_anterior, bom_id_novo,
        versao_otimista_anterior, versao_otimista_nova,
        divergencia_justificativa_anterior, divergencia_justificativa_nova,
        divergencia_aprovador_anterior, divergencia_aprovador_novo
      ) values (
        v_empresa_id, v_of.of_pai_id, v_uid, p_justificativa, 'colateral_hierarquia',
        v_pai.quantidade_planejada, v_pai.quantidade_planejada,
        v_pai.bom_id, v_pai.bom_id,
        v_pai.versao_otimista, v_versao_pai_nova,
        v_pai.divergencia_quantidade_justificativa, v_div_just_pai,
        v_pai.divergencia_quantidade_aprovada_por, v_div_aprov_pai
      );
    end if;
  end if;

  return jsonb_build_object(
    'resultado', 'ajustada',
    'of_id', p_of_id,
    'numero_of', v_of.numero_of,
    'quantidade_planejada_anterior', v_of.quantidade_planejada,
    'quantidade_planejada_nova', v_nova_quantidade,
    'bom_id_anterior', v_of.bom_id,
    'bom_id_novo', v_novo_bom,
    'versao_otimista_nova', v_versao_nova
  );
end;
$$;

comment on function public.ajustar_of(uuid, text, bigint, numeric, uuid) is '4D0, Incremento 7: ajusta quantidade_planejada/bom_id de uma OF antes da aprovacao (aguardando_auditoria/planejada ou reprovada/planejada), somente. Bloqueia defensivamente se ja existir necessidade/materializacao CI-CE (ativa ou historica). Trava otimista via versao_otimista (bigint, nao mais updated_at). Locks pai-antes-do-filho (of-transicao:<pai_id> antes de of-transicao:<of_id>), sem liberacao intermediaria. Recalcula divergencia_quantidade_* propria e, se aplicavel, da OF-mae (efeito colateral auditado em ordens_fabricacao_ajustes com tipo_registro=colateral_hierarquia) somente quando quantidade_planejada realmente muda - ajuste so de bom_id preserva a hierarquia intacta. Nenhum estorno de CI/CE nesta fatia.';

revoke all on function public.ajustar_of(uuid, text, bigint, numeric, uuid) from public, anon, service_role;
grant execute on function public.ajustar_of(uuid, text, bigint, numeric, uuid) to authenticated;

commit;
