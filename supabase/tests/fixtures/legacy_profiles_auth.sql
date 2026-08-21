-- FIXTURE EXCLUSIVA DE TESTE LEGADO - PROIBIDA EM PRODUÇÃO.
--
-- Não é uma migration, não vive em supabase/migrations/ nem em
-- supabase/baseline/, e não deve ser aplicada em nenhum banco que não
-- seja um ambiente Supabase local descartável, criado só para validar
-- supabase/tests/fase8b_convencao_horas_adicionais_teste.sql.
--
-- Objetivo: reproduzir o CONTRATO MÍNIMO da identidade da trilha
-- histórica de produção (public.profiles, public.usuarios "legado",
-- public.empresas, public.empresa_atual_id(), public.usuario_e_admin())
-- - o suficiente para que a migration real 202608130001 e o teste
-- fase8b_...teste.sql rodem sem PULAR nenhum cenário por falta de
-- fixture. NÃO é uma réplica completa dessas tabelas/funções: colunas
-- de negócio sem nenhum papel estrutural (cargo, telefone, cnpj, email
-- de empresa, plano, endereço, etc.) foram deliberadamente omitidas.
--
-- Origem de cada definição (introspecção somente-leitura contra o
-- projeto vinculado, 2026-08-20/21, nenhuma escrita real): tipo do enum
-- nivel_acesso via pg_enum; colunas via information_schema.columns;
-- PK/FK/UNIQUE via pg_constraint; dono/SECURITY DEFINER/search_path/ACL
-- das 2 funções via pg_proc.proowner/prosecdef/proconfig/proacl. Nenhum
-- dado real foi lido ou copiado - só definições de schema.
--
-- ATENÇÃO - COLISÃO DE NOME: existe uma tabela public.usuarios
-- CANÔNICA, completamente diferente desta (colunas auth_user_id /
-- permissoes[] / papel), definida em supabase/baseline/. É uma mera
-- coincidência de nome - nunca a mesma tabela. Esta fixture NUNCA deve
-- ser aplicada sobre um banco que já tenha o baseline instalado (o
-- guard abaixo aborta se detectar isso).
--
-- Riscos de divergência frente à produção real (aceitos conscientemente
-- para um contrato mínimo de teste, nunca ocultados):
--   - colunas de negócio omitidas (ver acima) - se algum teste futuro
--     passar a depender delas, a fixture precisa crescer, não a
--     suposição de que "já existe".
--   - triggers/policies de public.empresas/profiles/usuarios reais
--     (ex.: preenchimento automático de empresas.codigo) não foram
--     copiados - esta fixture preenche codigo com um literal explícito.
--   - nenhuma policy RLS própria em empresas/profiles/usuarios legado -
--     o teste fase8b_... não exercita RLS nessas tabelas, só na tabela
--     da migration 202608130001 (que já traz as suas).
--
-- GUARDA CONTRA EXECUÇÃO ACIDENTAL: aborta imediatamente se detectar
-- qualquer um dos objetos abaixo já existente - nunca mascara ambiente
-- contaminado com IF NOT EXISTS. Isso cobre tanto uma 2ª aplicação
-- acidental desta fixture quanto um banco com o baseline canônico já
-- instalado (usuarios/empresas com outro formato).
do $$
begin
  if to_regclass('public.profiles') is not null then
    raise exception 'ABORTADO: public.profiles já existe. Ambiente não está limpo (fixture legada nunca deve rodar 2x, nem sobre banco contaminado). Use uma instância Supabase local descartável recém-criada.';
  end if;
  if to_regclass('public.usuarios') is not null then
    raise exception 'ABORTADO: public.usuarios já existe. Pode ser o usuarios CANÔNICO do baseline (auth_user_id/permissoes/papel) - estrutura incompatível com o usuarios LEGADO desta fixture (mesma nome, tabela diferente). Nunca aplique esta fixture sobre um ambiente com supabase/baseline/ instalado.';
  end if;
  if to_regclass('public.empresas') is not null then
    raise exception 'ABORTADO: public.empresas já existe. Ambiente não está limpo.';
  end if;
  if to_regtype('public.nivel_acesso') is not null then
    raise exception 'ABORTADO: o tipo public.nivel_acesso já existe. Ambiente não está limpo.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Tipo (idêntico ao de produção: 4 labels, mesma ordem, via pg_enum).
-- ---------------------------------------------------------------------
create type public.nivel_acesso as enum ('admin', 'gestor', 'operador', 'leitura');

-- ---------------------------------------------------------------------
-- public.empresas - contrato mínimo: só as colunas com papel estrutural
-- (PK, UNIQUE, NOT NULL sem default) ou usadas por profiles/usuarios/
-- fase8b_...teste.sql. Colunas de negócio (cnpj, email, telefone,
-- plano, created_by, inscricao_estadual, endereco, pais_codigo,
-- uf_codigo, municipio_codigo) omitidas - nenhuma tem papel estrutural
-- aqui e nenhuma é lida por profiles/usuarios/empresa_atual_id()/
-- usuario_e_admin()/fase8b_...teste.sql.
-- ---------------------------------------------------------------------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  codigo integer not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- public.profiles - réplica estrutural completa das colunas com papel
-- em empresa_atual_id()/usuario_e_admin()/RLS/fase8b_...teste.sql.
-- cargo e telefone (nuláveis, nunca lidas por nenhum dos três) foram
-- omitidas por não terem papel estrutural.
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  nome text not null,
  nivel_acesso public.nivel_acesso not null default 'operador',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- public.usuarios (LEGADO, produção real) - estrutura DIFERENTE do
