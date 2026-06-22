-- NEXOTFE 1.0 — Baseline SQL
-- Módulo 005: PN, materiais, revisões, BOM e Roteiro de Fabricação
-- Dependências: 001..004

begin;

create table public.itens_industriais (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  pn text not null,
  descricao text not null,
  unidade text not null,
  tipo text not null,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint itens_industriais_empresa_id_id_uniq unique (empresa_id,id),
  constraint itens_industriais_pn_uniq unique (empresa_id,pn),
  constraint itens_industriais_pn_chk check (pn=btrim(pn) and pn<>''),
  constraint itens_industriais_descricao_chk check (btrim(descricao)<>''),
  constraint itens_industriais_unidade_chk check (btrim(unidade)<>''),
  constraint itens_industriais_tipo_chk check (tipo in ('produto','conjunto','subconjunto','componente')),
  constraint itens_industriais_delete_chk check ((deleted_at is null)=(deleted_by is null))
);

create table public.materias_primas (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  codigo text not null, descricao text not null, unidade text not null,
  familia text, tipo_grade text, bitola text,
  especificacao text, observacoes text, ativo boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint materias_primas_empresa_id_id_uniq unique (empresa_id,id),
  constraint materias_primas_codigo_uniq unique (empresa_id,codigo),
  constraint materias_primas_codigo_chk check (codigo=btrim(codigo) and codigo<>''),
  constraint materias_primas_descricao_chk check (btrim(descricao)<>''),
  constraint materias_primas_unidade_chk check (btrim(unidade)<>''),
  constraint materias_primas_delete_chk check ((deleted_at is null)=(deleted_by is null))
);

create table public.revisoes_itens (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null, item_industrial_id uuid not null,
  codigo_revisao text not null, descricao text,
  vigente_desde date, vigente_ate date, aprovada_em timestamptz,
  aprovada_por uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint revisoes_itens_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint revisoes_itens_item_tenant_fkey foreign key(empresa_id,item_industrial_id)
    references public.itens_industriais(empresa_id,id) on delete restrict,
  constraint revisoes_itens_empresa_id_id_uniq unique(empresa_id,id),
  constraint revisoes_itens_item_id_uniq unique(empresa_id,item_industrial_id,id),
  constraint revisoes_itens_codigo_uniq unique(empresa_id,item_industrial_id,codigo_revisao),
  constraint revisoes_itens_codigo_chk check (btrim(codigo_revisao)<>''),
  constraint revisoes_itens_vigencia_chk check (vigente_ate is null or vigente_desde is null or vigente_ate>=vigente_desde),
  constraint revisoes_itens_aprovacao_chk check ((aprovada_em is null)=(aprovada_por is null)),
  constraint revisoes_itens_delete_chk check ((deleted_at is null)=(deleted_by is null))
);

create table public.documentos_tecnicos (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null, item_industrial_id uuid not null,
  codigo text not null, tipo text not null, nome text not null,
  versao text not null, storage_path text not null, sha256 char(64),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint documentos_tecnicos_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint documentos_tecnicos_item_tenant_fkey foreign key(empresa_id,item_industrial_id)
    references public.itens_industriais(empresa_id,id) on delete restrict,
  constraint documentos_tecnicos_empresa_id_id_uniq unique(empresa_id,id),
  constraint documentos_tecnicos_versao_uniq unique(empresa_id,item_industrial_id,codigo,versao),
  constraint documentos_tecnicos_textos_chk check (btrim(codigo)<>'' and btrim(tipo)<>'' and btrim(nome)<>'' and btrim(versao)<>'' and btrim(storage_path)<>''),
  constraint documentos_tecnicos_sha_chk check (sha256 is null or sha256~'^[0-9a-f]{64}$'),
  constraint documentos_tecnicos_delete_chk check ((deleted_at is null)=(deleted_by is null))
);

