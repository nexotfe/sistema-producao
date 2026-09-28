-- Desenho v2 da correcao de handle_new_auth_user() — substitui por
-- completo o provisionamento automatico via trigger em auth.users por
-- uma RPC explicita, chamada pelo servidor.
--
-- Historico: handle_new_auth_user() (trigger on_auth_user_created,
-- AFTER INSERT ON auth.users) resolvia a empresa do novo usuario a
-- partir de raw_user_meta_data->>'empresa_slug' — campo controlavel
-- pelo proprio cliente no signUp(). Achado real, documentado como
-- CRITICA desde 21/06/2026 (knowledge/AUDITORIA_FUNCOES_SECURITY_
-- DEFINER.md), reconfirmado vigente em 2026-09-04, redescoberto de
-- forma independente em 2026-09-23 durante a regularizacao fundacional
-- do schema. Contencao aplicada pelo proprietario em 23/09/2026 ~10:56
-- (signup publico desligado no painel Supabase, fora desta migration).
--
-- Uma primeira correcao (v1, 20260923160000_handle_new_auth_user_v2.sql,
-- nunca aplicada em producao, REPROVADA) tentou ler o tenant/papel de
-- app_metadata (raw_app_meta_data) dentro do proprio trigger AFTER
-- INSERT. Testada contra o GoTrue real (stack completo, sandbox
-- descartavel, Etapa 2) e reprovada: o GoTrue nao popula
-- raw_app_meta_data no INSERT que o trigger AFTER INSERT enxerga —
-- evidencia (log do container auth): "failed to close prepared
-- statement: ERROR: current transaction is aborted, commands ignored
-- until end of transaction block (SQLSTATE 25P02): ERROR:
-- handle_new_auth_user: app_metadata.empresa_id ausente ou nao e um
-- uuid valido. (SQLSTATE P0001)" — consistente com o GoTrue aplicar o
-- app_metadata custom num UPDATE posterior, na mesma transacao, que o
-- trigger (disparado no INSERT) nunca chega a ver. Corpo antigo
-- (producao real) preservado em D:\Projetos\_candidatos_backup\
-- seguranca\r11_producao_auth_storage.txt (SHA-256 119577f1df34813e
-- 39411c20de4eb7931f765a61c688b49eb0939dfca41558a0).
--
-- Decisao (v2, esta migration): eliminar qualquer dependencia de
-- comportamento interno do GoTrue. Remove o trigger/funcao antigos por
-- completo (nenhum provisionamento automatico sobrevive — uma conta
-- criada por qualquer caminho fora do procedimento abaixo fica sem
-- profile/usuarios, ou seja, sem empresa e sem acesso, fail-closed
-- estrutural). Introduz public.provisionar_usuario(...), RPC explicita
-- SECURITY DEFINER, chamada exclusivamente pelo servidor (service_role)
-- depois de auth.admin.createUser(...) — nunca pelo cliente.
--
-- Hierarquia de criacao decidida pelo proprietario (23/09/2026):
--   - Nivel plataforma (SISARE): cadastra empresas novas e os
--     primeiros administradores; poder inacessivel a qualquer
--     usuario/admin de tenant; nesta fase, somente o proprietario, via
--     procedimento executado sob sua autorizacao explicita a cada uso;
--     ferramenta interna dedicada e item futuro.
--   - Nivel tenant (admin da empresa): cria os demais usuarios so da
--     propria empresa, define seus papeis — PODE criar outro admin da
--     mesma empresa (decisao explicita do proprietario). Compensacao
--     obrigatoria: trilha de auditoria completa (quem criou, quem foi
--     criado, papel, empresa, data/hora) — tabela
--     usuarios_provisionamento_historico abaixo.
--
-- Trilha de auditoria (K1): as colunas usuario_criado_id/criado_por_id
-- NAO tem FK para auth.users — um historico de auditoria nunca pode
-- impedir a exclusao futura de um usuario real. email_criado/
-- email_criador sao snapshots (capturados no momento do provisiona-
-- mento) para preservar identificacao legivel mesmo apos uma exclusao
-- futura em auth.users. A FK para public.empresas e mantida (empresa
-- nao e excluida com a mesma frequencia/motivo que um usuario).
--
-- Defesa em profundidade (K3): quando p_origem = 'admin_tenant', a
-- propria funcao revalida que p_criado_por e um admin ativo da mesma
-- p_empresa_id, mesmo que o servidor ja devesse ter feito essa checagem
-- usando o JWT do chamador antes de invocar esta RPC via service_role
-- — nunca confia cegamente no dado recebido do servidor de aplicacao.
--
-- Nenhum DML sobre dado existente. Os 3 usuarios reais (ENIFER x2,
-- NEXOTFE Demo x1) nao sao alterados por esta migration.

drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Trilha de auditoria de provisionamento (K1, K2, K4).
-- ---------------------------------------------------------------------
create table public.usuarios_provisionamento_historico (
  id uuid default gen_random_uuid() not null primary key,
  empresa_id uuid not null references public.empresas(id),
  usuario_criado_id uuid not null,
  email_criado text not null,
  criado_por_id uuid not null,
  email_criador text not null,
  nivel_acesso public.nivel_acesso not null,
  origem text not null,
  criado_em timestamp with time zone default now() not null,
  constraint usuarios_provisionamento_historico_origem_chk
    check (origem in ('sisare', 'admin_tenant'))
);

