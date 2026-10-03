begin;

-- ============================================================================
-- GA-4C2.3-E1.1 — mecanismo persistente de incidente/reconciliação
-- (Administração Segura de Usuários — fundação para o orquestrador de
-- provisionamento, GA-4C2.3-E — ainda NÃO implementado nesta migration)
--
-- Tabela de INCIDENTE, não de histórico de sucesso — diferente de
-- usuarios_provisionamento_historico (que só registra provisionamentos
-- bem-sucedidos). Aqui só existem linhas para os dois casos em que o
-- orquestrador não consegue resolver sozinho o estado real: compensação
-- falhou (auth.users ficou órfão) ou o resultado de uma etapa ficou
-- genuinamente incerto (timeout/conexão perdida). Uma compensação que
-- funcionou (Auth criado + RPC falhou + delete bem-sucedido) NUNCA grava
-- linha aqui — o estado já foi revertido, não há nada para acompanhar.
--
-- empresa_id/auth_user_id/criado_por_id/resolvido_por são SEM FK,
-- deliberadamente — esta tabela é snapshot de contexto para diagnóstico,
-- nunca integridade referencial operacional (mesma filosofia K1 já usada
-- em usuarios_provisionamento_historico: um incidente nunca pode travar a
-- exclusão futura de uma empresa, de um usuário Auth órfão, ou de quem
-- criou/resolveu). tentativa_id não é único por design — uma mesma
-- tentativa de orquestração pode, em cenário extremo, produzir mais de um
-- evento relacionado; nenhuma evidência hoje justifica proibir isso
-- estruturalmente.
--
-- identidade_tecnica é sempre conhecida (gerada pelo backend antes de
-- qualquer chamada ao Auth) — por isso é NOT NULL mesmo quando
-- auth_user_id ainda não existe (etapa='auth_create', timeout no próprio
-- createUser, sem confirmação possível). auth_user_id só é obrigatório
-- para as demais etapas, que por definição só ocorrem depois do Auth já
-- ter sido confirmado.
--
-- Nenhuma senha, token, service_role, link de recovery ou mensagem
-- SQL/GoTrue bruta é persistida — só códigos de erro estáveis
-- (codigo_erro_principal/codigo_erro_compensacao). Detalhe técnico bruto,
-- se necessário, vive só em log de aplicação, nunca nesta tabela (que é
-- legível por ADM de tenant via RLS).
--
-- Resolução manual é feita EXCLUSIVAMENTE pela RPC
-- resolver_incidente_provisionamento — a tabela não aceita INSERT/UPDATE/
-- DELETE de nenhum role de cliente. O orquestrador (service_role) só
-- insere; nunca atualiza diretamente.
--
-- NÃO implementa nesta migration: Route Handler, auth.admin.createUser(),
-- auth.admin.deleteUser(), compensação real, reconciliação automática,
-- primeiro acesso/senha, e-mail transacional, idempotencyKey, C2.4.
-- NÃO altera nenhuma migration GA já publicada, RLS/policies/triggers
-- existentes, usuario_e_admin(), empresa_atual_id(), provisionar_usuario,
-- provisionar_usuario_com_grupo, ou qualquer objeto fora desta migration.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela.
-- ---------------------------------------------------------------------

create table public.provisionamento_incidentes (
  id uuid primary key default gen_random_uuid(),
  tentativa_id uuid not null,
  identidade_tecnica text not null,
  auth_user_id uuid,
  empresa_id uuid,
  criado_por_id uuid not null,
  etapa text not null,
  codigo_erro_principal text not null,
  codigo_erro_compensacao text,
  estado_resultante text not null,
  status_reconciliacao text not null default 'pendente',
  detectado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid,
  observacao_resolucao text,

  constraint provisionamento_incidentes_etapa_chk
    check (etapa in ('auth_create', 'rpc_provisionamento', 'compensacao', 'reconciliacao')),

  constraint provisionamento_incidentes_estado_resultante_chk
    check (estado_resultante in ('orfao_auth', 'parcial_incoerente')),

  constraint provisionamento_incidentes_status_reconciliacao_chk
    check (status_reconciliacao in ('pendente', 'resolvido_manual', 'resolvido_automatico')),

  -- 3.4 — auth_user_id só pode ser nulo na etapa auth_create.
  constraint provisionamento_incidentes_auth_user_obrigatorio_chk
    check (etapa = 'auth_create' or auth_user_id is not null),

  -- 3.5 — órfão de Auth exige evidência mínima de que a compensação foi tentada e falhou.
  constraint provisionamento_incidentes_orfao_evidencia_chk
    check (
      estado_resultante <> 'orfao_auth'
      or (auth_user_id is not null and codigo_erro_compensacao is not null)
    ),

  -- 3.6 — integridade da resolução, por estado.
  constraint provisionamento_incidentes_resolucao_integridade_chk
    check (
      (
        status_reconciliacao = 'pendente'
        and resolvido_em is null
        and resolvido_por is null
        and observacao_resolucao is null
      )
      or (
        status_reconciliacao = 'resolvido_manual'
        and resolvido_em is not null
        and resolvido_por is not null
        and btrim(coalesce(observacao_resolucao, '')) <> ''
      )
      or (
        status_reconciliacao = 'resolvido_automatico'
        and resolvido_em is not null
        and resolvido_por is null
      )
    ),

  -- 4 — contrato estrutural mínimo da identidade técnica (E4). Não exige
  -- formato de UUID-v4 no local-part, não tenta provar autoria — só
  -- impede gravar um incidente com e-mail comercial/identificador fora
  -- do padrão técnico por erro do backend.
  constraint provisionamento_incidentes_identidade_tecnica_chk
    check (lower(identidade_tecnica) like '%@auth.nexotfe.internal')
);

