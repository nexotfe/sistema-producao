-- NEXOTFE 1.0 — Baseline SQL
-- Módulo 006: OF, necessidades, decisões, dependências e programação
-- Reserva será materializada no 007; Requisição no 008.

begin;

create table public.ordens_fabricacao (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  numero_of text not null, projeto_id uuid not null, projeto_item_id uuid not null,
  produto_id uuid not null, bom_id uuid not null, roteiro_id uuid not null,
  tipo text not null default 'normal', status text not null default 'simulacao',
  quantidade_planejada numeric(18,6) not null, unidade text not null,
  data_inicio_planejada date, data_conclusao_planejada date, observacoes text,
  idempotency_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint ordens_fabricacao_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint ordens_fabricacao_projeto_fkey foreign key(empresa_id,projeto_id) references public.projetos(empresa_id,id) on delete restrict,
  constraint ordens_fabricacao_projeto_item_fkey foreign key(empresa_id,projeto_item_id) references public.projeto_itens(empresa_id,id) on delete restrict,
  constraint ordens_fabricacao_produto_fkey foreign key(empresa_id,produto_id) references public.itens_industriais(empresa_id,id) on delete restrict,
  constraint ordens_fabricacao_bom_fkey foreign key(empresa_id,bom_id) references public.boms(empresa_id,id) on delete restrict,
  constraint ordens_fabricacao_roteiro_fkey foreign key(empresa_id,roteiro_id) references public.roteiros_fabricacao(empresa_id,id) on delete restrict,
  constraint ordens_fabricacao_empresa_id_id_uniq unique(empresa_id,id),
  constraint ordens_fabricacao_numero_uniq unique(empresa_id,numero_of),
  constraint ordens_fabricacao_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint ordens_fabricacao_tipo_chk check(tipo in ('normal','reparo','servico')),
  constraint ordens_fabricacao_status_chk check(status in ('simulacao','aguardando_material','pronta_programacao','programada','em_producao','parada','finalizada','cancelada')),
  constraint ordens_fabricacao_quantidade_chk check(quantidade_planejada>0),
  constraint ordens_fabricacao_unidade_chk check(btrim(unidade)<>''),
  constraint ordens_fabricacao_datas_chk check(data_conclusao_planejada is null or data_inicio_planejada is null or data_conclusao_planejada>=data_inicio_planejada),
  constraint ordens_fabricacao_idempotency_chk check(btrim(idempotency_key)<>''),
  constraint ordens_fabricacao_delete_chk check((deleted_at is null)=(deleted_by is null))
);

create table public.of_estado_eventos (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null, of_id uuid not null,
  estado_anterior text, estado_novo text not null, motivo text,
  ocorrido_em timestamptz not null default now(), ocorrido_por uuid not null references auth.users(id) on delete restrict,
  constraint of_estado_eventos_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint of_estado_eventos_of_fkey foreign key(empresa_id,of_id) references public.ordens_fabricacao(empresa_id,id) on delete restrict,
  constraint of_estado_eventos_empresa_id_id_uniq unique(empresa_id,id),
  constraint of_estado_eventos_anterior_chk check(estado_anterior is null or estado_anterior in ('simulacao','aguardando_material','pronta_programacao','programada','em_producao','parada','finalizada','cancelada')),
  constraint of_estado_eventos_novo_chk check(estado_novo in ('simulacao','aguardando_material','pronta_programacao','programada','em_producao','parada','finalizada','cancelada')),
  constraint of_estado_eventos_mudanca_chk check(estado_anterior is null or estado_anterior<>estado_novo)
);

create table public.dependencias_of (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  of_predecessora_id uuid not null, of_sucessora_id uuid not null, motivo text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint dependencias_of_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint dependencias_of_predecessora_fkey foreign key(empresa_id,of_predecessora_id) references public.ordens_fabricacao(empresa_id,id) on delete restrict,
  constraint dependencias_of_sucessora_fkey foreign key(empresa_id,of_sucessora_id) references public.ordens_fabricacao(empresa_id,id) on delete restrict,
  constraint dependencias_of_empresa_id_id_uniq unique(empresa_id,id),
  constraint dependencias_of_relacao_uniq unique(empresa_id,of_predecessora_id,of_sucessora_id),
  constraint dependencias_of_distintas_chk check(of_predecessora_id<>of_sucessora_id),
  constraint dependencias_of_delete_chk check((deleted_at is null)=(deleted_by is null))
);

