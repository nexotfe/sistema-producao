begin;

-- ============================================================================
-- GA-4A — Fundação aditiva do schema de Grupo de Acesso
-- (Administração Segura de Usuários — frente Grupo de Acesso do NEXOTFE)
--
-- Implementa a estrutura física acordada em GA-2 (modelo conceitual),
-- GA-3/GA-3R/GA-3R2 (desenho físico fechado) e GA-3-D1 (backfill de
-- não-ADM é decisão de negócio, ainda pendente, fora desta migration).
--
-- 100% ADITIVO. Não toca em: profiles, usuarios, nivel_acesso,
-- usuario_e_admin(), empresa_atual_id(), provisionar_usuario(),
-- resolver_consistencia_vinculo_operacional_atual(), proxy.ts,
-- papeis_funcionais, autorização de Compras/PCP, fluxo comercial.
--
-- ESTADO AINDA NÃO OPERACIONAL, DE PROPÓSITO:
--   - profiles.grupo_id NÃO existe nesta migration — nenhum usuário está
--     vinculado a nenhum grupo ainda.
--   - grupo_permissoes existe estruturalmente (FK composta, unicidade,
--     bloqueios de ADM/reservada, RLS habilitada), mas NENHUM papel de
--     cliente (authenticated/anon) tem qualquer GRANT de
--     INSERT/UPDATE/DELETE nela, e nenhuma policy de escrita foi criada
--     — a tabela não é gravável por nenhum caminho operacional até
--     GA-4B (constraint trigger DEFERRED de validação do conjunto de
--     dependências + RPC oficial de salvar permissões) ser aplicada.
--     Essa restrição é intencional e obrigatória, não um esquecimento —
--     sem ela seria possível materializar uma permissão sem sua
--     dependência requerida (estado já considerado inválido desde
--     GA-2/GA-3).
--   - grupos_acesso também não recebe nenhuma policy de escrita para
--     authenticated nesta fatia — a única via de INSERT é o trigger de
--     criação automática (SECURITY DEFINER, dispara em toda nova
--     empresa) e o backfill administrativo abaixo (executado como dono
--     da migration). Nenhum ADM de tenant consegue criar/alterar grupo
--     comum ainda — "ativar o novo modelo de autorização" é etapa
--     futura, não desta migration.
--
-- Padrões reais confirmados por leitura direta do schema antes desta
-- migration (nenhum inventado):
--   - Enum: create type public.X as enum (...), valores minúsculos, sem
--     ACL/owner explícito (padrão das migrations recentes, não do
--     bootstrap retroativo).
--   - Índice único parcial: mesmo padrão de
--     usuarios_papeis_funcionais_ativa_uniq (... where ativo = true).
--   - RLS de catálogo global: mesmo padrão de papeis_funcionais (select
--     to authenticated using (true); revoke all; grant select).
--   - Proteção de ciclo em grafo: adaptado do precedente real já em
--     produção (202608040001_bom_subconjunto_protecao_ciclo.sql) —
--     travessia recursiva via CTE, cycle = nó revisitado no caminho.
--     Diferença deliberada: sem pg_advisory_xact_lock aqui, porque
--     permissao_dependencias é catálogo GLOBAL mutado só por migrations
--     do próprio sistema, nunca concorrentemente por múltiplos tenants
--     em runtime (GA-3R2, ponto 2) — o lock por advisory seria
--     necessário só para a futura proteção de "último ADM" (GA-4B ou
--     posterior, quando profiles.grupo_id existir), não para o catálogo.
--   - ALTER DEFAULT PRIVILEGES deste projeto concede EXECUTE a
--     authenticated automaticamente em toda função nova — confirmado no
--     comentário da própria migration 202608040001. Por isso, toda
--     função de trigger abaixo tem REVOKE EXECUTE explícito de
--     authenticated, mesmo sem nenhum GRANT nesta migration.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1. Categoria de permissão (GA-2, seção 4)
-- ---------------------------------------------------------------------

create type public.permissao_categoria as enum (
  'comum',
  'sensivel',
  'reservada'
);

