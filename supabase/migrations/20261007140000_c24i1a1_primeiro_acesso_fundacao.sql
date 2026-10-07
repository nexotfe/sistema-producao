begin;

-- ============================================================================
-- C2.4-I1A-1 — Fundação de dados do primeiro acesso.
--
-- Escopo: só esta migration. NÃO implementa envio de e-mail, política de
-- senha, disparo pelo ADM, página pública ou conclusão real via
-- verifyOtp/updateUser (C2.4-I1A-2 a I1A-6). Nenhuma senha/token/link é
-- persistido aqui nem em nenhuma etapa futura (mesma regra já em produção
-- em provisionamento_incidentes).
--
-- Desenho mínimo (sem coluna booleana "corrente"): a invariante "no máximo
-- 1 linha pendente por usuário" é protegida por ÍNDICE ÚNICO PARCIAL sobre
-- (usuario_id) WHERE status_negocio IN ('nao_enviado','enviado') AND
-- substituida_em IS NULL -- o próprio banco rejeita duas linhas pendentes
-- simultâneas para o mesmo usuário, sem depender de disciplina de
-- aplicação. status_negocio permanece restrito aos 3 valores de negócio
-- visíveis ao ADM ('nao_enviado','enviado','concluido') -- substituição é
-- estado TÉCNICO, nunca um valor do enum de negócio: substituida_em
-- timestamptz (null = ainda relevante; preenchido = tentativa antiga
-- substituída por reenvio/correção de e-mail, tirada do conjunto pendente
-- sem nunca aparecer como um "estado" para o ADM).
--
-- Uma linha por TENTATIVA, nunca sobrescrita (fecha a lacuna de auditoria
-- do AJUSTE 1 do C2.4-I1A) -- o id da linha é o identificador não-secreto
-- que vai no link (?solicitacao=<id>).
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela.
-- ---------------------------------------------------------------------

create table public.primeiro_acesso_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete restrict,

  status_negocio text not null default 'nao_enviado',

  tentativa_id uuid not null default gen_random_uuid(),
  email_comercial_usado text not null,

  gerado_em timestamptz,
  expira_em timestamptz,
  enviado_em timestamptz,
  concluido_em timestamptz,
  substituida_em timestamptz,

  falhou_envio boolean not null default false,
  confirmacao_email_enviada boolean not null default false,
  confirmacao_email_falhou boolean not null default false,

  criado_por_id uuid not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint primeiro_acesso_status_chk
    check (status_negocio in ('nao_enviado', 'enviado', 'concluido')),

  -- Estado completo exigido por status_negocio -- um unico CHECK
  -- autoritativo, nunca checagens parciais que deixem combinacao
  -- intermediaria possivel. nao_enviado: nenhum timestamp de
  -- geracao/envio/conclusao. enviado: geracao+envio obrigatorios,
  -- conclusao ainda null. concluido: todos obrigatorios.
  constraint primeiro_acesso_timestamps_por_status_chk
    check (
      (status_negocio = 'nao_enviado'
        and gerado_em is null and expira_em is null
        and enviado_em is null and concluido_em is null)
      or
      (status_negocio = 'enviado'
        and gerado_em is not null and expira_em is not null
        and enviado_em is not null and concluido_em is null)
      or
      (status_negocio = 'concluido'
        and gerado_em is not null and expira_em is not null
        and enviado_em is not null and concluido_em is not null)
    ),

  -- Ordem cronologica entre os timestamps, quando preenchidos.
  constraint primeiro_acesso_ordem_cronologica_chk
    check (
      (expira_em is null or gerado_em is null or expira_em > gerado_em)
      and (enviado_em is null or gerado_em is null or enviado_em >= gerado_em)
      and (concluido_em is null or enviado_em is null or concluido_em >= enviado_em)
    )
);

comment on table public.primeiro_acesso_solicitacoes is
  'C2.4-I1A-1: uma linha por TENTATIVA de primeiro acesso (nunca sobrescrita -- auditoria). status_negocio é o estado de negócio visível ao ADM, restrito a nao_enviado/enviado/concluido. Substituição é estado TÉCNICO, nunca valor do enum -- ver substituida_em. Nenhum token/link/senha é persistido -- só estado e metadados. Invariante "no máximo 1 linha pendente por usuário" protegida por índice único parcial (primeiro_acesso_solicitacoes_usuario_pendente_uq), nunca por coluna booleana "corrente".';

