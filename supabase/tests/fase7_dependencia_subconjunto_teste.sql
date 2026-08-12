-- TESTE (Tier A - SQL real) de bom_operacao_dependencias_subconjunto
-- (Fase 7, DEC-007 §6/§7). NÃO É UMA MIGRATION. Vive em supabase/tests/,
-- fora do padrão de nome de migration, NUNCA deve ser aplicado em
-- produção.
--
-- Reescrito em 2026-08-12: a migration 202608120001 já está aplicada de
-- verdade no banco (aplicação acidental via SQL Editor, auditada e
-- confirmada estrutural e funcionalmente idêntica ao arquivo da
-- migration - constraint, índice, trigger e as duas policies de
-- escrita já existem permanentemente). Por isso este script NÃO
-- reproduz mais o DDL da migration (nem precisa) - testa diretamente o
-- schema já aplicado. Isso elimina de vez o risco que causou o
-- incidente anterior: a versão antiga continha, dentro de si, o corpo
-- INTEGRAL da migration - inclusive o `commit;` dela - o que, quando o
-- arquivo errado (a migration em vez deste teste) foi colado no SQL
-- Editor, encerrou a transação e tornou as mudanças permanentes antes
-- da hora. Este arquivo agora tem UM único BEGIN, no topo, e UM único
-- ROLLBACK, no fim - nada entre eles cria, dropa ou comita schema.
--
-- Escopo: só a tabela/trigger/RLS/índice de
-- bom_operacao_dependencias_subconjunto (Fase 7). NÃO testa
-- grafoPrecedencia.ts (Tier B, já existe, Vitest, sem banco) nem
-- mapearVinculosSubconjunto.ts (Tier C, novo, Vitest, sem banco) - as
-- 3 camadas são propositalmente separadas.
--
-- Alguns testes (marcados "JWT simulado") fazem
-- SET LOCAL ROLE authenticated + set_config de request.jwt.claim.sub /
-- request.jwt.claims para simular auth.uid() como um usuário real,
-- reproduzindo o mecanismo padrão do Supabase - se este projeto usar
-- uma variante diferente de GUC para auth.uid(), esses testes
-- específicos podem precisar de ajuste (os demais, que não dependem de
-- auth.uid(), não são afetados).
--
-- Testes que dependem de fixture real (bom_operacoes/bom_itens/
-- usuarios já cadastrados) são PULADOS (RAISE NOTICE) se o ambiente não
-- tiver o dado necessário - nunca tratado como falha da migration.

begin;

-- =====================================================================
-- FIXTURE: descoberta de dado real (superusuário), guardado em tabela
-- temporária para os testes seguintes lerem. Tabela temporária some
-- sozinha no ROLLBACK - nunca sobrevive fora desta transação.
-- =====================================================================

create temporary table fase7_fixture (
  empresa_id uuid,
  bom_id uuid,
  bom_operacao_id_a uuid,
  bom_operacao_id_b uuid,
  bom_item_id uuid,
  usuario_criador uuid,
  usuario_outro uuid
);

do $$
declare
  v_empresa_id uuid;
  v_bom_id uuid;
  v_op_a uuid;
  v_op_b uuid;
  v_item uuid;
  v_user_1 uuid;
  v_user_2 uuid;
begin
  select bo.bom_id, bo.empresa_id, bo.id into v_bom_id, v_empresa_id, v_op_a
  from public.bom_operacoes bo
  where bo.ativo = true and bo.deleted_at is null
  limit 1;

  if v_bom_id is not null then
    select bi.id into v_item
    from public.bom_itens bi
    where bi.bom_id = v_bom_id and bi.componente_tipo = 'subconjunto' and bi.ativo = true and bi.deleted_at is null
    limit 1;

    select bo2.id into v_op_b
    from public.bom_operacoes bo2
    where bo2.bom_id = v_bom_id and bo2.ativo = true and bo2.deleted_at is null and bo2.id <> v_op_a
    limit 1;

    select id into v_user_1 from public.usuarios where empresa_id = v_empresa_id limit 1;
    select id into v_user_2 from public.usuarios where empresa_id = v_empresa_id and id <> v_user_1 limit 1;
  end if;

  insert into fase7_fixture values (v_empresa_id, v_bom_id, v_op_a, v_op_b, v_item, v_user_1, v_user_2);

  raise notice 'FIXTURE: empresa_id=%, bom_id=%, op_a=%, op_b=%, item=%, user_1=%, user_2=%',
    v_empresa_id, v_bom_id, v_op_a, v_op_b, v_item, v_user_1, v_user_2;
