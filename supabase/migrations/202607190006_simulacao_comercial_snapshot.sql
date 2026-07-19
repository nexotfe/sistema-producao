-- Etapa 3 do motor de Simulacao Comercial: persistencia do snapshot de
-- simulacao aprovada (cabecalho + itens por recurso). Ver
-- ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secoes 11-14.
--
-- Cenario de Demanda e Modo de Producao ainda nao tem persistencia
-- propria no sistema (nenhuma tabela de configuracao existe hoje) -
-- gravados aqui como texto livre, sem FK, de proposito. Uma tabela de
-- configuracao de Cenario de Demanda por empresa (secao 11.4) e
-- iniciativa futura separada, fora do escopo desta migration. Nao
-- presumir que a ausencia de FK aqui e descuido.

-- =========================================================
-- Cabecalho: 1 linha por simulacao aprovada
-- =========================================================
create table public.simulacoes_comerciais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  projeto_id uuid not null references public.projetos(id),
  cenario_demanda text not null,
  modo_producao text not null,
  data_necessidade date not null,
  margem_seguranca_dias integer not null check (margem_seguranca_dias >= 0),
  janela_inicio date not null,
  janela_fim date not null check (janela_fim >= janela_inicio),
  vigente boolean not null default true,
  aprovado_em timestamptz not null default now(),
  aprovado_por uuid not null references auth.users(id)
);

comment on table public.simulacoes_comerciais is
  'Snapshot congelado de uma simulacao comercial aprovada - cabecalho. Uma linha por aprovacao; aprovacoes sucessivas do mesmo projeto geram novas linhas, preservando as anteriores (vigente=false). Escrita exclusiva via aprovar_projeto_com_simulacao() - RLS nega toda escrita direta de authenticated. Ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secoes 11-14.';
comment on column public.simulacoes_comerciais.cenario_demanda is
  'Valor/label escolhido no momento da aprovacao, texto livre - nao ha tabela de configuracao de Cenario de Demanda por empresa ainda (secao 11.4). Decisao explicita, nao descuido.';
comment on column public.simulacoes_comerciais.modo_producao is
  'Valor/label escolhido no momento da aprovacao, texto livre - mesma justificativa de cenario_demanda, nao ha tabela de configuracao de Modo de Producao ainda.';

-- No maximo 1 snapshot vigente por projeto - mesmo mecanismo ja usado
-- e testado na Etapa 1 (calendario_empresa_eventos_ativo_unico).
create unique index simulacoes_comerciais_vigente_unico
  on public.simulacoes_comerciais (projeto_id)
  where vigente = true;

create index simulacoes_comerciais_empresa_projeto_idx
  on public.simulacoes_comerciais (empresa_id, projeto_id);

alter table public.simulacoes_comerciais enable row level security;

create policy simulacoes_comerciais_select_tenant
  on public.simulacoes_comerciais
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

-- Append-only real (identico ao padrao de historico_situacao_comercial,
-- Etapa 2): nenhuma policy permissiva de escrita para authenticated.
-- Ate a atualizacao de vigente=false do snapshot anterior acontece
-- dentro da mesma function SECURITY DEFINER, nao via UPDATE direto.
create policy simulacoes_comerciais_insert_blocked
  on public.simulacoes_comerciais
  for insert to authenticated
  with check (false);

create policy simulacoes_comerciais_update_blocked
  on public.simulacoes_comerciais
  for update to authenticated
  using (false);

create policy simulacoes_comerciais_delete_blocked
  on public.simulacoes_comerciais
  for delete to authenticated
  using (false);

-- =========================================================
-- Itens: 1 linha por recurso dentro de uma simulacao
-- =========================================================
create table public.simulacao_comercial_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  simulacao_comercial_id uuid not null references public.simulacoes_comerciais(id),
  recurso_produtivo_id uuid not null references public.recursos_produtivos(id),
  necessario numeric not null check (necessario >= 0),
  capacidade_bruta numeric not null check (capacidade_bruta >= 0),
  capacidade_efetiva numeric not null check (capacidade_efetiva >= 0),
  capacidade_disponivel numeric not null check (capacidade_disponivel >= 0),
  comprometido numeric not null check (comprometido >= 0),
  livre numeric not null check (livre >= 0),
  deficit numeric not null check (deficit >= 0),
  created_at timestamptz not null default now()
);

comment on table public.simulacao_comercial_itens is
  'Linhas por recurso de um snapshot de simulacao comercial (simulacoes_comerciais) - os 7 valores da formula da secao 14. Escrita exclusiva via aprovar_projeto_com_simulacao(). Ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secao 14.';

create index simulacao_comercial_itens_simulacao_idx
  on public.simulacao_comercial_itens (simulacao_comercial_id);

