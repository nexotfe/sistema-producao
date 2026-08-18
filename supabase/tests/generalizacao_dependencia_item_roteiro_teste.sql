-- TESTE (Tier A - SQL real) da generalização de
-- bom_operacao_dependencias_subconjunto para materia_prima
-- (202608180001). NÃO É UMA MIGRATION.
--
-- MODO PÓS-APLICAÇÃO: pressupõe que 202608180001_generalizar_dependencia_item_roteiro.sql
-- JÁ foi aplicada (transação própria, com commit, feita separadamente).
-- Este script NUNCA embute o DDL da migration aqui dentro - mesmo motivo
-- documentado no incidente da Fase 7: uma versão anterior de um arquivo
-- de teste continha o DDL completo (inclusive um commit próprio) dentro
-- do que deveria ser só um teste, e colar o arquivo errado no SQL Editor
-- tornou mudanças permanentes antes da hora. Este arquivo tem UM único
-- BEGIN no topo e UM único ROLLBACK no fim - nada entre eles cria,
-- dropa ou comita schema.
--
-- Existe também um MODO PRÉ-APLICAÇÃO, separado, gerado mecanicamente
-- (nunca copiado à mão, nunca deixado dentro do repositório) a partir
-- deste mesmo arquivo + da migration real - ver
-- supabase/tests/gerar_teste_pre_aplicacao.sh.
--
-- IDENTIDADE SIMULADA - CONFIRMADA DIRETO NO BANCO REAL (leitura, em
-- 2026-08-18), depois que a 1ª versão deste arquivo errou ao se basear em
-- supabase/baseline/002_security.sql - baseline que NÃO corresponde ao
-- schema realmente aplicado (profiles existe de verdade e é a fonte
-- PRIMÁRIA hoje, ao contrário do que 015_validate.sql, também
-- aspiracional, sugeria). Nunca mais presumido - o que segue é o que
-- pg_get_functiondef() devolveu de verdade:
--
--   empresa_atual_id() = COALESCE(
--     (select empresa_id from public.profiles where id = auth.uid() and ativo = true),
--     (select empresa_id from public.usuarios where id = auth.uid())
--   )
--   usuario_e_admin() = EXISTS(
--     select 1 from public.profiles
--     where id = auth.uid() and empresa_id = empresa_atual_id()
--       and nivel_acesso = 'admin' and ativo = true
--   ) -- só profiles; usuarios NUNCA entra nesta checagem, mesmo tendo
--        sua própria coluna nivel_acesso (não lida aqui).
--
-- Mapeamento auth.uid(): tanto public.usuarios.id QUANTO public.profiles.id
-- são FK direta para auth.users(id) ON DELETE CASCADE - NÃO existe coluna
-- auth_user_id em nenhuma das duas tabelas. Toda simulação de JWT neste
-- arquivo usa profiles.id diretamente (a fonte que usuario_e_admin()
-- realmente lê).
--
-- Enum nivel_acesso (public.profiles.nivel_acesso, confirmado via
-- pg_enum): 'admin', 'gestor', 'operador', 'leitura' - só 'admin' passa
-- em usuario_e_admin(); os outros 3 são igualmente não-admin.
--
-- USUÁRIO SEM PERMISSÃO - padrão de rebaixamento temporário (nunca
-- criação sintética): nenhuma empresa real do ambiente investigado tem
-- naturalmente um perfil não-admin ao lado de um admin (os 2 perfis
-- ativos encontrados na única empresa com >=2 são ambos 'admin') - por
-- isso o rebaixamento é necessário de verdade, não só uma opção teórica.
-- Reaproveita um SEGUNDO profile real e ativo da mesma empresa, rebaixa
-- nivel_acesso para 'operador' (valor real do enum - é inclusive o
-- DEFAULT da coluna) dentro desta mesma transação, e CONFIRMA via as
-- próprias functions (empresa_atual_id() e usuario_e_admin(), nunca
-- presumido) que o rebaixamento teve o efeito esperado nos 2 sentidos
-- exigidos, antes de aceitar esse usuário como controle negativo. O
-- ROLLBACK final restaura nivel_acesso - nenhuma restauração manual é
-- feita ou necessária.
--
-- PRÉ-CHECAGEM DE FIXTURES: um bloco dedicado, só leitura (exceto o
-- rebaixamento acima, que já aconteceu na fixture), roda logo depois da
-- fixture e ANTES de qualquer um dos 24 testes numerados - se qualquer
-- fixture essencial estiver ausente, o script INTEIRO aborta ali, com
-- mensagem listando exatamente o que falta e quais testes seriam
-- afetados. Nenhum dos 24 testes numerados abaixo contém mais um
-- caminho "PULADO" - todos rodam de verdade sempre que a pré-checagem
-- passar (e se a pré-checagem falhar, o script inteiro falha, nunca
-- termina "aprovado" com testes faltando silenciosamente).
--
-- Escopo: só o schema (tabela/trigger/CHECK/índices/RLS) desta migration.
-- Não testa grafoPrecedencia.ts (leitura plural dos vínculos - Tier B,
-- Vitest, sem banco) nem a regra "subconjunto considerado pronto por
-- padrão" (Tier C, aplicação, ainda não implementada - ver nota
-- conceitual no fim deste arquivo).

begin;

