-- NEXOTFE 1.0 — Baseline SQL
-- Módulo 008: fornecedores, requisições, planejamento, pedidos e recebimento
-- Dependências: 001..007

begin;

create table public.fornecedores (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  razao_social text not null, nome_fantasia text, documento text,
  tipo text not null default 'materia_prima', situacao text not null default 'em_avaliacao',
  email text, telefone text, contato text, prazo_medio_dias integer, observacoes text, ativo boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete restrict,
  constraint fornecedores_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint fornecedores_empresa_id_id_uniq unique(empresa_id,id),
  constraint fornecedores_documento_uniq unique(empresa_id,documento),
  constraint fornecedores_razao_chk check(btrim(razao_social)<>''),
  constraint fornecedores_documento_chk check(documento is null or btrim(documento)<>''),
  constraint fornecedores_tipo_chk check(tipo in('materia_prima','servico_industrial','transporte','multiplo')),
  constraint fornecedores_situacao_chk check(situacao in('em_avaliacao','homologado','bloqueado')),
  constraint fornecedores_prazo_chk check(prazo_medio_dias is null or prazo_medio_dias>=0),
  constraint fornecedores_delete_chk check((deleted_at is null)=(deleted_by is null))
);

create table public.requisicoes_compra (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  numero_requisicao text not null, origem text not null, projeto_id uuid, of_id uuid,
  status text not null default 'aberta', prioridade text not null default 'normal',
  data_solicitacao date not null default current_date, data_necessidade date,
  solicitante_id uuid not null references auth.users(id) on delete restrict,
  observacoes text, idempotency_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  cancelada_em timestamptz, cancelada_por uuid references auth.users(id) on delete restrict,
  constraint requisicoes_compra_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint requisicoes_compra_projeto_fkey foreign key(empresa_id,projeto_id) references public.projetos(empresa_id,id) on delete restrict,
  constraint requisicoes_compra_of_fkey foreign key(empresa_id,of_id) references public.ordens_fabricacao(empresa_id,id) on delete restrict,
  constraint requisicoes_compra_empresa_id_id_uniq unique(empresa_id,id),
  constraint requisicoes_compra_numero_uniq unique(empresa_id,numero_requisicao),
  constraint requisicoes_compra_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint requisicoes_compra_origem_chk check(origem in('industrial','administrativa','servico_terceirizado')),
  constraint requisicoes_compra_status_chk check(status in('aberta','em_cotacao','aprovada','convertida_pedido','cancelada')),
  constraint requisicoes_compra_prioridade_chk check(prioridade in('baixa','normal','alta','critica')),
  constraint requisicoes_compra_origem_vinculo_chk check((origem='industrial' and projeto_id is not null and of_id is not null) or origem<>'industrial'),
  constraint requisicoes_compra_cancelamento_chk check((status='cancelada')=(cancelada_em is not null and cancelada_por is not null)),
  constraint requisicoes_compra_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.requisicao_compra_itens (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  requisicao_compra_id uuid not null, tipo_item text not null default 'material',
  materia_prima_id uuid, descricao text not null, quantidade numeric(18,6) not null, unidade text not null,
  necessidade_material_id uuid, decisao_necessidade_material_id uuid,
  data_necessidade date, observacoes text,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  constraint requisicao_compra_itens_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint requisicao_compra_itens_requisicao_fkey foreign key(empresa_id,requisicao_compra_id) references public.requisicoes_compra(empresa_id,id) on delete restrict,
  constraint requisicao_compra_itens_material_fkey foreign key(empresa_id,materia_prima_id) references public.materias_primas(empresa_id,id) on delete restrict,
  constraint requisicao_compra_itens_decisao_fkey foreign key(empresa_id,necessidade_material_id,decisao_necessidade_material_id) references public.decisoes_necessidade_material(empresa_id,necessidade_material_id,id) on delete restrict,
  constraint requisicao_compra_itens_empresa_id_id_uniq unique(empresa_id,id),
  constraint requisicao_compra_itens_origem_uniq unique(empresa_id,decisao_necessidade_material_id),
  constraint requisicao_compra_itens_tipo_chk check(tipo_item in('material','servico')),
  constraint requisicao_compra_itens_descricao_chk check(btrim(descricao)<>''),
  constraint requisicao_compra_itens_quantidade_chk check(quantidade>0),
  constraint requisicao_compra_itens_unidade_chk check(btrim(unidade)<>''),
  constraint requisicao_compra_itens_material_chk check((tipo_item='material' and materia_prima_id is not null) or tipo_item='servico'),
  constraint requisicao_compra_itens_industrial_chk check((necessidade_material_id is null and decisao_necessidade_material_id is null) or (necessidade_material_id is not null and decisao_necessidade_material_id is not null and materia_prima_id is not null))
);

create table public.requisicao_compra_eventos (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  requisicao_compra_id uuid not null, estado_anterior text, estado_novo text not null,
  motivo text, ocorrido_em timestamptz not null default now(), ocorrido_por uuid not null references auth.users(id) on delete restrict,
  constraint requisicao_compra_eventos_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint requisicao_compra_eventos_requisicao_fkey foreign key(empresa_id,requisicao_compra_id) references public.requisicoes_compra(empresa_id,id) on delete restrict,
  constraint requisicao_compra_eventos_empresa_id_id_uniq unique(empresa_id,id),
  constraint requisicao_compra_eventos_anterior_chk check(estado_anterior is null or estado_anterior in('aberta','em_cotacao','aprovada','convertida_pedido','cancelada')),
  constraint requisicao_compra_eventos_novo_chk check(estado_novo in('aberta','em_cotacao','aprovada','convertida_pedido','cancelada')),
  constraint requisicao_compra_eventos_mudanca_chk check(estado_anterior is null or estado_anterior<>estado_novo)
);

create table public.planejamentos_compra (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  numero_planejamento text not null, materia_prima_id uuid not null,
  familia_snapshot text not null, tipo_grade_snapshot text not null, bitola_snapshot text not null,
  chave_consolidacao text not null, unidade_necessidade text not null,
  quantidade_necessaria_total numeric(18,6) not null,
  quantidade_planejada_compra numeric(18,6) not null, sobra_prevista numeric(18,6) not null,
  estrategia text not null default 'necessidade', justificativa text,
  idempotency_key text not null, convertido_em timestamptz, cancelado_em timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  constraint planejamentos_compra_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint planejamentos_compra_material_fkey foreign key(empresa_id,materia_prima_id) references public.materias_primas(empresa_id,id) on delete restrict,
  constraint planejamentos_compra_empresa_id_id_uniq unique(empresa_id,id),
  constraint planejamentos_compra_numero_uniq unique(empresa_id,numero_planejamento),
  constraint planejamentos_compra_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint planejamentos_compra_classificacao_chk check(btrim(familia_snapshot)<>'' and btrim(tipo_grade_snapshot)<>'' and btrim(bitola_snapshot)<>'' and btrim(chave_consolidacao)<>''),
  constraint planejamentos_compra_quantidades_chk check(quantidade_necessaria_total>0 and quantidade_planejada_compra>=quantidade_necessaria_total and sobra_prevista=quantidade_planejada_compra-quantidade_necessaria_total),
  constraint planejamentos_compra_estrategia_chk check(estrategia in('necessidade','formato_comercial','lote_minimo','antecipada')),
  constraint planejamentos_compra_estado_chk check(not(convertido_em is not null and cancelado_em is not null)),
  constraint planejamentos_compra_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.planejamento_compra_origens (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  planejamento_compra_id uuid not null, requisicao_compra_id uuid not null,
  requisicao_compra_item_id uuid not null, quantidade_necessaria numeric(18,6) not null,
  unidade text not null, data_necessidade date,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  constraint planejamento_compra_origens_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint planejamento_compra_origens_planejamento_fkey foreign key(empresa_id,planejamento_compra_id) references public.planejamentos_compra(empresa_id,id) on delete restrict,
  constraint planejamento_compra_origens_requisicao_fkey foreign key(empresa_id,requisicao_compra_id) references public.requisicoes_compra(empresa_id,id) on delete restrict,
  constraint planejamento_compra_origens_item_fkey foreign key(empresa_id,requisicao_compra_item_id) references public.requisicao_compra_itens(empresa_id,id) on delete restrict,
  constraint planejamento_compra_origens_empresa_id_id_uniq unique(empresa_id,id),
  constraint planejamento_compra_origens_item_uniq unique(empresa_id,requisicao_compra_item_id),
  constraint planejamento_compra_origens_quantidade_chk check(quantidade_necessaria>0),
  constraint planejamento_compra_origens_unidade_chk check(btrim(unidade)<>'')
);

create table public.pedidos_compra (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  numero_pedido text not null, fornecedor_id uuid not null, planejamento_compra_id uuid not null,
  status text not null default 'emitido', data_emissao date not null default current_date,
  data_prevista_entrega date, moeda char(3) not null default 'BRL', observacoes text,
  idempotency_key text not null, encerrado_em timestamptz, cancelado_em timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  constraint pedidos_compra_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint pedidos_compra_fornecedor_fkey foreign key(empresa_id,fornecedor_id) references public.fornecedores(empresa_id,id) on delete restrict,
  constraint pedidos_compra_planejamento_fkey foreign key(empresa_id,planejamento_compra_id) references public.planejamentos_compra(empresa_id,id) on delete restrict,
  constraint pedidos_compra_empresa_id_id_uniq unique(empresa_id,id),
  constraint pedidos_compra_numero_uniq unique(empresa_id,numero_pedido),
  constraint pedidos_compra_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint pedidos_compra_status_chk check(status in('emitido','parcialmente_recebido','recebido','encerrado','cancelado')),
  constraint pedidos_compra_datas_chk check(data_prevista_entrega is null or data_prevista_entrega>=data_emissao),
  constraint pedidos_compra_moeda_chk check(moeda=upper(moeda) and btrim(moeda)<>''),
  constraint pedidos_compra_estado_chk check((status='encerrado')=(encerrado_em is not null) and (status='cancelado')=(cancelado_em is not null)),
  constraint pedidos_compra_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.pedido_compra_itens (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  pedido_compra_id uuid not null, planejamento_compra_id uuid not null,
  materia_prima_id uuid not null, descricao text not null,
  quantidade_pedida numeric(18,6) not null, quantidade_recebida numeric(18,6) not null default 0,
  unidade text not null, valor_unitario numeric(18,6) not null, valor_total numeric(18,6) generated always as (quantidade_pedida*valor_unitario) stored,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  constraint pedido_compra_itens_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint pedido_compra_itens_pedido_fkey foreign key(empresa_id,pedido_compra_id) references public.pedidos_compra(empresa_id,id) on delete restrict,
  constraint pedido_compra_itens_planejamento_fkey foreign key(empresa_id,planejamento_compra_id) references public.planejamentos_compra(empresa_id,id) on delete restrict,
  constraint pedido_compra_itens_material_fkey foreign key(empresa_id,materia_prima_id) references public.materias_primas(empresa_id,id) on delete restrict,
  constraint pedido_compra_itens_empresa_id_id_uniq unique(empresa_id,id),
  constraint pedido_compra_itens_planejamento_uniq unique(empresa_id,pedido_compra_id,planejamento_compra_id),
  constraint pedido_compra_itens_descricao_chk check(btrim(descricao)<>''),
  constraint pedido_compra_itens_quantidades_chk check(quantidade_pedida>0 and quantidade_recebida>=0 and quantidade_recebida<=quantidade_pedida),
  constraint pedido_compra_itens_unidade_chk check(btrim(unidade)<>''),
  constraint pedido_compra_itens_valor_chk check(valor_unitario>=0)
);

create table public.pedido_compra_eventos (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  pedido_compra_id uuid not null, estado_anterior text, estado_novo text not null,
  motivo text, ocorrido_em timestamptz not null default now(), ocorrido_por uuid not null references auth.users(id) on delete restrict,
  constraint pedido_compra_eventos_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint pedido_compra_eventos_pedido_fkey foreign key(empresa_id,pedido_compra_id) references public.pedidos_compra(empresa_id,id) on delete restrict,
  constraint pedido_compra_eventos_empresa_id_id_uniq unique(empresa_id,id),
  constraint pedido_compra_eventos_anterior_chk check(estado_anterior is null or estado_anterior in('emitido','parcialmente_recebido','recebido','encerrado','cancelado')),
  constraint pedido_compra_eventos_novo_chk check(estado_novo in('emitido','parcialmente_recebido','recebido','encerrado','cancelado')),
  constraint pedido_compra_eventos_mudanca_chk check(estado_anterior is null or estado_anterior<>estado_novo)
);

create table public.recebimentos (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  numero_recebimento text not null, pedido_compra_id uuid not null,
  status text not null default 'aguardando_recebimento', documento_fiscal text,
  exige_inspecao boolean not null default false, observacoes text, idempotency_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  constraint recebimentos_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint recebimentos_pedido_fkey foreign key(empresa_id,pedido_compra_id) references public.pedidos_compra(empresa_id,id) on delete restrict,
  constraint recebimentos_empresa_id_id_uniq unique(empresa_id,id),
  constraint recebimentos_numero_uniq unique(empresa_id,numero_recebimento),
  constraint recebimentos_idempotency_uniq unique(empresa_id,idempotency_key),
  constraint recebimentos_status_chk check(status in('aguardando_recebimento','recebimento_fisico','conferencia_documental','inspecao','liberado','rejeitado')),
  constraint recebimentos_idempotency_chk check(btrim(idempotency_key)<>'')
);

create table public.recebimento_itens (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  recebimento_id uuid not null, pedido_compra_item_id uuid not null,
  materia_prima_id uuid not null, local_estoque_id uuid not null,
  quantidade_recebida numeric(18,6) not null, quantidade_aceita numeric(18,6) not null,
  unidade text not null, lote text, observacoes text,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
  constraint recebimento_itens_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint recebimento_itens_recebimento_fkey foreign key(empresa_id,recebimento_id) references public.recebimentos(empresa_id,id) on delete restrict,
  constraint recebimento_itens_pedido_item_fkey foreign key(empresa_id,pedido_compra_item_id) references public.pedido_compra_itens(empresa_id,id) on delete restrict,
  constraint recebimento_itens_material_fkey foreign key(empresa_id,materia_prima_id) references public.materias_primas(empresa_id,id) on delete restrict,
  constraint recebimento_itens_local_fkey foreign key(empresa_id,local_estoque_id) references public.locais_estoque(empresa_id,id) on delete restrict,
  constraint recebimento_itens_empresa_id_id_uniq unique(empresa_id,id),
  constraint recebimento_itens_pedido_item_uniq unique(empresa_id,recebimento_id,pedido_compra_item_id),
  constraint recebimento_itens_quantidades_chk check(quantidade_recebida>0 and quantidade_aceita>=0 and quantidade_aceita<=quantidade_recebida),
  constraint recebimento_itens_unidade_chk check(btrim(unidade)<>'')
);

create table public.recebimento_eventos (
  id uuid primary key default extensions.gen_random_uuid(), empresa_id uuid not null,
  recebimento_id uuid not null, estado_anterior text, estado_novo text not null,
  motivo text, ocorrido_em timestamptz not null default now(), ocorrido_por uuid not null references auth.users(id) on delete restrict,
  constraint recebimento_eventos_empresa_fkey foreign key(empresa_id) references public.empresas(id) on delete restrict,
  constraint recebimento_eventos_recebimento_fkey foreign key(empresa_id,recebimento_id) references public.recebimentos(empresa_id,id) on delete restrict,
  constraint recebimento_eventos_empresa_id_id_uniq unique(empresa_id,id),
  constraint recebimento_eventos_anterior_chk check(estado_anterior is null or estado_anterior in('aguardando_recebimento','recebimento_fisico','conferencia_documental','inspecao','liberado','rejeitado')),
  constraint recebimento_eventos_novo_chk check(estado_novo in('aguardando_recebimento','recebimento_fisico','conferencia_documental','inspecao','liberado','rejeitado')),
  constraint recebimento_eventos_mudanca_chk check(estado_anterior is null or estado_anterior<>estado_novo)
);

create index requisicoes_compra_status_idx on public.requisicoes_compra(empresa_id,status,data_necessidade);
create index requisicao_compra_itens_material_idx on public.requisicao_compra_itens(empresa_id,materia_prima_id);
create index requisicao_compra_eventos_idx on public.requisicao_compra_eventos(empresa_id,requisicao_compra_id,ocorrido_em);
create index planejamento_compra_chave_idx on public.planejamentos_compra(empresa_id,chave_consolidacao);
create index pedidos_compra_fornecedor_idx on public.pedidos_compra(empresa_id,fornecedor_id,status);
create index pedido_compra_eventos_idx on public.pedido_compra_eventos(empresa_id,pedido_compra_id,ocorrido_em);
create index recebimentos_pedido_idx on public.recebimentos(empresa_id,pedido_compra_id,status);
create index recebimento_eventos_idx on public.recebimento_eventos(empresa_id,recebimento_id,ocorrido_em);

create trigger fornecedores_set_updated_at before update on public.fornecedores for each row execute function public.set_updated_at();
create trigger requisicoes_compra_set_updated_at before update on public.requisicoes_compra for each row execute function public.set_updated_at();
create trigger planejamentos_compra_set_updated_at before update on public.planejamentos_compra for each row execute function public.set_updated_at();
create trigger pedidos_compra_set_updated_at before update on public.pedidos_compra for each row execute function public.set_updated_at();
create trigger recebimentos_set_updated_at before update on public.recebimentos for each row execute function public.set_updated_at();

create or replace function public.registrar_evento_estado_requisicao_compra() returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if tg_op='INSERT' then insert into public.requisicao_compra_eventos(empresa_id,requisicao_compra_id,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,new.status,'Criação da requisição',new.created_by);
  elsif new.status is distinct from old.status then insert into public.requisicao_compra_eventos(empresa_id,requisicao_compra_id,estado_anterior,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,old.status,new.status,nullif(current_setting('app.requisicao_motivo',true),''),auth.uid());end if;
  return new;
end $function$;
revoke all on function public.registrar_evento_estado_requisicao_compra() from public;
create trigger requisicoes_compra_registrar_estado after insert or update of status on public.requisicoes_compra for each row execute function public.registrar_evento_estado_requisicao_compra();

create or replace function public.registrar_evento_estado_pedido_compra() returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if tg_op='INSERT' then insert into public.pedido_compra_eventos(empresa_id,pedido_compra_id,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,new.status,'Emissão do pedido',new.created_by);
  elsif new.status is distinct from old.status then insert into public.pedido_compra_eventos(empresa_id,pedido_compra_id,estado_anterior,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,old.status,new.status,nullif(current_setting('app.pedido_motivo',true),''),auth.uid());end if;
  return new;
end $function$;
revoke all on function public.registrar_evento_estado_pedido_compra() from public;
create trigger pedidos_compra_registrar_estado after insert or update of status on public.pedidos_compra for each row execute function public.registrar_evento_estado_pedido_compra();

create or replace function public.registrar_evento_estado_recebimento() returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if tg_op='INSERT' then insert into public.recebimento_eventos(empresa_id,recebimento_id,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,new.status,'Criação do recebimento',new.created_by);
  elsif new.status is distinct from old.status then insert into public.recebimento_eventos(empresa_id,recebimento_id,estado_anterior,estado_novo,motivo,ocorrido_por) values(new.empresa_id,new.id,old.status,new.status,nullif(current_setting('app.recebimento_motivo',true),''),auth.uid()); end if;
  return new;
end $function$;
revoke all on function public.registrar_evento_estado_recebimento() from public;
create trigger recebimentos_registrar_estado after insert or update of status on public.recebimentos for each row execute function public.registrar_evento_estado_recebimento();

create or replace function public.registrar_decisao_pcp(p_necessidade_id uuid,p_tipo_decisao text,p_quantidade_estoque numeric,p_quantidade_compra numeric,p_estoque_saldo_id uuid,p_justificativa text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_necessidade public.necessidades_materiais%rowtype; v_existente public.decisoes_necessidade_material%rowtype; v_decisao_id uuid; v_revisao integer; v_req_id uuid; v_numero text;
begin
  if not public.usuario_tem_permissao('pcp.decisao.registrar') then raise exception 'Usuário sem permissão para registrar decisão PCP.' using errcode='42501'; end if;
  if p_tipo_decisao not in('estoque','compra','estoque_compra') or coalesce(p_quantidade_estoque,0)<0 or coalesce(p_quantidade_compra,0)<0 or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para decisão PCP.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
  select * into v_existente from public.decisoes_necessidade_material where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
  if found then
    if v_existente.necessidade_material_id<>p_necessidade_id or v_existente.tipo_decisao<>p_tipo_decisao or v_existente.quantidade_estoque<>coalesce(p_quantidade_estoque,0) or v_existente.quantidade_compra<>coalesce(p_quantidade_compra,0) then raise exception 'Chave de idempotência já usada com conteúdo diferente.'; end if;
    if coalesce(p_quantidade_estoque,0)>0 and not exists(select 1 from public.reservas_estoque where empresa_id=v_empresa and decisao_necessidade_material_id=v_existente.id and estoque_saldo_id=p_estoque_saldo_id) then raise exception 'Chave de idempotência já usada com saldo diferente.';end if;
    return v_existente.id;
  end if;
  select * into v_necessidade from public.necessidades_materiais where empresa_id=v_empresa and id=p_necessidade_id and status='definir' and cancelada_em is null for update;
  if not found then raise exception 'Necessidade não está disponível para decisão.'; end if;
  if coalesce(p_quantidade_estoque,0)+coalesce(p_quantidade_compra,0)<>v_necessidade.quantidade_necessaria then raise exception 'A decisão deve atender exatamente a quantidade necessária.'; end if;
  if (p_tipo_decisao='estoque' and (p_quantidade_estoque<=0 or coalesce(p_quantidade_compra,0)<>0 or p_estoque_saldo_id is null)) or
     (p_tipo_decisao='compra' and (p_quantidade_compra<=0 or coalesce(p_quantidade_estoque,0)<>0 or p_estoque_saldo_id is not null)) or
     (p_tipo_decisao='estoque_compra' and (p_quantidade_estoque<=0 or p_quantidade_compra<=0 or p_estoque_saldo_id is null)) then raise exception 'Quantidades não correspondem ao tipo de decisão.'; end if;
  if exists(select 1 from public.decisoes_necessidade_material where empresa_id=v_empresa and necessidade_material_id=p_necessidade_id and cancelada_em is null) then raise exception 'Necessidade já possui decisão ativa.'; end if;
  select coalesce(max(revisao),0)+1 into v_revisao from public.decisoes_necessidade_material where empresa_id=v_empresa and necessidade_material_id=p_necessidade_id;
  insert into public.decisoes_necessidade_material(empresa_id,necessidade_material_id,tipo_decisao,quantidade_estoque,quantidade_compra,justificativa,revisao,idempotency_key,decidido_por)
  values(v_empresa,p_necessidade_id,p_tipo_decisao,coalesce(p_quantidade_estoque,0),coalesce(p_quantidade_compra,0),p_justificativa,v_revisao,p_idempotency_key,auth.uid()) returning id into v_decisao_id;
  if coalesce(p_quantidade_estoque,0)>0 then
    perform public.reservar_estoque(v_decisao_id,p_estoque_saldo_id,p_quantidade_estoque,p_idempotency_key||':reserva');
  end if;
  if coalesce(p_quantidade_compra,0)>0 then
    v_numero:=public.gerar_numero_entidade('requisicao_compra',extract(year from current_date)::integer);
    insert into public.requisicoes_compra(empresa_id,numero_requisicao,origem,projeto_id,of_id,data_necessidade,solicitante_id,observacoes,idempotency_key,created_by)
    select v_empresa,v_numero,'industrial',o.projeto_id,o.id,v_necessidade.data_necessidade,auth.uid(),p_justificativa,p_idempotency_key||':requisicao',auth.uid() from public.ordens_fabricacao o where o.empresa_id=v_empresa and o.id=v_necessidade.of_id returning id into v_req_id;
    insert into public.requisicao_compra_itens(empresa_id,requisicao_compra_id,materia_prima_id,descricao,quantidade,unidade,necessidade_material_id,decisao_necessidade_material_id,data_necessidade,created_by)
    select v_empresa,v_req_id,m.id,m.descricao,p_quantidade_compra,v_necessidade.unidade_snapshot,v_necessidade.id,v_decisao_id,v_necessidade.data_necessidade,auth.uid() from public.materias_primas m where m.empresa_id=v_empresa and m.id=v_necessidade.materia_prima_id;
    update public.necessidades_materiais set status=case when p_tipo_decisao='compra' then 'decisao_registrada' else 'atendimento_parcial' end,status_decisao='decidida',status_atendimento=case when p_tipo_decisao='compra' then 'requisitado' else 'parcial' end where id=p_necessidade_id;
  end if;
  return v_decisao_id;
end $function$;

create or replace function public.transicionar_requisicao_compra(p_requisicao_id uuid,p_estado_novo text,p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_req public.requisicoes_compra%rowtype; v_ok boolean;
begin
  if not public.usuario_tem_permissao('suprimentos.requisicao.transicionar') then raise exception 'Usuário sem permissão para transicionar requisição.' using errcode='42501'; end if;
  select * into v_req from public.requisicoes_compra where empresa_id=v_empresa and id=p_requisicao_id for update;
  if not found then raise exception 'Requisição não encontrada.'; end if;
  if v_req.status=p_estado_novo then return p_requisicao_id; end if;
  v_ok:=case v_req.status when 'aberta' then p_estado_novo in('em_cotacao','cancelada') when 'em_cotacao' then p_estado_novo in('aprovada','cancelada') when 'aprovada' then p_estado_novo in('cancelada') else false end;
  if not v_ok then raise exception 'Transição inválida de requisição: % → %.',v_req.status,p_estado_novo; end if;
  if p_estado_novo='cancelada' and exists(select 1 from public.planejamento_compra_origens where empresa_id=v_empresa and requisicao_compra_id=p_requisicao_id) then raise exception 'Requisição já vinculada a planejamento.'; end if;
  perform set_config('app.requisicao_motivo',coalesce(p_motivo,''),true);
  update public.requisicoes_compra set status=p_estado_novo,cancelada_em=case when p_estado_novo='cancelada' then now() else null end,cancelada_por=case when p_estado_novo='cancelada' then auth.uid() else null end,observacoes=coalesce(observacoes||E'\n','')||coalesce(p_motivo,'') where id=p_requisicao_id;
  return p_requisicao_id;
end $function$;

create or replace function public.cancelar_decisao_pcp(p_decisao_id uuid,p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_decisao public.decisoes_necessidade_material%rowtype; v_reserva record; v_req public.requisicoes_compra%rowtype;
begin
  if not public.usuario_tem_permissao('pcp.decisao.registrar') then raise exception 'Usuário sem permissão para cancelar decisão PCP.' using errcode='42501';end if;
  if nullif(btrim(p_motivo),'') is null then raise exception 'Motivo obrigatório para cancelar decisão.';end if;
  select * into v_decisao from public.decisoes_necessidade_material where empresa_id=v_empresa and id=p_decisao_id for update;
  if not found then raise exception 'Decisão não encontrada.';end if;
  if v_decisao.cancelada_em is not null then return p_decisao_id;end if;
  if exists(select 1 from public.reservas_estoque where empresa_id=v_empresa and decisao_necessidade_material_id=p_decisao_id and quantidade_consumida>0) then raise exception 'Decisão com consumo físico não pode ser cancelada.';end if;
  select r.* into v_req from public.requisicoes_compra r join public.requisicao_compra_itens i on i.empresa_id=r.empresa_id and i.requisicao_compra_id=r.id where i.empresa_id=v_empresa and i.decisao_necessidade_material_id=p_decisao_id;
  if found and v_req.status<>'aberta' then raise exception 'Decisão com requisição já processada não pode ser cancelada.';end if;
  for v_reserva in select id from public.reservas_estoque where empresa_id=v_empresa and decisao_necessidade_material_id=p_decisao_id and status='ativa' loop
    perform public.cancelar_reserva_estoque(v_reserva.id,p_motivo);
  end loop;
  if v_req.id is not null then
    perform set_config('app.requisicao_motivo',p_motivo,true);
    update public.requisicoes_compra set status='cancelada',cancelada_em=now(),cancelada_por=auth.uid() where id=v_req.id;
  end if;
  update public.decisoes_necessidade_material set cancelada_em=now(),cancelada_por=auth.uid() where id=p_decisao_id;
  update public.necessidades_materiais set status='definir',status_decisao='pendente',status_atendimento='pendente' where empresa_id=v_empresa and id=v_decisao.necessidade_material_id;
  return p_decisao_id;
end $function$;

create or replace function public.consolidar_planejamento_compra(p_requisicao_item_ids uuid[],p_quantidade_planejada numeric,p_estrategia text,p_justificativa text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_primeiro record; v_item record; v_existente public.planejamentos_compra%rowtype; v_total numeric(18,6):=0; v_id uuid; v_numero text; v_chave text;
begin
  if not public.usuario_tem_permissao('suprimentos.planejamento.consolidar') then raise exception 'Usuário sem permissão para consolidar compras.' using errcode='42501'; end if;
  if coalesce(cardinality(p_requisicao_item_ids),0)=0 or p_quantidade_planejada<=0 or p_estrategia not in('necessidade','formato_comercial','lote_minimo','antecipada') or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para planejamento.'; end if;
  if (select count(distinct x) from unnest(p_requisicao_item_ids) x)<>cardinality(p_requisicao_item_ids) then raise exception 'Lista de itens contém duplicidades.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
  select * into v_existente from public.planejamentos_compra where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
  if found then
    if v_existente.quantidade_planejada_compra<>p_quantidade_planejada or v_existente.estrategia<>p_estrategia or (select count(*) from public.planejamento_compra_origens where empresa_id=v_empresa and planejamento_compra_id=v_existente.id)<>cardinality(p_requisicao_item_ids) or exists(select 1 from unnest(p_requisicao_item_ids) x where not exists(select 1 from public.planejamento_compra_origens where empresa_id=v_empresa and planejamento_compra_id=v_existente.id and requisicao_compra_item_id=x)) then raise exception 'Chave de idempotência já usada com conteúdo diferente.';end if;
    return v_existente.id;
  end if;
  for v_item in select i.*,r.status,m.familia,m.tipo_grade,m.bitola from public.requisicao_compra_itens i join public.requisicoes_compra r on r.empresa_id=i.empresa_id and r.id=i.requisicao_compra_id join public.materias_primas m on m.empresa_id=i.empresa_id and m.id=i.materia_prima_id where i.empresa_id=v_empresa and i.id=any(p_requisicao_item_ids) for update of r loop
    if v_item.status not in('aberta','em_cotacao','aprovada') or exists(select 1 from public.planejamento_compra_origens where empresa_id=v_empresa and requisicao_compra_item_id=v_item.id) then raise exception 'Item não está disponível para planejamento.'; end if;
    if nullif(btrim(v_item.familia),'') is null or nullif(btrim(v_item.tipo_grade),'') is null or nullif(btrim(v_item.bitola),'') is null then raise exception 'Material sem Família, Grade ou Bitola para consolidação.'; end if;
    if v_primeiro is null then v_primeiro:=v_item; else
      if (v_item.materia_prima_id,v_item.familia,v_item.tipo_grade,v_item.bitola,v_item.unidade) is distinct from (v_primeiro.materia_prima_id,v_primeiro.familia,v_primeiro.tipo_grade,v_primeiro.bitola,v_primeiro.unidade) then raise exception 'Itens não possuem o mesmo material e chave de consolidação.'; end if;
    end if;
    v_total:=v_total+v_item.quantidade;
  end loop;
  if v_primeiro is null or (select count(*) from public.requisicao_compra_itens where empresa_id=v_empresa and id=any(p_requisicao_item_ids))<>cardinality(p_requisicao_item_ids) then raise exception 'Um ou mais itens não foram encontrados.'; end if;
  if p_quantidade_planejada<v_total then raise exception 'Quantidade planejada inferior à necessidade consolidada.'; end if;
  v_chave:=upper(v_primeiro.familia)||'|'||upper(v_primeiro.tipo_grade)||'|'||upper(v_primeiro.bitola);
  v_numero:=public.gerar_numero_entidade('planejamento_compra',extract(year from current_date)::integer);
  insert into public.planejamentos_compra(empresa_id,numero_planejamento,materia_prima_id,familia_snapshot,tipo_grade_snapshot,bitola_snapshot,chave_consolidacao,unidade_necessidade,quantidade_necessaria_total,quantidade_planejada_compra,sobra_prevista,estrategia,justificativa,idempotency_key,created_by)
  values(v_empresa,v_numero,v_primeiro.materia_prima_id,v_primeiro.familia,v_primeiro.tipo_grade,v_primeiro.bitola,v_chave,v_primeiro.unidade,v_total,p_quantidade_planejada,p_quantidade_planejada-v_total,p_estrategia,p_justificativa,p_idempotency_key,auth.uid()) returning id into v_id;
  insert into public.planejamento_compra_origens(empresa_id,planejamento_compra_id,requisicao_compra_id,requisicao_compra_item_id,quantidade_necessaria,unidade,data_necessidade,created_by)
  select v_empresa,v_id,i.requisicao_compra_id,i.id,i.quantidade,i.unidade,i.data_necessidade,auth.uid() from public.requisicao_compra_itens i where i.empresa_id=v_empresa and i.id=any(p_requisicao_item_ids);
  perform set_config('app.requisicao_motivo','Requisição incluída no planejamento de compras',true);
  update public.requisicoes_compra set status='em_cotacao' where empresa_id=v_empresa and id in(select requisicao_compra_id from public.planejamento_compra_origens where planejamento_compra_id=v_id) and status='aberta';
  return v_id;
end $function$;

create or replace function public.emitir_pedido_compra(p_planejamento_id uuid,p_fornecedor_id uuid,p_valor_unitario numeric,p_data_prevista date,p_moeda char(3),p_observacoes text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_plan public.planejamentos_compra%rowtype; v_fornecedor public.fornecedores%rowtype; v_existente public.pedidos_compra%rowtype; v_id uuid; v_numero text; v_descricao text;
begin
  if not public.usuario_tem_permissao('suprimentos.pedido.emitir') then raise exception 'Usuário sem permissão para emitir pedido.' using errcode='42501'; end if;
  if p_valor_unitario<0 or p_data_prevista<current_date or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para pedido.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
  select * into v_existente from public.pedidos_compra where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
  if found then
    if v_existente.planejamento_compra_id<>p_planejamento_id or v_existente.fornecedor_id<>p_fornecedor_id or v_existente.data_prevista_entrega is distinct from p_data_prevista or v_existente.moeda<>upper(coalesce(p_moeda,'BRL')) or not exists(select 1 from public.pedido_compra_itens where empresa_id=v_empresa and pedido_compra_id=v_existente.id and valor_unitario=p_valor_unitario) then raise exception 'Chave de idempotência já usada com conteúdo diferente.'; end if;
    return v_existente.id;
  end if;
  select * into v_plan from public.planejamentos_compra where empresa_id=v_empresa and id=p_planejamento_id and convertido_em is null and cancelado_em is null for update;
  select * into v_fornecedor from public.fornecedores where empresa_id=v_empresa and id=p_fornecedor_id and situacao='homologado' and ativo and deleted_at is null;
  if v_plan.id is null or v_fornecedor.id is null then raise exception 'Planejamento ou fornecedor não disponível.'; end if;
  if exists(select 1 from public.planejamento_compra_origens o join public.requisicoes_compra r on r.empresa_id=o.empresa_id and r.id=o.requisicao_compra_id where o.empresa_id=v_empresa and o.planejamento_compra_id=p_planejamento_id and r.status<>'aprovada') then raise exception 'Todas as requisições do planejamento devem estar aprovadas.'; end if;
  select descricao into v_descricao from public.materias_primas where empresa_id=v_empresa and id=v_plan.materia_prima_id;
  v_numero:=public.gerar_numero_entidade('pedido_compra',extract(year from current_date)::integer);
  insert into public.pedidos_compra(empresa_id,numero_pedido,fornecedor_id,planejamento_compra_id,data_prevista_entrega,moeda,observacoes,idempotency_key,created_by)
  values(v_empresa,v_numero,p_fornecedor_id,p_planejamento_id,p_data_prevista,upper(coalesce(p_moeda,'BRL')),p_observacoes,p_idempotency_key,auth.uid()) returning id into v_id;
  insert into public.pedido_compra_itens(empresa_id,pedido_compra_id,planejamento_compra_id,materia_prima_id,descricao,quantidade_pedida,unidade,valor_unitario,created_by)
  values(v_empresa,v_id,p_planejamento_id,v_plan.materia_prima_id,v_descricao,v_plan.quantidade_planejada_compra,v_plan.unidade_necessidade,p_valor_unitario,auth.uid());
  update public.planejamentos_compra set convertido_em=now() where id=p_planejamento_id;
  perform set_config('app.requisicao_motivo','Requisição convertida em pedido de compra',true);
  update public.requisicoes_compra set status='convertida_pedido' where empresa_id=v_empresa and id in(select requisicao_compra_id from public.planejamento_compra_origens where planejamento_compra_id=p_planejamento_id);
  return v_id;
end $function$;

create or replace function public.registrar_recebimento_compra(p_pedido_item_id uuid,p_quantidade_recebida numeric,p_quantidade_aceita numeric,p_local_estoque_id uuid,p_documento_fiscal text,p_exige_inspecao boolean,p_observacoes text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_item record; v_item_existente public.recebimento_itens%rowtype; v_existente public.recebimentos%rowtype; v_id uuid; v_numero text;
begin
  if not public.usuario_tem_permissao('suprimentos.recebimento.registrar') then raise exception 'Usuário sem permissão para registrar recebimento.' using errcode='42501'; end if;
  if p_quantidade_recebida<=0 or p_quantidade_aceita<0 or p_quantidade_aceita>p_quantidade_recebida or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Parâmetros inválidos para recebimento.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||p_idempotency_key,0));
  select * into v_existente from public.recebimentos where empresa_id=v_empresa and idempotency_key=p_idempotency_key;
  if found then
    select * into v_item_existente from public.recebimento_itens where empresa_id=v_empresa and recebimento_id=v_existente.id;
    if v_item_existente.pedido_compra_item_id<>p_pedido_item_id or v_item_existente.quantidade_recebida<>p_quantidade_recebida or v_item_existente.quantidade_aceita<>p_quantidade_aceita or v_item_existente.local_estoque_id<>p_local_estoque_id or v_existente.documento_fiscal is distinct from p_documento_fiscal or v_existente.exige_inspecao<>coalesce(p_exige_inspecao,false) then raise exception 'Chave de idempotência já usada com conteúdo diferente.';end if;
    return v_existente.id;
  end if;
  select i.*,p.status as pedido_status into v_item from public.pedido_compra_itens i join public.pedidos_compra p on p.empresa_id=i.empresa_id and p.id=i.pedido_compra_id where i.empresa_id=v_empresa and i.id=p_pedido_item_id for update of i,p;
  if not found or v_item.pedido_status not in('emitido','parcialmente_recebido') or v_item.quantidade_recebida+p_quantidade_aceita>v_item.quantidade_pedida then raise exception 'Item do pedido não está disponível para esta quantidade.'; end if;
  if not exists(select 1 from public.locais_estoque where empresa_id=v_empresa and id=p_local_estoque_id and ativo and permite_saldo and deleted_at is null) then raise exception 'Local de estoque indisponível.'; end if;
  v_numero:=public.gerar_numero_entidade('recebimento',extract(year from current_date)::integer);
  insert into public.recebimentos(empresa_id,numero_recebimento,pedido_compra_id,documento_fiscal,exige_inspecao,observacoes,idempotency_key,created_by)
  values(v_empresa,v_numero,v_item.pedido_compra_id,p_documento_fiscal,coalesce(p_exige_inspecao,false),p_observacoes,p_idempotency_key,auth.uid()) returning id into v_id;
  insert into public.recebimento_itens(empresa_id,recebimento_id,pedido_compra_item_id,materia_prima_id,local_estoque_id,quantidade_recebida,quantidade_aceita,unidade,observacoes,created_by)
  values(v_empresa,v_id,p_pedido_item_id,v_item.materia_prima_id,p_local_estoque_id,p_quantidade_recebida,p_quantidade_aceita,v_item.unidade,p_observacoes,auth.uid());
  return v_id;
end $function$;

create or replace function public.liberar_recebimento_no_estoque(p_recebimento_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_item record; v_origem record; v_material public.materias_primas%rowtype; v_saldo public.estoque_saldos%rowtype; v_necessidade public.necessidades_materiais%rowtype; v_disponivel numeric(18,6); v_alocado numeric(18,6); v_qtd numeric(18,6); v_reserva_id uuid; v_mov_key text; v_res_key text;
begin
  for v_item in select ri.*,pci.pedido_compra_id,pci.planejamento_compra_id from public.recebimento_itens ri join public.pedido_compra_itens pci on pci.empresa_id=ri.empresa_id and pci.id=ri.pedido_compra_item_id where ri.empresa_id=v_empresa and ri.recebimento_id=p_recebimento_id loop
    if v_item.quantidade_aceita=0 then continue; end if;
    select * into v_material from public.materias_primas where empresa_id=v_empresa and id=v_item.materia_prima_id;
    perform pg_advisory_xact_lock(hashtextextended(v_empresa::text||':'||v_item.materia_prima_id::text||':'||v_item.local_estoque_id::text,0));
    insert into public.estoque_saldos(empresa_id,materia_prima_id,local_estoque_id,unidade) values(v_empresa,v_item.materia_prima_id,v_item.local_estoque_id,v_material.unidade) on conflict(empresa_id,materia_prima_id,local_estoque_id) do nothing;
    select * into v_saldo from public.estoque_saldos where empresa_id=v_empresa and materia_prima_id=v_item.materia_prima_id and local_estoque_id=v_item.local_estoque_id for update;
    v_mov_key:='recebimento:'||v_item.id::text;
    if not exists(select 1 from public.estoque_movimentacoes where empresa_id=v_empresa and idempotency_key=v_mov_key and tipo='recebimento') then
      update public.estoque_saldos set quantidade_fisica=quantidade_fisica+v_item.quantidade_aceita where id=v_saldo.id;
      insert into public.estoque_movimentacoes(empresa_id,estoque_saldo_id,materia_prima_id,local_estoque_id,tipo,quantidade,saldo_fisico_anterior,saldo_fisico_posterior,origem_tipo,origem_id,idempotency_key,motivo,ocorrido_por)
      values(v_empresa,v_saldo.id,v_item.materia_prima_id,v_item.local_estoque_id,'recebimento',v_item.quantidade_aceita,v_saldo.quantidade_fisica,v_saldo.quantidade_fisica+v_item.quantidade_aceita,'recebimento_item',v_item.id,v_mov_key,'Recebimento liberado',auth.uid());
      update public.pedido_compra_itens set quantidade_recebida=quantidade_recebida+v_item.quantidade_aceita where empresa_id=v_empresa and id=v_item.pedido_compra_item_id;
    end if;
    v_disponivel:=v_item.quantidade_aceita;
    for v_origem in select po.*,rci.necessidade_material_id,rci.decisao_necessidade_material_id from public.planejamento_compra_origens po join public.requisicao_compra_itens rci on rci.empresa_id=po.empresa_id and rci.id=po.requisicao_compra_item_id where po.empresa_id=v_empresa and po.planejamento_compra_id=v_item.planejamento_compra_id and rci.necessidade_material_id is not null order by po.data_necessidade nulls last,po.created_at loop
      exit when v_disponivel<=0;
      select * into v_necessidade from public.necessidades_materiais where empresa_id=v_empresa and id=v_origem.necessidade_material_id for update;
      select coalesce(sum(quantidade_reservada),0) into v_alocado from public.reservas_estoque where empresa_id=v_empresa and necessidade_material_id=v_necessidade.id and status in('ativa','consumida');
      v_qtd:=least(v_disponivel,greatest(v_necessidade.quantidade_necessaria-v_alocado,0));
      if v_qtd>0 then
        v_res_key:='recebimento:'||v_item.id::text||':'||v_necessidade.id::text;
        insert into public.reservas_estoque(empresa_id,decisao_necessidade_material_id,necessidade_material_id,of_id,materia_prima_id,local_estoque_id,estoque_saldo_id,quantidade_reservada,unidade,idempotency_key,reservada_por)
        values(v_empresa,v_origem.decisao_necessidade_material_id,v_necessidade.id,v_necessidade.of_id,v_necessidade.materia_prima_id,v_item.local_estoque_id,v_saldo.id,v_qtd,v_necessidade.unidade_snapshot,v_res_key,auth.uid()) on conflict(empresa_id,idempotency_key) do nothing returning id into v_reserva_id;
        if v_reserva_id is not null then
          update public.estoque_saldos set quantidade_reservada=quantidade_reservada+v_qtd where id=v_saldo.id;
          insert into public.reserva_estoque_eventos(empresa_id,reserva_estoque_id,evento,estado_novo,quantidade,motivo,ocorrido_por) values(v_empresa,v_reserva_id,'criada','ativa',v_qtd,'Reserva criada após liberação do recebimento',auth.uid());
          perform public.recalcular_atendimento_necessidade_estoque(v_necessidade.id);
        end if;
        v_disponivel:=v_disponivel-v_qtd;
      end if;
    end loop;
  end loop;
  perform set_config('app.pedido_motivo','Pedido atualizado pela liberação do recebimento',true);
  update public.pedidos_compra p set status=case when not exists(select 1 from public.pedido_compra_itens i where i.empresa_id=p.empresa_id and i.pedido_compra_id=p.id and i.quantidade_recebida<i.quantidade_pedida) then 'recebido' else 'parcialmente_recebido' end where p.empresa_id=v_empresa and p.id=(select pedido_compra_id from public.recebimentos where empresa_id=v_empresa and id=p_recebimento_id);
end $function$;
revoke all on function public.liberar_recebimento_no_estoque(uuid) from public;

create or replace function public.transicionar_recebimento(p_recebimento_id uuid,p_estado_novo text,p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_rec public.recebimentos%rowtype; v_ok boolean:=false;
begin
  if not public.usuario_tem_permissao('suprimentos.recebimento.transicionar') then raise exception 'Usuário sem permissão para transicionar recebimento.' using errcode='42501'; end if;
  select * into v_rec from public.recebimentos where empresa_id=v_empresa and id=p_recebimento_id for update;
  if not found then raise exception 'Recebimento não encontrado.'; end if;
  if v_rec.status=p_estado_novo then return p_recebimento_id; end if;
  v_ok:=case v_rec.status
    when 'aguardando_recebimento' then p_estado_novo in('recebimento_fisico','rejeitado')
    when 'recebimento_fisico' then p_estado_novo in('conferencia_documental','rejeitado')
    when 'conferencia_documental' then p_estado_novo=case when v_rec.exige_inspecao then 'inspecao' else 'liberado' end or p_estado_novo='rejeitado'
    when 'inspecao' then p_estado_novo in('liberado','rejeitado') else false end;
  if not v_ok then raise exception 'Transição inválida de recebimento: % → %.',v_rec.status,p_estado_novo; end if;
  if p_estado_novo in('conferencia_documental','inspecao','liberado') and nullif(btrim(v_rec.documento_fiscal),'') is null then raise exception 'Documento fiscal obrigatório para conferência e liberação.'; end if;
  if p_estado_novo='liberado' and not exists(select 1 from public.recebimento_itens where empresa_id=v_empresa and recebimento_id=p_recebimento_id and quantidade_aceita>0) then raise exception 'Recebimento sem quantidade aceita não pode ser liberado.';end if;
  if p_estado_novo='liberado' and v_rec.status='inspecao' and to_regclass('public.liberacoes_qualidade') is not null then
    if nullif(current_setting('app.qualidade_liberacao_id',true),'') is null or not exists(
      select 1 from public.liberacoes_qualidade l join public.inspecoes_qualidade i on i.empresa_id=l.empresa_id and i.id=l.inspecao_qualidade_id join public.recebimento_itens ri on ri.empresa_id=i.empresa_id and ri.id=i.recebimento_item_id
      where l.empresa_id=v_empresa and l.id=current_setting('app.qualidade_liberacao_id')::uuid and l.decisao='liberado' and i.tipo='recebimento' and ri.recebimento_id=p_recebimento_id
    ) then raise exception 'Liberação do recebimento exige decisão formal da Qualidade.';end if;
  end if;
  perform set_config('app.recebimento_motivo',coalesce(p_motivo,''),true);
  update public.recebimentos set status=p_estado_novo where id=p_recebimento_id;
  if p_estado_novo='liberado' then perform public.liberar_recebimento_no_estoque(p_recebimento_id); end if;
  return p_recebimento_id;
end $function$;

create or replace function public.encerrar_pedido_compra(p_pedido_id uuid,p_acao text,p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_empresa uuid:=public.empresa_atual_id(); v_pedido public.pedidos_compra%rowtype;
begin
  if not public.usuario_tem_permissao('suprimentos.pedido.encerrar') then raise exception 'Usuário sem permissão para encerrar pedido.' using errcode='42501'; end if;
  if p_acao not in('encerrar','cancelar') or nullif(btrim(p_motivo),'') is null then raise exception 'Parâmetros inválidos para encerramento do pedido.'; end if;
  select * into v_pedido from public.pedidos_compra where empresa_id=v_empresa and id=p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if p_acao='encerrar' and v_pedido.status<>'recebido' then raise exception 'Somente pedido recebido pode ser encerrado.'; end if;
  if p_acao='cancelar' and (v_pedido.status not in('emitido','parcialmente_recebido') or exists(select 1 from public.pedido_compra_itens where empresa_id=v_empresa and pedido_compra_id=p_pedido_id and quantidade_recebida>0)) then raise exception 'Pedido com recebimento não pode ser cancelado.'; end if;
  perform set_config('app.pedido_motivo',p_motivo,true);
  update public.pedidos_compra set status=case when p_acao='encerrar' then 'encerrado' else 'cancelado' end,encerrado_em=case when p_acao='encerrar' then now() else null end,cancelado_em=case when p_acao='cancelar' then now() else null end,observacoes=coalesce(observacoes||E'\n','')||p_motivo where id=p_pedido_id;
  return p_pedido_id;
end $function$;

revoke all on function public.registrar_decisao_pcp(uuid,text,numeric,numeric,uuid,text,text),public.cancelar_decisao_pcp(uuid,text),public.transicionar_requisicao_compra(uuid,text,text),public.consolidar_planejamento_compra(uuid[],numeric,text,text,text),public.emitir_pedido_compra(uuid,uuid,numeric,date,char,text,text),public.registrar_recebimento_compra(uuid,numeric,numeric,uuid,text,boolean,text,text),public.transicionar_recebimento(uuid,text,text),public.encerrar_pedido_compra(uuid,text,text) from public;
grant execute on function public.registrar_decisao_pcp(uuid,text,numeric,numeric,uuid,text,text),public.cancelar_decisao_pcp(uuid,text),public.transicionar_requisicao_compra(uuid,text,text),public.consolidar_planejamento_compra(uuid[],numeric,text,text,text),public.emitir_pedido_compra(uuid,uuid,numeric,date,char,text,text),public.registrar_recebimento_compra(uuid,numeric,numeric,uuid,text,boolean,text,text),public.transicionar_recebimento(uuid,text,text),public.encerrar_pedido_compra(uuid,text,text) to authenticated,service_role;

do $security$ declare v_table text; begin
  foreach v_table in array array['fornecedores','requisicoes_compra','requisicao_compra_itens','requisicao_compra_eventos','planejamentos_compra','planejamento_compra_origens','pedidos_compra','pedido_compra_itens','pedido_compra_eventos','recebimentos','recebimento_itens','recebimento_eventos'] loop
    execute format('revoke all on table public.%I from public,anon,authenticated',v_table);
    execute format('grant all on table public.%I to service_role',v_table);
    execute format('alter table public.%I enable row level security',v_table);
    execute format('create policy %I on public.%I for select to authenticated using (empresa_id=public.empresa_atual_id())',v_table||'_select',v_table);
  end loop;
end $security$;
grant select on public.fornecedores,public.requisicoes_compra,public.requisicao_compra_itens,public.requisicao_compra_eventos,public.planejamentos_compra,public.planejamento_compra_origens,public.pedidos_compra,public.pedido_compra_itens,public.pedido_compra_eventos,public.recebimentos,public.recebimento_itens,public.recebimento_eventos to authenticated;
grant insert,update on public.fornecedores to authenticated;
create policy fornecedores_insert on public.fornecedores for insert to authenticated with check(empresa_id=public.empresa_atual_id() and created_by=auth.uid() and public.usuario_tem_permissao('suprimentos.fornecedores.gerenciar'));
create policy fornecedores_update on public.fornecedores for update to authenticated using(empresa_id=public.empresa_atual_id() and public.usuario_tem_permissao('suprimentos.fornecedores.gerenciar')) with check(empresa_id=public.empresa_atual_id() and public.usuario_tem_permissao('suprimentos.fornecedores.gerenciar'));

comment on table public.requisicoes_compra is 'Formalização rastreável da aquisição; não identifica a necessidade, referencia-a por seus itens.';
comment on table public.planejamentos_compra is 'Consolidação técnica das requisições por Família, Grade e Bitola; decisão final permanece humana.';
comment on table public.pedidos_compra is 'Compromisso comercial emitido para fornecedor homologado.';
comment on table public.recebimentos is 'Gate físico, documental e opcionalmente técnico antes da entrada no estoque.';

commit;
