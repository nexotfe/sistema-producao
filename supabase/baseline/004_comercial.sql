-- NEXOTFE 1.0 — Baseline SQL
-- Módulo 004: clientes, contatos, projetos, orçamentos e aprovação comercial
-- Dependências: 001_extensions.sql, 002_security.sql, 003_admin.sql

begin;

create table public.clientes (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  nome text not null,
  nome_fantasia text,
  cpf_cnpj text,
  inscricao_estadual text,
  inscricao_municipal text,
  email text,
  telefone text,
  site text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  pais text not null default 'Brasil',
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint clientes_empresa_id_id_uniq unique (empresa_id, id),
  constraint clientes_nome_chk check (btrim(nome) <> ''),
  constraint clientes_email_chk check (email is null or email = lower(btrim(email))),
  constraint clientes_pais_chk check (btrim(pais) <> ''),
  constraint clientes_delete_chk check ((deleted_at is null) = (deleted_by is null))
);

create unique index clientes_empresa_cpf_cnpj_uniq
  on public.clientes (empresa_id, cpf_cnpj)
  where cpf_cnpj is not null and deleted_at is null;

create table public.cliente_contatos (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null,
  cliente_id uuid not null,
  nome text not null,
  finalidade text not null,
  cargo text,
  email text,
  telefone text,
  observacoes text,
  principal boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint cliente_contatos_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint cliente_contatos_cliente_tenant_fkey foreign key (empresa_id, cliente_id)
    references public.clientes(empresa_id, id) on delete restrict,
  constraint cliente_contatos_empresa_id_id_uniq unique (empresa_id, id),
  constraint cliente_contatos_nome_chk check (btrim(nome) <> ''),
  constraint cliente_contatos_finalidade_chk check (btrim(finalidade) <> ''),
  constraint cliente_contatos_email_chk check (email is null or email = lower(btrim(email))),
  constraint cliente_contatos_delete_chk check ((deleted_at is null) = (deleted_by is null))
);

create unique index cliente_contatos_principal_uniq
  on public.cliente_contatos (empresa_id, cliente_id)
  where principal = true and ativo = true and deleted_at is null;

create table public.projetos (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null,
  cliente_id uuid not null,
  contato_principal_id uuid,
  numero_projeto text not null,
  nome text not null,
  tipo text not null,
  origem text not null default 'comercial',
  status text not null default 'rascunho',
  prioridade text not null default 'normal',
  data_objetivo date,
  regra_faturamento text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint projetos_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint projetos_cliente_tenant_fkey foreign key (empresa_id, cliente_id)
    references public.clientes(empresa_id, id) on delete restrict,
  constraint projetos_contato_tenant_fkey foreign key (empresa_id, contato_principal_id)
    references public.cliente_contatos(empresa_id, id) on delete restrict,
  constraint projetos_empresa_id_id_uniq unique (empresa_id, id),
  constraint projetos_numero_uniq unique (empresa_id, numero_projeto),
  constraint projetos_numero_chk check (btrim(numero_projeto) <> ''),
  constraint projetos_nome_chk check (btrim(nome) <> ''),
  constraint projetos_tipo_chk
    check (tipo in ('fabricacao', 'desenvolvimento', 'servico', 'industrializacao')),
  constraint projetos_origem_chk check (origem in ('comercial', 'engenharia')),
  constraint projetos_status_chk check (status in (
    'rascunho', 'em_orcamento', 'em_desenvolvimento',
    'aguardando_aprovacao', 'aprovado', 'em_planejamento',
    'em_producao', 'concluido', 'cancelado'
  )),
  constraint projetos_prioridade_chk check (prioridade in ('baixa', 'normal', 'alta', 'critica')),
  constraint projetos_delete_chk check ((deleted_at is null) = (deleted_by is null))
);

