-- Testes estruturais e comportamentais do módulo 004_comercial.sql.

begin;

do $structure$
declare
  v_expected_tables text[] := array[
    'clientes', 'cliente_contatos', 'projetos', 'projeto_estado_eventos',
    'orcamentos', 'orcamento_itens', 'aprovacoes_comerciais'
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

  if v_count <> 17 then
    raise exception 'Esperadas 17 policies comerciais; encontradas %', v_count;
  end if;

  select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'registrar_evento_estado_projeto',
       'transicionar_projeto',
       'registrar_decisao_comercial'
     )
     and p.prosecdef = true
     and exists (
       select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
        where cfg like 'search_path=%'
     );

  if v_count <> 3 then
    raise exception 'Funções comerciais privilegiadas não atendem ao contrato de segurança';
  end if;
end
$structure$;

insert into auth.users (id, email) values
  ('12000000-0000-0000-0000-000000000001', 'comercial-a@nexotfe.test'),
  ('12000000-0000-0000-0000-000000000002', 'comum-a@nexotfe.test'),
  ('12000000-0000-0000-0000-000000000003', 'comercial-b@nexotfe.test');

insert into public.empresas (id, nome, slug) values
  ('22000000-0000-0000-0000-000000000001', 'Empresa Comercial A', 'comercial-a'),
  ('22000000-0000-0000-0000-000000000002', 'Empresa Comercial B', 'comercial-b');

insert into public.usuarios (
  id, auth_user_id, empresa_id, nome, email, papel, permissoes
) values
  (
    '32000000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'Comercial A', 'comercial-a@nexotfe.test', 'comercial',
    array[
      'admin.numeracao.gerar', 'comercial.clientes.gerenciar',
      'comercial.projetos.gerenciar', 'comercial.projetos.transicionar',
      'comercial.orcamentos.gerenciar', 'comercial.aprovacoes.registrar'
    ]
  ),
  (
    '32000000-0000-0000-0000-000000000002',
    '12000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000001',
    'Comum A', 'comum-a@nexotfe.test', 'leitura', array[]::text[]
  ),
  (
    '32000000-0000-0000-0000-000000000003',
    '12000000-0000-0000-0000-000000000003',
    '22000000-0000-0000-0000-000000000002',
    'Comercial B', 'comercial-b@nexotfe.test', 'comercial',
    array[
      'admin.numeracao.gerar', 'comercial.clientes.gerenciar',
      'comercial.projetos.gerenciar', 'comercial.projetos.transicionar',
      'comercial.orcamentos.gerenciar', 'comercial.aprovacoes.registrar'
    ]
  );

insert into public.numeracao_configuracoes (
  empresa_id, entidade, prefixo, usar_ano, tamanho_sequencia, created_by
) values
  (
    '22000000-0000-0000-0000-000000000001',
    'projeto', 'PA-', true, 4,
    '12000000-0000-0000-0000-000000000001'
  ),
  (
    '22000000-0000-0000-0000-000000000002',
    'projeto', 'PB-', true, 4,
    '12000000-0000-0000-0000-000000000003'
  );

insert into public.clientes (
  id, empresa_id, nome, created_by
) values
  (
    '42000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'Cliente A', '12000000-0000-0000-0000-000000000001'
  ),
  (
    '42000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000002',
    'Cliente B', '12000000-0000-0000-0000-000000000003'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '12000000-0000-0000-0000-000000000001',
  true
);

insert into public.cliente_contatos (
  id, empresa_id, cliente_id, nome, finalidade, principal, created_by
) values (
  '43000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  'Contato A', 'comercial', true, auth.uid()
);

insert into public.projetos (
  id, empresa_id, cliente_id, contato_principal_id,
  numero_projeto, nome, tipo, created_by
) values (
  '44000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  '43000000-0000-0000-0000-000000000001',
  public.gerar_numero_entidade('projeto', 2026),
  'Projeto Industrial A', 'fabricacao', auth.uid()
);

insert into public.orcamentos (
  id, empresa_id, projeto_id, versao, descricao, created_by
) values (
  '45000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '44000000-0000-0000-0000-000000000001',
  1, 'Primeira versão', auth.uid()
);

insert into public.orcamento_itens (
  empresa_id, orcamento_id, sequencia, descricao,
  quantidade, unidade, valor_unitario, created_by
) values (
  '22000000-0000-0000-0000-000000000001',
  '45000000-0000-0000-0000-000000000001',
  1, 'Item orçado', 2, 'peca', 10.1234, auth.uid()
);

do $commercial_flow$
declare
  v_count integer;
  v_total numeric;
  v_approval_id uuid;
  v_repeated_id uuid;
  v_status text;
  v_failed boolean;