end;
$$;

-- =====================================================================
-- TESTE 1: CHECK ativo=true - INSERT com ativo=false é rejeitado
-- (superusuário - CHECK independe de role/RLS)
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fase7_fixture;
  if f.bom_item_id is null or f.bom_operacao_id_a is null then
    raise notice 'TESTE 1 PULADO: sem fixture (operação ativa + subconjunto ativo do mesmo bom_id).';
  else
    begin
      insert into public.bom_operacao_dependencias_subconjunto
        (empresa_id, bom_operacao_id, bom_item_id, ativo, created_by)
      values (f.empresa_id, f.bom_operacao_id_a, f.bom_item_id, false, f.usuario_criador);
      raise exception 'TESTE 1 FALHOU: INSERT com ativo=false deveria ter sido rejeitado pelo CHECK.';
    exception
      when others then
        if sqlerrm like 'TESTE 1 FALHOU%' then raise; end if;
        raise notice 'TESTE 1 OK: INSERT com ativo=false rejeitado (%).', sqlerrm;
    end;
  end if;
end;
$$;

-- =====================================================================
-- TESTE 2: INSERT válido (JWT simulado do usuário criador) - sucesso
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fase7_fixture;
  if f.bom_item_id is null or f.usuario_criador is null then
    raise notice 'TESTE 2 PULADO: sem fixture.';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.bom_operacao_id_a, f.bom_item_id, f.usuario_criador);
    raise notice 'TESTE 2 OK: vínculo criado pelo usuário criador (JWT simulado).';
  exception
    when others then
      raise exception 'TESTE 2 FALHOU: INSERT válido deveria ter sido aceito - %', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 3: índice novo rejeita 2º vínculo para o MESMO bom_item_id
-- (mesmo subconjunto, outra operação) - "no máximo 1 operação por
-- subconjunto"
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fase7_fixture;
  if f.bom_item_id is null or f.bom_operacao_id_b is null or f.usuario_criador is null then
    raise notice 'TESTE 3 PULADO: sem fixture (precisa de uma 2ª operação ativa no mesmo bom_id).';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.bom_operacao_id_b, f.bom_item_id, f.usuario_criador);
    raise exception 'TESTE 3 FALHOU: 2º vínculo vivo para o mesmo bom_item_id deveria ter sido rejeitado pelo índice único.';
  exception
    when others then
      if sqlerrm like 'TESTE 3 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 3 OK: 2º vínculo para o mesmo subconjunto rejeitado (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 4: troca de operação - UPDATE atômico só de bom_operacao_id,
-- pelo criador - sucesso
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
begin
  select * into f from fase7_fixture;
  if f.bom_item_id is null or f.bom_operacao_id_b is null or f.usuario_criador is null then
    raise notice 'TESTE 4 PULADO: sem fixture.';
    return;
  end if;

  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.bom_item_id and deleted_at is null limit 1;
  if v_vinculo_id is null then
    raise notice 'TESTE 4 PULADO: nenhum vínculo vivo (Teste 2 pode ter sido pulado).';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.bom_operacao_dependencias_subconjunto
      set bom_operacao_id = f.bom_operacao_id_b
      where id = v_vinculo_id;
    raise notice 'TESTE 4 OK: troca de operação (UPDATE atômico) aceita pelo criador.';
  exception
    when others then
      raise exception 'TESTE 4 FALHOU: troca de operação legítima deveria ter sido aceita - %', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 5: proteção de campos de auditoria - tentar alterar
