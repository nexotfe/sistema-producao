-- DEC-007 (Gerador e Comparador de Cenários Viáveis) - Fase 7: cadastro
-- da interface "esta operação precisa deste subconjunto pronto antes de
-- rodar" (bom_operacao_dependencias_subconjunto, criada na Fase 6 -
-- 202608110001 - com RLS habilitado mas SEM nenhuma policy de escrita,
-- de propósito: "interface de manutenção do vínculo fica para a Fase
-- 7"). Esta migration entrega as policies de escrita, o fortalecimento
-- de integridade que a revisão de desenho pediu antes de implementar, e
-- a troca do índice único fraco pelo forte. Não toca em
-- grafoPrecedencia.ts nem em nenhum outro módulo já fechado da Fase 1.
--
-- APLICAÇÃO NO BANCO REMOTO SOMENTE PELO SQL EDITOR, APÓS TESTE COMPLETO
-- EM BEGIN...ROLLBACK (script separado, não implantado - ver
-- supabase/tests/fase7_dependencia_subconjunto_teste.sql). NÃO UTILIZAR
-- `supabase db push`.
--
-- Migration inteira em UMA transação - decisões de desenho (auditoria
-- de 2 rodadas com o usuário, antes de qualquer linha de código):
--
--   1. `ativo` NUNCA fica false silenciosamente - a interface só remove
--      um vínculo via deleted_at/deleted_by (nunca por ativo=false), e
--      o banco agora GARANTE isso com um CHECK incondicional
--      (ativo = true, sempre, em toda linha, viva ou removida) -
--      elimina de vez a possibilidade de "dois conceitos de remoção"
--      coexistirem na mesma tabela.
--   2. Campos de auditoria/identidade protegidos por trigger dedicado
--      (validar_atualizacao_dependencia_subconjunto, seção 3 abaixo):
--      created_by/empresa_id/bom_item_id imutáveis; remoção lógica
--      exige deleted_by=auth.uid() e não pode trocar bom_operacao_id no
--      mesmo UPDATE; troca de operação não pode tocar deleted_at/
--      deleted_by; restauração direta de linha removida é bloqueada
--      (recriar = novo vínculo, nunca reviver o antigo).
--   3. Índice único novo (mais forte) criado só depois de confirmar,
--      por leitura, que não há duplicidade de bom_item_id em vínculos
--      vivos - aborta com mensagem clara se houver, nunca escolhe uma
--      linha sozinho. Índice antigo (mais fraco, estritamente
--      subsumido pelo novo) só é removido depois que o novo já existe.
--   4. Nenhuma policy de DELETE físico é criada - remoção é sempre
--      UPDATE (deleted_at/deleted_by), permitida a quem criou o
--      vínculo OU a administrador - nunca "somente administrador".

begin;

-- =====================================================================
-- 1. ativo sempre true (CHECK incondicional - cobre INSERT e UPDATE,
--    sem precisar de trigger para esta parte)
-- =====================================================================

alter table public.bom_operacao_dependencias_subconjunto
  add constraint bom_operacao_dependencias_subconjunto_ativo_sempre_true_chk
  check (ativo = true);

comment on constraint bom_operacao_dependencias_subconjunto_ativo_sempre_true_chk
  on public.bom_operacao_dependencias_subconjunto is
  'A interface remove um vínculo exclusivamente via deleted_at/deleted_by - nunca via ativo=false. Este CHECK garante estruturalmente que ativo nunca varia (sempre true), para nunca existirem dois conceitos de "removido" na mesma tabela (decisão de desenho, Fase 7).';

-- =====================================================================
-- 2. Reindexação em 3 passos - checa duplicidade, cria o índice forte,
--    só depois remove o fraco (nunca escolhe uma linha sozinho)
-- =====================================================================

do $$
declare
  v_duplicados integer;
