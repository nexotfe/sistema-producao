-- =============================================================================
-- RASCUNHO CANDIDATO — NAO E UMA MIGRATION REAL. NAO APLICAR.
-- Vive fora de supabase/migrations/ ate a versao/timestamp ser certificada
-- contra a CLI Supabase 2.105.0 em ambiente remoto descartavel (autorizacao
-- futura separada, nao concedida ainda).
--
-- BOOTSTRAP RETROATIVO — BLOCO JUNHO
-- Posicao logica futura: imediatamente ANTES de 202606030001 (a mais
-- antiga migration ja versionada neste repositorio).
--
-- REVISAO 2 — correcao apos auditoria estatica que concluiu REPROVADO.
-- Mudancas estruturais desta revisao, aplicadas a TODO objeto abaixo:
--   a) bug real corrigido: bloco de gerar_slug_empresa_unico() continha
--      "select p.prosecdef, p.proconfig into v_def" (2 colunas para 1
--      variavel text) — quebrava em runtime sempre que a funcao ja
--      existisse. Removido; a variavel v_def (nunca usada) tambem foi
--      removida. Nenhuma validacao nova foi inventada para substitui-la
--      alem do que ja existia nas linhas seguintes (security definer,
--      search_path) — agora reforcadas com o restante do fingerprint
--      (linguagem, volatility, tipo de retorno, owner, ACL).
--   b) ACL deixa de ser reaplicada incondicionalmente: REVOKE/GRANT
--      passam a viver DENTRO do ramo "objeto ausente" (junto da criacao).
--      No ramo "objeto existente", a ACL e agora VALIDADA por igualdade
--      exata (papel a papel, privilegio a privilegio, incluindo PUBLIC
--      nas funcoes e ausencia de GRANT OPTION) — divergencia aborta,
--      nunca corrige.
--   c) owner adicionado ao fingerprint de todo objeto (tabela/sequence/
--      funcao) — ramo ausente fixa o owner via ALTER ... OWNER TO
--      postgres logo apos a criacao; ramo existente valida e aborta se
--      diferente de postgres.
--   d) policies: existencia por nome deixa de bastar — quando a policy
--      ja existe, TODOS os atributos (permissive, roles, cmd, qual,
--      with_check) sao comparados; divergencia aborta.
--   e) trigger empresas_preparar_saas: validacao por texto integral
--      (pg_get_triggerdef) substituida por validacao estrutural via
--      information_schema.triggers + pg_trigger.tgattr resolvido para
--      nomes de coluna — evita depender de uma string inteira montada
--      a mao (risco de falso-positivo por diferenca de formatacao que
--      nunca foi confirmada ao vivo para os outros 8 triggers do
--      arquivo 02; aqui aplicado por consistencia, ja que so este
--      arquivo tem 1 trigger).
--   f) PUBLIC adicionado ao GRANT EXECUTE das 7 funcoes que nao o
--      tinham (normalizar_slug_empresa, gerar_slug_empresa_unico,
--      proximo_codigo_empresa, preparar_empresa_saas, set_updated_at) —
--      corrigido para bater com a introspeccao ja aprovada, que mostrou
--      EXECUTE para PUBLIC nas 9 funcoes, sem excecao. usuario_e_admin()
--      esta neste arquivo (nao no 02) e ja tinha PUBLIC — mantido.
--   g) itens_industriais passa a ter owner + ACL explicita completa,
--      igual as outras 9 tabelas (ramo ausente cria e fixa; ramo
--      existente valida e aborta se divergente).
--   h) gate das 4 policies historicas de clientes deixa de usar a
--      coluna "empresa" como proxy indireto: a criacao da tabela e a
--      criacao das policies agora vivem no MESMO bloco "do $$ ... end
--      $$", usando uma variavel local booleana (v_recem_criada) setada
--      explicitamente em cada ramo — nao depende de inferencia nova,
--      usa exatamente a mesma evidencia/ramificacao ja aprovada.
--
-- Objetos cobertos (ordem real de dependencia, nao agrupados por tabela):
--   1. public.empresas                    (tabela)
--   2. public.empresas_codigo_seq         (sequence)
--   3. public.normalizar_slug_empresa()   (funcao)
--   4. public.gerar_slug_empresa_unico()  (funcao)
--   5. public.proximo_codigo_empresa()    (funcao)
--   6. public.preparar_empresa_saas()     (funcao de trigger)
--   7. trigger empresas_preparar_saas ON public.empresas
--   8. public.set_updated_at()            (funcao de trigger)
--   9. public.empresa_atual_id()          (funcao)
--  10. public.usuario_e_admin()           (funcao — permanece em Junho)
--  11. public.clientes                    (tabela) + 4 policies historicas
--  12. public.itens_industriais           (tabela, Classe B — equivalencia a 202606050032)
--
-- Fonte normativa: dump certificado nexotfe_public_20260621_000436.dump
-- (knowledge/CATALOGO_BANCO_RESTAURADO/, commit b36090f, 2026-06-22) +
-- introspeccao ao vivo ja realizada em rodadas anteriores desta mesma
-- investigacao (pg_get_functiondef/ACL/owner de todos os 25 objetos
-- fundacionais, replay estatico de GRANT/REVOKE nas 169 migrations reais
-- comprovando convergencia total para a ACL hoje observada).
--
-- Prova de compatibilidade do unico objeto genuinamente antecipado em
-- relacao a uma migration historica real (itens_industriais): a migration
-- 20260825170000 (unica que altera itens_industriais depois de
-- 202606050032/202606050036) foi lida integralmente nesta revisao —
-- ADD COLUMN unidade_id (sem IF NOT EXISTS) e CREATE INDEX (sem IF NOT
-- EXISTS) nunca colidem, porque o bootstrap deliberadamente NAO cria
-- nem a coluna unidade_id nem esse indice — cria so o estado de
-- 202606050032, que e exatamente o que essa migration espera encontrar
-- antes de rodar. Nenhuma outra migration real toca itens_industriais.
-- Nenhum outro objeto deste arquivo e recriado por CREATE TABLE/CREATE
-- FUNCTION/CREATE POLICY/CREATE TRIGGER em nenhuma migration posterior
-- (confirmado por busca exaustiva ja realizada em rodadas anteriores).
--
-- Decisao de engenharia ja fechada: a ACL final aqui produzida e a ACL
-- ATUAL OBSERVADA, de forma explicita e deterministica — nunca por
-- heranca implicita de ALTER DEFAULT PRIVILEGES. Isso NAO e hardening.
--
-- Contrato fail-closed, agora reforcado:
--   SE nao existe            -> cria, fixa owner, aplica ACL determinista.
--   SE existe e e compativel -> NO-OP (nenhuma escrita de qualquer tipo).
--   SE existe e diverge      -> RAISE EXCEPTION, aborta a transacao inteira.
-- =============================================================================

begin;

set local check_function_bodies = off;

-- =============================================================================
-- 9. public.empresa_atual_id()
--    REPOSICIONADA para antes do bloco 1 (empresas) apos REPLAY DESCARTAVEL
--    real ter comprovado (SQLSTATE 42883, function does not exist) que as
--    policies de public.empresas (bloco 1) resolvem a chamada a esta
--    funcao no momento de CREATE POLICY — nao e deferido, ao contrario do
--    que a nota anterior do bloco 10 presumia. Numeracao logica original
--    (9) mantida apenas como rotulo/identificador do objeto, nao como
--    posicao fisica no arquivo.
-- =============================================================================
do $$
declare
  v_oid oid;
  v_diff int;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'empresa_atual_id'
     and pg_get_function_identity_arguments(p.oid) = '';

  if v_oid is null then
    create or replace function public.empresa_atual_id()
    returns uuid
    language sql
    stable
    security definer
    set search_path to 'public'
    as $function$
      select coalesce(
        (
          select profiles.empresa_id
          from public.profiles
          where profiles.id = auth.uid()
            and profiles.ativo = true
        ),
        (
          select usuarios.empresa_id
          from public.usuarios
          where usuarios.id = auth.uid()
        )
      )
    $function$;

    alter function public.empresa_atual_id() owner to postgres;

    revoke all on function public.empresa_atual_id() from public, anon, authenticated, service_role, postgres;
    grant execute on function public.empresa_atual_id() to public, anon, authenticated, postgres, service_role;

  else
    if not (select prosecdef from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresa_atual_id: esperado SECURITY DEFINER';
    end if;
    if (select proconfig from pg_proc where oid = v_oid) is distinct from array['search_path=public'] then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresa_atual_id: search_path diferente de ''public''';
    end if;
    if (select prorettype from pg_proc where oid = v_oid) <> 'uuid'::regtype then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresa_atual_id: tipo de retorno diferente de uuid';
    end if;
    if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner where p.oid = v_oid) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresa_atual_id: owner diferente de postgres';
    end if;

    -- Evidencia r8: proisstrict=false, proparallel='u'.
    if (select proisstrict from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresa_atual_id: esperado NOT STRICT (proisstrict=false)';
    end if;
    if (select proparallel from pg_proc where oid = v_oid) <> 'u' then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresa_atual_id: esperado PARALLEL UNSAFE (proparallel=''u'')';
    end if;

    if replace(pg_get_functiondef(v_oid), chr(13), '') <> $corpo$CREATE OR REPLACE FUNCTION public.empresa_atual_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (
      select profiles.empresa_id
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.ativo = true
    ),
    (
      select usuarios.empresa_id
      from public.usuarios
      where usuarios.id = auth.uid()
    )
  )
$function$
$corpo$ then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresa_atual_id: corpo da funcao diverge do certificado';
    end if;

    if exists (
      select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
      where p.oid = v_oid and a.is_grantable
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresa_atual_id: GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel, a.privilege_type as privilegio
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
      except
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      union all
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      except
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresa_atual_id: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;
  end if;
end $$;

-- =============================================================================
-- 10. public.usuario_e_admin()
--    REPOSICIONADA para antes do bloco 1 (empresas), junto com o bloco 9
--    (empresa_atual_id, da qual depende internamente). Motivo: REPLAY
--    DESCARTAVEL real comprovou que as policies de public.empresas
--    resolvem a chamada a estas funcoes no momento de CREATE POLICY —
--    nao e deferido. A nota anterior aqui presumia o contrario (deferimento
--    total ate a execucao do corpo) e estava incorreta; substituida por
--    esta. Numeracao logica original (10) mantida apenas como rotulo.
-- =============================================================================
do $$
declare
  v_oid oid;
  v_diff int;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'usuario_e_admin'
     and pg_get_function_identity_arguments(p.oid) = '';

  if v_oid is null then
    create or replace function public.usuario_e_admin()
    returns boolean
    language sql
    stable
    security definer
    set search_path to 'public'
    as $function$
      select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and empresa_id = public.empresa_atual_id()
          and nivel_acesso = 'admin'
          and ativo = true
      )
    $function$;

    alter function public.usuario_e_admin() owner to postgres;

    revoke all on function public.usuario_e_admin() from public, anon, authenticated, service_role, postgres;
    grant execute on function public.usuario_e_admin() to public, anon, authenticated, postgres, service_role;

  else
    if not (select prosecdef from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.usuario_e_admin: esperado SECURITY DEFINER';
    end if;
    if (select proconfig from pg_proc where oid = v_oid) is distinct from array['search_path=public'] then
      raise exception 'FINGERPRINT DIVERGENTE em public.usuario_e_admin: search_path diferente de ''public''';
    end if;
    if (select prorettype from pg_proc where oid = v_oid) <> 'boolean'::regtype then
      raise exception 'FINGERPRINT DIVERGENTE em public.usuario_e_admin: tipo de retorno diferente de boolean';
    end if;
    if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner where p.oid = v_oid) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.usuario_e_admin: owner diferente de postgres';
    end if;

    -- Evidencia r8: proisstrict=false, proparallel='u'.
    if (select proisstrict from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.usuario_e_admin: esperado NOT STRICT (proisstrict=false)';
    end if;
    if (select proparallel from pg_proc where oid = v_oid) <> 'u' then
      raise exception 'FINGERPRINT DIVERGENTE em public.usuario_e_admin: esperado PARALLEL UNSAFE (proparallel=''u'')';
    end if;

    if replace(pg_get_functiondef(v_oid), chr(13), '') <> $corpo$CREATE OR REPLACE FUNCTION public.usuario_e_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and empresa_id = public.empresa_atual_id()
      and nivel_acesso = 'admin'
      and ativo = true
  )