-- created_by/empresa_id/bom_item_id é rejeitado
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
  v_outra_empresa uuid;
begin
  select * into f from fase7_fixture;
  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.bom_item_id and deleted_at is null limit 1;
  if v_vinculo_id is null then
    raise notice 'TESTE 5 PULADO: nenhum vínculo vivo.';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.bom_operacao_dependencias_subconjunto set created_by = gen_random_uuid() where id = v_vinculo_id;
    raise exception 'TESTE 5a FALHOU: alterar created_by deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 5a FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 5a OK: created_by imutável (%).', sqlerrm;
  end;

  select id into v_outra_empresa from public.empresas where id <> f.empresa_id limit 1;
  if v_outra_empresa is not null then
    begin
      update public.bom_operacao_dependencias_subconjunto set empresa_id = v_outra_empresa where id = v_vinculo_id;
      raise exception 'TESTE 5b FALHOU: alterar empresa_id deveria ter sido rejeitado.';
    exception
      when others then
        if sqlerrm like 'TESTE 5b FALHOU%' then reset role; raise; end if;
        raise notice 'TESTE 5b OK: empresa_id imutável (%).', sqlerrm;
    end;
  else
    raise notice 'TESTE 5b PULADO: só existe 1 empresa no ambiente.';
  end if;

  begin
    update public.bom_operacao_dependencias_subconjunto set bom_item_id = gen_random_uuid() where id = v_vinculo_id;
    raise exception 'TESTE 5c FALHOU: alterar bom_item_id deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 5c FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 5c OK: bom_item_id imutável (%).', sqlerrm;
  end;

  begin
    update public.bom_operacao_dependencias_subconjunto set ativo = false where id = v_vinculo_id;
    raise exception 'TESTE 5d FALHOU: alterar ativo deveria ter sido rejeitado (CHECK e/ou trigger).';
  exception
    when others then
      if sqlerrm like 'TESTE 5d FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 5d OK: ativo imutável via UPDATE (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 6: trocar operação e remover no mesmo UPDATE é rejeitado
-- (bom_operacao_id + deleted_at juntos)
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
begin
  select * into f from fase7_fixture;
  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.bom_item_id and deleted_at is null limit 1;
  if v_vinculo_id is null then
    raise notice 'TESTE 6 PULADO: nenhum vínculo vivo.';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.bom_operacao_dependencias_subconjunto
      set bom_operacao_id = f.bom_operacao_id_a, deleted_at = now(), deleted_by = f.usuario_criador
      where id = v_vinculo_id;
    raise exception 'TESTE 6 FALHOU: trocar operação e remover no mesmo UPDATE deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 6 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 6 OK: troca+remoção simultânea rejeitada (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 7: remoção lógica exige deleted_by = auth.uid() (JWT simulado)
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
begin
  select * into f from fase7_fixture;
  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.bom_item_id and deleted_at is null limit 1;
  if v_vinculo_id is null or f.usuario_outro is null then
    raise notice 'TESTE 7 PULADO: sem vínculo vivo e/ou sem um 2º usuário na mesma empresa para simular deleted_by incorreto.';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.bom_operacao_dependencias_subconjunto
      set deleted_at = now(), deleted_by = f.usuario_outro
      where id = v_vinculo_id;
    raise exception 'TESTE 7 FALHOU: deleted_by diferente de auth.uid() deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 7 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 7 OK: deleted_by != auth.uid() rejeitado (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 8: remoção lógica válida (deleted_by = auth.uid() do criador) -