create unique index revisoes_itens_vigente_uniq
  on public.revisoes_itens(empresa_id,item_industrial_id)
  where aprovada_em is not null and vigente_ate is null and deleted_at is null;

create table public.projeto_itens (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null, projeto_id uuid not null,
  item_industrial_id uuid not null, revisao_item_id uuid,
  quantidade numeric(18,6) not null, observacoes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint projeto_itens_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint projeto_itens_projeto_tenant_fkey foreign key(empresa_id,projeto_id)
    references public.projetos(empresa_id,id) on delete restrict,
  constraint projeto_itens_item_tenant_fkey foreign key(empresa_id,item_industrial_id)
    references public.itens_industriais(empresa_id,id) on delete restrict,
  constraint projeto_itens_revisao_tenant_fkey foreign key(empresa_id,item_industrial_id,revisao_item_id)
    references public.revisoes_itens(empresa_id,item_industrial_id,id) on delete restrict,
  constraint projeto_itens_empresa_id_id_uniq unique(empresa_id,id),
  constraint projeto_itens_relacao_uniq unique(empresa_id,projeto_id,item_industrial_id),
  constraint projeto_itens_quantidade_chk check (quantidade>0),
  constraint projeto_itens_delete_chk check ((deleted_at is null)=(deleted_by is null))
);

create table public.boms (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null, produto_id uuid not null, revisao_item_id uuid,
  versao text not null, descricao text,
  publicada_em timestamptz, publicada_por uuid references auth.users(id) on delete restrict,
  inativada_em timestamptz, inativada_por uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint boms_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint boms_produto_tenant_fkey foreign key(empresa_id,produto_id)
    references public.itens_industriais(empresa_id,id) on delete restrict,
  constraint boms_revisao_tenant_fkey foreign key(empresa_id,produto_id,revisao_item_id)
    references public.revisoes_itens(empresa_id,item_industrial_id,id) on delete restrict,
  constraint boms_empresa_id_id_uniq unique(empresa_id,id),
  constraint boms_versao_uniq unique(empresa_id,produto_id,versao),
  constraint boms_versao_chk check (btrim(versao)<>''),
  constraint boms_publicacao_chk check ((publicada_em is null)=(publicada_por is null)),
  constraint boms_inativacao_chk check ((inativada_em is null)=(inativada_por is null) and (inativada_em is null or publicada_em is not null)),
  constraint boms_delete_chk check ((deleted_at is null)=(deleted_by is null))
);

create table public.bom_itens (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null, bom_id uuid not null,
  materia_prima_id uuid, componente_produto_id uuid,
  quantidade numeric(18,6) not null, unidade text not null,
  nivel smallint not null default 1, ordem integer not null, observacoes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint bom_itens_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint bom_itens_bom_tenant_fkey foreign key(empresa_id,bom_id) references public.boms(empresa_id,id) on delete restrict,
  constraint bom_itens_material_tenant_fkey foreign key(empresa_id,materia_prima_id) references public.materias_primas(empresa_id,id) on delete restrict,
  constraint bom_itens_componente_tenant_fkey foreign key(empresa_id,componente_produto_id) references public.itens_industriais(empresa_id,id) on delete restrict,
  constraint bom_itens_empresa_id_id_uniq unique(empresa_id,id),
  constraint bom_itens_ordem_uniq unique(empresa_id,bom_id,ordem),
  constraint bom_itens_referencia_chk check ((materia_prima_id is not null)::integer+(componente_produto_id is not null)::integer=1),
  constraint bom_itens_quantidade_chk check (quantidade>0),
  constraint bom_itens_unidade_chk check (btrim(unidade)<>''),
  constraint bom_itens_nivel_chk check (nivel>0 and ordem>0),
  constraint bom_itens_delete_chk check ((deleted_at is null)=(deleted_by is null))
);