create index simulacao_comercial_itens_empresa_idx
  on public.simulacao_comercial_itens (empresa_id);

alter table public.simulacao_comercial_itens enable row level security;

create policy simulacao_comercial_itens_select_tenant
  on public.simulacao_comercial_itens
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

create policy simulacao_comercial_itens_insert_blocked
  on public.simulacao_comercial_itens
  for insert to authenticated
  with check (false);

create policy simulacao_comercial_itens_update_blocked
  on public.simulacao_comercial_itens
  for update to authenticated
  using (false);

create policy simulacao_comercial_itens_delete_blocked
  on public.simulacao_comercial_itens
  for delete to authenticated
  using (false);

-- =========================================================
-- Trigger: bloqueia UPDATE direto de projetos.status para 'aprovado'
-- =========================================================
-- RLS nao consegue expressar "so permite este UPDATE se a linha ja
-- estava aprovada antes" - USING (RLS) so enxerga a linha antiga e
-- WITH CHECK (RLS) so enxerga a linha nova, nenhuma das duas tem acesso
-- a old.*/new.* simultaneamente (isso so existe em trigger). Por isso a
-- garantia "so aprova via function" e imposta por uma trigger BEFORE
-- UPDATE, que verifica uma flag de contexto de transacao setada
-- exclusivamente por aprovar_projeto_com_simulacao(). SECURITY DEFINER
-- ignora RLS, mas NAO ignora triggers de tabela - por isso a function
-- precisa setar essa flag explicitamente antes do seu proprio UPDATE.
create or replace function public.trg_projetos_bloquear_aprovacao_direta()
returns trigger
language plpgsql
as $function$
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    if coalesce(current_setting('app.aprovacao_via_function', true), '') <> 'true' then
      raise exception 'Transicao de status para aprovado so pode ser feita via aprovar_projeto_com_simulacao().';
    end if;
  end if;

  return new;
end;
$function$;

comment on function public.trg_projetos_bloquear_aprovacao_direta() is
  'Bloqueia UPDATE direto de projetos.status para aprovado por qualquer caminho que nao seja aprovar_projeto_com_simulacao() - garante que todo projeto aprovado tenha um snapshot de simulacao correspondente. Le a flag app.aprovacao_via_function (setada via set_config, is_local=true, exclusivamente dentro da function) - RAISE EXCEPTION se a transicao for tentada sem essa flag.';

-- Funcao de trigger nao e chamavel diretamente via SQL comum (Postgres
-- exige que so seja invocada como trigger) - revoke aqui e higiene
-- defensiva, nao corrige uma vulnerabilidade explorável como a de
-- aprovar_projeto_com_simulacao.
revoke execute on function public.trg_projetos_bloquear_aprovacao_direta() from public;
revoke execute on function public.trg_projetos_bloquear_aprovacao_direta() from anon;

drop trigger if exists projetos_bloquear_aprovacao_direta on public.projetos;
create trigger projetos_bloquear_aprovacao_direta
  before update of status on public.projetos
  for each row
  when (old.status is distinct from new.status)
  execute function public.trg_projetos_bloquear_aprovacao_direta();

