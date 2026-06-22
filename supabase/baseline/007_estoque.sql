-- NEXOTFE 1.0 — Baseline SQL
-- Módulo 007: locais, saldos, reservas, movimentos físicos e consumos
-- Dependências: 001..006

begin;

create table public.locais_estoque (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  local_pai_id uuid, codigo text not null, nome text not null, tipo text not null default 'posicao',
  permite_saldo boolean not null default true, ativo boolean not null default true, observacoes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint locais_estoque_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint locais_estoque_pai_fkey foreign key(empresa_id,local_pai_id) references public.locais_estoque(empresa_id,id) on delete restrict,
  constraint locais_estoque_empresa_id_id_uniq unique(empresa_id,id),
  constraint locais_estoque_codigo_uniq unique(empresa_id,codigo),
  constraint locais_estoque_codigo_chk check(codigo=btrim(codigo) and codigo<>''),
  constraint locais_estoque_nome_chk check(btrim(nome)<>''),
  constraint locais_estoque_tipo_chk check(tipo in('almoxarifado','area','rua','prateleira','nivel','posicao','quarentena','expedicao')),
  constraint locais_estoque_pai_chk check(local_pai_id is null or local_pai_id<>id),
  constraint locais_estoque_delete_chk check((deleted_at is null)=(deleted_by is null))
);

create table public.estoque_saldos (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  materia_prima_id uuid not null, local_estoque_id uuid not null, unidade text not null,
  quantidade_fisica numeric(18,6) not null default 0,
  quantidade_reservada numeric(18,6) not null default 0,
  quantidade_livre numeric(18,6) generated always as (quantidade_fisica-quantidade_reservada) stored,
  updated_at timestamptz not null default now(),
  constraint estoque_saldos_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint estoque_saldos_material_fkey foreign key(empresa_id,materia_prima_id) references public.materias_primas(empresa_id,id) on delete restrict,
  constraint estoque_saldos_local_fkey foreign key(empresa_id,local_estoque_id) references public.locais_estoque(empresa_id,id) on delete restrict,
  constraint estoque_saldos_empresa_id_id_uniq unique(empresa_id,id),
  constraint estoque_saldos_material_local_id_uniq unique(empresa_id,materia_prima_id,local_estoque_id,id),
  constraint estoque_saldos_material_local_uniq unique(empresa_id,materia_prima_id,local_estoque_id),
  constraint estoque_saldos_unidade_chk check(btrim(unidade)<>''),
  constraint estoque_saldos_quantidades_chk check(quantidade_fisica>=0 and quantidade_reservada>=0 and quantidade_reservada<=quantidade_fisica)
);