create table public.programacoes_of (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null, of_id uuid not null,
  revisao integer not null, inicio_planejado timestamptz not null, fim_planejado timestamptz not null,
  observacoes text, idempotency_key text not null, ativa boolean not null default true,
  substituida_em timestamptz, created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  constraint programacoes_of_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint programacoes_of_of_fkey foreign key(empresa_id,of_id) references public.ordens_fabricacao(empresa_id,id) on delete restrict,
  constraint programacoes_of_empresa_id_id_uniq unique(empresa_id,id),
  constraint programacoes_of_revisao_uniq unique(empresa_id,of_id,revisao),
  constraint programacoes_of_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint programacoes_of_datas_chk check(fim_planejado>inicio_planejado),
  constraint programacoes_of_substituicao_chk check((ativa and substituida_em is null) or (not ativa and substituida_em is not null)),
  constraint programacoes_of_idempotency_chk check(btrim(idempotency_key)<>'')
);
create unique index programacoes_of_ativa_uniq on public.programacoes_of(empresa_id,of_id) where ativa;

create table public.necessidades_materiais (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  of_id uuid not null, roteiro_id uuid not null, roteiro_material_id uuid not null,
  roteiro_operacao_material_id uuid, materia_prima_id uuid not null,
  quantidade_unitaria_snapshot numeric(18,6) not null,
  quantidade_of_snapshot numeric(18,6) not null, quantidade_necessaria numeric(18,6) not null,
  unidade_snapshot text not null, data_necessidade date,
  status text not null default 'definir', status_decisao text not null default 'pendente',
  status_atendimento text not null default 'pendente', versao_calculo integer not null,
  calculada_em timestamptz not null default now(),
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  cancelada_em timestamptz, cancelada_por uuid references auth.users(id) on delete restrict,
  constraint necessidades_materiais_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint necessidades_materiais_of_fkey foreign key(empresa_id,of_id) references public.ordens_fabricacao(empresa_id,id) on delete restrict,
  constraint necessidades_materiais_roteiro_fkey foreign key(empresa_id,roteiro_id) references public.roteiros_fabricacao(empresa_id,id) on delete restrict,
  constraint necessidades_materiais_roteiro_material_fkey foreign key(empresa_id,roteiro_id,roteiro_material_id) references public.roteiro_materiais(empresa_id,roteiro_id,id) on delete restrict,
  constraint necessidades_materiais_operacao_material_fkey foreign key(empresa_id,roteiro_id,roteiro_operacao_material_id) references public.roteiro_operacao_materiais(empresa_id,roteiro_id,id) on delete restrict,
  constraint necessidades_materiais_material_fkey foreign key(empresa_id,materia_prima_id) references public.materias_primas(empresa_id,id) on delete restrict,
  constraint necessidades_materiais_empresa_id_id_uniq unique(empresa_id,id),
  constraint necessidades_materiais_of_material_id_uniq unique(empresa_id,of_id,materia_prima_id,id),
  constraint necessidades_materiais_calculo_uniq unique(empresa_id,of_id,roteiro_material_id,versao_calculo),
  constraint necessidades_materiais_quantidades_chk check(quantidade_unitaria_snapshot>0 and quantidade_of_snapshot>0 and quantidade_necessaria=quantidade_unitaria_snapshot*quantidade_of_snapshot),
  constraint necessidades_materiais_unidade_chk check(btrim(unidade_snapshot)<>''),
  constraint necessidades_materiais_versao_chk check(versao_calculo>0),
  constraint necessidades_materiais_status_chk check(status in ('definir','decisao_registrada','atendimento_parcial','atendida','cancelada')),
  constraint necessidades_materiais_decisao_chk check(status_decisao in ('pendente','decidida','cancelada')),
  constraint necessidades_materiais_atendimento_chk check(status_atendimento in ('pendente','parcial','reservado','requisitado','atendido','cancelado')),
  constraint necessidades_materiais_cancelamento_chk check((cancelada_em is null)=(cancelada_por is null))
);