create table public.projeto_estado_eventos (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null,
  projeto_id uuid not null,
  estado_anterior text,
  estado_novo text not null,
  motivo text,
  ocorrido_em timestamptz not null default now(),
  ocorrido_por uuid not null references auth.users(id) on delete restrict,
  constraint projeto_estado_eventos_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint projeto_estado_eventos_projeto_tenant_fkey foreign key (empresa_id, projeto_id)
    references public.projetos(empresa_id, id) on delete restrict,
  constraint projeto_estado_eventos_empresa_id_id_uniq unique (empresa_id, id),
  constraint projeto_estado_eventos_anterior_chk check (
    estado_anterior is null or estado_anterior in (
      'rascunho', 'em_orcamento', 'em_desenvolvimento',
      'aguardando_aprovacao', 'aprovado', 'em_planejamento',
      'em_producao', 'concluido', 'cancelado'
    )
  ),
  constraint projeto_estado_eventos_novo_chk check (estado_novo in (
    'rascunho', 'em_orcamento', 'em_desenvolvimento',
    'aguardando_aprovacao', 'aprovado', 'em_planejamento',
    'em_producao', 'concluido', 'cancelado'
  )),
  constraint projeto_estado_eventos_mudanca_chk
    check (estado_anterior is null or estado_anterior <> estado_novo)
);

create table public.orcamentos (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null,
  projeto_id uuid not null,
  versao integer not null default 1,
  descricao text,
  moeda char(3) not null default 'BRL',
  emitido_em timestamptz,
  valido_ate date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint orcamentos_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint orcamentos_projeto_tenant_fkey foreign key (empresa_id, projeto_id)
    references public.projetos(empresa_id, id) on delete restrict,
  constraint orcamentos_empresa_id_id_uniq unique (empresa_id, id),
  constraint orcamentos_versao_uniq unique (empresa_id, projeto_id, versao),
  constraint orcamentos_versao_chk check (versao > 0),
  constraint orcamentos_moeda_chk check (moeda ~ '^[A-Z]{3}$'),
  constraint orcamentos_validade_chk check (valido_ate is null or emitido_em is null or valido_ate >= emitido_em::date),
  constraint orcamentos_delete_chk check ((deleted_at is null) = (deleted_by is null))
);

create table public.orcamento_itens (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null,
  orcamento_id uuid not null,
  sequencia integer not null,
  descricao text not null,
  quantidade numeric(18,6) not null,
  unidade text not null,
  valor_unitario numeric(18,4) not null,
  valor_total numeric(18,2) generated always as (round(quantidade * valor_unitario, 2)) stored,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint orcamento_itens_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint orcamento_itens_orcamento_tenant_fkey foreign key (empresa_id, orcamento_id)
    references public.orcamentos(empresa_id, id) on delete restrict,
  constraint orcamento_itens_empresa_id_id_uniq unique (empresa_id, id),
  constraint orcamento_itens_sequencia_uniq unique (empresa_id, orcamento_id, sequencia),
  constraint orcamento_itens_sequencia_chk check (sequencia > 0),
  constraint orcamento_itens_descricao_chk check (btrim(descricao) <> ''),
  constraint orcamento_itens_quantidade_chk check (quantidade > 0),
  constraint orcamento_itens_unidade_chk check (btrim(unidade) <> ''),
  constraint orcamento_itens_valor_chk check (valor_unitario >= 0),
  constraint orcamento_itens_delete_chk check ((deleted_at is null) = (deleted_by is null))
);

create table public.aprovacoes_comerciais (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null,
  projeto_id uuid not null,
  orcamento_id uuid not null,
  revisao integer not null,
  resultado text not null,
  justificativa text,
  idempotency_key text not null,
  decidido_em timestamptz not null default now(),
  decidido_por uuid not null references auth.users(id) on delete restrict,
  constraint aprovacoes_comerciais_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint aprovacoes_comerciais_projeto_tenant_fkey foreign key (empresa_id, projeto_id)
    references public.projetos(empresa_id, id) on delete restrict,
  constraint aprovacoes_comerciais_orcamento_tenant_fkey foreign key (empresa_id, orcamento_id)
    references public.orcamentos(empresa_id, id) on delete restrict,
  constraint aprovacoes_comerciais_empresa_id_id_uniq unique (empresa_id, id),
  constraint aprovacoes_comerciais_revisao_uniq unique (empresa_id, orcamento_id, revisao),
  constraint aprovacoes_comerciais_idempotency_uniq unique (empresa_id, idempotency_key),
  constraint aprovacoes_comerciais_revisao_chk check (revisao > 0),
  constraint aprovacoes_comerciais_resultado_chk check (resultado in ('aprovado', 'rejeitado')),
  constraint aprovacoes_comerciais_idempotency_chk check (btrim(idempotency_key) <> '')
);