begin
  select count(*) into v_count from public.clientes;
  if v_count <> 1 then
    raise exception 'Comercial A visualizou % clientes; esperado 1', v_count;
  end if;

  select valor_total into v_total from public.orcamento_itens;
  if v_total <> 20.25 then
    raise exception 'Total calculado do orçamento incorreto: %', v_total;
  end if;

  select count(*) into v_count
    from public.projeto_estado_eventos
   where projeto_id = '44000000-0000-0000-0000-000000000001';
  if v_count <> 1 then
    raise exception 'Evento inicial do projeto não foi registrado';
  end if;

  begin
    update public.projetos
       set status = 'aprovado'
     where id = '44000000-0000-0000-0000-000000000001';
    raise exception 'Status do projeto foi alterado diretamente';
  exception
    when insufficient_privilege then null;
  end;

  perform public.transicionar_projeto(
    '44000000-0000-0000-0000-000000000001', 'em_orcamento', 'Início do orçamento'
  );
  perform public.transicionar_projeto(
    '44000000-0000-0000-0000-000000000001', 'em_desenvolvimento', 'Análise técnica'
  );
  perform public.transicionar_projeto(
    '44000000-0000-0000-0000-000000000001', 'aguardando_aprovacao', 'Enviado ao cliente'
  );

  v_approval_id := public.registrar_decisao_comercial(
    '44000000-0000-0000-0000-000000000001',
    '45000000-0000-0000-0000-000000000001',
    'aprovado', 'Cliente aprovou', 'approval-a-001'
  );

  v_repeated_id := public.registrar_decisao_comercial(
    '44000000-0000-0000-0000-000000000001',
    '45000000-0000-0000-0000-000000000001',
    'aprovado', 'Cliente aprovou', 'approval-a-001'
  );

  if v_approval_id is distinct from v_repeated_id then
    raise exception 'Idempotência retornou identificadores diferentes';
  end if;

  select count(*) into v_count from public.aprovacoes_comerciais;
  if v_count <> 1 then
    raise exception 'Chamada idempotente criou % aprovações', v_count;
  end if;

  select status into v_status
    from public.projetos
   where id = '44000000-0000-0000-0000-000000000001';
  if v_status <> 'aprovado' then
    raise exception 'Projeto não alcançou estado aprovado: %', v_status;
  end if;

  select count(*) into v_count
    from public.projeto_estado_eventos
   where projeto_id = '44000000-0000-0000-0000-000000000001';
  if v_count <> 5 then
    raise exception 'Esperados 5 eventos de estado; encontrados %', v_count;
  end if;

  v_failed := false;
  begin
    perform public.registrar_decisao_comercial(
      '44000000-0000-0000-0000-000000000001',
      '45000000-0000-0000-0000-000000000001',
      'rejeitado', 'Conteúdo conflitante', 'approval-a-001'
    );
  exception
    when raise_exception then v_failed := true;
  end;
  if not v_failed then
    raise exception 'Chave idempotente aceitou conteúdo diferente';
  end if;

  begin
    insert into public.cliente_contatos (
      empresa_id, cliente_id, nome, finalidade, created_by
    ) values (
      '22000000-0000-0000-0000-000000000001',
      '42000000-0000-0000-0000-000000000002',
      'Contato cruzado', 'comercial', auth.uid()
    );
    raise exception 'Contato entre tenants foi aceito';
  exception
    when foreign_key_violation then null;
  end;

  begin
    insert into public.projeto_estado_eventos (
      empresa_id, projeto_id, estado_novo, ocorrido_por
    ) values (
      '22000000-0000-0000-0000-000000000001',
      '44000000-0000-0000-0000-000000000001',
      'cancelado', auth.uid()
    );
    raise exception 'Histórico imutável aceitou inserção direta';
  exception
    when insufficient_privilege then null;
  end;
end
$commercial_flow$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '12000000-0000-0000-0000-000000000003',
  true
);

do $tenant_b$
declare
  v_count integer;
  v_failed boolean := false;
begin
  select count(*) into v_count from public.projetos;
  if v_count <> 0 then
    raise exception 'Comercial B visualizou projeto da Empresa A';
  end if;

  begin
    perform public.transicionar_projeto(
      '44000000-0000-0000-0000-000000000001', 'cancelado', 'Tentativa cruzada'
    );
  exception
    when raise_exception then v_failed := true;
  end;
  if not v_failed then
    raise exception 'Comercial B alterou projeto da Empresa A';
  end if;
end
$tenant_b$;

reset role;
rollback;