create table public.roteiros_fabricacao (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null, produto_id uuid not null, revisao_item_id uuid,
  versao text not null, status text not null default 'rascunho',
  descricao text, vigente_desde date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint roteiros_fabricacao_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint roteiros_fabricacao_produto_tenant_fkey foreign key(empresa_id,produto_id) references public.itens_industriais(empresa_id,id) on delete restrict,
  constraint roteiros_fabricacao_revisao_tenant_fkey foreign key(empresa_id,produto_id,revisao_item_id) references public.revisoes_itens(empresa_id,item_industrial_id,id) on delete restrict,
  constraint roteiros_fabricacao_empresa_id_id_uniq unique(empresa_id,id),
  constraint roteiros_fabricacao_versao_uniq unique(empresa_id,produto_id,versao),
  constraint roteiros_fabricacao_versao_chk check (btrim(versao)<>''),
  constraint roteiros_fabricacao_status_chk check (status in ('rascunho','ativo','inativo')),
  constraint roteiros_fabricacao_delete_chk check ((deleted_at is null)=(deleted_by is null))
);

create unique index roteiros_fabricacao_ativo_uniq
  on public.roteiros_fabricacao(empresa_id,produto_id)
  where status='ativo' and deleted_at is null;

create table public.roteiro_materiais (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null, roteiro_id uuid not null, materia_prima_id uuid not null,
  quantidade_unitaria numeric(18,6) not null, unidade text not null,
  dimensoes_operacionais jsonb, ordem integer not null, observacoes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint roteiro_materiais_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint roteiro_materiais_roteiro_tenant_fkey foreign key(empresa_id,roteiro_id) references public.roteiros_fabricacao(empresa_id,id) on delete restrict,
  constraint roteiro_materiais_material_tenant_fkey foreign key(empresa_id,materia_prima_id) references public.materias_primas(empresa_id,id) on delete restrict,
  constraint roteiro_materiais_empresa_id_id_uniq unique(empresa_id,id),
  constraint roteiro_materiais_roteiro_id_uniq unique(empresa_id,roteiro_id,id),
  constraint roteiro_materiais_material_uniq unique(empresa_id,roteiro_id,materia_prima_id),
  constraint roteiro_materiais_ordem_uniq unique(empresa_id,roteiro_id,ordem),
  constraint roteiro_materiais_quantidade_chk check (quantidade_unitaria>0),
  constraint roteiro_materiais_unidade_chk check (btrim(unidade)<>''),
  constraint roteiro_materiais_ordem_chk check (ordem>0),
  constraint roteiro_materiais_delete_chk check ((deleted_at is null)=(deleted_by is null))
);

create table public.roteiro_operacoes (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null, roteiro_id uuid not null, sequencia integer not null,
  descricao_operacional text not null, tipo_operacao text not null,
  tecnologia_id uuid not null, tempo_previsto numeric(18,6) not null,
  unidade_tempo text not null,
  terceirizada boolean generated always as (tipo_operacao='terceirizada') stored,
  observacoes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint roteiro_operacoes_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint roteiro_operacoes_roteiro_tenant_fkey foreign key(empresa_id,roteiro_id) references public.roteiros_fabricacao(empresa_id,id) on delete restrict,
  constraint roteiro_operacoes_tecnologia_tenant_fkey foreign key(empresa_id,tecnologia_id) references public.tecnologias(empresa_id,id) on delete restrict,
  constraint roteiro_operacoes_empresa_id_id_uniq unique(empresa_id,id),
  constraint roteiro_operacoes_roteiro_id_uniq unique(empresa_id,roteiro_id,id),
  constraint roteiro_operacoes_sequencia_uniq unique(empresa_id,roteiro_id,sequencia),
  constraint roteiro_operacoes_sequencia_chk check (sequencia>0),
  constraint roteiro_operacoes_descricao_chk check (btrim(descricao_operacional)<>''),
  constraint roteiro_operacoes_tipo_chk check (tipo_operacao in ('interna','terceirizada','movimentacao','inspecao')),
  constraint roteiro_operacoes_tempo_chk check (tempo_previsto>0 and btrim(unidade_tempo)<>''),
  constraint roteiro_operacoes_delete_chk check ((deleted_at is null)=(deleted_by is null))
);

