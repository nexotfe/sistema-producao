-- NEXOTFE 1.0 — Baseline SQL
-- Módulo 009: OPs, alocações, apontamentos e serviços terceirizados
-- Dependências: 001..008

begin;

create table public.operacoes_producao (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  numero_op text not null, of_id uuid not null, roteiro_id uuid not null, roteiro_operacao_id uuid not null,
  sequencia_snapshot integer not null, descricao_snapshot text not null,
  tipo_operacao_snapshot text not null, tecnologia_id uuid not null,
  tempo_planejado_snapshot numeric(18,6) not null, unidade_tempo_snapshot text not null,
  quantidade_planejada_snapshot numeric(18,6) not null, unidade_quantidade_snapshot text not null,
  status text not null default 'aguardando', iniciada_em timestamptz, concluida_em timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  constraint operacoes_producao_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint operacoes_producao_of_fkey foreign key(empresa_id,of_id) references public.ordens_fabricacao(empresa_id,id) on delete restrict,
  constraint operacoes_producao_roteiro_operacao_fkey foreign key(empresa_id,roteiro_id,roteiro_operacao_id) references public.roteiro_operacoes(empresa_id,roteiro_id,id) on delete restrict,
  constraint operacoes_producao_tecnologia_fkey foreign key(empresa_id,tecnologia_id) references public.tecnologias(empresa_id,id) on delete restrict,
  constraint operacoes_producao_empresa_id_id_uniq unique(empresa_id,id),
  constraint operacoes_producao_numero_uniq unique(empresa_id,numero_op),
  constraint operacoes_producao_origem_uniq unique(empresa_id,of_id,roteiro_operacao_id),
  constraint operacoes_producao_of_seq_uniq unique(empresa_id,of_id,sequencia_snapshot),
  constraint operacoes_producao_sequencia_chk check(sequencia_snapshot>0),
  constraint operacoes_producao_descricao_chk check(btrim(descricao_snapshot)<>''),
  constraint operacoes_producao_tipo_chk check(tipo_operacao_snapshot in('interna','terceirizada','movimentacao','inspecao')),
  constraint operacoes_producao_tempo_chk check(tempo_planejado_snapshot>0 and btrim(unidade_tempo_snapshot)<>''),
  constraint operacoes_producao_quantidade_chk check(quantidade_planejada_snapshot>0 and btrim(unidade_quantidade_snapshot)<>''),
  constraint operacoes_producao_status_chk check(status in('aguardando','preparacao','em_execucao','pausada','inspecao','concluida','cancelada')),
  constraint operacoes_producao_execucao_chk check((iniciada_em is null or status in('em_execucao','pausada','inspecao','concluida','cancelada')) and ((status='concluida')=(concluida_em is not null)))
);

create table public.operacao_producao_eventos (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  operacao_producao_id uuid not null, estado_anterior text, estado_novo text not null,
  motivo text, ocorrido_em timestamptz not null default now(), ocorrido_por uuid not null references auth.users(id) on delete restrict,
  constraint operacao_producao_eventos_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint operacao_producao_eventos_operacao_fkey foreign key(empresa_id,operacao_producao_id) references public.operacoes_producao(empresa_id,id) on delete restrict,
  constraint operacao_producao_eventos_empresa_id_id_uniq unique(empresa_id,id),
  constraint operacao_producao_eventos_anterior_chk check(estado_anterior is null or estado_anterior in('aguardando','preparacao','em_execucao','pausada','inspecao','concluida','cancelada')),
  constraint operacao_producao_eventos_novo_chk check(estado_novo in('aguardando','preparacao','em_execucao','pausada','inspecao','concluida','cancelada')),
  constraint operacao_producao_eventos_mudanca_chk check(estado_anterior is null or estado_anterior<>estado_novo)
);

