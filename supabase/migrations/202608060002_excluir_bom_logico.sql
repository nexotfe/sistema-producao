begin;

-- Exclusao logica de Roteiro (botao "Excluir roteiro" em /roteiros/[pn]).
-- Hoje esse botao e' so visual, sem onClick nenhum (achado da
-- investigacao read-only anterior) - esta migration liga a funcao de
-- verdade por tras dele.
--
-- Decisoes de negocio desta entrega (todas ja alinhadas com o usuario):
--   1. Exclusao LOGICA (UPDATE boms.deleted_at), nunca DELETE fisico.
--      Apagar fisicamente destruiria materiais/operacoes/servicos/
--      transportes (cascade) e o historico - inaceitavel.
--   2. Alvo e' o BOM CARREGADO no momento (versao atual da tela), nao o
--      produto inteiro.
--   3. Bloqueio de dependencia:
--      - Subconjunto vivo: reaproveitado sem modificar - dispara
--        automaticamente via trg_boms_validar_ciclo (AFTER UPDATE OF
--        deleted_at, ja existente), que aborta a transacao inteira
--        (inclusive o UPDATE desta funcao) se outro produto depende
--        deste como subconjunto e nao sobra nenhum BOM resolvivel.
--      - Orcamento: produto usado em algum projeto/orcamento ainda
--        ativo - implementado aqui, porque nenhum gatilho existente
--        conhece projeto_itens.
--      - Em ambos os casos, se existir outra versao valida que passe a
--        ser o BOM resolvido do produto, a exclusao e' permitida (o
--        produto nao fica "sem estrutura").
--   4. "Existe outra versao valida?" reaproveita literalmente
--      resolver_bom_ativo_produto(empresa_id, produto_id) - chamado
--      DEPOIS do UPDATE de exclusao, dentro da mesma transacao. Se
--      encontrar dependencia de orcamento, a excecao reverte a
--      transacao inteira, inclusive o UPDATE ja feito. Nao existe uma
--      segunda definicao de "BOM resolvido" nesta migration.
--   5. Permissao: SOMENTE administrador (IS NOT TRUE rejeita false E
--      null). A policy de UPDATE em boms hoje libera created_by OR
--      admin - mais larga que a regra de produto pedida aqui, entao a
--      funcao checa explicitamente, nao confia so na RLS.
--   6. Concorrencia, duas camadas:
--      - Lock de linha granular por produto: SELECT ... FOR UPDATE em
--        itens_industriais (id=produto_id, empresa_id=empresa_id).
--        Gatilho novo em projeto_itens adquire o MESMO lock antes de
--        INSERT/UPDATE de produto_id - garante que exclusao e insercao
--        de item de orcamento nunca vejam estado inconsistente uma da
--        outra, de qualquer cliente, sem depender de coordenacao no
--        frontend (chamadas separadas de PostgREST podem usar
--        conexoes/transacoes diferentes - um lock "adquirido" antes de
--        um INSERT em outra chamada nao garantiria nada).
--      - Advisory lock do grafo (mesma chave 'subconjunto-grafo:' ja
--        usada pelos gatilhos de bom_itens/boms) - serializa contra
--        qualquer mutacao concorrente de estrutura de subconjuntos.
--      - Revalidacao pos-lock: nao e' um SELECT separado - o proprio
--        UPDATE ... WHERE deleted_at IS NULL ... RETURNING, executado
--        SOMENTE depois de adquirir os dois locks, serve de guarda:
--        se outra transacao excluiu o mesmo bom nesse intervalo,
--        RETURNING vem vazio e a funcao rejeita com mensagem de
--        negocio ("ja foi excluido"), nunca reporta sucesso falso.
--   7. Imutabilidade apos exclusao:
--      - Cabecalho (boms): trigger BEFORE UPDATE OR DELETE. DELETE
--        fisico e' sempre rejeitado (orienta usar excluir_bom). UPDATE
--        e' rejeitado sempre que OLD.deleted_at IS NOT NULL (bloqueia
--        inclusive tentativa de restaurar via UPDATE comum -
--        restauracao futura exigira RPC propria, fora deste escopo).
--        A propria transicao de exclusao (OLD null -> NEW not null) e'
--        permitida, assim como qualquer edicao normal de um roteiro
--        ainda vivo - MAS so' quando originada por excluir_bom (ver
--        decisao 9 abaixo); nao basta a policy de UPDATE permitir.
--      - Linhas filhas (bom_itens, bom_operacoes, bom_servicos_
--        terceiros, bom_transportes): uma unica funcao de trigger
--        reaproveitada nas 4 tabelas, BEFORE INSERT OR UPDATE OR
--        DELETE. INSERT checa NEW.bom_id; DELETE checa OLD.bom_id;
--        UPDATE checa OLD.bom_id E NEW.bom_id - isso tambem bloqueia
--        mover uma linha de um roteiro excluido para outro roteiro
--        (ou vice-versa).
--   8. Mensagem de dependencia de orcamento identifica o projeto por
--      projetos.numero_projeto - nunca por projeto_itens.pn (coluna
--      legada, nao e' o identificador funcional).
--   9. UPDATE direto em boms NAO pode contornar excluir_bom. A policy
--      de UPDATE hoje libera created_by OR admin - mais larga que "so
--      admin, so via RPC, com todas as checagens" que esta funcao
--      exige. Fechamento: excluir_bom grava uma marca TRANSACIONAL
--      (set_config('nexotfe.excluir_bom_id', p_bom_id::text, true),
--      is_local=true - nunca escapa da transacao atual) imediatamente
--      antes do UPDATE, contendo o id EXATO do bom sendo excluido (nao
--      uma flag booleana generica - uma marca vazando nao autorizaria
--      excluir nenhum outro bom, so' esse). O trigger do cabecalho, ao
--      detectar a transicao null->timestamp, exige TODAS as condicoes:
--        a) current_setting('nexotfe.excluir_bom_id', true) = OLD.id::text
--        b) usuario_e_admin() IS TRUE
--        c) NEW.deleted_by = auth.uid()
--      Qualquer UPDATE direto (fora de excluir_bom) nunca tera essa
--      GUC setada para o id certo - current_setting(..., true) volta
--      NULL, a comparacao falha, a transicao e' rejeitada mesmo vindo
--      de um admin com UPDATE liberado pela RLS. Alteracao isolada de
--      deleted_by (sem a transicao de exclusao) tambem e' rejeitada -
--      deleted_by so' pode mudar como parte de uma exclusao valida.
--
-- Seguranca: excluir_bom e' SECURITY INVOKER, search_path fixo,
-- nenhum parametro livre de empresa_id (so empresa_atual_id()). ACL:
-- EXECUTE revogado de public/anon, concedido so a authenticated -
-- unica funcao desta migration com GRANT para authenticated. Todas as
-- funcoes de TRIGGER tem search_path fixo e EXECUTE revogado de
-- public/anon/authenticated (nunca devem ser chamadas diretamente,
-- so disparam via gatilho). Nenhum DELETE fisico, nenhuma cascata.

