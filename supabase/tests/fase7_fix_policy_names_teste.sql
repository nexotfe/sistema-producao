-- TESTE (Tier A - SQL real) da migration corretiva
-- 202608120002_fix_nomes_policies_fase7.sql - NÃO É UMA MIGRATION. Vive
-- em supabase/tests/, fora do padrão de nome de migration, NUNCA deve
-- ser aplicado em produção.
--
-- Único BEGIN no topo, único ROLLBACK no fim, zero COMMIT executável -
-- mesma disciplina de fase7_dependencia_subconjunto_teste.sql (ver
-- cabeçalho lá sobre o incidente de 2026-08-12: nunca reproduzir o
-- COMMIT de uma migration dentro de um script de teste).
--
-- Verifica que ALTER POLICY ... RENAME TO troca exclusivamente o nome:
-- captura cmd/roles/qual/with_check das duas policies ANTES (pelos
-- nomes truncados que existem hoje) e compara campo a campo com o
-- estado DEPOIS da renomeação (pelos nomes novos) - tudo dentro da
-- mesma transação, desfeito no ROLLBACK final.

begin;

create temporary table fase7_fix_policy_antes as
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'bom_operacao_dependencias_subconjunto'
  and policyname in (
    'nexotfe bom operacao dependencias subconjunto insert mesma empr',
    'nexotfe bom operacao dependencias subconjunto update mesma empr'
  );

do $$
declare
  v_qtd integer;
begin
  select count(*) into v_qtd from fase7_fix_policy_antes;
  if v_qtd <> 2 then
    raise exception 'PRE-CHECK FALHOU: esperava 2 policies com os nomes truncados atuais, encontrou %. O ambiente pode já ter sido corrigido, ou os nomes truncados são outros - não prossiga sem investigar.', v_qtd;
  end if;
  raise notice 'PRE-CHECK OK: as 2 policies com nome truncado existem, capturadas para comparação.';
end;
$$;

-- =====================================================================
-- Aplica a renomeação (idêntica à migration 202608120002)
-- =====================================================================

alter policy "nexotfe bom operacao dependencias subconjunto insert mesma empr"
  on public.bom_operacao_dependencias_subconjunto
  rename to "nexotfe dependencias subconjunto insert mesma empresa";

alter policy "nexotfe bom operacao dependencias subconjunto update mesma empr"
  on public.bom_operacao_dependencias_subconjunto
  rename to "nexotfe dependencias subconjunto update mesma empresa";

-- =====================================================================
-- TESTE 1: os nomes antigos (truncados) não existem mais
-- =====================================================================
do $$
declare
  v_qtd integer;
begin
  select count(*) into v_qtd
  from pg_policies
  where schemaname = 'public'
    and tablename = 'bom_operacao_dependencias_subconjunto'
    and policyname in (
      'nexotfe bom operacao dependencias subconjunto insert mesma empr',
      'nexotfe bom operacao dependencias subconjunto update mesma empr'
    );
  if v_qtd <> 0 then
    raise exception 'TESTE 1 FALHOU: nome(s) truncado(s) antigo(s) ainda existe(m) (%).', v_qtd;
  end if;
  raise notice 'TESTE 1 OK: os 2 nomes antigos (truncados) não existem mais.';
end;
$$;

-- =====================================================================
-- TESTE 2: os nomes novos existem, com exatamente 53 bytes cada (sem
-- truncar)
-- =====================================================================
do $$
declare
  v_len_insert integer;
  v_len_update integer;
begin
  select length(policyname) into v_len_insert from pg_policies
    where schemaname = 'public' and tablename = 'bom_operacao_dependencias_subconjunto'
      and policyname = 'nexotfe dependencias subconjunto insert mesma empresa';
  select length(policyname) into v_len_update from pg_policies
    where schemaname = 'public' and tablename = 'bom_operacao_dependencias_subconjunto'
      and policyname = 'nexotfe dependencias subconjunto update mesma empresa';

  if v_len_insert is null or v_len_update is null then
    raise exception 'TESTE 2 FALHOU: um ou os dois nomes novos não foram encontrados exatamente como esperado.';
  end if;
  if v_len_insert <> 53 or v_len_update <> 53 then
    raise exception 'TESTE 2 FALHOU: nome novo com tamanho inesperado (insert=%, update=% - esperado 53 nos dois).', v_len_insert, v_len_update;
  end if;
  raise notice 'TESTE 2 OK: os 2 nomes novos existem, 53 bytes cada, sem truncar.';