-- =========================================================
-- Function: aprova o projeto e grava o snapshot, atomicamente
-- =========================================================
create or replace function public.aprovar_projeto_com_simulacao(
  p_projeto_id uuid,
  p_cenario_demanda text,
  p_modo_producao text,
  p_data_necessidade date,
  p_margem_seguranca_dias integer,
  p_janela_inicio date,
  p_janela_fim date,
  p_itens jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_snapshot_id uuid;
  v_item jsonb;
  v_recurso_empresa_id uuid;
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'p_itens nao pode ser vazio - uma simulacao sem nenhum recurso nao e valida.';
  end if;

  select empresa_id into v_empresa_id
  from public.projetos
  where id = p_projeto_id;

  if v_empresa_id is null then
    raise exception 'Projeto % nao encontrado.', p_projeto_id;
  end if;

  -- empresa_atual_id() retorna NULL para chamador nao autenticado (ex:
  -- role anon, sem JWT valido). "<>" com NULL de qualquer lado avalia
  -- para NULL em SQL, e "if NULL then" e tratado como falso pelo
  -- PL/pgSQL - ou seja, "v_empresa_id <> empresa_atual_id()" sozinho
  -- NUNCA bloqueia um chamador nao autenticado, porque a comparacao
  -- nunca da true nesse caso. Checagem explicita de NULL primeiro,
  -- depois "is distinct from" (nao "<>") para o caso em que ambos os
  -- lados tem valor mas sao diferentes.
  if public.empresa_atual_id() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if v_empresa_id is distinct from public.empresa_atual_id() then
    raise exception 'Projeto % nao pertence a empresa atual.', p_projeto_id;
  end if;

  -- Valida cada item ANTES de qualquer escrita: recurso existe, pertence
  -- a mesma empresa, e os 7 valores sao nao-negativos (checagem
  -- explicita aqui da uma mensagem de erro clara; o CHECK das colunas
  -- fica como defesa em profundidade, caso algum outro caminho futuro
  -- insira nesta tabela sem passar por esta function).
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    if not (v_item ? 'recurso_produtivo_id') then
      raise exception 'Item de simulacao sem recurso_produtivo_id: %', v_item;
    end if;

    select empresa_id into v_recurso_empresa_id
    from public.recursos_produtivos
    where id = (v_item->>'recurso_produtivo_id')::uuid;

    if v_recurso_empresa_id is null then
      raise exception 'Recurso produtivo % nao encontrado.', v_item->>'recurso_produtivo_id';
    end if;

    if v_recurso_empresa_id <> v_empresa_id then
      raise exception 'Recurso produtivo % nao pertence a empresa do projeto.', v_item->>'recurso_produtivo_id';
    end if;

    if (v_item->>'necessario')::numeric < 0
      or (v_item->>'capacidade_bruta')::numeric < 0
      or (v_item->>'capacidade_efetiva')::numeric < 0
      or (v_item->>'capacidade_disponivel')::numeric < 0
      or (v_item->>'comprometido')::numeric < 0
      or (v_item->>'livre')::numeric < 0
      or (v_item->>'deficit')::numeric < 0
    then
      raise exception 'Item de simulacao com valor negativo para recurso %: %', v_item->>'recurso_produtivo_id', v_item;
    end if;
  end loop;

  update public.simulacoes_comerciais
  set vigente = false
  where projeto_id = p_projeto_id
    and vigente = true;

  insert into public.simulacoes_comerciais (
    empresa_id, projeto_id, cenario_demanda, modo_producao, data_necessidade,
    margem_seguranca_dias, janela_inicio, janela_fim, aprovado_por
  )
  values (
    v_empresa_id, p_projeto_id, p_cenario_demanda, p_modo_producao, p_data_necessidade,
    p_margem_seguranca_dias, p_janela_inicio, p_janela_fim, auth.uid()
  )
  returning id into v_snapshot_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into public.simulacao_comercial_itens (
      empresa_id, simulacao_comercial_id, recurso_produtivo_id,
      necessario, capacidade_bruta, capacidade_efetiva, capacidade_disponivel,
      comprometido, livre, deficit
    )
    values (
      v_empresa_id, v_snapshot_id, (v_item->>'recurso_produtivo_id')::uuid,
      (v_item->>'necessario')::numeric, (v_item->>'capacidade_bruta')::numeric,
      (v_item->>'capacidade_efetiva')::numeric, (v_item->>'capacidade_disponivel')::numeric,
      (v_item->>'comprometido')::numeric, (v_item->>'livre')::numeric, (v_item->>'deficit')::numeric
    );
  end loop;

  perform set_config('app.aprovacao_via_function', 'true', true);

  update public.projetos
  set status = 'aprovado'
  where id = p_projeto_id;

  return v_snapshot_id;
end;
$function$;

comment on function public.aprovar_projeto_com_simulacao(uuid, text, text, date, integer, date, date, jsonb) is
  'Aprova um projeto e grava o snapshot de simulacao comercial (cabecalho + itens por recurso) numa unica transacao atomica. SECURITY DEFINER: valida manualmente que o projeto pertence a empresa atual (RLS normal e ignorada dentro da function). Marca o snapshot anterior do projeto como vigente=false antes de inserir o novo. Seta a flag app.aprovacao_via_function antes do UPDATE de status, exigida pela trigger projetos_bloquear_aprovacao_direta. Unico caminho valido para aprovar um projeto com simulacao associada - ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md secoes 11-14.';

-- CREATE FUNCTION concede EXECUTE a PUBLIC por padrao no Postgres, e o
-- Supabase aplica ALTER DEFAULT PRIVILEGES concedendo EXECUTE a anon
-- (alem de authenticated/service_role) em toda function nova de public -
-- isso e independente do grant a PUBLIC, precisa de revoke proprio. Sem
-- os dois revokes abaixo, um usuario NAO autenticado (role anon)
-- conseguiria chamar esta function via RPC.
revoke execute on function public.aprovar_projeto_com_simulacao(uuid, text, text, date, integer, date, date, jsonb) from public;
revoke execute on function public.aprovar_projeto_com_simulacao(uuid, text, text, date, integer, date, date, jsonb) from anon;
grant execute on function public.aprovar_projeto_com_simulacao(uuid, text, text, date, integer, date, date, jsonb) to authenticated;
