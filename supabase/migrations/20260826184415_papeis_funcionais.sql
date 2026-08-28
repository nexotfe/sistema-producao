-- Incremento 4D0-C — catálogo de papéis funcionais (PCP, Comprador, Líder de
-- Produção, Engenharia, Aprovador de Compras, extensível a futuros) + tabela
-- de atribuição por empresa. Sem dependência de schema com 4D0-A. Base de
-- RBAC real no banco — nenhuma RPC de negócio deste plano checa isso ainda,
-- mas 4D0-B (próxima migration) já usa. Plano aprovado:
-- polymorphic-tinkering-lightning (Revisão 5, seção 4D0-C, com correções da
-- rodada de revisão pós-preparação local). Arquivo inteiro é uma transação.

begin;

-- 1. Catálogo global — vocabulário técnico compartilhado, sem empresa_id.
create table public.papeis_funcionais (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  nome text not null,
  descricao text null,
  papel_sistema boolean not null default true,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id)
);

comment on table public.papeis_funcionais is
  '4D0: catálogo extensível de papéis funcionais de negócio (PCP, Comprador, ...). Inserir um papel aqui não concede permissão nenhuma por si só — só tem efeito quando uma RPC checa usuario_tem_papel_funcional(chave) e há usuário atribuído.';
comment on column public.papeis_funcionais.chave is
  'Estável, nunca renomeada em significado — usada em código (usuario_tem_papel_funcional).';
comment on column public.papeis_funcionais.papel_sistema is
  'true para os papéis seed desta migration; reservado false para papéis customizados por empresa em incremento futuro (não implementado aqui).';

alter table public.papeis_funcionais enable row level security;

create policy papeis_funcionais_select_authenticated
  on public.papeis_funcionais
  for select
  to authenticated
  using (true);

-- Nenhuma policy de escrita para authenticated — catálogo global só muda por
-- service_role (fora do RLS). Admin de uma empresa não pode alterar papéis que
-- afetam todas as empresas.
--
-- CORREÇÃO (achado real via has_table_privilege em execução isolada):
-- pg_default_acl do schema public concede INSERT/UPDATE/DELETE a
-- `authenticated` individualmente em toda tabela nova, não só via PUBLIC —
-- "REVOKE ALL FROM PUBLIC, anon" não alcançava essa concessão. authenticated
-- precisa aparecer explicitamente no REVOKE, sempre antes do GRANT.
revoke all on public.papeis_funcionais from public, anon, authenticated;
grant select on public.papeis_funcionais to authenticated;

insert into public.papeis_funcionais (chave, nome, descricao, papel_sistema) values
  ('pcp', 'PCP', 'Planejamento e Controle da Produção — audita/aprova OFs, decide CI/CE.', true),
  ('comprador', 'Comprador', 'Conduz o fluxo de Compras (planejamento, cotação, pedido).', true),
  ('lider_producao', 'Líder de Produção', 'Responde pela execução operacional na fábrica.', true),
  ('engenharia', 'Engenharia', 'Responsável por roteiro/BOM e liberação técnica.', true),
  ('aprovador_compras', 'Aprovador de Compras', 'Alçada de aprovação de pedidos de compra.', true);

-- 2. Atribuição, tenant-scoped. Um usuário pode ter mais de um papel.
create table public.usuarios_papeis_funcionais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  usuario_id uuid not null references auth.users(id),
  papel_id uuid not null references public.papeis_funcionais(id),
  ativo boolean not null default true,
  atribuido_por uuid not null references auth.users(id),
  atribuido_em timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null references auth.users(id)
);

comment on table public.usuarios_papeis_funcionais is
  '4D0: atribuição de papel funcional a usuário, por empresa. atribuido_por é sempre auth.uid() real (forçado por trigger), nunca valor enviado pelo cliente.';

alter table public.usuarios_papeis_funcionais
  add constraint usuarios_papeis_funcionais_coerencia_delecao_chk
    check (
      (ativo = true and deleted_at is null and deleted_by is null)
      or (ativo = false and deleted_at is not null and deleted_by is not null)
    );

create unique index usuarios_papeis_funcionais_ativa_uniq
  on public.usuarios_papeis_funcionais (empresa_id, usuario_id, papel_id)
  where ativo = true and deleted_at is null;

alter table public.usuarios_papeis_funcionais enable row level security;

create policy usuarios_papeis_funcionais_select_tenant
  on public.usuarios_papeis_funcionais
  for select
  to authenticated
  using (empresa_id = public.empresa_atual_id());

