-- FORMALIZACAO RETROATIVA — public.usuario_empresa_atual()
--
-- Este arquivo NAO cria um objeto novo. Formaliza, na cadeia de
-- migrations, um objeto que ja existe em producao real desde antes do
-- inicio do historico versionado (confirmado no dump certificado de
-- 2026-06-21, functions.csv:755; corpo reconfirmado byte a byte contra
-- producao real em 2026-09-23, evidencia r10/S3-1). Nunca foi criado
-- por nenhuma migration ate agora.
--
-- A version 20260913200001 posiciona tecnicamente esta formalizacao na
-- cadeia (imediatamente apos 20260913200000_reconciliacao_paridade_
-- atual.sql, ainda antes de 20260923180000_provisionamento_usuarios_
-- v2.sql) — NAO representa a data original de criacao da funcao, que e
-- desconhecida e certamente anterior a 2026-06-21.
--
-- Producao real ja possui este objeto. Esta migration NAO deve ser
-- executada contra producao via `db push`/`migration up` no processo
-- de regularizacao — a version correspondente devera ser registrada
-- posteriormente via `supabase migration repair 20260913200001
-- --status applied --linked`, sem execucao do SQL abaixo contra o
-- banco real (mesma estrategia ja provada em sandbox descartavel para
-- os 3 candidatos anteriores).
--
-- Padrao fail-closed (identico ao usado pelos candidatos 01/02/03):
-- se a funcao estiver ausente, cria exatamente a definicao certificada
-- abaixo; se ja existir, valida integralmente assinatura, linguagem,
-- corpo, volatilidade, SECURITY DEFINER, search_path, owner e ACL —
-- qualquer divergencia aborta com RAISE EXCEPTION, nunca corrige
-- silenciosamente.
--
-- Sem redesign, sem hardening novo, sem alteracao funcional, sem
-- alteracao de ACL, sem alteracao de owner alem de reproduzir
-- exatamente o estado certificado.
--
-- Fonte normativa do corpo: dump certificado nexotfe_public_20260621_
-- 000436.dump (knowledge/CATALOGO_BANCO_RESTAURADO/functions.csv:755)
-- e confirmacao byte a byte contra producao real via pg_get_functiondef
-- (evidencia r10, consulta S3-1, 2026-09-23).

do $$
declare
  v_existe boolean;
  v_prosrc text;
  v_lang text;
  v_volatile char;
  v_secdef boolean;
  v_search_path text[];
  v_owner text;
  v_identity_args text;
  v_result_type text;
  v_acl text[];
begin
  select true into v_existe
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'usuario_empresa_atual'
     and pg_get_function_identity_arguments(p.oid) = '';

  if v_existe is null then
    -- Ramo ausente: cria exatamente a definicao certificada.
    create function public.usuario_empresa_atual()
    returns table(
      usuario_id uuid,
      empresa_id uuid,
      empresa_codigo integer,
      empresa_nome text,
      empresa_slug text,
      plano text,
      nivel_acesso public.nivel_acesso
    )
    language sql
    stable
    security definer
    set search_path to 'public'
    as $function$
      select
        profiles.id as usuario_id,
        empresas.id as empresa_id,
        empresas.codigo as empresa_codigo,
        empresas.nome as empresa_nome,
        empresas.slug as empresa_slug,
        empresas.plano,
        profiles.nivel_acesso
      from public.profiles
      join public.empresas
        on empresas.id = profiles.empresa_id
      where profiles.id = auth.uid()
        and profiles.ativo = true
        and empresas.ativo = true
    $function$;

    alter function public.usuario_empresa_atual() owner to postgres;

    revoke all on function public.usuario_empresa_atual() from public;
    grant all on function public.usuario_empresa_atual() to public;
    grant all on function public.usuario_empresa_atual() to postgres;
    grant all on function public.usuario_empresa_atual() to anon;
    grant all on function public.usuario_empresa_atual() to authenticated;
    grant all on function public.usuario_empresa_atual() to service_role;

  else
    -- Ramo existente: valida integralmente, nunca corrige.
    select
      pg_get_function_identity_arguments(p.oid),
      pg_get_function_result(p.oid),
      p.prosrc,
      l.lanname,
      p.provolatile,
      p.prosecdef,
      p.proconfig,
      r.rolname
      into
      v_identity_args,
      v_result_type,
      v_prosrc,
      v_lang,
      v_volatile,
      v_secdef,
      v_search_path,
      v_owner
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
      join pg_roles r on r.oid = p.proowner
     where n.nspname = 'public' and p.proname = 'usuario_empresa_atual'
       and pg_get_function_identity_arguments(p.oid) = '';

    if v_identity_args <> '' then
      raise exception 'usuario_empresa_atual: assinatura divergente (esperado sem parametros, obtido "%").', v_identity_args;
    end if;

    if v_result_type <> 'TABLE(usuario_id uuid, empresa_id uuid, empresa_codigo integer, empresa_nome text, empresa_slug text, plano text, nivel_acesso nivel_acesso)' then
      raise exception 'usuario_empresa_atual: tipo de retorno divergente (obtido "%").', v_result_type;
    end if;

    if v_lang <> 'sql' then
      raise exception 'usuario_empresa_atual: linguagem divergente (esperado sql, obtido "%").', v_lang;
    end if;

    if v_volatile <> 's' then
      raise exception 'usuario_empresa_atual: volatilidade divergente (esperado stable/s, obtido "%").', v_volatile;
    end if;

    if not v_secdef then
      raise exception 'usuario_empresa_atual: esperado SECURITY DEFINER, funcao obtida nao e SECURITY DEFINER.';
    end if;

    if v_search_path is distinct from array['search_path=public'] then
      raise exception 'usuario_empresa_atual: search_path divergente (obtido "%").', v_search_path;
    end if;

    if v_owner <> 'postgres' then
      raise exception 'usuario_empresa_atual: owner divergente (esperado postgres, obtido "%").', v_owner;
    end if;

    if regexp_replace(v_prosrc, '\s+', ' ', 'g') <> regexp_replace(
      $normcheck$
      select
        profiles.id as usuario_id,
        empresas.id as empresa_id,
        empresas.codigo as empresa_codigo,
        empresas.nome as empresa_nome,
        empresas.slug as empresa_slug,
        empresas.plano,
        profiles.nivel_acesso
      from public.profiles
      join public.empresas
        on empresas.id = profiles.empresa_id
      where profiles.id = auth.uid()
        and profiles.ativo = true
        and empresas.ativo = true
      $normcheck$,
      '\s+', ' ', 'g'
    ) then
      raise exception 'usuario_empresa_atual: corpo da funcao divergente do certificado.';
    end if;

    select array_agg(
             (case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end)
             || ':' || a.privilege_type
             order by 1
           )
      into v_acl
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where n.nspname = 'public' and p.proname = 'usuario_empresa_atual'
       and pg_get_function_identity_arguments(p.oid) = '';

    if v_acl is distinct from array[
      'PUBLIC:EXECUTE',
      'anon:EXECUTE',
      'authenticated:EXECUTE',
      'postgres:EXECUTE',
      'service_role:EXECUTE'
    ] then
      raise exception 'usuario_empresa_atual: ACL divergente (obtido "%").', v_acl;
    end if;

  end if;
end;
$$;
