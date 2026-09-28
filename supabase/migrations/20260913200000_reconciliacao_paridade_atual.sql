-- =============================================================================
-- RASCUNHO CANDIDATO — NAO E UMA MIGRATION REAL. NAO APLICAR.
-- Vive fora de supabase/migrations/ ate a versao/timestamp final ser
-- escolhida — ainda nao autorizada para escrita em supabase/migrations/
-- nesta etapa.
--
-- RECONCILIACAO ATUAL — PARIDADE FINAL
-- Posicao logica futura: depois da ultima migration real hoje existente
-- (20260913194332) e depois dos dois bootstraps retroativos.
--
-- REVISAO 2 — correcoes desta rodada:
--   a) ACL das 4 views deixa de ser reaplicada incondicionalmente —
--      passa a viver so no ramo de criacao; ramo "ja existe" agora
--      valida owner + definicao completa (pg_get_viewdef) + reloptions
--      exatos (security_invoker=true e nada mais) + ACL, nunca corrige
--      com CREATE OR REPLACE.
--   b) varredura de dependencias de disponibilidade_atual deixa de se
--      limitar a funcoes de TRIGGER anexadas a funcionarios — passa a
--      varrer toda public.pg_proc (qualquer funcao/RPC, trigger ou nao)
--      por referencia textual a disponibilidade_atual no corpo.
--   c) EXECUTE dinamico da contagem de disponibilidade_atual substituido
--      por SELECT ... INTO estatico — o trecho so e alcancado depois de
--      confirmado que a coluna existe (RETURN antecipado no Cenario A),
--      entao nao ha risco de erro de parsing por coluna ausente.
--
-- Escopo, deliberadamente limitado (SEM HARDENING, SEM regra de negocio
-- nova, SEM alteracao oportunista):
--   1. Criar as 4 views de paridade que existem no remoto real mas nunca
--      foram criadas por nenhuma migration:
--        - tecnologias_aplicadas_ativas
--        - grupos_recursos_ativos
--        - recursos_produtivos_ativos
--        - itens_industriais_ativos
--   2. Tratamento fail-closed de public.funcionarios.disponibilidade_atual
--      (existia no dump certificado de 2026-06-21; ausente do remoto
--      atual; nenhuma migration real jamais a remove).
--
-- Fonte normativa das 4 definicoes de view: pg_get_viewdef(oid, true)
-- capturado ao vivo, texto reproduzido aqui sem alteracao (incluindo
-- espacamento/indentacao exatos, que sao a saida literal dessa funcao,
-- nao uma formatacao escolhida por quem escreveu este arquivo).
-- =============================================================================

begin;

-- =============================================================================
-- 1. public.tecnologias_aplicadas_ativas
-- =============================================================================
do $$
declare
  v_def text;
  v_esperado text := ' SELECT id,
    empresa_id,
    codigo,
    nome,
    tipo,
    valor_hora,
    descricao,
    ativo,
    created_at,
    updated_at,
    deleted_at,
    deleted_by,
    created_by
   FROM tecnologias_aplicadas
  WHERE ((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL));';
  v_diff int;