comment on table public.provisionamento_incidentes is
  'GA-4C2.3-E1.1: incidentes de provisionamento de usuário que o orquestrador não conseguiu resolver sozinho (Auth órfão após compensação falhar, ou estado genuinamente incerto por timeout/conexão perdida). NÃO é histórico de sucesso (ver usuarios_provisionamento_historico) — uma compensação bem-sucedida nunca grava linha aqui. Resolução manual exclusivamente via public.resolver_incidente_provisionamento(...); sem INSERT/UPDATE/DELETE direto por nenhum role de cliente.';

comment on column public.provisionamento_incidentes.empresa_id is
  'Snapshot de contexto/tenant para diagnóstico e RLS — propositalmente SEM FK (um incidente nunca pode travar a remoção/regularização futura da empresa). NULL quando a falha ocorreu antes de a empresa poder ser derivada; nesse caso a linha não é visível a nenhum ADM de tenant, só a contexto privilegiado/plataforma.';

comment on column public.provisionamento_incidentes.auth_user_id is
  'SEM FK — snapshot do id Auth, nunca integridade referencial (permite excluir o usuário Auth órfão sem travar pela auditoria). NULL só é válido quando etapa=auth_create (ver provisionamento_incidentes_auth_user_obrigatorio_chk).';

comment on column public.provisionamento_incidentes.codigo_erro_principal is
  'Código de erro ESTÁVEL (ex. RPC_CRIADOR_NAO_AUTORIZADO, AUTH_CREATE_TIMEOUT) — nunca mensagem SQL/GoTrue bruta, nunca senha/token/service_role/link de recovery. Detalhe técnico bruto, se necessário, vive só em log de aplicação.';

-- ---------------------------------------------------------------------
-- 2. Índices mínimos.
-- ---------------------------------------------------------------------

create index provisionamento_incidentes_empresa_status_idx
  on public.provisionamento_incidentes (empresa_id, status_reconciliacao, detectado_em);

create index provisionamento_incidentes_auth_user_id_idx
  on public.provisionamento_incidentes (auth_user_id)
  where auth_user_id is not null;

create index provisionamento_incidentes_tentativa_id_idx
  on public.provisionamento_incidentes (tentativa_id);

-- ---------------------------------------------------------------------
-- 3. RLS — somente leitura, tenant-scoped, para ADM.
-- ---------------------------------------------------------------------

alter table public.provisionamento_incidentes enable row level security;

create policy provisionamento_incidentes_select_admin
  on public.provisionamento_incidentes
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and public.usuario_e_admin()
  );

-- ---------------------------------------------------------------------
-- 4. ACL da tabela — explícita, sem depender de default implícito.
-- ---------------------------------------------------------------------

revoke all on table public.provisionamento_incidentes
  from public, anon, authenticated, service_role;

grant select on table public.provisionamento_incidentes to authenticated;
grant select, insert on table public.provisionamento_incidentes to service_role;

-- ---------------------------------------------------------------------
-- 5. RPC de resolução manual — único caminho de escrita de resolução.
-- ---------------------------------------------------------------------

create function public.resolver_incidente_provisionamento(
  p_incidente_id uuid,
  p_observacao text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_empresa_id uuid;
  v_observacao text;
begin
  -- 1. incidente obrigatório.
  if p_incidente_id is null then
    raise exception 'resolver_incidente_provisionamento: incidente obrigatório.';
  end if;

  -- 2. observação obrigatória, após btrim.
  v_observacao := btrim(p_observacao);
  if v_observacao is null or v_observacao = '' then
    raise exception 'resolver_incidente_provisionamento: observação obrigatória.';
  end if;

  -- 3. exige autoridade de administrador.
  if not public.usuario_e_admin() then
    raise exception 'resolver_incidente_provisionamento: exige autoridade de administrador.';
  end if;

  -- 4. empresa atual.
  v_empresa_id := public.empresa_atual_id();
  if v_empresa_id is null then
    raise exception 'Empresa atual não encontrada.';
  end if;

  -- 5/11. localizar tenant-safe, só pendente, com lock (concorrência).
  perform 1
    from public.provisionamento_incidentes
    where id = p_incidente_id
      and empresa_id = v_empresa_id
      and status_reconciliacao = 'pendente'
    for update;

  -- 13. mensagem neutra — inexistente, de outra empresa, ou já resolvido
  -- produzem exatamente a mesma mensagem.
  if not found then
    raise exception 'Incidente não disponível para resolução.';
  end if;

  -- 12. atualiza somente os 4 campos de resolução.
  update public.provisionamento_incidentes
    set status_reconciliacao = 'resolvido_manual',
        resolvido_em = now(),
        resolvido_por = auth.uid(),
        observacao_resolucao = v_observacao
    where id = p_incidente_id;
end;
$function$;

comment on function public.resolver_incidente_provisionamento(uuid, text) is
  'GA-4C2.3-E1.1: único caminho de resolução manual de um incidente de provisionamento. Exige usuario_e_admin() e localização tenant-safe (empresa_id = empresa_atual_id()) do incidente, sempre com status_reconciliacao=pendente e lock (FOR UPDATE) antes de resolver — duas resoluções concorrentes do mesmo incidente nunca vencem as duas. Transição única: pendente -> resolvido_manual. Mensagem neutra idêntica para incidente inexistente, de outra empresa, ou já resolvido.';

alter function public.resolver_incidente_provisionamento(uuid, text) owner to postgres;

revoke all on function public.resolver_incidente_provisionamento(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolver_incidente_provisionamento(uuid, text)
  to authenticated;

commit;