-- =====================================================================
-- TESTE 1: guarda de sanidade - a migration 202608180001 precisa estar
-- aplicada (ou, em modo pré-aplicação, o DDL gerado mecanicamente
-- precisa ter rodado com sucesso) antes de qualquer teste abaixo rodar.
-- =====================================================================
do $$
declare
  v_coluna_existe boolean;
  v_coluna_not_null boolean;
  v_indice_subconjunto_existe boolean;
  v_indice_materia_prima_existe boolean;
  v_indice_antigo_existe boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bom_operacao_dependencias_subconjunto' and column_name = 'componente_tipo'
  ) into v_coluna_existe;

  if not v_coluna_existe then
    raise exception 'TESTE 1 FALHOU: coluna componente_tipo não existe - a migration 202608180001 precisa ter rodado (aplicada de verdade, ou como DDL gerado mecanicamente no modo pré-aplicação) antes deste script.';
  end if;

  select is_nullable = 'NO' into v_coluna_not_null
  from information_schema.columns
  where table_schema = 'public' and table_name = 'bom_operacao_dependencias_subconjunto' and column_name = 'componente_tipo';

  if not v_coluna_not_null then
    raise exception 'TESTE 1 FALHOU: componente_tipo existe mas ainda aceita nulo - migration 202608180001 parece ter rodado só parcialmente (passo 8 não rodou).';
  end if;

  select exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'bom_operacao_dependencias_subconjunto_1_por_subconjunto_uniq') into v_indice_subconjunto_existe;
  select exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'bom_operacao_dependencias_subconjunto_par_materia_prima_uniq') into v_indice_materia_prima_existe;
  select exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'bom_operacao_dependencias_subconjunto_item_vivo_uniq') into v_indice_antigo_existe;

  if not v_indice_subconjunto_existe or not v_indice_materia_prima_existe then
    raise exception 'TESTE 1 FALHOU: um ou os dois índices parciais novos não existem - migration 202608180001 parece ter rodado só parcialmente (passo 6 não rodou).';
  end if;

  if v_indice_antigo_existe then
    raise exception 'TESTE 1 FALHOU: o índice antigo (item_vivo_uniq) ainda existe - migration 202608180001 parece ter rodado só parcialmente (passo 7 não rodou).';
  end if;

  raise notice 'TESTE 1 OK: DDL de 202608180001 presente por completo (coluna NOT NULL, índices novos presentes, índice antigo ausente).';
end;
$$;

-- =====================================================================
-- FIXTURE
-- =====================================================================

create temporary table fixture_generalizacao (
  empresa_id uuid,
  bom_id uuid,
  op_a uuid,
  op_b uuid,
  op_spare uuid,
  item_subconjunto uuid,
  item_materia_prima_1 uuid,
  item_materia_prima_2 uuid,
  item_spare uuid,
  op_outro_bom uuid,
  empresa_outra uuid,
  op_outra_empresa uuid,
  usuario_criador uuid,          -- profiles.id (= auth.uid() direto, FK para auth.users)
  usuario_sem_permissao uuid     -- profiles.id do usuário rebaixado e CONFIRMADO não-admin
);

do $$
declare
  v_empresa_id uuid;
  v_bom_id uuid;
  v_op_a uuid;
  v_op_b uuid;
  v_op_spare uuid;
  v_item_sub uuid;
  v_item_mp1 uuid;
  v_item_mp2 uuid;
  v_item_spare uuid;
  v_op_outro_bom uuid;
  v_empresa_outra uuid;
  v_op_outra_empresa uuid;
  v_usuario_criador uuid;
  v_candidato_id uuid;
  v_empresa_simulada uuid;
  v_eh_admin boolean;
