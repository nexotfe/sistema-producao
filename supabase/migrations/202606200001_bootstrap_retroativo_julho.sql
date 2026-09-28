-- =============================================================================
-- RASCUNHO CANDIDATO — NAO E UMA MIGRATION REAL. NAO APLICAR.
-- Vive fora de supabase/migrations/ ate a versao/timestamp ser certificada
-- contra a CLI Supabase 2.105.0 em ambiente remoto descartavel (autorizacao
-- futura separada, nao concedida ainda).
--
-- BOOTSTRAP RETROATIVO — BLOCO JULHO
-- Posicao logica futura: maior que 202606140002, menor que 202607050001.
-- Depende do arquivo 01 (bootstrap Junho) ja aplicado (empresas,
-- empresa_atual_id(), usuario_e_admin(), set_updated_at() ja precisam
-- existir). usuario_e_admin() NAO e recriada aqui — permanece no
-- arquivo 01.
--
-- REVISAO 2 — mesmas correcoes estruturais do arquivo 01 (ver cabecalho
-- daquele arquivo para o detalhamento completo): ACL movida para dentro
-- do ramo "ausente"; ramo "existente" agora valida ACL/owner/policy/
-- trigger por igualdade exata, nunca corrige; PUBLIC adicionado ao
-- GRANT EXECUTE das 2 funcoes deste arquivo (set_atualizado_em,
-- set_empresa_id_from_usuario).
--
-- REVISAO 3 — correcao apos segunda auditoria independente + reconciliacao
-- r8 (SHA-256 268223a1cd8071e0ee45197604de25c5732f17f213d35f309ebb28f0
-- 36618b5d). Mudancas: a) bug coalesce(grantee::regrole::text,'PUBLIC')
-- trocado por CASE WHEN grantee=0 nas 2 funcoes (grantee=0 nunca vira
-- NULL, vira '-'); b) proisstrict/proparallel fingerprintados nas 2
-- funcoes (r8: false/'u'); c) corpo das 2 funcoes fingerprintado via
-- pg_get_functiondef certificado (CRLF normalizado); d) relrowsecurity/
-- relforcerowsecurity fingerprintados nas 7 tabelas (r8: true/false em
-- todas); e) catalogo pg_trigger completo (tgfoid/tgenabled/tgtype/
-- tgnargs/tgargs/tgconstraint/tgisinternal/tgqual) para os 8 triggers
-- governados deste arquivo; f) defaults/identity/generated/collation
-- fingerprintados nas 7 tabelas (r8: 0 identity, 0 generated, 0
-- collation customizada); g) roles de policy comparadas como conjunto
-- ordenado, nao mais dependente da ordem do array; h) ACHADO MATERIAL:
-- trigger usuarios_set_atualizado_em (um dos 9 triggers governados,
-- confirmado no remoto real) estava ausente dos 3 candidatos — bloco
-- 4b adicionado, contrato congelado pela r8 (BEFORE UPDATE ROW,
-- tgtype=19, sem argumentos, sem WHEN, nao interno, nao constraint).
--
-- CORRECAO ESPECIFICA DESTA REVISAO — funcionarios.disponibilidade_atual
-- passa a reconhecer, no ramo "tabela ja existe", DOIS estados
-- controlados e apenas esses dois (ver ponto 7 da autorizacao):
--   ESTADO A (historico controlado): a coluna existe, com o tipo/
--     nulabilidade historicos, e o restante do fingerprint corresponde
--     ao estado historico (21 colunas, carga_horaria) -> NO-OP.
--   ESTADO B (atual controlado): a coluna esta ausente, e o restante do
--     fingerprint corresponde ao estado final real (20 colunas,
--     carga_produtiva) -> NO-OP.
--   QUALQUER OUTRA COMBINACAO (coluna com tipo errado; coluna presente
--     mas resto do schema no formato final; coluna ausente mas resto do
--     schema no formato historico; qualquer estado parcial) -> RAISE
--     EXCEPTION. Este arquivo NUNCA adiciona nem remove a coluna de uma
--     tabela ja existente — so a cria do zero, no ramo ausente. A
--     remocao controlada continua sendo responsabilidade exclusiva do
--     arquivo 03 (reconciliacao).
--
-- Objetos cobertos (ordem real de dependencia, nao agrupados por tabela):
--   1. public.nivel_acesso                       (type/enum)
--   2. public.profiles                           (tabela) + 3 policies
--   3. public.usuarios                           (tabela) + 3 policies
--   4. public.set_atualizado_em()                (funcao de trigger)
--  4b. trigger usuarios_set_atualizado_em ON public.usuarios (achado r8)
--   5. public.credenciais                        (tabela) + trigger + 4 policies
--   6. public.set_empresa_id_from_usuario()       (funcao de trigger)
--   7. public.tecnologias_aplicadas               (tabela) + 2 triggers + 4 policies
--   8. public.grupos_recursos                     (tabela) + trigger + 6 policies
--   9. public.recursos_produtivos                 (tabela) + trigger + 4 policies
--  10. public.funcionarios                        (tabela, 2 estados) + 2 triggers + 4 policies
--
-- Matriz dos 9 triggers governados deste par de arquivos (1 no 01, 8
-- aqui, confirmados via r8 — 18 triggers reais totais, 9 governados,
-- 9 posteriores fora de escopo, nenhum tratado como governado aqui):
--   credenciais_set_atualizado_em, usuarios_set_atualizado_em,
--   tecnologias_aplicadas_set_empresa_id, tecnologias_aplicadas_set_updated_at,
--   grupos_recursos_set_updated_at, recursos_produtivos_set_updated_at,
--   funcionarios_set_empresa_id, funcionarios_set_updated_at
--   (+ empresas_preparar_saas no arquivo 01)
--
-- Fonte normativa: mesma do arquivo 01 (dump certificado 2026-06-21 +
-- introspeccao ao vivo ja realizada, incluindo leitura completa e
-- corrigida de policies.csv nesta investigacao, sem truncamento).
--
-- Prova de compatibilidade: nenhum dos objetos deste arquivo (tabelas,
-- funcoes, triggers, policies) e recriado por CREATE TABLE/CREATE
-- FUNCTION/CREATE TRIGGER/CREATE POLICY em nenhuma migration real
-- posterior (busca exaustiva ja realizada em rodadas anteriores) — logo
-- nao ha risco de replay quebrar nenhuma migration historica real.
-- =============================================================================

begin;

-- =============================================================================
-- 1. public.nivel_acesso
-- =============================================================================
do $$
declare
  v_labels text[];
begin
  if not exists (select 1 from pg_type where typname = 'nivel_acesso' and typnamespace = 'public'::regnamespace) then
    create type public.nivel_acesso as enum ('admin', 'gestor', 'operador', 'leitura');
    alter type public.nivel_acesso owner to postgres;
  else
    select array_agg(enumlabel order by enumsortorder) into v_labels
      from pg_enum where enumtypid = 'public.nivel_acesso'::regtype;

    if v_labels is distinct from array['admin','gestor','operador','leitura'] then
      raise exception 'FINGERPRINT DIVERGENTE em public.nivel_acesso: labels/ordem divergem do esperado. Real: %', v_labels;
    end if;

    if (select r.rolname from pg_type t join pg_roles r on r.oid = t.typowner where t.oid = 'public.nivel_acesso'::regtype) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.nivel_acesso: owner diferente de postgres';
    end if;

    if (select typacl from pg_type where oid = 'public.nivel_acesso'::regtype) is not null then
      raise exception 'FINGERPRINT DIVERGENTE em public.nivel_acesso: ACL explicita encontrada, esperado typacl NULL (default)';
    end if;
  end if;
end $$;

-- =============================================================================
-- 2. public.profiles + 3 policies historicas
-- =============================================================================
do $$
declare
  v_diff int;
  v_pol record;
  v_con boolean; v_idx boolean; v_trig boolean;