$function$
$corpo$ then
      raise exception 'FINGERPRINT DIVERGENTE em public.usuario_e_admin: corpo da funcao diverge do certificado';
    end if;

    if exists (
      select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
      where p.oid = v_oid and a.is_grantable
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.usuario_e_admin: GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel, a.privilege_type as privilegio
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
      except
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      union all
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      except
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.usuario_e_admin: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;
  end if;
end $$;

-- =============================================================================
-- 1. public.empresas — ESTADO HISTORICO (11 colunas, 2 policies, 5
--    indices, 3 constraints, 1 trigger governado) OU ESTADO ATUAL (17
--    colunas, +1 CHECK, +3 triggers posteriores). Classificador H-ou-O.
-- =============================================================================
do $$
declare
  v_diff int;
  v_col_h boolean; v_col_o boolean;
  v_def_h boolean; v_def_o boolean;
  v_idgen boolean; v_collation boolean;
  v_con_h boolean; v_con_o boolean;
  v_idx_h boolean; v_idx_o boolean;
  v_pol boolean;
  v_trig_h boolean; v_trig_o boolean;
  v_rls boolean; v_owner boolean; v_acl boolean;
  v_estado_h boolean; v_estado_o boolean;
begin
  if to_regclass('public.empresas') is null then

    create table public.empresas (
      id uuid primary key default gen_random_uuid(),
      nome text not null,
      slug text not null,
      cnpj text,
      ativo boolean not null default true,
      created_at timestamptz not null default now(),
      codigo integer not null,
      email text,
      telefone text,
      plano text not null default 'starter',
      created_by uuid
    );

    alter table public.empresas
      add constraint empresas_slug_key unique (slug),
      add constraint empresas_created_by_fkey
        foreign key (created_by) references auth.users(id) on delete set null;

    alter table public.empresas enable row level security;
    alter table public.empresas owner to postgres;

    comment on table public.empresas is
      'Bootstrap retroativo (bloco Junho) — estado historico comprovado por dump certificado 2026-06-21. Colunas aditivas posteriores (inscricao_estadual, endereco, pais_codigo, uf_codigo, municipio_codigo, logo_path) permanecem responsabilidade das migrations reais que ja as aplicam (202607100002, 202607180005, 20260824174845).';

    create index empresas_ativo_idx on public.empresas using btree (ativo);
    create unique index empresas_codigo_key on public.empresas using btree (codigo);
    create index empresas_created_by_idx on public.empresas using btree (created_by);

    create policy "nexotfe empresas select propria empresa" on public.empresas
      for select to authenticated
      using (id = public.empresa_atual_id());

    create policy "nexotfe empresas update admin propria empresa" on public.empresas
      for update to authenticated
      using (id = public.empresa_atual_id() and public.usuario_e_admin())
      with check (id = public.empresa_atual_id() and public.usuario_e_admin());

    revoke all on public.empresas from public, anon, authenticated, service_role, postgres;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.empresas to anon, authenticated, postgres, service_role;

  else

    v_owner := (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.empresas'::regclass) = 'postgres';

    v_rls := (select relrowsecurity from pg_class where oid = 'public.empresas'::regclass)
             and not (select relforcerowsecurity from pg_class where oid = 'public.empresas'::regclass);

    v_idgen := not exists (
      select 1 from pg_attribute a
      where a.attrelid = 'public.empresas'::regclass and a.attnum > 0 and not a.attisdropped
        and (a.attidentity <> '' or a.attgenerated <> '')
    );

    v_collation := not exists (
      select 1 from pg_attribute a
      left join pg_collation col on col.oid = a.attcollation
      where a.attrelid = 'public.empresas'::regclass and a.attnum > 0 and not a.attisdropped
        and coalesce(col.collname, 'default') <> 'default'
    );

    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.empresas'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresas: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) = 0 into v_acl
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.empresas'::regclass and a.grantee <> 0
      except
      select * from (values
        ('anon','DELETE'),('anon','INSERT'),('anon','MAINTAIN'),('anon','REFERENCES'),('anon','SELECT'),('anon','TRIGGER'),('anon','TRUNCATE'),('anon','UPDATE'),
        ('authenticated','DELETE'),('authenticated','INSERT'),('authenticated','MAINTAIN'),('authenticated','REFERENCES'),('authenticated','SELECT'),('authenticated','TRIGGER'),('authenticated','TRUNCATE'),('authenticated','UPDATE'),
        ('postgres','DELETE'),('postgres','INSERT'),('postgres','MAINTAIN'),('postgres','REFERENCES'),('postgres','SELECT'),('postgres','TRIGGER'),('postgres','TRUNCATE'),('postgres','UPDATE'),
        ('service_role','DELETE'),('service_role','INSERT'),('service_role','MAINTAIN'),('service_role','REFERENCES'),('service_role','SELECT'),('service_role','TRIGGER'),('service_role','TRUNCATE'),('service_role','UPDATE')
      ) as e(papel, privilegio)
      union all
      select * from (values
        ('anon','DELETE'),('anon','INSERT'),('anon','MAINTAIN'),('anon','REFERENCES'),('anon','SELECT'),('anon','TRIGGER'),('anon','TRUNCATE'),('anon','UPDATE'),
        ('authenticated','DELETE'),('authenticated','INSERT'),('authenticated','MAINTAIN'),('authenticated','REFERENCES'),('authenticated','SELECT'),('authenticated','TRIGGER'),('authenticated','TRUNCATE'),('authenticated','UPDATE'),
        ('postgres','DELETE'),('postgres','INSERT'),('postgres','MAINTAIN'),('postgres','REFERENCES'),('postgres','SELECT'),('postgres','TRIGGER'),('postgres','TRUNCATE'),('postgres','UPDATE'),
        ('service_role','DELETE'),('service_role','INSERT'),('service_role','MAINTAIN'),('service_role','REFERENCES'),('service_role','SELECT'),('service_role','TRIGGER'),('service_role','TRUNCATE'),('service_role','UPDATE')
      ) as e(papel, privilegio)
      except
      select a.grantee::regrole::text, a.privilege_type
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.empresas'::regclass and a.grantee <> 0
    ) as divergentes;

    select count(*) = 0 into v_pol
    from (
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname = 'public' and tablename = 'empresas'
      except
      select * from (values
        ('nexotfe empresas select propria empresa','PERMISSIVE','SELECT',array['authenticated']::name[],'(id = empresa_atual_id())',null),
        ('nexotfe empresas update admin propria empresa','PERMISSIVE','UPDATE',array['authenticated']::name[],'((id = empresa_atual_id()) AND usuario_e_admin())','((id = empresa_atual_id()) AND usuario_e_admin())')
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('nexotfe empresas select propria empresa','PERMISSIVE','SELECT',array['authenticated']::name[],'(id = empresa_atual_id())',null),
        ('nexotfe empresas update admin propria empresa','PERMISSIVE','UPDATE',array['authenticated']::name[],'((id = empresa_atual_id()) AND usuario_e_admin())','((id = empresa_atual_id()) AND usuario_e_admin())')
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname = 'public' and tablename = 'empresas'
    ) as divergentes;

    select count(*) = 0 into v_trig_h
    from (
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,'') as tgattr, t.tgenabled, t.tgnargs, octet_length(t.tgargs) as tgargs_len, t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.empresas'::regclass and not t.tgisinternal
      except
      select * from (values ('empresas_preparar_saas', to_regprocedure('public.preparar_empresa_saas()'), 23, '7 2 3 10', 'O', 0, 0, 0, false)) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      union all
      select * from (values ('empresas_preparar_saas', to_regprocedure('public.preparar_empresa_saas()'), 23, '7 2 3 10', 'O', 0, 0, 0, false)) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      except
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,''), t.tgenabled, t.tgnargs, octet_length(t.tgargs), t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.empresas'::regclass and not t.tgisinternal
    ) as divergentes;

    select count(*) = 0 into v_trig_o
    from (
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,'') as tgattr, t.tgenabled, t.tgnargs, octet_length(t.tgargs) as tgargs_len, t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.empresas'::regclass and not t.tgisinternal
      except
      select * from (values
        ('empresas_preparar_saas', to_regprocedure('public.preparar_empresa_saas()'), 23, '7 2 3 10', 'O', 0, 0, 0, false),
        ('empresas_criar_capacidade_versao', to_regprocedure('public.trg_empresas_criar_capacidade_versao()'), 5, '', 'O', 0, 0, 0, false),
        ('empresas_criar_numeracao_padrao', to_regprocedure('public.trg_empresas_criar_numeracao_padrao()'), 5, '', 'O', 0, 0, 0, false),
        ('empresas_criar_unidades_medida_padrao', to_regprocedure('public.trg_empresas_criar_unidades_medida_padrao()'), 5, '', 'O', 0, 0, 0, false)
      ) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      union all
      select * from (values
        ('empresas_preparar_saas', to_regprocedure('public.preparar_empresa_saas()'), 23, '7 2 3 10', 'O', 0, 0, 0, false),
        ('empresas_criar_capacidade_versao', to_regprocedure('public.trg_empresas_criar_capacidade_versao()'), 5, '', 'O', 0, 0, 0, false),
        ('empresas_criar_numeracao_padrao', to_regprocedure('public.trg_empresas_criar_numeracao_padrao()'), 5, '', 'O', 0, 0, 0, false),
        ('empresas_criar_unidades_medida_padrao', to_regprocedure('public.trg_empresas_criar_unidades_medida_padrao()'), 5, '', 'O', 0, 0, 0, false)
      ) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      except
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,''), t.tgenabled, t.tgnargs, octet_length(t.tgargs), t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.empresas'::regclass and not t.tgisinternal
    ) as divergentes;

    -- Indices: identicos em H e O (nenhuma migration altera indices de
    -- empresas) — usados como o mesmo teste v_idx em ambos os estados.
    select count(*) = 0 into v_idx_h
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.empresas'::regclass
      except
      select * from (values
        ('empresas_ativo_idx',false,false,true,true,'btree','CREATE INDEX empresas_ativo_idx ON public.empresas USING btree (ativo)'),
        ('empresas_codigo_key',true,false,true,true,'btree','CREATE UNIQUE INDEX empresas_codigo_key ON public.empresas USING btree (codigo)'),
        ('empresas_created_by_idx',false,false,true,true,'btree','CREATE INDEX empresas_created_by_idx ON public.empresas USING btree (created_by)'),
        ('empresas_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX empresas_pkey ON public.empresas USING btree (id)'),
        ('empresas_slug_key',true,false,true,true,'btree','CREATE UNIQUE INDEX empresas_slug_key ON public.empresas USING btree (slug)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('empresas_ativo_idx',false,false,true,true,'btree','CREATE INDEX empresas_ativo_idx ON public.empresas USING btree (ativo)'),
        ('empresas_codigo_key',true,false,true,true,'btree','CREATE UNIQUE INDEX empresas_codigo_key ON public.empresas USING btree (codigo)'),
        ('empresas_created_by_idx',false,false,true,true,'btree','CREATE INDEX empresas_created_by_idx ON public.empresas USING btree (created_by)'),
        ('empresas_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX empresas_pkey ON public.empresas USING btree (id)'),
        ('empresas_slug_key',true,false,true,true,'btree','CREATE UNIQUE INDEX empresas_slug_key ON public.empresas USING btree (slug)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.empresas'::regclass
    ) as divergentes;
    v_idx_o := v_idx_h;

    -- Colunas: H = 11 historicas; O = H + 6 aditivas.
    select count(*) into v_diff
    from (
      values
        ('id','uuid','NO'), ('nome','text','NO'), ('slug','text','NO'),
        ('cnpj','text','YES'), ('ativo','boolean','NO'),
        ('created_at','timestamp with time zone','NO'), ('codigo','integer','NO'),
        ('email','text','YES'), ('telefone','text','YES'), ('plano','text','NO'),
        ('created_by','uuid','YES')
    ) as esperado(coluna, tipo, nulavel)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'empresas'
        and c.column_name = esperado.coluna and c.data_type = esperado.tipo and c.is_nullable = esperado.nulavel
    );
    v_col_h := (v_diff = 0) and (select count(*) from information_schema.columns where table_schema='public' and table_name='empresas') = 11;

    select count(*) into v_diff
    from (
      values
        ('id','uuid','NO'), ('nome','text','NO'), ('slug','text','NO'),
        ('cnpj','text','YES'), ('ativo','boolean','NO'),
        ('created_at','timestamp with time zone','NO'), ('codigo','integer','NO'),
        ('email','text','YES'), ('telefone','text','YES'), ('plano','text','NO'),
        ('created_by','uuid','YES'), ('inscricao_estadual','text','YES'), ('endereco','text','YES'),
        ('pais_codigo','text','YES'), ('uf_codigo','text','YES'), ('municipio_codigo','text','YES'),
        ('logo_path','text','YES')
    ) as esperado(coluna, tipo, nulavel)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'empresas'
        and c.column_name = esperado.coluna and c.data_type = esperado.tipo and c.is_nullable = esperado.nulavel
    );
    v_col_o := (v_diff = 0) and (select count(*) from information_schema.columns where table_schema='public' and table_name='empresas') = 17;

    select count(*) = 0 into v_def_h
    from (
      select a.attname as coluna, pg_get_expr(ad.adbin, ad.adrelid) as default_real
        from pg_attrdef ad join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.empresas'::regclass
         and a.attname = any(array['id','nome','slug','cnpj','ativo','created_at','codigo','email','telefone','plano','created_by'])
      except
      select * from (values ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('plano','''starter''::text')) as e(coluna, default_esperado)
      union all
      select * from (values ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('plano','''starter''::text')) as e(coluna, default_esperado)
      except
      select a.attname, pg_get_expr(ad.adbin, ad.adrelid)
        from pg_attrdef ad join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.empresas'::regclass
         and a.attname = any(array['id','nome','slug','cnpj','ativo','created_at','codigo','email','telefone','plano','created_by'])
    ) as divergentes;

    select count(*) = 0 into v_def_o
    from (
      select a.attname as coluna, pg_get_expr(ad.adbin, ad.adrelid) as default_real
        from pg_attrdef ad join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.empresas'::regclass
         and a.attname = any(array['id','nome','slug','cnpj','ativo','created_at','codigo','email','telefone','plano','created_by','inscricao_estadual','endereco','pais_codigo','uf_codigo','municipio_codigo','logo_path'])
      except
      select * from (values ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('plano','''starter''::text')) as e(coluna, default_esperado)
      union all
      select * from (values ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('plano','''starter''::text')) as e(coluna, default_esperado)
      except
      select a.attname, pg_get_expr(ad.adbin, ad.adrelid)
        from pg_attrdef ad join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.empresas'::regclass
         and a.attname = any(array['id','nome','slug','cnpj','ativo','created_at','codigo','email','telefone','plano','created_by','inscricao_estadual','endereco','pais_codigo','uf_codigo','municipio_codigo','logo_path'])
    ) as divergentes;

    select count(*) = 0 into v_con_h
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.empresas'::regclass
      except
      select * from (values
        ('empresas_pkey','p','PRIMARY KEY (id)'),
        ('empresas_slug_key','u','UNIQUE (slug)'),
        ('empresas_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('empresas_pkey','p','PRIMARY KEY (id)'),
        ('empresas_slug_key','u','UNIQUE (slug)'),
        ('empresas_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.empresas'::regclass
    ) as divergentes;

    select count(*) = 0 into v_con_o
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.empresas'::regclass
      except
      select * from (values
        ('empresas_pkey','p','PRIMARY KEY (id)'),
        ('empresas_slug_key','u','UNIQUE (slug)'),
        ('empresas_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
        ('empresas_logo_path_pertence_empresa','c','CHECK (((logo_path IS NULL) OR (logo_path ~~ ((id)::text || ''/%''::text))))')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('empresas_pkey','p','PRIMARY KEY (id)'),
        ('empresas_slug_key','u','UNIQUE (slug)'),
        ('empresas_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
        ('empresas_logo_path_pertence_empresa','c','CHECK (((logo_path IS NULL) OR (logo_path ~~ ((id)::text || ''/%''::text))))')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.empresas'::regclass
    ) as divergentes;

    v_estado_h := v_col_h and v_def_h and v_idgen and v_collation and v_con_h and v_idx_h and v_pol and v_trig_h and v_rls and v_owner and v_acl;
    v_estado_o := v_col_o and v_def_o and v_idgen and v_collation and v_con_o and v_idx_o and v_pol and v_trig_o and v_rls and v_owner and v_acl;

    if v_estado_h or v_estado_o then
      null;
    else
      raise exception 'FINGERPRINT DIVERGENTE em public.empresas: nao corresponde integralmente a ESTADO HISTORICO nem a ESTADO ATUAL (hibrido/parcial/desconhecido). colunas(H=%,O=%) defaults(H=%,O=%) constraints(H=%,O=%) indices(%) policies(%) triggers(H=%,O=%) rls(%) owner(%) acl(%)',
        v_col_h, v_col_o, v_def_h, v_def_o, v_con_h, v_con_o, v_idx_h, v_pol, v_trig_h, v_trig_o, v_rls, v_owner, v_acl;
    end if;

  end if;
end $$;

-- =============================================================================
-- 2. public.empresas_codigo_seq
-- =============================================================================
do $$
declare
  v_seq record;
  v_diff int;
begin
  if to_regclass('public.empresas_codigo_seq') is null then

    create sequence public.empresas_codigo_seq
      as bigint
      start with 1
      increment by 1
      minvalue 1
      maxvalue 9223372036854775807
      cache 1
      no cycle;

    alter sequence public.empresas_codigo_seq owner to postgres;

    revoke all on sequence public.empresas_codigo_seq from public, anon, authenticated, service_role, postgres;
    grant select, update, usage on sequence public.empresas_codigo_seq to anon, authenticated, postgres, service_role;

  else

    select data_type, start_value, increment_by, min_value, max_value, cache_size, cycle_option
      into v_seq
      from information_schema.sequences
     where sequence_schema = 'public' and sequence_name = 'empresas_codigo_seq';

    if not found then
      raise exception 'FINGERPRINT DIVERGENTE: public.empresas_codigo_seq nao reconhecida como sequence';
    end if;

    if v_seq.data_type <> 'bigint'
      or v_seq.start_value <> 1
      or v_seq.increment_by <> 1
      or v_seq.min_value <> 1
      or v_seq.max_value <> 9223372036854775807
      or v_seq.cache_size <> 1
      or v_seq.cycle_option <> 'NO'
    then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresas_codigo_seq: parametros de schema fora do esperado (data_type=%, start=%, increment=%, min=%, max=%, cache=%, cycle=%)',
        v_seq.data_type, v_seq.start_value, v_seq.increment_by, v_seq.min_value, v_seq.max_value, v_seq.cache_size, v_seq.cycle_option;
    end if;

    if (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.empresas_codigo_seq'::regclass) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresas_codigo_seq: owner diferente de postgres';
    end if;

    -- OWNED BY NONE — provado via pg_depend cobrindo deptype='a' (OWNED
    -- BY tradicional, sequence-para-coluna) E deptype='i' (vinculo
    -- interno/identity, usado quando uma sequence vira a sequence de
    -- GENERATED ... AS IDENTITY de alguma coluna). Evidencia r8
    -- reconfirmou zero linhas nesta sequence. Se alguma dependencia
    -- desse tipo aparecer depois da r8, este bloco aborta.
    if exists (
      select 1 from pg_depend d
      where d.objid = 'public.empresas_codigo_seq'::regclass and d.deptype in ('a','i')
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresas_codigo_seq: possui dependencia OWNED BY ou interna/identity (deptype a/i), esperado nenhuma';
    end if;

    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.empresas_codigo_seq'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresas_codigo_seq: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.empresas_codigo_seq'::regclass and a.grantee <> 0
      except
      select * from (values
        ('anon','SELECT'),('anon','UPDATE'),('anon','USAGE'),
        ('authenticated','SELECT'),('authenticated','UPDATE'),('authenticated','USAGE'),
        ('postgres','SELECT'),('postgres','UPDATE'),('postgres','USAGE'),
        ('service_role','SELECT'),('service_role','UPDATE'),('service_role','USAGE')
      ) as e(papel, privilegio)
      union all
      select * from (values
        ('anon','SELECT'),('anon','UPDATE'),('anon','USAGE'),
        ('authenticated','SELECT'),('authenticated','UPDATE'),('authenticated','USAGE'),
        ('postgres','SELECT'),('postgres','UPDATE'),('postgres','USAGE'),
        ('service_role','SELECT'),('service_role','UPDATE'),('service_role','USAGE')
      ) as e(papel, privilegio)
      except
      select a.grantee::regrole::text, a.privilege_type
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.empresas_codigo_seq'::regclass and a.grantee <> 0
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.empresas_codigo_seq: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;

    -- NUNCA: nextval(), setval(), restart, alteracao de last_value/is_called.

  end if;
end $$;

-- =============================================================================
-- 3. public.normalizar_slug_empresa(text)
-- =============================================================================
do $$
declare
  v_oid oid;
  v_diff int;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'normalizar_slug_empresa'
     and pg_get_function_identity_arguments(p.oid) = 'valor text';

  if v_oid is null then
    create or replace function public.normalizar_slug_empresa(valor text)
    returns text
    language sql
    immutable
    as $function$
      select coalesce(
        nullif(
          trim(both '-' from lower(regexp_replace(valor, '[^a-zA-Z0-9]+', '-', 'g'))),
          ''
        ),
        'empresa'
      )
    $function$;

    alter function public.normalizar_slug_empresa(text) owner to postgres;

    revoke all on function public.normalizar_slug_empresa(text) from public, anon, authenticated, service_role, postgres;
    grant execute on function public.normalizar_slug_empresa(text) to public, anon, authenticated, postgres, service_role;

  else
    if (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = v_oid) <> 'sql' then
      raise exception 'FINGERPRINT DIVERGENTE em public.normalizar_slug_empresa: esperado LANGUAGE sql';
    end if;
    if (select provolatile from pg_proc where oid = v_oid) <> 'i' then
      raise exception 'FINGERPRINT DIVERGENTE em public.normalizar_slug_empresa: esperado IMMUTABLE';
    end if;
    if (select prosecdef from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.normalizar_slug_empresa: esperado SECURITY INVOKER (nao DEFINER)';
    end if;
    if (select prorettype from pg_proc where oid = v_oid) <> 'text'::regtype then
      raise exception 'FINGERPRINT DIVERGENTE em public.normalizar_slug_empresa: tipo de retorno diferente de text';
    end if;
    if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner where p.oid = v_oid) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.normalizar_slug_empresa: owner diferente de postgres';
    end if;

    -- Evidencia r8 (SHA-256 268223a1cd8071e0ee45197604de25c5732f17f213d35f309ebb28f036618b5d):
    -- proisstrict=false, proparallel='u' nas 9 funcoes, sem excecao.
    if (select proisstrict from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.normalizar_slug_empresa: esperado NOT STRICT (proisstrict=false)';
    end if;
    if (select proparallel from pg_proc where oid = v_oid) <> 'u' then
      raise exception 'FINGERPRINT DIVERGENTE em public.normalizar_slug_empresa: esperado PARALLEL UNSAFE (proparallel=''u'')';
    end if;

    -- Corpo certificado por pg_get_functiondef ja comprovado (rodada de
    -- introspeccao anterior); CRLF normalizado para LF antes de comparar,
    -- unica tolerancia admitida (estilo de quebra de linha, nao conteudo).
    if replace(pg_get_functiondef(v_oid), chr(13), '') <> $corpo$CREATE OR REPLACE FUNCTION public.normalizar_slug_empresa(valor text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(
    nullif(
      trim(both '-' from lower(regexp_replace(valor, '[^a-zA-Z0-9]+', '-', 'g'))),
      ''
    ),
    'empresa'
  )
$function$
$corpo$ then
      raise exception 'FINGERPRINT DIVERGENTE em public.normalizar_slug_empresa: corpo da funcao diverge do certificado';
    end if;

    if exists (
      select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
      where p.oid = v_oid and a.is_grantable
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.normalizar_slug_empresa: GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel, a.privilege_type as privilegio
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
      except
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      union all
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      except
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.normalizar_slug_empresa: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;
  end if;
end $$;

-- =============================================================================
-- 4. public.gerar_slug_empresa_unico(text, uuid, integer)
-- =============================================================================
do $$
declare
  v_oid oid;
  v_diff int;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'gerar_slug_empresa_unico'
     and pg_get_function_identity_arguments(p.oid) = 'slug_base text, empresa_id_atual uuid, codigo_empresa integer';

  if v_oid is null then
    create or replace function public.gerar_slug_empresa_unico(
      slug_base text, empresa_id_atual uuid, codigo_empresa integer
    )
    returns text
    language plpgsql
    stable
    security definer
    set search_path to 'public'
    as $function$
    declare
      slug_normalizado text;
      slug_candidato text;
      incremento integer := 2;
    begin
      slug_normalizado := public.normalizar_slug_empresa(slug_base);
      slug_candidato := slug_normalizado;

      if exists (
        select 1
        from public.empresas
        where slug = slug_candidato
          and (empresa_id_atual is null or id <> empresa_id_atual)
      ) then
        slug_candidato := slug_normalizado || '-' || codigo_empresa::text;
      end if;

      while exists (
        select 1
        from public.empresas
        where slug = slug_candidato
          and (empresa_id_atual is null or id <> empresa_id_atual)
      ) loop
        slug_candidato := slug_normalizado || '-' || incremento::text;
        incremento := incremento + 1;
      end loop;

      return slug_candidato;
    end;
    $function$;

    alter function public.gerar_slug_empresa_unico(text, uuid, integer) owner to postgres;

    revoke all on function public.gerar_slug_empresa_unico(text, uuid, integer) from public, anon, authenticated, service_role, postgres;
    grant execute on function public.gerar_slug_empresa_unico(text, uuid, integer) to public, anon, authenticated, postgres, service_role;

  else
    -- Codigo morto removido nesta revisao (variavel v_def sem uso e
    -- "select 2 colunas into 1 variavel", que quebrava aqui sempre que
    -- a funcao ja existisse). Fingerprint estrutural completo abaixo,
    -- sem nenhuma escrita.
    if (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = v_oid) <> 'plpgsql' then
      raise exception 'FINGERPRINT DIVERGENTE em public.gerar_slug_empresa_unico: esperado LANGUAGE plpgsql';
    end if;
    if (select provolatile from pg_proc where oid = v_oid) <> 's' then
      raise exception 'FINGERPRINT DIVERGENTE em public.gerar_slug_empresa_unico: esperado STABLE';
    end if;
    if not (select prosecdef from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.gerar_slug_empresa_unico: esperado SECURITY DEFINER';
    end if;
    if (select proconfig from pg_proc where oid = v_oid) is distinct from array['search_path=public'] then
      raise exception 'FINGERPRINT DIVERGENTE em public.gerar_slug_empresa_unico: search_path diferente de ''public''';
    end if;
    if (select prorettype from pg_proc where oid = v_oid) <> 'text'::regtype then
      raise exception 'FINGERPRINT DIVERGENTE em public.gerar_slug_empresa_unico: tipo de retorno diferente de text';
    end if;
    if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner where p.oid = v_oid) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.gerar_slug_empresa_unico: owner diferente de postgres';
    end if;

    -- Evidencia r8: proisstrict=false, proparallel='u'.
    if (select proisstrict from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.gerar_slug_empresa_unico: esperado NOT STRICT (proisstrict=false)';
    end if;
    if (select proparallel from pg_proc where oid = v_oid) <> 'u' then
      raise exception 'FINGERPRINT DIVERGENTE em public.gerar_slug_empresa_unico: esperado PARALLEL UNSAFE (proparallel=''u'')';
    end if;

    if replace(pg_get_functiondef(v_oid), chr(13), '') <> $corpo$CREATE OR REPLACE FUNCTION public.gerar_slug_empresa_unico(slug_base text, empresa_id_atual uuid, codigo_empresa integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  slug_normalizado text;
  slug_candidato text;
  incremento integer := 2;
begin
  slug_normalizado := public.normalizar_slug_empresa(slug_base);
  slug_candidato := slug_normalizado;

  if exists (
    select 1
    from public.empresas
    where slug = slug_candidato
      and (empresa_id_atual is null or id <> empresa_id_atual)
  ) then
    slug_candidato := slug_normalizado || '-' || codigo_empresa::text;
  end if;

  while exists (
    select 1
    from public.empresas
    where slug = slug_candidato
      and (empresa_id_atual is null or id <> empresa_id_atual)
  ) loop
    slug_candidato := slug_normalizado || '-' || incremento::text;
    incremento := incremento + 1;
  end loop;

  return slug_candidato;
end;
$function$
$corpo$ then
      raise exception 'FINGERPRINT DIVERGENTE em public.gerar_slug_empresa_unico: corpo da funcao diverge do certificado';
    end if;

    if exists (
      select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
      where p.oid = v_oid and a.is_grantable
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.gerar_slug_empresa_unico: GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel, a.privilege_type as privilegio
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
      except
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      union all
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      except
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.gerar_slug_empresa_unico: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;
  end if;
end $$;

-- =============================================================================
-- 5. public.proximo_codigo_empresa()
-- =============================================================================
do $$
declare
  v_oid oid;
  v_diff int;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'proximo_codigo_empresa'
     and pg_get_function_identity_arguments(p.oid) = '';

  if v_oid is null then
    create or replace function public.proximo_codigo_empresa()
    returns integer
    language sql
    security definer
    set search_path to 'public'
    as $function$
      select nextval('public.empresas_codigo_seq')::integer
    $function$;

    alter function public.proximo_codigo_empresa() owner to postgres;

    revoke all on function public.proximo_codigo_empresa() from public, anon, authenticated, service_role, postgres;
    grant execute on function public.proximo_codigo_empresa() to public, anon, authenticated, postgres, service_role;

  else
    if not (select prosecdef from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.proximo_codigo_empresa: esperado SECURITY DEFINER';
    end if;
    if (select proconfig from pg_proc where oid = v_oid) is distinct from array['search_path=public'] then
      raise exception 'FINGERPRINT DIVERGENTE em public.proximo_codigo_empresa: search_path diferente de ''public''';
    end if;
    if (select prorettype from pg_proc where oid = v_oid) <> 'integer'::regtype then
      raise exception 'FINGERPRINT DIVERGENTE em public.proximo_codigo_empresa: tipo de retorno diferente de integer';
    end if;
    if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner where p.oid = v_oid) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.proximo_codigo_empresa: owner diferente de postgres';
    end if;

    -- Evidencia r8: proisstrict=false, proparallel='u'.
    if (select proisstrict from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.proximo_codigo_empresa: esperado NOT STRICT (proisstrict=false)';
    end if;
    if (select proparallel from pg_proc where oid = v_oid) <> 'u' then
      raise exception 'FINGERPRINT DIVERGENTE em public.proximo_codigo_empresa: esperado PARALLEL UNSAFE (proparallel=''u'')';
    end if;

    if replace(pg_get_functiondef(v_oid), chr(13), '') <> $corpo$CREATE OR REPLACE FUNCTION public.proximo_codigo_empresa()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select nextval('public.empresas_codigo_seq')::integer
$function$
$corpo$ then
      raise exception 'FINGERPRINT DIVERGENTE em public.proximo_codigo_empresa: corpo da funcao diverge do certificado';
    end if;

    if exists (
      select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
      where p.oid = v_oid and a.is_grantable
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.proximo_codigo_empresa: GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel, a.privilege_type as privilegio
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
      except
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      union all
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      except
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.proximo_codigo_empresa: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;
  end if;
end $$;

-- =============================================================================
-- 6. public.preparar_empresa_saas()
-- =============================================================================
do $$
declare
  v_oid oid;
  v_diff int;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'preparar_empresa_saas'
     and pg_get_function_identity_arguments(p.oid) = '';

  if v_oid is null then
    create or replace function public.preparar_empresa_saas()
    returns trigger
    language plpgsql
    security definer
    set search_path to 'public'
    as $function$
    begin
      if new.codigo is null then
        new.codigo := public.proximo_codigo_empresa();
      end if;

      new.slug := public.gerar_slug_empresa_unico(
        coalesce(nullif(btrim(new.slug), ''), new.nome),
        new.id,
        new.codigo
      );

      if new.plano is null or btrim(new.plano) = '' then
        new.plano := 'starter';
      end if;

      return new;
    end;
    $function$;

    alter function public.preparar_empresa_saas() owner to postgres;

    revoke all on function public.preparar_empresa_saas() from public, anon, authenticated, service_role, postgres;
    grant execute on function public.preparar_empresa_saas() to public, anon, authenticated, postgres, service_role;

  else
    if not (select prosecdef from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.preparar_empresa_saas: esperado SECURITY DEFINER';
    end if;
    if (select proconfig from pg_proc where oid = v_oid) is distinct from array['search_path=public'] then
      raise exception 'FINGERPRINT DIVERGENTE em public.preparar_empresa_saas: search_path diferente de ''public''';
    end if;
    if (select prorettype from pg_proc where oid = v_oid) <> 'trigger'::regtype then
      raise exception 'FINGERPRINT DIVERGENTE em public.preparar_empresa_saas: tipo de retorno diferente de trigger';
    end if;
    if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner where p.oid = v_oid) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.preparar_empresa_saas: owner diferente de postgres';
    end if;

    -- Evidencia r8: proisstrict=false, proparallel='u'.
    if (select proisstrict from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.preparar_empresa_saas: esperado NOT STRICT (proisstrict=false)';
    end if;
    if (select proparallel from pg_proc where oid = v_oid) <> 'u' then
      raise exception 'FINGERPRINT DIVERGENTE em public.preparar_empresa_saas: esperado PARALLEL UNSAFE (proparallel=''u'')';
    end if;

    if replace(pg_get_functiondef(v_oid), chr(13), '') <> $corpo$CREATE OR REPLACE FUNCTION public.preparar_empresa_saas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.codigo is null then
    new.codigo := public.proximo_codigo_empresa();
  end if;

  new.slug := public.gerar_slug_empresa_unico(
    coalesce(nullif(btrim(new.slug), ''), new.nome),
    new.id,
    new.codigo
  );

  if new.plano is null or btrim(new.plano) = '' then
    new.plano := 'starter';
  end if;

  return new;
end;
$function$
$corpo$ then
      raise exception 'FINGERPRINT DIVERGENTE em public.preparar_empresa_saas: corpo da funcao diverge do certificado';
    end if;

    if exists (
      select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
      where p.oid = v_oid and a.is_grantable
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.preparar_empresa_saas: GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel, a.privilege_type as privilegio
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
      except
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      union all
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      except
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.preparar_empresa_saas: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;
  end if;
end $$;

-- =============================================================================
-- 7. trigger empresas_preparar_saas ON public.empresas
--    Validacao estrutural via information_schema.triggers + tgattr
--    resolvido para nomes de coluna — nao depende de string inteira
--    montada a mao.
-- =============================================================================
do $$
declare
  v_eventos text[];
  v_diff int;
  v_trig record;
begin
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.empresas'::regclass
      and t.tgname = 'empresas_preparar_saas'
      and not t.tgisinternal
  ) then
    create trigger empresas_preparar_saas
      before insert or update of codigo, nome, slug, plano on public.empresas
      for each row execute function public.preparar_empresa_saas();
  else
    -- Catalogo completo via pg_trigger (evidencia r8), nao so
    -- information_schema.triggers: tgfoid resolvido por OID exato
    -- (schema+nome+assinatura via to_regprocedure, nunca so por
    -- proname), tgenabled, tgtype, tgnargs/tgargs, tgconstraint,
    -- tgisinternal.
    select t.tgrelid, t.tgfoid, t.tgenabled, t.tgtype,
           t.tgnargs, t.tgargs, t.tgconstraint, t.tgisinternal, t.tgqual
      into v_trig
      from pg_trigger t
     where t.tgrelid = 'public.empresas'::regclass and t.tgname = 'empresas_preparar_saas' and not t.tgisinternal;

    if v_trig.tgrelid <> 'public.empresas'::regclass then
      raise exception 'FINGERPRINT DIVERGENTE: trigger empresas_preparar_saas com tgrelid diferente de public.empresas';
    end if;
    if v_trig.tgfoid <> to_regprocedure('public.preparar_empresa_saas()') then
      raise exception 'FINGERPRINT DIVERGENTE: trigger empresas_preparar_saas com tgfoid nao apontando exatamente para public.preparar_empresa_saas()';
    end if;
    if v_trig.tgenabled <> 'O' then
      raise exception 'FINGERPRINT DIVERGENTE: trigger empresas_preparar_saas com tgenabled diferente de O (habilitado). Real: %', v_trig.tgenabled;
    end if;
    if v_trig.tgtype <> 23 then
      raise exception 'FINGERPRINT DIVERGENTE: trigger empresas_preparar_saas com tgtype diferente de 23. Real: %', v_trig.tgtype;
    end if;
    if v_trig.tgnargs <> 0 or octet_length(v_trig.tgargs) <> 0 then
      raise exception 'FINGERPRINT DIVERGENTE: trigger empresas_preparar_saas com argumentos, esperado nenhum';
    end if;
    if v_trig.tgconstraint <> 0 then
      raise exception 'FINGERPRINT DIVERGENTE: trigger empresas_preparar_saas e constraint trigger, esperado trigger comum';
    end if;
    if v_trig.tgisinternal then
      raise exception 'FINGERPRINT DIVERGENTE: trigger empresas_preparar_saas marcado tgisinternal, esperado false';
    end if;
    if v_trig.tgqual is not null then
      raise exception 'FINGERPRINT DIVERGENTE: trigger empresas_preparar_saas possui WHEN (tgqual), esperado nenhum';
    end if;
    select array_agg(distinct event_manipulation order by event_manipulation) into v_eventos
      from information_schema.triggers
     where event_object_schema = 'public' and event_object_table = 'empresas'
       and trigger_name = 'empresas_preparar_saas';

    if v_eventos is distinct from array['INSERT','UPDATE'] then
      raise exception 'FINGERPRINT DIVERGENTE: trigger empresas_preparar_saas com eventos diferentes de INSERT+UPDATE. Real: %', v_eventos;
    end if;

    if exists (
      select 1 from information_schema.triggers
      where event_object_schema = 'public' and event_object_table = 'empresas'
        and trigger_name = 'empresas_preparar_saas'
        and (action_timing <> 'BEFORE' or action_orientation <> 'ROW' or action_condition is not null
             or action_statement <> 'EXECUTE FUNCTION preparar_empresa_saas()')
    ) then
      raise exception 'FINGERPRINT DIVERGENTE: trigger empresas_preparar_saas com timing/orientacao/condicao/funcao diferente do esperado (BEFORE, ROW, sem WHEN, preparar_empresa_saas())';
    end if;

    -- UPDATE OF codigo, nome, slug, plano — tgattr resolvido para nomes.
    select count(*) into v_diff
    from (
      select a.attname
        from pg_trigger t
        join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = any(t.tgattr::int2[])
       where t.tgrelid = 'public.empresas'::regclass and t.tgname = 'empresas_preparar_saas' and not t.tgisinternal
      except
      select unnest(array['codigo','nome','slug','plano'])
      union all
      select unnest(array['codigo','nome','slug','plano'])
      except
      select a.attname
        from pg_trigger t
        join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = any(t.tgattr::int2[])
       where t.tgrelid = 'public.empresas'::regclass and t.tgname = 'empresas_preparar_saas' and not t.tgisinternal
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE: trigger empresas_preparar_saas com lista de colunas de UPDATE OF diferente do esperado (codigo, nome, slug, plano)';
    end if;
  end if;
end $$;

-- =============================================================================
-- 8. public.set_updated_at()
-- =============================================================================
do $$
declare
  v_oid oid;
  v_diff int;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_updated_at'
     and pg_get_function_identity_arguments(p.oid) = '';

  if v_oid is null then
    create or replace function public.set_updated_at()
    returns trigger
    language plpgsql
    as $function$
    begin
      new.updated_at = now();
      return new;
    end;
    $function$;

    alter function public.set_updated_at() owner to postgres;

    revoke all on function public.set_updated_at() from public, anon, authenticated, service_role, postgres;
    grant execute on function public.set_updated_at() to public, anon, authenticated, postgres, service_role;

  else
    if (select prosecdef from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_updated_at: esperado SECURITY INVOKER (nao DEFINER)';
    end if;
    if (select proconfig from pg_proc where oid = v_oid) is not null then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_updated_at: esperado sem search_path fixo';
    end if;
    if (select prorettype from pg_proc where oid = v_oid) <> 'trigger'::regtype then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_updated_at: tipo de retorno diferente de trigger';
    end if;
    if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner where p.oid = v_oid) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_updated_at: owner diferente de postgres';
    end if;

    -- Evidencia r8: proisstrict=false, proparallel='u'.
    if (select proisstrict from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_updated_at: esperado NOT STRICT (proisstrict=false)';
    end if;
    if (select proparallel from pg_proc where oid = v_oid) <> 'u' then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_updated_at: esperado PARALLEL UNSAFE (proparallel=''u'')';
    end if;

    if replace(pg_get_functiondef(v_oid), chr(13), '') <> $corpo$CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
$corpo$ then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_updated_at: corpo da funcao diverge do certificado';
    end if;

    if exists (
      select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
      where p.oid = v_oid and a.is_grantable
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_updated_at: GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel, a.privilege_type as privilegio
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
      except
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      union all
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      except
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_updated_at: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;
  end if;
end $$;

-- =============================================================================
-- 10b. public.set_empresa_id_from_usuario() — REALOCADA do arquivo 02
--      (Bootstrap Julho) para aqui. Motivo: o trigger
--      itens_industriais_set_empresa_id (bloco 12 abaixo, parte do
--      Estado Historico certificado de itens_industriais) precisa que
--      esta funcao ja exista no momento do CREATE TRIGGER — o OID e'
--      resolvido imediatamente (tgfoid), diferente de corpo de funcao
--      LANGUAGE sql, que e' deferido. Unica dependencia real desta
--      funcao (empresa_atual_id()) ja foi criada no bloco 9. Dependencia
--      transitiva a public.profiles/public.usuarios (dentro do corpo de
--      empresa_atual_id) so se manifesta em tempo de EXECUCAO do
--      trigger, nunca em tempo de CREATE FUNCTION/CREATE TRIGGER — mesma
--      tolerancia ja aprovada para usuario_e_admin() acima. Conteudo,
--      ACL e fingerprint IDENTICOS ao bloco que existia no arquivo 02 —
--      nenhuma nova versao da funcao foi criada, apenas reposicionada.
--      Evidencia historica: dump certificado 21/06/2026 ja mostra o
--      trigger itens_industriais_set_empresa_id apontando para esta
--      funcao (triggers.csv), confirmando que ela ja existia naquele
--      estado — sem alegar timestamp exato de criacao.
-- =============================================================================
do $$
declare
  v_oid oid;
  v_diff int;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='set_empresa_id_from_usuario'
     and pg_get_function_identity_arguments(p.oid) = '';

  if v_oid is null then
    create or replace function public.set_empresa_id_from_usuario()
    returns trigger
    language plpgsql
    security definer
    set search_path to 'public'
    as $function$
    begin
      if new.empresa_id is null then
        new.empresa_id := public.empresa_atual_id();
      end if;
      return new;
    end;
    $function$;

    alter function public.set_empresa_id_from_usuario() owner to postgres;

    revoke all on function public.set_empresa_id_from_usuario() from public, anon, authenticated, service_role, postgres;
    grant execute on function public.set_empresa_id_from_usuario() to public, anon, authenticated, postgres, service_role;

  else
    if not (select prosecdef from pg_proc where oid=v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_empresa_id_from_usuario: esperado SECURITY DEFINER';
    end if;
    if (select proconfig from pg_proc where oid=v_oid) is distinct from array['search_path=public'] then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_empresa_id_from_usuario: search_path diferente de ''public''';
    end if;
    if (select prorettype from pg_proc where oid = v_oid) <> 'trigger'::regtype then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_empresa_id_from_usuario: tipo de retorno diferente de trigger';
    end if;
    if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner where p.oid = v_oid) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_empresa_id_from_usuario: owner diferente de postgres';
    end if;

    -- Evidencia r8: proisstrict=false, proparallel='u'.
    if (select proisstrict from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_empresa_id_from_usuario: esperado NOT STRICT (proisstrict=false)';
    end if;
    if (select proparallel from pg_proc where oid = v_oid) <> 'u' then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_empresa_id_from_usuario: esperado PARALLEL UNSAFE (proparallel=''u'')';
    end if;

    if replace(pg_get_functiondef(v_oid), chr(13), '') <> $corpo$CREATE OR REPLACE FUNCTION public.set_empresa_id_from_usuario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.empresa_id is null then
    new.empresa_id := public.empresa_atual_id();
  end if;

  return new;
end;
$function$
$corpo$ then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_empresa_id_from_usuario: corpo da funcao diverge do certificado';
    end if;

    if exists (
      select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
      where p.oid = v_oid and a.is_grantable
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_empresa_id_from_usuario: GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel, a.privilege_type as privilegio
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
      except
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      union all
      select * from (values ('PUBLIC','EXECUTE'),('anon','EXECUTE'),('authenticated','EXECUTE'),('postgres','EXECUTE'),('service_role','EXECUTE')) as e(papel, privilegio)
      except
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type
        from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.oid = v_oid
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_empresa_id_from_usuario: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;
  end if;
end $$;

-- =============================================================================
-- 11. public.clientes — ESTADO HISTORICO (coluna empresa, 4 policies,
--     17 indices) OU ESTADO ATUAL (nome_fantasia, 3 policies, 18
--     indices). Criacao usa flag local (v_recem_criada). Classificador
--     H-ou-O conjunto no ramo existente.
-- =============================================================================
do $$
declare
  v_diff int;
  v_recem_criada boolean;
  v_col_h boolean; v_col_o boolean;
  v_def boolean;
  v_idgen boolean; v_collation boolean;
  v_con boolean;
  v_idx_h boolean; v_idx_o boolean;
  v_pol_h boolean; v_pol_o boolean;
  v_trig boolean;
  v_rls boolean; v_owner boolean; v_acl boolean;
  v_estado_h boolean; v_estado_o boolean;
begin
  if to_regclass('public.clientes') is null then
    v_recem_criada := true;

    create table public.clientes (
      id uuid primary key default gen_random_uuid(),
      nome text not null,
      empresa text,
      telefone text,
      email text,
      cnpj text,
      cidade text,
      observacoes text,
      created_at timestamptz not null default now(),
      created_by uuid not null,
      empresa_id uuid not null,
      ativo boolean not null default true,
      updated_at timestamptz not null default now(),
      deleted_at timestamptz,
      deleted_by uuid,
      inscricao_estadual text,
      inscricao_municipal text,
      telefone_fiscal text,
      email_fiscal text,
      site text,
      estado text,
      segmento text,
      endereco text,
      numero text,
      bairro text,
      cep text,
      complemento text
    );

    alter table public.clientes
      add constraint clientes_created_by_fkey
        foreign key (created_by) references auth.users(id) on delete restrict,
      add constraint clientes_deleted_by_fkey
        foreign key (deleted_by) references auth.users(id) on delete set null,
      add constraint clientes_empresa_id_fkey
        foreign key (empresa_id) references public.empresas(id) on delete restrict;

    alter table public.clientes enable row level security;
    alter table public.clientes owner to postgres;

    comment on table public.clientes is
      'Bootstrap retroativo (bloco Junho) — estado historico comprovado por dump certificado 2026-06-21. Coluna "empresa" (nao "nome_fantasia") e o nome historico real; o rename para nome_fantasia e aplicado pela migration real 202607050001, que roda depois.';

    create policy "admins podem editar clientes" on public.clientes
      for update to authenticated
      using (public.usuario_e_admin())
      with check (public.usuario_e_admin());

    create policy "admins podem excluir clientes" on public.clientes
      for delete to authenticated
      using (public.usuario_e_admin());

    create policy "usuarios autenticados podem criar clientes" on public.clientes
      for insert to authenticated
      with check (created_by = auth.uid());

    create policy "usuarios autenticados podem visualizar clientes" on public.clientes
      for select to authenticated
      using (true);

    revoke all on public.clientes from public, anon, authenticated, service_role, postgres;
    grant insert, maintain, references, select, trigger, truncate, update
      on public.clientes to anon, authenticated;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.clientes to postgres, service_role;

    create index clientes_ativo_idx on public.clientes using btree (ativo);
    create index clientes_cidade_idx on public.clientes using btree (cidade);
    create index clientes_cnpj_idx on public.clientes using btree (cnpj);
    create index clientes_created_at_idx on public.clientes using btree (created_at desc);
    create index clientes_created_by_idx on public.clientes using btree (created_by);
    create index clientes_deleted_at_idx on public.clientes using btree (deleted_at);
    create index clientes_deleted_by_idx on public.clientes using btree (deleted_by);
    create index clientes_email_idx on public.clientes using btree (email);
    create index clientes_empresa_ativo_deleted_at_idx on public.clientes using btree (empresa_id, ativo, deleted_at);
    create index clientes_empresa_codigo_idx on public.clientes using btree (empresa_id, nome);
    create index clientes_empresa_deleted_at_idx on public.clientes using btree (empresa_id, deleted_at);
    create index clientes_empresa_id_ativo_idx on public.clientes using btree (empresa_id, ativo);
    create index clientes_empresa_idx on public.clientes using btree (empresa);
    create index clientes_empresa_updated_at_idx on public.clientes using btree (empresa_id, updated_at desc);
    create index clientes_nome_idx on public.clientes using btree (nome);
    create index clientes_updated_at_idx on public.clientes using btree (updated_at desc);

    create trigger clientes_set_updated_at
      before update on public.clientes
      for each row execute function public.set_updated_at();

  else
    v_recem_criada := false;

    -- Colunas: H (empresa) ou O (nome_fantasia) — as outras 26 colunas
    -- sao identicas nos dois estados.
    select count(*) = 0 into v_col_h
    from (
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='clientes'
      except
      select * from (values
        ('id','uuid','NO'),('nome','text','NO'),('empresa','text','YES'),
        ('telefone','text','YES'),('email','text','YES'),('cnpj','text','YES'),
        ('cidade','text','YES'),('observacoes','text','YES'),
        ('created_at','timestamp with time zone','NO'),('created_by','uuid','NO'),
        ('empresa_id','uuid','NO'),('ativo','boolean','NO'),
        ('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('deleted_by','uuid','YES'),('inscricao_estadual','text','YES'),
        ('inscricao_municipal','text','YES'),('telefone_fiscal','text','YES'),
        ('email_fiscal','text','YES'),('site','text','YES'),('estado','text','YES'),
        ('segmento','text','YES'),('endereco','text','YES'),('numero','text','YES'),
        ('bairro','text','YES'),('cep','text','YES'),('complemento','text','YES')
      ) as e(column_name, data_type, is_nullable)
      union all
      select * from (values
        ('id','uuid','NO'),('nome','text','NO'),('empresa','text','YES'),
        ('telefone','text','YES'),('email','text','YES'),('cnpj','text','YES'),
        ('cidade','text','YES'),('observacoes','text','YES'),
        ('created_at','timestamp with time zone','NO'),('created_by','uuid','NO'),
        ('empresa_id','uuid','NO'),('ativo','boolean','NO'),
        ('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('deleted_by','uuid','YES'),('inscricao_estadual','text','YES'),
        ('inscricao_municipal','text','YES'),('telefone_fiscal','text','YES'),
        ('email_fiscal','text','YES'),('site','text','YES'),('estado','text','YES'),
        ('segmento','text','YES'),('endereco','text','YES'),('numero','text','YES'),
        ('bairro','text','YES'),('cep','text','YES'),('complemento','text','YES')
      ) as e(column_name, data_type, is_nullable)
      except
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='clientes'
    ) as divergentes;

    select count(*) = 0 into v_col_o
    from (
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='clientes'
      except
      select * from (values
        ('id','uuid','NO'),('nome','text','NO'),('nome_fantasia','text','YES'),
        ('telefone','text','YES'),('email','text','YES'),('cnpj','text','YES'),
        ('cidade','text','YES'),('observacoes','text','YES'),
        ('created_at','timestamp with time zone','NO'),('created_by','uuid','NO'),
        ('empresa_id','uuid','NO'),('ativo','boolean','NO'),
        ('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('deleted_by','uuid','YES'),('inscricao_estadual','text','YES'),
        ('inscricao_municipal','text','YES'),('telefone_fiscal','text','YES'),
        ('email_fiscal','text','YES'),('site','text','YES'),('estado','text','YES'),
        ('segmento','text','YES'),('endereco','text','YES'),('numero','text','YES'),
        ('bairro','text','YES'),('cep','text','YES'),('complemento','text','YES')
      ) as e(column_name, data_type, is_nullable)
      union all
      select * from (values
        ('id','uuid','NO'),('nome','text','NO'),('nome_fantasia','text','YES'),
        ('telefone','text','YES'),('email','text','YES'),('cnpj','text','YES'),
        ('cidade','text','YES'),('observacoes','text','YES'),
        ('created_at','timestamp with time zone','NO'),('created_by','uuid','NO'),
        ('empresa_id','uuid','NO'),('ativo','boolean','NO'),
        ('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('deleted_by','uuid','YES'),('inscricao_estadual','text','YES'),
        ('inscricao_municipal','text','YES'),('telefone_fiscal','text','YES'),
        ('email_fiscal','text','YES'),('site','text','YES'),('estado','text','YES'),
        ('segmento','text','YES'),('endereco','text','YES'),('numero','text','YES'),
        ('bairro','text','YES'),('cep','text','YES'),('complemento','text','YES')
      ) as e(column_name, data_type, is_nullable)
      except
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='clientes'
    ) as divergentes;

    -- Defaults: id/created_at/ativo/updated_at, comuns a H e O (nem
    -- 'empresa' nem 'nome_fantasia' jamais tiveram default).
    select count(*) = 0 into v_def
    from (
      select a.attname as coluna, pg_get_expr(ad.adbin, ad.adrelid) as default_real
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.clientes'::regclass
         and a.attname = any(array['id','nome','nome_fantasia','empresa','telefone','email','cnpj','cidade','observacoes','created_at','created_by','empresa_id','ativo','updated_at','deleted_at','deleted_by','inscricao_estadual','inscricao_municipal','telefone_fiscal','email_fiscal','site','estado','segmento','endereco','numero','bairro','cep','complemento'])
      except
      select * from (values ('id','gen_random_uuid()'), ('created_at','now()'), ('ativo','true'), ('updated_at','now()')) as e(coluna, default_esperado)
      union all
      select * from (values ('id','gen_random_uuid()'), ('created_at','now()'), ('ativo','true'), ('updated_at','now()')) as e(coluna, default_esperado)
      except
      select a.attname, pg_get_expr(ad.adbin, ad.adrelid)
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.clientes'::regclass
         and a.attname = any(array['id','nome','nome_fantasia','empresa','telefone','email','cnpj','cidade','observacoes','created_at','created_by','empresa_id','ativo','updated_at','deleted_at','deleted_by','inscricao_estadual','inscricao_municipal','telefone_fiscal','email_fiscal','site','estado','segmento','endereco','numero','bairro','cep','complemento'])
    ) as divergentes;

    v_idgen := not exists (
      select 1 from pg_attribute a
      where a.attrelid = 'public.clientes'::regclass and a.attnum > 0 and not a.attisdropped
        and (a.attidentity <> '' or a.attgenerated <> '')
    );

    v_collation := not exists (
      select 1 from pg_attribute a
      left join pg_collation col on col.oid = a.attcollation
      where a.attrelid = 'public.clientes'::regclass and a.attnum > 0 and not a.attisdropped
        and coalesce(col.collname, 'default') <> 'default'
    );

    -- Constraints: identicas em H e O (pkey + 3 FKs; nenhuma migration
    -- real altera constraints de clientes) — mesmo teste v_con usado em
    -- ambos os fingerprints, igual ao padrao ja aprovado para usuarios/
    -- credenciais/funcionarios.
    select count(*) = 0 into v_con
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.clientes'::regclass
      except
      select * from (values
        ('clientes_pkey','p','PRIMARY KEY (id)'),
        ('clientes_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT'),
        ('clientes_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
        ('clientes_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('clientes_pkey','p','PRIMARY KEY (id)'),
        ('clientes_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT'),
        ('clientes_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
        ('clientes_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.clientes'::regclass
    ) as divergentes;

    v_rls := (select relrowsecurity from pg_class where oid = 'public.clientes'::regclass)
             and not (select relforcerowsecurity from pg_class where oid = 'public.clientes'::regclass);

    v_owner := (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.clientes'::regclass) = 'postgres';

    -- ACL normativa atual (nao alega ACL historica) — mesma constante
    -- para H e O, ja aplicada tambem no ramo de criacao (sem DELETE
    -- para anon/authenticated, reflexo de 202607050001).
    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.clientes'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.clientes: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) = 0 into v_acl
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.clientes'::regclass and a.grantee <> 0
      except
      select * from (values
        ('anon','INSERT'),('anon','MAINTAIN'),('anon','REFERENCES'),('anon','SELECT'),('anon','TRIGGER'),('anon','TRUNCATE'),('anon','UPDATE'),
        ('authenticated','INSERT'),('authenticated','MAINTAIN'),('authenticated','REFERENCES'),('authenticated','SELECT'),('authenticated','TRIGGER'),('authenticated','TRUNCATE'),('authenticated','UPDATE'),
        ('postgres','DELETE'),('postgres','INSERT'),('postgres','MAINTAIN'),('postgres','REFERENCES'),('postgres','SELECT'),('postgres','TRIGGER'),('postgres','TRUNCATE'),('postgres','UPDATE'),
        ('service_role','DELETE'),('service_role','INSERT'),('service_role','MAINTAIN'),('service_role','REFERENCES'),('service_role','SELECT'),('service_role','TRIGGER'),('service_role','TRUNCATE'),('service_role','UPDATE')
      ) as e(papel, privilegio)
      union all
      select * from (values
        ('anon','INSERT'),('anon','MAINTAIN'),('anon','REFERENCES'),('anon','SELECT'),('anon','TRIGGER'),('anon','TRUNCATE'),('anon','UPDATE'),
        ('authenticated','INSERT'),('authenticated','MAINTAIN'),('authenticated','REFERENCES'),('authenticated','SELECT'),('authenticated','TRIGGER'),('authenticated','TRUNCATE'),('authenticated','UPDATE'),
        ('postgres','DELETE'),('postgres','INSERT'),('postgres','MAINTAIN'),('postgres','REFERENCES'),('postgres','SELECT'),('postgres','TRIGGER'),('postgres','TRUNCATE'),('postgres','UPDATE'),
        ('service_role','DELETE'),('service_role','INSERT'),('service_role','MAINTAIN'),('service_role','REFERENCES'),('service_role','SELECT'),('service_role','TRIGGER'),('service_role','TRUNCATE'),('service_role','UPDATE')
      ) as e(papel, privilegio)
      except
      select a.grantee::regrole::text, a.privilege_type
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.clientes'::regclass and a.grantee <> 0
    ) as divergentes;

    -- Policies: H = 4 historicas exatas; O = 3 atuais exatas
    -- (clientes_select/insert/update, texto pos-202607190001).
    select count(*) = 0 into v_pol_h
    from (
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname = 'public' and tablename = 'clientes'
      except
      select * from (values
        ('admins podem editar clientes','PERMISSIVE','UPDATE',array['authenticated']::name[],'usuario_e_admin()','usuario_e_admin()'),
        ('admins podem excluir clientes','PERMISSIVE','DELETE',array['authenticated']::name[],'usuario_e_admin()',null),
        ('usuarios autenticados podem criar clientes','PERMISSIVE','INSERT',array['authenticated']::name[],null,'(created_by = auth.uid())'),
        ('usuarios autenticados podem visualizar clientes','PERMISSIVE','SELECT',array['authenticated']::name[],'true',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('admins podem editar clientes','PERMISSIVE','UPDATE',array['authenticated']::name[],'usuario_e_admin()','usuario_e_admin()'),
        ('admins podem excluir clientes','PERMISSIVE','DELETE',array['authenticated']::name[],'usuario_e_admin()',null),
        ('usuarios autenticados podem criar clientes','PERMISSIVE','INSERT',array['authenticated']::name[],null,'(created_by = auth.uid())'),
        ('usuarios autenticados podem visualizar clientes','PERMISSIVE','SELECT',array['authenticated']::name[],'true',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname = 'public' and tablename = 'clientes'
    ) as divergentes;

    select count(*) = 0 into v_pol_o
    from (
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname = 'public' and tablename = 'clientes'
      except
      select * from (values
        ('clientes_select','PERMISSIVE','SELECT',array['authenticated']::name[],'(empresa_id = empresa_atual_id())',null),
        ('clientes_insert','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((empresa_id = empresa_atual_id()) AND (created_by = auth.uid()))'),
        ('clientes_update','PERMISSIVE','UPDATE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))','((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))')
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('clientes_select','PERMISSIVE','SELECT',array['authenticated']::name[],'(empresa_id = empresa_atual_id())',null),
        ('clientes_insert','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((empresa_id = empresa_atual_id()) AND (created_by = auth.uid()))'),
        ('clientes_update','PERMISSIVE','UPDATE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))','((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))')
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname = 'public' and tablename = 'clientes'
    ) as divergentes;

    -- Indices: H (17, com clientes_empresa_idx) ou O (18, com
    -- clientes_nome_fantasia_idx + clientes_empresa_cnpj_uniq novo).
    select count(*) = 0 into v_idx_h
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.clientes'::regclass
      except
      select * from (values
        ('clientes_ativo_idx',false,false,true,true,'btree','CREATE INDEX clientes_ativo_idx ON public.clientes USING btree (ativo)'),
        ('clientes_cidade_idx',false,false,true,true,'btree','CREATE INDEX clientes_cidade_idx ON public.clientes USING btree (cidade)'),
        ('clientes_cnpj_idx',false,false,true,true,'btree','CREATE INDEX clientes_cnpj_idx ON public.clientes USING btree (cnpj)'),
        ('clientes_created_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_created_at_idx ON public.clientes USING btree (created_at DESC)'),
        ('clientes_created_by_idx',false,false,true,true,'btree','CREATE INDEX clientes_created_by_idx ON public.clientes USING btree (created_by)'),
        ('clientes_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_deleted_at_idx ON public.clientes USING btree (deleted_at)'),
        ('clientes_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX clientes_deleted_by_idx ON public.clientes USING btree (deleted_by)'),
        ('clientes_email_idx',false,false,true,true,'btree','CREATE INDEX clientes_email_idx ON public.clientes USING btree (email)'),
        ('clientes_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_ativo_deleted_at_idx ON public.clientes USING btree (empresa_id, ativo, deleted_at)'),
        ('clientes_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_codigo_idx ON public.clientes USING btree (empresa_id, nome)'),
        ('clientes_empresa_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_deleted_at_idx ON public.clientes USING btree (empresa_id, deleted_at)'),
        ('clientes_empresa_id_ativo_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_id_ativo_idx ON public.clientes USING btree (empresa_id, ativo)'),
        ('clientes_empresa_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_idx ON public.clientes USING btree (empresa)'),
        ('clientes_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_updated_at_idx ON public.clientes USING btree (empresa_id, updated_at DESC)'),
        ('clientes_nome_idx',false,false,true,true,'btree','CREATE INDEX clientes_nome_idx ON public.clientes USING btree (nome)'),
        ('clientes_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX clientes_pkey ON public.clientes USING btree (id)'),
        ('clientes_updated_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_updated_at_idx ON public.clientes USING btree (updated_at DESC)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('clientes_ativo_idx',false,false,true,true,'btree','CREATE INDEX clientes_ativo_idx ON public.clientes USING btree (ativo)'),
        ('clientes_cidade_idx',false,false,true,true,'btree','CREATE INDEX clientes_cidade_idx ON public.clientes USING btree (cidade)'),
        ('clientes_cnpj_idx',false,false,true,true,'btree','CREATE INDEX clientes_cnpj_idx ON public.clientes USING btree (cnpj)'),
        ('clientes_created_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_created_at_idx ON public.clientes USING btree (created_at DESC)'),
        ('clientes_created_by_idx',false,false,true,true,'btree','CREATE INDEX clientes_created_by_idx ON public.clientes USING btree (created_by)'),
        ('clientes_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_deleted_at_idx ON public.clientes USING btree (deleted_at)'),
        ('clientes_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX clientes_deleted_by_idx ON public.clientes USING btree (deleted_by)'),
        ('clientes_email_idx',false,false,true,true,'btree','CREATE INDEX clientes_email_idx ON public.clientes USING btree (email)'),
        ('clientes_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_ativo_deleted_at_idx ON public.clientes USING btree (empresa_id, ativo, deleted_at)'),
        ('clientes_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_codigo_idx ON public.clientes USING btree (empresa_id, nome)'),
        ('clientes_empresa_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_deleted_at_idx ON public.clientes USING btree (empresa_id, deleted_at)'),
        ('clientes_empresa_id_ativo_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_id_ativo_idx ON public.clientes USING btree (empresa_id, ativo)'),
        ('clientes_empresa_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_idx ON public.clientes USING btree (empresa)'),
        ('clientes_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_updated_at_idx ON public.clientes USING btree (empresa_id, updated_at DESC)'),
        ('clientes_nome_idx',false,false,true,true,'btree','CREATE INDEX clientes_nome_idx ON public.clientes USING btree (nome)'),
        ('clientes_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX clientes_pkey ON public.clientes USING btree (id)'),
        ('clientes_updated_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_updated_at_idx ON public.clientes USING btree (updated_at DESC)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.clientes'::regclass
    ) as divergentes;

    select count(*) = 0 into v_idx_o
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.clientes'::regclass
      except
      select * from (values
        ('clientes_ativo_idx',false,false,true,true,'btree','CREATE INDEX clientes_ativo_idx ON public.clientes USING btree (ativo)'),
        ('clientes_cidade_idx',false,false,true,true,'btree','CREATE INDEX clientes_cidade_idx ON public.clientes USING btree (cidade)'),
        ('clientes_cnpj_idx',false,false,true,true,'btree','CREATE INDEX clientes_cnpj_idx ON public.clientes USING btree (cnpj)'),
        ('clientes_created_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_created_at_idx ON public.clientes USING btree (created_at DESC)'),
        ('clientes_created_by_idx',false,false,true,true,'btree','CREATE INDEX clientes_created_by_idx ON public.clientes USING btree (created_by)'),
        ('clientes_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_deleted_at_idx ON public.clientes USING btree (deleted_at)'),
        ('clientes_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX clientes_deleted_by_idx ON public.clientes USING btree (deleted_by)'),
        ('clientes_email_idx',false,false,true,true,'btree','CREATE INDEX clientes_email_idx ON public.clientes USING btree (email)'),
        ('clientes_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_ativo_deleted_at_idx ON public.clientes USING btree (empresa_id, ativo, deleted_at)'),
        ('clientes_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_codigo_idx ON public.clientes USING btree (empresa_id, nome)'),
        ('clientes_empresa_cnpj_uniq',true,false,true,true,'btree','CREATE UNIQUE INDEX clientes_empresa_cnpj_uniq ON public.clientes USING btree (empresa_id, regexp_replace(cnpj, ''\D''::text, ''''::text, ''g''::text)) WHERE ((cnpj IS NOT NULL) AND (btrim(cnpj) <> ''''::text) AND (deleted_at IS NULL))'),
        ('clientes_empresa_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_deleted_at_idx ON public.clientes USING btree (empresa_id, deleted_at)'),
        ('clientes_empresa_id_ativo_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_id_ativo_idx ON public.clientes USING btree (empresa_id, ativo)'),
        ('clientes_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_updated_at_idx ON public.clientes USING btree (empresa_id, updated_at DESC)'),
        ('clientes_nome_fantasia_idx',false,false,true,true,'btree','CREATE INDEX clientes_nome_fantasia_idx ON public.clientes USING btree (nome_fantasia)'),
        ('clientes_nome_idx',false,false,true,true,'btree','CREATE INDEX clientes_nome_idx ON public.clientes USING btree (nome)'),
        ('clientes_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX clientes_pkey ON public.clientes USING btree (id)'),
        ('clientes_updated_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_updated_at_idx ON public.clientes USING btree (updated_at DESC)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('clientes_ativo_idx',false,false,true,true,'btree','CREATE INDEX clientes_ativo_idx ON public.clientes USING btree (ativo)'),
        ('clientes_cidade_idx',false,false,true,true,'btree','CREATE INDEX clientes_cidade_idx ON public.clientes USING btree (cidade)'),
        ('clientes_cnpj_idx',false,false,true,true,'btree','CREATE INDEX clientes_cnpj_idx ON public.clientes USING btree (cnpj)'),
        ('clientes_created_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_created_at_idx ON public.clientes USING btree (created_at DESC)'),
        ('clientes_created_by_idx',false,false,true,true,'btree','CREATE INDEX clientes_created_by_idx ON public.clientes USING btree (created_by)'),
        ('clientes_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_deleted_at_idx ON public.clientes USING btree (deleted_at)'),
        ('clientes_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX clientes_deleted_by_idx ON public.clientes USING btree (deleted_by)'),
        ('clientes_email_idx',false,false,true,true,'btree','CREATE INDEX clientes_email_idx ON public.clientes USING btree (email)'),
        ('clientes_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_ativo_deleted_at_idx ON public.clientes USING btree (empresa_id, ativo, deleted_at)'),
        ('clientes_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_codigo_idx ON public.clientes USING btree (empresa_id, nome)'),
        ('clientes_empresa_cnpj_uniq',true,false,true,true,'btree','CREATE UNIQUE INDEX clientes_empresa_cnpj_uniq ON public.clientes USING btree (empresa_id, regexp_replace(cnpj, ''\D''::text, ''''::text, ''g''::text)) WHERE ((cnpj IS NOT NULL) AND (btrim(cnpj) <> ''''::text) AND (deleted_at IS NULL))'),
        ('clientes_empresa_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_deleted_at_idx ON public.clientes USING btree (empresa_id, deleted_at)'),
        ('clientes_empresa_id_ativo_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_id_ativo_idx ON public.clientes USING btree (empresa_id, ativo)'),
        ('clientes_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_empresa_updated_at_idx ON public.clientes USING btree (empresa_id, updated_at DESC)'),
        ('clientes_nome_fantasia_idx',false,false,true,true,'btree','CREATE INDEX clientes_nome_fantasia_idx ON public.clientes USING btree (nome_fantasia)'),
        ('clientes_nome_idx',false,false,true,true,'btree','CREATE INDEX clientes_nome_idx ON public.clientes USING btree (nome)'),
        ('clientes_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX clientes_pkey ON public.clientes USING btree (id)'),
        ('clientes_updated_at_idx',false,false,true,true,'btree','CREATE INDEX clientes_updated_at_idx ON public.clientes USING btree (updated_at DESC)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.clientes'::regclass
    ) as divergentes;

    -- Triggers: clientes_set_updated_at pertence tanto a H quanto a O
    -- (dump certificado 21/06/2026 ja o mostra; nunca alterado desde
    -- entao) — mesmo teste participa dos dois fingerprints. Conjunto
    -- total exato: nenhum trigger adicional, nenhum ausente.
    select count(*) = 0 into v_trig
    from (
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,'') as tgattr, t.tgenabled, t.tgnargs, octet_length(t.tgargs) as tgargs_len, t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.clientes'::regclass and not t.tgisinternal
      except
      select * from (values ('clientes_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false)) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      union all
      select * from (values ('clientes_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false)) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      except
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,''), t.tgenabled, t.tgnargs, octet_length(t.tgargs), t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.clientes'::regclass and not t.tgisinternal
    ) as divergentes;

    v_estado_h := v_col_h and v_def and v_idgen and v_collation and v_con and v_idx_h and v_pol_h and v_trig and v_rls and v_owner and v_acl;
    v_estado_o := v_col_o and v_def and v_idgen and v_collation and v_con and v_idx_o and v_pol_o and v_trig and v_rls and v_owner and v_acl;

    if v_estado_h or v_estado_o then
      null;
    else
      raise exception 'FINGERPRINT DIVERGENTE em public.clientes: nao corresponde integralmente a ESTADO HISTORICO nem a ESTADO ATUAL (hibrido/parcial/desconhecido). colunas(H=%,O=%) defaults(%) constraints(%) indices(H=%,O=%) policies(H=%,O=%) triggers(%) rls(%) owner(%) acl(%)',
        v_col_h, v_col_o, v_def, v_con, v_idx_h, v_idx_o, v_pol_h, v_pol_o, v_trig, v_rls, v_owner, v_acl;
    end if;

  end if;
end $$;

-- =============================================================================
-- 12. public.itens_industriais — ESTADO HISTORICO RESTAURAVEL CERTIFICADO
--     EM 21/06/2026 (dump nexotfe_public_20260621_000436.dump). NAO usa
--     202606050032 como fonte do estado — essa migration (17 colunas,
--     pn/tipo NOT NULL, 0 policies, 0 triggers) descreve um estado
--     transitorio nunca certificado; entre 05/06 e 21/06/2026 o objeto
--     ja havia sido transformado por via nao rastreada em migration
--     local para o estado de 26 colunas abaixo, ja com 4 policies e 2
--     triggers fundacionais. 202606050032 passa a ser tratada so como
--     replay posterior tolerado (CREATE TABLE IF NOT EXISTS = no-op
--     contra H; os 3 COMMENT ON COLUMN que a seguem continuam validos
--     porque pn/tipo/unidade permanecem presentes em H).
--     ESTADO ATUAL (O) = H + coluna unidade_id (20260825170000, unica
--     migration real que toca esta tabela depois do dump).
--     Classificador conjunto H-ou-O: nenhum atributo e avaliado de
--     forma independente — so aceita se TODOS os atributos (colunas,
--     defaults, constraints, indices, policies, triggers, RLS, owner,
--     ACL) apontarem simultaneamente para H ou simultaneamente para O.
-- =============================================================================
do $$
declare
  v_diff int;
  v_col_h boolean; v_col_o boolean;
  v_def_h boolean; v_def_o boolean;
  v_idgen boolean; v_collation boolean;
  v_con_h boolean; v_con_o boolean;
  v_idx_h boolean; v_idx_o boolean;
  v_pol boolean;
  v_trig_h boolean; v_trig_o boolean;
  v_rls boolean; v_owner boolean; v_acl boolean;
  v_estado_h boolean; v_estado_o boolean;
begin
  if to_regclass('public.itens_industriais') is null then

    create table public.itens_industriais (
      id uuid primary key default gen_random_uuid(),
      empresa_id uuid not null references public.empresas(id) on delete restrict,
      codigo text not null,
      descricao text not null,
      unidade text not null,
      tipo_item text not null,
      codigo_ean_gtin text,
      codigo_ncm text,
      familia text,
      classificacao text,
      recomendacao_fiscal text,
      observacoes text,
      pdf_tecnico_path text,
      pdf_tecnico_nome text,
      referencia_arquivo_externo text,
      caminho_engenharia text,
      revisao_desenho text,
      ativo boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz,
      created_by uuid not null references auth.users(id),
      deleted_by uuid references auth.users(id),
      valor_referencia numeric,
      pn text,
      tipo text,
      constraint itens_industriais_tipo_item_check check (
        tipo_item = any (array['produto acabado','semiacabado','materia-prima','material consumo','ferramenta','servico'])
      ),
      constraint itens_industriais_unidade_check check (
        unidade = any (array['peca','conjunto','kg','metro','unidade','litro','pacote'])
      )
    );

    alter table public.itens_industriais enable row level security;
    alter table public.itens_industriais owner to postgres;

    revoke all on public.itens_industriais from public, anon, authenticated, service_role, postgres;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.itens_industriais to anon, authenticated, postgres, service_role;

    create index itens_industriais_ativo_idx on public.itens_industriais using btree (ativo);
    create index itens_industriais_codigo_idx on public.itens_industriais using btree (codigo);
    create index itens_industriais_deleted_at_idx on public.itens_industriais using btree (deleted_at);
    create index itens_industriais_empresa_ativo_deleted_idx on public.itens_industriais using btree (empresa_id, ativo, deleted_at);
    create index itens_industriais_empresa_codigo_idx on public.itens_industriais using btree (empresa_id, codigo);
    create unique index itens_industriais_empresa_codigo_unique_idx on public.itens_industriais using btree (empresa_id, codigo);
    create index itens_industriais_empresa_id_idx on public.itens_industriais using btree (empresa_id);
    create index itens_industriais_empresa_tipo_item_idx on public.itens_industriais using btree (empresa_id, tipo_item);
    create index itens_industriais_tipo_item_idx on public.itens_industriais using btree (tipo_item);
    create index itens_industriais_unidade_idx on public.itens_industriais using btree (unidade);
    create index itens_industriais_updated_at_idx on public.itens_industriais using btree (updated_at desc);

    create policy "nexotfe itens delete admin mesma empresa" on public.itens_industriais
      for delete to authenticated
      using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

    create policy "nexotfe itens insert mesma empresa" on public.itens_industriais
      for insert to authenticated
      with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid());

    create policy "nexotfe itens select mesma empresa" on public.itens_industriais
      for select to authenticated
      using (empresa_id = public.empresa_atual_id());

    create policy "nexotfe itens update mesma empresa" on public.itens_industriais
      for update to authenticated
      using (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()))
      with check (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()));

    create trigger itens_industriais_set_empresa_id
      before insert on public.itens_industriais
      for each row execute function public.set_empresa_id_from_usuario();

    create trigger itens_industriais_set_updated_at
      before update on public.itens_industriais
      for each row execute function public.set_updated_at();

  else

    -- Invariantes comuns a H e O (nao discriminam estado) ------------------
    v_owner := (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.itens_industriais'::regclass) = 'postgres';

    v_rls := (select relrowsecurity from pg_class where oid = 'public.itens_industriais'::regclass)
             and not (select relforcerowsecurity from pg_class where oid = 'public.itens_industriais'::regclass);

    v_idgen := not exists (
      select 1 from pg_attribute a
      where a.attrelid = 'public.itens_industriais'::regclass and a.attnum > 0 and not a.attisdropped
        and (a.attidentity <> '' or a.attgenerated <> '')
    );

    v_collation := not exists (
      select 1 from pg_attribute a
      left join pg_collation col on col.oid = a.attcollation
      where a.attrelid = 'public.itens_industriais'::regclass and a.attnum > 0 and not a.attisdropped
        and coalesce(col.collname, 'default') <> 'default'
    );

    select count(*) = 0 into v_acl
    from (
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.itens_industriais'::regclass
      except
      select * from (values
        ('anon','DELETE'),('anon','INSERT'),('anon','MAINTAIN'),('anon','REFERENCES'),('anon','SELECT'),('anon','TRIGGER'),('anon','TRUNCATE'),('anon','UPDATE'),
        ('authenticated','DELETE'),('authenticated','INSERT'),('authenticated','MAINTAIN'),('authenticated','REFERENCES'),('authenticated','SELECT'),('authenticated','TRIGGER'),('authenticated','TRUNCATE'),('authenticated','UPDATE'),
        ('postgres','DELETE'),('postgres','INSERT'),('postgres','MAINTAIN'),('postgres','REFERENCES'),('postgres','SELECT'),('postgres','TRIGGER'),('postgres','TRUNCATE'),('postgres','UPDATE'),
        ('service_role','DELETE'),('service_role','INSERT'),('service_role','MAINTAIN'),('service_role','REFERENCES'),('service_role','SELECT'),('service_role','TRIGGER'),('service_role','TRUNCATE'),('service_role','UPDATE')
      ) as e(papel, privilegio)
      union all
      select * from (values
        ('anon','DELETE'),('anon','INSERT'),('anon','MAINTAIN'),('anon','REFERENCES'),('anon','SELECT'),('anon','TRIGGER'),('anon','TRUNCATE'),('anon','UPDATE'),
        ('authenticated','DELETE'),('authenticated','INSERT'),('authenticated','MAINTAIN'),('authenticated','REFERENCES'),('authenticated','SELECT'),('authenticated','TRIGGER'),('authenticated','TRUNCATE'),('authenticated','UPDATE'),
        ('postgres','DELETE'),('postgres','INSERT'),('postgres','MAINTAIN'),('postgres','REFERENCES'),('postgres','SELECT'),('postgres','TRIGGER'),('postgres','TRUNCATE'),('postgres','UPDATE'),
        ('service_role','DELETE'),('service_role','INSERT'),('service_role','MAINTAIN'),('service_role','REFERENCES'),('service_role','SELECT'),('service_role','TRIGGER'),('service_role','TRUNCATE'),('service_role','UPDATE')
      ) as e(papel, privilegio)
      except
      select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.itens_industriais'::regclass
    ) as divergentes;

    select count(*) = 0 into v_pol
    from (
      select policyname, permissive, cmd,
             (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname = 'public' and tablename = 'itens_industriais'
      except
      select * from (values
        ('nexotfe itens delete admin mesma empresa','PERMISSIVE','DELETE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND usuario_e_admin())',null),
        ('nexotfe itens insert mesma empresa','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((empresa_id = empresa_atual_id()) AND (created_by = auth.uid()))'),
        ('nexotfe itens select mesma empresa','PERMISSIVE','SELECT',array['authenticated']::name[],'(empresa_id = empresa_atual_id())',null),
        ('nexotfe itens update mesma empresa','PERMISSIVE','UPDATE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))','((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))')
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('nexotfe itens delete admin mesma empresa','PERMISSIVE','DELETE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND usuario_e_admin())',null),
        ('nexotfe itens insert mesma empresa','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((empresa_id = empresa_atual_id()) AND (created_by = auth.uid()))'),
        ('nexotfe itens select mesma empresa','PERMISSIVE','SELECT',array['authenticated']::name[],'(empresa_id = empresa_atual_id())',null),
        ('nexotfe itens update mesma empresa','PERMISSIVE','UPDATE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))','((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))')
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd,
             (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname = 'public' and tablename = 'itens_industriais'
    ) as divergentes;

    -- Colunas -----------------------------------------------------------
    select count(*) = 0 into v_col_h
    from (
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'itens_industriais'
      except
      select * from (values
        ('id','uuid','NO'),('empresa_id','uuid','NO'),('codigo','text','NO'),('descricao','text','NO'),
        ('unidade','text','NO'),('tipo_item','text','NO'),('codigo_ean_gtin','text','YES'),('codigo_ncm','text','YES'),
        ('familia','text','YES'),('classificacao','text','YES'),('recomendacao_fiscal','text','YES'),('observacoes','text','YES'),
        ('pdf_tecnico_path','text','YES'),('pdf_tecnico_nome','text','YES'),('referencia_arquivo_externo','text','YES'),
        ('caminho_engenharia','text','YES'),('revisao_desenho','text','YES'),('ativo','boolean','NO'),
        ('created_at','timestamp with time zone','NO'),('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('created_by','uuid','NO'),('deleted_by','uuid','YES'),('valor_referencia','numeric','YES'),('pn','text','YES'),('tipo','text','YES')
      ) as e(column_name, data_type, is_nullable)
      union all
      select * from (values
        ('id','uuid','NO'),('empresa_id','uuid','NO'),('codigo','text','NO'),('descricao','text','NO'),
        ('unidade','text','NO'),('tipo_item','text','NO'),('codigo_ean_gtin','text','YES'),('codigo_ncm','text','YES'),
        ('familia','text','YES'),('classificacao','text','YES'),('recomendacao_fiscal','text','YES'),('observacoes','text','YES'),
        ('pdf_tecnico_path','text','YES'),('pdf_tecnico_nome','text','YES'),('referencia_arquivo_externo','text','YES'),
        ('caminho_engenharia','text','YES'),('revisao_desenho','text','YES'),('ativo','boolean','NO'),
        ('created_at','timestamp with time zone','NO'),('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('created_by','uuid','NO'),('deleted_by','uuid','YES'),('valor_referencia','numeric','YES'),('pn','text','YES'),('tipo','text','YES')
      ) as e(column_name, data_type, is_nullable)
      except
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'itens_industriais'
    ) as divergentes;

    select count(*) = 0 into v_col_o
    from (
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'itens_industriais'
      except
      select * from (values
        ('id','uuid','NO'),('empresa_id','uuid','NO'),('codigo','text','NO'),('descricao','text','NO'),
        ('unidade','text','NO'),('tipo_item','text','NO'),('codigo_ean_gtin','text','YES'),('codigo_ncm','text','YES'),
        ('familia','text','YES'),('classificacao','text','YES'),('recomendacao_fiscal','text','YES'),('observacoes','text','YES'),
        ('pdf_tecnico_path','text','YES'),('pdf_tecnico_nome','text','YES'),('referencia_arquivo_externo','text','YES'),
        ('caminho_engenharia','text','YES'),('revisao_desenho','text','YES'),('ativo','boolean','NO'),
        ('created_at','timestamp with time zone','NO'),('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('created_by','uuid','NO'),('deleted_by','uuid','YES'),('valor_referencia','numeric','YES'),('pn','text','YES'),('tipo','text','YES'),
        ('unidade_id','uuid','YES')
      ) as e(column_name, data_type, is_nullable)
      union all
      select * from (values
        ('id','uuid','NO'),('empresa_id','uuid','NO'),('codigo','text','NO'),('descricao','text','NO'),
        ('unidade','text','NO'),('tipo_item','text','NO'),('codigo_ean_gtin','text','YES'),('codigo_ncm','text','YES'),
        ('familia','text','YES'),('classificacao','text','YES'),('recomendacao_fiscal','text','YES'),('observacoes','text','YES'),
        ('pdf_tecnico_path','text','YES'),('pdf_tecnico_nome','text','YES'),('referencia_arquivo_externo','text','YES'),
        ('caminho_engenharia','text','YES'),('revisao_desenho','text','YES'),('ativo','boolean','NO'),
        ('created_at','timestamp with time zone','NO'),('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('created_by','uuid','NO'),('deleted_by','uuid','YES'),('valor_referencia','numeric','YES'),('pn','text','YES'),('tipo','text','YES'),
        ('unidade_id','uuid','YES')
      ) as e(column_name, data_type, is_nullable)
      except
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'itens_industriais'
    ) as divergentes;

    -- Defaults (mesmos 4 em H e O; unidade_id sem default) --------------
    select count(*) = 0 into v_def_h
    from (
      select a.attname as coluna, pg_get_expr(ad.adbin, ad.adrelid) as default_real
        from pg_attrdef ad join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.itens_industriais'::regclass
         and a.attname = any(array['id','empresa_id','codigo','descricao','unidade','tipo_item','codigo_ean_gtin','codigo_ncm','familia','classificacao','recomendacao_fiscal','observacoes','pdf_tecnico_path','pdf_tecnico_nome','referencia_arquivo_externo','caminho_engenharia','revisao_desenho','ativo','created_at','updated_at','deleted_at','created_by','deleted_by','valor_referencia','pn','tipo'])
      except
      select * from (values ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('updated_at','now()')) as e(coluna, default_esperado)
      union all
      select * from (values ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('updated_at','now()')) as e(coluna, default_esperado)
      except
      select a.attname, pg_get_expr(ad.adbin, ad.adrelid)
        from pg_attrdef ad join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.itens_industriais'::regclass
         and a.attname = any(array['id','empresa_id','codigo','descricao','unidade','tipo_item','codigo_ean_gtin','codigo_ncm','familia','classificacao','recomendacao_fiscal','observacoes','pdf_tecnico_path','pdf_tecnico_nome','referencia_arquivo_externo','caminho_engenharia','revisao_desenho','ativo','created_at','updated_at','deleted_at','created_by','deleted_by','valor_referencia','pn','tipo'])
    ) as divergentes;

    select count(*) = 0 into v_def_o
    from (
      select a.attname as coluna, pg_get_expr(ad.adbin, ad.adrelid) as default_real
        from pg_attrdef ad join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.itens_industriais'::regclass
         and a.attname = any(array['id','empresa_id','codigo','descricao','unidade','tipo_item','codigo_ean_gtin','codigo_ncm','familia','classificacao','recomendacao_fiscal','observacoes','pdf_tecnico_path','pdf_tecnico_nome','referencia_arquivo_externo','caminho_engenharia','revisao_desenho','ativo','created_at','updated_at','deleted_at','created_by','deleted_by','valor_referencia','pn','tipo','unidade_id'])
      except
      select * from (values ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('updated_at','now()')) as e(coluna, default_esperado)
      union all
      select * from (values ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('updated_at','now()')) as e(coluna, default_esperado)
      except
      select a.attname, pg_get_expr(ad.adbin, ad.adrelid)
        from pg_attrdef ad join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.itens_industriais'::regclass
         and a.attname = any(array['id','empresa_id','codigo','descricao','unidade','tipo_item','codigo_ean_gtin','codigo_ncm','familia','classificacao','recomendacao_fiscal','observacoes','pdf_tecnico_path','pdf_tecnico_nome','referencia_arquivo_externo','caminho_engenharia','revisao_desenho','ativo','created_at','updated_at','deleted_at','created_by','deleted_by','valor_referencia','pn','tipo','unidade_id'])
    ) as divergentes;

    -- Constraints ---------------------------------------------------------
    select count(*) = 0 into v_con_h
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.itens_industriais'::regclass
      except
      select * from (values
        ('itens_industriais_pkey','p','PRIMARY KEY (id)'),
        ('itens_industriais_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id)'),
        ('itens_industriais_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id)'),
        ('itens_industriais_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('itens_industriais_tipo_item_check','c','CHECK ((tipo_item = ANY (ARRAY[''produto acabado''::text, ''semiacabado''::text, ''materia-prima''::text, ''material consumo''::text, ''ferramenta''::text, ''servico''::text])))'),
        ('itens_industriais_unidade_check','c','CHECK ((unidade = ANY (ARRAY[''peca''::text, ''conjunto''::text, ''kg''::text, ''metro''::text, ''unidade''::text, ''litro''::text, ''pacote''::text])))')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('itens_industriais_pkey','p','PRIMARY KEY (id)'),
        ('itens_industriais_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id)'),
        ('itens_industriais_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id)'),
        ('itens_industriais_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('itens_industriais_tipo_item_check','c','CHECK ((tipo_item = ANY (ARRAY[''produto acabado''::text, ''semiacabado''::text, ''materia-prima''::text, ''material consumo''::text, ''ferramenta''::text, ''servico''::text])))'),
        ('itens_industriais_unidade_check','c','CHECK ((unidade = ANY (ARRAY[''peca''::text, ''conjunto''::text, ''kg''::text, ''metro''::text, ''unidade''::text, ''litro''::text, ''pacote''::text])))')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.itens_industriais'::regclass
    ) as divergentes;

    select count(*) = 0 into v_con_o
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.itens_industriais'::regclass
      except
      select * from (values
        ('itens_industriais_pkey','p','PRIMARY KEY (id)'),
        ('itens_industriais_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id)'),
        ('itens_industriais_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id)'),
        ('itens_industriais_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('itens_industriais_tipo_item_check','c','CHECK ((tipo_item = ANY (ARRAY[''produto acabado''::text, ''semiacabado''::text, ''materia-prima''::text, ''material consumo''::text, ''ferramenta''::text, ''servico''::text])))'),
        ('itens_industriais_unidade_check','c','CHECK ((unidade = ANY (ARRAY[''peca''::text, ''conjunto''::text, ''kg''::text, ''metro''::text, ''unidade''::text, ''litro''::text, ''pacote''::text])))'),
        ('itens_industriais_unidade_id_empresa_fkey','f','FOREIGN KEY (unidade_id, empresa_id) REFERENCES unidades_medida(id, empresa_id)')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('itens_industriais_pkey','p','PRIMARY KEY (id)'),
        ('itens_industriais_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id)'),
        ('itens_industriais_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id)'),
        ('itens_industriais_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('itens_industriais_tipo_item_check','c','CHECK ((tipo_item = ANY (ARRAY[''produto acabado''::text, ''semiacabado''::text, ''materia-prima''::text, ''material consumo''::text, ''ferramenta''::text, ''servico''::text])))'),
        ('itens_industriais_unidade_check','c','CHECK ((unidade = ANY (ARRAY[''peca''::text, ''conjunto''::text, ''kg''::text, ''metro''::text, ''unidade''::text, ''litro''::text, ''pacote''::text])))'),
        ('itens_industriais_unidade_id_empresa_fkey','f','FOREIGN KEY (unidade_id, empresa_id) REFERENCES unidades_medida(id, empresa_id)')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.itens_industriais'::regclass
    ) as divergentes;

    -- Indices (nome, unique, primary, valid, ready, metodo, definicao
    -- integral via pg_get_indexdef(indexrelid,0,false) — cobre colunas,
    -- expressoes, opclasses, ASC/DESC, INCLUDE, WHERE, NULLS NOT
    -- DISTINCT e TABLESPACE nao-padrao quando houver) -------------------
    select count(*) = 0 into v_idx_h
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.itens_industriais'::regclass
      except
      select * from (values
        ('itens_industriais_ativo_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_ativo_idx ON public.itens_industriais USING btree (ativo)'),
        ('itens_industriais_codigo_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_codigo_idx ON public.itens_industriais USING btree (codigo)'),
        ('itens_industriais_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_deleted_at_idx ON public.itens_industriais USING btree (deleted_at)'),
        ('itens_industriais_empresa_ativo_deleted_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_ativo_deleted_idx ON public.itens_industriais USING btree (empresa_id, ativo, deleted_at)'),
        ('itens_industriais_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_codigo_idx ON public.itens_industriais USING btree (empresa_id, codigo)'),
        ('itens_industriais_empresa_codigo_unique_idx',true,false,true,true,'btree','CREATE UNIQUE INDEX itens_industriais_empresa_codigo_unique_idx ON public.itens_industriais USING btree (empresa_id, codigo)'),
        ('itens_industriais_empresa_id_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_id_idx ON public.itens_industriais USING btree (empresa_id)'),
        ('itens_industriais_empresa_tipo_item_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_tipo_item_idx ON public.itens_industriais USING btree (empresa_id, tipo_item)'),
        ('itens_industriais_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX itens_industriais_pkey ON public.itens_industriais USING btree (id)'),
        ('itens_industriais_tipo_item_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_tipo_item_idx ON public.itens_industriais USING btree (tipo_item)'),
        ('itens_industriais_unidade_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_unidade_idx ON public.itens_industriais USING btree (unidade)'),
        ('itens_industriais_updated_at_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_updated_at_idx ON public.itens_industriais USING btree (updated_at DESC)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('itens_industriais_ativo_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_ativo_idx ON public.itens_industriais USING btree (ativo)'),
        ('itens_industriais_codigo_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_codigo_idx ON public.itens_industriais USING btree (codigo)'),
        ('itens_industriais_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_deleted_at_idx ON public.itens_industriais USING btree (deleted_at)'),
        ('itens_industriais_empresa_ativo_deleted_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_ativo_deleted_idx ON public.itens_industriais USING btree (empresa_id, ativo, deleted_at)'),
        ('itens_industriais_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_codigo_idx ON public.itens_industriais USING btree (empresa_id, codigo)'),
        ('itens_industriais_empresa_codigo_unique_idx',true,false,true,true,'btree','CREATE UNIQUE INDEX itens_industriais_empresa_codigo_unique_idx ON public.itens_industriais USING btree (empresa_id, codigo)'),
        ('itens_industriais_empresa_id_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_id_idx ON public.itens_industriais USING btree (empresa_id)'),
        ('itens_industriais_empresa_tipo_item_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_tipo_item_idx ON public.itens_industriais USING btree (empresa_id, tipo_item)'),
        ('itens_industriais_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX itens_industriais_pkey ON public.itens_industriais USING btree (id)'),
        ('itens_industriais_tipo_item_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_tipo_item_idx ON public.itens_industriais USING btree (tipo_item)'),
        ('itens_industriais_unidade_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_unidade_idx ON public.itens_industriais USING btree (unidade)'),
        ('itens_industriais_updated_at_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_updated_at_idx ON public.itens_industriais USING btree (updated_at DESC)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.itens_industriais'::regclass
    ) as divergentes;

    select count(*) = 0 into v_idx_o
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.itens_industriais'::regclass
      except
      select * from (values
        ('itens_industriais_ativo_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_ativo_idx ON public.itens_industriais USING btree (ativo)'),
        ('itens_industriais_codigo_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_codigo_idx ON public.itens_industriais USING btree (codigo)'),
        ('itens_industriais_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_deleted_at_idx ON public.itens_industriais USING btree (deleted_at)'),
        ('itens_industriais_empresa_ativo_deleted_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_ativo_deleted_idx ON public.itens_industriais USING btree (empresa_id, ativo, deleted_at)'),
        ('itens_industriais_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_codigo_idx ON public.itens_industriais USING btree (empresa_id, codigo)'),
        ('itens_industriais_empresa_codigo_unique_idx',true,false,true,true,'btree','CREATE UNIQUE INDEX itens_industriais_empresa_codigo_unique_idx ON public.itens_industriais USING btree (empresa_id, codigo)'),
        ('itens_industriais_empresa_id_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_id_idx ON public.itens_industriais USING btree (empresa_id)'),
        ('itens_industriais_empresa_tipo_item_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_tipo_item_idx ON public.itens_industriais USING btree (empresa_id, tipo_item)'),
        ('itens_industriais_empresa_unidade_id_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_unidade_id_idx ON public.itens_industriais USING btree (empresa_id, unidade_id)'),
        ('itens_industriais_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX itens_industriais_pkey ON public.itens_industriais USING btree (id)'),
        ('itens_industriais_tipo_item_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_tipo_item_idx ON public.itens_industriais USING btree (tipo_item)'),
        ('itens_industriais_unidade_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_unidade_idx ON public.itens_industriais USING btree (unidade)'),
        ('itens_industriais_updated_at_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_updated_at_idx ON public.itens_industriais USING btree (updated_at DESC)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('itens_industriais_ativo_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_ativo_idx ON public.itens_industriais USING btree (ativo)'),
        ('itens_industriais_codigo_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_codigo_idx ON public.itens_industriais USING btree (codigo)'),
        ('itens_industriais_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_deleted_at_idx ON public.itens_industriais USING btree (deleted_at)'),
        ('itens_industriais_empresa_ativo_deleted_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_ativo_deleted_idx ON public.itens_industriais USING btree (empresa_id, ativo, deleted_at)'),
        ('itens_industriais_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_codigo_idx ON public.itens_industriais USING btree (empresa_id, codigo)'),
        ('itens_industriais_empresa_codigo_unique_idx',true,false,true,true,'btree','CREATE UNIQUE INDEX itens_industriais_empresa_codigo_unique_idx ON public.itens_industriais USING btree (empresa_id, codigo)'),
        ('itens_industriais_empresa_id_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_id_idx ON public.itens_industriais USING btree (empresa_id)'),
        ('itens_industriais_empresa_tipo_item_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_tipo_item_idx ON public.itens_industriais USING btree (empresa_id, tipo_item)'),
        ('itens_industriais_empresa_unidade_id_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_empresa_unidade_id_idx ON public.itens_industriais USING btree (empresa_id, unidade_id)'),
        ('itens_industriais_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX itens_industriais_pkey ON public.itens_industriais USING btree (id)'),
        ('itens_industriais_tipo_item_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_tipo_item_idx ON public.itens_industriais USING btree (tipo_item)'),
        ('itens_industriais_unidade_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_unidade_idx ON public.itens_industriais USING btree (unidade)'),
        ('itens_industriais_updated_at_idx',false,false,true,true,'btree','CREATE INDEX itens_industriais_updated_at_idx ON public.itens_industriais USING btree (updated_at DESC)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.itens_industriais'::regclass
    ) as divergentes;

    -- Triggers (H: 2 governados; O: H + bump_capacidade_versao
    -- posterior, pertence obrigatoriamente ao fingerprint integral de O) -
    select count(*) = 0 into v_trig_h
    from (
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,'') as tgattr, t.tgenabled, t.tgnargs, octet_length(t.tgargs) as tgargs_len, t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.itens_industriais'::regclass and not t.tgisinternal
      except
      select * from (values
        ('itens_industriais_set_empresa_id', to_regprocedure('public.set_empresa_id_from_usuario()'), 7, '', 'O', 0, 0, 0, false),
        ('itens_industriais_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false)
      ) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      union all
      select * from (values
        ('itens_industriais_set_empresa_id', to_regprocedure('public.set_empresa_id_from_usuario()'), 7, '', 'O', 0, 0, 0, false),
        ('itens_industriais_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false)
      ) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      except
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,''), t.tgenabled, t.tgnargs, octet_length(t.tgargs), t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.itens_industriais'::regclass and not t.tgisinternal
    ) as divergentes;

    select count(*) = 0 into v_trig_o
    from (
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,'') as tgattr, t.tgenabled, t.tgnargs, octet_length(t.tgargs) as tgargs_len, t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.itens_industriais'::regclass and not t.tgisinternal
      except
      select * from (values
        ('itens_industriais_set_empresa_id', to_regprocedure('public.set_empresa_id_from_usuario()'), 7, '', 'O', 0, 0, 0, false),
        ('itens_industriais_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false),
        ('itens_industriais_bump_capacidade_versao', to_regprocedure('public.trg_bump_capacidade_versao_por_empresa_id()'), 29, '18 21', 'O', 0, 0, 0, false)
      ) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      union all
      select * from (values
        ('itens_industriais_set_empresa_id', to_regprocedure('public.set_empresa_id_from_usuario()'), 7, '', 'O', 0, 0, 0, false),
        ('itens_industriais_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false),
        ('itens_industriais_bump_capacidade_versao', to_regprocedure('public.trg_bump_capacidade_versao_por_empresa_id()'), 29, '18 21', 'O', 0, 0, 0, false)
      ) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      except
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,''), t.tgenabled, t.tgnargs, octet_length(t.tgargs), t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.itens_industriais'::regclass and not t.tgisinternal
    ) as divergentes;

    v_estado_h := v_col_h and v_def_h and v_idgen and v_collation and v_con_h and v_idx_h and v_pol and v_trig_h and v_rls and v_owner and v_acl;
    v_estado_o := v_col_o and v_def_o and v_idgen and v_collation and v_con_o and v_idx_o and v_pol and v_trig_o and v_rls and v_owner and v_acl;

    if v_estado_h or v_estado_o then
      null;
    else
      raise exception 'FINGERPRINT DIVERGENTE em public.itens_industriais: nao corresponde integralmente a ESTADO HISTORICO nem a ESTADO ATUAL (hibrido/parcial/desconhecido). colunas(H=%,O=%) defaults(H=%,O=%) constraints(H=%,O=%) indices(H=%,O=%) policies(%) triggers(H=%,O=%) rls(%) owner(%) acl(%) identity_generated(%) collation(%)',
        v_col_h, v_col_o, v_def_h, v_def_o, v_con_h, v_con_o, v_idx_h, v_idx_o, v_pol, v_trig_h, v_trig_o, v_rls, v_owner, v_acl, v_idgen, v_collation;
    end if;

  end if;
end $$;

commit;

-- =============================================================================
-- FIM DO BLOCO JUNHO.
-- =============================================================================