begin
  -- A empresa/bom_id candidato precisa satisfazer TODOS os requisitos
  -- estruturais ao mesmo tempo, coordenados numa única seleção - versões
  -- anteriores verificavam "roteiro ativo E >=2 profiles" (independentes
  -- um do outro) e depois só "existe subconjunto/matéria-prima ativa"
  -- (sem considerar se JÁ tinha vínculo vivo hoje - achado real na 4ª
  -- tentativa: o único subconjunto do bom_id sorteado já estava
  -- ocupado). Agora exige, no MESMO bom_id: >=3 operações ativas, >=1
  -- subconjunto ativo SEM vínculo vivo, >=3 matérias-primas ativas SEM
  -- vínculo vivo - e que a empresa tenha >=2 profiles ativos. "Sem
  -- vínculo vivo" = NOT EXISTS uma linha em
  -- bom_operacao_dependencias_subconjunto (deleted_at is null) para
  -- aquele bom_item_id - nunca conta um item já consumido por um
  -- vínculo real de produção.
  with candidatos as (
    select bo.bom_id, bo.empresa_id, count(*) as qtd_ops_ativas
    from public.bom_operacoes bo
    where bo.ativo = true and bo.deleted_at is null
    group by bo.bom_id, bo.empresa_id
    having count(*) >= 3
  )
  select c.bom_id, c.empresa_id into v_bom_id, v_empresa_id
  from candidatos c
  where c.empresa_id in (
    select empresa_id from public.profiles where ativo = true group by empresa_id having count(*) >= 2
  )
  and (
    select count(*) from public.bom_itens bi
    where bi.bom_id = c.bom_id and bi.componente_tipo = 'subconjunto' and bi.ativo = true and bi.deleted_at is null
      and not exists (
        select 1 from public.bom_operacao_dependencias_subconjunto d
        where d.bom_item_id = bi.id and d.deleted_at is null
      )
  ) >= 1
  and (
    select count(*) from public.bom_itens bi2
    where bi2.bom_id = c.bom_id and bi2.componente_tipo = 'materia_prima' and bi2.ativo = true and bi2.deleted_at is null
      and not exists (
        select 1 from public.bom_operacao_dependencias_subconjunto d2
        where d2.bom_item_id = bi2.id and d2.deleted_at is null
      )
  ) >= 3
  order by c.bom_id
  limit 1;

  if v_bom_id is not null then
    select bi.id into v_item_sub
    from public.bom_itens bi
    where bi.bom_id = v_bom_id and bi.componente_tipo = 'subconjunto' and bi.ativo = true and bi.deleted_at is null
      and not exists (
        select 1 from public.bom_operacao_dependencias_subconjunto d
        where d.bom_item_id = bi.id and d.deleted_at is null
      )
    order by bi.id
    limit 1;

    select bi.id into v_item_mp1
    from public.bom_itens bi
    where bi.bom_id = v_bom_id and bi.componente_tipo = 'materia_prima' and bi.ativo = true and bi.deleted_at is null
      and not exists (
        select 1 from public.bom_operacao_dependencias_subconjunto d
        where d.bom_item_id = bi.id and d.deleted_at is null
      )
    order by bi.id
    limit 1;

    select bi.id into v_item_mp2
    from public.bom_itens bi
    where bi.bom_id = v_bom_id and bi.componente_tipo = 'materia_prima' and bi.ativo = true and bi.deleted_at is null
      and bi.id <> coalesce(v_item_mp1, '00000000-0000-0000-0000-000000000000'::uuid)
      and not exists (
        select 1 from public.bom_operacao_dependencias_subconjunto d
        where d.bom_item_id = bi.id and d.deleted_at is null
      )
    order by bi.id
    limit 1;

    select bi.id into v_item_spare
    from public.bom_itens bi
    where bi.bom_id = v_bom_id and bi.componente_tipo = 'materia_prima' and bi.ativo = true and bi.deleted_at is null
      and bi.id not in (coalesce(v_item_sub, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(v_item_mp1, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(v_item_mp2, '00000000-0000-0000-0000-000000000000'::uuid))
      and not exists (
        select 1 from public.bom_operacao_dependencias_subconjunto d
        where d.bom_item_id = bi.id and d.deleted_at is null
      )
    order by bi.id
    limit 1;

    select bo1.id into v_op_a
    from public.bom_operacoes bo1
    where bo1.bom_id = v_bom_id and bo1.ativo = true and bo1.deleted_at is null
    order by bo1.id
    limit 1;

    select bo2.id into v_op_b
    from public.bom_operacoes bo2
    where bo2.bom_id = v_bom_id and bo2.ativo = true and bo2.deleted_at is null and bo2.id <> v_op_a
    order by bo2.id
    limit 1;

    select bo2b.id into v_op_spare
    from public.bom_operacoes bo2b
    where bo2b.bom_id = v_bom_id and bo2b.ativo = true and bo2b.deleted_at is null
      and bo2b.id not in (v_op_a, coalesce(v_op_b, '00000000-0000-0000-0000-000000000000'::uuid))
    order by bo2b.id
    limit 1;

    select bo3.id into v_op_outro_bom
    from public.bom_operacoes bo3
    where bo3.empresa_id = v_empresa_id and bo3.ativo = true and bo3.deleted_at is null and bo3.bom_id <> v_bom_id
    limit 1;

    -- profiles.id do criador - é o valor que realmente compara igual a
    -- auth.uid() (FK direta para auth.users, sem coluna intermediária).
    select p.id into v_usuario_criador
    from public.profiles p
    where p.empresa_id = v_empresa_id and p.ativo = true
    limit 1;

    -- Candidato a rebaixamento: um SEGUNDO profile real, ativo, mesma
    -- empresa, diferente do criador.
    select p2.id into v_candidato_id
    from public.profiles p2
    where p2.empresa_id = v_empresa_id and p2.ativo = true
      and p2.id is distinct from v_usuario_criador
    limit 1;
  end if;

  select bo5.empresa_id, bo5.id into v_empresa_outra, v_op_outra_empresa
  from public.bom_operacoes bo5
  where bo5.ativo = true and bo5.deleted_at is null and bo5.empresa_id <> coalesce(v_empresa_id, '00000000-0000-0000-0000-000000000000'::uuid)
  limit 1;

  -- Rebaixamento temporário (padrão pedido: reaproveitar profile real -
  -- nunca criar um sintético). ROLLBACK no fim deste arquivo restaura
  -- profiles.nivel_acesso - nenhuma restauração manual é feita aqui.
  if v_candidato_id is not null then
    update public.profiles set nivel_acesso = 'operador' where id = v_candidato_id;

    -- CONFIRMA, com as MESMAS functions que as policies realmente usam
    -- (nunca presumido): a empresa continua resolvendo corretamente E o
    -- usuário deixou de ser admin, nos 2 sentidos exigidos.
    perform set_config('request.jwt.claim.sub', v_candidato_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_candidato_id::text, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select public.empresa_atual_id(), public.usuario_e_admin() into v_empresa_simulada, v_eh_admin;
    reset role;

    if v_empresa_simulada is distinct from v_empresa_id then
      raise notice 'FIXTURE: descartando candidato a usuario_sem_permissao - empresa_atual_id() simulado = % (esperado %). usuario_sem_permissao ficará nulo; a pré-checagem abaixo vai FALHAR explicitamente, nunca ficar PULADO/INCONCLUSIVO.', v_empresa_simulada, v_empresa_id;
      v_candidato_id := null;
    elsif v_eh_admin is true then
      raise notice 'FIXTURE: descartando candidato a usuario_sem_permissao - usuario_e_admin() continua true após nivel_acesso=operador (inesperado - investigar antes de reusar este ambiente). usuario_sem_permissao ficará nulo; a pré-checagem abaixo vai FALHAR explicitamente, nunca ficar PULADO/INCONCLUSIVO.';
      v_candidato_id := null;
    else
      raise notice 'FIXTURE: profile (id=%) rebaixado para nivel_acesso=operador dentro desta transação - CONFIRMADO empresa_atual_id()=% e usuario_e_admin()=false.', v_candidato_id, v_empresa_simulada;
    end if;
  end if;

  insert into fixture_generalizacao values (
    v_empresa_id, v_bom_id, v_op_a, v_op_b, v_op_spare,
    v_item_sub, v_item_mp1, v_item_mp2, v_item_spare,
    v_op_outro_bom, v_empresa_outra, v_op_outra_empresa,
    v_usuario_criador, v_candidato_id
  );

  raise notice 'FIXTURE: empresa_id=%, bom_id=%, op_a=%, op_b=%, op_spare=%, item_subconjunto=%, item_mp1=%, item_mp2=%, item_spare=%, op_outro_bom=%, empresa_outra=%, op_outra_empresa=%, usuario_criador(profiles.id)=%, usuario_sem_permissao(profiles.id)=%',
    v_empresa_id, v_bom_id, v_op_a, v_op_b, v_op_spare, v_item_sub, v_item_mp1, v_item_mp2, v_item_spare, v_op_outro_bom, v_empresa_outra, v_op_outra_empresa, v_usuario_criador, v_candidato_id;
end;
$$;

-- =====================================================================
-- PRÉ-CHECAGEM DE FIXTURES (gate, somente leitura) - roda ANTES de
-- qualquer um dos 24 testes numerados. Se QUALQUER fixture essencial
-- estiver ausente, aborta o script INTEIRO aqui, listando exatamente o
-- que falta e quais testes seriam afetados - os testes 3-24 abaixo NÃO
-- têm mais nenhum caminho "PULADO" individual; ou a pré-checagem passa
-- e todos os 24 rodam de verdade, ou o script inteiro falha aqui.
-- =====================================================================
do $$
declare
  f record;
  v_faltando text[] := array[]::text[];
  v_qtd_empresas integer;
begin
  select * into f from fixture_generalizacao;
  select count(*) into v_qtd_empresas from public.empresas;

  if f.empresa_id is null or f.bom_id is null then
    v_faltando := array_append(v_faltando, 'bom_id/empresa_id (nenhuma bom_operacoes ativa encontrada) - afeta TODOS os Testes 3-24');
  end if;
  if f.op_a is null then
    v_faltando := array_append(v_faltando, 'op_a - afeta Testes 3,5,7,8,10,13,15,16,17,18,21,22,23');
  end if;
  if f.op_b is null then
    v_faltando := array_append(v_faltando, 'op_b (2ª operação ativa no mesmo bom_id) - afeta Testes 4,6,9,22');
  end if;
  if f.op_spare is null then
    v_faltando := array_append(v_faltando, 'op_spare (3ª operação ativa no mesmo bom_id, distinta de op_a/op_b) - afeta Testes 19,20');
  end if;
  if f.item_subconjunto is null then
    v_faltando := array_append(v_faltando, 'item_subconjunto (bom_itens ativo, componente_tipo=subconjunto, mesmo bom_id) - afeta Testes 3,4,9,10,11,12,13,14');
  end if;
  if f.item_materia_prima_1 is null then
    v_faltando := array_append(v_faltando, 'item_materia_prima_1 (bom_itens ativo, componente_tipo=materia_prima, mesmo bom_id) - afeta Testes 5,6,7,15,16,19,20,21,22,23');
  end if;
  if f.item_materia_prima_2 is null then
    v_faltando := array_append(v_faltando, 'item_materia_prima_2 (2ª matéria-prima ativa no mesmo bom_id) - afeta Teste 8');
  end if;
  if f.item_spare is null then
    v_faltando := array_append(v_faltando, 'item_spare (item ativo de sobra no mesmo bom_id, distinto dos 3 acima) - afeta Testes 17,18');
  end if;
  if f.op_outro_bom is null then
    v_faltando := array_append(v_faltando, 'op_outro_bom (operação ativa em OUTRO bom_id, mesma empresa) - afeta Teste 15');
  end if;
  if f.op_outra_empresa is null then
    v_faltando := array_append(v_faltando, 'op_outra_empresa (operação ativa em OUTRA empresa) - afeta Teste 16');
  end if;
  if v_qtd_empresas < 2 then
    v_faltando := array_append(v_faltando, format('pelo menos 2 empresas cadastradas (encontradas: %s) - afeta Teste 10b (empresa_id imutável)', v_qtd_empresas));
  end if;
  if f.usuario_criador is null then
    v_faltando := array_append(v_faltando, 'usuario_criador (profiles.id ativo na empresa da fixture) - afeta TODOS os Testes 3-24');
  end if;
  if f.usuario_sem_permissao is null then
    v_faltando := array_append(v_faltando, 'usuario_sem_permissao (2º usuário real da mesma empresa, rebaixado e CONFIRMADO não-admin - ver mensagens FIXTURE acima para o motivo exato) - afeta Testes 12,22,23');
  end if;

  if array_length(v_faltando, 1) > 0 then
    raise exception 'PRÉ-CHECAGEM FALHOU: % fixture(s) essencial(is) ausente(s) neste ambiente - script abortado ANTES de qualquer teste numerado. Detalhe: %', array_length(v_faltando, 1), array_to_string(v_faltando, ' || ');
  end if;

  raise notice 'PRÉ-CHECAGEM OK: todas as fixtures essenciais presentes - os 24 testes abaixo vão rodar de verdade, nenhum deveria ficar PULADO.';
end;
$$;

-- =====================================================================
-- TESTE 2: backfill - toda linha VIVA existente tem componente_tipo
-- preenchido e batendo com o valor real em bom_itens.
-- =====================================================================
do $$
declare
  v_divergentes integer;
begin
  select count(*) into v_divergentes
  from public.bom_operacao_dependencias_subconjunto d
  join public.bom_itens bi on bi.id = d.bom_item_id
  where d.componente_tipo is distinct from bi.componente_tipo;

  if v_divergentes > 0 then
    raise exception 'TESTE 2 FALHOU: % linha(s) com componente_tipo divergente do valor real em bom_itens - backfill incorreto.', v_divergentes;
  else
    raise notice 'TESTE 2 OK: componente_tipo de toda linha existente bate com bom_itens.componente_tipo.';
  end if;
end;
$$;

-- =====================================================================
-- TESTE 3: subconjunto - INSERT válido (1º vínculo vivo) - sucesso
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fixture_generalizacao;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.op_a, f.item_subconjunto, f.usuario_criador);
    raise notice 'TESTE 3 OK: vínculo de subconjunto criado; componente_tipo foi resolvido pelo trigger (não enviado no INSERT).';
  exception
    when others then
      raise exception 'TESTE 3 FALHOU: INSERT válido de subconjunto deveria ter sido aceito - %', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 4: subconjunto - 2º vínculo vivo do MESMO subconjunto (outra
-- operação) - rejeitado pelo índice parcial de subconjunto.
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fixture_generalizacao;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.op_b, f.item_subconjunto, f.usuario_criador);
    raise exception 'TESTE 4 FALHOU: 2º vínculo vivo do mesmo subconjunto deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 4 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 4 OK: 2º vínculo do mesmo subconjunto rejeitado (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 5: matéria-prima - INSERT válido (1ª operação consumidora) -
-- sucesso
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fixture_generalizacao;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.op_a, f.item_materia_prima_1, f.usuario_criador);
    raise notice 'TESTE 5 OK: vínculo de matéria-prima criado (1ª operação consumidora).';
  exception
    when others then
      raise exception 'TESTE 5 FALHOU: INSERT válido de matéria-prima deveria ter sido aceito - %', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 6: matéria-prima - 2º vínculo vivo do MESMO item, OUTRA