comment on type public.permissao_categoria is
  'comum: atribuível livremente pelo ADM a qualquer grupo. sensivel: concedida ao Grupo ADM por definição, delegável a outros grupos por decisão do ADM. reservada: pertence exclusivamente ao Grupo ADM, nunca delegável, nunca removível dele. Ver knowledge da frente Grupo de Acesso (GA-2 seção 4) para o contrato completo.';

-- ---------------------------------------------------------------------
-- 2. grupos_acesso (tenant-scoped)
-- ---------------------------------------------------------------------

create table public.grupos_acesso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  nome text not null,
  e_grupo_adm boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint grupos_acesso_empresa_id_id_uniq unique (id, empresa_id),
  constraint grupos_acesso_empresa_nome_uniq unique (empresa_id, nome),
  constraint grupos_acesso_adm_nome_fixo_chk check (not e_grupo_adm or nome = 'ADM')
);

comment on table public.grupos_acesso is
  'Grupo de Acesso do NEXOTFE (GA-2/GA-3). Por empresa. e_grupo_adm identifica estruturalmente o grupo especial reservado (nunca por comparação de nome) — natureza imutável após criação (ver trigger abaixo), nome fixo "ADM" quando e_grupo_adm=true (ver CHECK). Ainda NÃO operacional nesta migration (GA-4A) — profiles.grupo_id não existe, nenhum usuário está vinculado a nenhum grupo.';

comment on column public.grupos_acesso.e_grupo_adm is
  'Identidade estrutural do Grupo ADM. Imutável após criação (trigger grupos_acesso_bloquear_alteracao_natureza) — nenhuma operação normal pode promover grupo comum a ADM nem rebaixar o ADM a comum.';

-- No máximo 1 Grupo ADM por empresa. A existência de PELO MENOS 1 vem
-- do trigger de criação automática + backfill abaixo, e da proteção
-- contra exclusão (trigger, seção 3) — nunca só deste índice sozinho
-- (GA-3R, seção A).
create unique index grupos_acesso_adm_unico_por_empresa_idx
  on public.grupos_acesso (empresa_id)
  where e_grupo_adm = true;

create index grupos_acesso_empresa_id_idx on public.grupos_acesso (empresa_id);

-- ---------------------------------------------------------------------
-- 3. Grupo ADM — mecanismos estruturais (GA-3 seção D, GA-3R seção B/E)
-- ---------------------------------------------------------------------

-- Imutabilidade de e_grupo_adm (GA-3R seção B) — nunca só RLS.
create or replace function public.trg_grupos_acesso_bloquear_alteracao_natureza()
returns trigger
language plpgsql
as $function$
begin
  if old.e_grupo_adm is distinct from new.e_grupo_adm then
    raise exception 'grupos_acesso: a natureza ADM/comum de um grupo é imutável após a criação (id=%).', old.id;
  end if;
  return new;
end;
$function$;

create trigger grupos_acesso_bloquear_alteracao_natureza
  before update of e_grupo_adm
  on public.grupos_acesso
  for each row
  execute function public.trg_grupos_acesso_bloquear_alteracao_natureza();

-- Bloqueio estrutural de exclusão do Grupo ADM (GA-3R seção E) — vale
-- para qualquer caminho de escrita, inclusive SECURITY DEFINER/service_role,
-- não só RLS.
create or replace function public.trg_grupos_acesso_bloquear_exclusao_adm()
returns trigger
language plpgsql
as $function$
begin
  if old.e_grupo_adm then
    raise exception 'grupos_acesso: o Grupo ADM não pode ser excluído (empresa_id=%).', old.empresa_id;
  end if;
  return old;
end;
$function$;

create trigger grupos_acesso_bloquear_exclusao_adm
  before delete
  on public.grupos_acesso
  for each row
  execute function public.trg_grupos_acesso_bloquear_exclusao_adm();

