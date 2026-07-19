-- Etapa 2 do motor de Simulacao Comercial: campo situacao_comercial em
-- projetos + tabela de auditoria historico_situacao_comercial. Ver
-- ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secao 11.
--
-- Valores de dominio em snake_case minusculo, sem acento - mesma
-- convencao usada em projetos.status, projetos.tipo_projeto,
-- calendario_oficial_feriados.abrangencia e
-- calendario_empresa_eventos.tipo. Os rotulos em portugues da secao
-- 11.1 (Consulta, Proposta Enviada, Negociacao, Compromisso Verbal,
-- Pedido Recebido) sao label de exibicao, nao valor armazenado.

-- (a) Coluna nullable, com CHECK - sem NOT NULL/DEFAULT ainda, para o
-- backfill (b) poder distinguir quem ja tem valor de quem nao tem.
alter table public.projetos
  add column situacao_comercial text
    check (situacao_comercial in (
      'consulta', 'proposta_enviada', 'negociacao',
      'compromisso_verbal', 'pedido_recebido'
    ));

-- (b) Backfill: todo projeto existente nasce em "consulta". Roda ANTES
-- da trigger existir (criada so no passo d) - este UPDATE em massa nao
-- gera nenhuma linha em historico_situacao_comercial, porque backfill
-- de inicializacao de funcionalidade nao e uma transicao comercial real.
update public.projetos
set situacao_comercial = 'consulta'
where situacao_comercial is null;

-- (c) NOT NULL + DEFAULT, agora que todo projeto existente tem valor.
alter table public.projetos
  alter column situacao_comercial set not null,
  alter column situacao_comercial set default 'consulta';

comment on column public.projetos.situacao_comercial is
  'Fatos observaveis da negociacao comercial com o cliente - eixo independente de status (workflow interno). consulta -> proposta_enviada -> negociacao -> compromisso_verbal -> pedido_recebido. Ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secao 11.1. Regras de transicao entre estados (sequencia obrigatoria ou livre) sao decisao de negocio PENDENTE - NAO implementada nesta migration, em nenhuma camada (banco ou aplicacao). Nao inferir nem implementar essa trava sem validacao explicita do responsavel de negocio.';

-- (d) Tabela de auditoria - append-only real (RLS nega toda escrita
-- para authenticated; unica gravacao possivel e via trigger abaixo,
-- SECURITY DEFINER). empresa_id denormalizado, mesmo padrao de toda
-- outra tabela-filha de projetos no schema.
create table public.historico_situacao_comercial (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  projeto_id uuid not null references public.projetos(id),
  situacao_anterior text not null check (situacao_anterior in (
    'consulta', 'proposta_enviada', 'negociacao',
    'compromisso_verbal', 'pedido_recebido'
  )),
  situacao_nova text not null check (situacao_nova in (
    'consulta', 'proposta_enviada', 'negociacao',
    'compromisso_verbal', 'pedido_recebido'
  )),
  usuario_id uuid references auth.users(id),
  origem text not null check (origem in (
    'manual', 'automatica', 'importacao', 'integracao'
  )),
  created_at timestamptz not null default now(),
  constraint historico_situacao_comercial_transicao_chk
    check (situacao_anterior <> situacao_nova)
);

comment on table public.historico_situacao_comercial is
  'Log de auditoria append-only de mudancas de projetos.situacao_comercial - uma linha por transicao, gravada automaticamente por trigger. Ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secao 11.3. Obrigatorio desde a v1 - mudancas de negociacao comercial nao sao reconstruiveis retroativamente se nao capturadas no momento em que acontecem.';

create index historico_situacao_comercial_empresa_projeto_idx
  on public.historico_situacao_comercial (empresa_id, projeto_id);

alter table public.historico_situacao_comercial enable row level security;

create policy historico_situacao_comercial_select_tenant
  on public.historico_situacao_comercial
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

-- Append-only real, nao por convencao: nenhuma policy permissiva de
-- escrita para authenticated. A unica gravacao possivel e via trigger
-- SECURITY DEFINER abaixo.
create policy historico_situacao_comercial_insert_blocked
  on public.historico_situacao_comercial
  for insert to authenticated
  with check (false);

create policy historico_situacao_comercial_update_blocked
  on public.historico_situacao_comercial
  for update to authenticated
  using (false);

create policy historico_situacao_comercial_delete_blocked
  on public.historico_situacao_comercial
  for delete to authenticated
  using (false);

-- Funcao + trigger: registra a transicao automaticamente. SECURITY
-- DEFINER para poder escrever no historico mesmo com RLS negando
-- INSERT para authenticated. origem vem de
-- current_setting('app.origem_situacao_comercial', true) - primeiro
-- uso desse mecanismo de contexto de sessao no projeto, sem precedente
-- anterior. Nunca falha por falta de contexto - usa 'manual' como
-- fallback quando o valor nao foi setado, esta vazio, ou e invalido.
create or replace function public.trg_projetos_historico_situacao_comercial()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_origem text;
begin
  v_origem := nullif(current_setting('app.origem_situacao_comercial', true), '');

  if v_origem is null or v_origem not in ('manual', 'automatica', 'importacao', 'integracao') then
    v_origem := 'manual';
  end if;

  insert into public.historico_situacao_comercial (
    empresa_id, projeto_id, situacao_anterior, situacao_nova, usuario_id, origem
  )
  values (
    new.empresa_id, new.id, old.situacao_comercial, new.situacao_comercial, auth.uid(), v_origem
  );

  return new;
end;
$function$;

comment on function public.trg_projetos_historico_situacao_comercial() is
  'Popula historico_situacao_comercial automaticamente a cada mudanca de projetos.situacao_comercial. SECURITY DEFINER: RLS de historico_situacao_comercial nega toda escrita direta de authenticated, entao a unica forma de gravar e via esta trigger. Origem lida de current_setting(''app.origem_situacao_comercial'', true) com fallback ''manual'' se ausente/invalido/vazio - nunca falha por falta desse contexto.';

drop trigger if exists projetos_historico_situacao_comercial on public.projetos;
create trigger projetos_historico_situacao_comercial
  after update of situacao_comercial on public.projetos
  for each row
  when (old.situacao_comercial is distinct from new.situacao_comercial)
  execute function public.trg_projetos_historico_situacao_comercial();