begin
  if to_regclass('public.profiles') is null then

    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      empresa_id uuid not null references public.empresas(id) on delete restrict,
      nome text not null,
      cargo text,
      nivel_acesso public.nivel_acesso not null default 'operador',
      telefone text,
      ativo boolean not null default true,
      created_at timestamptz not null default now()
    );

    alter table public.profiles enable row level security;
    alter table public.profiles owner to postgres;

    comment on table public.profiles is
      'Bootstrap retroativo (bloco Julho) — estado historico comprovado por dump certificado 2026-06-21. Tabela nunca alterada por nenhuma migration real ate hoje.';

    create index profiles_empresa_id_idx on public.profiles using btree (empresa_id);
    create index profiles_nivel_acesso_idx on public.profiles using btree (nivel_acesso);
    create index profiles_ativo_idx on public.profiles using btree (ativo);

    create policy "nexotfe profiles admin gerencia mesma empresa" on public.profiles
      for all to authenticated
      using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin())
      with check (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

    create policy "nexotfe profiles select mesma empresa" on public.profiles
      for select to authenticated
      using (id = auth.uid() or (empresa_id = public.empresa_atual_id() and public.usuario_e_admin()));

    create policy "nexotfe profiles update proprio perfil" on public.profiles
      for update to authenticated
      using (id = auth.uid() and empresa_id = public.empresa_atual_id())
      with check (
        id = auth.uid()
        and empresa_id = public.empresa_atual_id()
        and nivel_acesso = (
          select profile_atual.nivel_acesso
          from public.profiles profile_atual
          where profile_atual.id = auth.uid()
        )
      );

    revoke all on public.profiles from public, anon, authenticated, service_role, postgres;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.profiles to anon, authenticated, postgres, service_role;

  else

    select count(*) into v_diff
    from (
      values
        ('id','uuid','NO'), ('empresa_id','uuid','NO'), ('nome','text','NO'),
        ('cargo','text','YES'), ('telefone','text','YES'),
        ('ativo','boolean','NO'), ('created_at','timestamp with time zone','NO')
    ) as esperado(coluna, tipo, nulavel)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name='profiles'
        and c.column_name=esperado.coluna and c.data_type=esperado.tipo and c.is_nullable=esperado.nulavel
    );
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: % coluna(s) divergente(s)', v_diff;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='nivel_acesso' and udt_name='nivel_acesso'
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: coluna nivel_acesso nao e do tipo public.nivel_acesso';
    end if;

    select count(*) into v_diff
    from (
      select a.attname as coluna, pg_get_expr(ad.adbin, ad.adrelid) as default_real
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.profiles'::regclass
         and a.attname = any(array['id','empresa_id','nome','cargo','nivel_acesso','telefone','ativo','created_at'])
      except
      select * from (values ('nivel_acesso','''operador''::nivel_acesso'), ('ativo','true'), ('created_at','now()')) as e(coluna, default_esperado)
      union all
      select * from (values ('nivel_acesso','''operador''::nivel_acesso'), ('ativo','true'), ('created_at','now()')) as e(coluna, default_esperado)
      except
      select a.attname, pg_get_expr(ad.adbin, ad.adrelid)
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.profiles'::regclass
         and a.attname = any(array['id','empresa_id','nome','cargo','nivel_acesso','telefone','ativo','created_at'])
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: % default(s) de coluna divergente(s) do certificado (ausente, expressao diferente, ou default adicional inesperado)', v_diff;
    end if;

    if exists (
      select 1 from pg_attribute a
      where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
        and (a.attidentity <> '' or a.attgenerated <> '')
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: coluna com IDENTITY ou GENERATED encontrada, esperado nenhuma';
    end if;

    if exists (
      select 1 from pg_attribute a
      left join pg_collation col on col.oid = a.attcollation
      where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
        and coalesce(col.collname, 'default') <> 'default'
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: coluna com collation customizada encontrada, esperado default/nenhuma';
    end if;

    if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: RLS nao habilitada';
    end if;
    if (select relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass) then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: FORCE ROW LEVEL SECURITY habilitada, esperado desabilitada (evidencia r8)';
    end if;

    select count(*) = 0 into v_con
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.profiles'::regclass
      except
      select * from (values
        ('profiles_pkey','p','PRIMARY KEY (id)'),
        ('profiles_id_fkey','f','FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE'),
        ('profiles_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('profiles_pkey','p','PRIMARY KEY (id)'),
        ('profiles_id_fkey','f','FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE'),
        ('profiles_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.profiles'::regclass
    ) as divergentes;
    if not v_con then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: constraints divergem das aprovadas (pkey + id_fkey + empresa_id_fkey)';
    end if;

    select count(*) = 0 into v_idx
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.profiles'::regclass
      except
      select * from (values
        ('profiles_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)'),
        ('profiles_empresa_id_idx',false,false,true,true,'btree','CREATE INDEX profiles_empresa_id_idx ON public.profiles USING btree (empresa_id)'),
        ('profiles_nivel_acesso_idx',false,false,true,true,'btree','CREATE INDEX profiles_nivel_acesso_idx ON public.profiles USING btree (nivel_acesso)'),
        ('profiles_ativo_idx',false,false,true,true,'btree','CREATE INDEX profiles_ativo_idx ON public.profiles USING btree (ativo)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('profiles_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)'),
        ('profiles_empresa_id_idx',false,false,true,true,'btree','CREATE INDEX profiles_empresa_id_idx ON public.profiles USING btree (empresa_id)'),
        ('profiles_nivel_acesso_idx',false,false,true,true,'btree','CREATE INDEX profiles_nivel_acesso_idx ON public.profiles USING btree (nivel_acesso)'),
        ('profiles_ativo_idx',false,false,true,true,'btree','CREATE INDEX profiles_ativo_idx ON public.profiles USING btree (ativo)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.profiles'::regclass
    ) as divergentes;
    if not v_idx then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: indices divergem dos aprovados (esperado exatamente 4: pkey, empresa_id_idx, nivel_acesso_idx, ativo_idx)';
    end if;

    -- Conjunto esperado de triggers nao-internos = VAZIO. Igualdade de
    -- conjunto bidirecional mesmo com o lado esperado vazio: qualquer
    -- trigger real (governado ou nao) reprova.
    select count(*) = 0 into v_trig
    from (
      select t.tgname from pg_trigger t
       where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal
    ) as divergentes;
    if not v_trig then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: conjunto de triggers nao-internos deveria ser vazio (evidencia r9), trigger(s) inesperado(s) encontrado(s)';
    end if;

    if (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.profiles'::regclass) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: owner diferente de postgres';
    end if;

    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.profiles'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.profiles'::regclass and a.grantee <> 0
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
       where c.oid = 'public.profiles'::regclass and a.grantee <> 0
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;

    for v_pol in
      select policyname, permissive, roles, cmd, qual, with_check
      from pg_policies where schemaname='public' and tablename='profiles'
    loop
      if v_pol.policyname = 'nexotfe profiles admin gerencia mesma empresa' then
        if v_pol.permissive <> 'PERMISSIVE' or (select array_agg(x order by x) from unnest(v_pol.roles) as x) <> array['authenticated']::name[] or v_pol.cmd <> 'ALL'
           or v_pol.qual is distinct from '((empresa_id = empresa_atual_id()) AND usuario_e_admin())'
           or v_pol.with_check is distinct from '((empresa_id = empresa_atual_id()) AND usuario_e_admin())'
        then
          raise exception 'FINGERPRINT DIVERGENTE: policy "nexotfe profiles admin gerencia mesma empresa" diverge da aprovada';
        end if;
      elsif v_pol.policyname = 'nexotfe profiles select mesma empresa' then
        if v_pol.permissive <> 'PERMISSIVE' or (select array_agg(x order by x) from unnest(v_pol.roles) as x) <> array['authenticated']::name[] or v_pol.cmd <> 'SELECT'
           or v_pol.qual is distinct from '((id = auth.uid()) OR ((empresa_id = empresa_atual_id()) AND usuario_e_admin()))'
           or v_pol.with_check is not null
        then
          raise exception 'FINGERPRINT DIVERGENTE: policy "nexotfe profiles select mesma empresa" diverge da aprovada';
        end if;
      elsif v_pol.policyname = 'nexotfe profiles update proprio perfil' then
        if v_pol.permissive <> 'PERMISSIVE' or (select array_agg(x order by x) from unnest(v_pol.roles) as x) <> array['authenticated']::name[] or v_pol.cmd <> 'UPDATE'
           or v_pol.qual is distinct from '((id = auth.uid()) AND (empresa_id = empresa_atual_id()))'
           or v_pol.with_check is distinct from '((id = auth.uid()) AND (empresa_id = empresa_atual_id()) AND (nivel_acesso = ( SELECT profile_atual.nivel_acesso
   FROM profiles profile_atual
  WHERE (profile_atual.id = auth.uid()))))'
        then
          raise exception 'FINGERPRINT DIVERGENTE: policy "nexotfe profiles update proprio perfil" diverge da aprovada';
        end if;
      end if;
    end loop;

    if (select count(*) from pg_policies where schemaname='public' and tablename='profiles') <> 3 then
      raise exception 'FINGERPRINT DIVERGENTE em public.profiles: numero de policies diferente de 3';
    end if;

  end if;
end $$;

-- =============================================================================
-- 4. public.set_atualizado_em()
-- =============================================================================
do $$
declare
  v_oid oid;
  v_diff int;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='set_atualizado_em'
     and pg_get_function_identity_arguments(p.oid) = '';

  if v_oid is null then
    create or replace function public.set_atualizado_em()
    returns trigger
    language plpgsql
    as $function$
    begin
      new.atualizado_em = now();
      return new;
    end;
    $function$;

    alter function public.set_atualizado_em() owner to postgres;

    revoke all on function public.set_atualizado_em() from public, anon, authenticated, service_role, postgres;
    grant execute on function public.set_atualizado_em() to public, anon, authenticated, postgres, service_role;

  else
    if (select prosecdef from pg_proc where oid=v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_atualizado_em: esperado SECURITY INVOKER';
    end if;
    if (select proconfig from pg_proc where oid=v_oid) is not null then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_atualizado_em: esperado sem search_path fixo';
    end if;
    if (select prorettype from pg_proc where oid = v_oid) <> 'trigger'::regtype then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_atualizado_em: tipo de retorno diferente de trigger';
    end if;
    if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner where p.oid = v_oid) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_atualizado_em: owner diferente de postgres';
    end if;

    -- Evidencia r8: proisstrict=false, proparallel='u'.
    if (select proisstrict from pg_proc where oid = v_oid) then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_atualizado_em: esperado NOT STRICT (proisstrict=false)';
    end if;
    if (select proparallel from pg_proc where oid = v_oid) <> 'u' then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_atualizado_em: esperado PARALLEL UNSAFE (proparallel=''u'')';
    end if;

    if replace(pg_get_functiondef(v_oid), chr(13), '') <> $corpo$CREATE OR REPLACE FUNCTION public.set_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.atualizado_em = now();
  return new;
end;
$function$
$corpo$ then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_atualizado_em: corpo da funcao diverge do certificado';
    end if;

    if exists (
      select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
      where p.oid = v_oid and a.is_grantable
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.set_atualizado_em: GRANT OPTION encontrado, esperado nenhum';
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
      raise exception 'FINGERPRINT DIVERGENTE em public.set_atualizado_em: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;
  end if;
end $$;

-- =============================================================================
-- 3. public.usuarios — colunas/constraints/indices/trigger/RLS/owner/ACL
--    invariantes entre H e O; discriminador e' exclusivamente as 3
--    policies (2 das 3 tem qual/with_check diferente desde 202607100003).
--    Classificador H-ou-O conjunto.
-- =============================================================================
do $$
declare
  v_diff int;
  v_col boolean; v_def boolean; v_idgen boolean; v_collation boolean;
  v_con boolean; v_idx boolean; v_trig boolean;
  v_pol_h boolean; v_pol_o boolean;
  v_rls boolean; v_owner boolean; v_acl boolean;
  v_estado_h boolean; v_estado_o boolean;
begin
  if to_regclass('public.usuarios') is null then

    create table public.usuarios (
      id uuid primary key references auth.users(id) on delete cascade,
      nome text not null,
      email text not null,
      cargo text,
      nivel_acesso public.nivel_acesso not null default 'operador',
      data_criacao timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      empresa_id uuid not null references public.empresas(id) on delete restrict
    );

    alter table public.usuarios add constraint usuarios_email_key unique (email);
    alter table public.usuarios enable row level security;
    alter table public.usuarios owner to postgres;

    comment on table public.usuarios is
      'Bootstrap retroativo (bloco Julho) — estado historico comprovado por dump certificado 2026-06-21. Tabela nunca teve coluna alterada por migration real ate hoje (so policies).';

    create policy "Admins gerenciam usuarios" on public.usuarios
      for all to authenticated
      using (public.usuario_e_admin())
      with check (public.usuario_e_admin());

    create policy "Usuarios podem atualizar dados basicos do proprio perfil" on public.usuarios
      for update to authenticated
      using (id = auth.uid())
      with check (
        id = auth.uid()
        and nivel_acesso = (
          select u.nivel_acesso from public.usuarios u where u.id = auth.uid()
        )
      );

    create policy "Usuarios podem ver o proprio perfil" on public.usuarios
      for select to authenticated
      using (id = auth.uid() or public.usuario_e_admin());

    revoke all on public.usuarios from public, anon, authenticated, service_role, postgres;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.usuarios to anon, authenticated, postgres, service_role;

    create index usuarios_email_idx on public.usuarios using btree (email);
    create index usuarios_nivel_acesso_idx on public.usuarios using btree (nivel_acesso);

    create trigger usuarios_set_atualizado_em
      before update on public.usuarios
      for each row execute function public.set_atualizado_em();

  else

    select count(*) = 0 into v_col
    from (
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='usuarios'
      except
      select * from (values
        ('id','uuid','NO'),('nome','text','NO'),('email','text','NO'),('cargo','text','YES'),
        ('nivel_acesso','USER-DEFINED','NO'),('data_criacao','timestamp with time zone','NO'),
        ('atualizado_em','timestamp with time zone','NO'),('empresa_id','uuid','NO')
      ) as e(column_name, data_type, is_nullable)
      union all
      select * from (values
        ('id','uuid','NO'),('nome','text','NO'),('email','text','NO'),('cargo','text','YES'),
        ('nivel_acesso','USER-DEFINED','NO'),('data_criacao','timestamp with time zone','NO'),
        ('atualizado_em','timestamp with time zone','NO'),('empresa_id','uuid','NO')
      ) as e(column_name, data_type, is_nullable)
      except
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='usuarios'
    ) as divergentes;

    select count(*) = 0 into v_con
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.usuarios'::regclass
      except
      select * from (values
        ('usuarios_pkey','p','PRIMARY KEY (id)'),
        ('usuarios_id_fkey','f','FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE'),
        ('usuarios_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('usuarios_email_key','u','UNIQUE (email)')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('usuarios_pkey','p','PRIMARY KEY (id)'),
        ('usuarios_id_fkey','f','FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE'),
        ('usuarios_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('usuarios_email_key','u','UNIQUE (email)')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.usuarios'::regclass
    ) as divergentes;

    select count(*) = 0 into v_def
    from (
      select a.attname as coluna, pg_get_expr(ad.adbin, ad.adrelid) as default_real
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.usuarios'::regclass
         and a.attname = any(array['id','nome','email','cargo','nivel_acesso','data_criacao','atualizado_em','empresa_id'])
      except
      select * from (values ('nivel_acesso','''operador''::nivel_acesso'), ('data_criacao','now()'), ('atualizado_em','now()')) as e(coluna, default_esperado)
      union all
      select * from (values ('nivel_acesso','''operador''::nivel_acesso'), ('data_criacao','now()'), ('atualizado_em','now()')) as e(coluna, default_esperado)
      except
      select a.attname, pg_get_expr(ad.adbin, ad.adrelid)
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.usuarios'::regclass
         and a.attname = any(array['id','nome','email','cargo','nivel_acesso','data_criacao','atualizado_em','empresa_id'])
    ) as divergentes;

    v_idgen := not exists (
      select 1 from pg_attribute a
      where a.attrelid = 'public.usuarios'::regclass and a.attnum > 0 and not a.attisdropped
        and (a.attidentity <> '' or a.attgenerated <> '')
    );

    v_collation := not exists (
      select 1 from pg_attribute a
      left join pg_collation col on col.oid = a.attcollation
      where a.attrelid = 'public.usuarios'::regclass and a.attnum > 0 and not a.attisdropped
        and coalesce(col.collname, 'default') <> 'default'
    );

    v_rls := (select relrowsecurity from pg_class where oid = 'public.usuarios'::regclass)
             and not (select relforcerowsecurity from pg_class where oid = 'public.usuarios'::regclass);

    v_owner := (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.usuarios'::regclass) = 'postgres';

    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.usuarios'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.usuarios: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) = 0 into v_acl
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.usuarios'::regclass and a.grantee <> 0
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
       where c.oid = 'public.usuarios'::regclass and a.grantee <> 0
    ) as divergentes;

    select count(*) = 0 into v_idx
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.usuarios'::regclass
      except
      select * from (values
        ('usuarios_email_idx',false,false,true,true,'btree','CREATE INDEX usuarios_email_idx ON public.usuarios USING btree (email)'),
        ('usuarios_email_key',true,false,true,true,'btree','CREATE UNIQUE INDEX usuarios_email_key ON public.usuarios USING btree (email)'),
        ('usuarios_nivel_acesso_idx',false,false,true,true,'btree','CREATE INDEX usuarios_nivel_acesso_idx ON public.usuarios USING btree (nivel_acesso)'),
        ('usuarios_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX usuarios_pkey ON public.usuarios USING btree (id)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('usuarios_email_idx',false,false,true,true,'btree','CREATE INDEX usuarios_email_idx ON public.usuarios USING btree (email)'),
        ('usuarios_email_key',true,false,true,true,'btree','CREATE UNIQUE INDEX usuarios_email_key ON public.usuarios USING btree (email)'),
        ('usuarios_nivel_acesso_idx',false,false,true,true,'btree','CREATE INDEX usuarios_nivel_acesso_idx ON public.usuarios USING btree (nivel_acesso)'),
        ('usuarios_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX usuarios_pkey ON public.usuarios USING btree (id)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.usuarios'::regclass
    ) as divergentes;

    select count(*) = 0 into v_trig
    from (
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,'') as tgattr, t.tgenabled, t.tgnargs, octet_length(t.tgargs) as tgargs_len, t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.usuarios'::regclass and not t.tgisinternal
      except
      select * from (values ('usuarios_set_atualizado_em', to_regprocedure('public.set_atualizado_em()'), 19, '', 'O', 0, 0, 0, false)) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      union all
      select * from (values ('usuarios_set_atualizado_em', to_regprocedure('public.set_atualizado_em()'), 19, '', 'O', 0, 0, 0, false)) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      except
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,''), t.tgenabled, t.tgnargs, octet_length(t.tgargs), t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.usuarios'::regclass and not t.tgisinternal
    ) as divergentes;

    select count(*) = 0 into v_pol_h
    from (
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname='public' and tablename='usuarios'
      except
      select * from (values
        ('Admins gerenciam usuarios','PERMISSIVE','ALL',array['authenticated']::name[],'usuario_e_admin()','usuario_e_admin()'),
        ('Usuarios podem atualizar dados basicos do proprio perfil','PERMISSIVE','UPDATE',array['authenticated']::name[],'(id = auth.uid())','((id = auth.uid()) AND (nivel_acesso = ( SELECT u.nivel_acesso
   FROM usuarios u
  WHERE (u.id = auth.uid()))))'),
        ('Usuarios podem ver o proprio perfil','PERMISSIVE','SELECT',array['authenticated']::name[],'((id = auth.uid()) OR usuario_e_admin())',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('Admins gerenciam usuarios','PERMISSIVE','ALL',array['authenticated']::name[],'usuario_e_admin()','usuario_e_admin()'),
        ('Usuarios podem atualizar dados basicos do proprio perfil','PERMISSIVE','UPDATE',array['authenticated']::name[],'(id = auth.uid())','((id = auth.uid()) AND (nivel_acesso = ( SELECT u.nivel_acesso
   FROM usuarios u
  WHERE (u.id = auth.uid()))))'),
        ('Usuarios podem ver o proprio perfil','PERMISSIVE','SELECT',array['authenticated']::name[],'((id = auth.uid()) OR usuario_e_admin())',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname='public' and tablename='usuarios'
    ) as divergentes;

    select count(*) = 0 into v_pol_o
    from (
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname='public' and tablename='usuarios'
      except
      select * from (values
        ('Admins gerenciam usuarios','PERMISSIVE','ALL',array['authenticated']::name[],'(usuario_e_admin() AND (empresa_id = empresa_atual_id()))','(usuario_e_admin() AND (empresa_id = empresa_atual_id()))'),
        ('Usuarios podem atualizar dados basicos do proprio perfil','PERMISSIVE','UPDATE',array['authenticated']::name[],'(id = auth.uid())','((id = auth.uid()) AND (nivel_acesso = ( SELECT u.nivel_acesso
   FROM usuarios u
  WHERE (u.id = auth.uid()))))'),
        ('Usuarios podem ver o proprio perfil','PERMISSIVE','SELECT',array['authenticated']::name[],'((id = auth.uid()) OR (usuario_e_admin() AND (empresa_id = empresa_atual_id())))',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('Admins gerenciam usuarios','PERMISSIVE','ALL',array['authenticated']::name[],'(usuario_e_admin() AND (empresa_id = empresa_atual_id()))','(usuario_e_admin() AND (empresa_id = empresa_atual_id()))'),
        ('Usuarios podem atualizar dados basicos do proprio perfil','PERMISSIVE','UPDATE',array['authenticated']::name[],'(id = auth.uid())','((id = auth.uid()) AND (nivel_acesso = ( SELECT u.nivel_acesso
   FROM usuarios u
  WHERE (u.id = auth.uid()))))'),
        ('Usuarios podem ver o proprio perfil','PERMISSIVE','SELECT',array['authenticated']::name[],'((id = auth.uid()) OR (usuario_e_admin() AND (empresa_id = empresa_atual_id())))',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname='public' and tablename='usuarios'
    ) as divergentes;

    v_estado_h := v_col and v_def and v_idgen and v_collation and v_con and v_idx and v_trig and v_pol_h and v_rls and v_owner and v_acl;
    v_estado_o := v_col and v_def and v_idgen and v_collation and v_con and v_idx and v_trig and v_pol_o and v_rls and v_owner and v_acl;

    if v_estado_h or v_estado_o then
      null;
    else
      raise exception 'FINGERPRINT DIVERGENTE em public.usuarios: nao corresponde integralmente a ESTADO HISTORICO nem a ESTADO ATUAL (hibrido/parcial/desconhecido). colunas(%) constraints(%) defaults(%) indices(%) triggers(%) policies(H=%,O=%) rls(%) owner(%) acl(%)',
        v_col, v_con, v_def, v_idx, v_trig, v_pol_h, v_pol_o, v_rls, v_owner, v_acl;
    end if;

  end if;
end $$;

-- =============================================================================
-- 4b. trigger usuarios_set_atualizado_em ON public.usuarios
--     ACHADO MATERIAL da reconciliacao r8 (SHA-256 268223a1cd8071e0ee
--     45197604de25c5732f17f213d35f309ebb28f036618b5d): este trigger e um
--     dos 9 triggers governados/fundacionais (existe no remoto real,
--     confirmado pg_trigger), mas havia sido omitido dos 3 candidatos.
--     Depende de public.usuarios (bloco 3) e public.set_atualizado_em()
--     (bloco 4), ambos ja garantidos acima neste mesmo arquivo.
-- =============================================================================
do $$
declare
  v_eventos text[];
  v_trig record;
begin
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.usuarios'::regclass
      and t.tgname = 'usuarios_set_atualizado_em'
      and not t.tgisinternal
  ) then
    create trigger usuarios_set_atualizado_em
      before update on public.usuarios
      for each row execute function public.set_atualizado_em();
  else
    select array_agg(distinct event_manipulation order by event_manipulation) into v_eventos
      from information_schema.triggers
     where event_object_schema = 'public' and event_object_table = 'usuarios'
       and trigger_name = 'usuarios_set_atualizado_em';

    if v_eventos is distinct from array['UPDATE'] then
      raise exception 'FINGERPRINT DIVERGENTE: trigger usuarios_set_atualizado_em com eventos diferentes de UPDATE. Real: %', v_eventos;
    end if;

    if exists (
      select 1 from information_schema.triggers
      where event_object_schema = 'public' and event_object_table = 'usuarios'
        and trigger_name = 'usuarios_set_atualizado_em'
        and (action_timing <> 'BEFORE' or action_orientation <> 'ROW' or action_condition is not null
             or action_statement <> 'EXECUTE FUNCTION set_atualizado_em()')
    ) then
      raise exception 'FINGERPRINT DIVERGENTE: trigger usuarios_set_atualizado_em com timing/orientacao/condicao/funcao diferente do esperado (BEFORE, ROW, sem WHEN, set_atualizado_em())';
    end if;

    -- Catalogo completo via pg_trigger (evidencia r8): tgfoid resolvido
    -- por OID exato (schema+nome+assinatura via to_regprocedure, nunca
    -- so por proname), tgenabled='O', tgtype=19, tgattr vazio,
    -- tgnargs=0, tgargs vazio, tgconstraint=0, tgisinternal=false,
    -- tgqual NULL.
    select t.tgrelid, t.tgfoid, t.tgenabled, t.tgtype,
           t.tgnargs, t.tgargs, t.tgconstraint, t.tgisinternal, t.tgqual, t.tgattr::text as tgattr
      into v_trig
      from pg_trigger t
     where t.tgrelid = 'public.usuarios'::regclass and t.tgname = 'usuarios_set_atualizado_em' and not t.tgisinternal;

    if v_trig.tgrelid <> 'public.usuarios'::regclass then
      raise exception 'FINGERPRINT DIVERGENTE: trigger usuarios_set_atualizado_em com tgrelid diferente de public.usuarios';
    end if;
    if v_trig.tgfoid <> to_regprocedure('public.set_atualizado_em()') then
      raise exception 'FINGERPRINT DIVERGENTE: trigger usuarios_set_atualizado_em com tgfoid nao apontando exatamente para public.set_atualizado_em()';
    end if;
    if v_trig.tgenabled <> 'O' then
      raise exception 'FINGERPRINT DIVERGENTE: trigger usuarios_set_atualizado_em com tgenabled diferente de O (habilitado). Real: %', v_trig.tgenabled;
    end if;
    if v_trig.tgtype <> 19 then
      raise exception 'FINGERPRINT DIVERGENTE: trigger usuarios_set_atualizado_em com tgtype diferente de 19. Real: %', v_trig.tgtype;
    end if;
    if coalesce(v_trig.tgattr, '') <> '' then
      raise exception 'FINGERPRINT DIVERGENTE: trigger usuarios_set_atualizado_em com tgattr nao vazio (UPDATE OF inesperado). Real: %', v_trig.tgattr;
    end if;
    if v_trig.tgnargs <> 0 or octet_length(v_trig.tgargs) <> 0 then
      raise exception 'FINGERPRINT DIVERGENTE: trigger usuarios_set_atualizado_em com argumentos, esperado nenhum';
    end if;
    if v_trig.tgconstraint <> 0 then
      raise exception 'FINGERPRINT DIVERGENTE: trigger usuarios_set_atualizado_em e constraint trigger, esperado trigger comum';
    end if;
    if v_trig.tgisinternal then
      raise exception 'FINGERPRINT DIVERGENTE: trigger usuarios_set_atualizado_em marcado tgisinternal, esperado false';
    end if;
    if v_trig.tgqual is not null then
      raise exception 'FINGERPRINT DIVERGENTE: trigger usuarios_set_atualizado_em possui WHEN (tgqual), esperado nenhum';
    end if;
  end if;
end $$;

-- =============================================================================
-- 5. public.credenciais — colunas/constraints/indices/trigger/RLS/
--    owner/ACL invariantes; discriminador exclusivo e' as 4 policies
--    (todas com qual/with_check diferente desde 202607100003).
-- =============================================================================
do $$
declare
  v_diff int;
  v_col boolean; v_def boolean; v_idgen boolean; v_collation boolean;
  v_con boolean; v_idx boolean; v_trig boolean;
  v_pol_h boolean; v_pol_o boolean;
  v_rls boolean; v_owner boolean; v_acl boolean;
  v_estado_h boolean; v_estado_o boolean;
begin
  if to_regclass('public.credenciais') is null then

    create table public.credenciais (
      id uuid primary key default gen_random_uuid(),
      nome_plataforma text not null,
      login text not null,
      senha_criptografada bytea,
      observacoes text,
      usuario_responsavel uuid not null references public.usuarios(id) on delete restrict,
      data_criacao timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      empresa_id uuid not null references public.empresas(id) on delete restrict
    );

    alter table public.credenciais enable row level security;
    alter table public.credenciais owner to postgres;

    create trigger credenciais_set_atualizado_em
      before update on public.credenciais
      for each row execute function public.set_atualizado_em();

    create policy "Usuarios atualizam suas credenciais" on public.credenciais
      for update to authenticated
      using (usuario_responsavel = auth.uid() or public.usuario_e_admin())
      with check (usuario_responsavel = auth.uid() or public.usuario_e_admin());

    create policy "Usuarios criam credenciais para si" on public.credenciais
      for insert to authenticated
      with check (usuario_responsavel = auth.uid() or public.usuario_e_admin());

    create policy "Usuarios removem suas credenciais" on public.credenciais
      for delete to authenticated
      using (usuario_responsavel = auth.uid() or public.usuario_e_admin());

    create policy "Usuarios veem credenciais sob responsabilidade" on public.credenciais
      for select to authenticated
      using (usuario_responsavel = auth.uid() or public.usuario_e_admin());

    revoke all on public.credenciais from public, anon, authenticated, service_role, postgres;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.credenciais to anon, authenticated, postgres, service_role;

    create index credenciais_usuario_responsavel_idx on public.credenciais using btree (usuario_responsavel);

  else

    select count(*) = 0 into v_col
    from (
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='credenciais'
      except
      select * from (values
        ('id','uuid','NO'),('nome_plataforma','text','NO'),('login','text','NO'),
        ('senha_criptografada','bytea','YES'),('observacoes','text','YES'),
        ('usuario_responsavel','uuid','NO'),('data_criacao','timestamp with time zone','NO'),
        ('atualizado_em','timestamp with time zone','NO'),('empresa_id','uuid','NO')
      ) as e(column_name, data_type, is_nullable)
      union all
      select * from (values
        ('id','uuid','NO'),('nome_plataforma','text','NO'),('login','text','NO'),
        ('senha_criptografada','bytea','YES'),('observacoes','text','YES'),
        ('usuario_responsavel','uuid','NO'),('data_criacao','timestamp with time zone','NO'),
        ('atualizado_em','timestamp with time zone','NO'),('empresa_id','uuid','NO')
      ) as e(column_name, data_type, is_nullable)
      except
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='credenciais'
    ) as divergentes;

    select count(*) = 0 into v_con
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.credenciais'::regclass
      except
      select * from (values
        ('credenciais_pkey','p','PRIMARY KEY (id)'),
        ('credenciais_usuario_responsavel_fkey','f','FOREIGN KEY (usuario_responsavel) REFERENCES usuarios(id) ON DELETE RESTRICT'),
        ('credenciais_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('credenciais_pkey','p','PRIMARY KEY (id)'),
        ('credenciais_usuario_responsavel_fkey','f','FOREIGN KEY (usuario_responsavel) REFERENCES usuarios(id) ON DELETE RESTRICT'),
        ('credenciais_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.credenciais'::regclass
    ) as divergentes;

    select count(*) = 0 into v_def
    from (
      select a.attname as coluna, pg_get_expr(ad.adbin, ad.adrelid) as default_real
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.credenciais'::regclass
         and a.attname = any(array['id','nome_plataforma','login','senha_criptografada','observacoes','usuario_responsavel','data_criacao','atualizado_em','empresa_id'])
      except
      select * from (values ('id','gen_random_uuid()'), ('data_criacao','now()'), ('atualizado_em','now()')) as e(coluna, default_esperado)
      union all
      select * from (values ('id','gen_random_uuid()'), ('data_criacao','now()'), ('atualizado_em','now()')) as e(coluna, default_esperado)
      except
      select a.attname, pg_get_expr(ad.adbin, ad.adrelid)
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.credenciais'::regclass
         and a.attname = any(array['id','nome_plataforma','login','senha_criptografada','observacoes','usuario_responsavel','data_criacao','atualizado_em','empresa_id'])
    ) as divergentes;

    v_idgen := not exists (
      select 1 from pg_attribute a
      where a.attrelid = 'public.credenciais'::regclass and a.attnum > 0 and not a.attisdropped
        and (a.attidentity <> '' or a.attgenerated <> '')
    );

    v_collation := not exists (
      select 1 from pg_attribute a
      left join pg_collation col on col.oid = a.attcollation
      where a.attrelid = 'public.credenciais'::regclass and a.attnum > 0 and not a.attisdropped
        and coalesce(col.collname, 'default') <> 'default'
    );

    v_rls := (select relrowsecurity from pg_class where oid = 'public.credenciais'::regclass)
             and not (select relforcerowsecurity from pg_class where oid = 'public.credenciais'::regclass);

    v_owner := (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.credenciais'::regclass) = 'postgres';

    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.credenciais'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.credenciais: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) = 0 into v_acl
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.credenciais'::regclass and a.grantee <> 0
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
       where c.oid = 'public.credenciais'::regclass and a.grantee <> 0
    ) as divergentes;

    select count(*) = 0 into v_idx
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.credenciais'::regclass
      except
      select * from (values
        ('credenciais_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX credenciais_pkey ON public.credenciais USING btree (id)'),
        ('credenciais_usuario_responsavel_idx',false,false,true,true,'btree','CREATE INDEX credenciais_usuario_responsavel_idx ON public.credenciais USING btree (usuario_responsavel)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('credenciais_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX credenciais_pkey ON public.credenciais USING btree (id)'),
        ('credenciais_usuario_responsavel_idx',false,false,true,true,'btree','CREATE INDEX credenciais_usuario_responsavel_idx ON public.credenciais USING btree (usuario_responsavel)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.credenciais'::regclass
    ) as divergentes;

    select count(*) = 0 into v_trig
    from (
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,'') as tgattr, t.tgenabled, t.tgnargs, octet_length(t.tgargs) as tgargs_len, t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.credenciais'::regclass and not t.tgisinternal
      except
      select * from (values ('credenciais_set_atualizado_em', to_regprocedure('public.set_atualizado_em()'), 19, '', 'O', 0, 0, 0, false)) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      union all
      select * from (values ('credenciais_set_atualizado_em', to_regprocedure('public.set_atualizado_em()'), 19, '', 'O', 0, 0, 0, false)) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      except
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,''), t.tgenabled, t.tgnargs, octet_length(t.tgargs), t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.credenciais'::regclass and not t.tgisinternal
    ) as divergentes;

    select count(*) = 0 into v_pol_h
    from (
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname='public' and tablename='credenciais'
      except
      select * from (values
        ('Usuarios atualizam suas credenciais','PERMISSIVE','UPDATE',array['authenticated']::name[],'((usuario_responsavel = auth.uid()) OR usuario_e_admin())','((usuario_responsavel = auth.uid()) OR usuario_e_admin())'),
        ('Usuarios criam credenciais para si','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((usuario_responsavel = auth.uid()) OR usuario_e_admin())'),
        ('Usuarios removem suas credenciais','PERMISSIVE','DELETE',array['authenticated']::name[],'((usuario_responsavel = auth.uid()) OR usuario_e_admin())',null),
        ('Usuarios veem credenciais sob responsabilidade','PERMISSIVE','SELECT',array['authenticated']::name[],'((usuario_responsavel = auth.uid()) OR usuario_e_admin())',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('Usuarios atualizam suas credenciais','PERMISSIVE','UPDATE',array['authenticated']::name[],'((usuario_responsavel = auth.uid()) OR usuario_e_admin())','((usuario_responsavel = auth.uid()) OR usuario_e_admin())'),
        ('Usuarios criam credenciais para si','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((usuario_responsavel = auth.uid()) OR usuario_e_admin())'),
        ('Usuarios removem suas credenciais','PERMISSIVE','DELETE',array['authenticated']::name[],'((usuario_responsavel = auth.uid()) OR usuario_e_admin())',null),
        ('Usuarios veem credenciais sob responsabilidade','PERMISSIVE','SELECT',array['authenticated']::name[],'((usuario_responsavel = auth.uid()) OR usuario_e_admin())',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname='public' and tablename='credenciais'
    ) as divergentes;

    select count(*) = 0 into v_pol_o
    from (
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname='public' and tablename='credenciais'
      except
      select * from (values
        ('Usuarios atualizam suas credenciais','PERMISSIVE','UPDATE',array['authenticated']::name[],'((usuario_responsavel = auth.uid()) OR (usuario_e_admin() AND (empresa_id = empresa_atual_id())))','((usuario_responsavel = auth.uid()) OR (usuario_e_admin() AND (empresa_id = empresa_atual_id())))'),
        ('Usuarios criam credenciais para si','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((usuario_responsavel = auth.uid()) OR (usuario_e_admin() AND (empresa_id = empresa_atual_id())))'),
        ('Usuarios removem suas credenciais','PERMISSIVE','DELETE',array['authenticated']::name[],'((usuario_responsavel = auth.uid()) OR (usuario_e_admin() AND (empresa_id = empresa_atual_id())))',null),
        ('Usuarios veem credenciais sob responsabilidade','PERMISSIVE','SELECT',array['authenticated']::name[],'((usuario_responsavel = auth.uid()) OR (usuario_e_admin() AND (empresa_id = empresa_atual_id())))',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('Usuarios atualizam suas credenciais','PERMISSIVE','UPDATE',array['authenticated']::name[],'((usuario_responsavel = auth.uid()) OR (usuario_e_admin() AND (empresa_id = empresa_atual_id())))','((usuario_responsavel = auth.uid()) OR (usuario_e_admin() AND (empresa_id = empresa_atual_id())))'),
        ('Usuarios criam credenciais para si','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((usuario_responsavel = auth.uid()) OR (usuario_e_admin() AND (empresa_id = empresa_atual_id())))'),
        ('Usuarios removem suas credenciais','PERMISSIVE','DELETE',array['authenticated']::name[],'((usuario_responsavel = auth.uid()) OR (usuario_e_admin() AND (empresa_id = empresa_atual_id())))',null),
        ('Usuarios veem credenciais sob responsabilidade','PERMISSIVE','SELECT',array['authenticated']::name[],'((usuario_responsavel = auth.uid()) OR (usuario_e_admin() AND (empresa_id = empresa_atual_id())))',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname='public' and tablename='credenciais'
    ) as divergentes;

    v_estado_h := v_col and v_def and v_idgen and v_collation and v_con and v_idx and v_trig and v_pol_h and v_rls and v_owner and v_acl;
    v_estado_o := v_col and v_def and v_idgen and v_collation and v_con and v_idx and v_trig and v_pol_o and v_rls and v_owner and v_acl;

    if v_estado_h or v_estado_o then
      null;
    else
      raise exception 'FINGERPRINT DIVERGENTE em public.credenciais: nao corresponde integralmente a ESTADO HISTORICO nem a ESTADO ATUAL (hibrido/parcial/desconhecido). colunas(%) constraints(%) defaults(%) indices(%) triggers(%) policies(H=%,O=%) rls(%) owner(%) acl(%)',
        v_col, v_con, v_def, v_idx, v_trig, v_pol_h, v_pol_o, v_rls, v_owner, v_acl;
    end if;

  end if;
end $$;

-- =============================================================================
-- public.set_empresa_id_from_usuario() — REALOCADA para o arquivo 01
-- (Bootstrap Junho). O trigger itens_industriais_set_empresa_id (parte
-- do Estado Historico certificado de itens_industriais, tambem em 01)
-- exige que a funcao ja exista no momento do CREATE TRIGGER — o OID e
-- resolvido imediatamente por CREATE TRIGGER, diferente do corpo de
-- funcao LANGUAGE sql, que e' deferido para a execucao. Este arquivo
-- (02) NUNCA cria nem revalida esta funcao — confia que o arquivo 01 ja
-- rodou antes, mesmo padrao ja usado para empresa_atual_id()/
-- usuario_e_admin()/set_updated_at(). Os triggers abaixo que a
-- referenciam (tecnologias_aplicadas_set_empresa_id,
-- funcionarios_set_empresa_id) apenas a usam em EXECUTE FUNCTION.
-- =============================================================================

-- =============================================================================
-- 7. public.tecnologias_aplicadas + 2 triggers + 4 policies
-- =============================================================================
do $$
declare
  v_diff int;
  v_pol record;
  v_con boolean; v_idx boolean; v_trig boolean;
begin
  if to_regclass('public.tecnologias_aplicadas') is null then

    create table public.tecnologias_aplicadas (
      id uuid primary key default gen_random_uuid(),
      empresa_id uuid not null references public.empresas(id) on delete restrict,
      codigo text not null,
      nome text not null,
      tipo text not null,
      valor_hora numeric not null,
      descricao text,
      ativo boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz,
      created_by uuid not null references auth.users(id),
      deleted_by uuid references auth.users(id)
    );

    alter table public.tecnologias_aplicadas enable row level security;
    alter table public.tecnologias_aplicadas owner to postgres;

    create unique index tecnologias_aplicadas_empresa_codigo_unique_idx on public.tecnologias_aplicadas using btree (empresa_id, codigo);
    create index tecnologias_aplicadas_empresa_id_idx on public.tecnologias_aplicadas using btree (empresa_id);
    create index tecnologias_aplicadas_codigo_idx on public.tecnologias_aplicadas using btree (codigo);
    create index tecnologias_aplicadas_tipo_idx on public.tecnologias_aplicadas using btree (tipo);
    create index tecnologias_aplicadas_ativo_idx on public.tecnologias_aplicadas using btree (ativo);
    create index tecnologias_aplicadas_deleted_at_idx on public.tecnologias_aplicadas using btree (deleted_at);
    create index tecnologias_aplicadas_updated_at_idx on public.tecnologias_aplicadas using btree (updated_at desc);
    create index tecnologias_aplicadas_empresa_ativo_deleted_idx on public.tecnologias_aplicadas using btree (empresa_id, ativo, deleted_at);
    create index tecnologias_aplicadas_empresa_codigo_idx on public.tecnologias_aplicadas using btree (empresa_id, codigo);
    create index tecnologias_aplicadas_empresa_tipo_idx on public.tecnologias_aplicadas using btree (empresa_id, tipo);

    create trigger tecnologias_aplicadas_set_empresa_id
      before insert on public.tecnologias_aplicadas
      for each row execute function public.set_empresa_id_from_usuario();

    create trigger tecnologias_aplicadas_set_updated_at
      before update on public.tecnologias_aplicadas
      for each row execute function public.set_updated_at();

    create policy "nexotfe tecnologias delete admin mesma empresa" on public.tecnologias_aplicadas
      for delete to authenticated
      using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

    create policy "nexotfe tecnologias insert mesma empresa" on public.tecnologias_aplicadas
      for insert to authenticated
      with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid());

    create policy "nexotfe tecnologias select mesma empresa" on public.tecnologias_aplicadas
      for select to authenticated
      using (empresa_id = public.empresa_atual_id());

    create policy "nexotfe tecnologias update mesma empresa" on public.tecnologias_aplicadas
      for update to authenticated
      using (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()))
      with check (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()));

    revoke all on public.tecnologias_aplicadas from public, anon, authenticated, service_role, postgres;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.tecnologias_aplicadas to anon, authenticated, postgres, service_role;

  else

    select count(*) into v_diff
    from (
      values
        ('id','uuid','NO'), ('empresa_id','uuid','NO'), ('codigo','text','NO'),
        ('nome','text','NO'), ('tipo','text','NO'), ('valor_hora','numeric','NO'),
        ('descricao','text','YES'), ('ativo','boolean','NO'),
        ('created_at','timestamp with time zone','NO'), ('updated_at','timestamp with time zone','NO'),
        ('deleted_at','timestamp with time zone','YES'), ('created_by','uuid','NO'),
        ('deleted_by','uuid','YES')
    ) as esperado(coluna, tipo, nulavel)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name='tecnologias_aplicadas'
        and c.column_name=esperado.coluna and c.data_type=esperado.tipo and c.is_nullable=esperado.nulavel
    );
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas: % coluna(s) divergente(s)', v_diff;
    end if;

    select count(*) into v_diff
    from (
      select a.attname as coluna, pg_get_expr(ad.adbin, ad.adrelid) as default_real
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.tecnologias_aplicadas'::regclass
         and a.attname = any(array['id','empresa_id','codigo','nome','tipo','valor_hora','descricao','ativo','created_at','updated_at','deleted_at','created_by','deleted_by'])
      except
      select * from (values ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('updated_at','now()')) as e(coluna, default_esperado)
      union all
      select * from (values ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('updated_at','now()')) as e(coluna, default_esperado)
      except
      select a.attname, pg_get_expr(ad.adbin, ad.adrelid)
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.tecnologias_aplicadas'::regclass
         and a.attname = any(array['id','empresa_id','codigo','nome','tipo','valor_hora','descricao','ativo','created_at','updated_at','deleted_at','created_by','deleted_by'])
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas: % default(s) de coluna divergente(s) do certificado (ausente, expressao diferente, ou default adicional inesperado)', v_diff;
    end if;

    if exists (
      select 1 from pg_attribute a
      where a.attrelid = 'public.tecnologias_aplicadas'::regclass and a.attnum > 0 and not a.attisdropped
        and (a.attidentity <> '' or a.attgenerated <> '')
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas: coluna com IDENTITY ou GENERATED encontrada, esperado nenhuma';
    end if;

    if exists (
      select 1 from pg_attribute a
      left join pg_collation col on col.oid = a.attcollation
      where a.attrelid = 'public.tecnologias_aplicadas'::regclass and a.attnum > 0 and not a.attisdropped
        and coalesce(col.collname, 'default') <> 'default'
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas: coluna com collation customizada encontrada, esperado default/nenhuma';
    end if;

    if not (select relrowsecurity from pg_class where oid = 'public.tecnologias_aplicadas'::regclass) then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas: RLS nao habilitada';
    end if;
    if (select relforcerowsecurity from pg_class where oid = 'public.tecnologias_aplicadas'::regclass) then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas: FORCE ROW LEVEL SECURITY habilitada, esperado desabilitada (evidencia r8)';
    end if;

    if (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.tecnologias_aplicadas'::regclass) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas: owner diferente de postgres';
    end if;

    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.tecnologias_aplicadas'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.tecnologias_aplicadas'::regclass and a.grantee <> 0
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
       where c.oid = 'public.tecnologias_aplicadas'::regclass and a.grantee <> 0
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;

    select count(*) = 0 into v_con
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.tecnologias_aplicadas'::regclass
      except
      select * from (values
        ('tecnologias_aplicadas_pkey','p','PRIMARY KEY (id)'),
        ('tecnologias_aplicadas_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id)'),
        ('tecnologias_aplicadas_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id)'),
        ('tecnologias_aplicadas_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('tecnologias_aplicadas_pkey','p','PRIMARY KEY (id)'),
        ('tecnologias_aplicadas_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id)'),
        ('tecnologias_aplicadas_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id)'),
        ('tecnologias_aplicadas_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.tecnologias_aplicadas'::regclass
    ) as divergentes;
    if not v_con then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas: constraints divergem das aprovadas (pkey + created_by_fkey + deleted_by_fkey + empresa_id_fkey)';
    end if;

    -- Indices: EXPECTED = CREATED = VALIDATED, cardinalidade 11 (PK
    -- implicita + 10 indices secundarios explicitos, evidencia r9 +
    -- dump certificado independentemente). Igualdade bidirecional via
    -- EXCEPT/UNION ALL, nome+indisunique+indisprimary+indisvalid+
    -- indisready+access_method+pg_get_indexdef(indexrelid,0,false)
    -- integral (cobre colunas/expressoes/ASC-DESC/NULLS NOT DISTINCT
    -- quando houver — nenhum dos 11 usa).
    select count(*) = 0 into v_idx
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.tecnologias_aplicadas'::regclass
      except
      select * from (values
        ('tecnologias_aplicadas_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX tecnologias_aplicadas_pkey ON public.tecnologias_aplicadas USING btree (id)'),
        ('tecnologias_aplicadas_empresa_codigo_unique_idx',true,false,true,true,'btree','CREATE UNIQUE INDEX tecnologias_aplicadas_empresa_codigo_unique_idx ON public.tecnologias_aplicadas USING btree (empresa_id, codigo)'),
        ('tecnologias_aplicadas_empresa_id_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_empresa_id_idx ON public.tecnologias_aplicadas USING btree (empresa_id)'),
        ('tecnologias_aplicadas_codigo_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_codigo_idx ON public.tecnologias_aplicadas USING btree (codigo)'),
        ('tecnologias_aplicadas_tipo_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_tipo_idx ON public.tecnologias_aplicadas USING btree (tipo)'),
        ('tecnologias_aplicadas_ativo_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_ativo_idx ON public.tecnologias_aplicadas USING btree (ativo)'),
        ('tecnologias_aplicadas_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_deleted_at_idx ON public.tecnologias_aplicadas USING btree (deleted_at)'),
        ('tecnologias_aplicadas_updated_at_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_updated_at_idx ON public.tecnologias_aplicadas USING btree (updated_at DESC)'),
        ('tecnologias_aplicadas_empresa_ativo_deleted_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_empresa_ativo_deleted_idx ON public.tecnologias_aplicadas USING btree (empresa_id, ativo, deleted_at)'),
        ('tecnologias_aplicadas_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_empresa_codigo_idx ON public.tecnologias_aplicadas USING btree (empresa_id, codigo)'),
        ('tecnologias_aplicadas_empresa_tipo_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_empresa_tipo_idx ON public.tecnologias_aplicadas USING btree (empresa_id, tipo)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('tecnologias_aplicadas_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX tecnologias_aplicadas_pkey ON public.tecnologias_aplicadas USING btree (id)'),
        ('tecnologias_aplicadas_empresa_codigo_unique_idx',true,false,true,true,'btree','CREATE UNIQUE INDEX tecnologias_aplicadas_empresa_codigo_unique_idx ON public.tecnologias_aplicadas USING btree (empresa_id, codigo)'),
        ('tecnologias_aplicadas_empresa_id_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_empresa_id_idx ON public.tecnologias_aplicadas USING btree (empresa_id)'),
        ('tecnologias_aplicadas_codigo_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_codigo_idx ON public.tecnologias_aplicadas USING btree (codigo)'),
        ('tecnologias_aplicadas_tipo_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_tipo_idx ON public.tecnologias_aplicadas USING btree (tipo)'),
        ('tecnologias_aplicadas_ativo_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_ativo_idx ON public.tecnologias_aplicadas USING btree (ativo)'),
        ('tecnologias_aplicadas_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_deleted_at_idx ON public.tecnologias_aplicadas USING btree (deleted_at)'),
        ('tecnologias_aplicadas_updated_at_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_updated_at_idx ON public.tecnologias_aplicadas USING btree (updated_at DESC)'),
        ('tecnologias_aplicadas_empresa_ativo_deleted_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_empresa_ativo_deleted_idx ON public.tecnologias_aplicadas USING btree (empresa_id, ativo, deleted_at)'),
        ('tecnologias_aplicadas_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_empresa_codigo_idx ON public.tecnologias_aplicadas USING btree (empresa_id, codigo)'),
        ('tecnologias_aplicadas_empresa_tipo_idx',false,false,true,true,'btree','CREATE INDEX tecnologias_aplicadas_empresa_tipo_idx ON public.tecnologias_aplicadas USING btree (empresa_id, tipo)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.tecnologias_aplicadas'::regclass
    ) as divergentes;
    if not v_idx then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas: indices divergem dos aprovados (esperado exatamente 11: pkey + 10 secundarios, incl. empresa_codigo_unique_idx)';
    end if;

    if not exists (
      select 1 from information_schema.triggers
      where event_object_schema='public' and event_object_table='tecnologias_aplicadas' and trigger_name='tecnologias_aplicadas_set_empresa_id'
        and event_manipulation='INSERT' and action_timing='BEFORE' and action_orientation='ROW'
        and action_condition is null and action_statement = 'EXECUTE FUNCTION set_empresa_id_from_usuario()'
    ) then
      raise exception 'FINGERPRINT DIVERGENTE: trigger tecnologias_aplicadas_set_empresa_id ausente ou diferente do esperado';
    end if;

    if not exists (
      select 1 from pg_trigger t
      where t.tgrelid = 'public.tecnologias_aplicadas'::regclass and t.tgname = 'tecnologias_aplicadas_set_empresa_id'
        and t.tgfoid = to_regprocedure('public.set_empresa_id_from_usuario()') and t.tgenabled = 'O' and t.tgtype = 7
        and coalesce(t.tgattr::text,'') = '' and t.tgnargs = 0 and octet_length(t.tgargs) = 0 and t.tgconstraint = 0
        and not t.tgisinternal and t.tgqual is null
    ) then
      raise exception 'FINGERPRINT DIVERGENTE: trigger tecnologias_aplicadas_set_empresa_id com catalogo pg_trigger divergente do certificado (tgfoid/tgattr/tgenabled/tgtype/tgnargs/tgargs/tgconstraint/tgisinternal/tgqual)';
    end if;

    if not exists (
      select 1 from information_schema.triggers
      where event_object_schema='public' and event_object_table='tecnologias_aplicadas' and trigger_name='tecnologias_aplicadas_set_updated_at'
        and event_manipulation='UPDATE' and action_timing='BEFORE' and action_orientation='ROW'
        and action_condition is null and action_statement = 'EXECUTE FUNCTION set_updated_at()'
    ) then
      raise exception 'FINGERPRINT DIVERGENTE: trigger tecnologias_aplicadas_set_updated_at ausente ou diferente do esperado';
    end if;

    if not exists (
      select 1 from pg_trigger t
      where t.tgrelid = 'public.tecnologias_aplicadas'::regclass and t.tgname = 'tecnologias_aplicadas_set_updated_at'
        and t.tgfoid = to_regprocedure('public.set_updated_at()') and t.tgenabled = 'O' and t.tgtype = 19
        and coalesce(t.tgattr::text,'') = '' and t.tgnargs = 0 and octet_length(t.tgargs) = 0 and t.tgconstraint = 0
        and not t.tgisinternal and t.tgqual is null
    ) then
      raise exception 'FINGERPRINT DIVERGENTE: trigger tecnologias_aplicadas_set_updated_at com catalogo pg_trigger divergente do certificado (tgfoid/tgattr/tgenabled/tgtype/tgnargs/tgargs/tgconstraint/tgisinternal/tgqual)';
    end if;

    -- Prova independente de completude do conjunto (nao substitui as duas
    -- validacoes individuais acima, que continuam exigindo o fingerprint
    -- completo de cada trigger): igualdade bidirecional REAL = EXPECTED
    -- sobre o CONJUNTO DE NOMES de triggers nao-internos. Reprova 0
    -- triggers, 1 trigger, trigger esperado ausente, terceiro trigger
    -- extra, ou qualquer trigger com nome nao esperado.
    select count(*) = 0 into v_trig
    from (
      select t.tgname from pg_trigger t
       where t.tgrelid = 'public.tecnologias_aplicadas'::regclass and not t.tgisinternal
      except
      select * from (values ('tecnologias_aplicadas_set_empresa_id'), ('tecnologias_aplicadas_set_updated_at')) as e(tgname)
      union all
      select * from (values ('tecnologias_aplicadas_set_empresa_id'), ('tecnologias_aplicadas_set_updated_at')) as e(tgname)
      except
      select t.tgname from pg_trigger t
       where t.tgrelid = 'public.tecnologias_aplicadas'::regclass and not t.tgisinternal
    ) as divergentes;
    if not v_trig then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas: conjunto de triggers nao-internos diverge do esperado (exatamente tecnologias_aplicadas_set_empresa_id e tecnologias_aplicadas_set_updated_at, nenhum a mais nem a menos)';
    end if;

    for v_pol in
      select policyname, permissive, roles, cmd, qual, with_check
      from pg_policies where schemaname='public' and tablename='tecnologias_aplicadas'
    loop
      if v_pol.policyname = 'nexotfe tecnologias delete admin mesma empresa' then
        if v_pol.permissive <> 'PERMISSIVE' or (select array_agg(x order by x) from unnest(v_pol.roles) as x) <> array['authenticated']::name[] or v_pol.cmd <> 'DELETE'
           or v_pol.qual is distinct from '((empresa_id = empresa_atual_id()) AND usuario_e_admin())' or v_pol.with_check is not null
        then
          raise exception 'FINGERPRINT DIVERGENTE: policy "nexotfe tecnologias delete admin mesma empresa" diverge da aprovada';
        end if;
      elsif v_pol.policyname = 'nexotfe tecnologias insert mesma empresa' then
        if v_pol.permissive <> 'PERMISSIVE' or (select array_agg(x order by x) from unnest(v_pol.roles) as x) <> array['authenticated']::name[] or v_pol.cmd <> 'INSERT'
           or v_pol.qual is not null
           or v_pol.with_check is distinct from '((empresa_id = empresa_atual_id()) AND (created_by = auth.uid()))'
        then
          raise exception 'FINGERPRINT DIVERGENTE: policy "nexotfe tecnologias insert mesma empresa" diverge da aprovada';
        end if;
      elsif v_pol.policyname = 'nexotfe tecnologias select mesma empresa' then
        if v_pol.permissive <> 'PERMISSIVE' or (select array_agg(x order by x) from unnest(v_pol.roles) as x) <> array['authenticated']::name[] or v_pol.cmd <> 'SELECT'
           or v_pol.qual is distinct from '(empresa_id = empresa_atual_id())' or v_pol.with_check is not null
        then
          raise exception 'FINGERPRINT DIVERGENTE: policy "nexotfe tecnologias select mesma empresa" diverge da aprovada';
        end if;
      elsif v_pol.policyname = 'nexotfe tecnologias update mesma empresa' then
        if v_pol.permissive <> 'PERMISSIVE' or (select array_agg(x order by x) from unnest(v_pol.roles) as x) <> array['authenticated']::name[] or v_pol.cmd <> 'UPDATE'
           or v_pol.qual is distinct from '((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))'
           or v_pol.with_check is distinct from '((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))'
        then
          raise exception 'FINGERPRINT DIVERGENTE: policy "nexotfe tecnologias update mesma empresa" diverge da aprovada';
        end if;
      end if;
    end loop;

    if (select count(*) from pg_policies where schemaname='public' and tablename='tecnologias_aplicadas') <> 4 then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas: numero de policies diferente de 4';
    end if;

  end if;
end $$;

-- =============================================================================
-- 8. public.grupos_recursos — H: 15 colunas, 4 constraints (sem CHECK),
--    15 indices (codigo_key unico), 1 trigger, 6 policies historicas.
--    O: 16 colunas (+produtividade_padrao), 5 constraints (+CHECK), 15
--    indices (empresa_codigo_unique_idx substitui codigo_key), 2
--    triggers (+bump_capacidade_versao), 4 policies atuais.
-- =============================================================================
do $$
declare
  v_col_h boolean; v_col_o boolean; v_def boolean; v_idgen boolean; v_collation boolean;
  v_con_h boolean; v_con_o boolean; v_idx_h boolean; v_idx_o boolean;
  v_trig_h boolean; v_trig_o boolean;
  v_pol_h boolean; v_pol_o boolean;
  v_rls boolean; v_owner boolean; v_acl boolean;
  v_estado_h boolean; v_estado_o boolean;
begin
  if to_regclass('public.grupos_recursos') is null then

    create table public.grupos_recursos (
      id uuid primary key default gen_random_uuid(),
      nome text not null,
      descricao text,
      setor text,
      ativo boolean not null default true,
      created_at timestamptz not null default now(),
      created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
      codigo text not null,
      capacidade_total numeric not null default 0,
      disponibilidade_atual numeric not null default 0,
      unidade_capacidade text not null default 'h/dia',
      empresa_id uuid not null references public.empresas(id) on delete restrict,
      updated_at timestamptz not null default now(),
      deleted_at timestamptz,
      deleted_by uuid references auth.users(id) on delete set null
    );

    alter table public.grupos_recursos enable row level security;
    alter table public.grupos_recursos owner to postgres;

    create unique index grupos_recursos_codigo_key on public.grupos_recursos using btree (codigo);
    create index grupos_recursos_nome_idx on public.grupos_recursos using btree (nome);
    create index grupos_recursos_setor_idx on public.grupos_recursos using btree (setor);
    create index grupos_recursos_ativo_idx on public.grupos_recursos using btree (ativo);
    create index grupos_recursos_created_by_idx on public.grupos_recursos using btree (created_by);
    create index grupos_recursos_capacidade_total_idx on public.grupos_recursos using btree (capacidade_total);
    create index grupos_recursos_disponibilidade_atual_idx on public.grupos_recursos using btree (disponibilidade_atual);
    create index grupos_recursos_updated_at_idx on public.grupos_recursos using btree (updated_at desc);
    create index grupos_recursos_deleted_at_idx on public.grupos_recursos using btree (deleted_at);
    create index grupos_recursos_empresa_deleted_at_idx on public.grupos_recursos using btree (empresa_id, deleted_at);
    create index grupos_recursos_empresa_ativo_deleted_at_idx on public.grupos_recursos using btree (empresa_id, ativo, deleted_at);
    create index grupos_recursos_deleted_by_idx on public.grupos_recursos using btree (deleted_by);
    create index grupos_recursos_empresa_updated_at_idx on public.grupos_recursos using btree (empresa_id, updated_at desc);
    create index grupos_recursos_empresa_codigo_idx on public.grupos_recursos using btree (empresa_id, codigo);

    create trigger grupos_recursos_set_updated_at
      before update on public.grupos_recursos
      for each row execute function public.set_updated_at();

    create policy "Authenticated users can view grupos" on public.grupos_recursos
      for select to authenticated using (true);

    create policy "admins excluem grupos recursos" on public.grupos_recursos
      for delete to authenticated using (public.usuario_e_admin());

    create policy "nexotfe grupos recursos select autenticado" on public.grupos_recursos
      for select to authenticated using (true);

    create policy "nexotfe grupos recursos update criador ou admin" on public.grupos_recursos
      for update to authenticated
      using (created_by = auth.uid() or public.usuario_e_admin())
      with check (created_by = auth.uid() or public.usuario_e_admin());

    create policy "usuarios autenticados criam grupos recursos" on public.grupos_recursos
      for insert to authenticated with check (created_by = auth.uid());

    create policy "usuarios autenticados visualizam grupos recursos" on public.grupos_recursos
      for select to authenticated using (true);

    revoke all on public.grupos_recursos from public, anon, authenticated, service_role, postgres;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.grupos_recursos to anon, authenticated, postgres, service_role;

  else

    select count(*) = 0 into v_col_h
    from (
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='grupos_recursos'
      except
      select * from (values
        ('id','uuid','NO'),('nome','text','NO'),('descricao','text','YES'),
        ('setor','text','YES'),('ativo','boolean','NO'),('created_at','timestamp with time zone','NO'),
        ('created_by','uuid','NO'),('codigo','text','NO'),('capacidade_total','numeric','NO'),
        ('disponibilidade_atual','numeric','NO'),('unidade_capacidade','text','NO'),('empresa_id','uuid','NO'),
        ('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('deleted_by','uuid','YES')
      ) as e(column_name, data_type, is_nullable)
      union all
      select * from (values
        ('id','uuid','NO'),('nome','text','NO'),('descricao','text','YES'),
        ('setor','text','YES'),('ativo','boolean','NO'),('created_at','timestamp with time zone','NO'),
        ('created_by','uuid','NO'),('codigo','text','NO'),('capacidade_total','numeric','NO'),
        ('disponibilidade_atual','numeric','NO'),('unidade_capacidade','text','NO'),('empresa_id','uuid','NO'),
        ('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('deleted_by','uuid','YES')
      ) as e(column_name, data_type, is_nullable)
      except
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='grupos_recursos'
    ) as divergentes;

    select count(*) = 0 into v_col_o
    from (
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='grupos_recursos'
      except
      select * from (values
        ('id','uuid','NO'),('nome','text','NO'),('descricao','text','YES'),
        ('setor','text','YES'),('ativo','boolean','NO'),('created_at','timestamp with time zone','NO'),
        ('created_by','uuid','NO'),('codigo','text','NO'),('capacidade_total','numeric','NO'),
        ('disponibilidade_atual','numeric','NO'),('unidade_capacidade','text','NO'),('empresa_id','uuid','NO'),
        ('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('deleted_by','uuid','YES'),('produtividade_padrao','numeric','YES')
      ) as e(column_name, data_type, is_nullable)
      union all
      select * from (values
        ('id','uuid','NO'),('nome','text','NO'),('descricao','text','YES'),
        ('setor','text','YES'),('ativo','boolean','NO'),('created_at','timestamp with time zone','NO'),
        ('created_by','uuid','NO'),('codigo','text','NO'),('capacidade_total','numeric','NO'),
        ('disponibilidade_atual','numeric','NO'),('unidade_capacidade','text','NO'),('empresa_id','uuid','NO'),
        ('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('deleted_by','uuid','YES'),('produtividade_padrao','numeric','YES')
      ) as e(column_name, data_type, is_nullable)
      except
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='grupos_recursos'
    ) as divergentes;

    select count(*) = 0 into v_con_h
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.grupos_recursos'::regclass
      except
      select * from (values
        ('grupos_recursos_pkey','p','PRIMARY KEY (id)'),
        ('grupos_recursos_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT'),
        ('grupos_recursos_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
        ('grupos_recursos_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('grupos_recursos_pkey','p','PRIMARY KEY (id)'),
        ('grupos_recursos_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT'),
        ('grupos_recursos_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
        ('grupos_recursos_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.grupos_recursos'::regclass
    ) as divergentes;

    select count(*) = 0 into v_con_o
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.grupos_recursos'::regclass
      except
      select * from (values
        ('grupos_recursos_pkey','p','PRIMARY KEY (id)'),
        ('grupos_recursos_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT'),
        ('grupos_recursos_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
        ('grupos_recursos_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('grupos_recursos_produtividade_padrao_chk','c','CHECK (((produtividade_padrao IS NULL) OR ((produtividade_padrao > (0)::numeric) AND (produtividade_padrao <= (1)::numeric))))')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('grupos_recursos_pkey','p','PRIMARY KEY (id)'),
        ('grupos_recursos_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT'),
        ('grupos_recursos_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
        ('grupos_recursos_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('grupos_recursos_produtividade_padrao_chk','c','CHECK (((produtividade_padrao IS NULL) OR ((produtividade_padrao > (0)::numeric) AND (produtividade_padrao <= (1)::numeric))))')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.grupos_recursos'::regclass
    ) as divergentes;

    select count(*) = 0 into v_def
    from (
      select a.attname as coluna, pg_get_expr(ad.adbin, ad.adrelid) as default_real
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.grupos_recursos'::regclass
         and a.attname = any(array['id','nome','descricao','setor','ativo','created_at','created_by','codigo','capacidade_total','disponibilidade_atual','unidade_capacidade','empresa_id','updated_at','deleted_at','deleted_by','produtividade_padrao'])
      except
      select * from (values
        ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('created_by','auth.uid()'),
        ('capacidade_total','0'), ('disponibilidade_atual','0'), ('unidade_capacidade','''h/dia''::text'),
        ('updated_at','now()')
      ) as e(coluna, default_esperado)
      union all
      select * from (values
        ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('created_by','auth.uid()'),
        ('capacidade_total','0'), ('disponibilidade_atual','0'), ('unidade_capacidade','''h/dia''::text'),
        ('updated_at','now()')
      ) as e(coluna, default_esperado)
      except
      select a.attname, pg_get_expr(ad.adbin, ad.adrelid)
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.grupos_recursos'::regclass
         and a.attname = any(array['id','nome','descricao','setor','ativo','created_at','created_by','codigo','capacidade_total','disponibilidade_atual','unidade_capacidade','empresa_id','updated_at','deleted_at','deleted_by','produtividade_padrao'])
    ) as divergentes;

    v_idgen := not exists (
      select 1 from pg_attribute a
      where a.attrelid = 'public.grupos_recursos'::regclass and a.attnum > 0 and not a.attisdropped
        and (a.attidentity <> '' or a.attgenerated <> '')
    );

    v_collation := not exists (
      select 1 from pg_attribute a
      left join pg_collation col on col.oid = a.attcollation
      where a.attrelid = 'public.grupos_recursos'::regclass and a.attnum > 0 and not a.attisdropped
        and coalesce(col.collname, 'default') <> 'default'
    );

    v_rls := (select relrowsecurity from pg_class where oid = 'public.grupos_recursos'::regclass)
             and not (select relforcerowsecurity from pg_class where oid = 'public.grupos_recursos'::regclass);

    v_owner := (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.grupos_recursos'::regclass) = 'postgres';

    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.grupos_recursos'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.grupos_recursos: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) = 0 into v_acl
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.grupos_recursos'::regclass and a.grantee <> 0
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
       where c.oid = 'public.grupos_recursos'::regclass and a.grantee <> 0
    ) as divergentes;

    select count(*) = 0 into v_idx_h
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.grupos_recursos'::regclass
      except
      select * from (values
        ('grupos_recursos_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX grupos_recursos_pkey ON public.grupos_recursos USING btree (id)'),
        ('grupos_recursos_nome_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_nome_idx ON public.grupos_recursos USING btree (nome)'),
        ('grupos_recursos_setor_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_setor_idx ON public.grupos_recursos USING btree (setor)'),
        ('grupos_recursos_ativo_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_ativo_idx ON public.grupos_recursos USING btree (ativo)'),
        ('grupos_recursos_created_by_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_created_by_idx ON public.grupos_recursos USING btree (created_by)'),
        ('grupos_recursos_capacidade_total_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_capacidade_total_idx ON public.grupos_recursos USING btree (capacidade_total)'),
        ('grupos_recursos_disponibilidade_atual_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_disponibilidade_atual_idx ON public.grupos_recursos USING btree (disponibilidade_atual)'),
        ('grupos_recursos_updated_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_updated_at_idx ON public.grupos_recursos USING btree (updated_at DESC)'),
        ('grupos_recursos_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_deleted_at_idx ON public.grupos_recursos USING btree (deleted_at)'),
        ('grupos_recursos_empresa_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_deleted_at_idx ON public.grupos_recursos USING btree (empresa_id, deleted_at)'),
        ('grupos_recursos_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_ativo_deleted_at_idx ON public.grupos_recursos USING btree (empresa_id, ativo, deleted_at)'),
        ('grupos_recursos_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_deleted_by_idx ON public.grupos_recursos USING btree (deleted_by)'),
        ('grupos_recursos_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_updated_at_idx ON public.grupos_recursos USING btree (empresa_id, updated_at DESC)'),
        ('grupos_recursos_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_codigo_idx ON public.grupos_recursos USING btree (empresa_id, codigo)'),
        ('grupos_recursos_codigo_key',true,false,true,true,'btree','CREATE UNIQUE INDEX grupos_recursos_codigo_key ON public.grupos_recursos USING btree (codigo)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('grupos_recursos_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX grupos_recursos_pkey ON public.grupos_recursos USING btree (id)'),
        ('grupos_recursos_nome_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_nome_idx ON public.grupos_recursos USING btree (nome)'),
        ('grupos_recursos_setor_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_setor_idx ON public.grupos_recursos USING btree (setor)'),
        ('grupos_recursos_ativo_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_ativo_idx ON public.grupos_recursos USING btree (ativo)'),
        ('grupos_recursos_created_by_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_created_by_idx ON public.grupos_recursos USING btree (created_by)'),
        ('grupos_recursos_capacidade_total_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_capacidade_total_idx ON public.grupos_recursos USING btree (capacidade_total)'),
        ('grupos_recursos_disponibilidade_atual_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_disponibilidade_atual_idx ON public.grupos_recursos USING btree (disponibilidade_atual)'),
        ('grupos_recursos_updated_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_updated_at_idx ON public.grupos_recursos USING btree (updated_at DESC)'),
        ('grupos_recursos_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_deleted_at_idx ON public.grupos_recursos USING btree (deleted_at)'),
        ('grupos_recursos_empresa_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_deleted_at_idx ON public.grupos_recursos USING btree (empresa_id, deleted_at)'),
        ('grupos_recursos_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_ativo_deleted_at_idx ON public.grupos_recursos USING btree (empresa_id, ativo, deleted_at)'),
        ('grupos_recursos_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_deleted_by_idx ON public.grupos_recursos USING btree (deleted_by)'),
        ('grupos_recursos_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_updated_at_idx ON public.grupos_recursos USING btree (empresa_id, updated_at DESC)'),
        ('grupos_recursos_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_codigo_idx ON public.grupos_recursos USING btree (empresa_id, codigo)'),
        ('grupos_recursos_codigo_key',true,false,true,true,'btree','CREATE UNIQUE INDEX grupos_recursos_codigo_key ON public.grupos_recursos USING btree (codigo)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.grupos_recursos'::regclass
    ) as divergentes;

    select count(*) = 0 into v_idx_o
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.grupos_recursos'::regclass
      except
      select * from (values
        ('grupos_recursos_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX grupos_recursos_pkey ON public.grupos_recursos USING btree (id)'),
        ('grupos_recursos_nome_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_nome_idx ON public.grupos_recursos USING btree (nome)'),
        ('grupos_recursos_setor_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_setor_idx ON public.grupos_recursos USING btree (setor)'),
        ('grupos_recursos_ativo_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_ativo_idx ON public.grupos_recursos USING btree (ativo)'),
        ('grupos_recursos_created_by_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_created_by_idx ON public.grupos_recursos USING btree (created_by)'),
        ('grupos_recursos_capacidade_total_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_capacidade_total_idx ON public.grupos_recursos USING btree (capacidade_total)'),
        ('grupos_recursos_disponibilidade_atual_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_disponibilidade_atual_idx ON public.grupos_recursos USING btree (disponibilidade_atual)'),
        ('grupos_recursos_updated_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_updated_at_idx ON public.grupos_recursos USING btree (updated_at DESC)'),
        ('grupos_recursos_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_deleted_at_idx ON public.grupos_recursos USING btree (deleted_at)'),
        ('grupos_recursos_empresa_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_deleted_at_idx ON public.grupos_recursos USING btree (empresa_id, deleted_at)'),
        ('grupos_recursos_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_ativo_deleted_at_idx ON public.grupos_recursos USING btree (empresa_id, ativo, deleted_at)'),
        ('grupos_recursos_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_deleted_by_idx ON public.grupos_recursos USING btree (deleted_by)'),
        ('grupos_recursos_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_updated_at_idx ON public.grupos_recursos USING btree (empresa_id, updated_at DESC)'),
        ('grupos_recursos_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_codigo_idx ON public.grupos_recursos USING btree (empresa_id, codigo)'),
        ('grupos_recursos_empresa_codigo_unique_idx',true,false,true,true,'btree','CREATE UNIQUE INDEX grupos_recursos_empresa_codigo_unique_idx ON public.grupos_recursos USING btree (empresa_id, codigo) WHERE (deleted_at IS NULL)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('grupos_recursos_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX grupos_recursos_pkey ON public.grupos_recursos USING btree (id)'),
        ('grupos_recursos_nome_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_nome_idx ON public.grupos_recursos USING btree (nome)'),
        ('grupos_recursos_setor_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_setor_idx ON public.grupos_recursos USING btree (setor)'),
        ('grupos_recursos_ativo_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_ativo_idx ON public.grupos_recursos USING btree (ativo)'),
        ('grupos_recursos_created_by_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_created_by_idx ON public.grupos_recursos USING btree (created_by)'),
        ('grupos_recursos_capacidade_total_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_capacidade_total_idx ON public.grupos_recursos USING btree (capacidade_total)'),
        ('grupos_recursos_disponibilidade_atual_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_disponibilidade_atual_idx ON public.grupos_recursos USING btree (disponibilidade_atual)'),
        ('grupos_recursos_updated_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_updated_at_idx ON public.grupos_recursos USING btree (updated_at DESC)'),
        ('grupos_recursos_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_deleted_at_idx ON public.grupos_recursos USING btree (deleted_at)'),
        ('grupos_recursos_empresa_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_deleted_at_idx ON public.grupos_recursos USING btree (empresa_id, deleted_at)'),
        ('grupos_recursos_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_ativo_deleted_at_idx ON public.grupos_recursos USING btree (empresa_id, ativo, deleted_at)'),
        ('grupos_recursos_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_deleted_by_idx ON public.grupos_recursos USING btree (deleted_by)'),
        ('grupos_recursos_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_updated_at_idx ON public.grupos_recursos USING btree (empresa_id, updated_at DESC)'),
        ('grupos_recursos_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX grupos_recursos_empresa_codigo_idx ON public.grupos_recursos USING btree (empresa_id, codigo)'),
        ('grupos_recursos_empresa_codigo_unique_idx',true,false,true,true,'btree','CREATE UNIQUE INDEX grupos_recursos_empresa_codigo_unique_idx ON public.grupos_recursos USING btree (empresa_id, codigo) WHERE (deleted_at IS NULL)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.grupos_recursos'::regclass
    ) as divergentes;

    select count(*) = 0 into v_trig_h
    from (
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,'') as tgattr, t.tgenabled, t.tgnargs, octet_length(t.tgargs) as tgargs_len, t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.grupos_recursos'::regclass and not t.tgisinternal
      except
      select * from (values ('grupos_recursos_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false)) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      union all
      select * from (values ('grupos_recursos_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false)) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      except
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,''), t.tgenabled, t.tgnargs, octet_length(t.tgargs), t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.grupos_recursos'::regclass and not t.tgisinternal
    ) as divergentes;

    select count(*) = 0 into v_trig_o
    from (
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,'') as tgattr, t.tgenabled, t.tgnargs, octet_length(t.tgargs) as tgargs_len, t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.grupos_recursos'::regclass and not t.tgisinternal
      except
      select * from (values
        ('grupos_recursos_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false),
        ('grupos_recursos_bump_capacidade_versao', to_regprocedure('public.trg_bump_capacidade_versao_por_empresa_id()'), 29, '16 5 14', 'O', 0, 0, 0, false)
      ) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      union all
      select * from (values
        ('grupos_recursos_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false),
        ('grupos_recursos_bump_capacidade_versao', to_regprocedure('public.trg_bump_capacidade_versao_por_empresa_id()'), 29, '16 5 14', 'O', 0, 0, 0, false)
      ) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      except
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,''), t.tgenabled, t.tgnargs, octet_length(t.tgargs), t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.grupos_recursos'::regclass and not t.tgisinternal
    ) as divergentes;

    select count(*) = 0 into v_pol_h
    from (
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname='public' and tablename='grupos_recursos'
      except
      select * from (values
        ('Authenticated users can view grupos','PERMISSIVE','SELECT',array['authenticated']::name[],'true',null),
        ('admins excluem grupos recursos','PERMISSIVE','DELETE',array['authenticated']::name[],'usuario_e_admin()',null),
        ('nexotfe grupos recursos select autenticado','PERMISSIVE','SELECT',array['authenticated']::name[],'true',null),
        ('nexotfe grupos recursos update criador ou admin','PERMISSIVE','UPDATE',array['authenticated']::name[],'((created_by = auth.uid()) OR usuario_e_admin())','((created_by = auth.uid()) OR usuario_e_admin())'),
        ('usuarios autenticados criam grupos recursos','PERMISSIVE','INSERT',array['authenticated']::name[],null,'(created_by = auth.uid())'),
        ('usuarios autenticados visualizam grupos recursos','PERMISSIVE','SELECT',array['authenticated']::name[],'true',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('Authenticated users can view grupos','PERMISSIVE','SELECT',array['authenticated']::name[],'true',null),
        ('admins excluem grupos recursos','PERMISSIVE','DELETE',array['authenticated']::name[],'usuario_e_admin()',null),
        ('nexotfe grupos recursos select autenticado','PERMISSIVE','SELECT',array['authenticated']::name[],'true',null),
        ('nexotfe grupos recursos update criador ou admin','PERMISSIVE','UPDATE',array['authenticated']::name[],'((created_by = auth.uid()) OR usuario_e_admin())','((created_by = auth.uid()) OR usuario_e_admin())'),
        ('usuarios autenticados criam grupos recursos','PERMISSIVE','INSERT',array['authenticated']::name[],null,'(created_by = auth.uid())'),
        ('usuarios autenticados visualizam grupos recursos','PERMISSIVE','SELECT',array['authenticated']::name[],'true',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname='public' and tablename='grupos_recursos'
    ) as divergentes;

    select count(*) = 0 into v_pol_o
    from (
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname='public' and tablename='grupos_recursos'
      except
      select * from (values
        ('grupos_recursos_insert_tenant','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((empresa_id = empresa_atual_id()) AND (created_by = auth.uid()))'),
        ('grupos_recursos_select_tenant','PERMISSIVE','SELECT',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND (deleted_at IS NULL))',null),
        ('grupos_recursos_update_tenant','PERMISSIVE','UPDATE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND (deleted_at IS NULL) AND ((created_by = auth.uid()) OR usuario_e_admin()))','((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))'),
        ('nexotfe grupos recursos delete admin mesma empresa','PERMISSIVE','DELETE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND usuario_e_admin())',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('grupos_recursos_insert_tenant','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((empresa_id = empresa_atual_id()) AND (created_by = auth.uid()))'),
        ('grupos_recursos_select_tenant','PERMISSIVE','SELECT',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND (deleted_at IS NULL))',null),
        ('grupos_recursos_update_tenant','PERMISSIVE','UPDATE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND (deleted_at IS NULL) AND ((created_by = auth.uid()) OR usuario_e_admin()))','((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))'),
        ('nexotfe grupos recursos delete admin mesma empresa','PERMISSIVE','DELETE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND usuario_e_admin())',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname='public' and tablename='grupos_recursos'
    ) as divergentes;

    v_estado_h := v_col_h and v_def and v_idgen and v_collation and v_con_h and v_idx_h and v_trig_h and v_pol_h and v_rls and v_owner and v_acl;
    v_estado_o := v_col_o and v_def and v_idgen and v_collation and v_con_o and v_idx_o and v_trig_o and v_pol_o and v_rls and v_owner and v_acl;

    if v_estado_h or v_estado_o then
      null;
    else
      raise exception 'FINGERPRINT DIVERGENTE em public.grupos_recursos: nao corresponde integralmente a ESTADO HISTORICO nem a ESTADO ATUAL (hibrido/parcial/desconhecido). colunas(H=%,O=%) constraints(H=%,O=%) defaults(%) indices(H=%,O=%) triggers(H=%,O=%) policies(H=%,O=%) rls(%) owner(%) acl(%)',
        v_col_h, v_col_o, v_con_h, v_con_o, v_def, v_idx_h, v_idx_o, v_trig_h, v_trig_o, v_pol_h, v_pol_o, v_rls, v_owner, v_acl;
    end if;

  end if;
end $$;

-- =============================================================================
-- 9. public.recursos_produtivos — H: 18 colunas, 6 constraints, 18
--    indices, 1 trigger, 4 policies historicas (sem delete). O: 23
--    colunas (+5), 12 constraints (+5 CHECK, +1 UNIQUE), 19 indices
--    (+id_empresa_uniq), 2 triggers (+bump_capacidade_versao), 4
--    policies atuais (renomeadas, com delete).
-- =============================================================================
do $$
declare
  v_col_h boolean; v_col_o boolean; v_def boolean; v_idgen boolean; v_collation boolean;
  v_con_h boolean; v_con_o boolean; v_idx_h boolean; v_idx_o boolean;
  v_trig_h boolean; v_trig_o boolean;
  v_pol_h boolean; v_pol_o boolean;
  v_rls boolean; v_owner boolean; v_acl boolean;
  v_estado_h boolean; v_estado_o boolean;
begin
  if to_regclass('public.recursos_produtivos') is null then

    create table public.recursos_produtivos (
      id uuid primary key default gen_random_uuid(),
      grupo_id uuid not null references public.grupos_recursos(id) on delete restrict,
      nome text not null,
      fabricante text,
      modelo text,
      setor text,
      capacidade text,
      status text not null default 'disponivel',
      observacoes text,
      ativo boolean not null default true,
      created_at timestamptz not null default now(),
      created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
      codigo text not null,
      empresa_id uuid references public.empresas(id) on delete restrict,
      updated_at timestamptz not null default now(),
      deleted_at timestamptz,
      deleted_by uuid references auth.users(id) on delete set null,
      tecnologia_aplicada_id uuid references public.tecnologias_aplicadas(id) on delete set null
    );

    alter table public.recursos_produtivos enable row level security;
    alter table public.recursos_produtivos owner to postgres;

    create index recursos_produtivos_ativo_idx on public.recursos_produtivos using btree (ativo);
    create unique index recursos_produtivos_codigo_key on public.recursos_produtivos using btree (codigo);
    create index recursos_produtivos_created_by_idx on public.recursos_produtivos using btree (created_by);
    create index recursos_produtivos_deleted_at_idx on public.recursos_produtivos using btree (deleted_at);
    create index recursos_produtivos_deleted_by_idx on public.recursos_produtivos using btree (deleted_by);
    create index recursos_produtivos_empresa_ativo_deleted_at_idx on public.recursos_produtivos using btree (empresa_id, ativo, deleted_at);
    create index recursos_produtivos_empresa_codigo_idx on public.recursos_produtivos using btree (empresa_id, codigo);
    create index recursos_produtivos_empresa_deleted_at_idx on public.recursos_produtivos using btree (empresa_id, deleted_at);
    create index recursos_produtivos_empresa_grupo_idx on public.recursos_produtivos using btree (empresa_id, grupo_id, ativo, deleted_at);
    create index recursos_produtivos_empresa_setor_idx on public.recursos_produtivos using btree (empresa_id, setor, ativo, deleted_at);
    create index recursos_produtivos_empresa_updated_at_idx on public.recursos_produtivos using btree (empresa_id, updated_at desc);
    create index recursos_produtivos_grupo_id_idx on public.recursos_produtivos using btree (grupo_id);
    create index recursos_produtivos_nome_idx on public.recursos_produtivos using btree (nome);
    create index recursos_produtivos_setor_idx on public.recursos_produtivos using btree (setor);
    create index recursos_produtivos_status_idx on public.recursos_produtivos using btree (status);
    create index recursos_produtivos_tecnologia_aplicada_id_idx on public.recursos_produtivos using btree (tecnologia_aplicada_id);
    create index recursos_produtivos_updated_at_idx on public.recursos_produtivos using btree (updated_at desc);

    create trigger recursos_produtivos_set_updated_at
      before update on public.recursos_produtivos
      for each row execute function public.set_updated_at();

    create policy "Authenticated users can insert recursos" on public.recursos_produtivos
      for insert to authenticated with check (auth.uid() = created_by);

    create policy "nexotfe recursos produtivos select autenticado" on public.recursos_produtivos
      for select to authenticated using (true);

    create policy "nexotfe recursos produtivos update criador ou admin" on public.recursos_produtivos
      for update to authenticated
      using (created_by = auth.uid() or public.usuario_e_admin())
      with check (created_by = auth.uid() or public.usuario_e_admin());

    create policy "usuarios autenticados criam recursos produtivos" on public.recursos_produtivos
      for insert to authenticated with check (created_by = auth.uid());

    revoke all on public.recursos_produtivos from public, anon, authenticated, service_role, postgres;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.recursos_produtivos to anon, authenticated, postgres, service_role;

  else

    select count(*) = 0 into v_col_h
    from (
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='recursos_produtivos'
      except
      select * from (values
        ('id','uuid','NO'),('grupo_id','uuid','NO'),('nome','text','NO'),
        ('fabricante','text','YES'),('modelo','text','YES'),('setor','text','YES'),
        ('capacidade','text','YES'),('status','text','NO'),('observacoes','text','YES'),
        ('ativo','boolean','NO'),('created_at','timestamp with time zone','NO'),
        ('created_by','uuid','NO'),('codigo','text','NO'),('empresa_id','uuid','YES'),
        ('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('deleted_by','uuid','YES'),('tecnologia_aplicada_id','uuid','YES')
      ) as e(column_name, data_type, is_nullable)
      union all
      select * from (values
        ('id','uuid','NO'),('grupo_id','uuid','NO'),('nome','text','NO'),
        ('fabricante','text','YES'),('modelo','text','YES'),('setor','text','YES'),
        ('capacidade','text','YES'),('status','text','NO'),('observacoes','text','YES'),
        ('ativo','boolean','NO'),('created_at','timestamp with time zone','NO'),
        ('created_by','uuid','NO'),('codigo','text','NO'),('empresa_id','uuid','YES'),
        ('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('deleted_by','uuid','YES'),('tecnologia_aplicada_id','uuid','YES')
      ) as e(column_name, data_type, is_nullable)
      except
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='recursos_produtivos'
    ) as divergentes;

    select count(*) = 0 into v_col_o
    from (
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='recursos_produtivos'
      except
      select * from (values
        ('id','uuid','NO'),('grupo_id','uuid','NO'),('nome','text','NO'),
        ('fabricante','text','YES'),('modelo','text','YES'),('setor','text','YES'),
        ('capacidade','text','YES'),('status','text','NO'),('observacoes','text','YES'),
        ('ativo','boolean','NO'),('created_at','timestamp with time zone','NO'),
        ('created_by','uuid','NO'),('codigo','text','NO'),('empresa_id','uuid','YES'),
        ('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('deleted_by','uuid','YES'),('tecnologia_aplicada_id','uuid','YES'),
        ('valor_hora','numeric','NO'),('capacidade_horas_dia','numeric','YES'),
        ('carga_horaria_semanal','numeric','YES'),('dias_trabalhados_semana','smallint','YES'),
        ('produtividade','numeric','YES')
      ) as e(column_name, data_type, is_nullable)
      union all
      select * from (values
        ('id','uuid','NO'),('grupo_id','uuid','NO'),('nome','text','NO'),
        ('fabricante','text','YES'),('modelo','text','YES'),('setor','text','YES'),
        ('capacidade','text','YES'),('status','text','NO'),('observacoes','text','YES'),
        ('ativo','boolean','NO'),('created_at','timestamp with time zone','NO'),
        ('created_by','uuid','NO'),('codigo','text','NO'),('empresa_id','uuid','YES'),
        ('updated_at','timestamp with time zone','NO'),('deleted_at','timestamp with time zone','YES'),
        ('deleted_by','uuid','YES'),('tecnologia_aplicada_id','uuid','YES'),
        ('valor_hora','numeric','NO'),('capacidade_horas_dia','numeric','YES'),
        ('carga_horaria_semanal','numeric','YES'),('dias_trabalhados_semana','smallint','YES'),
        ('produtividade','numeric','YES')
      ) as e(column_name, data_type, is_nullable)
      except
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='recursos_produtivos'
    ) as divergentes;

    select count(*) = 0 into v_con_h
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.recursos_produtivos'::regclass
      except
      select * from (values
        ('recursos_produtivos_pkey','p','PRIMARY KEY (id)'),
        ('recursos_produtivos_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT'),
        ('recursos_produtivos_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
        ('recursos_produtivos_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('recursos_produtivos_grupo_id_fkey','f','FOREIGN KEY (grupo_id) REFERENCES grupos_recursos(id) ON DELETE RESTRICT'),
        ('recursos_produtivos_tecnologia_aplicada_id_fkey','f','FOREIGN KEY (tecnologia_aplicada_id) REFERENCES tecnologias_aplicadas(id) ON DELETE SET NULL')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('recursos_produtivos_pkey','p','PRIMARY KEY (id)'),
        ('recursos_produtivos_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT'),
        ('recursos_produtivos_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
        ('recursos_produtivos_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('recursos_produtivos_grupo_id_fkey','f','FOREIGN KEY (grupo_id) REFERENCES grupos_recursos(id) ON DELETE RESTRICT'),
        ('recursos_produtivos_tecnologia_aplicada_id_fkey','f','FOREIGN KEY (tecnologia_aplicada_id) REFERENCES tecnologias_aplicadas(id) ON DELETE SET NULL')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.recursos_produtivos'::regclass
    ) as divergentes;

    select count(*) = 0 into v_con_o
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.recursos_produtivos'::regclass
      except
      select * from (values
        ('recursos_produtivos_pkey','p','PRIMARY KEY (id)'),
        ('recursos_produtivos_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT'),
        ('recursos_produtivos_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
        ('recursos_produtivos_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('recursos_produtivos_grupo_id_fkey','f','FOREIGN KEY (grupo_id) REFERENCES grupos_recursos(id) ON DELETE RESTRICT'),
        ('recursos_produtivos_tecnologia_aplicada_id_fkey','f','FOREIGN KEY (tecnologia_aplicada_id) REFERENCES tecnologias_aplicadas(id) ON DELETE SET NULL'),
        ('recursos_produtivos_capacidade_horas_dia_chk','c','CHECK (((capacidade_horas_dia IS NULL) OR (capacidade_horas_dia >= (0)::numeric)))'),
        ('recursos_produtivos_carga_horaria_semanal_chk','c','CHECK (((carga_horaria_semanal IS NULL) OR (carga_horaria_semanal >= (0)::numeric)))'),
        ('recursos_produtivos_dias_trabalhados_semana_chk','c','CHECK (((dias_trabalhados_semana IS NULL) OR ((dias_trabalhados_semana >= 1) AND (dias_trabalhados_semana <= 7))))'),
        ('recursos_produtivos_produtividade_chk','c','CHECK (((produtividade IS NULL) OR ((produtividade > (0)::numeric) AND (produtividade <= (1)::numeric))))'),
        ('recursos_produtivos_valor_hora_non_negative','c','CHECK ((valor_hora >= (0)::numeric))'),
        ('recursos_produtivos_id_empresa_uniq','u','UNIQUE (id, empresa_id)')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('recursos_produtivos_pkey','p','PRIMARY KEY (id)'),
        ('recursos_produtivos_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT'),
        ('recursos_produtivos_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
        ('recursos_produtivos_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('recursos_produtivos_grupo_id_fkey','f','FOREIGN KEY (grupo_id) REFERENCES grupos_recursos(id) ON DELETE RESTRICT'),
        ('recursos_produtivos_tecnologia_aplicada_id_fkey','f','FOREIGN KEY (tecnologia_aplicada_id) REFERENCES tecnologias_aplicadas(id) ON DELETE SET NULL'),
        ('recursos_produtivos_capacidade_horas_dia_chk','c','CHECK (((capacidade_horas_dia IS NULL) OR (capacidade_horas_dia >= (0)::numeric)))'),
        ('recursos_produtivos_carga_horaria_semanal_chk','c','CHECK (((carga_horaria_semanal IS NULL) OR (carga_horaria_semanal >= (0)::numeric)))'),
        ('recursos_produtivos_dias_trabalhados_semana_chk','c','CHECK (((dias_trabalhados_semana IS NULL) OR ((dias_trabalhados_semana >= 1) AND (dias_trabalhados_semana <= 7))))'),
        ('recursos_produtivos_produtividade_chk','c','CHECK (((produtividade IS NULL) OR ((produtividade > (0)::numeric) AND (produtividade <= (1)::numeric))))'),
        ('recursos_produtivos_valor_hora_non_negative','c','CHECK ((valor_hora >= (0)::numeric))'),
        ('recursos_produtivos_id_empresa_uniq','u','UNIQUE (id, empresa_id)')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.recursos_produtivos'::regclass
    ) as divergentes;

    select count(*) = 0 into v_def
    from (
      select a.attname as coluna, pg_get_expr(ad.adbin, ad.adrelid) as default_real
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.recursos_produtivos'::regclass
         and a.attname = any(array['id','grupo_id','nome','fabricante','modelo','setor','capacidade','status','observacoes','ativo','created_at','created_by','codigo','empresa_id','updated_at','deleted_at','deleted_by','tecnologia_aplicada_id'])
      except
      select * from (values
        ('id','gen_random_uuid()'), ('status','''disponivel''::text'), ('ativo','true'),
        ('created_at','now()'), ('created_by','auth.uid()'), ('updated_at','now()')
      ) as e(coluna, default_esperado)
      union all
      select * from (values
        ('id','gen_random_uuid()'), ('status','''disponivel''::text'), ('ativo','true'),
        ('created_at','now()'), ('created_by','auth.uid()'), ('updated_at','now()')
      ) as e(coluna, default_esperado)
      except
      select a.attname, pg_get_expr(ad.adbin, ad.adrelid)
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.recursos_produtivos'::regclass
         and a.attname = any(array['id','grupo_id','nome','fabricante','modelo','setor','capacidade','status','observacoes','ativo','created_at','created_by','codigo','empresa_id','updated_at','deleted_at','deleted_by','tecnologia_aplicada_id'])
    ) as divergentes;

    v_idgen := not exists (
      select 1 from pg_attribute a
      where a.attrelid = 'public.recursos_produtivos'::regclass and a.attnum > 0 and not a.attisdropped
        and (a.attidentity <> '' or a.attgenerated <> '')
    );

    v_collation := not exists (
      select 1 from pg_attribute a
      left join pg_collation col on col.oid = a.attcollation
      where a.attrelid = 'public.recursos_produtivos'::regclass and a.attnum > 0 and not a.attisdropped
        and coalesce(col.collname, 'default') <> 'default'
    );

    v_rls := (select relrowsecurity from pg_class where oid = 'public.recursos_produtivos'::regclass)
             and not (select relforcerowsecurity from pg_class where oid = 'public.recursos_produtivos'::regclass);

    v_owner := (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.recursos_produtivos'::regclass) = 'postgres';

    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.recursos_produtivos'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.recursos_produtivos: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) = 0 into v_acl
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.recursos_produtivos'::regclass and a.grantee <> 0
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
       where c.oid = 'public.recursos_produtivos'::regclass and a.grantee <> 0
    ) as divergentes;

    select count(*) = 0 into v_idx_h
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.recursos_produtivos'::regclass
      except
      select * from (values
        ('recursos_produtivos_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX recursos_produtivos_pkey ON public.recursos_produtivos USING btree (id)'),
        ('recursos_produtivos_ativo_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_ativo_idx ON public.recursos_produtivos USING btree (ativo)'),
        ('recursos_produtivos_codigo_key',true,false,true,true,'btree','CREATE UNIQUE INDEX recursos_produtivos_codigo_key ON public.recursos_produtivos USING btree (codigo)'),
        ('recursos_produtivos_created_by_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_created_by_idx ON public.recursos_produtivos USING btree (created_by)'),
        ('recursos_produtivos_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_deleted_at_idx ON public.recursos_produtivos USING btree (deleted_at)'),
        ('recursos_produtivos_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_deleted_by_idx ON public.recursos_produtivos USING btree (deleted_by)'),
        ('recursos_produtivos_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_ativo_deleted_at_idx ON public.recursos_produtivos USING btree (empresa_id, ativo, deleted_at)'),
        ('recursos_produtivos_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_codigo_idx ON public.recursos_produtivos USING btree (empresa_id, codigo)'),
        ('recursos_produtivos_empresa_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_deleted_at_idx ON public.recursos_produtivos USING btree (empresa_id, deleted_at)'),
        ('recursos_produtivos_empresa_grupo_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_grupo_idx ON public.recursos_produtivos USING btree (empresa_id, grupo_id, ativo, deleted_at)'),
        ('recursos_produtivos_empresa_setor_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_setor_idx ON public.recursos_produtivos USING btree (empresa_id, setor, ativo, deleted_at)'),
        ('recursos_produtivos_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_updated_at_idx ON public.recursos_produtivos USING btree (empresa_id, updated_at DESC)'),
        ('recursos_produtivos_grupo_id_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_grupo_id_idx ON public.recursos_produtivos USING btree (grupo_id)'),
        ('recursos_produtivos_nome_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_nome_idx ON public.recursos_produtivos USING btree (nome)'),
        ('recursos_produtivos_setor_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_setor_idx ON public.recursos_produtivos USING btree (setor)'),
        ('recursos_produtivos_status_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_status_idx ON public.recursos_produtivos USING btree (status)'),
        ('recursos_produtivos_tecnologia_aplicada_id_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_tecnologia_aplicada_id_idx ON public.recursos_produtivos USING btree (tecnologia_aplicada_id)'),
        ('recursos_produtivos_updated_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_updated_at_idx ON public.recursos_produtivos USING btree (updated_at DESC)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('recursos_produtivos_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX recursos_produtivos_pkey ON public.recursos_produtivos USING btree (id)'),
        ('recursos_produtivos_ativo_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_ativo_idx ON public.recursos_produtivos USING btree (ativo)'),
        ('recursos_produtivos_codigo_key',true,false,true,true,'btree','CREATE UNIQUE INDEX recursos_produtivos_codigo_key ON public.recursos_produtivos USING btree (codigo)'),
        ('recursos_produtivos_created_by_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_created_by_idx ON public.recursos_produtivos USING btree (created_by)'),
        ('recursos_produtivos_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_deleted_at_idx ON public.recursos_produtivos USING btree (deleted_at)'),
        ('recursos_produtivos_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_deleted_by_idx ON public.recursos_produtivos USING btree (deleted_by)'),
        ('recursos_produtivos_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_ativo_deleted_at_idx ON public.recursos_produtivos USING btree (empresa_id, ativo, deleted_at)'),
        ('recursos_produtivos_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_codigo_idx ON public.recursos_produtivos USING btree (empresa_id, codigo)'),
        ('recursos_produtivos_empresa_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_deleted_at_idx ON public.recursos_produtivos USING btree (empresa_id, deleted_at)'),
        ('recursos_produtivos_empresa_grupo_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_grupo_idx ON public.recursos_produtivos USING btree (empresa_id, grupo_id, ativo, deleted_at)'),
        ('recursos_produtivos_empresa_setor_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_setor_idx ON public.recursos_produtivos USING btree (empresa_id, setor, ativo, deleted_at)'),
        ('recursos_produtivos_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_updated_at_idx ON public.recursos_produtivos USING btree (empresa_id, updated_at DESC)'),
        ('recursos_produtivos_grupo_id_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_grupo_id_idx ON public.recursos_produtivos USING btree (grupo_id)'),
        ('recursos_produtivos_nome_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_nome_idx ON public.recursos_produtivos USING btree (nome)'),
        ('recursos_produtivos_setor_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_setor_idx ON public.recursos_produtivos USING btree (setor)'),
        ('recursos_produtivos_status_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_status_idx ON public.recursos_produtivos USING btree (status)'),
        ('recursos_produtivos_tecnologia_aplicada_id_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_tecnologia_aplicada_id_idx ON public.recursos_produtivos USING btree (tecnologia_aplicada_id)'),
        ('recursos_produtivos_updated_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_updated_at_idx ON public.recursos_produtivos USING btree (updated_at DESC)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.recursos_produtivos'::regclass
    ) as divergentes;

    select count(*) = 0 into v_idx_o
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.recursos_produtivos'::regclass
      except
      select * from (values
        ('recursos_produtivos_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX recursos_produtivos_pkey ON public.recursos_produtivos USING btree (id)'),
        ('recursos_produtivos_ativo_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_ativo_idx ON public.recursos_produtivos USING btree (ativo)'),
        ('recursos_produtivos_codigo_key',true,false,true,true,'btree','CREATE UNIQUE INDEX recursos_produtivos_codigo_key ON public.recursos_produtivos USING btree (codigo)'),
        ('recursos_produtivos_created_by_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_created_by_idx ON public.recursos_produtivos USING btree (created_by)'),
        ('recursos_produtivos_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_deleted_at_idx ON public.recursos_produtivos USING btree (deleted_at)'),
        ('recursos_produtivos_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_deleted_by_idx ON public.recursos_produtivos USING btree (deleted_by)'),
        ('recursos_produtivos_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_ativo_deleted_at_idx ON public.recursos_produtivos USING btree (empresa_id, ativo, deleted_at)'),
        ('recursos_produtivos_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_codigo_idx ON public.recursos_produtivos USING btree (empresa_id, codigo)'),
        ('recursos_produtivos_empresa_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_deleted_at_idx ON public.recursos_produtivos USING btree (empresa_id, deleted_at)'),
        ('recursos_produtivos_empresa_grupo_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_grupo_idx ON public.recursos_produtivos USING btree (empresa_id, grupo_id, ativo, deleted_at)'),
        ('recursos_produtivos_empresa_setor_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_setor_idx ON public.recursos_produtivos USING btree (empresa_id, setor, ativo, deleted_at)'),
        ('recursos_produtivos_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_updated_at_idx ON public.recursos_produtivos USING btree (empresa_id, updated_at DESC)'),
        ('recursos_produtivos_grupo_id_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_grupo_id_idx ON public.recursos_produtivos USING btree (grupo_id)'),
        ('recursos_produtivos_nome_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_nome_idx ON public.recursos_produtivos USING btree (nome)'),
        ('recursos_produtivos_setor_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_setor_idx ON public.recursos_produtivos USING btree (setor)'),
        ('recursos_produtivos_status_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_status_idx ON public.recursos_produtivos USING btree (status)'),
        ('recursos_produtivos_tecnologia_aplicada_id_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_tecnologia_aplicada_id_idx ON public.recursos_produtivos USING btree (tecnologia_aplicada_id)'),
        ('recursos_produtivos_updated_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_updated_at_idx ON public.recursos_produtivos USING btree (updated_at DESC)'),
        ('recursos_produtivos_id_empresa_uniq',true,false,true,true,'btree','CREATE UNIQUE INDEX recursos_produtivos_id_empresa_uniq ON public.recursos_produtivos USING btree (id, empresa_id)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('recursos_produtivos_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX recursos_produtivos_pkey ON public.recursos_produtivos USING btree (id)'),
        ('recursos_produtivos_ativo_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_ativo_idx ON public.recursos_produtivos USING btree (ativo)'),
        ('recursos_produtivos_codigo_key',true,false,true,true,'btree','CREATE UNIQUE INDEX recursos_produtivos_codigo_key ON public.recursos_produtivos USING btree (codigo)'),
        ('recursos_produtivos_created_by_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_created_by_idx ON public.recursos_produtivos USING btree (created_by)'),
        ('recursos_produtivos_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_deleted_at_idx ON public.recursos_produtivos USING btree (deleted_at)'),
        ('recursos_produtivos_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_deleted_by_idx ON public.recursos_produtivos USING btree (deleted_by)'),
        ('recursos_produtivos_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_ativo_deleted_at_idx ON public.recursos_produtivos USING btree (empresa_id, ativo, deleted_at)'),
        ('recursos_produtivos_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_codigo_idx ON public.recursos_produtivos USING btree (empresa_id, codigo)'),
        ('recursos_produtivos_empresa_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_deleted_at_idx ON public.recursos_produtivos USING btree (empresa_id, deleted_at)'),
        ('recursos_produtivos_empresa_grupo_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_grupo_idx ON public.recursos_produtivos USING btree (empresa_id, grupo_id, ativo, deleted_at)'),
        ('recursos_produtivos_empresa_setor_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_setor_idx ON public.recursos_produtivos USING btree (empresa_id, setor, ativo, deleted_at)'),
        ('recursos_produtivos_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_empresa_updated_at_idx ON public.recursos_produtivos USING btree (empresa_id, updated_at DESC)'),
        ('recursos_produtivos_grupo_id_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_grupo_id_idx ON public.recursos_produtivos USING btree (grupo_id)'),
        ('recursos_produtivos_nome_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_nome_idx ON public.recursos_produtivos USING btree (nome)'),
        ('recursos_produtivos_setor_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_setor_idx ON public.recursos_produtivos USING btree (setor)'),
        ('recursos_produtivos_status_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_status_idx ON public.recursos_produtivos USING btree (status)'),
        ('recursos_produtivos_tecnologia_aplicada_id_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_tecnologia_aplicada_id_idx ON public.recursos_produtivos USING btree (tecnologia_aplicada_id)'),
        ('recursos_produtivos_updated_at_idx',false,false,true,true,'btree','CREATE INDEX recursos_produtivos_updated_at_idx ON public.recursos_produtivos USING btree (updated_at DESC)'),
        ('recursos_produtivos_id_empresa_uniq',true,false,true,true,'btree','CREATE UNIQUE INDEX recursos_produtivos_id_empresa_uniq ON public.recursos_produtivos USING btree (id, empresa_id)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.recursos_produtivos'::regclass
    ) as divergentes;

    select count(*) = 0 into v_trig_h
    from (
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,'') as tgattr, t.tgenabled, t.tgnargs, octet_length(t.tgargs) as tgargs_len, t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.recursos_produtivos'::regclass and not t.tgisinternal
      except
      select * from (values ('recursos_produtivos_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false)) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      union all
      select * from (values ('recursos_produtivos_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false)) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      except
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,''), t.tgenabled, t.tgnargs, octet_length(t.tgargs), t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.recursos_produtivos'::regclass and not t.tgisinternal
    ) as divergentes;

    select count(*) = 0 into v_trig_o
    from (
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,'') as tgattr, t.tgenabled, t.tgnargs, octet_length(t.tgargs) as tgargs_len, t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.recursos_produtivos'::regclass and not t.tgisinternal
      except
      select * from (values
        ('recursos_produtivos_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false),
        ('recursos_produtivos_bump_capacidade_versao', to_regprocedure('public.trg_bump_capacidade_versao_por_empresa_id()'), 29, '20 23 2 10 16', 'O', 0, 0, 0, false)
      ) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      union all
      select * from (values
        ('recursos_produtivos_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false),
        ('recursos_produtivos_bump_capacidade_versao', to_regprocedure('public.trg_bump_capacidade_versao_por_empresa_id()'), 29, '20 23 2 10 16', 'O', 0, 0, 0, false)
      ) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      except
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,''), t.tgenabled, t.tgnargs, octet_length(t.tgargs), t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.recursos_produtivos'::regclass and not t.tgisinternal
    ) as divergentes;

    select count(*) = 0 into v_pol_h
    from (
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname='public' and tablename='recursos_produtivos'
      except
      select * from (values
        ('Authenticated users can insert recursos','PERMISSIVE','INSERT',array['authenticated']::name[],null,'(auth.uid() = created_by)'),
        ('nexotfe recursos produtivos select autenticado','PERMISSIVE','SELECT',array['authenticated']::name[],'true',null),
        ('nexotfe recursos produtivos update criador ou admin','PERMISSIVE','UPDATE',array['authenticated']::name[],'((created_by = auth.uid()) OR usuario_e_admin())','((created_by = auth.uid()) OR usuario_e_admin())'),
        ('usuarios autenticados criam recursos produtivos','PERMISSIVE','INSERT',array['authenticated']::name[],null,'(created_by = auth.uid())')
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('Authenticated users can insert recursos','PERMISSIVE','INSERT',array['authenticated']::name[],null,'(auth.uid() = created_by)'),
        ('nexotfe recursos produtivos select autenticado','PERMISSIVE','SELECT',array['authenticated']::name[],'true',null),
        ('nexotfe recursos produtivos update criador ou admin','PERMISSIVE','UPDATE',array['authenticated']::name[],'((created_by = auth.uid()) OR usuario_e_admin())','((created_by = auth.uid()) OR usuario_e_admin())'),
        ('usuarios autenticados criam recursos produtivos','PERMISSIVE','INSERT',array['authenticated']::name[],null,'(created_by = auth.uid())')
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname='public' and tablename='recursos_produtivos'
    ) as divergentes;

    select count(*) = 0 into v_pol_o
    from (
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname='public' and tablename='recursos_produtivos'
      except
      select * from (values
        ('nexotfe recursos produtivos delete admin mesma empresa','PERMISSIVE','DELETE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND usuario_e_admin())',null),
        ('nexotfe recursos produtivos insert mesma empresa','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((empresa_id = empresa_atual_id()) AND (created_by = auth.uid()))'),
        ('nexotfe recursos produtivos select mesma empresa','PERMISSIVE','SELECT',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND (deleted_at IS NULL))',null),
        ('nexotfe recursos produtivos update mesma empresa','PERMISSIVE','UPDATE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))','((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))')
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('nexotfe recursos produtivos delete admin mesma empresa','PERMISSIVE','DELETE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND usuario_e_admin())',null),
        ('nexotfe recursos produtivos insert mesma empresa','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((empresa_id = empresa_atual_id()) AND (created_by = auth.uid()))'),
        ('nexotfe recursos produtivos select mesma empresa','PERMISSIVE','SELECT',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND (deleted_at IS NULL))',null),
        ('nexotfe recursos produtivos update mesma empresa','PERMISSIVE','UPDATE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))','((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))')
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname='public' and tablename='recursos_produtivos'
    ) as divergentes;

    v_estado_h := v_col_h and v_def and v_idgen and v_collation and v_con_h and v_idx_h and v_trig_h and v_pol_h and v_rls and v_owner and v_acl;
    v_estado_o := v_col_o and v_def and v_idgen and v_collation and v_con_o and v_idx_o and v_trig_o and v_pol_o and v_rls and v_owner and v_acl;

    if v_estado_h or v_estado_o then
      null;
    else
      raise exception 'FINGERPRINT DIVERGENTE em public.recursos_produtivos: nao corresponde integralmente a ESTADO HISTORICO nem a ESTADO ATUAL (hibrido/parcial/desconhecido). colunas(H=%,O=%) constraints(H=%,O=%) defaults(%) indices(H=%,O=%) triggers(H=%,O=%) policies(H=%,O=%) rls(%) owner(%) acl(%)',
        v_col_h, v_col_o, v_con_h, v_con_o, v_def, v_idx_h, v_idx_o, v_trig_h, v_trig_o, v_pol_h, v_pol_o, v_rls, v_owner, v_acl;
    end if;

  end if;
end $$;

-- =============================================================================
-- 10. public.funcionarios (depende de tecnologias_aplicadas) — merge
--     de 2 eixos independentes: colunas ESTADO A (disponibilidade_atual,
--     historico) / ESTADO B (carga_produtiva, atual) x policies H (4
--     historicas)/O (4 atuais, 3 renomeadas+select/update com filtro
--     deleted_at). Unicos pares aceitos: A+H e B+O. Constraints/indices/
--     triggers/RLS/owner/ACL sao invariantes nos 2 eixos (evidencia
--     dump+r9, nenhuma referencia as colunas/policies diferenciadoras).
-- =============================================================================
do $$
declare
  v_col_a boolean; v_col_b boolean; v_def boolean; v_idgen boolean; v_collation boolean;
  v_con boolean; v_idx boolean; v_trig boolean;
  v_pol_h boolean; v_pol_o boolean;
  v_rls boolean; v_owner boolean; v_acl boolean;
  v_estado_a_h boolean; v_estado_b_o boolean;
begin
  if to_regclass('public.funcionarios') is null then

    create table public.funcionarios (
      id uuid primary key default gen_random_uuid(),
      empresa_id uuid not null references public.empresas(id) on delete restrict,
      codigo integer not null,
      nome text not null,
      apelido text,
      setor text,
      funcao text,
      habilidades text,
      carga_horaria numeric,
      disponibilidade_atual numeric,
      telefone text,
      email text,
      data_admissao date,
      observacoes text,
      ativo boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz,
      created_by uuid not null references auth.users(id),
      deleted_by uuid references auth.users(id),
      tecnologia_aplicada_id uuid references public.tecnologias_aplicadas(id) on delete set null
    );

    alter table public.funcionarios enable row level security;
    alter table public.funcionarios owner to postgres;

    comment on table public.funcionarios is
      'Bootstrap retroativo (bloco Julho) — inclui disponibilidade_atual e carga_horaria (nomes historicos comprovados pelo dump 2026-06-21). O rename carga_horaria->carga_produtiva (202607050003) e a remocao de disponibilidade_atual (nunca versionada) sao tratados pelas migrations reais/reconciliacao, nunca aqui.';

    create unique index funcionarios_empresa_codigo_unique_idx on public.funcionarios using btree (empresa_id, codigo);
    create index funcionarios_empresa_id_idx on public.funcionarios using btree (empresa_id);
    create index funcionarios_codigo_idx on public.funcionarios using btree (codigo);
    create index funcionarios_ativo_idx on public.funcionarios using btree (ativo);
    create index funcionarios_deleted_at_idx on public.funcionarios using btree (deleted_at);
    create index funcionarios_updated_at_idx on public.funcionarios using btree (updated_at desc);
    create index funcionarios_setor_idx on public.funcionarios using btree (setor);
    create index funcionarios_created_by_idx on public.funcionarios using btree (created_by);
    create index funcionarios_deleted_by_idx on public.funcionarios using btree (deleted_by);
    create index funcionarios_empresa_ativo_deleted_at_idx on public.funcionarios using btree (empresa_id, ativo, deleted_at);
    create index funcionarios_empresa_updated_at_idx on public.funcionarios using btree (empresa_id, updated_at desc);
    create index funcionarios_empresa_codigo_idx on public.funcionarios using btree (empresa_id, codigo);
    create index funcionarios_empresa_setor_idx on public.funcionarios using btree (empresa_id, setor);
    create index funcionarios_tecnologia_aplicada_id_idx on public.funcionarios using btree (tecnologia_aplicada_id);

    create trigger funcionarios_set_empresa_id
      before insert on public.funcionarios
      for each row execute function public.set_empresa_id_from_usuario();

    create trigger funcionarios_set_updated_at
      before update on public.funcionarios
      for each row execute function public.set_updated_at();

    create policy "nexotfe funcionarios delete admin mesma empresa" on public.funcionarios
      for delete to authenticated
      using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

    create policy "nexotfe funcionarios insert mesma empresa" on public.funcionarios
      for insert to authenticated
      with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid());

    create policy "nexotfe funcionarios select mesma empresa" on public.funcionarios
      for select to authenticated
      using (empresa_id = public.empresa_atual_id());

    create policy "nexotfe funcionarios update mesma empresa" on public.funcionarios
      for update to authenticated
      using (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()))
      with check (empresa_id = public.empresa_atual_id() and (created_by = auth.uid() or public.usuario_e_admin()));

    revoke all on public.funcionarios from public, anon, authenticated, service_role, postgres;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.funcionarios to anon, authenticated, postgres, service_role;

  else

    -- ESTADO A — historico controlado: 21 colunas, carga_horaria,
    -- disponibilidade_atual numeric nullable.
    select count(*) = 0 into v_col_a
    from (
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='funcionarios'
      except
      select * from (values
        ('id','uuid','NO'),('empresa_id','uuid','NO'),('codigo','integer','NO'),
        ('nome','text','NO'),('apelido','text','YES'),('setor','text','YES'),
        ('funcao','text','YES'),('habilidades','text','YES'),('carga_horaria','numeric','YES'),
        ('disponibilidade_atual','numeric','YES'),('telefone','text','YES'),('email','text','YES'),
        ('data_admissao','date','YES'),('observacoes','text','YES'),('ativo','boolean','NO'),
        ('created_at','timestamp with time zone','NO'),('updated_at','timestamp with time zone','NO'),
        ('deleted_at','timestamp with time zone','YES'),('created_by','uuid','NO'),
        ('deleted_by','uuid','YES'),('tecnologia_aplicada_id','uuid','YES')
      ) as e(column_name, data_type, is_nullable)
      union all
      select * from (values
        ('id','uuid','NO'),('empresa_id','uuid','NO'),('codigo','integer','NO'),
        ('nome','text','NO'),('apelido','text','YES'),('setor','text','YES'),
        ('funcao','text','YES'),('habilidades','text','YES'),('carga_horaria','numeric','YES'),
        ('disponibilidade_atual','numeric','YES'),('telefone','text','YES'),('email','text','YES'),
        ('data_admissao','date','YES'),('observacoes','text','YES'),('ativo','boolean','NO'),
        ('created_at','timestamp with time zone','NO'),('updated_at','timestamp with time zone','NO'),
        ('deleted_at','timestamp with time zone','YES'),('created_by','uuid','NO'),
        ('deleted_by','uuid','YES'),('tecnologia_aplicada_id','uuid','YES')
      ) as e(column_name, data_type, is_nullable)
      except
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='funcionarios'
    ) as divergentes;

    -- ESTADO B — atual controlado: 20 colunas, carga_produtiva, sem
    -- disponibilidade_atual.
    select count(*) = 0 into v_col_b
    from (
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='funcionarios'
      except
      select * from (values
        ('id','uuid','NO'),('empresa_id','uuid','NO'),('codigo','integer','NO'),
        ('nome','text','NO'),('apelido','text','YES'),('setor','text','YES'),
        ('funcao','text','YES'),('habilidades','text','YES'),('carga_produtiva','numeric','YES'),
        ('telefone','text','YES'),('email','text','YES'),('data_admissao','date','YES'),
        ('observacoes','text','YES'),('ativo','boolean','NO'),
        ('created_at','timestamp with time zone','NO'),('updated_at','timestamp with time zone','NO'),
        ('deleted_at','timestamp with time zone','YES'),('created_by','uuid','NO'),
        ('deleted_by','uuid','YES'),('tecnologia_aplicada_id','uuid','YES')
      ) as e(column_name, data_type, is_nullable)
      union all
      select * from (values
        ('id','uuid','NO'),('empresa_id','uuid','NO'),('codigo','integer','NO'),
        ('nome','text','NO'),('apelido','text','YES'),('setor','text','YES'),
        ('funcao','text','YES'),('habilidades','text','YES'),('carga_produtiva','numeric','YES'),
        ('telefone','text','YES'),('email','text','YES'),('data_admissao','date','YES'),
        ('observacoes','text','YES'),('ativo','boolean','NO'),
        ('created_at','timestamp with time zone','NO'),('updated_at','timestamp with time zone','NO'),
        ('deleted_at','timestamp with time zone','YES'),('created_by','uuid','NO'),
        ('deleted_by','uuid','YES'),('tecnologia_aplicada_id','uuid','YES')
      ) as e(column_name, data_type, is_nullable)
      except
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema='public' and table_name='funcionarios'
    ) as divergentes;

    -- Owner/ACL/triggers/constraints/indices sao IDENTICOS nos dois
    -- estados de coluna (so a coluna disponibilidade_atual/carga_horaria/
    -- carga_produtiva difere) e nos dois estados de policy (nenhum
    -- constraint/indice referencia as colunas ou policies
    -- diferenciadoras — evidencia dump+r9).
    select count(*) = 0 into v_def
    from (
      select a.attname as coluna, pg_get_expr(ad.adbin, ad.adrelid) as default_real
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.funcionarios'::regclass
         and a.attname = any(array['id','empresa_id','codigo','nome','apelido','setor','funcao','habilidades','carga_horaria','disponibilidade_atual','carga_produtiva','telefone','email','data_admissao','observacoes','ativo','created_at','updated_at','deleted_at','created_by','deleted_by','tecnologia_aplicada_id'])
      except
      select * from (values ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('updated_at','now()')) as e(coluna, default_esperado)
      union all
      select * from (values ('id','gen_random_uuid()'), ('ativo','true'), ('created_at','now()'), ('updated_at','now()')) as e(coluna, default_esperado)
      except
      select a.attname, pg_get_expr(ad.adbin, ad.adrelid)
        from pg_attrdef ad
        join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = 'public.funcionarios'::regclass
         and a.attname = any(array['id','empresa_id','codigo','nome','apelido','setor','funcao','habilidades','carga_horaria','disponibilidade_atual','carga_produtiva','telefone','email','data_admissao','observacoes','ativo','created_at','updated_at','deleted_at','created_by','deleted_by','tecnologia_aplicada_id'])
    ) as divergentes;

    v_idgen := not exists (
      select 1 from pg_attribute a
      where a.attrelid = 'public.funcionarios'::regclass and a.attnum > 0 and not a.attisdropped
        and (a.attidentity <> '' or a.attgenerated <> '')
    );

    v_collation := not exists (
      select 1 from pg_attribute a
      left join pg_collation col on col.oid = a.attcollation
      where a.attrelid = 'public.funcionarios'::regclass and a.attnum > 0 and not a.attisdropped
        and coalesce(col.collname, 'default') <> 'default'
    );

    v_rls := (select relrowsecurity from pg_class where oid = 'public.funcionarios'::regclass)
             and not (select relforcerowsecurity from pg_class where oid = 'public.funcionarios'::regclass);

    v_owner := (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.funcionarios'::regclass) = 'postgres';

    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.funcionarios'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.funcionarios: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) = 0 into v_acl
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.funcionarios'::regclass and a.grantee <> 0
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
       where c.oid = 'public.funcionarios'::regclass and a.grantee <> 0
    ) as divergentes;

    select count(*) = 0 into v_con
    from (
      select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.funcionarios'::regclass
      except
      select * from (values
        ('funcionarios_pkey','p','PRIMARY KEY (id)'),
        ('funcionarios_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id)'),
        ('funcionarios_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id)'),
        ('funcionarios_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('funcionarios_tecnologia_aplicada_id_fkey','f','FOREIGN KEY (tecnologia_aplicada_id) REFERENCES tecnologias_aplicadas(id) ON DELETE SET NULL')
      ) as e(conname, contype, def)
      union all
      select * from (values
        ('funcionarios_pkey','p','PRIMARY KEY (id)'),
        ('funcionarios_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES auth.users(id)'),
        ('funcionarios_deleted_by_fkey','f','FOREIGN KEY (deleted_by) REFERENCES auth.users(id)'),
        ('funcionarios_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT'),
        ('funcionarios_tecnologia_aplicada_id_fkey','f','FOREIGN KEY (tecnologia_aplicada_id) REFERENCES tecnologias_aplicadas(id) ON DELETE SET NULL')
      ) as e(conname, contype, def)
      except
      select conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.funcionarios'::regclass
    ) as divergentes;

    select count(*) = 0 into v_idx
    from (
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false) as def
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.funcionarios'::regclass
      except
      select * from (values
        ('funcionarios_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX funcionarios_pkey ON public.funcionarios USING btree (id)'),
        ('funcionarios_empresa_codigo_unique_idx',true,false,true,true,'btree','CREATE UNIQUE INDEX funcionarios_empresa_codigo_unique_idx ON public.funcionarios USING btree (empresa_id, codigo)'),
        ('funcionarios_empresa_id_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_empresa_id_idx ON public.funcionarios USING btree (empresa_id)'),
        ('funcionarios_codigo_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_codigo_idx ON public.funcionarios USING btree (codigo)'),
        ('funcionarios_ativo_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_ativo_idx ON public.funcionarios USING btree (ativo)'),
        ('funcionarios_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_deleted_at_idx ON public.funcionarios USING btree (deleted_at)'),
        ('funcionarios_updated_at_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_updated_at_idx ON public.funcionarios USING btree (updated_at DESC)'),
        ('funcionarios_setor_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_setor_idx ON public.funcionarios USING btree (setor)'),
        ('funcionarios_created_by_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_created_by_idx ON public.funcionarios USING btree (created_by)'),
        ('funcionarios_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_deleted_by_idx ON public.funcionarios USING btree (deleted_by)'),
        ('funcionarios_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_empresa_ativo_deleted_at_idx ON public.funcionarios USING btree (empresa_id, ativo, deleted_at)'),
        ('funcionarios_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_empresa_updated_at_idx ON public.funcionarios USING btree (empresa_id, updated_at DESC)'),
        ('funcionarios_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_empresa_codigo_idx ON public.funcionarios USING btree (empresa_id, codigo)'),
        ('funcionarios_empresa_setor_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_empresa_setor_idx ON public.funcionarios USING btree (empresa_id, setor)'),
        ('funcionarios_tecnologia_aplicada_id_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_tecnologia_aplicada_id_idx ON public.funcionarios USING btree (tecnologia_aplicada_id)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      union all
      select * from (values
        ('funcionarios_pkey',true,true,true,true,'btree','CREATE UNIQUE INDEX funcionarios_pkey ON public.funcionarios USING btree (id)'),
        ('funcionarios_empresa_codigo_unique_idx',true,false,true,true,'btree','CREATE UNIQUE INDEX funcionarios_empresa_codigo_unique_idx ON public.funcionarios USING btree (empresa_id, codigo)'),
        ('funcionarios_empresa_id_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_empresa_id_idx ON public.funcionarios USING btree (empresa_id)'),
        ('funcionarios_codigo_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_codigo_idx ON public.funcionarios USING btree (codigo)'),
        ('funcionarios_ativo_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_ativo_idx ON public.funcionarios USING btree (ativo)'),
        ('funcionarios_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_deleted_at_idx ON public.funcionarios USING btree (deleted_at)'),
        ('funcionarios_updated_at_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_updated_at_idx ON public.funcionarios USING btree (updated_at DESC)'),
        ('funcionarios_setor_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_setor_idx ON public.funcionarios USING btree (setor)'),
        ('funcionarios_created_by_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_created_by_idx ON public.funcionarios USING btree (created_by)'),
        ('funcionarios_deleted_by_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_deleted_by_idx ON public.funcionarios USING btree (deleted_by)'),
        ('funcionarios_empresa_ativo_deleted_at_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_empresa_ativo_deleted_at_idx ON public.funcionarios USING btree (empresa_id, ativo, deleted_at)'),
        ('funcionarios_empresa_updated_at_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_empresa_updated_at_idx ON public.funcionarios USING btree (empresa_id, updated_at DESC)'),
        ('funcionarios_empresa_codigo_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_empresa_codigo_idx ON public.funcionarios USING btree (empresa_id, codigo)'),
        ('funcionarios_empresa_setor_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_empresa_setor_idx ON public.funcionarios USING btree (empresa_id, setor)'),
        ('funcionarios_tecnologia_aplicada_id_idx',false,false,true,true,'btree','CREATE INDEX funcionarios_tecnologia_aplicada_id_idx ON public.funcionarios USING btree (tecnologia_aplicada_id)')
      ) as e(relname, indisunique, indisprimary, indisvalid, indisready, amname, def)
      except
      select ic.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready, am.amname, pg_get_indexdef(ix.indexrelid, 0, false)
        from pg_index ix join pg_class ic on ic.oid = ix.indexrelid join pg_am am on am.oid = ic.relam
       where ix.indrelid = 'public.funcionarios'::regclass
    ) as divergentes;

    select count(*) = 0 into v_trig
    from (
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,'') as tgattr, t.tgenabled, t.tgnargs, octet_length(t.tgargs) as tgargs_len, t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.funcionarios'::regclass and not t.tgisinternal
      except
      select * from (values
        ('funcionarios_set_empresa_id', to_regprocedure('public.set_empresa_id_from_usuario()'), 7, '', 'O', 0, 0, 0, false),
        ('funcionarios_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false)
      ) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      union all
      select * from (values
        ('funcionarios_set_empresa_id', to_regprocedure('public.set_empresa_id_from_usuario()'), 7, '', 'O', 0, 0, 0, false),
        ('funcionarios_set_updated_at', to_regprocedure('public.set_updated_at()'), 19, '', 'O', 0, 0, 0, false)
      ) as e(tgname, tgfoid, tgtype, tgattr, tgenabled, tgnargs, tgargs_len, tgconstraint, tgisinternal)
      except
      select t.tgname, t.tgfoid, t.tgtype, coalesce(t.tgattr::text,''), t.tgenabled, t.tgnargs, octet_length(t.tgargs), t.tgconstraint, t.tgisinternal
        from pg_trigger t where t.tgrelid = 'public.funcionarios'::regclass and not t.tgisinternal
    ) as divergentes;

    select count(*) = 0 into v_pol_h
    from (
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname='public' and tablename='funcionarios'
      except
      select * from (values
        ('nexotfe funcionarios delete admin mesma empresa','PERMISSIVE','DELETE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND usuario_e_admin())',null),
        ('nexotfe funcionarios insert mesma empresa','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((empresa_id = empresa_atual_id()) AND (created_by = auth.uid()))'),
        ('nexotfe funcionarios select mesma empresa','PERMISSIVE','SELECT',array['authenticated']::name[],'(empresa_id = empresa_atual_id())',null),
        ('nexotfe funcionarios update mesma empresa','PERMISSIVE','UPDATE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))','((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))')
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('nexotfe funcionarios delete admin mesma empresa','PERMISSIVE','DELETE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND usuario_e_admin())',null),
        ('nexotfe funcionarios insert mesma empresa','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((empresa_id = empresa_atual_id()) AND (created_by = auth.uid()))'),
        ('nexotfe funcionarios select mesma empresa','PERMISSIVE','SELECT',array['authenticated']::name[],'(empresa_id = empresa_atual_id())',null),
        ('nexotfe funcionarios update mesma empresa','PERMISSIVE','UPDATE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))','((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))')
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname='public' and tablename='funcionarios'
    ) as divergentes;

    select count(*) = 0 into v_pol_o
    from (
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x) as roles_ord, qual, with_check
        from pg_policies where schemaname='public' and tablename='funcionarios'
      except
      select * from (values
        ('funcionarios_insert_tenant','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((empresa_id = empresa_atual_id()) AND (created_by = auth.uid()))'),
        ('funcionarios_select_tenant','PERMISSIVE','SELECT',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND (deleted_at IS NULL))',null),
        ('funcionarios_update_tenant','PERMISSIVE','UPDATE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND (deleted_at IS NULL) AND ((created_by = auth.uid()) OR usuario_e_admin()))','((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))'),
        ('nexotfe funcionarios delete admin mesma empresa','PERMISSIVE','DELETE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND usuario_e_admin())',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      union all
      select * from (values
        ('funcionarios_insert_tenant','PERMISSIVE','INSERT',array['authenticated']::name[],null,'((empresa_id = empresa_atual_id()) AND (created_by = auth.uid()))'),
        ('funcionarios_select_tenant','PERMISSIVE','SELECT',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND (deleted_at IS NULL))',null),
        ('funcionarios_update_tenant','PERMISSIVE','UPDATE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND (deleted_at IS NULL) AND ((created_by = auth.uid()) OR usuario_e_admin()))','((empresa_id = empresa_atual_id()) AND ((created_by = auth.uid()) OR usuario_e_admin()))'),
        ('nexotfe funcionarios delete admin mesma empresa','PERMISSIVE','DELETE',array['authenticated']::name[],'((empresa_id = empresa_atual_id()) AND usuario_e_admin())',null)
      ) as e(policyname, permissive, cmd, roles_ord, qual, with_check)
      except
      select policyname, permissive, cmd, (select array_agg(x order by x) from unnest(roles) as x), qual, with_check
        from pg_policies where schemaname='public' and tablename='funcionarios'
    ) as divergentes;

    -- Unicos pares aceitos: ESTADO A (colunas historicas) com policies
    -- H, ou ESTADO B (colunas atuais) com policies O. Qualquer mistura
    -- (A+O, B+H) ou estado parcial/desconhecido em qualquer dimensao
    -- invariante cai no RAISE EXCEPTION abaixo.
    v_estado_a_h := v_col_a and v_def and v_idgen and v_collation and v_con and v_idx and v_trig and v_pol_h and v_rls and v_owner and v_acl;
    v_estado_b_o := v_col_b and v_def and v_idgen and v_collation and v_con and v_idx and v_trig and v_pol_o and v_rls and v_owner and v_acl;

    if v_estado_a_h or v_estado_b_o then
      null;
    else
      raise exception 'FINGERPRINT DIVERGENTE em public.funcionarios: nao corresponde integralmente a (ESTADO A colunas + policies H) nem a (ESTADO B colunas + policies O) — hibrido/parcial/desconhecido. colunas(A=%,B=%) constraints(%) defaults(%) indices(%) triggers(%) policies(H=%,O=%) rls(%) owner(%) acl(%)',
        v_col_a, v_col_b, v_con, v_def, v_idx, v_trig, v_pol_h, v_pol_o, v_rls, v_owner, v_acl;
    end if;

  end if;
end $$;

commit;

-- =============================================================================
-- FIM DO BLOCO JULHO.
-- =============================================================================