create index clientes_empresa_nome_idx on public.clientes (empresa_id, nome);
create index cliente_contatos_cliente_idx on public.cliente_contatos (empresa_id, cliente_id);
create index projetos_cliente_idx on public.projetos (empresa_id, cliente_id);
create index projetos_status_idx on public.projetos (empresa_id, status);
create index projeto_estado_eventos_projeto_idx
  on public.projeto_estado_eventos (empresa_id, projeto_id, ocorrido_em);
create index orcamentos_projeto_idx on public.orcamentos (empresa_id, projeto_id);
create index orcamento_itens_orcamento_idx on public.orcamento_itens (empresa_id, orcamento_id);
create index aprovacoes_comerciais_projeto_idx
  on public.aprovacoes_comerciais (empresa_id, projeto_id, decidido_em);

do $triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'clientes', 'cliente_contatos', 'projetos', 'orcamentos', 'orcamento_itens'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      v_table || '_set_updated_at',
      v_table
    );
  end loop;
end
$triggers$;

create or replace function public.registrar_evento_estado_projeto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_motivo text;
begin
  if tg_op = 'INSERT' then
    insert into public.projeto_estado_eventos (
      empresa_id, projeto_id, estado_anterior, estado_novo, motivo, ocorrido_por
    ) values (
      new.empresa_id, new.id, null, new.status, 'Criação do projeto', new.created_by
    );
  elsif new.status is distinct from old.status then
    v_motivo := nullif(current_setting('app.projeto_transicao_motivo', true), '');
    insert into public.projeto_estado_eventos (
      empresa_id, projeto_id, estado_anterior, estado_novo, motivo, ocorrido_por
    ) values (
      new.empresa_id, new.id, old.status, new.status, v_motivo, auth.uid()
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.registrar_evento_estado_projeto() from public;

create trigger projetos_registrar_estado
after insert or update of status on public.projetos
for each row execute function public.registrar_evento_estado_projeto();

create or replace function public.transicionar_projeto(
  p_projeto_id uuid,
  p_estado_novo text,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_projeto public.projetos%rowtype;
  v_permissao text;
  v_permitida boolean := false;
begin
  if v_empresa_id is null then
    raise exception 'Contexto empresarial ativo não encontrado.';
  end if;

  select * into v_projeto
    from public.projetos
   where id = p_projeto_id
     and empresa_id = v_empresa_id
     and deleted_at is null
   for update;

  if not found then
    raise exception 'Projeto não encontrado no tenant atual.';
  end if;

  if v_projeto.status = p_estado_novo then
    return v_projeto.id;
  end if;

  v_permissao := case
    when p_estado_novo in ('em_orcamento', 'em_desenvolvimento', 'aguardando_aprovacao', 'aprovado', 'cancelado')
      then 'comercial.projetos.transicionar'
    when p_estado_novo = 'em_planejamento' then 'pcp.projetos.transicionar'
    when p_estado_novo = 'em_producao' then 'producao.projetos.transicionar'
    when p_estado_novo = 'concluido' then 'expedicao.projetos.concluir'
    else null
  end;

  if v_permissao is null or not public.usuario_tem_permissao(v_permissao) then
    raise exception 'Usuário sem permissão para a transição solicitada.' using errcode = '42501';
  end if;

  v_permitida := case v_projeto.status
    when 'rascunho' then p_estado_novo in ('em_orcamento', 'cancelado')
    when 'em_orcamento' then p_estado_novo in ('em_desenvolvimento', 'aguardando_aprovacao', 'cancelado')
    when 'em_desenvolvimento' then p_estado_novo in ('em_orcamento', 'aguardando_aprovacao', 'cancelado')
    when 'aguardando_aprovacao' then p_estado_novo in ('aprovado', 'em_desenvolvimento', 'cancelado')
    when 'aprovado' then p_estado_novo in ('em_planejamento', 'cancelado')
    when 'em_planejamento' then p_estado_novo in ('em_producao', 'cancelado')
    when 'em_producao' then p_estado_novo in ('concluido', 'cancelado')
    else false
  end;

  if not v_permitida then
    raise exception 'Transição de projeto inválida: % → %.', v_projeto.status, p_estado_novo;
  end if;

  perform set_config('app.projeto_transicao_motivo', coalesce(p_motivo, ''), true);

  update public.projetos
     set status = p_estado_novo
   where id = v_projeto.id;

  return v_projeto.id;
end;
$function$;

create or replace function public.registrar_decisao_comercial(
  p_projeto_id uuid,
  p_orcamento_id uuid,
  p_resultado text,
  p_justificativa text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_existente uuid;
  v_existente_projeto_id uuid;
  v_existente_orcamento_id uuid;
  v_existente_resultado text;
  v_existente_justificativa text;
  v_revisao integer;
  v_aprovacao_id uuid;
  v_estado_destino text;
begin
  if v_empresa_id is null then
    raise exception 'Contexto empresarial ativo não encontrado.';
  end if;

  if not public.usuario_tem_permissao('comercial.aprovacoes.registrar') then
    raise exception 'Usuário sem permissão para registrar decisão comercial.' using errcode = '42501';
  end if;

  if p_resultado not in ('aprovado', 'rejeitado') then
    raise exception 'Resultado comercial inválido: %.', p_resultado;
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Chave de idempotência é obrigatória.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_empresa_id::text || ':' || p_idempotency_key, 0)
  );

  select id, projeto_id, orcamento_id, resultado, justificativa
    into v_existente, v_existente_projeto_id, v_existente_orcamento_id,
         v_existente_resultado, v_existente_justificativa
    from public.aprovacoes_comerciais
   where empresa_id = v_empresa_id
     and idempotency_key = p_idempotency_key;

  if found then
    if v_existente_projeto_id is distinct from p_projeto_id
       or v_existente_orcamento_id is distinct from p_orcamento_id
       or v_existente_resultado is distinct from p_resultado
       or v_existente_justificativa is distinct from p_justificativa then
      raise exception 'Chave de idempotência já utilizada com conteúdo diferente.';
    end if;
    return v_existente;
  end if;

  if not exists (
    select 1
      from public.orcamentos o
      join public.projetos p
        on p.empresa_id = o.empresa_id and p.id = o.projeto_id
     where o.empresa_id = v_empresa_id
       and o.id = p_orcamento_id
       and o.projeto_id = p_projeto_id
       and o.deleted_at is null
       and p.deleted_at is null
       and p.status = 'aguardando_aprovacao'
  ) then
    raise exception 'Projeto/orçamento não encontrado ou projeto fora de aprovação.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_empresa_id::text || p_orcamento_id::text, 0));

  select coalesce(max(revisao), 0) + 1 into v_revisao
    from public.aprovacoes_comerciais
   where empresa_id = v_empresa_id
     and orcamento_id = p_orcamento_id;

  insert into public.aprovacoes_comerciais (
    empresa_id, projeto_id, orcamento_id, revisao,
    resultado, justificativa, idempotency_key, decidido_por
  ) values (
    v_empresa_id, p_projeto_id, p_orcamento_id, v_revisao,
    p_resultado, p_justificativa, p_idempotency_key, auth.uid()
  ) returning id into v_aprovacao_id;

  v_estado_destino := case p_resultado
    when 'aprovado' then 'aprovado'
    else 'em_desenvolvimento'
  end;

  perform set_config(
    'app.projeto_transicao_motivo',
    coalesce(p_justificativa, 'Decisão comercial: ' || p_resultado),
    true
  );

  update public.projetos
     set status = v_estado_destino
   where empresa_id = v_empresa_id
     and id = p_projeto_id;

  return v_aprovacao_id;
end;
$function$;

revoke all on function public.transicionar_projeto(uuid, text, text) from public;
revoke all on function public.registrar_decisao_comercial(uuid, uuid, text, text, text) from public;
grant execute on function public.transicionar_projeto(uuid, text, text) to authenticated, service_role;
grant execute on function public.registrar_decisao_comercial(uuid, uuid, text, text, text) to authenticated, service_role;

do $security$
declare
  v_table text;
begin
  foreach v_table in array array[
    'clientes', 'cliente_contatos', 'projetos', 'projeto_estado_eventos',
    'orcamentos', 'orcamento_itens', 'aprovacoes_comerciais'
  ]
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant all on table public.%I to service_role', v_table);
    execute format('alter table public.%I enable row level security', v_table);
  end loop;
end
$security$;

grant select, insert, update on public.clientes, public.cliente_contatos,
  public.orcamentos, public.orcamento_itens to authenticated;
grant select, insert on public.projetos to authenticated;
grant update (
  cliente_id, contato_principal_id, nome, tipo, origem, prioridade,
  data_objetivo, regra_faturamento, observacoes, deleted_at, deleted_by
) on public.projetos to authenticated;
grant select on public.projeto_estado_eventos, public.aprovacoes_comerciais to authenticated;

create policy clientes_select on public.clientes for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy clientes_insert on public.clientes for insert to authenticated
with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid() and public.usuario_tem_permissao('comercial.clientes.gerenciar'));
create policy clientes_update on public.clientes for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('comercial.clientes.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('comercial.clientes.gerenciar'));

create policy cliente_contatos_select on public.cliente_contatos for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy cliente_contatos_insert on public.cliente_contatos for insert to authenticated
with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid() and public.usuario_tem_permissao('comercial.clientes.gerenciar'));
create policy cliente_contatos_update on public.cliente_contatos for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('comercial.clientes.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('comercial.clientes.gerenciar'));

create policy projetos_select on public.projetos for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy projetos_insert on public.projetos for insert to authenticated
with check (
  empresa_id = public.empresa_atual_id()
  and created_by = auth.uid()
  and status = 'rascunho'
  and public.usuario_tem_permissao('comercial.projetos.gerenciar')
);
create policy projetos_update on public.projetos for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('comercial.projetos.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('comercial.projetos.gerenciar'));

create policy projeto_estado_eventos_select on public.projeto_estado_eventos for select to authenticated
using (empresa_id = public.empresa_atual_id());

create policy orcamentos_select on public.orcamentos for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy orcamentos_insert on public.orcamentos for insert to authenticated
with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid() and public.usuario_tem_permissao('comercial.orcamentos.gerenciar'));
create policy orcamentos_update on public.orcamentos for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('comercial.orcamentos.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('comercial.orcamentos.gerenciar'));

create policy orcamento_itens_select on public.orcamento_itens for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy orcamento_itens_insert on public.orcamento_itens for insert to authenticated
with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid() and public.usuario_tem_permissao('comercial.orcamentos.gerenciar'));
create policy orcamento_itens_update on public.orcamento_itens for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('comercial.orcamentos.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('comercial.orcamentos.gerenciar'));

create policy aprovacoes_comerciais_select on public.aprovacoes_comerciais for select to authenticated
using (empresa_id = public.empresa_atual_id());

comment on table public.clientes is 'Origem identificada do fluxo comercial e industrial.';
comment on table public.cliente_contatos is 'Pessoas e finalidades de contato vinculadas ao cliente.';
comment on table public.projetos is 'Identidade única do trabalho, preservada do orçamento à entrega.';
comment on table public.projeto_estado_eventos is 'Histórico imutável das mudanças de Estado Oficial do projeto.';
comment on table public.orcamentos is 'Versão comercial do escopo e valor proposto ao cliente.';
comment on table public.aprovacoes_comerciais is 'Decisão comercial imutável e idempotente sobre uma versão do orçamento.';

commit;