begin
  if to_regclass('public.tecnologias_aplicadas_ativas') is null then

    create view public.tecnologias_aplicadas_ativas
      with (security_invoker = true)
    as
    select id,
        empresa_id,
        codigo,
        nome,
        tipo,
        valor_hora,
        descricao,
        ativo,
        created_at,
        updated_at,
        deleted_at,
        deleted_by,
        created_by
       from tecnologias_aplicadas
      where empresa_id = empresa_atual_id() and ativo = true and deleted_at is null;

    alter view public.tecnologias_aplicadas_ativas owner to postgres;

    revoke all on public.tecnologias_aplicadas_ativas from public, anon, authenticated, service_role, postgres;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.tecnologias_aplicadas_ativas to anon, authenticated, postgres, service_role;

  else

    if (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.tecnologias_aplicadas_ativas'::regclass) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas_ativas: owner diferente de postgres';
    end if;

    if (select reloptions from pg_class where oid = 'public.tecnologias_aplicadas_ativas'::regclass) is distinct from array['security_invoker=true'] then
      raise exception 'FINGERPRINT DIVERGENTE: public.tecnologias_aplicadas_ativas com reloptions diferente de exatamente {security_invoker=true}';
    end if;

    select pg_get_viewdef('public.tecnologias_aplicadas_ativas'::regclass, true) into v_def;
    if v_def <> v_esperado then
      raise exception 'FINGERPRINT DIVERGENTE: definicao real de public.tecnologias_aplicadas_ativas diverge da aprovada. Real: %', v_def;
    end if;

    -- Fingerprint explicito de colunas (posicao/nome/tipo/udt_name/
    -- is_nullable/collation_name), evidencia r8 — complementa (nao
    -- substitui) a comparacao de pg_get_viewdef. Collation comparada
    -- via coalesce (NULL = tipo nao colacionavel, 'default' = collation
    -- padrao explicita — evidencia r8 confirmou so esses 2 valores).
    select count(*) into v_diff
    from (
      values
        (1,'id','uuid','uuid',null), (2,'empresa_id','uuid','uuid',null), (3,'codigo','text','text','default'),
        (4,'nome','text','text','default'), (5,'tipo','text','text','default'), (6,'valor_hora','numeric','numeric',null),
        (7,'descricao','text','text','default'), (8,'ativo','boolean','bool',null),
        (9,'created_at','timestamp with time zone','timestamptz',null), (10,'updated_at','timestamp with time zone','timestamptz',null),
        (11,'deleted_at','timestamp with time zone','timestamptz',null), (12,'deleted_by','uuid','uuid',null), (13,'created_by','uuid','uuid',null)
    ) as esperado(posicao, coluna, tipo, udt, collation_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'tecnologias_aplicadas_ativas'
        and c.ordinal_position = esperado.posicao and c.column_name = esperado.coluna
        and c.data_type = esperado.tipo and c.udt_name = esperado.udt
        and c.is_nullable = 'YES'
        and coalesce(c.collation_name,'sem_collation') = coalesce(esperado.collation_name,'sem_collation')
    );
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas_ativas: % coluna(s) com posicao/nome/tipo/udt_name/is_nullable/collation_name divergente do certificado r8', v_diff;
    end if;

    if (select count(*) from information_schema.columns where table_schema='public' and table_name='tecnologias_aplicadas_ativas') <> 13 then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas_ativas: numero de colunas diferente de 13';
    end if;

    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.tecnologias_aplicadas_ativas'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas_ativas: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.tecnologias_aplicadas_ativas'::regclass and a.grantee <> 0
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
       where c.oid = 'public.tecnologias_aplicadas_ativas'::regclass and a.grantee <> 0
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.tecnologias_aplicadas_ativas: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;

  end if;
end $$;

-- =============================================================================
-- 2. public.grupos_recursos_ativos
-- =============================================================================
do $$
declare
  v_def text;
  v_esperado text := ' SELECT id,
    empresa_id,
    codigo,
    nome,
    descricao,
    setor,
    capacidade_total,
    disponibilidade_atual,
    unidade_capacidade,
    ativo,
    created_at,
    updated_at,
    deleted_at,
    deleted_by,
    created_by
   FROM grupos_recursos
  WHERE ((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL));';
  v_diff int;
begin
  if to_regclass('public.grupos_recursos_ativos') is null then

    create view public.grupos_recursos_ativos
      with (security_invoker = true)
    as
    select id,
        empresa_id,
        codigo,
        nome,
        descricao,
        setor,
        capacidade_total,
        disponibilidade_atual,
        unidade_capacidade,
        ativo,
        created_at,
        updated_at,
        deleted_at,
        deleted_by,
        created_by
       from grupos_recursos
      where empresa_id = empresa_atual_id() and ativo = true and deleted_at is null;

    alter view public.grupos_recursos_ativos owner to postgres;

    revoke all on public.grupos_recursos_ativos from public, anon, authenticated, service_role, postgres;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.grupos_recursos_ativos to anon, authenticated, postgres, service_role;

  else

    if (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.grupos_recursos_ativos'::regclass) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.grupos_recursos_ativos: owner diferente de postgres';
    end if;

    if (select reloptions from pg_class where oid = 'public.grupos_recursos_ativos'::regclass) is distinct from array['security_invoker=true'] then
      raise exception 'FINGERPRINT DIVERGENTE: public.grupos_recursos_ativos com reloptions diferente de exatamente {security_invoker=true}';
    end if;

    select pg_get_viewdef('public.grupos_recursos_ativos'::regclass, true) into v_def;
    if v_def <> v_esperado then
      raise exception 'FINGERPRINT DIVERGENTE: definicao real de public.grupos_recursos_ativos diverge da aprovada. Real: %', v_def;
    end if;

    select count(*) into v_diff
    from (
      values
        (1,'id','uuid','uuid',null), (2,'empresa_id','uuid','uuid',null), (3,'codigo','text','text','default'), (4,'nome','text','text','default'),
        (5,'descricao','text','text','default'), (6,'setor','text','text','default'), (7,'capacidade_total','numeric','numeric',null),
        (8,'disponibilidade_atual','numeric','numeric',null), (9,'unidade_capacidade','text','text','default'), (10,'ativo','boolean','bool',null),
        (11,'created_at','timestamp with time zone','timestamptz',null), (12,'updated_at','timestamp with time zone','timestamptz',null),
        (13,'deleted_at','timestamp with time zone','timestamptz',null), (14,'deleted_by','uuid','uuid',null), (15,'created_by','uuid','uuid',null)
    ) as esperado(posicao, coluna, tipo, udt, collation_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'grupos_recursos_ativos'
        and c.ordinal_position = esperado.posicao and c.column_name = esperado.coluna
        and c.data_type = esperado.tipo and c.udt_name = esperado.udt
        and c.is_nullable = 'YES'
        and coalesce(c.collation_name,'sem_collation') = coalesce(esperado.collation_name,'sem_collation')
    );
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.grupos_recursos_ativos: % coluna(s) com posicao/nome/tipo/udt_name/is_nullable/collation_name divergente do certificado r8', v_diff;
    end if;

    if (select count(*) from information_schema.columns where table_schema='public' and table_name='grupos_recursos_ativos') <> 15 then
      raise exception 'FINGERPRINT DIVERGENTE em public.grupos_recursos_ativos: numero de colunas diferente de 15';
    end if;

    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.grupos_recursos_ativos'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.grupos_recursos_ativos: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.grupos_recursos_ativos'::regclass and a.grantee <> 0
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
       where c.oid = 'public.grupos_recursos_ativos'::regclass and a.grantee <> 0
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.grupos_recursos_ativos: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;

  end if;
end $$;

-- =============================================================================
-- 3. public.recursos_produtivos_ativos
-- =============================================================================
do $$
declare
  v_def text;
  v_esperado text := ' SELECT id,
    empresa_id,
    codigo,
    grupo_id,
    tecnologia_aplicada_id,
    nome,
    fabricante,
    modelo,
    setor,
    capacidade,
    status,
    observacoes,
    ativo,
    created_at,
    updated_at,
    deleted_at,
    deleted_by,
    created_by
   FROM recursos_produtivos
  WHERE ((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL));';
  v_diff int;
begin
  if to_regclass('public.recursos_produtivos_ativos') is null then

    create view public.recursos_produtivos_ativos
      with (security_invoker = true)
    as
    select id,
        empresa_id,
        codigo,
        grupo_id,
        tecnologia_aplicada_id,
        nome,
        fabricante,
        modelo,
        setor,
        capacidade,
        status,
        observacoes,
        ativo,
        created_at,
        updated_at,
        deleted_at,
        deleted_by,
        created_by
       from recursos_produtivos
      where empresa_id = empresa_atual_id() and ativo = true and deleted_at is null;

    alter view public.recursos_produtivos_ativos owner to postgres;

    revoke all on public.recursos_produtivos_ativos from public, anon, authenticated, service_role, postgres;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.recursos_produtivos_ativos to anon, authenticated, postgres, service_role;

  else

    if (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.recursos_produtivos_ativos'::regclass) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.recursos_produtivos_ativos: owner diferente de postgres';
    end if;

    if (select reloptions from pg_class where oid = 'public.recursos_produtivos_ativos'::regclass) is distinct from array['security_invoker=true'] then
      raise exception 'FINGERPRINT DIVERGENTE: public.recursos_produtivos_ativos com reloptions diferente de exatamente {security_invoker=true}';
    end if;

    select pg_get_viewdef('public.recursos_produtivos_ativos'::regclass, true) into v_def;
    if v_def <> v_esperado then
      raise exception 'FINGERPRINT DIVERGENTE: definicao real de public.recursos_produtivos_ativos diverge da aprovada. Real: %', v_def;
    end if;

    select count(*) into v_diff
    from (
      values
        (1,'id','uuid','uuid',null), (2,'empresa_id','uuid','uuid',null), (3,'codigo','text','text','default'), (4,'grupo_id','uuid','uuid',null),
        (5,'tecnologia_aplicada_id','uuid','uuid',null), (6,'nome','text','text','default'), (7,'fabricante','text','text','default'), (8,'modelo','text','text','default'),
        (9,'setor','text','text','default'), (10,'capacidade','text','text','default'), (11,'status','text','text','default'), (12,'observacoes','text','text','default'),
        (13,'ativo','boolean','bool',null), (14,'created_at','timestamp with time zone','timestamptz',null), (15,'updated_at','timestamp with time zone','timestamptz',null),
        (16,'deleted_at','timestamp with time zone','timestamptz',null), (17,'deleted_by','uuid','uuid',null), (18,'created_by','uuid','uuid',null)
    ) as esperado(posicao, coluna, tipo, udt, collation_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'recursos_produtivos_ativos'
        and c.ordinal_position = esperado.posicao and c.column_name = esperado.coluna
        and c.data_type = esperado.tipo and c.udt_name = esperado.udt
        and c.is_nullable = 'YES'
        and coalesce(c.collation_name,'sem_collation') = coalesce(esperado.collation_name,'sem_collation')
    );
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.recursos_produtivos_ativos: % coluna(s) com posicao/nome/tipo/udt_name/is_nullable/collation_name divergente do certificado r8', v_diff;
    end if;

    if (select count(*) from information_schema.columns where table_schema='public' and table_name='recursos_produtivos_ativos') <> 18 then
      raise exception 'FINGERPRINT DIVERGENTE em public.recursos_produtivos_ativos: numero de colunas diferente de 18';
    end if;

    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.recursos_produtivos_ativos'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.recursos_produtivos_ativos: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.recursos_produtivos_ativos'::regclass and a.grantee <> 0
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
       where c.oid = 'public.recursos_produtivos_ativos'::regclass and a.grantee <> 0
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.recursos_produtivos_ativos: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;

  end if;
end $$;

-- =============================================================================
-- 4. public.itens_industriais_ativos
-- =============================================================================
do $$
declare
  v_def text;
  v_esperado text := ' SELECT id,
    empresa_id,
    codigo,
    descricao,
    unidade,
    tipo_item,
    codigo_ean_gtin,
    codigo_ncm,
    familia,
    classificacao,
    valor_referencia,
    recomendacao_fiscal,
    observacoes,
    pdf_tecnico_path,
    pdf_tecnico_nome,
    referencia_arquivo_externo,
    caminho_engenharia,
    revisao_desenho,
    ativo,
    created_at,
    updated_at,
    deleted_at,
    deleted_by,
    created_by
   FROM itens_industriais
  WHERE ((empresa_id = empresa_atual_id()) AND (ativo = true) AND (deleted_at IS NULL));';
  v_diff int;
begin
  if to_regclass('public.itens_industriais_ativos') is null then

    create view public.itens_industriais_ativos
      with (security_invoker = true)
    as
    select id,
        empresa_id,
        codigo,
        descricao,
        unidade,
        tipo_item,
        codigo_ean_gtin,
        codigo_ncm,
        familia,
        classificacao,
        valor_referencia,
        recomendacao_fiscal,
        observacoes,
        pdf_tecnico_path,
        pdf_tecnico_nome,
        referencia_arquivo_externo,
        caminho_engenharia,
        revisao_desenho,
        ativo,
        created_at,
        updated_at,
        deleted_at,
        deleted_by,
        created_by
       from itens_industriais
      where empresa_id = empresa_atual_id() and ativo = true and deleted_at is null;

    alter view public.itens_industriais_ativos owner to postgres;

    revoke all on public.itens_industriais_ativos from public, anon, authenticated, service_role, postgres;
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.itens_industriais_ativos to anon, authenticated, postgres, service_role;

  else

    if (select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.itens_industriais_ativos'::regclass) <> 'postgres' then
      raise exception 'FINGERPRINT DIVERGENTE em public.itens_industriais_ativos: owner diferente de postgres';
    end if;

    if (select reloptions from pg_class where oid = 'public.itens_industriais_ativos'::regclass) is distinct from array['security_invoker=true'] then
      raise exception 'FINGERPRINT DIVERGENTE: public.itens_industriais_ativos com reloptions diferente de exatamente {security_invoker=true}';
    end if;

    -- NOTA: esta view pode nao existir ainda quando a coluna base
    -- unidade_id (202608...) ja tiver sido adicionada por
    -- 20260825170000 sem que a view a exponha — isso e aceitavel, pois
    -- a view expoe exatamente o conjunto de colunas comprovado ao vivo
    -- (que ja reflete o estado real do remoto hoje).
    select pg_get_viewdef('public.itens_industriais_ativos'::regclass, true) into v_def;
    if v_def <> v_esperado then
      raise exception 'FINGERPRINT DIVERGENTE: definicao real de public.itens_industriais_ativos diverge da aprovada. Real: %', v_def;
    end if;

    select count(*) into v_diff
    from (
      values
        (1,'id','uuid','uuid',null), (2,'empresa_id','uuid','uuid',null), (3,'codigo','text','text','default'), (4,'descricao','text','text','default'),
        (5,'unidade','text','text','default'), (6,'tipo_item','text','text','default'), (7,'codigo_ean_gtin','text','text','default'), (8,'codigo_ncm','text','text','default'),
        (9,'familia','text','text','default'), (10,'classificacao','text','text','default'), (11,'valor_referencia','numeric','numeric',null),
        (12,'recomendacao_fiscal','text','text','default'), (13,'observacoes','text','text','default'), (14,'pdf_tecnico_path','text','text','default'),
        (15,'pdf_tecnico_nome','text','text','default'), (16,'referencia_arquivo_externo','text','text','default'), (17,'caminho_engenharia','text','text','default'),
        (18,'revisao_desenho','text','text','default'), (19,'ativo','boolean','bool',null), (20,'created_at','timestamp with time zone','timestamptz',null),
        (21,'updated_at','timestamp with time zone','timestamptz',null), (22,'deleted_at','timestamp with time zone','timestamptz',null),
        (23,'deleted_by','uuid','uuid',null), (24,'created_by','uuid','uuid',null)
    ) as esperado(posicao, coluna, tipo, udt, collation_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'itens_industriais_ativos'
        and c.ordinal_position = esperado.posicao and c.column_name = esperado.coluna
        and c.data_type = esperado.tipo and c.udt_name = esperado.udt
        and c.is_nullable = 'YES'
        and coalesce(c.collation_name,'sem_collation') = coalesce(esperado.collation_name,'sem_collation')
    );
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.itens_industriais_ativos: % coluna(s) com posicao/nome/tipo/udt_name/is_nullable/collation_name divergente do certificado r8', v_diff;
    end if;

    if (select count(*) from information_schema.columns where table_schema='public' and table_name='itens_industriais_ativos') <> 24 then
      raise exception 'FINGERPRINT DIVERGENTE em public.itens_industriais_ativos: numero de colunas diferente de 24';
    end if;

    if exists (
      select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid = 'public.itens_industriais_ativos'::regclass and (a.grantee = 0 or a.is_grantable)
    ) then
      raise exception 'FINGERPRINT DIVERGENTE em public.itens_industriais_ativos: PUBLIC com privilegio ou GRANT OPTION encontrado, esperado nenhum';
    end if;

    select count(*) into v_diff
    from (
      select a.grantee::regrole::text as papel, a.privilege_type as privilegio
        from pg_class c cross join lateral aclexplode(c.relacl) a
       where c.oid = 'public.itens_industriais_ativos'::regclass and a.grantee <> 0
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
       where c.oid = 'public.itens_industriais_ativos'::regclass and a.grantee <> 0
    ) as divergentes;
    if v_diff > 0 then
      raise exception 'FINGERPRINT DIVERGENTE em public.itens_industriais_ativos: ACL diverge da aprovada (% diferenca(s))', v_diff;
    end if;

  end if;
end $$;

-- =============================================================================
-- 5. funcionarios.disponibilidade_atual — tratamento fail-closed
--
--    CENARIO A (remoto atual): coluna ja ausente -> so validar, nao
--    fazer nada.
--    CENARIO B (banco reconstruido pelos bootstraps): coluna presente
--    (criada pelo arquivo 02, ESTADO A historico) -> checar TODAS as
--    dependencias possiveis e a regra objetiva de dados antes de
--    remover. Qualquer divergencia aborta a transacao inteira.
-- =============================================================================
do $$
declare
  v_qtd_nao_nulos bigint;
  v_dependentes int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'funcionarios' and column_name = 'disponibilidade_atual'
  ) then
    -- Cenario A: nada a fazer, estado ja e o esperado.
    return;
  end if;

  -- Cenario B: checagens de dependencia, na ordem exigida.

  -- views (pg_depend, dependencia de objeto)
  select count(*) into v_dependentes
    from pg_depend d
    join pg_rewrite r on r.oid = d.objid
    join pg_class dependent on dependent.oid = r.ev_class
    join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
   where d.refobjid = 'public.funcionarios'::regclass
     and a.attname = 'disponibilidade_atual';
  if v_dependentes > 0 then
    raise exception 'ABORTADO: % view(s) dependem de funcionarios.disponibilidade_atual (pg_depend) — remocao nao e segura', v_dependentes;
  end if;

  -- policies (texto de qual/with_check)
  select count(*) into v_dependentes
    from pg_policies
   where schemaname = 'public' and tablename = 'funcionarios'
     and (qual ilike '%disponibilidade_atual%' or with_check ilike '%disponibilidade_atual%');
  if v_dependentes > 0 then
    raise exception 'ABORTADO: % policy(ies) de funcionarios referenciam disponibilidade_atual — remocao nao e segura', v_dependentes;
  end if;

  -- triggers (corpo da funcao associada a triggers de funcionarios)
  select count(*) into v_dependentes
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'public.funcionarios'::regclass
     and not t.tgisinternal
     and pg_get_functiondef(p.oid) ilike '%disponibilidade_atual%';
  if v_dependentes > 0 then
    raise exception 'ABORTADO: % trigger(s) de funcionarios referenciam disponibilidade_atual no corpo da funcao — remocao nao e segura', v_dependentes;
  end if;

  -- funcoes/RPCs em geral, em TODO o schema public — nao limitado a
  -- funcoes de trigger anexadas a funcionarios. Cobre qualquer RPC que
  -- eventualmente mencione a coluna, mesmo sem ser trigger.
  select count(*) into v_dependentes
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and pg_get_functiondef(p.oid) ilike '%disponibilidade_atual%';
  if v_dependentes > 0 then
    raise exception 'ABORTADO: % funcao(oes)/RPC(s) em public referenciam disponibilidade_atual — remocao nao e segura', v_dependentes;
  end if;

  -- indices
  select count(*) into v_dependentes
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
   where i.indrelid = 'public.funcionarios'::regclass
     and a.attname = 'disponibilidade_atual';
  if v_dependentes > 0 then
    raise exception 'ABORTADO: % indice(s) sobre disponibilidade_atual — remocao nao e segura', v_dependentes;
  end if;

  -- constraints (CHECK/UNIQUE/etc que mencionem a coluna)
  select count(*) into v_dependentes
    from pg_constraint
   where conrelid = 'public.funcionarios'::regclass
     and pg_get_constraintdef(oid) ilike '%disponibilidade_atual%';
  if v_dependentes > 0 then
    raise exception 'ABORTADO: % constraint(s) referenciam disponibilidade_atual — remocao nao e segura', v_dependentes;
  end if;

  -- generated columns dependentes (so podem existir na propria tabela)
  select count(*) into v_dependentes
    from pg_attrdef ad
    join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
   where ad.adrelid = 'public.funcionarios'::regclass
     and a.attgenerated <> ''
     and pg_get_expr(ad.adbin, ad.adrelid) ilike '%disponibilidade_atual%';
  if v_dependentes > 0 then
    raise exception 'ABORTADO: % coluna(s) GENERATED dependem de disponibilidade_atual — remocao nao e segura', v_dependentes;
  end if;

  -- regra objetiva de dados: nenhum valor nao-nulo pode existir. SQL
  -- estatico (nao dinamico) — este ponto so e alcancado depois de
  -- confirmado, acima, que a coluna existe (Cenario A ja retornou).
  select count(*) into v_qtd_nao_nulos
    from public.funcionarios
   where disponibilidade_atual is not null;

  if v_qtd_nao_nulos <> 0 then
    raise exception 'ABORTADO: % linha(s) com disponibilidade_atual preenchido — dado real existente, remocao exige decisao de negocio explicita antes de prosseguir', v_qtd_nao_nulos;
  end if;

  -- Todas as checagens passaram: remocao segura.
  alter table public.funcionarios drop column disponibilidade_atual;

end $$;

commit;

-- =============================================================================
-- FIM DA RECONCILIACAO ATUAL.
--
-- NAO INCLUIDO NESTE ARQUIVO (fora de escopo, exige auditoria/autorizacao
-- propria, nunca misturado aqui):
--   - hardening de ACL (ex.: fechar o CRUD amplo de anon/authenticated
--     hoje existente nos 25 objetos fundacionais);
--   - qualquer mudanca de regra de negocio;
--   - qualquer melhoria oportunista encontrada durante a investigacao.
-- =============================================================================
