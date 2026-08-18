-- Generaliza bom_operacao_dependencias_subconjunto para aceitar
-- componente_tipo='materia_prima' além de 'subconjunto' - continuação
-- da Fase 6/7 (202608110001/202608120001), decisão de desenho auditada
-- em várias rodadas com o usuário antes de qualquer linha de código.
--
-- APLICAÇÃO NO BANCO REMOTO SOMENTE PELO SQL EDITOR, APÓS TESTE COMPLETO
-- EM BEGIN...ROLLBACK (supabase/tests/generalizacao_dependencia_item_roteiro_teste.sql,
-- que roda esta mesma migration dentro de uma transação própria antes
-- de testar o comportamento). NÃO UTILIZAR `supabase db push`.
--
-- DECISÃO DE DESENHO (mantida deliberadamente, não uma omissão): o nome
-- físico da tabela NÃO muda nesta migration. "bom_operacao_dependencias_subconjunto"
-- passa a guardar vínculos de QUALQUER item do roteiro (matéria-prima ou
-- subconjunto) - o nome fica descritivamente incompleto por enquanto.
-- Motivo: um rename exigiria coordenar, na MESMA janela de deploy, esta
-- migration com a atualização de todo código de produção que referencia
-- o nome da tabela por string - inclusive uma consulta REAL e ativa
-- (coletarGrafoOcorrenciasBom.ts, usada pela tela de Previsão Comercial
-- por Capacidade em produção) e a escrita do cadastro de roteiro
-- (trocarVinculoSubconjunto.ts). Separar "generalizar comportamento" de
-- "renomear" deixa os dois deploys desacoplados - o rename fica para uma
-- migration própria e futura, coordenada com o deploy de código
-- correspondente, nunca junto com esta.
--
-- CARDINALIDADE (mudança de regra de negócio desta migration): até aqui,
-- todo bom_item_id (subconjunto ou não) tinha no máximo 1 operação
-- consumidora viva. A partir daqui:
--   - subconjunto: continua no máximo 1 (mesma regra de sempre - um
--     subconjunto só pode ser consumido por 1 ponto de montagem).
--   - materia_prima: 0, 1 ou VÁRIAS operações consumidoras vivas (a
--     mesma matéria-prima pode alimentar ramos paralelos revisados,
--     cada um com sua própria primeira operação consumidora - decisão
--     de negócio confirmada com o usuário).
-- Isso exige diferenciar a cardinalidade POR TIPO, o que por sua vez
-- exige que o próprio tipo esteja denormalizado na linha do vínculo
-- (um índice parcial não pode ter como predicado uma subconsulta a
-- bom_itens - predicados de índice precisam ser IMMUTABLE). Daí a nova
-- coluna componente_tipo, resolvida e travada por trigger - nunca
-- aceita do cliente.
--
-- ORDEM DESTA MIGRATION (deliberada, cada passo depende do anterior já
-- ter sido confirmado limpo - nunca a ordem inversa):
--   1. coluna nova, ainda aceitando nulo;
--   2. backfill a partir do valor REAL em bom_itens;
--   3. aborta (relança exceção) se alguma linha não puder ser resolvida
--      ou tiver um tipo fora do esperado - nunca decide sozinho;
--   4. CHECK explícito dos tipos suportados, só depois do backfill
--      confirmado limpo;
--   5. trigger que resolve/valida componente_tipo (nunca confia no
--      cliente) e trigger de imutabilidade estendido;
--   6. os 2 índices parciais NOVOS são criados primeiro;
--   7. só então o índice antigo (que limitava TODO item a 1, sem
--      diferenciar tipo) é removido - nunca existe uma janela sem
--      nenhuma proteção de cardinalidade;
--   8. NOT NULL por último, quando já não há mais como a coluna ficar
--      nula de novo (CHECK do passo 4 e trigger do passo 5 já impedem).
--
-- RLS: nenhuma policy é criada, alterada ou removida nesta migration -
-- as policies de SELECT/INSERT/UPDATE da Fase 6/7 continuam exatamente
-- como estão. Nenhuma policy de DELETE existe, e esta migration não cria
-- uma.

