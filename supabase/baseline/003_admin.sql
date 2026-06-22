-- NEXOTFE 1.0 — Baseline SQL
-- Módulo 003: configurações, numeração, tecnologias, recursos e colaboradores
-- Dependências: 001_extensions.sql, 002_security.sql

begin;

create table public.configuracoes_empresa (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  chave text not null,
  valor jsonb not null,
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint configuracoes_empresa_empresa_id_id_uniq unique (empresa_id, id),
  constraint configuracoes_empresa_chave_uniq unique (empresa_id, chave),
  constraint configuracoes_empresa_chave_chk
    check (chave = lower(btrim(chave)) and chave ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  constraint configuracoes_empresa_delete_chk
    check ((deleted_at is null) = (deleted_by is null))
);

create table public.numeracao_configuracoes (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  entidade text not null,
  prefixo text not null default '',
  usar_ano boolean not null default true,
  ano smallint,
  sequencia_atual bigint not null default 0,
  tamanho_sequencia smallint not null default 6,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint numeracao_configuracoes_empresa_id_id_uniq unique (empresa_id, id),
  constraint numeracao_configuracoes_entidade_uniq unique (empresa_id, entidade),
  constraint numeracao_configuracoes_entidade_chk
    check (entidade = lower(btrim(entidade)) and entidade ~ '^[a-z][a-z0-9_]*$'),
  constraint numeracao_configuracoes_sequencia_chk
    check (sequencia_atual >= 0 and tamanho_sequencia between 2 and 12),
  constraint numeracao_configuracoes_ano_chk
    check (
      (usar_ano and (ano is null or ano between 2000 and 9999))
      or (not usar_ano and ano is null)
    ),
  constraint numeracao_configuracoes_delete_chk
    check ((deleted_at is null) = (deleted_by is null))
);

create table public.grupos_tecnologias (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  codigo text not null,
  descricao text not null,
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint grupos_tecnologias_empresa_id_id_uniq unique (empresa_id, id),
  constraint grupos_tecnologias_codigo_uniq unique (empresa_id, codigo),
  constraint grupos_tecnologias_codigo_chk check (btrim(codigo) <> ''),
  constraint grupos_tecnologias_descricao_chk check (btrim(descricao) <> ''),
  constraint grupos_tecnologias_status_chk check (status in ('ativo', 'inativo')),
  constraint grupos_tecnologias_delete_chk check ((deleted_at is null) = (deleted_by is null))
);

create table public.tecnologias (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null,
  grupo_tecnologia_id uuid not null,
  codigo text not null,
  descricao text not null,
  fator_planejamento numeric(18,6) not null default 1,
  unidade_planejamento text not null,
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint tecnologias_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint tecnologias_grupo_tenant_fkey foreign key (empresa_id, grupo_tecnologia_id)
    references public.grupos_tecnologias(empresa_id, id) on delete restrict,
  constraint tecnologias_empresa_id_id_uniq unique (empresa_id, id),
  constraint tecnologias_codigo_uniq unique (empresa_id, codigo),
  constraint tecnologias_codigo_chk check (btrim(codigo) <> ''),
  constraint tecnologias_descricao_chk check (btrim(descricao) <> ''),
  constraint tecnologias_fator_chk check (fator_planejamento > 0),
  constraint tecnologias_unidade_chk check (btrim(unidade_planejamento) <> ''),
  constraint tecnologias_status_chk check (status in ('ativo', 'inativo')),
  constraint tecnologias_delete_chk check ((deleted_at is null) = (deleted_by is null))
);

create table public.grupos_recursos (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  codigo text not null,
  nome text not null,
  descricao text,
  setor text,
  unidade_capacidade text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint grupos_recursos_empresa_id_id_uniq unique (empresa_id, id),
  constraint grupos_recursos_codigo_uniq unique (empresa_id, codigo),
  constraint grupos_recursos_codigo_chk check (btrim(codigo) <> ''),
  constraint grupos_recursos_nome_chk check (btrim(nome) <> ''),
  constraint grupos_recursos_unidade_chk
    check (unidade_capacidade is null or btrim(unidade_capacidade) <> ''),
  constraint grupos_recursos_delete_chk check ((deleted_at is null) = (deleted_by is null))
);

create table public.recursos_produtivos (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null,
  grupo_recurso_id uuid not null,
  codigo text not null,
  nome text not null,
  fabricante text,
  modelo text,
  setor text,
  capacidade numeric(18,6),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint recursos_produtivos_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint recursos_produtivos_grupo_tenant_fkey foreign key (empresa_id, grupo_recurso_id)
    references public.grupos_recursos(empresa_id, id) on delete restrict,
  constraint recursos_produtivos_empresa_id_id_uniq unique (empresa_id, id),
  constraint recursos_produtivos_codigo_uniq unique (empresa_id, codigo),
  constraint recursos_produtivos_codigo_chk check (btrim(codigo) <> ''),
  constraint recursos_produtivos_nome_chk check (btrim(nome) <> ''),
  constraint recursos_produtivos_capacidade_chk check (capacidade is null or capacidade >= 0),
  constraint recursos_produtivos_delete_chk check ((deleted_at is null) = (deleted_by is null))
);

create table public.colaboradores (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  codigo text not null,
  nome text not null,
  funcao text,
  setor text,
  capacidade_semanal_horas numeric(10,2),
  disponibilidade_horas numeric(10,2),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint colaboradores_empresa_id_id_uniq unique (empresa_id, id),
  constraint colaboradores_codigo_uniq unique (empresa_id, codigo),
  constraint colaboradores_codigo_chk check (btrim(codigo) <> ''),
  constraint colaboradores_nome_chk check (btrim(nome) <> ''),
  constraint colaboradores_capacidade_chk
    check (capacidade_semanal_horas is null or capacidade_semanal_horas >= 0),
  constraint colaboradores_disponibilidade_chk
    check (disponibilidade_horas is null or disponibilidade_horas >= 0),
  constraint colaboradores_delete_chk check ((deleted_at is null) = (deleted_by is null))
);

create table public.colaborador_tecnologias (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null,
  colaborador_id uuid not null,
  tecnologia_id uuid not null,
  nivel text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint colaborador_tecnologias_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint colaborador_tecnologias_colaborador_tenant_fkey
    foreign key (empresa_id, colaborador_id)
    references public.colaboradores(empresa_id, id) on delete restrict,
  constraint colaborador_tecnologias_tecnologia_tenant_fkey
    foreign key (empresa_id, tecnologia_id)
    references public.tecnologias(empresa_id, id) on delete restrict,
  constraint colaborador_tecnologias_empresa_id_id_uniq unique (empresa_id, id),
  constraint colaborador_tecnologias_relacao_uniq
    unique (empresa_id, colaborador_id, tecnologia_id),
  constraint colaborador_tecnologias_nivel_chk check (nivel is null or btrim(nivel) <> ''),
  constraint colaborador_tecnologias_delete_chk check ((deleted_at is null) = (deleted_by is null))
);

create table public.recurso_tecnologias (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null,
  recurso_produtivo_id uuid not null,
  tecnologia_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  constraint recurso_tecnologias_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete restrict,
  constraint recurso_tecnologias_recurso_tenant_fkey
    foreign key (empresa_id, recurso_produtivo_id)
    references public.recursos_produtivos(empresa_id, id) on delete restrict,
  constraint recurso_tecnologias_tecnologia_tenant_fkey
    foreign key (empresa_id, tecnologia_id)
    references public.tecnologias(empresa_id, id) on delete restrict,
  constraint recurso_tecnologias_empresa_id_id_uniq unique (empresa_id, id),
  constraint recurso_tecnologias_relacao_uniq
    unique (empresa_id, recurso_produtivo_id, tecnologia_id),
  constraint recurso_tecnologias_delete_chk check ((deleted_at is null) = (deleted_by is null))
);

create index configuracoes_empresa_empresa_idx on public.configuracoes_empresa (empresa_id);
create index numeracao_configuracoes_empresa_idx on public.numeracao_configuracoes (empresa_id);
create index grupos_tecnologias_empresa_idx on public.grupos_tecnologias (empresa_id);
create index tecnologias_grupo_idx on public.tecnologias (empresa_id, grupo_tecnologia_id);
create index grupos_recursos_empresa_idx on public.grupos_recursos (empresa_id);
create index recursos_produtivos_grupo_idx on public.recursos_produtivos (empresa_id, grupo_recurso_id);
create index colaboradores_empresa_idx on public.colaboradores (empresa_id);
create index colaborador_tecnologias_tecnologia_idx on public.colaborador_tecnologias (empresa_id, tecnologia_id);
create index recurso_tecnologias_tecnologia_idx on public.recurso_tecnologias (empresa_id, tecnologia_id);

do $triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'configuracoes_empresa', 'numeracao_configuracoes',
    'grupos_tecnologias', 'tecnologias',
    'grupos_recursos', 'recursos_produtivos', 'colaboradores',
    'colaborador_tecnologias', 'recurso_tecnologias'
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

create or replace function public.gerar_numero_entidade(
  p_entidade text,
  p_ano integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_empresa_id uuid;
  v_config public.numeracao_configuracoes%rowtype;
  v_ano smallint;
  v_numero text;
begin
  v_empresa_id := public.empresa_atual_id();

  if v_empresa_id is null then
    raise exception 'Contexto empresarial ativo não encontrado.';
  end if;

  if not public.usuario_tem_permissao('admin.numeracao.gerar') then
    raise exception 'Usuário sem permissão para gerar numeração.' using errcode = '42501';
  end if;

  if nullif(btrim(p_entidade), '') is null then
    raise exception 'Entidade da numeração é obrigatória.';
  end if;

  select *
    into v_config
    from public.numeracao_configuracoes
   where empresa_id = v_empresa_id
     and entidade = lower(btrim(p_entidade))
     and ativo = true
     and deleted_at is null
   for update;

  if not found then
    raise exception 'Configuração de numeração não encontrada para a entidade %.', p_entidade;
  end if;

  if v_config.usar_ano then
    if p_ano is not null and p_ano not between 2000 and 9999 then
      raise exception 'Ano inválido para numeração: %.', p_ano;
    end if;
    v_ano := coalesce(p_ano::smallint, extract(year from current_date)::smallint);
    if v_config.ano is distinct from v_ano then
      v_config.sequencia_atual := 0;
    end if;
  else
    if p_ano is not null then
      raise exception 'A entidade % não utiliza ano.', p_entidade;
    end if;
    v_ano := null;
  end if;

  v_config.sequencia_atual := v_config.sequencia_atual + 1;

  update public.numeracao_configuracoes
     set ano = v_ano,
         sequencia_atual = v_config.sequencia_atual
   where id = v_config.id;

  v_numero := v_config.prefixo
    || case when v_config.usar_ano then v_ano::text else '' end
    || lpad(v_config.sequencia_atual::text, v_config.tamanho_sequencia, '0');

  return v_numero;
end;
$function$;

revoke all on function public.gerar_numero_entidade(text, integer) from public;
grant execute on function public.gerar_numero_entidade(text, integer)
  to authenticated, service_role;

do $security$
declare
  v_table text;
begin
  foreach v_table in array array[
    'configuracoes_empresa', 'numeracao_configuracoes',
    'grupos_tecnologias', 'tecnologias',
    'grupos_recursos', 'recursos_produtivos', 'colaboradores',
    'colaborador_tecnologias', 'recurso_tecnologias'
  ]
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant select, insert, update on table public.%I to authenticated', v_table);
    execute format('grant all on table public.%I to service_role', v_table);
    execute format('alter table public.%I enable row level security', v_table);
  end loop;
end
$security$;

create policy configuracoes_empresa_select on public.configuracoes_empresa for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy configuracoes_empresa_insert on public.configuracoes_empresa for insert to authenticated
with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid() and public.usuario_tem_permissao('admin.configuracoes.gerenciar'));
create policy configuracoes_empresa_update on public.configuracoes_empresa for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.configuracoes.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.configuracoes.gerenciar'));

create policy numeracao_configuracoes_select on public.numeracao_configuracoes for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy numeracao_configuracoes_insert on public.numeracao_configuracoes for insert to authenticated
with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid() and public.usuario_tem_permissao('admin.numeracao.gerenciar'));
create policy numeracao_configuracoes_update on public.numeracao_configuracoes for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.numeracao.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.numeracao.gerenciar'));