-- operação - ACEITO (cardinalidade N, diferente do subconjunto - Teste 4).
-- Confirma explicitamente: matéria-prima PODE ter vínculos com várias
-- operações diferentes.
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fixture_generalizacao;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.op_b, f.item_materia_prima_1, f.usuario_criador);
    raise notice 'TESTE 6 OK: 2º vínculo vivo da MESMA matéria-prima, outra operação - aceito (ramo paralelo revisado).';
  exception
    when others then
      raise exception 'TESTE 6 FALHOU: matéria-prima com 2 operações consumidoras vivas deveria ser permitido - %', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 7: matéria-prima - par (item, operação) DUPLICADO - rejeitado
-- pelo índice parcial de matéria-prima. Confirma explicitamente: nunca
-- duplicar o MESMO par vivo, mesmo com cardinalidade N permitida.
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fixture_generalizacao;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.op_a, f.item_materia_prima_1, f.usuario_criador);
    raise exception 'TESTE 7 FALHOU: par (item, operação) duplicado deveria ter sido rejeitado (já inserido no Teste 5).';
  exception
    when others then
      if sqlerrm like 'TESTE 7 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 7 OK: par (item, operação) duplicado rejeitado (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 8: matérias-primas DIFERENTES usando a MESMA operação - ambas