begin;

-- =====================================================================
-- 1. componente_tipo - coluna nova, nullable por enquanto
-- =====================================================================

alter table public.bom_operacao_dependencias_subconjunto
  add column componente_tipo text;

comment on column public.bom_operacao_dependencias_subconjunto.componente_tipo is
  'Cópia resolvida de bom_itens.componente_tipo no momento da criação do vínculo (nunca aceita do cliente - sempre sobrescrita pelo trigger validar_dependencia_subconjunto) - imutável depois de criada (validar_atualizacao_dependencia_subconjunto). Existe denormalizada aqui porque os índices parciais de cardinalidade (passo 6) precisam de um predicado IMMUTABLE, o que uma subconsulta a bom_itens não seria.';

comment on table public.bom_operacao_dependencias_subconjunto is
  'Vínculo estrutural "esta operação precisa deste item do roteiro pronto/disponível antes de rodar" (DEC-007 §6) - dado de cadastro do roteiro, não presumido. Generalizada nesta migration (202608180001) para cobrir também componente_tipo=materia_prima, além de subconjunto (nome físico da tabela mantido por decisão de desenho - ver cabeçalho da migration). Cardinalidade por tipo: subconjunto no máximo 1 operação consumidora viva; materia_prima 0, 1 ou várias. Esta tabela só registra o vínculo item->operação em si - qualquer regra de negócio sobre o que fazer NA AUSÊNCIA de vínculo (fallback de precedência, disponibilidade presumida, diagnóstico) pertence à camada de aplicação, não a este comentário. Manutenção pela interface (roteiro) - Fase 7 para subconjunto, generalizada aqui.';

-- =====================================================================
-- 2. Backfill - valor REAL de bom_itens, nunca um palpite
-- =====================================================================

update public.bom_operacao_dependencias_subconjunto d
  set componente_tipo = bi.componente_tipo
  from public.bom_itens bi
  where bi.id = d.bom_item_id
    and d.componente_tipo is null;

-- =====================================================================
-- 3. Abortar se alguma linha não puder ser resolvida (bom_item_id não
--    encontrado em bom_itens) ou tiver tipo fora do esperado - nunca
--    escolhe uma linha ou um valor sozinho.
-- =====================================================================

do $$
declare
  v_nao_resolvidas integer;
  v_tipo_inesperado integer;
begin
  select count(*) into v_nao_resolvidas
  from public.bom_operacao_dependencias_subconjunto
  where componente_tipo is null;

  if v_nao_resolvidas > 0 then
    raise exception 'Migration abortada: % linha(s) de bom_operacao_dependencias_subconjunto com bom_item_id que não foi encontrado em bom_itens (componente_tipo continuou nulo após o backfill) - resolva manualmente antes de aplicar esta migration. Nenhuma linha foi escolhida ou descartada automaticamente.', v_nao_resolvidas;
  end if;

  select count(*) into v_tipo_inesperado
  from public.bom_operacao_dependencias_subconjunto
  where componente_tipo not in ('subconjunto', 'materia_prima');

  if v_tipo_inesperado > 0 then
    raise exception 'Migration abortada: % linha(s) com componente_tipo fora de (subconjunto, materia_prima) - bom_itens.componente_tipo mudou de um jeito que esta migration não previu (bom_itens_tipo_chk deveria impedir isso; investigue antes de prosseguir).', v_tipo_inesperado;
  end if;
end;
$$;

-- =====================================================================
-- 4. CHECK explícito dos tipos suportados (defesa em profundidade -
--    complementar ao trigger do passo 5, nunca o único mecanismo)
-- =====================================================================

alter table public.bom_operacao_dependencias_subconjunto
  add constraint bom_operacao_dependencias_subconjunto_componente_tipo_chk
  check (componente_tipo in ('subconjunto', 'materia_prima'));