create table public.roteiro_operacao_materiais (
  id uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null, roteiro_id uuid not null,
  roteiro_operacao_id uuid not null, roteiro_material_id uuid not null,
  observacoes text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint roteiro_operacao_materiais_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint roteiro_operacao_materiais_roteiro_tenant_fkey foreign key(empresa_id,roteiro_id) references public.roteiros_fabricacao(empresa_id,id) on delete restrict,
  constraint roteiro_operacao_materiais_operacao_tenant_fkey foreign key(empresa_id,roteiro_id,roteiro_operacao_id) references public.roteiro_operacoes(empresa_id,roteiro_id,id) on delete restrict,
  constraint roteiro_operacao_materiais_material_tenant_fkey foreign key(empresa_id,roteiro_id,roteiro_material_id) references public.roteiro_materiais(empresa_id,roteiro_id,id) on delete restrict,
  constraint roteiro_operacao_materiais_empresa_id_id_uniq unique(empresa_id,id),
  constraint roteiro_operacao_materiais_roteiro_id_uniq unique(empresa_id,roteiro_id,id),
  constraint roteiro_operacao_materiais_relacao_uniq unique(empresa_id,roteiro_operacao_id,roteiro_material_id),
  constraint roteiro_operacao_materiais_delete_chk check ((deleted_at is null)=(deleted_by is null))
);

create index projeto_itens_projeto_idx on public.projeto_itens(empresa_id,projeto_id);
create index bom_itens_bom_idx on public.bom_itens(empresa_id,bom_id);
create index roteiro_materiais_roteiro_idx on public.roteiro_materiais(empresa_id,roteiro_id);
create index roteiro_operacoes_roteiro_idx on public.roteiro_operacoes(empresa_id,roteiro_id);
create index roteiro_operacao_materiais_material_idx on public.roteiro_operacao_materiais(empresa_id,roteiro_material_id);