-- Criação automática do Grupo ADM em toda empresa nova (GA-3, seção 3;
-- GA-3R2, ponto sobre "criação só por caminhos controlados pelo
-- sistema"). SECURITY DEFINER, mesmo padrão já usado pelos outros
-- triggers de autoprovisionamento em empresas
-- (empresas_criar_numeracao_padrao, preparar_empresa_saas) — garante
-- que o INSERT em grupos_acesso funcione mesmo grupos_acesso não tendo
-- nenhuma policy de INSERT para authenticated (empresa hoje só é criada
-- por service_role/postgres, mas o SECURITY DEFINER torna isso robusto
-- independentemente de quem/como a empresa for criada no futuro).
create or replace function public.trg_empresas_criar_grupo_adm()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.grupos_acesso (empresa_id, nome, e_grupo_adm, created_by)
  values (new.id, 'ADM', true, new.created_by)
  on conflict (empresa_id) where (e_grupo_adm) do nothing;
  return new;
end;
$function$;

alter function public.trg_empresas_criar_grupo_adm() owner to postgres;

create trigger empresas_criar_grupo_adm
  after insert on public.empresas
  for each row
  execute function public.trg_empresas_criar_grupo_adm();

-- Backfill administrativo para empresas já existentes (GA-3R2 — via
-- migration, não via caminho público). Executa como dono desta
-- migration, não depende de nenhuma policy de grupos_acesso.
insert into public.grupos_acesso (empresa_id, nome, e_grupo_adm, created_by)
select e.id, 'ADM', true, e.created_by
from public.empresas e
where not exists (
  select 1 from public.grupos_acesso g
  where g.empresa_id = e.id and g.e_grupo_adm = true
);

-- ---------------------------------------------------------------------
-- 4. permissoes (catálogo global do sistema — GA-3R seção D)
-- ---------------------------------------------------------------------

create table public.permissoes (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  recurso text not null,
  acao text not null,
  categoria public.permissao_categoria not null,
  nome text not null,
  descricao text,
  created_at timestamptz not null default now()
);

comment on table public.permissoes is
  'Catálogo GLOBAL de permissões do NEXOTFE (GA-2 seção 4, GA-3R seção D) — definido só pelo sistema (migration), nunca por empresa. Empresas consultam (SELECT), nunca administram. Populado incrementalmente conforme o catálogo real de ações protegíveis for levantado — vazio nesta migration, de propósito (fora de escopo de GA-4A: "construir catálogo completo de ações do ERP").';

comment on column public.permissoes.chave is
  'Identificador estável, nunca renomeado em significado, referenciado em código — mesmo padrão de papeis_funcionais.chave.';

-- ---------------------------------------------------------------------
-- 5. permissao_dependencias (catálogo global — GA-2 seção 4 item 4,
--    GA-3R seção D/2, GA-3R2 ponto 2)
-- ---------------------------------------------------------------------

create table public.permissao_dependencias (
  id uuid primary key default gen_random_uuid(),
  permissao_id uuid not null references public.permissoes(id) on delete cascade,
  depende_de_id uuid not null references public.permissoes(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint permissao_dependencias_sem_autodependencia_chk check (permissao_id <> depende_de_id),
  constraint permissao_dependencias_aresta_unica_uniq unique (permissao_id, depende_de_id)
);

comment on table public.permissao_dependencias is
  'Grafo GLOBAL de dependências entre permissões (GA-2 seção 4 item 4). Semântica: permissao_id EXIGE depende_de_id (E lógico entre todas as arestas de uma mesma permissao_id — sem suporte a "OU" nesta fatia, GA-3R2). ON DELETE RESTRICT em depende_de_id: não é possível remover do catálogo uma permissão da qual outra ainda dependa. Mutação deste grafo é exclusiva de migrations do sistema, nunca concorrente em runtime (GA-3R2 ponto 2) — por isso o trigger anti-ciclo abaixo não usa advisory lock, diferente do precedente de BOM.';

-- Travessia do grafo a partir de uma permissão, detectando ciclo —
-- adaptado do precedente real de bom_estrutura_alcancavel
-- (202608040001), sem a indireção de "resolver BOM ativo" (aqui as
-- arestas já são diretas) e sem advisory lock (ver comentário da
-- tabela acima).
create or replace function public.permissao_dependencia_alcancavel(
  p_permissao_raiz_id uuid
) returns table(permissao_id uuid, caminho uuid[], ciclo boolean)
language sql
volatile
as $$
  with recursive alcance(permissao_id, caminho, ciclo) as (
    select p_permissao_raiz_id, array[p_permissao_raiz_id]::uuid[], false
    union all
    select
      pd.depende_de_id,
      array_append(a.caminho, pd.depende_de_id),
      pd.depende_de_id = any(a.caminho)
    from alcance a
    join public.permissao_dependencias pd on pd.permissao_id = a.permissao_id
    where not a.ciclo
  )
  select permissao_id, caminho, ciclo from alcance;
$$;

create or replace function public.trg_permissao_dependencias_validar_ciclo()
returns trigger
language plpgsql
as $function$
declare
  v_linha record;
begin
  select * into v_linha
    from public.permissao_dependencia_alcancavel(new.permissao_id)
    where ciclo
    order by array_length(caminho, 1)
    limit 1;

  if found then
    raise exception 'permissao_dependencias: ciclo detectado a partir da permissão % (caminho: %).',
      new.permissao_id, v_linha.caminho;
  end if;

  return new;
end;
$function$;

create trigger permissao_dependencias_validar_ciclo
  after insert or update of permissao_id, depende_de_id
  on public.permissao_dependencias
  for each row
  execute function public.trg_permissao_dependencias_validar_ciclo();

-- ---------------------------------------------------------------------
-- 6. grupo_permissoes (tenant-scoped — GA-2 seção 3/6, GA-3 seção F,
--    GA-3R2 ponto de correção cumulativo)
--    ESTRUTURAL NESTA FATIA. NÃO OPERACIONAL — ver cabeçalho e seção 7.
-- ---------------------------------------------------------------------

create table public.grupo_permissoes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null,
  empresa_id uuid not null,
  permissao_id uuid not null references public.permissoes(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint grupo_permissoes_grupo_empresa_fk
    foreign key (grupo_id, empresa_id) references public.grupos_acesso(id, empresa_id) on delete restrict,
  constraint grupo_permissoes_grupo_permissao_uniq unique (grupo_id, permissao_id)
);

comment on table public.grupo_permissoes is
  'Atribuição explícita de permissão comum/sensível a grupo comum (GA-2 seção 3/6). FK composta (grupo_id, empresa_id) garante, declarativamente, que o grupo referenciado pertence à mesma empresa da linha — sem trigger de validação cruzada (GA-3R2 ponto 1, correção sobre GA-3 seção H, que propunha trigger). O Grupo ADM NUNCA aparece aqui (permissões derivadas, nunca materializadas) e permissão reservada NUNCA aparece aqui — ver trigger de bloqueio cumulativo abaixo. NÃO OPERACIONAL nesta migration: RLS habilitada só com SELECT, nenhuma policy nem GRANT de escrita para nenhum papel de cliente — ver seção 7 desta migration e gate obrigatório GA-4B (validação de conjunto de dependências + RPC oficial), condição explícita para abrir qualquer mutação real.';

create index grupo_permissoes_grupo_id_idx on public.grupo_permissoes (grupo_id);
create index grupo_permissoes_empresa_id_idx on public.grupo_permissoes (empresa_id);
create index grupo_permissoes_permissao_id_idx on public.grupo_permissoes (permissao_id);

-- Bloqueio cumulativo (GA-3R2, correção): ambas as condições, nenhuma
-- substitui a outra. (1) grupo destino nunca é o Grupo ADM. (2)
-- permissão nunca é reservada. Vale para qualquer caminho de escrita,
-- não só RLS — mas nesta fatia (GA-4A) nenhum caminho de escrita está
-- sequer aberto para authenticated (seção 7), então este trigger é
-- defesa em profundidade desde já para quando GA-4B abrir a RPC
-- oficial via service_role/SECURITY DEFINER.
create or replace function public.trg_grupo_permissoes_validar_atribuicao()
returns trigger
language plpgsql
as $function$
declare
  v_grupo_e_adm boolean;
  v_categoria public.permissao_categoria;
begin
  select e_grupo_adm into v_grupo_e_adm
    from public.grupos_acesso
    where id = new.grupo_id;

  if v_grupo_e_adm then
    raise exception 'grupo_permissoes: o Grupo ADM nunca recebe permissão atribuída explicitamente — suas permissões são sempre derivadas (grupo_id=%).', new.grupo_id;
  end if;

  select categoria into v_categoria
    from public.permissoes
    where id = new.permissao_id;

  if v_categoria = 'reservada' then
    raise exception 'grupo_permissoes: permissão reservada do sistema não pode ser atribuída a grupo comum (permissao_id=%).', new.permissao_id;
  end if;

  return new;
end;
$function$;

create trigger grupo_permissoes_validar_atribuicao
  before insert or update of grupo_id, permissao_id
  on public.grupo_permissoes
  for each row
  execute function public.trg_grupo_permissoes_validar_atribuicao();

-- ---------------------------------------------------------------------
-- 7. RLS — leitura estrutural apenas; ESCRITA FECHADA PARA TODOS OS
--    PAPÉIS DE CLIENTE nas tabelas tenant-scoped (grupos_acesso,
--    grupo_permissoes) até etapa futura ativar o modelo. Catálogo
--    global (permissoes, permissao_dependencias): mesmo padrão de
--    papeis_funcionais.
-- ---------------------------------------------------------------------

alter table public.grupos_acesso enable row level security;

create policy grupos_acesso_select_tenant
  on public.grupos_acesso
  for select
  to authenticated
  using (empresa_id = public.empresa_atual_id());

revoke all on public.grupos_acesso from public, anon, authenticated;
grant select on public.grupos_acesso to authenticated;

alter table public.permissoes enable row level security;

create policy permissoes_select_authenticated
  on public.permissoes
  for select
  to authenticated
  using (true);

revoke all on public.permissoes from public, anon, authenticated;
grant select on public.permissoes to authenticated;

alter table public.permissao_dependencias enable row level security;

create policy permissao_dependencias_select_authenticated
  on public.permissao_dependencias
  for select
  to authenticated
  using (true);

revoke all on public.permissao_dependencias from public, anon, authenticated;
grant select on public.permissao_dependencias to authenticated;

alter table public.grupo_permissoes enable row level security;

create policy grupo_permissoes_select_tenant
  on public.grupo_permissoes
  for select
  to authenticated
  using (empresa_id = public.empresa_atual_id());

-- Deliberadamente SEM policy de INSERT/UPDATE/DELETE e SEM GRANT delas
-- para authenticated/anon nesta migration — ver cabeçalho e comentário
-- da tabela. Único GRANT: SELECT.
revoke all on public.grupo_permissoes from public, anon, authenticated;
grant select on public.grupo_permissoes to authenticated;

-- ---------------------------------------------------------------------
-- 8. ACL de funções — REVOKE explícito de authenticated em toda função
--    de trigger/helper interno, por causa do ALTER DEFAULT PRIVILEGES
--    deste projeto (ver cabeçalho).
-- ---------------------------------------------------------------------

revoke execute on function public.trg_grupos_acesso_bloquear_alteracao_natureza() from public, anon, authenticated;
revoke execute on function public.trg_grupos_acesso_bloquear_exclusao_adm() from public, anon, authenticated;
revoke execute on function public.trg_empresas_criar_grupo_adm() from public, anon, authenticated;
revoke execute on function public.trg_permissao_dependencias_validar_ciclo() from public, anon, authenticated;
revoke execute on function public.trg_grupo_permissoes_validar_atribuicao() from public, anon, authenticated;
revoke execute on function public.permissao_dependencia_alcancavel(uuid) from public, anon, authenticated;

comment on function public.permissao_dependencia_alcancavel(uuid) is
  'Travessia read-only do grafo de dependências a partir de uma permissão — usada internamente pelo trigger de ciclo. Sem EXECUTE para public/anon/authenticated (GA-4A-C, menor privilégio): nenhum consumidor de cliente identificado em src/ nesta fatia — usuários autenticados não administram o catálogo global de permissões. Reavaliar se/quando surgir um consumidor legítimo (ex.: tela de diagnóstico).';

commit;