-- usuarios CANÔNICO do baseline (auth_user_id/permissoes[]/papel) -
-- mesma colisão de nome, nunca a mesma tabela (ver guarda acima e nota
-- de topo). Stub estrutural: nenhum cenário de fase8b_...teste.sql
-- insere ou lê linhas aqui - a tabela existe só para que
-- empresa_atual_id() (que faz coalesce(profiles, usuarios) por design
-- de produção) possa ser criada e executada sem "relation does not
-- exist". Só as 2 colunas realmente lidas pelo corpo dessa função
-- (id, empresa_id) foram incluídas; email/nome/cargo/nivel_acesso/
-- data_criacao/atualizado_em (reais, mas nunca lidas por
-- empresa_atual_id()) foram omitidas.
-- ---------------------------------------------------------------------
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete restrict
);

-- ---------------------------------------------------------------------
-- public.empresa_atual_id() / public.usuario_e_admin() - corpo idêntico
-- ao de produção (confirmado via pg_get_functiondef, 2026-08-20/21).
-- Dono, SECURITY DEFINER, search_path e ACL replicados exatamente como
-- introspectados (pg_proc.proowner/prosecdef/proconfig/proacl): dono
-- postgres, SECURITY DEFINER, search_path=public, EXECUTE concedido a
-- PUBLIC (o que já cobre anon/authenticated/service_role implicitamente
-- - a concessão nomeada extra replicada abaixo só por fidelidade ao
-- ACL real, que lista os 4 papéis explicitamente além de PUBLIC).
-- ---------------------------------------------------------------------
create function public.empresa_atual_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (
      select profiles.empresa_id
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.ativo = true
    ),
    (
      select usuarios.empresa_id
      from public.usuarios
      where usuarios.id = auth.uid()
    )
  )
$function$;

create function public.usuario_e_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and empresa_id = public.empresa_atual_id()
      and nivel_acesso = 'admin'
      and ativo = true
  )
$function$;

grant execute on function public.empresa_atual_id() to public, anon, authenticated, service_role;
grant execute on function public.usuario_e_admin() to public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- GRANT mínimo de leitura para authenticated em empresas/profiles -
-- necessário para os TESTES 11/12 de fase8b_...teste.sql, que trocam
-- de verdade para `set role authenticated` (não só as claims JWT) para
-- provar RLS em empresa_convencao_horas_adicionais, e nesse estado
-- ainda fazem lookups diretos (`select id from public.empresas ...`,
-- `select p.id from public.profiles where p.empresa_id = ...`) para
-- reidentificar fixtures já conhecidas - sem este GRANT, esses lookups
-- falham com "permission denied", mascarando o que o teste realmente
-- quer provar (RLS na tabela de convenção, não em empresas/profiles).
-- Simplificação aceita conscientemente: SEM RLS própria nestas 2
-- tabelas aqui (leitura aberta a qualquer authenticated) - as funções
-- SECURITY DEFINER (empresa_atual_id/usuario_e_admin) já bypassam RLS
-- de qualquer forma, então isto não afeta a correção do que está sendo
-- testado; réplica completa da RLS real de empresas/profiles está fora
-- do contrato mínimo desta fixture.
grant select on public.empresas, public.profiles to authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- Dados fictícios determinísticos (nenhum dado real). UUIDs com prefixo
-- por tipo de entidade, e-mails @nexotfe.test - mesmo idioma de fixture
-- já usado em supabase/baseline/tests/*.sql.
--
-- Shape (dimensionado para fase8b_...teste.sql nunca cair em PULADO):
--   Empresa Legada A (40000000-...-0001) - admin único (30000000-...-0001)
--     usado pelos TESTES 1/2/3/4/10/11/12 (empresa "menor" por id,
--     order by id/empresa_id limit 1 sempre resolve nela).
--   Empresa Legada B (40000000-...-0002) - admin único
--     (30000000-...-0002), "empresa diferente" exigida pelos TESTES 5-9
--     (p.empresa_id is distinct from a de A) e única outra empresa
--     usada pelo TESTE 12 (isolamento).
--   Um 3º perfil admin ativo (30000000-...-0003), na Empresa A, exigido
--     pelo TESTE 13 (2 admins distintos - controle + rebaixado
--     temporário - sem depender de rebaixar o admin único de A ou B que
--     os TESTES 1-12 ainda usam).
--   auth.users mínimo: só id/email/instance_id/aud/role - o suficiente
--     para as FKs de profiles/usuarios e para TESTE 1/10 (`select id
--     from auth.users limit 1`).
-- ---------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@nexotfe.test', '', now(), now(), now()),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-b@nexotfe.test', '', now(), now(), now()),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a2@nexotfe.test', '', now(), now(), now());

insert into public.empresas (id, nome, slug, codigo)
values
  ('40000000-0000-0000-0000-000000000001', 'Empresa Legada A (fixture)', 'empresa-legada-a-fixture', 1),
  ('40000000-0000-0000-0000-000000000002', 'Empresa Legada B (fixture)', 'empresa-legada-b-fixture', 2);

insert into public.profiles (id, empresa_id, nome, nivel_acesso, ativo)
values
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Admin A (fixture)', 'admin', true),
  ('30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Admin B (fixture)', 'admin', true),
  ('30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'Admin A2 (fixture)', 'admin', true);

-- public.usuarios (legado) permanece deliberadamente vazio - nenhum
-- cenário de fase8b_...teste.sql depende de uma linha nela; ela só
-- precisa existir estruturalmente para empresa_atual_id() ser criada.