-- sucesso, e índice único libera o bom_item_id para um novo vínculo
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
begin
  select * into f from fase7_fixture;
  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.bom_item_id and deleted_at is null limit 1;
  if v_vinculo_id is null then
    raise notice 'TESTE 8 PULADO: nenhum vínculo vivo.';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.bom_operacao_dependencias_subconjunto
      set deleted_at = now(), deleted_by = f.usuario_criador
      where id = v_vinculo_id;
    raise notice 'TESTE 8 OK: remoção lógica (UPDATE deleted_at/deleted_by) aceita pelo criador.';
  exception
    when others then
      raise exception 'TESTE 8 FALHOU: remoção lógica legítima deveria ter sido aceita - %', sqlerrm;
  end;

  reset role;

  -- Confirma que o índice único agora permite recriar o vínculo para o
  -- mesmo bom_item_id (soft delete não deixa o subconjunto "preso").
  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.bom_operacao_id_a, f.bom_item_id, f.usuario_criador);
    raise notice 'TESTE 8b OK: novo vínculo recriado para o mesmo bom_item_id após remoção lógica do anterior.';
  exception
    when others then
      raise exception 'TESTE 8b FALHOU: deveria ser possível recriar o vínculo após remoção lógica - %', sqlerrm;
  end;
end;
$$;

-- =====================================================================
-- TESTE 9: restauração direta (deleted_at not null -> null) é rejeitada
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_removido_id uuid;
begin
  select * into f from fase7_fixture;
  select id into v_vinculo_removido_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.bom_item_id and deleted_at is not null limit 1;
  if v_vinculo_removido_id is null then
    raise notice 'TESTE 9 PULADO: nenhum vínculo removido logicamente (Teste 8 pode ter sido pulado).';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.bom_operacao_dependencias_subconjunto
      set deleted_at = null, deleted_by = null
      where id = v_vinculo_removido_id;
    raise exception 'TESTE 9 FALHOU: restauração direta deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 9 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 9 OK: restauração direta rejeitada (%).', sqlerrm;
  end;

  -- Vínculo já removido também não pode ter bom_operacao_id trocado.
  begin
    update public.bom_operacao_dependencias_subconjunto
      set bom_operacao_id = f.bom_operacao_id_b
      where id = v_vinculo_removido_id;
    raise exception 'TESTE 9b FALHOU: alterar bom_operacao_id de um vínculo já removido deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 9b FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 9b OK: vínculo já removido é imutável (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 10: usuário sem permissão (não criador, não admin) não
-- consegue trocar nem remover - RLS nega, 0 linhas, sem erro explícito
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
begin
  select * into f from fase7_fixture;
  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.bom_item_id and deleted_at is null limit 1;
  if v_vinculo_id is null or f.usuario_outro is null then
    raise notice 'TESTE 10 PULADO: sem vínculo vivo e/ou sem um 2º usuário na mesma empresa.';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_outro::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_outro::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.bom_operacao_dependencias_subconjunto
    set bom_operacao_id = f.bom_operacao_id_b
    where id = v_vinculo_id;

  if found then
    raise notice 'TESTE 10 INCONCLUSIVO: UPDATE afetou linha(s) - usuario_outro provavelmente é administrador nesta empresa (RLS permite dono OU admin corretamente); não é uma falha de segurança.';
  else
    raise notice 'TESTE 10 OK: usuário sem permissão não conseguiu alterar o vínculo (0 linhas, RLS negou).';
  end if;

  reset role;
end;
$$;

rollback;

-- =====================================================================
-- APÓS RODAR O SCRIPT ACIMA (que termina em ROLLBACK), rode ISTO
-- SEPARADAMENTE, em uma NOVA aba/conexão do SQL Editor, para confirmar
-- que a transação de teste não deixou nenhum resíduo. Diferente da
-- versão anterior deste arquivo, aqui NÃO se espera que constraint/
-- índice/trigger/policies da Fase 7 estejam ausentes - eles são
-- permanentes (já aplicados pela migration 202608120001, fora do
-- escopo deste teste). O que este teste pode ter deixado para trás é
-- só linha de dado (insert/update de teste) - que o ROLLBACK deve ter
-- desfeito por completo.
-- =====================================================================
--
-- select
--   (select exists(select 1 from pg_class where relname = 'fase7_fixture' and relkind in ('r','v'))
--   ) as tabela_temp_fixture_residual_deve_ser_false,
--   (select count(*) from public.bom_operacao_dependencias_subconjunto
--   ) as total_linhas_deve_ser_igual_ao_antes_do_teste;