create table public.decisoes_necessidade_material (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  necessidade_material_id uuid not null, tipo_decisao text not null,
  quantidade_estoque numeric(18,6) not null default 0,
  quantidade_compra numeric(18,6) not null default 0,
  justificativa text, revisao integer not null, idempotency_key text not null,
  decidido_em timestamptz not null default now(), decidido_por uuid not null references auth.users(id) on delete restrict,
  cancelada_em timestamptz, cancelada_por uuid references auth.users(id) on delete restrict,
  constraint decisoes_necessidade_material_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint decisoes_necessidade_material_necessidade_fkey foreign key(empresa_id,necessidade_material_id) references public.necessidades_materiais(empresa_id,id) on delete restrict,
  constraint decisoes_necessidade_material_empresa_id_id_uniq unique(empresa_id,id),
  constraint decisoes_necessidade_material_necessidade_id_uniq unique(empresa_id,necessidade_material_id,id),
  constraint decisoes_necessidade_material_revisao_uniq unique(empresa_id,necessidade_material_id,revisao),
  constraint decisoes_necessidade_material_idempotency_uniq unique(empresa_id,necessidade_material_id,idempotency_key),
  constraint decisoes_necessidade_material_tipo_chk check(tipo_decisao in ('estoque','compra','estoque_compra')),
  constraint decisoes_necessidade_material_quantidades_chk check(
    quantidade_estoque>=0 and quantidade_compra>=0 and
    ((tipo_decisao='estoque' and quantidade_estoque>0 and quantidade_compra=0) or
     (tipo_decisao='compra' and quantidade_compra>0 and quantidade_estoque=0) or
     (tipo_decisao='estoque_compra' and quantidade_estoque>0 and quantidade_compra>0))
  ),
  constraint decisoes_necessidade_material_revisao_chk check(revisao>0),
  constraint decisoes_necessidade_material_idempotency_chk check(btrim(idempotency_key)<>''),
  constraint decisoes_necessidade_material_cancelamento_chk check((cancelada_em is null)=(cancelada_por is null))
);

create index ordens_fabricacao_projeto_idx on public.ordens_fabricacao(empresa_id,projeto_id);
create index ordens_fabricacao_status_idx on public.ordens_fabricacao(empresa_id,status);
create index of_estado_eventos_of_idx on public.of_estado_eventos(empresa_id,of_id,ocorrido_em);
create index necessidades_materiais_of_idx on public.necessidades_materiais(empresa_id,of_id,status);
create index decisoes_necessidade_material_necessidade_idx on public.decisoes_necessidade_material(empresa_id,necessidade_material_id,revisao);

create trigger ordens_fabricacao_set_updated_at before update on public.ordens_fabricacao for each row execute function public.set_updated_at();
create trigger dependencias_of_set_updated_at before update on public.dependencias_of for each row execute function public.set_updated_at();

create or replace function public.registrar_evento_estado_of() returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if tg_op='INSERT' then insert into public.of_estado_eventos(empresa_id,of_id,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,new.status,'Criação da OF',new.created_by);
  elsif new.status is distinct from old.status then insert into public.of_estado_eventos(empresa_id,of_id,estado_anterior,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,old.status,new.status,nullif(current_setting('app.of_transicao_motivo',true),''),auth.uid()); end if;
  return new;
end $function$;
revoke all on function public.registrar_evento_estado_of() from public;
create trigger ordens_fabricacao_registrar_estado after insert or update of status on public.ordens_fabricacao for each row execute function public.registrar_evento_estado_of();

create or replace function public.validar_dependencia_of_sem_ciclo() returns trigger language plpgsql set search_path='' as $function$
begin
  if exists(
    with recursive caminho(of_id) as (
      select new.of_sucessora_id union
      select d.of_sucessora_id from public.dependencias_of d join caminho c on c.of_id=d.of_predecessora_id
       where d.empresa_id=new.empresa_id and d.deleted_at is null and d.id<>new.id
    ) select 1 from caminho where of_id=new.of_predecessora_id
  ) then raise exception 'Dependência criaria ciclo entre OFs.'; end if;
  return new;