comment on constraint bom_operacao_dependencias_subconjunto_componente_tipo_chk
  on public.bom_operacao_dependencias_subconjunto is
  'Mesmos 2 valores de bom_itens_tipo_chk (bom_itens) - defesa em profundidade, redundante de propósito com a resolução feita pelo trigger validar_dependencia_subconjunto (nunca o único mecanismo de validação).';

-- =====================================================================
-- 5. Trigger de validação (INSERT/UPDATE) - generalizado para os 2
--    tipos, e agora também RESOLVE componente_tipo (nunca confia no
--    valor enviado pelo cliente) + trigger de imutabilidade (UPDATE)
--    estendido para proteger a coluna nova.
-- =====================================================================

create or replace function public.validar_dependencia_subconjunto()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog, public'
as $function$
declare
  v_op record;
  v_item record;
begin
  -- Imutabilidade de componente_tipo REJEITADA aqui, explicitamente,
  -- ANTES de qualquer resolução/sobrescrita - nunca depende da ordem
  -- entre este trigger (bom_operacao_dependencias_subconjunto_validar)
  -- e o de auditoria (..._validar_atualizacao, que também checa
  -- componente_tipo como defesa adicional, ver função abaixo). Motivo:
  -- o Postgres dispara triggers BEFORE na mesma tabela em ordem
  -- ALFABÉTICA POR NOME DO TRIGGER (nunca por nome de função nem ordem
  -- de criação) - "bom_operacao_dependencias_subconjunto_validar" é
  -- lexicograficamente ANTERIOR a
  -- "bom_operacao_dependencias_subconjunto_validar_atualizacao" (prefixo
  -- estrito), então ESTE trigger sempre roda primeiro. Sem esta
  -- checagem aqui, a resolução no fim desta função (new.componente_tipo
  -- := v_item.componente_tipo) já teria devolvido o valor ao original
  -- ANTES do trigger de auditoria conseguir comparar new/old - mascarando
  -- silenciosamente uma tentativa de alteração em vez de rejeitá-la com
  -- erro claro.
  if TG_OP = 'UPDATE' and new.componente_tipo is distinct from old.componente_tipo then
    raise exception 'componente_tipo não pode ser alterado - é resolvido automaticamente a partir de bom_itens na criação do vínculo (nunca aceito do cliente).';
  end if;

  select empresa_id, bom_id, ativo, deleted_at into v_op
    from public.bom_operacoes where id = new.bom_operacao_id;
  select empresa_id, bom_id, componente_tipo, ativo, deleted_at into v_item
    from public.bom_itens where id = new.bom_item_id;

  if v_op.empresa_id is distinct from new.empresa_id or v_item.empresa_id is distinct from new.empresa_id then
    raise exception 'bom_operacao_id e bom_item_id precisam pertencer à mesma empresa do vínculo.';
  end if;
  if v_op.bom_id is distinct from v_item.bom_id then
    raise exception 'bom_operacao_id e bom_item_id precisam pertencer ao mesmo bom_id (mesmo roteiro pai).';
  end if;
  if v_item.componente_tipo not in ('subconjunto', 'materia_prima') then
    raise exception 'bom_item_id precisa ter componente_tipo em (subconjunto, materia_prima) - valor real em bom_itens: %.', v_item.componente_tipo;
  end if;
  if not v_op.ativo or v_op.deleted_at is not null then
    raise exception 'bom_operacao_id precisa estar ativo.';
  end if;
  if not v_item.ativo or v_item.deleted_at is not null then
    raise exception 'bom_item_id precisa estar ativo.';
  end if;

  -- componente_tipo é SEMPRE resolvido aqui a partir de bom_itens, nunca
  -- aceito do cliente. No INSERT, define o valor pela primeira vez -
  -- mesmo que new.componente_tipo já viesse preenchido no payload, é
  -- sobrescrito pelo valor real antes de gravar. No UPDATE, só se chega
  -- até aqui depois que a checagem do topo desta função já rejeitou
  -- qualquer tentativa real de mudança - reatribuir aqui é idempotente
  -- (mesmo valor de old.componente_tipo).
  new.componente_tipo := v_item.componente_tipo;

  -- Revalidação defensiva da estrutura do BOM pai - histórica desde a
  -- Fase 6, pensada para subconjunto (matéria-prima não introduz aresta
  -- nova no grafo produto-a-produto), mas rodar a mesma revalidação para
  -- os 2 tipos é inofensivo (validar_estrutura_bom não muda) e mais
  -- simples do que ramificar por tipo aqui.
  perform pg_advisory_xact_lock(hashtextextended('subconjunto-grafo:' || new.empresa_id::text, 0));
  perform public.validar_estrutura_bom(new.empresa_id, (
    select produto_id from public.boms where id = v_op.bom_id and empresa_id = new.empresa_id
  ));

  return new;