-- aceitas (o índice é por item, nunca por operação).
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fixture_generalizacao;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.op_a, f.item_materia_prima_2, f.usuario_criador);
    raise notice 'TESTE 8 OK: matéria-prima diferente vinculada à mesma operação de outra matéria-prima - aceito.';
  exception
    when others then
      raise exception 'TESTE 8 FALHOU: matérias-primas diferentes compartilhando a mesma operação consumidora deveria ser permitido - %', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 9: troca de operação (UPDATE atômico só de bom_operacao_id) -
-- sucesso
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
begin
  select * into f from fixture_generalizacao;
  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.item_subconjunto and deleted_at is null limit 1;
  if v_vinculo_id is null then
    raise exception 'TESTE 9: nenhum vínculo vivo de subconjunto encontrado apesar da pré-checagem ter passado (dependência do Teste 3) - inconsistência interna, investigar.';
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.bom_operacao_dependencias_subconjunto
      set bom_operacao_id = f.op_b
      where id = v_vinculo_id;
    raise notice 'TESTE 9 OK: troca de operação (UPDATE atômico) aceita.';
  exception
    when others then
      raise exception 'TESTE 9 FALHOU: troca de operação legítima deveria ter sido aceita - %', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 10: campos imutáveis - created_by/empresa_id/bom_item_id/
-- componente_tipo/ativo rejeitados. componente_tipo agora rejeitado de
-- forma EXPLÍCITA por validar_dependencia_subconjunto (corrigido - antes
-- dependia implicitamente da ordem de triggers e nunca disparava de
-- verdade).
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
  v_outra_empresa uuid;