create table public.reservas_estoque (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  decisao_necessidade_material_id uuid not null, necessidade_material_id uuid not null,
  of_id uuid not null, materia_prima_id uuid not null, local_estoque_id uuid not null,
  estoque_saldo_id uuid not null, quantidade_reservada numeric(18,6) not null,
  quantidade_consumida numeric(18,6) not null default 0,
  quantidade_liberada numeric(18,6) not null default 0,
  unidade text not null, status text not null default 'ativa', idempotency_key text not null,
  reservada_em timestamptz not null default now(), reservada_por uuid not null references auth.users(id) on delete restrict,
  encerrada_em timestamptz, encerrada_por uuid references auth.users(id) on delete restrict,
  constraint reservas_estoque_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint reservas_estoque_decisao_fkey foreign key(empresa_id,necessidade_material_id,decisao_necessidade_material_id) references public.decisoes_necessidade_material(empresa_id,necessidade_material_id,id) on delete restrict,
  constraint reservas_estoque_necessidade_fkey foreign key(empresa_id,of_id,materia_prima_id,necessidade_material_id) references public.necessidades_materiais(empresa_id,of_id,materia_prima_id,id) on delete restrict,
  constraint reservas_estoque_of_fkey foreign key(empresa_id,of_id) references public.ordens_fabricacao(empresa_id,id) on delete restrict,
  constraint reservas_estoque_saldo_fkey foreign key(empresa_id,materia_prima_id,local_estoque_id,estoque_saldo_id) references public.estoque_saldos(empresa_id,materia_prima_id,local_estoque_id,id) on delete restrict,
  constraint reservas_estoque_empresa_id_id_uniq unique(empresa_id,id),
  constraint reservas_estoque_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint reservas_estoque_quantidades_chk check(quantidade_reservada>0 and quantidade_consumida>=0 and quantidade_liberada>=0 and quantidade_consumida+quantidade_liberada<=quantidade_reservada),
  constraint reservas_estoque_unidade_chk check(btrim(unidade)<>''),
  constraint reservas_estoque_status_chk check(status in('ativa','consumida','liberada','cancelada')),
  constraint reservas_estoque_estado_chk check(
    (status='ativa' and quantidade_consumida+quantidade_liberada<quantidade_reservada and encerrada_em is null and encerrada_por is null) or
    (status='consumida' and quantidade_consumida=quantidade_reservada and quantidade_liberada=0 and encerrada_em is not null and encerrada_por is not null) or
    (status='liberada' and quantidade_consumida=0 and quantidade_liberada=quantidade_reservada and encerrada_em is not null and encerrada_por is not null) or
    (status='cancelada' and quantidade_consumida+quantidade_liberada=quantidade_reservada and encerrada_em is not null and encerrada_por is not null)
  ),
  constraint reservas_estoque_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.reserva_estoque_eventos (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  reserva_estoque_id uuid not null, evento text not null,
  estado_anterior text, estado_novo text not null, quantidade numeric(18,6) not null default 0,
  motivo text, ocorrido_em timestamptz not null default now(),
  ocorrido_por uuid not null references auth.users(id) on delete restrict,
  constraint reserva_estoque_eventos_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint reserva_estoque_eventos_reserva_fkey foreign key(empresa_id,reserva_estoque_id) references public.reservas_estoque(empresa_id,id) on delete restrict,
  constraint reserva_estoque_eventos_empresa_id_id_uniq unique(empresa_id,id),
  constraint reserva_estoque_eventos_evento_chk check(evento in('criada','consumo_parcial','consumida','liberada','cancelada')),
  constraint reserva_estoque_eventos_anterior_chk check(estado_anterior is null or estado_anterior in('ativa','consumida','liberada','cancelada')),
  constraint reserva_estoque_eventos_novo_chk check(estado_novo in('ativa','consumida','liberada','cancelada')),
  constraint reserva_estoque_eventos_quantidade_chk check(quantidade>=0)
);

create table public.estoque_movimentacoes (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  estoque_saldo_id uuid not null, materia_prima_id uuid not null, local_estoque_id uuid not null,
  tipo text not null, quantidade numeric(18,6) not null,
  saldo_fisico_anterior numeric(18,6) not null, saldo_fisico_posterior numeric(18,6) not null,
  of_id uuid, reserva_estoque_id uuid, origem_tipo text not null, origem_id uuid,
  correlacao_id uuid, motivo text, idempotency_key text not null,
  ocorrido_em timestamptz not null default now(), ocorrido_por uuid not null references auth.users(id) on delete restrict,
  constraint estoque_movimentacoes_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint estoque_movimentacoes_saldo_fkey foreign key(empresa_id,materia_prima_id,local_estoque_id,estoque_saldo_id) references public.estoque_saldos(empresa_id,materia_prima_id,local_estoque_id,id) on delete restrict,
  constraint estoque_movimentacoes_of_fkey foreign key(empresa_id,of_id) references public.ordens_fabricacao(empresa_id,id) on delete restrict,
  constraint estoque_movimentacoes_reserva_fkey foreign key(empresa_id,reserva_estoque_id) references public.reservas_estoque(empresa_id,id) on delete restrict,
  constraint estoque_movimentacoes_empresa_id_id_uniq unique(empresa_id,id),
  constraint estoque_movimentacoes_idempotency_uniq unique(empresa_id,idempotency_key,tipo),
  constraint estoque_movimentacoes_tipo_chk check(tipo in('ajuste_entrada','ajuste_saida','transferencia_entrada','transferencia_saida','recebimento','devolucao','producao','consumo','expedicao')),
  constraint estoque_movimentacoes_quantidade_chk check(quantidade>0 and saldo_fisico_anterior>=0 and saldo_fisico_posterior>=0),
  constraint estoque_movimentacoes_saldo_chk check(
    (tipo in('ajuste_entrada','transferencia_entrada','recebimento','devolucao','producao') and saldo_fisico_posterior=saldo_fisico_anterior+quantidade) or
    (tipo in('ajuste_saida','transferencia_saida','consumo','expedicao') and saldo_fisico_posterior=saldo_fisico_anterior-quantidade)
  ),
  constraint estoque_movimentacoes_origem_chk check(btrim(origem_tipo)<>''),
  constraint estoque_movimentacoes_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.consumos_materiais (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  reserva_estoque_id uuid not null, necessidade_material_id uuid not null,
  of_id uuid not null, materia_prima_id uuid not null, estoque_movimentacao_id uuid not null,
  quantidade numeric(18,6) not null, unidade text not null, observacoes text,
  idempotency_key text not null, consumido_em timestamptz not null default now(),
  consumido_por uuid not null references auth.users(id) on delete restrict,
  constraint consumos_materiais_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint consumos_materiais_reserva_fkey foreign key(empresa_id,reserva_estoque_id) references public.reservas_estoque(empresa_id,id) on delete restrict,
  constraint consumos_materiais_necessidade_fkey foreign key(empresa_id,of_id,materia_prima_id,necessidade_material_id) references public.necessidades_materiais(empresa_id,of_id,materia_prima_id,id) on delete restrict,
  constraint consumos_materiais_of_fkey foreign key(empresa_id,of_id) references public.ordens_fabricacao(empresa_id,id) on delete restrict,
  constraint consumos_materiais_movimento_fkey foreign key(empresa_id,estoque_movimentacao_id) references public.estoque_movimentacoes(empresa_id,id) on delete restrict,
  constraint consumos_materiais_empresa_id_id_uniq unique(empresa_id,id),
  constraint consumos_materiais_movimento_uniq unique(empresa_id,estoque_movimentacao_id),
  constraint consumos_materiais_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint consumos_materiais_quantidade_chk check(quantidade>0),
  constraint consumos_materiais_unidade_chk check(btrim(unidade)<>''),
  constraint consumos_materiais_idempotency_chk check(btrim(idempotency_key)<>'')
);

create index locais_estoque_pai_idx on public.locais_estoque(empresa_id,local_pai_id);
create index estoque_saldos_material_idx on public.estoque_saldos(empresa_id,materia_prima_id);
create index reservas_estoque_necessidade_idx on public.reservas_estoque(empresa_id,necessidade_material_id,status);
create index reserva_estoque_eventos_reserva_idx on public.reserva_estoque_eventos(empresa_id,reserva_estoque_id,ocorrido_em);
create index estoque_movimentacoes_material_idx on public.estoque_movimentacoes(empresa_id,materia_prima_id,ocorrido_em);
create index consumos_materiais_of_idx on public.consumos_materiais(empresa_id,of_id,consumido_em);

create trigger locais_estoque_set_updated_at before update on public.locais_estoque for each row execute function public.set_updated_at();
create trigger estoque_saldos_set_updated_at before update on public.estoque_saldos for each row execute function public.set_updated_at();

create or replace function public.validar_local_estoque_sem_ciclo() returns trigger language plpgsql set search_path='' as $function$
begin
  if new.local_pai_id is not null and exists(
    with recursive ancestrais(id) as (
      select new.local_pai_id union all
      select l.local_pai_id from public.locais_estoque l join ancestrais a on l.id=a.id
       where l.empresa_id=new.empresa_id and l.local_pai_id is not null and l.id<>new.id
    ) select 1 from ancestrais where id=new.id
  ) then raise exception 'Hierarquia de locais criaria ciclo.'; end if;
  return new;
end $function$;
revoke all on function public.validar_local_estoque_sem_ciclo() from public;
create trigger locais_estoque_sem_ciclo before insert or update of local_pai_id on public.locais_estoque for each row execute function public.validar_local_estoque_sem_ciclo();

create or replace function public.recalcular_atendimento_necessidade_estoque(p_necessidade_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_necessidade public.necessidades_materiais%rowtype; v_reservada numeric(18,6);
begin
  select * into v_necessidade from public.necessidades_materiais where empresa_id=v_empresa and id=p_necessidade_id for update;
  if not found or v_necessidade.status='cancelada' then return; end if;
  select coalesce(sum(quantidade_reservada-quantidade_liberada),0) into v_reservada from public.reservas_estoque
   where empresa_id=v_empresa and necessidade_material_id=p_necessidade_id and status<>'cancelada';
  if v_reservada>=v_necessidade.quantidade_necessaria then
    update public.necessidades_materiais set status='atendida',status_decisao='decidida',status_atendimento='reservado' where id=p_necessidade_id;
  elsif v_reservada>0 then
    update public.necessidades_materiais set status='atendimento_parcial',status_decisao='decidida',status_atendimento='parcial' where id=p_necessidade_id;
  else
    update public.necessidades_materiais set status='decisao_registrada',status_decisao='decidida',status_atendimento='pendente' where id=p_necessidade_id;
  end if;
end $function$;
revoke all on function public.recalcular_atendimento_necessidade_estoque(uuid) from public;

create or replace function public.ajustar_estoque(p_materia_prima_id uuid,p_local_estoque_id uuid,p_tipo text,p_quantidade numeric,p_motivo text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_material public.materias_primas%rowtype; v_local public.locais_estoque%rowtype; v_saldo public.estoque_saldos%rowtype; v_mov public.estoque_movimentacoes%rowtype; v_posterior numeric(18,6); v_id uuid;
begin
  if not public.usuario_tem_permissao('estoque.ajustar') then raise exception 'Usuário sem permissão para ajustar estoque.' using errcode='42501'; end if;
  if p_tipo not in('ajuste_entrada','ajuste_saida') or p_quantidade<=0 or nullif(btrim(p_motivo),'') is null or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para ajuste.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
  select * into v_mov from public.estoque_movimentacoes where empresa_id=v_empresa and idempotency_key=p_idempotency_key and tipo=p_tipo;
  if found then
    if v_mov.materia_prima_id<>p_materia_prima_id or v_mov.local_estoque_id<>p_local_estoque_id or v_mov.quantidade<>p_quantidade then raise exception 'Chave de idempotência já usada com conteúdo diferente.'; end if;
    return v_mov.id;
  end if;
  select * into v_material from public.materias_primas where empresa_id=v_empresa and id=p_materia_prima_id and ativo and deleted_at is null;
  select * into v_local from public.locais_estoque where empresa_id=v_empresa and id=p_local_estoque_id and ativo and permite_saldo and deleted_at is null;
  if v_material.id is null or v_local.id is null then raise exception 'Material ou local indisponível para saldo.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_materia_prima_id::text||':'||p_local_estoque_id::text,0));
  insert into public.estoque_saldos(empresa_id,materia_prima_id,local_estoque_id,unidade) values(v_empresa,p_materia_prima_id,p_local_estoque_id,v_material.unidade) on conflict(empresa_id,materia_prima_id,local_estoque_id) do nothing;
  select * into v_saldo from public.estoque_saldos where empresa_id=v_empresa and materia_prima_id=p_materia_prima_id and local_estoque_id=p_local_estoque_id for update;
  v_posterior:=case when p_tipo='ajuste_entrada' then v_saldo.quantidade_fisica+p_quantidade else v_saldo.quantidade_fisica-p_quantidade end;
  if v_posterior<v_saldo.quantidade_reservada then raise exception 'Ajuste reduziria o saldo físico abaixo do reservado.'; end if;
  update public.estoque_saldos set quantidade_fisica=v_posterior where id=v_saldo.id;
  insert into public.estoque_movimentacoes(empresa_id,estoque_saldo_id,materia_prima_id,local_estoque_id,tipo,quantidade,saldo_fisico_anterior,saldo_fisico_posterior,origem_tipo,motivo,idempotency_key,ocorrido_por)
  values(v_empresa,v_saldo.id,p_materia_prima_id,p_local_estoque_id,p_tipo,p_quantidade,v_saldo.quantidade_fisica,v_posterior,'ajuste',p_motivo,p_idempotency_key,auth.uid()) returning id into v_id;
  return v_id;
end $function$;

create or replace function public.transferir_estoque(p_materia_prima_id uuid,p_local_origem_id uuid,p_local_destino_id uuid,p_quantidade numeric,p_motivo text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_origem public.estoque_saldos%rowtype; v_destino public.estoque_saldos%rowtype; v_material public.materias_primas%rowtype; v_local public.locais_estoque%rowtype; v_existente public.estoque_movimentacoes%rowtype; v_correlacao uuid:=extensions.gen_random_uuid();
begin
  if not public.usuario_tem_permissao('estoque.transferir') then raise exception 'Usuário sem permissão para transferir estoque.' using errcode='42501'; end if;
  if p_local_origem_id=p_local_destino_id or p_quantidade<=0 or nullif(btrim(p_motivo),'') is null or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para transferência.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
  select * into v_existente from public.estoque_movimentacoes where empresa_id=v_empresa and idempotency_key=p_idempotency_key and tipo='transferencia_saida';
  if found then
    if v_existente.materia_prima_id<>p_materia_prima_id or v_existente.local_estoque_id<>p_local_origem_id or v_existente.quantidade<>p_quantidade then raise exception 'Chave de idempotência já usada com conteúdo diferente.'; end if;
    return v_existente.correlacao_id;
  end if;
  select * into v_material from public.materias_primas where empresa_id=v_empresa and id=p_materia_prima_id and ativo and deleted_at is null;
  select * into v_local from public.locais_estoque where empresa_id=v_empresa and id=p_local_destino_id and ativo and permite_saldo and deleted_at is null;
  if v_material.id is null or v_local.id is null then raise exception 'Material ou destino indisponível.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_materia_prima_id::text||':'||least(p_local_origem_id,p_local_destino_id)::text,0));
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_materia_prima_id::text||':'||greatest(p_local_origem_id,p_local_destino_id)::text,0));
  insert into public.estoque_saldos(empresa_id,materia_prima_id,local_estoque_id,unidade) values(v_empresa,p_materia_prima_id,p_local_destino_id,v_material.unidade) on conflict(empresa_id,materia_prima_id,local_estoque_id) do nothing;
  select * into v_origem from public.estoque_saldos where empresa_id=v_empresa and materia_prima_id=p_materia_prima_id and local_estoque_id=p_local_origem_id for update;
  select * into v_destino from public.estoque_saldos where empresa_id=v_empresa and materia_prima_id=p_materia_prima_id and local_estoque_id=p_local_destino_id for update;
  if v_origem.id is null or v_origem.quantidade_livre<p_quantidade then raise exception 'Saldo livre insuficiente para transferência.'; end if;
  update public.estoque_saldos set quantidade_fisica=quantidade_fisica-p_quantidade where id=v_origem.id;
  update public.estoque_saldos set quantidade_fisica=quantidade_fisica+p_quantidade where id=v_destino.id;
  insert into public.estoque_movimentacoes(empresa_id,estoque_saldo_id,materia_prima_id,local_estoque_id,tipo,quantidade,saldo_fisico_anterior,saldo_fisico_posterior,origem_tipo,correlacao_id,motivo,idempotency_key,ocorrido_por) values
  (v_empresa,v_origem.id,p_materia_prima_id,p_local_origem_id,'transferencia_saida',p_quantidade,v_origem.quantidade_fisica,v_origem.quantidade_fisica-p_quantidade,'transferencia',v_correlacao,p_motivo,p_idempotency_key,auth.uid()),
  (v_empresa,v_destino.id,p_materia_prima_id,p_local_destino_id,'transferencia_entrada',p_quantidade,v_destino.quantidade_fisica,v_destino.quantidade_fisica+p_quantidade,'transferencia',v_correlacao,p_motivo,p_idempotency_key,auth.uid());
  return v_correlacao;
end $function$;

create or replace function public.reservar_estoque(p_decisao_id uuid,p_estoque_saldo_id uuid,p_quantidade numeric,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_decisao public.decisoes_necessidade_material%rowtype; v_necessidade public.necessidades_materiais%rowtype; v_saldo public.estoque_saldos%rowtype; v_existente public.reservas_estoque%rowtype; v_total numeric(18,6); v_id uuid;
begin
  if not public.usuario_tem_permissao('estoque.reservar') then raise exception 'Usuário sem permissão para reservar estoque.' using errcode='42501'; end if;
  if p_quantidade<=0 or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para reserva.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
  select * into v_existente from public.reservas_estoque where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
  if found then
    if v_existente.decisao_necessidade_material_id<>p_decisao_id or v_existente.estoque_saldo_id<>p_estoque_saldo_id or v_existente.quantidade_reservada<>p_quantidade then raise exception 'Chave de idempotência já usada com conteúdo diferente.'; end if;
    return v_existente.id;
  end if;
  select * into v_decisao from public.decisoes_necessidade_material where empresa_id=v_empresa and id=p_decisao_id and cancelada_em is null for update;
  if not found or v_decisao.tipo_decisao not in('estoque','estoque_compra') then raise exception 'Decisão ativa não permite reserva.'; end if;
  select * into v_necessidade from public.necessidades_materiais where empresa_id=v_empresa and id=v_decisao.necessidade_material_id and status<>'cancelada' for update;
  select * into v_saldo from public.estoque_saldos where empresa_id=v_empresa and id=p_estoque_saldo_id and materia_prima_id=v_necessidade.materia_prima_id for update;
  if not found or v_saldo.quantidade_livre<p_quantidade then raise exception 'Saldo livre insuficiente para reserva.'; end if;
  select coalesce(sum(quantidade_reservada),0) into v_total from public.reservas_estoque where empresa_id=v_empresa and decisao_necessidade_material_id=p_decisao_id and status in('ativa','consumida');
  if v_total+p_quantidade>v_decisao.quantidade_estoque then raise exception 'Reserva excede a quantidade decidida para estoque.'; end if;
  select coalesce(sum(quantidade_reservada),0) into v_total from public.reservas_estoque where empresa_id=v_empresa and necessidade_material_id=v_necessidade.id and status in('ativa','consumida');
  if v_total+p_quantidade>v_necessidade.quantidade_necessaria then raise exception 'Reserva excede a quantidade total da necessidade.'; end if;
  insert into public.reservas_estoque(empresa_id,decisao_necessidade_material_id,necessidade_material_id,of_id,materia_prima_id,local_estoque_id,estoque_saldo_id,quantidade_reservada,unidade,idempotency_key,reservada_por)
  values(v_empresa,p_decisao_id,v_necessidade.id,v_necessidade.of_id,v_necessidade.materia_prima_id,v_saldo.local_estoque_id,v_saldo.id,p_quantidade,v_necessidade.unidade_snapshot,p_idempotency_key,auth.uid()) returning id into v_id;
  update public.estoque_saldos set quantidade_reservada=quantidade_reservada+p_quantidade where id=v_saldo.id;
  insert into public.reserva_estoque_eventos(empresa_id,reserva_estoque_id,evento,estado_novo,quantidade,motivo,ocorrido_por) values(v_empresa,v_id,'criada','ativa',p_quantidade,'Reserva criada por decisão do PCP',auth.uid());
  perform public.recalcular_atendimento_necessidade_estoque(v_necessidade.id);
  return v_id;
end $function$;

create or replace function public.encerrar_reserva_estoque(p_reserva_id uuid,p_novo_status text,p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_reserva public.reservas_estoque%rowtype; v_evento text; v_restante numeric(18,6);
begin
  if not public.usuario_tem_permissao('estoque.reservar') then raise exception 'Usuário sem permissão para encerrar reserva.' using errcode='42501'; end if;
  if p_novo_status not in('liberada','cancelada') or nullif(btrim(p_motivo),'') is null then raise exception 'Parâmetros inválidos para encerramento da reserva.'; end if;
  select * into v_reserva from public.reservas_estoque where empresa_id=v_empresa and id=p_reserva_id for update;
  if not found then raise exception 'Reserva não encontrada.'; end if;
  if v_reserva.status=p_novo_status then return p_reserva_id; end if;
  if v_reserva.status<>'ativa' then raise exception 'Somente reserva ativa pode ser liberada ou cancelada.'; end if;
  if p_novo_status='liberada' and v_reserva.quantidade_consumida<>0 then raise exception 'Reserva parcialmente consumida não pode ser liberada; somente cancelada.'; end if;
  v_restante:=v_reserva.quantidade_reservada-v_reserva.quantidade_consumida;
  update public.estoque_saldos set quantidade_reservada=quantidade_reservada-v_restante where empresa_id=v_empresa and id=v_reserva.estoque_saldo_id;
  update public.reservas_estoque set status=p_novo_status,quantidade_liberada=v_restante,encerrada_em=now(),encerrada_por=auth.uid() where id=p_reserva_id;
  v_evento:=case when p_novo_status='liberada' then 'liberada' else 'cancelada' end;
  insert into public.reserva_estoque_eventos(empresa_id,reserva_estoque_id,evento,estado_anterior,estado_novo,quantidade,motivo,ocorrido_por) values(v_empresa,p_reserva_id,v_evento,'ativa',p_novo_status,v_restante,p_motivo,auth.uid());
  perform public.recalcular_atendimento_necessidade_estoque(v_reserva.necessidade_material_id);
  return p_reserva_id;
end $function$;

create or replace function public.liberar_reserva_estoque(p_reserva_id uuid,p_motivo text)
returns uuid language sql security definer set search_path='' as $function$ select public.encerrar_reserva_estoque(p_reserva_id,'liberada',p_motivo) $function$;
create or replace function public.cancelar_reserva_estoque(p_reserva_id uuid,p_motivo text)
returns uuid language sql security definer set search_path='' as $function$ select public.encerrar_reserva_estoque(p_reserva_id,'cancelada',p_motivo) $function$;

create or replace function public.consumir_reserva_estoque(p_reserva_id uuid,p_quantidade numeric,p_observacoes text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_reserva public.reservas_estoque%rowtype; v_saldo public.estoque_saldos%rowtype; v_existente public.consumos_materiais%rowtype; v_restante numeric(18,6); v_mov_id uuid; v_consumo_id uuid; v_status text; v_evento text;
begin
  if not public.usuario_tem_permissao('estoque.consumir') then raise exception 'Usuário sem permissão para consumir reserva.' using errcode='42501'; end if;
  if p_quantidade<=0 or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para consumo.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
  select * into v_existente from public.consumos_materiais where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
  if found then
    if v_existente.reserva_estoque_id<>p_reserva_id or v_existente.quantidade<>p_quantidade then raise exception 'Chave de idempotência já usada com conteúdo diferente.'; end if;
    return v_existente.id;
  end if;
  select * into v_reserva from public.reservas_estoque where empresa_id=v_empresa and id=p_reserva_id for update;
  if not found or v_reserva.status<>'ativa' then raise exception 'Reserva não está ativa.'; end if;
  v_restante:=v_reserva.quantidade_reservada-v_reserva.quantidade_consumida;
  if p_quantidade>v_restante then raise exception 'Consumo excede o restante reservado.'; end if;
  select * into v_saldo from public.estoque_saldos where empresa_id=v_empresa and id=v_reserva.estoque_saldo_id for update;
  if v_saldo.quantidade_fisica<p_quantidade or v_saldo.quantidade_reservada<p_quantidade then raise exception 'Saldo inconsistente para consumo.'; end if;
  update public.estoque_saldos set quantidade_fisica=quantidade_fisica-p_quantidade,quantidade_reservada=quantidade_reservada-p_quantidade where id=v_saldo.id;
  insert into public.estoque_movimentacoes(empresa_id,estoque_saldo_id,materia_prima_id,local_estoque_id,tipo,quantidade,saldo_fisico_anterior,saldo_fisico_posterior,of_id,reserva_estoque_id,origem_tipo,origem_id,idempotency_key,motivo,ocorrido_por)
  values(v_empresa,v_saldo.id,v_reserva.materia_prima_id,v_reserva.local_estoque_id,'consumo',p_quantidade,v_saldo.quantidade_fisica,v_saldo.quantidade_fisica-p_quantidade,v_reserva.of_id,v_reserva.id,'reserva',v_reserva.id,p_idempotency_key,p_observacoes,auth.uid()) returning id into v_mov_id;
  insert into public.consumos_materiais(empresa_id,reserva_estoque_id,necessidade_material_id,of_id,materia_prima_id,estoque_movimentacao_id,quantidade,unidade,observacoes,idempotency_key,consumido_por)
  values(v_empresa,v_reserva.id,v_reserva.necessidade_material_id,v_reserva.of_id,v_reserva.materia_prima_id,v_mov_id,p_quantidade,v_reserva.unidade,p_observacoes,p_idempotency_key,auth.uid()) returning id into v_consumo_id;
  v_status:=case when p_quantidade=v_restante then 'consumida' else 'ativa' end;
  v_evento:=case when v_status='consumida' then 'consumida' else 'consumo_parcial' end;
  update public.reservas_estoque set quantidade_consumida=quantidade_consumida+p_quantidade,status=v_status,encerrada_em=case when v_status='consumida' then now() else null end,encerrada_por=case when v_status='consumida' then auth.uid() else null end where id=v_reserva.id;
  insert into public.reserva_estoque_eventos(empresa_id,reserva_estoque_id,evento,estado_anterior,estado_novo,quantidade,motivo,ocorrido_por) values(v_empresa,v_reserva.id,v_evento,'ativa',v_status,p_quantidade,p_observacoes,auth.uid());
  return v_consumo_id;
end $function$;

revoke all on function public.ajustar_estoque(uuid,uuid,text,numeric,text,text),public.transferir_estoque(uuid,uuid,uuid,numeric,text,text),public.reservar_estoque(uuid,uuid,numeric,text),public.encerrar_reserva_estoque(uuid,text,text),public.liberar_reserva_estoque(uuid,text),public.cancelar_reserva_estoque(uuid,text),public.consumir_reserva_estoque(uuid,numeric,text,text) from public;
grant execute on function public.ajustar_estoque(uuid,uuid,text,numeric,text,text),public.transferir_estoque(uuid,uuid,uuid,numeric,text,text),public.reservar_estoque(uuid,uuid,numeric,text),public.liberar_reserva_estoque(uuid,text),public.cancelar_reserva_estoque(uuid,text),public.consumir_reserva_estoque(uuid,numeric,text,text) to authenticated,service_role;

do $security$ declare v_table text; begin
  foreach v_table in array array['locais_estoque','estoque_saldos','reservas_estoque','reserva_estoque_eventos','estoque_movimentacoes','consumos_materiais'] loop
    execute format('revoke all on table public.%I from public,anon,authenticated',v_table);
    execute format('grant all on table public.%I to service_role',v_table);
    execute format('alter table public.%I enable row level security',v_table);
    execute format('create policy %I on public.%I for select to authenticated using (empresa_id=public.empresa_atual_id())',v_table||'_select',v_table);
  end loop;
end $security$;
grant select on public.locais_estoque,public.estoque_saldos,public.reservas_estoque,public.reserva_estoque_eventos,public.estoque_movimentacoes,public.consumos_materiais to authenticated;
grant insert,update on public.locais_estoque to authenticated;
create policy locais_estoque_insert on public.locais_estoque for insert to authenticated with check(empresa_id=public.empresa_atual_id() and created_by=auth.uid() and public.usuario_tem_permissao('estoque.locais.gerenciar'));
create policy locais_estoque_update on public.locais_estoque for update to authenticated using(empresa_id=public.empresa_atual_id() and public.usuario_tem_permissao('estoque.locais.gerenciar')) with check(empresa_id=public.empresa_atual_id() and public.usuario_tem_permissao('estoque.locais.gerenciar'));

comment on table public.estoque_saldos is 'Projeção transacional do saldo físico, reservado e livre por material e local; sem mutação direta pelo frontend.';
comment on table public.reservas_estoque is 'Compromisso lógico de saldo originado por decisão do PCP; não representa movimento físico.';
comment on table public.estoque_movimentacoes is 'Razão única e imutável de todos os movimentos físicos de estoque.';
comment on table public.consumos_materiais is 'Uso físico de material pela OF, vinculado à reserva e ao movimento de saída correspondente.';

commit;