comment on column public.primeiro_acesso_solicitacoes.email_comercial_usado is
  'Snapshot de usuarios.email no momento da geração/reenvio -- usado por verificar_solicitacao_primeiro_acesso() para detectar se o ADM corrigiu o e-mail comercial depois de um link já enviado.';

comment on column public.primeiro_acesso_solicitacoes.status_negocio is
  'Restrito a nao_enviado | enviado | concluido -- os 3 valores de negócio visíveis ao ADM. Substituição NÃO é um valor deste enum -- ver substituida_em.';

comment on column public.primeiro_acesso_solicitacoes.substituida_em is
  'Estado TÉCNICO, não de negócio. NULL = tentativa ainda relevante. Preenchido = reenvio ou correção de e-mail tiraram esta tentativa do conjunto pendente -- nunca exposto ao ADM como um "estado"; a UI só consulta a linha pendente (garantida única pelo índice parcial) ou a concluido mais recente.';

-- ---------------------------------------------------------------------
-- 2. Invariante estrutural -- índice único parcial, não coluna "corrente".
-- ---------------------------------------------------------------------

create unique index primeiro_acesso_solicitacoes_usuario_pendente_uq
  on public.primeiro_acesso_solicitacoes (usuario_id)
  where status_negocio in ('nao_enviado', 'enviado') and substituida_em is null;

comment on index public.primeiro_acesso_solicitacoes_usuario_pendente_uq is
  'Garante, ao nível do banco, no máximo 1 linha pendente (nao_enviado/enviado, substituida_em IS NULL) por usuário -- qualquer reenvio ou correção de e-mail precisa preencher substituida_em da linha anterior antes de uma nova linha pendente poder existir, senão o INSERT/UPDATE viola este índice. Elimina a necessidade de uma coluna booleana "corrente".';

-- ---------------------------------------------------------------------
-- 3. Índices de apoio.
-- ---------------------------------------------------------------------

create index primeiro_acesso_solicitacoes_empresa_status_idx
  on public.primeiro_acesso_solicitacoes (empresa_id, status_negocio, criado_em);

create index primeiro_acesso_solicitacoes_usuario_id_idx
  on public.primeiro_acesso_solicitacoes (usuario_id);

-- ---------------------------------------------------------------------
-- 4. RLS -- somente leitura, tenant-scoped, para ADM.
-- ---------------------------------------------------------------------

alter table public.primeiro_acesso_solicitacoes enable row level security;

create policy primeiro_acesso_solicitacoes_select_admin
  on public.primeiro_acesso_solicitacoes
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and public.usuario_e_admin()
  );

-- ---------------------------------------------------------------------
-- 5. ACL -- explícita. service_role insere/atualiza (orquestrador do ADM,
--    C2.4-I1A-4, ainda não implementado); nenhum client escreve direto;
--    as 2 RPCs abaixo são o único caminho de escrita para quem não é
--    service_role.
-- ---------------------------------------------------------------------

revoke all on table public.primeiro_acesso_solicitacoes
  from public, anon, authenticated, service_role;

grant select on table public.primeiro_acesso_solicitacoes to authenticated;
grant select, insert, update on table public.primeiro_acesso_solicitacoes to service_role;

-- ---------------------------------------------------------------------
-- 6. RPC pública de verificação -- SECURITY DEFINER, retorno mínimo.
--    Chamada pelo browser ANTES de qualquer sessão existir (anon).
--    Recebe só o id opaco da solicitação. Devolve só um boolean -- nunca
--    nome, empresa, e-mail, usuário, timestamps ou motivo específico.
--    Mesmo retorno (false) para inexistente, expirada, substituída,
--    concluída, usuário inativo, vínculo incoerente, ou e-mail comercial
--    alterado depois do envio.
-- ---------------------------------------------------------------------