begin
  select * into f from fixture_generalizacao;
  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.item_subconjunto and deleted_at is null limit 1;
  if v_vinculo_id is null then
    raise exception 'TESTE 10: nenhum vínculo vivo de subconjunto encontrado apesar da pré-checagem ter passado - inconsistência interna, investigar.';
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.bom_operacao_dependencias_subconjunto set created_by = gen_random_uuid() where id = v_vinculo_id;
    raise exception 'TESTE 10a FALHOU: alterar created_by deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 10a FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 10a OK: created_by imutável (%).', sqlerrm;
  end;

  -- CORREÇÃO (revisão integral pós-4ª tentativa): a "outra empresa" NUNCA
  -- é descoberta aqui - já estamos sob role authenticated (simulando
  -- f.usuario_criador desde o Teste 10a) e public.empresas tem RLS
  -- restringindo SELECT à própria empresa (empresa_id = empresa_atual_id()).
  -- Uma consulta aqui veria 0 linhas mesmo com 2+ empresas reais no banco -
  -- não é ausência de dado, é RLS corretamente ocultando outro tenant do
  -- usuário simulado. f.empresa_outra já foi descoberta na fixture, em
  -- contexto administrativo, antes de qualquer troca de papel - reusada
  -- aqui como atribuição pura, nunca uma nova consulta sob authenticated.
  v_outra_empresa := f.empresa_outra;
  if v_outra_empresa is null then
    reset role;
    raise exception 'TESTE 10b: f.empresa_outra nula apesar da pré-checagem ter passado (implícito em op_outra_empresa) - inconsistência interna, investigar.';
  end if;
  begin
    update public.bom_operacao_dependencias_subconjunto set empresa_id = v_outra_empresa where id = v_vinculo_id;
    raise exception 'TESTE 10b FALHOU: alterar empresa_id deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 10b FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 10b OK: empresa_id imutável (%).', sqlerrm;
  end;

  begin
    update public.bom_operacao_dependencias_subconjunto set bom_item_id = gen_random_uuid() where id = v_vinculo_id;
    raise exception 'TESTE 10c FALHOU: alterar bom_item_id deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 10c FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 10c OK: bom_item_id imutável (%).', sqlerrm;
  end;

  begin
    update public.bom_operacao_dependencias_subconjunto set componente_tipo = 'materia_prima' where id = v_vinculo_id;
    raise exception 'TESTE 10d FALHOU: alterar componente_tipo deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 10d FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 10d OK: componente_tipo imutável (%) - rejeição explícita, não mais mascarada pela ordem de triggers.', sqlerrm;
  end;

  begin
    update public.bom_operacao_dependencias_subconjunto set ativo = false where id = v_vinculo_id;
    raise exception 'TESTE 10e FALHOU: alterar ativo deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 10e FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 10e OK: ativo imutável via UPDATE (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 11: trocar operação e remover no mesmo UPDATE - rejeitado
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
begin
  select * into f from fixture_generalizacao;
  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.item_subconjunto and deleted_at is null limit 1;
  if v_vinculo_id is null then
    raise exception 'TESTE 11: nenhum vínculo vivo de subconjunto encontrado apesar da pré-checagem ter passado - inconsistência interna, investigar.';
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.bom_operacao_dependencias_subconjunto
      set bom_operacao_id = f.op_a, deleted_at = now(), deleted_by = f.usuario_criador
      where id = v_vinculo_id;
    raise exception 'TESTE 11 FALHOU: trocar operação e remover no mesmo UPDATE deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 11 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 11 OK: troca+remoção simultânea rejeitada (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 12: remoção lógica exige deleted_by = auth.uid()
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
begin
  select * into f from fixture_generalizacao;
  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.item_subconjunto and deleted_at is null limit 1;
  if v_vinculo_id is null then
    raise exception 'TESTE 12: nenhum vínculo vivo de subconjunto encontrado apesar da pré-checagem ter passado - inconsistência interna, investigar.';
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.bom_operacao_dependencias_subconjunto
      set deleted_at = now(), deleted_by = f.usuario_sem_permissao
      where id = v_vinculo_id;
    raise exception 'TESTE 12 FALHOU: deleted_by diferente de auth.uid() deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 12 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 12 OK: deleted_by != auth.uid() rejeitado (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 13: remoção lógica válida + recriação (índice novo libera o
-- item para um novo vínculo, mesmo comportamento da Fase 7)
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
begin
  select * into f from fixture_generalizacao;
  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.item_subconjunto and deleted_at is null limit 1;
  if v_vinculo_id is null then
    raise exception 'TESTE 13: nenhum vínculo vivo de subconjunto encontrado apesar da pré-checagem ter passado - inconsistência interna, investigar.';
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.bom_operacao_dependencias_subconjunto
      set deleted_at = now(), deleted_by = f.usuario_criador
      where id = v_vinculo_id;
    raise notice 'TESTE 13a OK: remoção lógica aceita.';
  exception
    when others then
      raise exception 'TESTE 13a FALHOU: remoção lógica legítima deveria ter sido aceita - %', sqlerrm;
  end;

  reset role;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.op_a, f.item_subconjunto, f.usuario_criador);
    raise notice 'TESTE 13b OK: novo vínculo recriado para o mesmo bom_item_id após remoção lógica do anterior.';
  exception
    when others then
      raise exception 'TESTE 13b FALHOU: deveria ser possível recriar o vínculo após remoção lógica - %', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 14: restauração direta (deleted_at not null -> null) rejeitada
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_removido_id uuid;
begin
  select * into f from fixture_generalizacao;
  select id into v_vinculo_removido_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.item_subconjunto and deleted_at is not null limit 1;
  if v_vinculo_removido_id is null then
    raise exception 'TESTE 14: nenhum vínculo removido logicamente encontrado apesar da pré-checagem ter passado (dependência do Teste 13) - inconsistência interna, investigar.';
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.bom_operacao_dependencias_subconjunto
      set deleted_at = null, deleted_by = null
      where id = v_vinculo_removido_id;
    raise exception 'TESTE 14 FALHOU: restauração direta deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 14 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 14 OK: restauração direta rejeitada (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 15: item e operação de BOMs (roteiros) DIFERENTES - rejeitado
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fixture_generalizacao;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.op_outro_bom, f.item_materia_prima_1, f.usuario_criador);
    raise exception 'TESTE 15 FALHOU: item e operação de bom_id diferentes deveriam ter sido rejeitados.';
  exception
    when others then
      if sqlerrm like 'TESTE 15 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 15 OK: item e operação de roteiros diferentes rejeitados (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 16: item e operação de EMPRESAS diferentes - rejeitado (FK
-- composta bom_operacao_id+empresa_id não encontra correspondência)
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fixture_generalizacao;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.op_outra_empresa, f.item_materia_prima_1, f.usuario_criador);
    raise exception 'TESTE 16 FALHOU: operação de outra empresa (empresa_id do vínculo != empresa real da operação) deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 16 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 16 OK: item e operação de empresas diferentes rejeitados (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 17: bom_item INATIVO (ativo=false) - rejeitado. Usa um item de