end $function$;
revoke all on function public.validar_dependencia_of_sem_ciclo() from public;
create trigger dependencias_of_sem_ciclo before insert or update on public.dependencias_of for each row execute function public.validar_dependencia_of_sem_ciclo();

create or replace function public.gerar_necessidades_materiais_of(p_of_id uuid,p_versao_calculo integer default 1)
returns integer language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_of public.ordens_fabricacao%rowtype; v_material record; v_count integer:=0; v_operacao_material uuid;
begin
  if not public.usuario_tem_permissao('pcp.necessidades.gerar') then raise exception 'Usuário sem permissão para gerar necessidades.' using errcode='42501'; end if;
  if p_versao_calculo<=0 then raise exception 'Versão de cálculo inválida.'; end if;
  select * into v_of from public.ordens_fabricacao where empresa_id=v_empresa and id=p_of_id and deleted_at is null for update;
  if not found then raise exception 'OF não encontrada.'; end if;
  if v_of.status not in ('simulacao','aguardando_material') then raise exception 'Estado da OF não permite gerar necessidades.'; end if;
  if exists(select 1 from public.necessidades_materiais where empresa_id=v_empresa and of_id=p_of_id and status_decisao<>'pendente' and versao_calculo<>p_versao_calculo) then raise exception 'Necessidades já decididas impedem reprocessamento.'; end if;
  for v_material in select * from public.roteiro_materiais where empresa_id=v_empresa and roteiro_id=v_of.roteiro_id and deleted_at is null order by ordem loop
    select rom.id into v_operacao_material from public.roteiro_operacao_materiais rom join public.roteiro_operacoes ro on ro.id=rom.roteiro_operacao_id
     where rom.empresa_id=v_empresa and rom.roteiro_id=v_of.roteiro_id and rom.roteiro_material_id=v_material.id and rom.deleted_at is null order by ro.sequencia limit 1;
    insert into public.necessidades_materiais(empresa_id,of_id,roteiro_id,roteiro_material_id,roteiro_operacao_material_id,materia_prima_id,quantidade_unitaria_snapshot,quantidade_of_snapshot,quantidade_necessaria,unidade_snapshot,data_necessidade,versao_calculo,created_by)
    values(v_empresa,v_of.id,v_of.roteiro_id,v_material.id,v_operacao_material,v_material.materia_prima_id,v_material.quantidade_unitaria,v_of.quantidade_planejada,v_material.quantidade_unitaria*v_of.quantidade_planejada,v_material.unidade,coalesce(v_of.data_inicio_planejada,current_date),p_versao_calculo,auth.uid())
    on conflict(empresa_id,of_id,roteiro_material_id,versao_calculo) do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end $function$;