create policy usuarios_papeis_funcionais_insert_tenant_admin
  on public.usuarios_papeis_funcionais
  for insert
  to authenticated
  with check (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

create policy usuarios_papeis_funcionais_update_tenant_admin
  on public.usuarios_papeis_funcionais
  for update
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin())
  with check (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

create policy usuarios_papeis_funcionais_delete_blocked
  on public.usuarios_papeis_funcionais
  for delete
  to authenticated
  using (false);

-- CORREÇÃO: mesmo motivo do REVOKE acima — authenticated explícito, sempre
-- antes do GRANT. DELETE permanece de fato ausente (nunca re-concedido).
revoke all on public.usuarios_papeis_funcionais from public, anon, authenticated;
grant select, insert, update on public.usuarios_papeis_funcionais to authenticated;

-- 3. Triggers BEFORE — cada um independente, sem interdependência entre si.
--    CORREÇÃO: a resolução profiles→usuarios (mesmo fallback que
--    empresa_atual_id() usa) fica embutida diretamente em
--    validar_usuario_mesma_empresa, em vez de um helper parametrizado
--    (usuario_pertence_empresa(uuid, uuid)) exposto como função geral — esse
--    helper aceitava usuário e empresa arbitrários e permitiria sondar
--    associação entre usuários e empresas se alguém tivesse EXECUTE nele.
--    Sem função nova exposta: só o trigger, que já roda no contexto certo.
create or replace function public.forcar_atribuido_por()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.atribuido_por := auth.uid();
  elsif tg_op = 'UPDATE' and new.atribuido_por is distinct from old.atribuido_por then
    raise exception 'usuarios_papeis_funcionais: atribuido_por é imutável depois de criado';
  end if;
  return new;
end;
$$;

create or replace function public.validar_papel_ativo()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_ativo boolean;
begin
  select ativo into v_ativo from public.papeis_funcionais where id = new.papel_id;
  if v_ativo is not true then
    raise exception 'usuarios_papeis_funcionais: papel_id % não está ativo no catálogo', new.papel_id;
  end if;
  return new;
end;
$$;

-- CORREÇÃO (achado real em execução isolada): esta função, sendo SECURITY
-- INVOKER, consultava profiles/usuarios sob a sessão do CHAMADOR — não do
-- dono da linha sendo validada. Como profiles/usuarios são tenant-scoped por
-- RLS, um chamador da empresa B consultando um usuario_id real da empresa A
-- simplesmente não via a linha (RLS a esconde), e a subconsulta retornava
-- NULL — o coalesce caía em `false` e a função rejeitava com "não pertence",
-- mesmo quando o usuário genuinamente pertencia à empresa informada. O
-- resultado prático (rejeitar) coincidia com o desejado só quando a RLS do
-- chamador também bloquearia por outro motivo — mas para o caso legítimo
-- "chamador de uma empresa administra atribuição envolvendo usuário de
-- outra" a função dava falso negativo, por acidente de visibilidade, não por
-- lógica.
--
-- Esta função passa a ser a ÚNICA SECURITY DEFINER entre as quatro triggers
-- desta migration, porque é a única que precisa responder "este usuario_id
-- pertence a este empresa_id?" independentemente do que o chamador consegue
-- enxergar — um fato estrutural sobre a linha, não uma decisão de
-- autorização do chamador (essa continua inteiramente com a RLS de
-- usuarios_papeis_funcionais, que decide "o chamador pode administrar esta
-- empresa?"; as duas camadas são deliberadamente independentes — ver os
-- testes correspondentes no preflight). search_path fixo, consulta
-- totalmente qualificada (public.profiles/public.usuarios), nenhum SQL
-- dinâmico. EXECUTE já é revogado de PUBLIC, anon e authenticated logo
-- abaixo, sem nenhuma concessão posterior — só o trigger a invoca.
--
-- CORREÇÃO (2ª rodada): a versão anterior fazia a consulta privilegiada
-- (que ignora RLS) antes de qualquer checagem de quem está chamando — isso
-- cria um pequeno oráculo cross-tenant: um chamador SEM autorização nenhuma
-- sobre a empresa-alvo ainda conseguia, pela mensagem de erro recebida
-- (P0001 "não pertence" vs. a rejeição de RLS que viria depois), inferir se
-- um usuario_id qualquer pertence a uma empresa que não é a dele. Corrigido
-- com uma ordem explícita: três checagens de autorização do PRÓPRIO
-- CHAMADOR primeiro (sessão autenticada; a linha pertence à empresa do
-- chamador; o chamador tem a alçada exigida pela mesma regra que a RLS de
-- escrita já impõe) — todas as três com a MESMA mensagem genérica, sem
-- mencionar o usuario_id-alvo nem sua empresa. Só depois de passar pelas
-- três é que a consulta privilegiada roda, e só então a mensagem específica
-- ("não pertence à empresa") pode aparecer — nesse ponto o chamador já
-- comprovadamente administra aquela empresa, então essa informação já é
-- legitimamente dele.
create or replace function public.validar_usuario_mesma_empresa()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_pertence boolean;
begin
  -- 1. sessão autenticada
  if auth.uid() is null then
    raise exception 'usuarios_papeis_funcionais: operação não autorizada' using errcode = '42501';
  end if;

  -- 2. a linha só pode pertencer à própria empresa do chamador
  if new.empresa_id is distinct from public.empresa_atual_id() then
    raise exception 'usuarios_papeis_funcionais: operação não autorizada' using errcode = '42501';
  end if;

  -- 3. alçada administrativa — mesma exigência da RLS de escrita desta
  --    tabela, checada aqui de novo, em profundidade, para que um chamador
  --    sem essa alçada nunca alcance o passo 4 (privilegiado, informativo).
  if not public.usuario_e_admin() then
    raise exception 'usuarios_papeis_funcionais: operação não autorizada' using errcode = '42501';
  end if;

  -- 4. só agora, com o chamador já comprovadamente autorizado sobre esta
  --    empresa, a consulta privilegiada (SECURITY DEFINER, ignora RLS)
  --    valida a pertença real do usuario_id-alvo.
  select coalesce(
    (select empresa_id = new.empresa_id from public.profiles where id = new.usuario_id and ativo = true),
    (select empresa_id = new.empresa_id from public.usuarios where id = new.usuario_id),
    false
  ) into v_pertence;

  if not v_pertence then
    raise exception 'usuarios_papeis_funcionais: usuario_id % não pertence à empresa %', new.usuario_id, new.empresa_id;
  end if;
  return new;
end;
$$;

create or replace function public.gerir_transicao_ativo_papel()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $$
begin
  if tg_op = 'INSERT' or new.ativo is distinct from old.ativo then
    if new.ativo = false then
      new.deleted_at := now();
      new.deleted_by := auth.uid();
    else
      new.deleted_at := null;
      new.deleted_by := null;
    end if;
  end if;
  return new;
end;
$$;

-- ACL: as quatro são funções de trigger, nunca chamadas diretamente — revoga
-- de PUBLIC em todas, sem conceder a ninguém.
--
-- CORREÇÃO (achado real): pg_default_acl também concede EXECUTE a anon e
-- authenticated individualmente em toda função nova, não só via PUBLIC.
-- "REVOKE EXECUTE FROM PUBLIC" sozinho não removia essas concessões
-- individuais — anon/authenticated explícitos em todo REVOKE de função.
revoke execute on function public.forcar_atribuido_por() from public, anon, authenticated;
revoke execute on function public.validar_papel_ativo() from public, anon, authenticated;
revoke execute on function public.validar_usuario_mesma_empresa() from public, anon, authenticated;
revoke execute on function public.gerir_transicao_ativo_papel() from public, anon, authenticated;

create trigger forcar_atribuido_por
  before insert or update on public.usuarios_papeis_funcionais
  for each row
  execute function public.forcar_atribuido_por();

create trigger validar_papel_ativo
  before insert or update of papel_id on public.usuarios_papeis_funcionais
  for each row
  execute function public.validar_papel_ativo();

create trigger validar_usuario_mesma_empresa
  before insert or update of usuario_id, empresa_id on public.usuarios_papeis_funcionais
  for each row
  execute function public.validar_usuario_mesma_empresa();

create trigger gerir_transicao_ativo_papel
  before insert or update on public.usuarios_papeis_funcionais
  for each row
  execute function public.gerir_transicao_ativo_papel();

-- 5. Função auxiliar de autorização — SECURITY INVOKER (não DEFINER): a
--    policy de SELECT acima já restringe as linhas visíveis a
--    empresa_id = empresa_atual_id(), então INVOKER já é suficiente e mais
--    seguro, sem escalação de privilégio. Sem parâmetro de empresa (usa
--    empresa_atual_id() internamente) — evita que um chamador consulte papel
--    de outra empresa passando o id manualmente.
create or replace function public.usuario_tem_papel_funcional(p_chave text)
returns boolean
language sql
stable
security invoker
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.usuarios_papeis_funcionais upf
    join public.papeis_funcionais pf on pf.id = upf.papel_id
    where upf.empresa_id = public.empresa_atual_id()
      and upf.usuario_id = auth.uid()
      and upf.ativo = true
      and pf.chave = p_chave
      and pf.ativo = true
  );
$$;

comment on function public.usuario_tem_papel_funcional(text) is
  '4D0: true se o usuário autenticado tem o papel funcional (chave) ativo na empresa atual. SECURITY INVOKER — não parametriza empresa, usa empresa_atual_id() internamente.';

-- CORREÇÃO: anon explícito no REVOKE (mesmo achado do pg_default_acl acima) —
-- antes só PUBLIC era revogado, deixando a concessão individual de anon
-- intacta por baixo do GRANT seguinte, que só cobre authenticated.
revoke execute on function public.usuario_tem_papel_funcional(text) from public, anon, authenticated;
grant execute on function public.usuario_tem_papel_funcional(text) to authenticated;

commit;