-- ---------------------------------------------------------------------
-- excluir_bom: exclusao logica do BOM (roteiro) informado.
-- ---------------------------------------------------------------------

create or replace function public.excluir_bom(
  p_bom_id uuid
) returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_produto_id uuid;
  v_bom_id_excluido uuid;
  v_bom_resolvido_apos uuid;
  v_numero_projeto_dependente text;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual não encontrada.';
  end if;

  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if public.usuario_e_admin() is not true then
    raise exception 'Apenas administradores podem excluir roteiros.';
  end if;

  select produto_id into v_produto_id
  from public.boms
  where id = p_bom_id
    and empresa_id = v_empresa_id
    and deleted_at is null;

  if not found then
    raise exception 'Roteiro não encontrado ou já foi excluído.';
  end if;

  -- Lock granular do produto - serializa contra INSERT/UPDATE
  -- concorrente de produto_id em projeto_itens (trigger
  -- projeto_itens_lock_produto, abaixo).
  perform 1 from public.itens_industriais
  where id = v_produto_id and empresa_id = v_empresa_id
  for update;

  -- Lock do grafo - mesma chave ja usada pelos gatilhos de protecao de
  -- ciclo em boms/bom_itens.
  perform pg_advisory_xact_lock(hashtextextended('subconjunto-grafo:' || v_empresa_id::text, 0));

  -- Marca transacional com o id EXATO deste bom - o trigger do
  -- cabecalho (boms_bloquear_alteracao_apos_exclusao) exige essa marca
  -- para aceitar a transicao null->timestamp. is_local=true: nunca
  -- escapa desta transacao, nunca autoriza excluir outro bom.
  perform set_config('nexotfe.excluir_bom_id', p_bom_id::text, true);

  -- Exclusao logica com guarda de concorrencia embutida: so encontra a
  -- linha (e so retorna algo) se ela ainda nao tiver sido excluida por
  -- outra transacao entre a leitura acima e agora.
  update public.boms
  set deleted_at = now(), deleted_by = auth.uid()
  where id = p_bom_id
    and empresa_id = v_empresa_id
    and deleted_at is null
  returning id into v_bom_id_excluido;

  if v_bom_id_excluido is null then
    raise exception 'Não é possível excluir: o roteiro já foi excluído.';
  end if;

  -- Dependencia de orcamento: so importa se, apos esta exclusao, o
  -- produto ficou sem nenhum BOM resolvivel. Reaproveita
  -- resolver_bom_ativo_produto sem modificar - regra canonica unica.
  v_bom_resolvido_apos := public.resolver_bom_ativo_produto(v_empresa_id, v_produto_id);

  if v_bom_resolvido_apos is null then
    select p.numero_projeto into v_numero_projeto_dependente
    from public.projeto_itens pi
    join public.projetos p on p.id = pi.projeto_id and p.deleted_at is null
    where pi.produto_id = v_produto_id
      and pi.empresa_id = v_empresa_id
      and pi.ativo = true
      and pi.deleted_at is null
    limit 1;

    if v_numero_projeto_dependente is not null then
      raise exception 'Não é possível excluir: produto usado no orçamento do projeto %.', v_numero_projeto_dependente;
    end if;
  end if;

  return v_produto_id;