begin
  select count(*) into v_duplicados
  from (
    select empresa_id, bom_item_id
    from public.bom_operacao_dependencias_subconjunto
    where deleted_at is null
    group by empresa_id, bom_item_id
    having count(*) > 1
  ) d;

  if v_duplicados > 0 then
    raise exception 'Migration abortada: % bom_item_id(s) com mais de um vínculo vivo (mais de uma operação consumidora) - resolva manualmente qual vínculo deve permanecer antes de aplicar esta migration. Nenhuma linha foi escolhida automaticamente.', v_duplicados;
  end if;
end;
$$;

-- Índice forte: no máximo 1 operação consumidora por subconjunto
-- (decisão de negócio confirmada com o usuário) - estritamente mais
-- restritivo que o índice antigo (empresa_id, bom_operacao_id,
-- bom_item_id), que portanto passa a ser redundante.
create unique index bom_operacao_dependencias_subconjunto_item_vivo_uniq
  on public.bom_operacao_dependencias_subconjunto (empresa_id, bom_item_id)
  where deleted_at is null;

comment on index public.bom_operacao_dependencias_subconjunto_item_vivo_uniq is
  'No máximo 1 operação consumidora por subconjunto vivo (Fase 7) - subsume o índice (empresa_id, bom_operacao_id, bom_item_id) da Fase 6, removido logo abaixo.';

drop index public.bom_operacao_dependencias_subconjunto_par_vivo_uniq;

-- =====================================================================
-- 3. Trigger de integridade de auditoria/identidade (before update) -
--    complementar ao validar_dependencia_subconjunto da Fase 6, que
--    continua cuidando só da validade da operação/subconjunto
--    referenciados. Este trigger cuida da forma legítima de UPDATE na
--    própria linha do vínculo.
-- =====================================================================

create or replace function public.validar_atualizacao_dependencia_subconjunto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by não pode ser alterado.';
  end if;
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'empresa_id não pode ser alterado.';
  end if;
  if new.bom_item_id is distinct from old.bom_item_id then
    raise exception 'bom_item_id não pode ser alterado - para vincular outro subconjunto, crie um novo vínculo.';
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
  'Protege campos de auditoria/identidade e a forma legítima de UPDATE em bom_operacao_dependencias_subconjunto (Fase 7): created_by/empresa_id/bom_item_id/ativo imutáveis; remoção lógica exige deleted_by=auth.uid() sem trocar bom_operacao_id no mesmo UPDATE; troca de operação não pode tocar deleted_at/deleted_by; sem restauração direta; vínculo já removido é imutável. Complementar a validar_dependencia_subconjunto (Fase 6), que valida a operação/subconjunto referenciados.';

revoke execute on function public.validar_atualizacao_dependencia_subconjunto() from public, anon, authenticated;

drop trigger if exists bom_operacao_dependencias_subconjunto_validar_atualizacao on public.bom_operacao_dependencias_subconjunto;
create trigger bom_operacao_dependencias_subconjunto_validar_atualizacao
  before update on public.bom_operacao_dependencias_subconjunto
  for each row
  execute function public.validar_atualizacao_dependencia_subconjunto();

-- =====================================================================
-- 4. Policies de escrita (Fase 7) - mesmo padrão de bom_itens/
--    bom_operacoes (202607060001/202607060002), exceto que NÃO há
--    policy de DELETE: remoção é sempre UPDATE (deleted_at/deleted_by),
--    permitida a quem criou o vínculo OU a administrador - nunca
--    "somente administrador" (decisão de desenho, corrigindo a
--    primeira versão desta migration antes de aplicar).
-- =====================================================================

create policy "nexotfe bom operacao dependencias subconjunto insert mesma empresa"
  on public.bom_operacao_dependencias_subconjunto
  for insert
  to authenticated
  with check (
    empresa_id = public.empresa_atual_id()
    and created_by = auth.uid()
    and deleted_at is null
    and deleted_by is null
    and ativo = true
  );

create policy "nexotfe bom operacao dependencias subconjunto update mesma empresa"
  on public.bom_operacao_dependencias_subconjunto
  for update
  to authenticated
  using (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()))
  with check (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()));

commit;