create policy grupos_tecnologias_select on public.grupos_tecnologias for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy grupos_tecnologias_insert on public.grupos_tecnologias for insert to authenticated
with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid() and public.usuario_tem_permissao('admin.tecnologias.gerenciar'));
create policy grupos_tecnologias_update on public.grupos_tecnologias for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.tecnologias.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.tecnologias.gerenciar'));

create policy tecnologias_select on public.tecnologias for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy tecnologias_insert on public.tecnologias for insert to authenticated
with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid() and public.usuario_tem_permissao('admin.tecnologias.gerenciar'));
create policy tecnologias_update on public.tecnologias for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.tecnologias.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.tecnologias.gerenciar'));

create policy grupos_recursos_select on public.grupos_recursos for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy grupos_recursos_insert on public.grupos_recursos for insert to authenticated
with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid() and public.usuario_tem_permissao('admin.recursos.gerenciar'));
create policy grupos_recursos_update on public.grupos_recursos for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.recursos.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.recursos.gerenciar'));

create policy recursos_produtivos_select on public.recursos_produtivos for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy recursos_produtivos_insert on public.recursos_produtivos for insert to authenticated
with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid() and public.usuario_tem_permissao('admin.recursos.gerenciar'));
create policy recursos_produtivos_update on public.recursos_produtivos for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.recursos.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.recursos.gerenciar'));