create table public.operacao_alocacoes (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  operacao_producao_id uuid not null, recurso_produtivo_id uuid, colaborador_id uuid,
  inicio_planejado timestamptz not null, fim_planejado timestamptz not null,
  idempotency_key text not null, ativa boolean not null default true,
  desalocada_em timestamptz, desalocada_por uuid references auth.users(id) on delete restrict,
  motivo_desalocacao text,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  constraint operacao_alocacoes_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint operacao_alocacoes_operacao_fkey foreign key(empresa_id,operacao_producao_id) references public.operacoes_producao(empresa_id,id) on delete restrict,
  constraint operacao_alocacoes_recurso_fkey foreign key(empresa_id,recurso_produtivo_id) references public.recursos_produtivos(empresa_id,id) on delete restrict,
  constraint operacao_alocacoes_colaborador_fkey foreign key(empresa_id,colaborador_id) references public.colaboradores(empresa_id,id) on delete restrict,
  constraint operacao_alocacoes_empresa_id_id_uniq unique(empresa_id,id),
  constraint operacao_alocacoes_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint operacao_alocacoes_executor_chk check(recurso_produtivo_id is not null or colaborador_id is not null),
  constraint operacao_alocacoes_datas_chk check(fim_planejado>inicio_planejado),
  constraint operacao_alocacoes_estado_chk check((ativa and desalocada_em is null and desalocada_por is null and motivo_desalocacao is null) or (not ativa and desalocada_em is not null and desalocada_por is not null and nullif(btrim(motivo_desalocacao),'') is not null)),
  constraint operacao_alocacoes_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.apontamentos_producao (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  operacao_producao_id uuid not null, operacao_alocacao_id uuid,
  colaborador_id uuid not null, recurso_produtivo_id uuid,
  inicio_em timestamptz not null, fim_em timestamptz not null,
  duracao_minutos numeric(18,6) not null,
  quantidade_produzida numeric(18,6) not null default 0,
  quantidade_perdida numeric(18,6) not null default 0,
  observacoes text, idempotency_key text not null,
  apontado_em timestamptz not null default now(), apontado_por uuid not null references auth.users(id) on delete restrict,
  constraint apontamentos_producao_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint apontamentos_producao_operacao_fkey foreign key(empresa_id,operacao_producao_id) references public.operacoes_producao(empresa_id,id) on delete restrict,
  constraint apontamentos_producao_alocacao_fkey foreign key(empresa_id,operacao_alocacao_id) references public.operacao_alocacoes(empresa_id,id) on delete restrict,
  constraint apontamentos_producao_colaborador_fkey foreign key(empresa_id,colaborador_id) references public.colaboradores(empresa_id,id) on delete restrict,
  constraint apontamentos_producao_recurso_fkey foreign key(empresa_id,recurso_produtivo_id) references public.recursos_produtivos(empresa_id,id) on delete restrict,
  constraint apontamentos_producao_empresa_id_id_uniq unique(empresa_id,id),
  constraint apontamentos_producao_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint apontamentos_producao_datas_chk check(fim_em>inicio_em),
  constraint apontamentos_producao_duracao_chk check(duracao_minutos>0),
  constraint apontamentos_producao_quantidades_chk check(quantidade_produzida>=0 and quantidade_perdida>=0),
  constraint apontamentos_producao_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.servicos_terceirizados (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  operacao_producao_id uuid not null, fornecedor_id uuid not null,
  requisicao_compra_id uuid, pedido_compra_id uuid,
  especificacao_snapshot text not null, quantidade_snapshot numeric(18,6) not null, unidade_snapshot text not null,
  status text not null default 'planejado', data_prevista_retorno date,
  enviado_em timestamptz, retornado_em timestamptz, aceito_em timestamptz, cancelado_em timestamptz,
  observacoes text, idempotency_key text not null,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  constraint servicos_terceirizados_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint servicos_terceirizados_operacao_fkey foreign key(empresa_id,operacao_producao_id) references public.operacoes_producao(empresa_id,id) on delete restrict,
  constraint servicos_terceirizados_fornecedor_fkey foreign key(empresa_id,fornecedor_id) references public.fornecedores(empresa_id,id) on delete restrict,
  constraint servicos_terceirizados_requisicao_fkey foreign key(empresa_id,requisicao_compra_id) references public.requisicoes_compra(empresa_id,id) on delete restrict,
  constraint servicos_terceirizados_pedido_fkey foreign key(empresa_id,pedido_compra_id) references public.pedidos_compra(empresa_id,id) on delete restrict,
  constraint servicos_terceirizados_empresa_id_id_uniq unique(empresa_id,id),
  constraint servicos_terceirizados_operacao_uniq unique(empresa_id,operacao_producao_id),
  constraint servicos_terceirizados_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint servicos_terceirizados_especificacao_chk check(btrim(especificacao_snapshot)<>''),
  constraint servicos_terceirizados_quantidade_chk check(quantidade_snapshot>0 and btrim(unidade_snapshot)<>''),
  constraint servicos_terceirizados_status_chk check(status in('planejado','enviado','em_execucao','retornado','aceito','cancelado')),
  constraint servicos_terceirizados_datas_chk check((enviado_em is null or status in('enviado','em_execucao','retornado','aceito','cancelado')) and (retornado_em is null or status in('retornado','aceito')) and ((status='aceito')=(aceito_em is not null)) and ((status='cancelado')=(cancelado_em is not null))),
  constraint servicos_terceirizados_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.servico_terceirizado_eventos (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  servico_terceirizado_id uuid not null, estado_anterior text, estado_novo text not null,
  motivo text, ocorrido_em timestamptz not null default now(), ocorrido_por uuid not null references auth.users(id) on delete restrict,
  constraint servico_terceirizado_eventos_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint servico_terceirizado_eventos_servico_fkey foreign key(empresa_id,servico_terceirizado_id) references public.servicos_terceirizados(empresa_id,id) on delete restrict,
  constraint servico_terceirizado_eventos_empresa_id_id_uniq unique(empresa_id,id),
  constraint servico_terceirizado_eventos_anterior_chk check(estado_anterior is null or estado_anterior in('planejado','enviado','em_execucao','retornado','aceito','cancelado')),
  constraint servico_terceirizado_eventos_novo_chk check(estado_novo in('planejado','enviado','em_execucao','retornado','aceito','cancelado')),
  constraint servico_terceirizado_eventos_mudanca_chk check(estado_anterior is null or estado_anterior<>estado_novo)
);

create index operacoes_producao_of_idx on public.operacoes_producao(empresa_id,of_id,sequencia_snapshot);
create index operacao_producao_eventos_idx on public.operacao_producao_eventos(empresa_id,operacao_producao_id,ocorrido_em);
create index operacao_alocacoes_op_idx on public.operacao_alocacoes(empresa_id,operacao_producao_id,ativa);
create index apontamentos_producao_op_idx on public.apontamentos_producao(empresa_id,operacao_producao_id,inicio_em);
create index servicos_terceirizados_fornecedor_idx on public.servicos_terceirizados(empresa_id,fornecedor_id,status);
create index servico_terceirizado_eventos_idx on public.servico_terceirizado_eventos(empresa_id,servico_terceirizado_id,ocorrido_em);

create trigger operacoes_producao_set_updated_at before update on public.operacoes_producao for each row execute function public.set_updated_at();

create or replace function public.registrar_evento_estado_operacao_producao() returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if tg_op='INSERT' then insert into public.operacao_producao_eventos(empresa_id,operacao_producao_id,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,new.status,'Criação da OP',new.created_by);
  elsif new.status is distinct from old.status then insert into public.operacao_producao_eventos(empresa_id,operacao_producao_id,estado_anterior,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,old.status,new.status,nullif(current_setting('app.op_motivo',true),''),auth.uid());end if;
  return new;
end $function$;
revoke all on function public.registrar_evento_estado_operacao_producao() from public;
create trigger operacoes_producao_registrar_estado after insert or update of status on public.operacoes_producao for each row execute function public.registrar_evento_estado_operacao_producao();

create or replace function public.registrar_evento_estado_servico_terceirizado() returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if tg_op='INSERT' then insert into public.servico_terceirizado_eventos(empresa_id,servico_terceirizado_id,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,new.status,'Planejamento do serviço',new.created_by);
  elsif new.status is distinct from old.status then insert into public.servico_terceirizado_eventos(empresa_id,servico_terceirizado_id,estado_anterior,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,old.status,new.status,nullif(current_setting('app.servico_terceiro_motivo',true),''),auth.uid());end if;
  return new;
end $function$;
revoke all on function public.registrar_evento_estado_servico_terceirizado() from public;
create trigger servicos_terceirizados_registrar_estado after insert or update of status on public.servicos_terceirizados for each row execute function public.registrar_evento_estado_servico_terceirizado();

create or replace function public.gerar_operacoes_producao(p_of_id uuid)
returns integer language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_of public.ordens_fabricacao%rowtype;v_ro record;v_existentes integer;v_esperadas integer;v_numero text;v_count integer:=0;
begin
  if not public.usuario_tem_permissao('producao.ops.gerar') then raise exception 'Usuário sem permissão para gerar OPs.' using errcode='42501';end if;
  select * into v_of from public.ordens_fabricacao where empresa_id=v_empresa and id=p_of_id and deleted_at is null for update;
  if not found or v_of.status not in('programada','em_producao') then raise exception 'OF não está liberada para geração de OPs.';end if;
  select count(*) into v_esperadas from public.roteiro_operacoes where empresa_id=v_empresa and roteiro_id=v_of.roteiro_id and deleted_at is null;
  if v_esperadas=0 then raise exception 'Roteiro da OF não possui operações.';end if;
  select count(*) into v_existentes from public.operacoes_producao where empresa_id=v_empresa and of_id=p_of_id;
  if v_existentes>0 then
    if v_existentes<>v_esperadas then raise exception 'Conjunto de OPs da OF está incompleto.';end if;
    return v_existentes;
  end if;
  for v_ro in select * from public.roteiro_operacoes where empresa_id=v_empresa and roteiro_id=v_of.roteiro_id and deleted_at is null order by sequencia loop
    v_numero:=public.gerar_numero_entidade('op',extract(year from current_date)::integer);
    insert into public.operacoes_producao(empresa_id,numero_op,of_id,roteiro_id,roteiro_operacao_id,sequencia_snapshot,descricao_snapshot,tipo_operacao_snapshot,tecnologia_id,tempo_planejado_snapshot,unidade_tempo_snapshot,quantidade_planejada_snapshot,unidade_quantidade_snapshot,created_by)
    values(v_empresa,v_numero,v_of.id,v_of.roteiro_id,v_ro.id,v_ro.sequencia,v_ro.descricao_operacional,v_ro.tipo_operacao,v_ro.tecnologia_id,v_ro.tempo_previsto,v_ro.unidade_tempo,v_of.quantidade_planejada,v_of.unidade,auth.uid());
    v_count:=v_count+1;
  end loop;
  return v_count;
end $function$;

create or replace function public.alocar_operacao_producao(p_operacao_id uuid,p_recurso_id uuid,p_colaborador_id uuid,p_inicio timestamptz,p_fim timestamptz,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_op public.operacoes_producao%rowtype;v_existente public.operacao_alocacoes%rowtype;v_id uuid;
begin
  if not public.usuario_tem_permissao('producao.alocacoes.gerenciar') then raise exception 'Usuário sem permissão para alocar OP.' using errcode='42501';end if;
  if p_recurso_id is null and p_colaborador_id is null or p_fim<=p_inicio or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para alocação.';end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
  select * into v_existente from public.operacao_alocacoes where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
  if found then
    if v_existente.operacao_producao_id<>p_operacao_id or v_existente.recurso_produtivo_id is distinct from p_recurso_id or v_existente.colaborador_id is distinct from p_colaborador_id or v_existente.inicio_planejado<>p_inicio or v_existente.fim_planejado<>p_fim then raise exception 'Chave de idempotência já usada com conteúdo diferente.';end if;
    return v_existente.id;
  end if;
  select * into v_op from public.operacoes_producao where empresa_id=v_empresa and id=p_operacao_id for update;
  if not found or v_op.status not in('aguardando','preparacao') or v_op.tipo_operacao_snapshot='terceirizada' then raise exception 'OP não aceita alocação interna.';end if;
  if p_recurso_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':recurso:'||p_recurso_id::text,0));
    if not exists(select 1 from public.recursos_produtivos r join public.recurso_tecnologias rt on rt.empresa_id=r.empresa_id and rt.recurso_produtivo_id=r.id and rt.tecnologia_id=v_op.tecnologia_id and rt.deleted_at is null where r.empresa_id=v_empresa and r.id=p_recurso_id and r.ativo and r.deleted_at is null) then raise exception 'Recurso não está qualificado para a Tecnologia da OP.';end if;
    if exists(select 1 from public.operacao_alocacoes where empresa_id=v_empresa and recurso_produtivo_id=p_recurso_id and ativa and inicio_planejado<p_fim and fim_planejado>p_inicio) then raise exception 'Recurso já está alocado no período.';end if;
  end if;
  if p_colaborador_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':colaborador:'||p_colaborador_id::text,0));
    if not exists(select 1 from public.colaboradores c join public.colaborador_tecnologias ct on ct.empresa_id=c.empresa_id and ct.colaborador_id=c.id and ct.tecnologia_id=v_op.tecnologia_id and ct.deleted_at is null where c.empresa_id=v_empresa and c.id=p_colaborador_id and c.ativo and c.deleted_at is null) then raise exception 'Colaborador não está qualificado para a Tecnologia da OP.';end if;
    if exists(select 1 from public.operacao_alocacoes where empresa_id=v_empresa and colaborador_id=p_colaborador_id and ativa and inicio_planejado<p_fim and fim_planejado>p_inicio) then raise exception 'Colaborador já está alocado no período.';end if;
  end if;
  insert into public.operacao_alocacoes(empresa_id,operacao_producao_id,recurso_produtivo_id,colaborador_id,inicio_planejado,fim_planejado,idempotency_key,created_by)
  values(v_empresa,p_operacao_id,p_recurso_id,p_colaborador_id,p_inicio,p_fim,p_idempotency_key,auth.uid()) returning id into v_id;
  return v_id;