end;
$function$;

comment on function public.excluir_bom(uuid) is
  'Exclusão lógica do roteiro (BOM) informado - seta deleted_at, nunca DELETE físico. Só admin. Bloqueia se outro produto depender dele como subconjunto vivo (via trg_boms_validar_ciclo existente) ou se estiver em uso em orçamento sem outra versão resolvível. Retorna produto_id.';

revoke execute on function public.excluir_bom(uuid) from public, anon;
grant execute on function public.excluir_bom(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Imutabilidade do cabecalho (boms) apos exclusao.
-- ---------------------------------------------------------------------

create or replace function public.trg_boms_bloquear_alteracao_apos_exclusao()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_transicao_exclusao boolean;
begin
  if TG_OP = 'DELETE' then
    raise exception 'Não é possível excluir fisicamente um roteiro (id=%). Use a função excluir_bom para exclusão lógica.', old.id;
  end if;

  if old.deleted_at is not null then
    raise exception 'Não é possível alterar um roteiro já excluído (id=%). Restauração exige uma operação própria (fora de escopo).', old.id;
  end if;

  -- old.deleted_at is null aqui - unica transicao de deleted_at
  -- permitida e' para um timestamp (a propria exclusao), e so' quando
  -- originada por excluir_bom (nunca por UPDATE direto, mesmo por
  -- admin com UPDATE liberado pela RLS).
  v_transicao_exclusao := new.deleted_at is not null;

  if new.deleted_by is distinct from old.deleted_by and not v_transicao_exclusao then
    raise exception 'Não é possível alterar deleted_by fora de uma exclusão lógica válida (id=%).', old.id;
  end if;

  if v_transicao_exclusao then
    if current_setting('nexotfe.excluir_bom_id', true) is distinct from old.id::text then
      raise exception 'Exclusão lógica só pode ser feita pela função excluir_bom (id=%).', old.id;
    end if;

    if public.usuario_e_admin() is not true then
      raise exception 'Apenas administradores podem excluir roteiros (id=%).', old.id;
    end if;

    if new.deleted_by is distinct from auth.uid() then
      raise exception 'deleted_by deve corresponder ao usuário autenticado que executou a exclusão (id=%).', old.id;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists boms_bloquear_alteracao_apos_exclusao on public.boms;
create trigger boms_bloquear_alteracao_apos_exclusao
  before update or delete on public.boms
  for each row
  execute function public.trg_boms_bloquear_alteracao_apos_exclusao();

revoke execute on function public.trg_boms_bloquear_alteracao_apos_exclusao() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Imutabilidade das linhas filhas (bom_itens, bom_operacoes,
-- bom_servicos_terceiros, bom_transportes) apos exclusao do BOM pai.
-- Uma unica funcao, reaproveitada nas 4 tabelas.
-- ---------------------------------------------------------------------

create or replace function public.trg_bloquear_escrita_bom_excluido()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_bom_id_antigo uuid;
  v_bom_id_novo uuid;
begin
  if TG_OP = 'DELETE' then
    v_bom_id_antigo := old.bom_id;
  elsif TG_OP = 'INSERT' then
    v_bom_id_novo := new.bom_id;
  else
    v_bom_id_antigo := old.bom_id;
    v_bom_id_novo := new.bom_id;
  end if;

  if v_bom_id_antigo is not null and exists (
    select 1 from public.boms where id = v_bom_id_antigo and deleted_at is not null
  ) then
    raise exception 'Roteiro excluído: não é possível alterar linhas de um roteiro já excluído (bom_id=%).', v_bom_id_antigo;
  end if;

  if v_bom_id_novo is not null and exists (
    select 1 from public.boms where id = v_bom_id_novo and deleted_at is not null
  ) then
    raise exception 'Roteiro excluído: não é possível gravar linhas em um roteiro já excluído (bom_id=%).', v_bom_id_novo;
  end if;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke execute on function public.trg_bloquear_escrita_bom_excluido() from public, anon, authenticated;

drop trigger if exists bom_itens_bloquear_escrita_excluido on public.bom_itens;
create trigger bom_itens_bloquear_escrita_excluido
  before insert or update or delete on public.bom_itens
  for each row
  execute function public.trg_bloquear_escrita_bom_excluido();

drop trigger if exists bom_operacoes_bloquear_escrita_excluido on public.bom_operacoes;
create trigger bom_operacoes_bloquear_escrita_excluido
  before insert or update or delete on public.bom_operacoes
  for each row
  execute function public.trg_bloquear_escrita_bom_excluido();

drop trigger if exists bom_servicos_terceiros_bloquear_escrita_excluido on public.bom_servicos_terceiros;
create trigger bom_servicos_terceiros_bloquear_escrita_excluido
  before insert or update or delete on public.bom_servicos_terceiros
  for each row
  execute function public.trg_bloquear_escrita_bom_excluido();

drop trigger if exists bom_transportes_bloquear_escrita_excluido on public.bom_transportes;
create trigger bom_transportes_bloquear_escrita_excluido
  before insert or update or delete on public.bom_transportes
  for each row
  execute function public.trg_bloquear_escrita_bom_excluido();

-- ---------------------------------------------------------------------
-- Lock de linha do produto antes de INSERT/UPDATE de produto_id em
-- projeto_itens - fecha a corrida com excluir_bom sem depender de
-- coordenacao no frontend. So adquire o lock; NAO exige roteiro (nao
-- e' uma nova regra de negocio, so' coordenacao de concorrencia -
-- adicionar um item ao orcamento antes do roteiro existir continua
-- funcionando exatamente como hoje).
-- ---------------------------------------------------------------------

create or replace function public.trg_projeto_itens_lock_produto()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  perform 1 from public.itens_industriais
  where id = new.produto_id and empresa_id = new.empresa_id
  for update;

  return new;
end;
$function$;

drop trigger if exists projeto_itens_lock_produto on public.projeto_itens;
create trigger projeto_itens_lock_produto
  before insert or update of produto_id
  on public.projeto_itens
  for each row
  execute function public.trg_projeto_itens_lock_produto();

revoke execute on function public.trg_projeto_itens_lock_produto() from public, anon, authenticated;

commit;