comment on table public.usuarios_provisionamento_historico is
  'Trilha de auditoria de public.provisionar_usuario(...): quem criou, quem foi criado, papel, empresa, data/hora. Sem FK para auth.users em usuario_criado_id/criado_por_id (auditoria nunca pode impedir exclusao futura de usuario real) — email_criado/email_criador sao snapshots capturados no momento do provisionamento, para preservar identificacao legivel mesmo apos exclusao. Escrita exclusiva de public.provisionar_usuario (SECURITY DEFINER); nenhum papel de cliente tem INSERT/UPDATE/DELETE direto.';

alter table public.usuarios_provisionamento_historico enable row level security;

create policy usuarios_provisionamento_historico_select_admin
  on public.usuarios_provisionamento_historico
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and public.usuario_e_admin()
  );

revoke all on table public.usuarios_provisionamento_historico from public, anon, authenticated;
grant select on table public.usuarios_provisionamento_historico to authenticated;

-- ---------------------------------------------------------------------
-- RPC de provisionamento (K2, K3). Chamada exclusiva do servidor, via
-- service_role, depois de auth.admin.createUser(...) ja ter criado o
-- login em auth.users.
-- ---------------------------------------------------------------------
create function public.provisionar_usuario(
  p_user_id uuid,
  p_empresa_id uuid,
  p_nivel_acesso text,
  p_nome text,
  p_criado_por uuid,
  p_origem text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email_criado text;
  v_email_criador text;
  v_empresa_ativa boolean;
  v_nivel public.nivel_acesso;
  v_criador_valido boolean;
begin
  select auth.users.email
    into v_email_criado
    from auth.users
   where auth.users.id = p_user_id;

  if not found then
    raise exception 'provisionar_usuario: usuario % nao existe em auth.users.', p_user_id;
  end if;

  if exists (select 1 from public.profiles where public.profiles.id = p_user_id)
     or exists (select 1 from public.usuarios where public.usuarios.id = p_user_id) then
    raise exception 'provisionar_usuario: usuario % ja possui profile e/ou registro em usuarios.', p_user_id;
  end if;

  select public.empresas.ativo
    into v_empresa_ativa
    from public.empresas
   where public.empresas.id = p_empresa_id;

  if not found then
    raise exception 'provisionar_usuario: empresa % nao encontrada.', p_empresa_id;
  end if;

  if not v_empresa_ativa then
    raise exception 'provisionar_usuario: empresa % esta inativa.', p_empresa_id;
  end if;

  if p_nivel_acesso is null
     or not (p_nivel_acesso = any (enum_range(null::public.nivel_acesso)::text[])) then
    raise exception 'provisionar_usuario: nivel_acesso invalido (%).', p_nivel_acesso;
  end if;

  v_nivel := p_nivel_acesso::public.nivel_acesso;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'provisionar_usuario: nome obrigatorio.';
  end if;

  if p_criado_por is null then
    raise exception 'provisionar_usuario: criado_por obrigatorio.';
  end if;

  if p_criado_por = p_user_id then
    raise exception 'provisionar_usuario: criado_por nao pode ser o proprio usuario criado (%).', p_user_id;
  end if;

  if p_origem is null or not (p_origem = any (array['sisare', 'admin_tenant'])) then
    raise exception 'provisionar_usuario: origem invalida (%).', p_origem;
  end if;

  select auth.users.email
    into v_email_criador
    from auth.users
   where auth.users.id = p_criado_por;

  if not found then
    raise exception 'provisionar_usuario: criado_por % nao existe em auth.users.', p_criado_por;
  end if;

  -- K3: defesa em profundidade — quando a origem e admin_tenant, a
  -- propria funcao revalida que quem criou e admin ativo da MESMA
  -- empresa, mesmo que o servidor ja devesse ter checado isso sob o
  -- JWT do chamador antes de invocar esta RPC via service_role.
  if p_origem = 'admin_tenant' then
    select exists (
      select 1
        from public.profiles
       where public.profiles.id = p_criado_por
         and public.profiles.empresa_id = p_empresa_id
         and public.profiles.nivel_acesso = 'admin'
         and public.profiles.ativo = true
    )
      into v_criador_valido;

    if not v_criador_valido then
      raise exception 'provisionar_usuario: criado_por % nao e admin ativo da empresa % (origem admin_tenant).', p_criado_por, p_empresa_id;
    end if;
  end if;

  insert into public.usuarios (id, empresa_id, nome, email, nivel_acesso)
  values (p_user_id, p_empresa_id, p_nome, v_email_criado, v_nivel);

  insert into public.profiles (id, empresa_id, nome, nivel_acesso)
  values (p_user_id, p_empresa_id, p_nome, v_nivel);

  insert into public.usuarios_provisionamento_historico (
    empresa_id, usuario_criado_id, email_criado,
    criado_por_id, email_criador, nivel_acesso, origem
  )
  values (
    p_empresa_id, p_user_id, v_email_criado,
    p_criado_por, v_email_criador, v_nivel, p_origem
  );
end;
$$;

comment on function public.provisionar_usuario(uuid, uuid, text, text, uuid, text) is
  'Substitui o provisionamento automatico via trigger em auth.users (removido nesta mesma migration). Chamada exclusiva do servidor (service_role), depois de auth.admin.createUser(...). p_empresa_id e p_origem nunca vem de dado do cliente final: origem=admin_tenant exige p_empresa_id = empresa_atual_id() do admin chamador (checado pelo servidor E revalidado aqui — defesa em profundidade); origem=sisare roda sob autorizacao explicita do proprietario a cada uso. Falha fechada (RAISE EXCEPTION) em qualquer validacao — usuario/empresa/nivel/origem/criador invalidos — sem inserir nada em usuarios/profiles/historico.';

revoke all on function public.provisionar_usuario(uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.provisionar_usuario(uuid, uuid, text, text, uuid, text) to service_role;