-- sobra (nunca op_a/op_b/item_subconjunto/item_mp1/item_mp2, usados por
-- outros testes), temporariamente marcado inativo (ROLLBACK final
-- desfaz).
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fixture_generalizacao;

  update public.bom_itens set ativo = false where id = f.item_spare;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.op_a, f.item_spare, f.usuario_criador);
    raise exception 'TESTE 17 FALHOU: bom_item inativo deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 17 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 17 OK: bom_item inativo rejeitado (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 18: bom_item EXCLUÍDO LOGICAMENTE (deleted_at preenchido) -
-- rejeitado. Reusa o item de sobra do Teste 17 (reativado antes, para
-- isolar especificamente a condição deleted_at desta vez).
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fixture_generalizacao;

  update public.bom_itens set ativo = true, deleted_at = now() where id = f.item_spare;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.op_a, f.item_spare, f.usuario_criador);
    raise exception 'TESTE 18 FALHOU: bom_item excluído logicamente deveria ter sido rejeitado.';
  exception
    when others then
      if sqlerrm like 'TESTE 18 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 18 OK: bom_item excluído logicamente rejeitado (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 19: bom_operacao INATIVA (ativo=false) - rejeitado. Usa uma
-- operação de sobra (nunca op_a/op_b, usados por outros testes).
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fixture_generalizacao;

  update public.bom_operacoes set ativo = false where id = f.op_spare;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.op_spare, f.item_materia_prima_1, f.usuario_criador);
    raise exception 'TESTE 19 FALHOU: bom_operacao inativa deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 19 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 19 OK: bom_operacao inativa rejeitada (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 20: bom_operacao EXCLUÍDA LOGICAMENTE (deleted_at preenchido) -
-- rejeitado. Reusa a operação de sobra do Teste 19 (reativada antes,
-- para isolar especificamente a condição deleted_at desta vez).
-- =====================================================================
do $$
declare
  f record;
begin
  select * into f from fixture_generalizacao;

  update public.bom_operacoes set ativo = true, deleted_at = now() where id = f.op_spare;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.bom_operacao_dependencias_subconjunto
      (empresa_id, bom_operacao_id, bom_item_id, created_by)
    values (f.empresa_id, f.op_spare, f.item_materia_prima_1, f.usuario_criador);
    raise exception 'TESTE 20 FALHOU: bom_operacao excluída logicamente deveria ter sido rejeitada.';
  exception
    when others then
      if sqlerrm like 'TESTE 20 FALHOU%' then reset role; raise; end if;
      raise notice 'TESTE 20 OK: bom_operacao excluída logicamente rejeitada (%).', sqlerrm;
  end;

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 21: RLS - CONTROLE POSITIVO - usuário autorizado (criador)
-- consegue alterar seu próprio vínculo.
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
begin
  select * into f from fixture_generalizacao;
  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.item_materia_prima_1 and bom_operacao_id = f.op_a and deleted_at is null limit 1;
  if v_vinculo_id is null then
    raise exception 'TESTE 21 FALHOU: nenhum vínculo vivo de matéria-prima disponível para o controle positivo (dependência do Teste 5 não satisfeita).';
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_criador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_criador::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.bom_operacao_dependencias_subconjunto set bom_operacao_id = bom_operacao_id where id = v_vinculo_id;
  if not found then
    reset role;
    raise exception 'TESTE 21 FALHOU (controle positivo): criador deveria conseguir alterar seu próprio vínculo - 0 linhas afetadas.';
  end if;
  raise notice 'TESTE 21 OK (controle positivo): criador altera normalmente (1 linha afetada).';

  reset role;
end;
$$;

-- =====================================================================
-- TESTE 22: RLS - CONTROLE NEGATIVO (troca de operação) - usuário
-- CONFIRMADAMENTE não-admin (fixture verificou empresa_atual_id() E
-- usuario_e_admin() via as functions reais, nunca presumido) afeta
-- exatamente 0 linhas.
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
  v_linhas integer;
begin
  select * into f from fixture_generalizacao;

  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.item_materia_prima_1 and bom_operacao_id = f.op_a and deleted_at is null limit 1;
  if v_vinculo_id is null then
    raise exception 'TESTE 22 FALHOU: nenhum vínculo vivo de matéria-prima disponível para o controle negativo.';
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_sem_permissao::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_sem_permissao::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.bom_operacao_dependencias_subconjunto set bom_operacao_id = f.op_b where id = v_vinculo_id;
  get diagnostics v_linhas = row_count;

  reset role;

  if v_linhas <> 0 then
    raise exception 'TESTE 22 FALHOU: usuário CONFIRMADAMENTE não-admin conseguiu alterar % linha(s) - RLS não está negando corretamente.', v_linhas;
  end if;
  raise notice 'TESTE 22 OK (controle negativo): usuário sem permissão afetou exatamente 0 linhas na troca de operação.';
end;
$$;

-- =====================================================================
-- TESTE 23: RLS - CONTROLE NEGATIVO (remoção lógica) - mesmo usuário
-- confirmadamente não-admin não consegue remover logicamente o vínculo
-- de outra pessoa - 0 linhas afetadas.
-- =====================================================================
do $$
declare
  f record;
  v_vinculo_id uuid;
  v_linhas integer;