create function public.verificar_solicitacao_primeiro_acesso(p_solicitacao_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_row record;
begin
  if p_solicitacao_id is null then
    return false;
  end if;

  select
    pas.status_negocio,
    pas.expira_em,
    pas.substituida_em,
    pas.email_comercial_usado,
    p.ativo as profile_ativo,
    p.empresa_id as profile_empresa_id,
    p.nivel_acesso as profile_nivel_acesso,
    u.empresa_id as usuario_empresa_id,
    u.nivel_acesso as usuario_nivel_acesso,
    u.email as usuario_email_atual
  into v_row
  from public.primeiro_acesso_solicitacoes pas
  join public.usuarios u on u.id = pas.usuario_id
  join public.profiles p on p.id = pas.usuario_id
  where pas.id = p_solicitacao_id;

  if not found then
    return false;
  end if;

  if v_row.status_negocio <> 'enviado' then
    return false;
  end if;

  if v_row.substituida_em is not null then
    return false;
  end if;

  if v_row.expira_em is null or v_row.expira_em <= now() then
    return false;
  end if;

  if v_row.profile_ativo is distinct from true then
    return false;
  end if;

  -- mesma checagem de coerência de resolver_consistencia_vinculo_operacional_atual(),
  -- parametrizada pelo usuario_id da solicitação (não há auth.uid() aqui -- chamada anon).
  if v_row.profile_empresa_id is distinct from v_row.usuario_empresa_id
     or v_row.profile_nivel_acesso is distinct from v_row.usuario_nivel_acesso then
    return false;
  end if;

  if v_row.usuario_email_atual is distinct from v_row.email_comercial_usado then
    return false;
  end if;

  return true;
end;
$function$;

comment on function public.verificar_solicitacao_primeiro_acesso(uuid) is
  'C2.4-I1A-1: checagem pública mínima, chamada pelo browser antes de qualquer sessão (anon). Retorna só true/false -- nunca dado identificável. false para: id inexistente, status != enviado, substituída (substituida_em not null), expirada, usuário inativo, vínculo profiles/usuarios incoerente, ou e-mail comercial alterado depois do envio (usuarios.email != email_comercial_usado). Nunca chamada com p_solicitacao_id concedendo autoridade -- é só um lookup de validade.';

alter function public.verificar_solicitacao_primeiro_acesso(uuid) owner to postgres;

revoke all on function public.verificar_solicitacao_primeiro_acesso(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.verificar_solicitacao_primeiro_acesso(uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. RPC de conclusão -- SECURITY DEFINER, exige sessão real (auth.uid()),
--    nunca anon. p_solicitacao_id identifica só a TENTATIVA -- nunca
--    concede autoridade por si só; a RPC prova que ela pertence ao
--    auth.uid() autenticado antes de qualquer alteração, e que ainda é a
--    pendente/não expirada. Lock (FOR UPDATE) -- duas conclusões
--    concorrentes da mesma linha nunca vencem as duas.
-- ---------------------------------------------------------------------

create function public.concluir_primeiro_acesso(p_solicitacao_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_encontrado boolean;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;

  if p_solicitacao_id is null then
    raise exception 'Solicitação não disponível para conclusão.';
  end if;

  perform 1
    from public.primeiro_acesso_solicitacoes
    where id = p_solicitacao_id
      and usuario_id = auth.uid()
      and status_negocio = 'enviado'
      and substituida_em is null
      and expira_em is not null
      and expira_em > now()
    for update;

  v_encontrado := found;

  if not v_encontrado then
    raise exception 'Solicitação não disponível para conclusão.';
  end if;

  update public.primeiro_acesso_solicitacoes
    set status_negocio = 'concluido',
        concluido_em = now(),
        atualizado_em = now()
    where id = p_solicitacao_id;
end;
$function$;

comment on function public.concluir_primeiro_acesso(uuid) is
  'C2.4-I1A-1: única via de conclusão do primeiro acesso. p_solicitacao_id identifica só a tentativa -- NUNCA concede autoridade; a identidade/autorização é exclusivamente auth.uid(). Prova que a solicitação pertence ao chamador autenticado, é a pendente (enviado, substituida_em is null) e não expirou, antes de qualquer UPDATE. Lock via FOR UPDATE -- conclusão concorrente da mesma linha nunca duplica. Mensagem de erro neutra idêntica para id inexistente, de outro usuário, substituída, já concluída ou expirada.';

alter function public.concluir_primeiro_acesso(uuid) owner to postgres;

revoke all on function public.concluir_primeiro_acesso(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.concluir_primeiro_acesso(uuid)
  to authenticated;

commit;
