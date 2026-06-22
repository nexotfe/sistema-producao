-- NEXOTFE 1.0 — Baseline SQL
-- Módulo 010: inspeções, certificados, não conformidades e liberações
-- Dependências: 001..009

begin;

create table public.inspecoes_qualidade (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  numero_inspecao text not null, tipo text not null,
  recebimento_item_id uuid, operacao_producao_id uuid, of_id uuid,
  criterio text not null, status text not null default 'aberta', resultado text not null default 'pendente',
  iniciada_em timestamptz, concluida_em timestamptz, observacoes text, idempotency_key text not null,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  constraint inspecoes_qualidade_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint inspecoes_qualidade_recebimento_fkey foreign key(empresa_id,recebimento_item_id) references public.recebimento_itens(empresa_id,id) on delete restrict,
  constraint inspecoes_qualidade_operacao_fkey foreign key(empresa_id,operacao_producao_id) references public.operacoes_producao(empresa_id,id) on delete restrict,
  constraint inspecoes_qualidade_of_fkey foreign key(empresa_id,of_id) references public.ordens_fabricacao(empresa_id,id) on delete restrict,
  constraint inspecoes_qualidade_empresa_id_id_uniq unique(empresa_id,id),
  constraint inspecoes_qualidade_numero_uniq unique(empresa_id,numero_inspecao),
  constraint inspecoes_qualidade_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint inspecoes_qualidade_alvo_chk check((tipo='recebimento' and recebimento_item_id is not null and operacao_producao_id is null and of_id is null) or (tipo='processo' and recebimento_item_id is null and operacao_producao_id is not null and of_id is null) or (tipo='produto' and recebimento_item_id is null and operacao_producao_id is null and of_id is not null)),
  constraint inspecoes_qualidade_criterio_chk check(btrim(criterio)<>''),
  constraint inspecoes_qualidade_status_chk check(status in('aberta','em_execucao','concluida','cancelada')),
  constraint inspecoes_qualidade_resultado_chk check(resultado in('pendente','conforme','nao_conforme')),
  constraint inspecoes_qualidade_estado_chk check((status in('aberta','em_execucao') and resultado='pendente' and concluida_em is null) or (status='concluida' and resultado<>'pendente' and concluida_em is not null) or status='cancelada'),
  constraint inspecoes_qualidade_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.inspecao_qualidade_eventos (
  id uuid primary key default extensions.gen_random_uuid(),empresa_id uuid not null,inspecao_qualidade_id uuid not null,
  estado_anterior text,estado_novo text not null,resultado text,motivo text,
  ocorrido_em timestamptz not null default now(),ocorrido_por uuid not null references auth.users(id) on delete restrict,
  constraint inspecao_qualidade_eventos_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint inspecao_qualidade_eventos_inspecao_fkey foreign key(empresa_id,inspecao_qualidade_id) references public.inspecoes_qualidade(empresa_id,id) on delete restrict,
  constraint inspecao_qualidade_eventos_empresa_id_id_uniq unique(empresa_id,id),
  constraint inspecao_qualidade_eventos_estado_chk check(estado_novo in('aberta','em_execucao','concluida','cancelada')),
  constraint inspecao_qualidade_eventos_resultado_chk check(resultado is null or resultado in('conforme','nao_conforme'))
);

create table public.certificados_qualidade (
  id uuid primary key default extensions.gen_random_uuid(),empresa_id uuid not null,inspecao_qualidade_id uuid not null,
  tipo text not null,numero text,nome_arquivo text not null,storage_path text not null,sha256 char(64),emitido_em date,validade_ate date,
  idempotency_key text not null,
  created_at timestamptz not null default now(),created_by uuid not null references auth.users(id) on delete restrict,
  constraint certificados_qualidade_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint certificados_qualidade_inspecao_fkey foreign key(empresa_id,inspecao_qualidade_id) references public.inspecoes_qualidade(empresa_id,id) on delete restrict,
  constraint certificados_qualidade_empresa_id_id_uniq unique(empresa_id,id),
  constraint certificados_qualidade_storage_uniq unique(empresa_id,storage_path),
  constraint certificados_qualidade_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint certificados_qualidade_tipo_chk check(btrim(tipo)<>''),
  constraint certificados_qualidade_arquivo_chk check(btrim(nome_arquivo)<>'' and btrim(storage_path)<>''),
  constraint certificados_qualidade_hash_chk check(sha256 is null or sha256~'^[0-9a-fA-F]{64}$'),
  constraint certificados_qualidade_validade_chk check(validade_ate is null or emitido_em is null or validade_ate>=emitido_em),
  constraint certificados_qualidade_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.nao_conformidades (
  id uuid primary key default extensions.gen_random_uuid(),empresa_id uuid not null,numero_nc text not null,
  inspecao_qualidade_id uuid not null,severidade text not null,descricao text not null,status text not null default 'aberta',
  disposicao text,responsavel_id uuid references auth.users(id) on delete restrict,prazo date,encerrada_em timestamptz,
  created_at timestamptz not null default now(),created_by uuid not null references auth.users(id) on delete restrict,
  constraint nao_conformidades_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint nao_conformidades_inspecao_fkey foreign key(empresa_id,inspecao_qualidade_id) references public.inspecoes_qualidade(empresa_id,id) on delete restrict,
  constraint nao_conformidades_empresa_id_id_uniq unique(empresa_id,id),
  constraint nao_conformidades_numero_uniq unique(empresa_id,numero_nc),
  constraint nao_conformidades_severidade_chk check(severidade in('baixa','media','alta','critica')),
  constraint nao_conformidades_descricao_chk check(btrim(descricao)<>''),
  constraint nao_conformidades_status_chk check(status in('aberta','em_tratamento','encerrada','cancelada')),
  constraint nao_conformidades_estado_chk check((status='encerrada')=(encerrada_em is not null))
);

create table public.nao_conformidade_eventos (
  id uuid primary key default extensions.gen_random_uuid(),empresa_id uuid not null,nao_conformidade_id uuid not null,
  estado_anterior text,estado_novo text not null,disposicao text,motivo text,
  ocorrido_em timestamptz not null default now(),ocorrido_por uuid not null references auth.users(id) on delete restrict,
  constraint nao_conformidade_eventos_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint nao_conformidade_eventos_nc_fkey foreign key(empresa_id,nao_conformidade_id) references public.nao_conformidades(empresa_id,id) on delete restrict,
  constraint nao_conformidade_eventos_empresa_id_id_uniq unique(empresa_id,id),
  constraint nao_conformidade_eventos_anterior_chk check(estado_anterior is null or estado_anterior in('aberta','em_tratamento','encerrada','cancelada')),
  constraint nao_conformidade_eventos_novo_chk check(estado_novo in('aberta','em_tratamento','encerrada','cancelada')),
  constraint nao_conformidade_eventos_mudanca_chk check(estado_anterior is null or estado_anterior<>estado_novo)
);

create table public.liberacoes_qualidade (
  id uuid primary key default extensions.gen_random_uuid(),empresa_id uuid not null,inspecao_qualidade_id uuid not null,
  decisao text not null,justificativa text not null,idempotency_key text not null,
  decidida_em timestamptz not null default now(),decidida_por uuid not null references auth.users(id) on delete restrict,
  constraint liberacoes_qualidade_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint liberacoes_qualidade_inspecao_fkey foreign key(empresa_id,inspecao_qualidade_id) references public.inspecoes_qualidade(empresa_id,id) on delete restrict,
  constraint liberacoes_qualidade_empresa_id_id_uniq unique(empresa_id,id),
  constraint liberacoes_qualidade_inspecao_uniq unique(empresa_id,inspecao_qualidade_id),
  constraint liberacoes_qualidade_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint liberacoes_qualidade_decisao_chk check(decisao in('liberado','rejeitado','retrabalho')),
  constraint liberacoes_qualidade_justificativa_chk check(btrim(justificativa)<>''),
  constraint liberacoes_qualidade_idempotency_chk check(btrim(idempotency_key)<>'')
);

create index inspecoes_qualidade_alvos_idx on public.inspecoes_qualidade(empresa_id,tipo,status);
create index inspecao_qualidade_eventos_idx on public.inspecao_qualidade_eventos(empresa_id,inspecao_qualidade_id,ocorrido_em);
create index certificados_qualidade_inspecao_idx on public.certificados_qualidade(empresa_id,inspecao_qualidade_id);
create index nao_conformidades_inspecao_idx on public.nao_conformidades(empresa_id,inspecao_qualidade_id,status);
create index nao_conformidade_eventos_idx on public.nao_conformidade_eventos(empresa_id,nao_conformidade_id,ocorrido_em);

create or replace function public.registrar_evento_inspecao_qualidade() returns trigger language plpgsql security definer set search_path='' as $function$
begin
 if tg_op='INSERT' then insert into public.inspecao_qualidade_eventos(empresa_id,inspecao_qualidade_id,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,new.status,'Criação da inspeção',new.created_by);
 elsif new.status is distinct from old.status then insert into public.inspecao_qualidade_eventos(empresa_id,inspecao_qualidade_id,estado_anterior,estado_novo,resultado,motivo,ocorrido_por) values(new.empresa_id,new.id,old.status,new.status,nullif(new.resultado,'pendente'),nullif(current_setting('app.inspecao_motivo',true),''),auth.uid());end if;return new;
end $function$;
revoke all on function public.registrar_evento_inspecao_qualidade() from public;
create trigger inspecoes_qualidade_registrar_evento after insert or update of status on public.inspecoes_qualidade for each row execute function public.registrar_evento_inspecao_qualidade();

create or replace function public.registrar_evento_nao_conformidade() returns trigger language plpgsql security definer set search_path='' as $function$
begin
 if tg_op='INSERT' then insert into public.nao_conformidade_eventos(empresa_id,nao_conformidade_id,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,new.status,'Abertura da não conformidade',new.created_by);
 elsif new.status is distinct from old.status then insert into public.nao_conformidade_eventos(empresa_id,nao_conformidade_id,estado_anterior,estado_novo,disposicao,motivo,ocorrido_por) values(new.empresa_id,new.id,old.status,new.status,new.disposicao,nullif(current_setting('app.nc_motivo',true),''),auth.uid());end if;return new;
end $function$;
revoke all on function public.registrar_evento_nao_conformidade() from public;
create trigger nao_conformidades_registrar_evento after insert or update of status on public.nao_conformidades for each row execute function public.registrar_evento_nao_conformidade();

create or replace function public.abrir_inspecao_qualidade(p_tipo text,p_recebimento_item_id uuid,p_operacao_id uuid,p_of_id uuid,p_criterio text,p_observacoes text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_e public.inspecoes_qualidade%rowtype;v_id uuid;v_num text;
begin
 if not public.usuario_tem_permissao('qualidade.inspecoes.gerenciar') then raise exception 'Usuário sem permissão para abrir inspeção.' using errcode='42501';end if;
 if nullif(btrim(p_criterio),'') is null or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para inspeção.';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));select * into v_e from public.inspecoes_qualidade where empresa_id=v_empresa and idempotency_key=p_idempotency_key;if found then if v_e.tipo is distinct from p_tipo or v_e.recebimento_item_id is distinct from p_recebimento_item_id or v_e.operacao_producao_id is distinct from p_operacao_id or v_e.of_id is distinct from p_of_id or v_e.criterio is distinct from p_criterio then raise exception 'Chave idempotente reutilizada com dados diferentes.';end if;return v_e.id;end if;
 if p_tipo='processo' and not exists(select 1 from public.operacoes_producao where empresa_id=v_empresa and id=p_operacao_id and status='inspecao') then raise exception 'OP não está em inspeção.';end if;
 if p_tipo='recebimento' and not exists(select 1 from public.recebimento_itens i join public.recebimentos r on r.empresa_id=i.empresa_id and r.id=i.recebimento_id where i.empresa_id=v_empresa and i.id=p_recebimento_item_id and r.status='inspecao') then raise exception 'Recebimento não está em inspeção.';end if;
 if p_tipo='produto' and not exists(select 1 from public.ordens_fabricacao where empresa_id=v_empresa and id=p_of_id and status='finalizada') then raise exception 'OF não está finalizada para inspeção de produto.';end if;
 v_num:=public.gerar_numero_entidade('inspecao',extract(year from current_date)::integer);
 insert into public.inspecoes_qualidade(empresa_id,numero_inspecao,tipo,recebimento_item_id,operacao_producao_id,of_id,criterio,observacoes,idempotency_key,created_by) values(v_empresa,v_num,p_tipo,p_recebimento_item_id,p_operacao_id,p_of_id,p_criterio,p_observacoes,p_idempotency_key,auth.uid()) returning id into v_id;return v_id;
end $function$;

create or replace function public.iniciar_inspecao_qualidade(p_inspecao_id uuid,p_motivo text) returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_i public.inspecoes_qualidade%rowtype;begin
 if not public.usuario_tem_permissao('qualidade.inspecoes.gerenciar') then raise exception 'Usuário sem permissão.' using errcode='42501';end if;select * into v_i from public.inspecoes_qualidade where empresa_id=v_empresa and id=p_inspecao_id for update;if not found then raise exception 'Inspeção não encontrada.';end if;if v_i.status='em_execucao' then return p_inspecao_id;end if;if v_i.status<>'aberta' then raise exception 'Inspeção não pode ser iniciada.';end if;perform set_config('app.inspecao_motivo',coalesce(p_motivo,''),true);update public.inspecoes_qualidade set status='em_execucao',iniciada_em=now() where id=p_inspecao_id;return p_inspecao_id;end $function$;

create or replace function public.concluir_inspecao_qualidade(p_inspecao_id uuid,p_resultado text,p_observacoes text,p_nc_severidade text,p_nc_descricao text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_i public.inspecoes_qualidade%rowtype;v_num text;begin
 if not public.usuario_tem_permissao('qualidade.inspecoes.gerenciar') then raise exception 'Usuário sem permissão.' using errcode='42501';end if;if p_resultado not in('conforme','nao_conforme') then raise exception 'Resultado inválido.';end if;
 select * into v_i from public.inspecoes_qualidade where empresa_id=v_empresa and id=p_inspecao_id for update;if not found then raise exception 'Inspeção não encontrada.';end if;if v_i.status='concluida' and v_i.resultado=p_resultado then return p_inspecao_id;end if;if v_i.status<>'em_execucao' then raise exception 'Inspeção não está em execução.';end if;
 if p_resultado='nao_conforme' and (p_nc_severidade not in('baixa','media','alta','critica') or nullif(btrim(p_nc_descricao),'') is null) then raise exception 'NC exige severidade e descrição.';end if;
 perform set_config('app.inspecao_motivo',coalesce(p_observacoes,''),true);update public.inspecoes_qualidade set status='concluida',resultado=p_resultado,concluida_em=now(),observacoes=coalesce(observacoes||E'\n','')||coalesce(p_observacoes,'') where id=p_inspecao_id;
 if p_resultado='nao_conforme' then v_num:=public.gerar_numero_entidade('nao_conformidade',extract(year from current_date)::integer);insert into public.nao_conformidades(empresa_id,numero_nc,inspecao_qualidade_id,severidade,descricao,created_by) values(v_empresa,v_num,p_inspecao_id,p_nc_severidade,p_nc_descricao,auth.uid());end if;return p_inspecao_id;
end $function$;

create or replace function public.cancelar_inspecao_qualidade(p_inspecao_id uuid,p_motivo text) returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_i public.inspecoes_qualidade%rowtype;begin
 if not public.usuario_tem_permissao('qualidade.inspecoes.gerenciar') then raise exception 'Usuário sem permissão.' using errcode='42501';end if;if nullif(btrim(p_motivo),'') is null then raise exception 'Cancelamento exige motivo.';end if;select * into v_i from public.inspecoes_qualidade where empresa_id=v_empresa and id=p_inspecao_id for update;if not found then raise exception 'Inspeção não encontrada.';end if;if v_i.status='cancelada' then return p_inspecao_id;end if;if v_i.status='concluida' then raise exception 'Inspeção concluída não pode ser cancelada.';end if;perform set_config('app.inspecao_motivo',p_motivo,true);update public.inspecoes_qualidade set status='cancelada' where empresa_id=v_empresa and id=p_inspecao_id;return p_inspecao_id;
end $function$;

create or replace function public.registrar_certificado_qualidade(p_inspecao_id uuid,p_tipo text,p_numero text,p_nome_arquivo text,p_storage_path text,p_sha256 text,p_emitido_em date,p_validade_ate date,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_e public.certificados_qualidade%rowtype;v_id uuid;begin
 if not public.usuario_tem_permissao('qualidade.certificados.gerenciar') then raise exception 'Usuário sem permissão.' using errcode='42501';end if;if nullif(btrim(p_tipo),'') is null or nullif(btrim(p_nome_arquivo),'') is null or nullif(btrim(p_storage_path),'') is null or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para certificado.';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));select * into v_e from public.certificados_qualidade where empresa_id=v_empresa and idempotency_key=p_idempotency_key;if found then if v_e.inspecao_qualidade_id is distinct from p_inspecao_id or v_e.tipo is distinct from p_tipo or v_e.nome_arquivo is distinct from p_nome_arquivo or v_e.storage_path is distinct from p_storage_path or v_e.sha256::text is distinct from p_sha256 then raise exception 'Chave idempotente reutilizada com dados diferentes.';end if;return v_e.id;end if;
 if not exists(select 1 from public.inspecoes_qualidade where empresa_id=v_empresa and id=p_inspecao_id and status='concluida') then raise exception 'Certificado exige inspeção concluída.';end if;
 insert into public.certificados_qualidade(empresa_id,inspecao_qualidade_id,tipo,numero,nome_arquivo,storage_path,sha256,emitido_em,validade_ate,idempotency_key,created_by) values(v_empresa,p_inspecao_id,p_tipo,nullif(btrim(p_numero),''),p_nome_arquivo,p_storage_path,p_sha256,p_emitido_em,p_validade_ate,p_idempotency_key,auth.uid()) returning id into v_id;return v_id;
end $function$;

create or replace function public.transicionar_nao_conformidade(p_nc_id uuid,p_novo_status text,p_disposicao text,p_responsavel_id uuid,p_prazo date,p_motivo text) returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_nc public.nao_conformidades%rowtype;begin
 if not public.usuario_tem_permissao('qualidade.nao_conformidades.gerenciar') then raise exception 'Usuário sem permissão.' using errcode='42501';end if;if nullif(btrim(p_motivo),'') is null then raise exception 'Transição exige motivo.';end if;select * into v_nc from public.nao_conformidades where empresa_id=v_empresa and id=p_nc_id for update;if not found then raise exception 'Não conformidade não encontrada.';end if;if v_nc.status=p_novo_status then return p_nc_id;end if;
 if not ((v_nc.status='aberta' and p_novo_status in('em_tratamento','cancelada')) or (v_nc.status='em_tratamento' and p_novo_status in('encerrada','cancelada'))) then raise exception 'Transição de NC inválida: % -> %.',v_nc.status,p_novo_status;end if;if p_novo_status='em_tratamento' and p_responsavel_id is null then raise exception 'Tratamento exige responsável.';end if;if p_responsavel_id is not null and not exists(select 1 from public.usuarios where empresa_id=v_empresa and auth_user_id=p_responsavel_id and ativo) then raise exception 'Responsável inválido para a empresa.';end if;if p_novo_status='encerrada' and nullif(btrim(coalesce(p_disposicao,v_nc.disposicao)),'') is null then raise exception 'Encerramento exige disposição.';end if;
 perform set_config('app.nc_motivo',p_motivo,true);update public.nao_conformidades set status=p_novo_status,disposicao=coalesce(nullif(btrim(p_disposicao),''),disposicao),responsavel_id=coalesce(p_responsavel_id,responsavel_id),prazo=coalesce(p_prazo,prazo),encerrada_em=case when p_novo_status='encerrada' then now() else null end where empresa_id=v_empresa and id=p_nc_id;return p_nc_id;
end $function$;

create or replace function public.registrar_liberacao_qualidade(p_inspecao_id uuid,p_decisao text,p_justificativa text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id();v_i public.inspecoes_qualidade%rowtype;v_e public.liberacoes_qualidade%rowtype;v_id uuid;begin
 if not public.usuario_tem_permissao('qualidade.liberacoes.decidir') then raise exception 'Usuário sem permissão para liberar.' using errcode='42501';end if;if p_decisao not in('liberado','rejeitado','retrabalho') or nullif(btrim(p_justificativa),'') is null or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos.';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));select * into v_e from public.liberacoes_qualidade where empresa_id=v_empresa and idempotency_key=p_idempotency_key;if found then if v_e.inspecao_qualidade_id is distinct from p_inspecao_id or v_e.decisao is distinct from p_decisao or v_e.justificativa is distinct from p_justificativa then raise exception 'Chave idempotente reutilizada com dados diferentes.';end if;return v_e.id;end if;
 select * into v_i from public.inspecoes_qualidade where empresa_id=v_empresa and id=p_inspecao_id and status='concluida' for update;if not found then raise exception 'Inspeção não concluída.';end if;
 if (v_i.resultado='conforme' and p_decisao<>'liberado') or (v_i.resultado='nao_conforme' and p_decisao='liberado') then raise exception 'Decisão incompatível com o resultado.';end if;
 insert into public.liberacoes_qualidade(empresa_id,inspecao_qualidade_id,decisao,justificativa,idempotency_key,decidida_por) values(v_empresa,p_inspecao_id,p_decisao,p_justificativa,p_idempotency_key,auth.uid()) returning id into v_id;
 perform set_config('app.qualidade_liberacao_id',v_id::text,true);
 if v_i.tipo='processo' and p_decisao in('liberado','retrabalho') then perform public.transicionar_operacao_producao(v_i.operacao_producao_id,case when p_decisao='liberado' then 'concluida' else 'em_execucao' end,p_justificativa);
 elsif v_i.tipo='recebimento' and p_decisao='liberado' then perform public.transicionar_recebimento((select recebimento_id from public.recebimento_itens where empresa_id=v_empresa and id=v_i.recebimento_item_id),'liberado',p_justificativa);end if;return v_id;
end $function$;

revoke all on function public.abrir_inspecao_qualidade(text,uuid,uuid,uuid,text,text,text),public.iniciar_inspecao_qualidade(uuid,text),public.concluir_inspecao_qualidade(uuid,text,text,text,text),public.cancelar_inspecao_qualidade(uuid,text),public.registrar_certificado_qualidade(uuid,text,text,text,text,text,date,date,text),public.transicionar_nao_conformidade(uuid,text,text,uuid,date,text),public.registrar_liberacao_qualidade(uuid,text,text,text) from public;
grant execute on function public.abrir_inspecao_qualidade(text,uuid,uuid,uuid,text,text,text),public.iniciar_inspecao_qualidade(uuid,text),public.concluir_inspecao_qualidade(uuid,text,text,text,text),public.cancelar_inspecao_qualidade(uuid,text),public.registrar_certificado_qualidade(uuid,text,text,text,text,text,date,date,text),public.transicionar_nao_conformidade(uuid,text,text,uuid,date,text),public.registrar_liberacao_qualidade(uuid,text,text,text) to authenticated,service_role;

do $security$ declare t text;begin foreach t in array array['inspecoes_qualidade','inspecao_qualidade_eventos','certificados_qualidade','nao_conformidades','nao_conformidade_eventos','liberacoes_qualidade'] loop execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant all on table public.%I to service_role',t);execute format('alter table public.%I enable row level security',t);execute format('create policy %I on public.%I for select to authenticated using (empresa_id=public.empresa_atual_id())',t||'_select',t);end loop;end $security$;
grant select on public.inspecoes_qualidade,public.inspecao_qualidade_eventos,public.certificados_qualidade,public.nao_conformidades,public.nao_conformidade_eventos,public.liberacoes_qualidade to authenticated;

commit;