end $function$;

create or replace function public.desalocar_operacao_producao(p_alocacao_id uuid,p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_aloc public.operacao_alocacoes%rowtype;v_status text;
begin
  if not public.usuario_tem_permissao('producao.alocacoes.gerenciar') then raise exception 'Usuário sem permissão para desalocar OP.' using errcode='42501';end if;
  if nullif(btrim(p_motivo),'') is null then raise exception 'Motivo obrigatório para desalocação.';end if;
  select * into v_aloc from public.operacao_alocacoes where empresa_id=v_empresa and id=p_alocacao_id for update;
  if not found then raise exception 'Alocação não encontrada.';end if;
  if not v_aloc.ativa then return p_alocacao_id;end if;
  select status into v_status from public.operacoes_producao where empresa_id=v_empresa and id=v_aloc.operacao_producao_id;
  if v_status not in('aguardando','preparacao') then raise exception 'Alocação não pode ser removida após início da execução.';end if;
  update public.operacao_alocacoes set ativa=false,desalocada_em=now(),desalocada_por=auth.uid(),motivo_desalocacao=p_motivo where id=p_alocacao_id;
  return p_alocacao_id;
end $function$;

create or replace function public.registrar_apontamento_producao(p_operacao_id uuid,p_alocacao_id uuid,p_inicio timestamptz,p_fim timestamptz,p_quantidade_produzida numeric,p_quantidade_perdida numeric,p_observacoes text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_op public.operacoes_producao%rowtype;v_aloc public.operacao_alocacoes%rowtype;v_existente public.apontamentos_producao%rowtype;v_duracao numeric(18,6);v_id uuid;
begin
  if not public.usuario_tem_permissao('producao.apontamentos.registrar') then raise exception 'Usuário sem permissão para apontar produção.' using errcode='42501';end if;
  if p_fim<=p_inicio or coalesce(p_quantidade_produzida,0)<0 or coalesce(p_quantidade_perdida,0)<0 or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para apontamento.';end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
  select * into v_existente from public.apontamentos_producao where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
  if found then
    if v_existente.operacao_producao_id<>p_operacao_id or v_existente.operacao_alocacao_id is distinct from p_alocacao_id or v_existente.inicio_em<>p_inicio or v_existente.fim_em<>p_fim or v_existente.quantidade_produzida<>coalesce(p_quantidade_produzida,0) or v_existente.quantidade_perdida<>coalesce(p_quantidade_perdida,0) then raise exception 'Chave de idempotência já usada com conteúdo diferente.';end if;
    return v_existente.id;
  end if;
  select * into v_op from public.operacoes_producao where empresa_id=v_empresa and id=p_operacao_id for update;
  if not found or v_op.status<>'em_execucao' or v_op.tipo_operacao_snapshot='terceirizada' then raise exception 'OP não está disponível para apontamento interno.';end if;
  select * into v_aloc from public.operacao_alocacoes where empresa_id=v_empresa and id=p_alocacao_id and operacao_producao_id=p_operacao_id and ativa;
  if not found or v_aloc.colaborador_id is null or p_inicio<v_aloc.inicio_planejado or p_fim>v_aloc.fim_planejado then raise exception 'Alocação com executor é obrigatória para o período apontado.';end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':apontamento:'||p_alocacao_id::text,0));
  if exists(select 1 from public.apontamentos_producao where empresa_id=v_empresa and operacao_alocacao_id=p_alocacao_id and inicio_em<p_fim and fim_em>p_inicio) then raise exception 'Período de apontamento sobrepõe registro existente.';end if;
  v_duracao:=extract(epoch from(p_fim-p_inicio))/60;
  insert into public.apontamentos_producao(empresa_id,operacao_producao_id,operacao_alocacao_id,colaborador_id,recurso_produtivo_id,inicio_em,fim_em,duracao_minutos,quantidade_produzida,quantidade_perdida,observacoes,idempotency_key,apontado_por)
  values(v_empresa,p_operacao_id,p_alocacao_id,v_aloc.colaborador_id,v_aloc.recurso_produtivo_id,p_inicio,p_fim,v_duracao,coalesce(p_quantidade_produzida,0),coalesce(p_quantidade_perdida,0),p_observacoes,p_idempotency_key,auth.uid()) returning id into v_id;
  return v_id;