create or replace function public.criar_of_com_necessidades(p_projeto_item_id uuid,p_bom_id uuid,p_roteiro_id uuid,p_quantidade numeric,p_data_inicio date,p_data_conclusao date,p_tipo text,p_observacoes text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_existente public.ordens_fabricacao%rowtype; v_item record; v_bom public.boms%rowtype; v_roteiro public.roteiros_fabricacao%rowtype; v_of_id uuid; v_numero text;
begin
  if not public.usuario_tem_permissao('pcp.of.criar') then raise exception 'Usuário sem permissão para criar OF.' using errcode='42501'; end if;
  if nullif(btrim(p_idempotency_key),'') is null or p_quantidade<=0 then raise exception 'Parâmetros inválidos para criação da OF.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
  select * into v_existente from public.ordens_fabricacao where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
  if found then
    if v_existente.projeto_item_id<>p_projeto_item_id or v_existente.bom_id<>p_bom_id or v_existente.roteiro_id<>p_roteiro_id or v_existente.quantidade_planejada<>p_quantidade then raise exception 'Chave de idempotência já usada com conteúdo diferente.'; end if;
    return v_existente.id;
  end if;
  select pi.projeto_id,pi.item_industrial_id,pi.revisao_item_id,i.unidade,p.status into v_item
    from public.projeto_itens pi join public.itens_industriais i on i.empresa_id=pi.empresa_id and i.id=pi.item_industrial_id join public.projetos p on p.empresa_id=pi.empresa_id and p.id=pi.projeto_id
   where pi.empresa_id=v_empresa and pi.id=p_projeto_item_id and pi.deleted_at is null and i.deleted_at is null and p.deleted_at is null;
  if not found or v_item.status not in ('aprovado','em_planejamento','em_producao') then raise exception 'Item/projeto não está liberado para OF.'; end if;
  select * into v_bom from public.boms where empresa_id=v_empresa and id=p_bom_id and produto_id=v_item.item_industrial_id and publicada_em is not null and inativada_em is null and deleted_at is null;
  if not found then raise exception 'BOM publicada não encontrada para o PN.'; end if;
  select * into v_roteiro from public.roteiros_fabricacao where empresa_id=v_empresa and id=p_roteiro_id and produto_id=v_item.item_industrial_id and status='ativo' and deleted_at is null;
  if not found then raise exception 'Roteiro ativo não encontrado para o PN.'; end if;
  if v_item.revisao_item_id is not null and (v_bom.revisao_item_id is distinct from v_item.revisao_item_id or v_roteiro.revisao_item_id is distinct from v_item.revisao_item_id) then raise exception 'BOM/Roteiro não correspondem à revisão do item do projeto.'; end if;
  v_numero:=public.gerar_numero_entidade('of',extract(year from current_date)::integer);
  insert into public.ordens_fabricacao(empresa_id,numero_of,projeto_id,projeto_item_id,produto_id,bom_id,roteiro_id,tipo,quantidade_planejada,unidade,data_inicio_planejada,data_conclusao_planejada,observacoes,idempotency_key,created_by)
  values(v_empresa,v_numero,v_item.projeto_id,p_projeto_item_id,v_item.item_industrial_id,p_bom_id,p_roteiro_id,coalesce(p_tipo,'normal'),p_quantidade,v_item.unidade,p_data_inicio,p_data_conclusao,p_observacoes,p_idempotency_key,auth.uid()) returning id into v_of_id;
  perform public.gerar_necessidades_materiais_of(v_of_id,1);
  return v_of_id;
end $function$;

create or replace function public.transicionar_of(p_of_id uuid,p_estado_novo text,p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_of public.ordens_fabricacao%rowtype; v_ok boolean:=false; v_perm text;
begin
  select * into v_of from public.ordens_fabricacao where empresa_id=v_empresa and id=p_of_id and deleted_at is null for update;
  if not found then raise exception 'OF não encontrada.'; end if;
  if v_of.status=p_estado_novo then return p_of_id; end if;
  v_perm:=case when p_estado_novo in('aguardando_material','pronta_programacao','programada','cancelada') then 'pcp.of.transicionar' when p_estado_novo in('em_producao','parada','finalizada') then 'producao.of.transicionar' end;
  if v_perm is null or not public.usuario_tem_permissao(v_perm) then raise exception 'Usuário sem permissão para transicionar OF.' using errcode='42501'; end if;
  if p_estado_novo='pronta_programacao' and exists(select 1 from public.necessidades_materiais where empresa_id=v_empresa and of_id=p_of_id and status<>'atendida') then raise exception 'OF possui necessidades não atendidas.'; end if;
  v_ok:=case v_of.status when 'simulacao' then p_estado_novo in('aguardando_material','cancelada') when 'aguardando_material' then p_estado_novo in('pronta_programacao','cancelada') when 'pronta_programacao' then p_estado_novo in('programada','aguardando_material','cancelada') when 'programada' then p_estado_novo in('em_producao','pronta_programacao','cancelada') when 'em_producao' then p_estado_novo in('parada','finalizada','cancelada') when 'parada' then p_estado_novo in('em_producao','cancelada') else false end;
  if not v_ok then raise exception 'Transição inválida de OF: % → %.',v_of.status,p_estado_novo; end if;
  perform set_config('app.of_transicao_motivo',coalesce(p_motivo,''),true);
  update public.ordens_fabricacao set status=p_estado_novo where id=p_of_id;
  return p_of_id;
end $function$;

create or replace function public.programar_of(p_of_id uuid,p_inicio timestamptz,p_fim timestamptz,p_observacoes text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_of public.ordens_fabricacao%rowtype; v_existente public.programacoes_of%rowtype; v_revisao integer; v_id uuid;
begin
  if not public.usuario_tem_permissao('pcp.programacao.gerenciar') then raise exception 'Usuário sem permissão para programar OF.' using errcode='42501'; end if;
  if p_fim<=p_inicio or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para programação.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
  select * into v_existente from public.programacoes_of where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
  if found then
    if v_existente.of_id<>p_of_id or v_existente.inicio_planejado<>p_inicio or v_existente.fim_planejado<>p_fim then raise exception 'Chave de idempotência já usada com conteúdo diferente.'; end if;
    return v_existente.id;
  end if;
  select * into v_of from public.ordens_fabricacao where empresa_id=v_empresa and id=p_of_id and deleted_at is null for update;
  if not found or v_of.status not in('pronta_programacao','programada') then raise exception 'OF não está pronta para programação.'; end if;
  select coalesce(max(revisao),0)+1 into v_revisao from public.programacoes_of where empresa_id=v_empresa and of_id=p_of_id;
  update public.programacoes_of set ativa=false,substituida_em=now() where empresa_id=v_empresa and of_id=p_of_id and ativa;
  insert into public.programacoes_of(empresa_id,of_id,revisao,inicio_planejado,fim_planejado,observacoes,idempotency_key,created_by)
  values(v_empresa,p_of_id,v_revisao,p_inicio,p_fim,p_observacoes,p_idempotency_key,auth.uid()) returning id into v_id;
  if v_of.status='pronta_programacao' then
    perform set_config('app.of_transicao_motivo','OF inserida na programação',true);
    update public.ordens_fabricacao set status='programada' where id=p_of_id;
  end if;
  return v_id;
end $function$;

revoke all on function public.gerar_necessidades_materiais_of(uuid,integer),public.criar_of_com_necessidades(uuid,uuid,uuid,numeric,date,date,text,text,text),public.transicionar_of(uuid,text,text),public.programar_of(uuid,timestamptz,timestamptz,text,text) from public;
grant execute on function public.gerar_necessidades_materiais_of(uuid,integer),public.criar_of_com_necessidades(uuid,uuid,uuid,numeric,date,date,text,text,text),public.transicionar_of(uuid,text,text),public.programar_of(uuid,timestamptz,timestamptz,text,text) to authenticated,service_role;

do $security$ declare v_table text; begin
  foreach v_table in array array['ordens_fabricacao','of_estado_eventos','dependencias_of','programacoes_of','necessidades_materiais','decisoes_necessidade_material'] loop
    execute format('revoke all on table public.%I from public,anon,authenticated',v_table); execute format('grant all on table public.%I to service_role',v_table); execute format('alter table public.%I enable row level security',v_table);
    execute format('create policy %I on public.%I for select to authenticated using (empresa_id=public.empresa_atual_id())',v_table||'_select',v_table);
  end loop;
end $security$;
grant insert,update on public.dependencias_of to authenticated;
create policy dependencias_of_insert on public.dependencias_of for insert to authenticated with check(empresa_id=public.empresa_atual_id() and created_by=auth.uid() and public.usuario_tem_permissao('pcp.dependencias.gerenciar'));
create policy dependencias_of_update on public.dependencias_of for update to authenticated using(empresa_id=public.empresa_atual_id() and public.usuario_tem_permissao('pcp.dependencias.gerenciar')) with check(empresa_id=public.empresa_atual_id() and public.usuario_tem_permissao('pcp.dependencias.gerenciar'));
grant select on public.ordens_fabricacao,public.of_estado_eventos,public.dependencias_of,public.programacoes_of,public.necessidades_materiais,public.decisoes_necessidade_material to authenticated;

comment on table public.ordens_fabricacao is 'Organiza a fabricação e congela BOM, Roteiro, revisão e quantidade utilizados.';
comment on table public.necessidades_materiais is 'Demanda calculada do Roteiro × quantidade da OF; nasce aguardando decisão humana.';
comment on table public.decisoes_necessidade_material is 'Histórico da decisão humana do PCP; materialização ocorrerá atomicamente após módulos 007 e 008.';

commit;
