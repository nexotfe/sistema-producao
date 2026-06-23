-- NEXOTFE 1.0 - Baseline SQL
-- Modulo 011: produtos acabados, separacao, expedicao e entrega
-- Dependencias: 001..010

begin;

create table public.produtos_acabados (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  of_id uuid not null, projeto_id uuid not null, projeto_item_id uuid not null, produto_id uuid not null,
  numero_produto_acabado text not null, status text not null default 'aguardando_expedicao',
  quantidade_total numeric(18,6) not null, quantidade_separada numeric(18,6) not null default 0,
  quantidade_expedida numeric(18,6) not null default 0, quantidade_entregue numeric(18,6) not null default 0,
  unidade text not null, observacoes text, idempotency_key text not null,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  constraint produtos_acabados_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint produtos_acabados_of_fkey foreign key(empresa_id,of_id) references public.ordens_fabricacao(empresa_id,id) on delete restrict,
  constraint produtos_acabados_projeto_fkey foreign key(empresa_id,projeto_id) references public.projetos(empresa_id,id) on delete restrict,
  constraint produtos_acabados_projeto_item_fkey foreign key(empresa_id,projeto_item_id) references public.projeto_itens(empresa_id,id) on delete restrict,
  constraint produtos_acabados_produto_fkey foreign key(empresa_id,produto_id) references public.itens_industriais(empresa_id,id) on delete restrict,
  constraint produtos_acabados_empresa_id_id_uniq unique(empresa_id,id),
  constraint produtos_acabados_of_uniq unique(empresa_id,of_id),
  constraint produtos_acabados_numero_uniq unique(empresa_id,numero_produto_acabado),
  constraint produtos_acabados_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint produtos_acabados_status_chk check(status in('aguardando_expedicao','separado','expedido','entregue','cancelado')),
  constraint produtos_acabados_quantidades_chk check(quantidade_total>0 and quantidade_separada>=0 and quantidade_expedida>=0 and quantidade_entregue>=0 and quantidade_entregue<=quantidade_expedida and quantidade_expedida<=quantidade_separada and quantidade_separada<=quantidade_total),
  constraint produtos_acabados_unidade_chk check(btrim(unidade)<>''),
  constraint produtos_acabados_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.produto_acabado_eventos (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null, produto_acabado_id uuid not null,
  estado_anterior text, estado_novo text not null, motivo text,
  ocorrido_em timestamptz not null default now(), ocorrido_por uuid not null references auth.users(id) on delete restrict,
  constraint produto_acabado_eventos_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint produto_acabado_eventos_produto_fkey foreign key(empresa_id,produto_acabado_id) references public.produtos_acabados(empresa_id,id) on delete restrict,
  constraint produto_acabado_eventos_empresa_id_id_uniq unique(empresa_id,id),
  constraint produto_acabado_eventos_anterior_chk check(estado_anterior is null or estado_anterior in('aguardando_expedicao','separado','expedido','entregue','cancelado')),
  constraint produto_acabado_eventos_novo_chk check(estado_novo in('aguardando_expedicao','separado','expedido','entregue','cancelado')),
  constraint produto_acabado_eventos_mudanca_chk check(estado_anterior is null or estado_anterior<>estado_novo)
);

create table public.separacoes_expedicao (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  numero_separacao text not null, projeto_id uuid not null, status text not null default 'aberta',
  observacoes text, idempotency_key text not null,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  constraint separacoes_expedicao_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint separacoes_expedicao_projeto_fkey foreign key(empresa_id,projeto_id) references public.projetos(empresa_id,id) on delete restrict,
  constraint separacoes_expedicao_empresa_id_id_uniq unique(empresa_id,id),
  constraint separacoes_expedicao_numero_uniq unique(empresa_id,numero_separacao),
  constraint separacoes_expedicao_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint separacoes_expedicao_status_chk check(status in('aberta','separada','cancelada')),
  constraint separacoes_expedicao_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.separacao_itens (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  separacao_expedicao_id uuid not null, produto_acabado_id uuid not null,
  produto_id uuid not null, quantidade numeric(18,6) not null, unidade text not null,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  constraint separacao_itens_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint separacao_itens_separacao_fkey foreign key(empresa_id,separacao_expedicao_id) references public.separacoes_expedicao(empresa_id,id) on delete restrict,
  constraint separacao_itens_produto_acabado_fkey foreign key(empresa_id,produto_acabado_id) references public.produtos_acabados(empresa_id,id) on delete restrict,
  constraint separacao_itens_produto_fkey foreign key(empresa_id,produto_id) references public.itens_industriais(empresa_id,id) on delete restrict,
  constraint separacao_itens_empresa_id_id_uniq unique(empresa_id,id),
  constraint separacao_itens_produto_uniq unique(empresa_id,separacao_expedicao_id,produto_acabado_id),
  constraint separacao_itens_quantidade_chk check(quantidade>0),
  constraint separacao_itens_unidade_chk check(btrim(unidade)<>'')
);

create table public.expedicoes (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  numero_expedicao text not null, separacao_expedicao_id uuid not null, projeto_id uuid not null,
  status text not null default 'preparada', transportadora text, documento_transporte text,
  expedida_em timestamptz, observacoes text, idempotency_key text not null,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  constraint expedicoes_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint expedicoes_separacao_fkey foreign key(empresa_id,separacao_expedicao_id) references public.separacoes_expedicao(empresa_id,id) on delete restrict,
  constraint expedicoes_projeto_fkey foreign key(empresa_id,projeto_id) references public.projetos(empresa_id,id) on delete restrict,
  constraint expedicoes_empresa_id_id_uniq unique(empresa_id,id),
  constraint expedicoes_separacao_uniq unique(empresa_id,separacao_expedicao_id),
  constraint expedicoes_numero_uniq unique(empresa_id,numero_expedicao),
  constraint expedicoes_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint expedicoes_status_chk check(status in('preparada','expedida','cancelada')),
  constraint expedicoes_estado_chk check((status='expedida')=(expedida_em is not null) or status='cancelada'),
  constraint expedicoes_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.expedicao_itens (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  expedicao_id uuid not null, separacao_item_id uuid not null, produto_acabado_id uuid not null,
  produto_id uuid not null, quantidade numeric(18,6) not null, unidade text not null,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  constraint expedicao_itens_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint expedicao_itens_expedicao_fkey foreign key(empresa_id,expedicao_id) references public.expedicoes(empresa_id,id) on delete restrict,
  constraint expedicao_itens_separacao_item_fkey foreign key(empresa_id,separacao_item_id) references public.separacao_itens(empresa_id,id) on delete restrict,
  constraint expedicao_itens_produto_acabado_fkey foreign key(empresa_id,produto_acabado_id) references public.produtos_acabados(empresa_id,id) on delete restrict,
  constraint expedicao_itens_produto_fkey foreign key(empresa_id,produto_id) references public.itens_industriais(empresa_id,id) on delete restrict,
  constraint expedicao_itens_empresa_id_id_uniq unique(empresa_id,id),
  constraint expedicao_itens_produto_uniq unique(empresa_id,expedicao_id,produto_acabado_id),
  constraint expedicao_itens_quantidade_chk check(quantidade>0),
  constraint expedicao_itens_unidade_chk check(btrim(unidade)<>'')
);

create table public.entregas (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  numero_entrega text not null, expedicao_id uuid not null, projeto_id uuid not null,
  status text not null default 'confirmada', entregue_em timestamptz not null,
  recebido_por text not null, documento_recebimento text, ocorrencia text, idempotency_key text not null,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  constraint entregas_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint entregas_expedicao_fkey foreign key(empresa_id,expedicao_id) references public.expedicoes(empresa_id,id) on delete restrict,
  constraint entregas_projeto_fkey foreign key(empresa_id,projeto_id) references public.projetos(empresa_id,id) on delete restrict,
  constraint entregas_empresa_id_id_uniq unique(empresa_id,id),
  constraint entregas_expedicao_uniq unique(empresa_id,expedicao_id),
  constraint entregas_numero_uniq unique(empresa_id,numero_entrega),
  constraint entregas_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint entregas_status_chk check(status in('confirmada','confirmada_com_ocorrencia')),
  constraint entregas_recebedor_chk check(btrim(recebido_por)<>''),
  constraint entregas_idempotency_chk check(btrim(idempotency_key)<>'')
);

create index produtos_acabados_projeto_idx on public.produtos_acabados(empresa_id,projeto_id,status);
create index produto_acabado_eventos_produto_idx on public.produto_acabado_eventos(empresa_id,produto_acabado_id,ocorrido_em);
create index separacao_itens_produto_idx on public.separacao_itens(empresa_id,produto_acabado_id);
create index expedicao_itens_produto_idx on public.expedicao_itens(empresa_id,produto_acabado_id);
create index entregas_projeto_idx on public.entregas(empresa_id,projeto_id,entregue_em);

create or replace function public.registrar_evento_produto_acabado() returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if tg_op='INSERT' then insert into public.produto_acabado_eventos(empresa_id,produto_acabado_id,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,new.status,'Criacao do produto acabado',new.created_by);
  elsif new.status is distinct from old.status then insert into public.produto_acabado_eventos(empresa_id,produto_acabado_id,estado_anterior,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,old.status,new.status,nullif(current_setting('app.produto_acabado_motivo',true),''),auth.uid());end if;
  return new;
end $function$;
revoke all on function public.registrar_evento_produto_acabado() from public;
create trigger produtos_acabados_registrar_estado after insert or update of status on public.produtos_acabados for each row execute function public.registrar_evento_produto_acabado();

create or replace function public.registrar_produto_acabado(p_of_id uuid,p_observacoes text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_of public.ordens_fabricacao%rowtype;v_existente public.produtos_acabados%rowtype;v_id uuid;v_num text;
begin
 if not public.usuario_tem_permissao('expedicao.produtos_acabados.registrar') then raise exception 'Usuario sem permissao para registrar produto acabado.' using errcode='42501';end if;
 if nullif(btrim(p_idempotency_key),'') is null then raise exception 'Chave idempotente obrigatoria.';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
 select * into v_existente from public.produtos_acabados where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
 if found then if v_existente.of_id<>p_of_id then raise exception 'Chave idempotente reutilizada com OF diferente.';end if;return v_existente.id;end if;
 select * into v_of from public.ordens_fabricacao where empresa_id=v_empresa and id=p_of_id and status='finalizada' and deleted_at is null for update;
 if not found then raise exception 'OF nao finalizada para produto acabado.';end if;
 if not exists(
   select 1 from public.liberacoes_qualidade l join public.inspecoes_qualidade i on i.empresa_id=l.empresa_id and i.id=l.inspecao_qualidade_id
   where l.empresa_id=v_empresa and l.decisao='liberado' and ((i.tipo='produto' and i.of_id=p_of_id) or (i.tipo='processo' and exists(select 1 from public.operacoes_producao op where op.empresa_id=v_empresa and op.id=i.operacao_producao_id and op.of_id=p_of_id)))
 ) then raise exception 'Produto acabado exige liberacao formal da Qualidade.';end if;
 v_num:=public.gerar_numero_entidade('produto_acabado',extract(year from current_date)::integer);
 insert into public.produtos_acabados(empresa_id,of_id,projeto_id,projeto_item_id,produto_id,numero_produto_acabado,quantidade_total,unidade,observacoes,idempotency_key,created_by)
 values(v_empresa,v_of.id,v_of.projeto_id,v_of.projeto_item_id,v_of.produto_id,v_num,v_of.quantidade_planejada,v_of.unidade,p_observacoes,p_idempotency_key,auth.uid()) returning id into v_id;
 return v_id;
end $function$;

create or replace function public.criar_separacao_expedicao(p_produto_acabado_id uuid,p_quantidade numeric,p_observacoes text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_pa public.produtos_acabados%rowtype;v_existente public.separacoes_expedicao%rowtype;v_item public.separacao_itens%rowtype;v_id uuid;v_num text;v_status text;
begin
 if not public.usuario_tem_permissao('expedicao.separacoes.gerenciar') then raise exception 'Usuario sem permissao para separar.' using errcode='42501';end if;
 if p_quantidade<=0 or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parametros invalidos para separacao.';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
 select * into v_existente from public.separacoes_expedicao where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
 if found then select * into v_item from public.separacao_itens where empresa_id=v_empresa and separacao_expedicao_id=v_existente.id;if v_item.produto_acabado_id<>p_produto_acabado_id or v_item.quantidade<>p_quantidade then raise exception 'Chave idempotente reutilizada com dados diferentes.';end if;return v_existente.id;end if;
 select * into v_pa from public.produtos_acabados where empresa_id=v_empresa and id=p_produto_acabado_id and status in('aguardando_expedicao','separado') for update;
 if not found then raise exception 'Produto acabado indisponivel para separacao.';end if;
 if v_pa.quantidade_total-v_pa.quantidade_separada<p_quantidade then raise exception 'Quantidade disponivel insuficiente para separacao.';end if;
 v_num:=public.gerar_numero_entidade('separacao_expedicao',extract(year from current_date)::integer);
 insert into public.separacoes_expedicao(empresa_id,numero_separacao,projeto_id,observacoes,idempotency_key,created_by) values(v_empresa,v_num,v_pa.projeto_id,p_observacoes,p_idempotency_key,auth.uid()) returning id into v_id;
 insert into public.separacao_itens(empresa_id,separacao_expedicao_id,produto_acabado_id,produto_id,quantidade,unidade,created_by) values(v_empresa,v_id,v_pa.id,v_pa.produto_id,p_quantidade,v_pa.unidade,auth.uid());
 v_status:=case when v_pa.quantidade_separada+p_quantidade=v_pa.quantidade_total then 'separado' else v_pa.status end;
 perform set_config('app.produto_acabado_motivo','Separacao para expedicao',true);
 update public.produtos_acabados set quantidade_separada=quantidade_separada+p_quantidade,status=v_status where id=v_pa.id;
 return v_id;
end $function$;

create or replace function public.confirmar_separacao_expedicao(p_separacao_id uuid,p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_sep public.separacoes_expedicao%rowtype;
begin
 if not public.usuario_tem_permissao('expedicao.separacoes.gerenciar') then raise exception 'Usuario sem permissao para confirmar separacao.' using errcode='42501';end if;
 select * into v_sep from public.separacoes_expedicao where empresa_id=v_empresa and id=p_separacao_id for update;
 if not found then raise exception 'Separacao nao encontrada.';end if;if v_sep.status='separada' then return p_separacao_id;end if;if v_sep.status<>'aberta' then raise exception 'Separacao nao pode ser confirmada.';end if;
 if not exists(select 1 from public.separacao_itens where empresa_id=v_empresa and separacao_expedicao_id=p_separacao_id) then raise exception 'Separacao sem itens.';end if;
 update public.separacoes_expedicao set status='separada',observacoes=coalesce(observacoes||E'\n','')||coalesce(p_motivo,'') where empresa_id=v_empresa and id=p_separacao_id;return p_separacao_id;
end $function$;

create or replace function public.registrar_expedicao(p_separacao_id uuid,p_transportadora text,p_documento text,p_observacoes text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_sep public.separacoes_expedicao%rowtype;v_existente public.expedicoes%rowtype;v_id uuid;v_num text;v_item record;
begin
 if not public.usuario_tem_permissao('expedicao.expedicoes.gerenciar') then raise exception 'Usuario sem permissao para registrar expedicao.' using errcode='42501';end if;
 if nullif(btrim(p_idempotency_key),'') is null then raise exception 'Chave idempotente obrigatoria.';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
 select * into v_existente from public.expedicoes where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
 if found then if v_existente.separacao_expedicao_id<>p_separacao_id or v_existente.transportadora is distinct from p_transportadora or v_existente.documento_transporte is distinct from p_documento then raise exception 'Chave idempotente reutilizada com dados diferentes.';end if;return v_existente.id;end if;
 select * into v_sep from public.separacoes_expedicao where empresa_id=v_empresa and id=p_separacao_id and status='separada' for update;
 if not found then raise exception 'Separacao nao confirmada para expedicao.';end if;
 v_num:=public.gerar_numero_entidade('expedicao',extract(year from current_date)::integer);
 insert into public.expedicoes(empresa_id,numero_expedicao,separacao_expedicao_id,projeto_id,transportadora,documento_transporte,observacoes,idempotency_key,created_by) values(v_empresa,v_num,p_separacao_id,v_sep.projeto_id,nullif(btrim(p_transportadora),''),nullif(btrim(p_documento),''),p_observacoes,p_idempotency_key,auth.uid()) returning id into v_id;
 for v_item in select * from public.separacao_itens where empresa_id=v_empresa and separacao_expedicao_id=p_separacao_id loop
   insert into public.expedicao_itens(empresa_id,expedicao_id,separacao_item_id,produto_acabado_id,produto_id,quantidade,unidade,created_by) values(v_empresa,v_id,v_item.id,v_item.produto_acabado_id,v_item.produto_id,v_item.quantidade,v_item.unidade,auth.uid());
 end loop;
 return v_id;
end $function$;

create or replace function public.confirmar_expedicao(p_expedicao_id uuid,p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_exp public.expedicoes%rowtype;v_item record;v_pa public.produtos_acabados%rowtype;v_status text;
begin
 if not public.usuario_tem_permissao('expedicao.expedicoes.gerenciar') then raise exception 'Usuario sem permissao para confirmar expedicao.' using errcode='42501';end if;
 select * into v_exp from public.expedicoes where empresa_id=v_empresa and id=p_expedicao_id for update;
 if not found then raise exception 'Expedicao nao encontrada.';end if;if v_exp.status='expedida' then return p_expedicao_id;end if;if v_exp.status<>'preparada' then raise exception 'Expedicao nao pode ser confirmada.';end if;
 for v_item in select * from public.expedicao_itens where empresa_id=v_empresa and expedicao_id=p_expedicao_id loop
   select * into v_pa from public.produtos_acabados where empresa_id=v_empresa and id=v_item.produto_acabado_id for update;
   if v_pa.quantidade_separada-v_pa.quantidade_expedida<v_item.quantidade then raise exception 'Quantidade separada insuficiente para expedicao.';end if;
   v_status:=case when v_pa.quantidade_expedida+v_item.quantidade=v_pa.quantidade_total then 'expedido' else v_pa.status end;
   perform set_config('app.produto_acabado_motivo',coalesce(p_motivo,'Expedicao confirmada'),true);
   update public.produtos_acabados set quantidade_expedida=quantidade_expedida+v_item.quantidade,status=v_status where id=v_pa.id;
 end loop;
 update public.expedicoes set status='expedida',expedida_em=now() where empresa_id=v_empresa and id=p_expedicao_id;return p_expedicao_id;
end $function$;

create or replace function public.registrar_entrega(p_expedicao_id uuid,p_recebido_por text,p_documento text,p_ocorrencia text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_exp public.expedicoes%rowtype;v_existente public.entregas%rowtype;v_id uuid;v_num text;v_item record;v_pa public.produtos_acabados%rowtype;v_status text;
begin
 if not public.usuario_tem_permissao('expedicao.entregas.registrar') then raise exception 'Usuario sem permissao para registrar entrega.' using errcode='42501';end if;
 if nullif(btrim(p_recebido_por),'') is null or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parametros invalidos para entrega.';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
 select * into v_existente from public.entregas where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
 if found then if v_existente.expedicao_id<>p_expedicao_id or v_existente.recebido_por<>p_recebido_por then raise exception 'Chave idempotente reutilizada com dados diferentes.';end if;return v_existente.id;end if;
 select * into v_exp from public.expedicoes where empresa_id=v_empresa and id=p_expedicao_id and status='expedida' for update;
 if not found then raise exception 'Expedicao nao expedida para entrega.';end if;
 v_num:=public.gerar_numero_entidade('entrega',extract(year from current_date)::integer);
 insert into public.entregas(empresa_id,numero_entrega,expedicao_id,projeto_id,status,entregue_em,recebido_por,documento_recebimento,ocorrencia,idempotency_key,created_by)
 values(v_empresa,v_num,p_expedicao_id,v_exp.projeto_id,case when nullif(btrim(p_ocorrencia),'') is null then 'confirmada' else 'confirmada_com_ocorrencia' end,now(),p_recebido_por,nullif(btrim(p_documento),''),nullif(btrim(p_ocorrencia),''),p_idempotency_key,auth.uid()) returning id into v_id;
 for v_item in select * from public.expedicao_itens where empresa_id=v_empresa and expedicao_id=p_expedicao_id loop
   select * into v_pa from public.produtos_acabados where empresa_id=v_empresa and id=v_item.produto_acabado_id for update;
   if v_pa.quantidade_expedida-v_pa.quantidade_entregue<v_item.quantidade then raise exception 'Quantidade expedida insuficiente para entrega.';end if;
   v_status:=case when v_pa.quantidade_entregue+v_item.quantidade=v_pa.quantidade_total then 'entregue' else v_pa.status end;
   perform set_config('app.produto_acabado_motivo','Entrega confirmada',true);
   update public.produtos_acabados set quantidade_entregue=quantidade_entregue+v_item.quantidade,status=v_status where id=v_pa.id;
 end loop;
 if not exists(select 1 from public.produtos_acabados where empresa_id=v_empresa and projeto_id=v_exp.projeto_id and status<>'entregue') then perform public.transicionar_projeto(v_exp.projeto_id,'concluido','Entrega confirmada');end if;
 return v_id;
end $function$;

revoke all on function public.registrar_produto_acabado(uuid,text,text),public.criar_separacao_expedicao(uuid,numeric,text,text),public.confirmar_separacao_expedicao(uuid,text),public.registrar_expedicao(uuid,text,text,text,text),public.confirmar_expedicao(uuid,text),public.registrar_entrega(uuid,text,text,text,text) from public;
grant execute on function public.registrar_produto_acabado(uuid,text,text),public.criar_separacao_expedicao(uuid,numeric,text,text),public.confirmar_separacao_expedicao(uuid,text),public.registrar_expedicao(uuid,text,text,text,text),public.confirmar_expedicao(uuid,text),public.registrar_entrega(uuid,text,text,text,text) to authenticated,service_role;

do $security$ declare t text;begin foreach t in array array['produtos_acabados','produto_acabado_eventos','separacoes_expedicao','separacao_itens','expedicoes','expedicao_itens','entregas'] loop execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant all on table public.%I to service_role',t);execute format('alter table public.%I enable row level security',t);execute format('create policy %I on public.%I for select to authenticated using (empresa_id=public.empresa_atual_id())',t||'_select',t);end loop;end $security$;
grant select on public.produtos_acabados,public.produto_acabado_eventos,public.separacoes_expedicao,public.separacao_itens,public.expedicoes,public.expedicao_itens,public.entregas to authenticated;

commit;
