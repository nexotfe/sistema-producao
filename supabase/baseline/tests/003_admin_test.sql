-- Testes estruturais e comportamentais do módulo 003_admin.sql.

begin;

do $structure$
declare
  v_expected_tables text[] := array[
    'configuracoes_empresa', 'numeracao_configuracoes',
    'grupos_tecnologias', 'tecnologias',
    'grupos_recursos', 'recursos_produtivos', 'colaboradores',
    'colaborador_tecnologias', 'recurso_tecnologias'
  ];
  v_table text;
  v_count integer;
begin
  foreach v_table in array v_expected_tables loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'Tabela public.% ausente', v_table;
    end if;

    if not exists (
      select 1 from pg_class
       where oid = to_regclass('public.' || v_table)
         and relrowsecurity = true
    ) then
      raise exception 'RLS não habilitada em public.%', v_table;
    end if;
  end loop;

  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and tablename = any (v_expected_tables);

  if v_count <> 27 then
    raise exception 'Esperadas 27 policies administrativas; encontradas %', v_count;
  end if;

  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'gerar_numero_entidade'
       and p.prosecdef = true
       and exists (
         select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
          where cfg like 'search_path=%'
       )
  ) then
    raise exception 'gerar_numero_entidade sem SECURITY DEFINER/search_path seguro';
  end if;
end
$structure$;

insert into auth.users (id, email) values
  ('11000000-0000-0000-0000-000000000001', 'comum-a@nexotfe.test'),
  ('11000000-0000-0000-0000-000000000002', 'gestor-a@nexotfe.test'),
  ('11000000-0000-0000-0000-000000000003', 'gestor-b@nexotfe.test');

insert into public.empresas (id, nome, slug) values
  ('21000000-0000-0000-0000-000000000001', 'Empresa A', 'admin-empresa-a'),
  ('21000000-0000-0000-0000-000000000002', 'Empresa B', 'admin-empresa-b');

insert into public.usuarios (
  id, auth_user_id, empresa_id, nome, email, papel, permissoes
) values
  (
    '31000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'Comum A', 'comum-a@nexotfe.test', 'operador', array[]::text[]
  ),
  (
    '31000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000001',
    'Gestor A', 'gestor-a@nexotfe.test', 'gestor',
    array[
      'admin.configuracoes.gerenciar', 'admin.numeracao.gerenciar',
      'admin.numeracao.gerar', 'admin.tecnologias.gerenciar',
      'admin.recursos.gerenciar', 'admin.colaboradores.gerenciar'
    ]
  ),
  (
    '31000000-0000-0000-0000-000000000003',
    '11000000-0000-0000-0000-000000000003',
    '21000000-0000-0000-0000-000000000002',
    'Gestor B', 'gestor-b@nexotfe.test', 'gestor',
    array[
      'admin.numeracao.gerar', 'admin.tecnologias.gerenciar',
      'admin.recursos.gerenciar', 'admin.colaboradores.gerenciar'
    ]
  );

insert into public.numeracao_configuracoes (
  id, empresa_id, entidade, prefixo, usar_ano, tamanho_sequencia, created_by
) values
  (
    '41000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'projeto', 'PRJ-', true, 4,
    '11000000-0000-0000-0000-000000000002'
  ),
  (
    '41000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    'projeto', 'B-', true, 4,
    '11000000-0000-0000-0000-000000000003'
  );

insert into public.grupos_tecnologias (
  id, empresa_id, codigo, descricao, created_by
) values
  (
    '42000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'USINAGEM', 'Usinagem',
    '11000000-0000-0000-0000-000000000002'
  ),
  (
    '42000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    'SOLDA', 'Soldagem',
    '11000000-0000-0000-0000-000000000003'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-0000-0000-000000000001',
  true
);

do $common_user$
declare
  v_count integer;
begin
  select count(*) into v_count from public.grupos_tecnologias;
  if v_count <> 1 then
    raise exception 'Usuário comum deveria visualizar 1 grupo do tenant; encontrou %', v_count;
  end if;

  begin
    perform public.gerar_numero_entidade('projeto', 2026);
    raise exception 'Usuário comum gerou numeração sem permissão';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.grupos_tecnologias (
      empresa_id, codigo, descricao, created_by
    ) values (
      '21000000-0000-0000-0000-000000000001',
      'INDEVIDA', 'Sem permissão', auth.uid()
    );
    raise exception 'Usuário comum inseriu tecnologia sem permissão';
  exception
    when insufficient_privilege then null;
  end;
end
$common_user$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-0000-0000-000000000002',
  true
);

do $manager_a$
declare
  v_first text;
  v_second text;
  v_count integer;
begin
  v_first := public.gerar_numero_entidade('projeto', 2026);
  v_second := public.gerar_numero_entidade('projeto', 2026);

  if v_first <> 'PRJ-20260001' or v_second <> 'PRJ-20260002' then
    raise exception 'Numeração inesperada: %, %', v_first, v_second;
  end if;

  insert into public.tecnologias (
    empresa_id, grupo_tecnologia_id, codigo, descricao,
    fator_planejamento, unidade_planejamento, created_by
  ) values (
    '21000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    'CNC', 'Usinagem CNC', 1, 'hora', auth.uid()
  );

  select count(*) into v_count from public.tecnologias;
  if v_count <> 1 then
    raise exception 'Gestor A deveria visualizar apenas 1 tecnologia; encontrou %', v_count;
  end if;

  begin
    insert into public.tecnologias (
      empresa_id, grupo_tecnologia_id, codigo, descricao,
      fator_planejamento, unidade_planejamento, created_by
    ) values (
      '21000000-0000-0000-0000-000000000001',
      '42000000-0000-0000-0000-000000000002',
      'CRUZADA', 'Relação cruzada', 1, 'hora', auth.uid()
    );
    raise exception 'Relação entre tenants foi aceita';
  exception
    when foreign_key_violation then null;
  end;

  begin
    update public.grupos_tecnologias
       set deleted_at = now(), deleted_by = auth.uid()
     where id = '42000000-0000-0000-0000-000000000001';
    raise exception 'Exclusão lógica direta deveria exigir RPC explícita';
  exception
    when insufficient_privilege then null;
  end;

  select count(*) into v_count from public.grupos_tecnologias;
  if v_count <> 1 then
    raise exception 'Falha de RLS após tentativa de exclusão lógica';
  end if;
end
$manager_a$;

reset role;
rollback;