end;
$$;

-- =====================================================================
-- TESTE 3: cmd/roles/qual/with_check idênticos entre antes e depois -
-- RENAME não deve alterar nenhum deles, compara campo a campo
-- =====================================================================
do $$
declare
  antes_insert record;
  antes_update record;
  depois_insert record;
  depois_update record;
begin
  select * into antes_insert from fase7_fix_policy_antes
    where policyname = 'nexotfe bom operacao dependencias subconjunto insert mesma empr';
  select * into antes_update from fase7_fix_policy_antes
    where policyname = 'nexotfe bom operacao dependencias subconjunto update mesma empr';

  select cmd, roles, qual, with_check into depois_insert from pg_policies
    where schemaname = 'public' and tablename = 'bom_operacao_dependencias_subconjunto'
      and policyname = 'nexotfe dependencias subconjunto insert mesma empresa';
  select cmd, roles, qual, with_check into depois_update from pg_policies
    where schemaname = 'public' and tablename = 'bom_operacao_dependencias_subconjunto'
      and policyname = 'nexotfe dependencias subconjunto update mesma empresa';

  if antes_insert.cmd is distinct from depois_insert.cmd
     or antes_insert.roles is distinct from depois_insert.roles
     or antes_insert.qual is distinct from depois_insert.qual
     or antes_insert.with_check is distinct from depois_insert.with_check then
    raise exception 'TESTE 3a FALHOU: policy de INSERT mudou algo além do nome. cmd antes=% depois=%; roles antes=% depois=%; qual antes=% depois=%; with_check antes=% depois=%',
      antes_insert.cmd, depois_insert.cmd, antes_insert.roles, depois_insert.roles,
      antes_insert.qual, depois_insert.qual, antes_insert.with_check, depois_insert.with_check;
  end if;
  raise notice 'TESTE 3a OK: policy de INSERT - cmd/roles/qual/with_check idênticos antes e depois do RENAME.';

  if antes_update.cmd is distinct from depois_update.cmd
     or antes_update.roles is distinct from depois_update.roles
     or antes_update.qual is distinct from depois_update.qual
     or antes_update.with_check is distinct from depois_update.with_check then
    raise exception 'TESTE 3b FALHOU: policy de UPDATE mudou algo além do nome. cmd antes=% depois=%; roles antes=% depois=%; qual antes=% depois=%; with_check antes=% depois=%',
      antes_update.cmd, depois_update.cmd, antes_update.roles, depois_update.roles,
      antes_update.qual, depois_update.qual, antes_update.with_check, depois_update.with_check;
  end if;
  raise notice 'TESTE 3b OK: policy de UPDATE - cmd/roles/qual/with_check idênticos antes e depois do RENAME.';
end;
$$;

-- =====================================================================
-- TESTE 4: total de policies na tabela continua 3 (select_tenant +
-- insert + update) - RENAME não cria nem apaga nenhuma policy
-- =====================================================================
do $$
declare
  v_qtd integer;
begin
  select count(*) into v_qtd from pg_policies
    where schemaname = 'public' and tablename = 'bom_operacao_dependencias_subconjunto';
  if v_qtd <> 3 then
    raise exception 'TESTE 4 FALHOU: esperava 3 policies na tabela, encontrou %.', v_qtd;
  end if;
  raise notice 'TESTE 4 OK: continuam exatamente 3 policies na tabela (select_tenant + insert + update), nenhuma perdida ou duplicada.';
end;
$$;

rollback;

-- =====================================================================
-- APÓS RODAR O SCRIPT ACIMA (que termina em ROLLBACK - a renomeação de
-- teste é desfeita, os nomes voltam a ser os truncados), rode ISTO
-- SEPARADAMENTE para confirmar que nada mudou de fato:
-- =====================================================================
--
-- select policyname, cmd
-- from pg_policies
-- where schemaname = 'public' and tablename = 'bom_operacao_dependencias_subconjunto'
-- order by policyname;
--
-- Esperado: as 2 policies ainda com nome truncado (...mesma empr) +
-- select_tenant, 3 linhas no total - prova de que o ROLLBACK desfez a
-- renomeação de teste, sem deixar resíduo.