create policy colaboradores_select on public.colaboradores for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy colaboradores_insert on public.colaboradores for insert to authenticated
with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid() and public.usuario_tem_permissao('admin.colaboradores.gerenciar'));
create policy colaboradores_update on public.colaboradores for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.colaboradores.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.colaboradores.gerenciar'));

create policy colaborador_tecnologias_select on public.colaborador_tecnologias for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy colaborador_tecnologias_insert on public.colaborador_tecnologias for insert to authenticated
with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid() and public.usuario_tem_permissao('admin.colaboradores.gerenciar'));
create policy colaborador_tecnologias_update on public.colaborador_tecnologias for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.colaboradores.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.colaboradores.gerenciar'));

create policy recurso_tecnologias_select on public.recurso_tecnologias for select to authenticated
using (empresa_id = public.empresa_atual_id() and deleted_at is null);
create policy recurso_tecnologias_insert on public.recurso_tecnologias for insert to authenticated
with check (empresa_id = public.empresa_atual_id() and created_by = auth.uid() and public.usuario_tem_permissao('admin.recursos.gerenciar'));
create policy recurso_tecnologias_update on public.recurso_tecnologias for update to authenticated
using (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.recursos.gerenciar'))
with check (empresa_id = public.empresa_atual_id() and public.usuario_tem_permissao('admin.recursos.gerenciar'));

comment on table public.configuracoes_empresa is 'Parâmetros administrativos da empresa, identificados por chave estável.';
comment on table public.numeracao_configuracoes is 'Controle transacional de numeração por empresa e entidade.';
comment on table public.grupos_tecnologias is 'Agrupamento funcional de competências produtivas.';
comment on table public.tecnologias is 'Competências necessárias para executar operações industriais.';
comment on table public.grupos_recursos is 'Agrupamento operacional de recursos produtivos.';
comment on table public.recursos_produtivos is 'Máquinas, equipamentos ou dispositivos produtivos.';
comment on table public.colaboradores is 'Pessoas consideradas no planejamento e execução operacional.';

commit;