end $function$;

create or replace function public.planejar_servico_terceirizado(p_operacao_id uuid,p_fornecedor_id uuid,p_especificacao text,p_data_prevista_retorno date,p_requisicao_id uuid,p_pedido_id uuid,p_observacoes text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_op public.operacoes_producao%rowtype;v_existente public.servicos_terceirizados%rowtype;v_id uuid;
begin
  if not public.usuario_tem_permissao('producao.terceiros.gerenciar') then raise exception 'Usuário sem permissão para planejar serviço terceirizado.' using errcode='42501';end if;
  if nullif(btrim(p_especificacao),'') is null or p_data_prevista_retorno<current_date or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para serviço terceirizado.';end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
  select * into v_existente from public.servicos_terceirizados where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
  if found then
    if v_existente.operacao_producao_id<>p_operacao_id or v_existente.fornecedor_id<>p_fornecedor_id or v_existente.especificacao_snapshot<>p_especificacao or v_existente.data_prevista_retorno<>p_data_prevista_retorno then raise exception 'Chave de idempotência já usada com conteúdo diferente.';end if;
    return v_existente.id;
  end if;
  select * into v_op from public.operacoes_producao where empresa_id=v_empresa and id=p_operacao_id and status='aguardando' for update;
  if not found or v_op.tipo_operacao_snapshot<>'terceirizada' then raise exception 'OP não é terceirizada ou não está aguardando.';end if;
  if not exists(select 1 from public.fornecedores where empresa_id=v_empresa and id=p_fornecedor_id and situacao='homologado' and ativo and deleted_at is null and tipo in('servico_industrial','multiplo')) then raise exception 'Fornecedor não está homologado para serviço industrial.';end if;
  if p_requisicao_id is not null and not exists(select 1 from public.requisicoes_compra where empresa_id=v_empresa and id=p_requisicao_id and origem='servico_terceirizado') then raise exception 'Requisição não corresponde a serviço terceirizado.';end if;
  if p_pedido_id is not null and not exists(select 1 from public.pedidos_compra where empresa_id=v_empresa and id=p_pedido_id and fornecedor_id=p_fornecedor_id) then raise exception 'Pedido não corresponde ao fornecedor do serviço.';end if;
  insert into public.servicos_terceirizados(empresa_id,operacao_producao_id,fornecedor_id,requisicao_compra_id,pedido_compra_id,especificacao_snapshot,quantidade_snapshot,unidade_snapshot,data_prevista_retorno,observacoes,idempotency_key,created_by)
  values(v_empresa,p_operacao_id,p_fornecedor_id,p_requisicao_id,p_pedido_id,p_especificacao,v_op.quantidade_planejada_snapshot,v_op.unidade_quantidade_snapshot,p_data_prevista_retorno,p_observacoes,p_idempotency_key,auth.uid()) returning id into v_id;
  return v_id;
end $function$;

create or replace function public.transicionar_servico_terceirizado(p_servico_id uuid,p_estado_novo text,p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_servico public.servicos_terceirizados%rowtype;v_ok boolean;
begin
  if not public.usuario_tem_permissao('producao.terceiros.gerenciar') then raise exception 'Usuário sem permissão para transicionar serviço terceirizado.' using errcode='42501';end if;
  if nullif(btrim(p_motivo),'') is null then raise exception 'Motivo obrigatório para transição do serviço.';end if;
  select * into v_servico from public.servicos_terceirizados where empresa_id=v_empresa and id=p_servico_id for update;
  if not found then raise exception 'Serviço terceirizado não encontrado.';end if;
  if v_servico.status=p_estado_novo then return p_servico_id;end if;
  v_ok:=case v_servico.status when 'planejado' then p_estado_novo in('enviado','cancelado') when 'enviado' then p_estado_novo in('em_execucao','cancelado') when 'em_execucao' then p_estado_novo='retornado' when 'retornado' then p_estado_novo='aceito' else false end;
  if not v_ok then raise exception 'Transição inválida do serviço: % → %.',v_servico.status,p_estado_novo;end if;
  perform set_config('app.servico_terceiro_motivo',p_motivo,true);
  update public.servicos_terceirizados set status=p_estado_novo,
    enviado_em=case when p_estado_novo='enviado' then now() else enviado_em end,
    retornado_em=case when p_estado_novo='retornado' then now() else retornado_em end,
    aceito_em=case when p_estado_novo='aceito' then now() else aceito_em end,
    cancelado_em=case when p_estado_novo='cancelado' then now() else cancelado_em end
  where id=p_servico_id;
  return p_servico_id;
end $function$;

create or replace function public.transicionar_operacao_producao(p_operacao_id uuid,p_estado_novo text,p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_op public.operacoes_producao%rowtype;v_of public.ordens_fabricacao%rowtype;v_ok boolean;v_produzida numeric(18,6);v_liberacao text;
begin
  if not public.usuario_tem_permissao(case when p_estado_novo='concluida' then 'qualidade.operacao.liberar' else 'producao.op.transicionar' end) then raise exception 'Usuário sem permissão para transicionar OP.' using errcode='42501';end if;
  select * into v_op from public.operacoes_producao where empresa_id=v_empresa and id=p_operacao_id for update;
  if not found then raise exception 'OP não encontrada.';end if;
  if v_op.status=p_estado_novo then return p_operacao_id;end if;
  v_ok:=case v_op.status when 'aguardando' then p_estado_novo in('preparacao','cancelada') when 'preparacao' then p_estado_novo in('em_execucao','cancelada') when 'em_execucao' then p_estado_novo in('pausada','inspecao','cancelada') when 'pausada' then p_estado_novo in('em_execucao','cancelada') when 'inspecao' then p_estado_novo in('concluida','em_execucao','cancelada') else false end;
  if not v_ok then raise exception 'Transição inválida de OP: % → %.',v_op.status,p_estado_novo;end if;
  if p_estado_novo='preparacao' then
    if v_op.tipo_operacao_snapshot='terceirizada' and not exists(select 1 from public.servicos_terceirizados where empresa_id=v_empresa and operacao_producao_id=v_op.id and status<>'cancelado') then raise exception 'OP terceirizada sem serviço planejado.';end if;
    if v_op.tipo_operacao_snapshot<>'terceirizada' and not exists(select 1 from public.operacao_alocacoes where empresa_id=v_empresa and operacao_producao_id=v_op.id and ativa) then raise exception 'OP interna sem alocação ativa.';end if;
  end if;
  if p_estado_novo='em_execucao' and v_op.status='preparacao' then
    if exists(select 1 from public.operacoes_producao where empresa_id=v_empresa and of_id=v_op.of_id and sequencia_snapshot<v_op.sequencia_snapshot and status<>'concluida') then raise exception 'Operação predecessora ainda não foi concluída.';end if;
    if v_op.tipo_operacao_snapshot='terceirizada' and not exists(select 1 from public.servicos_terceirizados where empresa_id=v_empresa and operacao_producao_id=v_op.id and status in('enviado','em_execucao','retornado','aceito')) then raise exception 'Serviço terceirizado ainda não foi enviado.';end if;
  end if;
  if p_estado_novo='inspecao' then
    if v_op.tipo_operacao_snapshot='terceirizada' then
      if not exists(select 1 from public.servicos_terceirizados where empresa_id=v_empresa and operacao_producao_id=v_op.id and status='aceito') then raise exception 'Serviço terceirizado ainda não foi aceito.';end if;
    else
      select coalesce(sum(quantidade_produzida),0) into v_produzida from public.apontamentos_producao where empresa_id=v_empresa and operacao_producao_id=v_op.id;
      if v_produzida<v_op.quantidade_planejada_snapshot then raise exception 'Quantidade produzida insuficiente para inspeção.';end if;
    end if;
  end if;
  if p_estado_novo='concluida' and to_regclass('public.liberacoes_qualidade') is not null then
    v_liberacao:=nullif(current_setting('app.qualidade_liberacao_id',true),'');
    if v_liberacao is null or not exists(
      select 1 from public.liberacoes_qualidade l join public.inspecoes_qualidade i on i.empresa_id=l.empresa_id and i.id=l.inspecao_qualidade_id
      where l.empresa_id=v_empresa and l.id=v_liberacao::uuid and l.decisao='liberado' and i.tipo='processo' and i.operacao_producao_id=v_op.id
    ) then raise exception 'Conclusão da OP exige liberação formal da Qualidade.';end if;
  end if;
  perform set_config('app.op_motivo',coalesce(p_motivo,''),true);
  update public.operacoes_producao set status=p_estado_novo,iniciada_em=case when p_estado_novo='em_execucao' and iniciada_em is null then now() else iniciada_em end,concluida_em=case when p_estado_novo='concluida' then now() else null end where id=p_operacao_id;
  select * into v_of from public.ordens_fabricacao where empresa_id=v_empresa and id=v_op.of_id for update;
  if p_estado_novo='em_execucao' and v_of.status='programada' then
    perform set_config('app.of_transicao_motivo','Primeira OP iniciada',true);update public.ordens_fabricacao set status='em_producao' where id=v_of.id;
  end if;
  if p_estado_novo='concluida' and not exists(select 1 from public.operacoes_producao where empresa_id=v_empresa and of_id=v_op.of_id and id<>v_op.id and status<>'concluida') then
    perform set_config('app.of_transicao_motivo','Todas as OPs concluídas',true);update public.ordens_fabricacao set status='finalizada' where id=v_of.id;
  end if;
  return p_operacao_id;
end $function$;

revoke all on function public.gerar_operacoes_producao(uuid),public.alocar_operacao_producao(uuid,uuid,uuid,timestamptz,timestamptz,text),public.desalocar_operacao_producao(uuid,text),public.registrar_apontamento_producao(uuid,uuid,timestamptz,timestamptz,numeric,numeric,text,text),public.planejar_servico_terceirizado(uuid,uuid,text,date,uuid,uuid,text,text),public.transicionar_servico_terceirizado(uuid,text,text),public.transicionar_operacao_producao(uuid,text,text) from public;
grant execute on function public.gerar_operacoes_producao(uuid),public.alocar_operacao_producao(uuid,uuid,uuid,timestamptz,timestamptz,text),public.desalocar_operacao_producao(uuid,text),public.registrar_apontamento_producao(uuid,uuid,timestamptz,timestamptz,numeric,numeric,text,text),public.planejar_servico_terceirizado(uuid,uuid,text,date,uuid,uuid,text,text),public.transicionar_servico_terceirizado(uuid,text,text),public.transicionar_operacao_producao(uuid,text,text) to authenticated,service_role;

do $security$ declare v_table text;begin
  foreach v_table in array array['operacoes_producao','operacao_producao_eventos','operacao_alocacoes','apontamentos_producao','servicos_terceirizados','servico_terceirizado_eventos'] loop
    execute format('revoke all on table public.%I from public,anon,authenticated',v_table);execute format('grant all on table public.%I to service_role',v_table);execute format('alter table public.%I enable row level security',v_table);execute format('create policy %I on public.%I for select to authenticated using (empresa_id=public.empresa_atual_id())',v_table||'_select',v_table);
  end loop;
end $security$;
grant select on public.operacoes_producao,public.operacao_producao_eventos,public.operacao_alocacoes,public.apontamentos_producao,public.servicos_terceirizados,public.servico_terceirizado_eventos to authenticated;

comment on table public.operacoes_producao is 'OP executável com snapshot imutável da operação do Roteiro vinculada à OF.';
comment on table public.apontamentos_producao is 'Registro imutável de tempo, quantidade produzida, perda, recurso e executor.';
comment on table public.servicos_terceirizados is 'Execução externa vinculada explicitamente à OP, fornecedor e, quando houver, documentos de compra.';

commit;