begin
  select * into f from fixture_generalizacao;

  select id into v_vinculo_id from public.bom_operacao_dependencias_subconjunto
    where bom_item_id = f.item_materia_prima_1 and bom_operacao_id = f.op_a and deleted_at is null limit 1;
  if v_vinculo_id is null then
    raise exception 'TESTE 23 FALHOU: nenhum vínculo vivo de matéria-prima disponível para o controle negativo.';
  end if;

  perform set_config('request.jwt.claim.sub', f.usuario_sem_permissao::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', f.usuario_sem_permissao::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.bom_operacao_dependencias_subconjunto
    set deleted_at = now(), deleted_by = f.usuario_sem_permissao
    where id = v_vinculo_id;
  get diagnostics v_linhas = row_count;

  reset role;

  if v_linhas <> 0 then
    raise exception 'TESTE 23 FALHOU: usuário CONFIRMADAMENTE não-admin conseguiu remover logicamente % linha(s) - RLS não está negando corretamente.', v_linhas;
  end if;
  raise notice 'TESTE 23 OK (controle negativo): usuário sem permissão afetou exatamente 0 linhas na remoção lógica.';
end;
$$;

-- =====================================================================
-- TESTE 24: nenhuma política de DELETE existe para esta tabela
-- =====================================================================
do $$
declare
  v_qtd_policies_delete integer;
begin
  select count(*) into v_qtd_policies_delete
  from pg_policies
  where schemaname = 'public'
    and tablename = 'bom_operacao_dependencias_subconjunto'
    and cmd = 'DELETE';

  if v_qtd_policies_delete > 0 then
    raise exception 'TESTE 24 FALHOU: existe(m) % policy(ies) de DELETE - deveria continuar sendo 0 (remoção é sempre lógica via UPDATE).', v_qtd_policies_delete;
  else
    raise notice 'TESTE 24 OK: nenhuma policy de DELETE existe.';
  end if;
end;
$$;

rollback;

-- =====================================================================
-- APÓS RODAR O SCRIPT ACIMA (termina em ROLLBACK), rode ISTO
-- SEPARADAMENTE, em uma NOVA aba/conexão, para confirmar que nenhum
-- resíduo de dado de teste ficou para trás - a estrutura da migration
-- (coluna/índices/CHECK/triggers) é permanente e esperada continuar
-- presente; dado de teste, o rebaixamento temporário de
-- profiles.nivel_acesso, e as flags de item/operação de sobra são o que
-- o ROLLBACK deveria ter desfeito por completo.
-- =====================================================================
--
-- select
--   (select exists(select 1 from pg_class where relname = 'fixture_generalizacao' and relkind in ('r','v'))
--   ) as tabela_temp_fixture_residual_deve_ser_false,
--   (select count(*) from public.bom_operacao_dependencias_subconjunto
--   ) as total_linhas_deve_ser_igual_ao_antes_do_teste,
--   (select count(*) from public.profiles where nivel_acesso = 'operador'
--   ) as profiles_com_nivel_operador_deve_ser_igual_ao_antes_do_teste;

-- =====================================================================
-- NOTA CONCEITUAL (não é SQL, não roda) - itens pedidos que NÃO são
-- testáveis em nível de banco, ficam para a Etapa C/D (lógica pura,
-- Vitest, sem banco):
--
-- (a) "decisão e custo não duplicados quando uma matéria-prima possui
--     várias OPs consumidoras": DecisaoMaterialCenario continua tendo 1
--     linha por bomItemId (nunca 1 por vínculo) - a expansão para "1
--     restrição por OP consumidora" acontece DEPOIS, na hora de aplicar
--     a data às necessidades (grafoPrecedencia.ts, leitura plural dos
--     vínculos), nunca multiplicando a decisão em si nem o custo da
--     negociação. Cenário: matéria-prima X vinculada a OP-A e OP-B
--     (Teste 6 acima), 1 DecisaoMaterialCenario com bomItemId=X,
--     dataDisponibilidade=D, custo=C. Esperado: NecessidadeCapacidadeFlexivel
--     de OP-A E de OP-B recebem disponivelAPartirDe=D; custoAdicional.
--     negociacaoMaterial soma C UMA VEZ (nunca 2x, mesmo com 2 OPs
--     consumidoras).
--
-- (b) "subconjunto considerado pronto não expande seu roteiro": hoje
--     coletarGrafoOcorrenciasBom.ts JÁ expande e soma as operações do
--     subconjunto junto com as do pai (confirmado por leitura direta do
--     código antes desta migration) - "considerado pronto por padrão" é
--     uma CORREÇÃO DE COMPORTAMENTO real, ainda não implementada, fora
--     do escopo desta migration (só schema). Cenário esperado, quando
--     implementado: orçamento com 1 produto pai (3 OPs) + 1 subconjunto
--     (2 OPs próprias) vinculado a uma das OPs do pai -
--     necessidadesOrcamentoNovo do orçamento principal deve conter
--     EXATAMENTE 3 necessidades (as do pai), nunca 5.
--
-- (c) "simulação própria do subconjunto fornece só data de conclusão e
--     custo consolidado, sem dupla contagem": quando origem=
--     "simulacao_propria", as OPs/horas do subconjunto pertencem SÓ à
--     avaliação separada dele (própria chamada a
--     avaliarPrevisaoComercialFlexivel, próprias necessidades, própria
--     capacidade) - o cenário PAI nunca as inclui em
--     necessidadesOrcamentoNovo nem em capacidadeUtilizada. Cenário
--     esperado: capacidadeUtilizada do cenário PAI soma horas só das OPs
--     do produto pai; custoAdicional do PAI inclui o custo consolidado
--     do subconjunto como 1 valor agregado (nunca recalculado a partir
--     de alocações individuais que também aparecem em outro lugar).
--
-- Estes 3 cenários viram testes Vitest reais (fast-check onde fizer
-- sentido) quando a Etapa C for autorizada - registrados aqui só para
-- não perder o requisito antes de chegar lá.
-- =====================================================================