end;
$function$;

comment on function public.validar_dependencia_subconjunto() is
  'Valida um vínculo bom_operacao_dependencias_subconjunto (DEC-007 §6, generalizado em 202608180001): REJEITA explicitamente qualquer tentativa de UPDATE em componente_tipo (checagem TG_OP=UPDATE, ANTES de qualquer resolução - dispara antes de validar_atualizacao_dependencia_subconjunto por ordem alfabética de nome de trigger, nunca dependa só da ordem); mesma empresa, mesmo bom_id pai, componente_tipo em (subconjunto, materia_prima), ambos ativos - RESOLVE (nunca confia no cliente) e grava componente_tipo a partir do valor real em bom_itens no INSERT - e revalida a estrutura do BOM pai via validar_estrutura_bom (202608040001), mesmo lock advisory, como defesa adicional.';

drop trigger if exists bom_operacao_dependencias_subconjunto_validar on public.bom_operacao_dependencias_subconjunto;
create trigger bom_operacao_dependencias_subconjunto_validar
  before insert or update on public.bom_operacao_dependencias_subconjunto
  for each row
  execute function public.validar_dependencia_subconjunto();

create or replace function public.validar_atualizacao_dependencia_subconjunto()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog, public'
as $function$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by não pode ser alterado.';
  end if;
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'empresa_id não pode ser alterado.';
  end if;
  if new.bom_item_id is distinct from old.bom_item_id then
    raise exception 'bom_item_id não pode ser alterado - para vincular outro item, crie um novo vínculo.';
  end if;
  if new.componente_tipo is distinct from old.componente_tipo then
    raise exception 'componente_tipo não pode ser alterado - é resolvido automaticamente a partir de bom_itens na criação do vínculo (202608180001).';
  end if;
  if new.ativo is distinct from old.ativo then
    raise exception 'ativo não pode ser alterado - remoção é sempre via deleted_at/deleted_by.';
  end if;

  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'Não é permitido restaurar diretamente um vínculo removido - crie um novo vínculo.';
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    -- Remoção lógica: só deleted_at/deleted_by podem mudar nesta operação.
    if new.deleted_by is distinct from auth.uid() then
      raise exception 'deleted_by precisa ser o usuário atual (auth.uid()) ao remover logicamente o vínculo.';
    end if;
    if new.bom_operacao_id is distinct from old.bom_operacao_id then
      raise exception 'Não é possível trocar a operação e remover o vínculo no mesmo UPDATE - faça uma ação de cada vez.';
    end if;
  elsif old.deleted_at is null and new.deleted_at is null then
    -- Troca de operação (ou UPDATE sem mudança de vigência): deleted_by continua nulo.
    if new.deleted_by is not null then
      raise exception 'deleted_by só pode ser preenchido junto com deleted_at.';
    end if;
  else
    -- old.deleted_at is not null and new.deleted_at is not null: vínculo já removido, imutável.
    if new.deleted_at is distinct from old.deleted_at
       or new.deleted_by is distinct from old.deleted_by
       or new.bom_operacao_id is distinct from old.bom_operacao_id then
      raise exception 'Vínculo já removido - não pode ser alterado.';
    end if;
  end if;

  return new;