do $triggers$
declare v_table text;
begin
  foreach v_table in array array['itens_industriais','materias_primas','revisoes_itens','documentos_tecnicos','projeto_itens','boms','bom_itens','roteiros_fabricacao','roteiro_materiais','roteiro_operacoes','roteiro_operacao_materiais'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',v_table||'_set_updated_at',v_table);
  end loop;
end $triggers$;

create or replace function public.validar_estrutura_engenharia_mutavel()
returns trigger language plpgsql set search_path='' as $function$
declare v_bloqueado boolean; v_unidade text;
begin
  if tg_table_name='bom_itens' then
    select publicada_em is not null into v_bloqueado from public.boms where id=coalesce(new.bom_id,old.bom_id);
    if v_bloqueado then raise exception 'BOM publicada é imutável.'; end if;
    if tg_op<>'DELETE' then
      if new.materia_prima_id is not null then select unidade into v_unidade from public.materias_primas where empresa_id=new.empresa_id and id=new.materia_prima_id;
      else select unidade into v_unidade from public.itens_industriais where empresa_id=new.empresa_id and id=new.componente_produto_id; end if;
      if v_unidade is distinct from new.unidade then raise exception 'Unidade do item da BOM diverge da unidade oficial.'; end if;
    end if;
  elsif tg_table_name='roteiro_materiais' then
    select status<>'rascunho' into v_bloqueado from public.roteiros_fabricacao where id=coalesce(new.roteiro_id,old.roteiro_id);
    if v_bloqueado then raise exception 'Roteiro publicado é imutável.'; end if;
    if tg_op<>'DELETE' then
      select unidade into v_unidade from public.materias_primas where empresa_id=new.empresa_id and id=new.materia_prima_id;
      if v_unidade is distinct from new.unidade then raise exception 'Unidade do material do roteiro diverge da unidade oficial.'; end if;
    end if;
  elsif tg_table_name in ('roteiro_operacoes','roteiro_operacao_materiais') then
    if tg_table_name='roteiro_operacoes' then
      select status<>'rascunho' into v_bloqueado from public.roteiros_fabricacao where id=coalesce(new.roteiro_id,old.roteiro_id);
    else
      select r.status<>'rascunho' into v_bloqueado from public.roteiro_operacoes o join public.roteiros_fabricacao r on r.id=o.roteiro_id where o.id=coalesce(new.roteiro_operacao_id,old.roteiro_operacao_id);
    end if;
    if v_bloqueado then raise exception 'Roteiro publicado é imutável.'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $function$;

revoke all on function public.validar_estrutura_engenharia_mutavel() from public;
create trigger bom_itens_validar_mutabilidade before insert or update or delete on public.bom_itens for each row execute function public.validar_estrutura_engenharia_mutavel();
create trigger roteiro_materiais_validar_mutabilidade before insert or update or delete on public.roteiro_materiais for each row execute function public.validar_estrutura_engenharia_mutavel();
create trigger roteiro_operacoes_validar_mutabilidade before insert or update or delete on public.roteiro_operacoes for each row execute function public.validar_estrutura_engenharia_mutavel();
create trigger roteiro_operacao_materiais_validar_mutabilidade before insert or update or delete on public.roteiro_operacao_materiais for each row execute function public.validar_estrutura_engenharia_mutavel();

create or replace function public.publicar_bom(p_bom_id uuid)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_bom public.boms%rowtype;
begin
  if not public.usuario_tem_permissao('engenharia.boms.publicar') then raise exception 'Usuário sem permissão para publicar BOM.' using errcode='42501'; end if;
  select * into v_bom from public.boms where empresa_id=v_empresa and id=p_bom_id and deleted_at is null for update;
  if not found then raise exception 'BOM não encontrada.'; end if;
  if v_bom.publicada_em is not null then return v_bom.id; end if;
  if not exists(select 1 from public.bom_itens where empresa_id=v_empresa and bom_id=p_bom_id and deleted_at is null) then raise exception 'BOM sem itens não pode ser publicada.'; end if;
  update public.boms set publicada_em=now(),publicada_por=auth.uid() where id=p_bom_id;
  return p_bom_id;
end $function$;

create or replace function public.ativar_roteiro_fabricacao(p_roteiro_id uuid)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_roteiro public.roteiros_fabricacao%rowtype;
begin
  if not public.usuario_tem_permissao('engenharia.roteiros.publicar') then raise exception 'Usuário sem permissão para ativar roteiro.' using errcode='42501'; end if;
  select * into v_roteiro from public.roteiros_fabricacao where empresa_id=v_empresa and id=p_roteiro_id and deleted_at is null for update;
  if not found then raise exception 'Roteiro não encontrado.'; end if;
  if v_roteiro.status='ativo' then return v_roteiro.id; end if;
  if v_roteiro.status<>'rascunho' then raise exception 'Somente roteiro em rascunho pode ser ativado.'; end if;
  if not exists(select 1 from public.roteiro_operacoes where empresa_id=v_empresa and roteiro_id=p_roteiro_id and deleted_at is null) then raise exception 'Roteiro sem operações não pode ser ativado.'; end if;
  update public.roteiros_fabricacao set status='inativo' where empresa_id=v_empresa and produto_id=v_roteiro.produto_id and status='ativo' and id<>p_roteiro_id;
  update public.roteiros_fabricacao set status='ativo',vigente_desde=coalesce(vigente_desde,current_date) where id=p_roteiro_id;
  return p_roteiro_id;
end $function$;

create or replace function public.aprovar_revisao_item(p_revisao_id uuid)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_revisao public.revisoes_itens%rowtype;
begin
  if not public.usuario_tem_permissao('engenharia.revisoes.aprovar') then raise exception 'Usuário sem permissão para aprovar revisão.' using errcode='42501'; end if;
  select * into v_revisao from public.revisoes_itens where empresa_id=v_empresa and id=p_revisao_id and deleted_at is null for update;
  if not found then raise exception 'Revisão não encontrada.'; end if;
  update public.revisoes_itens set vigente_ate=current_date
   where empresa_id=v_empresa and item_industrial_id=v_revisao.item_industrial_id
     and id<>p_revisao_id and aprovada_em is not null and vigente_ate is null;
  update public.revisoes_itens set aprovada_em=coalesce(aprovada_em,now()),aprovada_por=coalesce(aprovada_por,auth.uid()),vigente_desde=coalesce(vigente_desde,current_date)
   where empresa_id=v_empresa and id=p_revisao_id and deleted_at is null;
  return p_revisao_id;
end $function$;

revoke all on function public.publicar_bom(uuid),public.ativar_roteiro_fabricacao(uuid),public.aprovar_revisao_item(uuid) from public;
grant execute on function public.publicar_bom(uuid),public.ativar_roteiro_fabricacao(uuid),public.aprovar_revisao_item(uuid) to authenticated,service_role;

do $security$
declare v record;
begin
  for v in select * from (values
    ('itens_industriais','engenharia.itens.gerenciar'),('materias_primas','engenharia.materiais.gerenciar'),
    ('revisoes_itens','engenharia.revisoes.gerenciar'),('documentos_tecnicos','engenharia.documentos.gerenciar'),
    ('projeto_itens','engenharia.projetos.gerenciar'),('boms','engenharia.boms.gerenciar'),
    ('bom_itens','engenharia.boms.gerenciar'),('roteiros_fabricacao','engenharia.roteiros.gerenciar'),
    ('roteiro_materiais','engenharia.roteiros.gerenciar'),('roteiro_operacoes','engenharia.roteiros.gerenciar'),
    ('roteiro_operacao_materiais','engenharia.roteiros.gerenciar')
  ) x(tabela,permissao) loop
    execute format('revoke all on table public.%I from public,anon,authenticated',v.tabela);
    execute format('grant select,insert,update on table public.%I to authenticated',v.tabela);
    execute format('grant all on table public.%I to service_role',v.tabela);
    execute format('alter table public.%I enable row level security',v.tabela);
    execute format('create policy %I on public.%I for select to authenticated using (empresa_id=public.empresa_atual_id() and deleted_at is null)',v.tabela||'_select',v.tabela);
    execute format('create policy %I on public.%I for insert to authenticated with check (empresa_id=public.empresa_atual_id() and created_by=auth.uid() and public.usuario_tem_permissao(%L))',v.tabela||'_insert',v.tabela,v.permissao);
    execute format('create policy %I on public.%I for update to authenticated using (empresa_id=public.empresa_atual_id() and public.usuario_tem_permissao(%L)) with check (empresa_id=public.empresa_atual_id() and public.usuario_tem_permissao(%L))',v.tabela||'_update',v.tabela,v.permissao,v.permissao);
  end loop;
end $security$;

-- Campos de publicação/aprovação só podem ser alterados pelas RPCs acima.
revoke update on public.boms,public.roteiros_fabricacao,public.revisoes_itens from authenticated;
grant update(descricao,deleted_at,deleted_by) on public.boms to authenticated;
grant update(descricao,deleted_at,deleted_by) on public.roteiros_fabricacao to authenticated;
grant update(codigo_revisao,descricao,vigente_desde,vigente_ate,deleted_at,deleted_by) on public.revisoes_itens to authenticated;

comment on table public.itens_industriais is 'Origem única do Part Number no NEXOTFE.';
comment on table public.boms is 'Composição física versionada; não descreve o processo de fabricação.';
comment on table public.roteiros_fabricacao is 'Processo versionado que define operações, tecnologias, materiais e tempos.';
comment on table public.roteiro_materiais is 'Consumo unitário oficial usado para gerar necessidades da OF.';

commit;