end;
$function$;

comment on function public.validar_atualizacao_dependencia_subconjunto() is
  'Protege campos de auditoria/identidade e a forma legítima de UPDATE em bom_operacao_dependencias_subconjunto (Fase 7, componente_tipo incluído em 202608180001, defesa ADICIONAL - a rejeição que realmente dispara primeiro é a de validar_dependencia_subconjunto, por ordem alfabética de nome de trigger): created_by/empresa_id/bom_item_id/componente_tipo/ativo imutáveis; remoção lógica exige deleted_by=auth.uid() sem trocar bom_operacao_id no mesmo UPDATE; troca de operação não pode tocar deleted_at/deleted_by; sem restauração direta; vínculo já removido é imutável.';

-- REVOKE reafirmado explicitamente para as 2 funções, mesmo sabendo que
-- CREATE OR REPLACE FUNCTION preserva GRANT/REVOKE já existentes - nunca
-- depender só dessa preservação implícita (pedido explícito de
-- endurecimento). Mais restritivo que a Fase 6 original (que só
-- revogava de public/anon para validar_dependencia_subconjunto) -
-- revogar de authenticated também é seguro aqui: o trigger dispara
-- automaticamente durante INSERT/UPDATE normal de um usuário
-- authenticated (mecanismo do executor, não depende de EXECUTE na
-- function), e ninguém precisa chamar estas 2 functions diretamente.
revoke execute on function public.validar_dependencia_subconjunto() from public, anon, authenticated;
revoke execute on function public.validar_atualizacao_dependencia_subconjunto() from public, anon, authenticated;

-- =====================================================================
-- 6. Índices parciais NOVOS - cardinalidade por tipo. Criados ANTES do
--    índice antigo ser removido (passo 7) - nunca existe uma janela sem
--    nenhuma proteção de cardinalidade.
-- =====================================================================

create unique index bom_operacao_dependencias_subconjunto_1_por_subconjunto_uniq
  on public.bom_operacao_dependencias_subconjunto (empresa_id, bom_item_id)
  where deleted_at is null and componente_tipo = 'subconjunto';

comment on index public.bom_operacao_dependencias_subconjunto_1_por_subconjunto_uniq is
  'No máximo 1 operação consumidora viva por subconjunto (mesma regra da Fase 7, agora restrita explicitamente a componente_tipo=subconjunto - matéria-prima usa o índice par_materia_prima_uniq, com cardinalidade diferente).';

create unique index bom_operacao_dependencias_subconjunto_par_materia_prima_uniq
  on public.bom_operacao_dependencias_subconjunto (empresa_id, bom_item_id, bom_operacao_id)
  where deleted_at is null and componente_tipo = 'materia_prima';

comment on index public.bom_operacao_dependencias_subconjunto_par_materia_prima_uniq is
  'Matéria-prima pode ter 0, 1 ou várias operações consumidoras vivas (ramos paralelos revisados) - este índice só impede o MESMO par (item, operação) duplicado, nunca limita a 1 operação por item (202608180001).';

-- =====================================================================
-- 7. Remover o índice antigo - só agora, com os 2 novos já garantindo a
--    cardinalidade correta por tipo. Antes deste ponto, o antigo ainda
--    protegia TUDO (de forma mais restritiva do que o necessário para
--    materia_prima) - removê-lo antes dos passos 1-6 deixaria uma janela
--    sem NENHUMA proteção de cardinalidade.
-- =====================================================================

drop index public.bom_operacao_dependencias_subconjunto_item_vivo_uniq;

-- =====================================================================
-- 8. NOT NULL por último - só depois que backfill (passo 2-3), CHECK
--    (passo 4) e trigger (passo 5) já impedem qualquer novo nulo.
-- =====================================================================

alter table public.bom_operacao_dependencias_subconjunto
  alter column componente_tipo set not null;

commit;
