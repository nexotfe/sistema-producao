begin;

-- ============================================================================
-- GA-4C2.3-D — provisionar_usuario_com_grupo
-- (Administração Segura de Usuários — frente provisionamento com Grupo de
-- Acesso, modelo de identidade E4)
--
-- Introduz a RPC que substitui, para novos fluxos, o provisionamento legado
-- (public.provisionar_usuario, 20260923180000) — SEM alterar, remover ou
-- expandir o legado, que permanece congelado, sem novos consumidores
-- (confirmado GA-4C2.3-A: zero chamadores reais em src/).
--
-- Modelo B (GA-4C2.3-B/C/C1): backend chama auth.admin.createUser(...) com
-- identidade técnica opaca (modelo E4, GA-4C2.3-EMAIL) ANTES de chamar esta
-- RPC; só depois invoca esta função via service_role, nunca pelo cliente.
-- p_criado_por é explícito, derivado da sessão real do ADM pelo backend, e
-- revalidado aqui — nunca confiado cegamente (mesmo padrão K3 do legado).
--
-- Autoridade do criador (GA-4C2.3-C1, correção obrigatória): Grupo ADM
-- (profiles.grupo_id -> grupos_acesso.e_grupo_adm=true) é a fonte PRIMÁRIA.
-- nivel_acesso em profiles/usuarios é só espelho técnico transitório —
-- checado aqui como COERÊNCIA estrutural secundária (se Grupo ADM bate mas
-- o enum legado não, rejeita por incoerência, nunca por autoridade do
-- enum). FOR UPDATE OF p trava a linha de profiles do criador durante toda
-- a transação — fecha a corrida com mover_usuario_grupo_acesso/
-- alterar_ativo_usuario (GA-4C2.2), que travam a MESMA linha antes de
-- qualquer rebaixamento/desativação; quem chega depois relê o estado já
-- committed (semântica padrão de SELECT...FOR UPDATE + EvalPlanQual), nunca
-- "last-write-wins".
--
-- Identidade técnica E4 (GA-4C2.3-EMAIL/C1): auth.users.email do ALVO deixa
-- de ser e-mail comercial — passa a ser identificador opaco terminando em
-- @auth.nexotfe.internal (domínio reservado permanentemente contra
-- delegação pública pela resolução 2024.07.29.06 do Conselho da ICANN,
-- nunca entregável, nunca resolvido via DNS real; o NEXOTFE nunca depende
-- do envio nativo do GoTrue para essas identidades). Esta RPC valida só o
-- sufixo de domínio (lowercase-safe) — detecta o erro de programação
-- "backend criou auth.users com e-mail comercial", sem tentar provar
-- autoria (autoria é responsabilidade do Modelo B/backend, não desta
-- checagem).
--
-- E-mail comercial (p_email_comercial) é normalizado (lower+btrim) antes de
-- gravar, e verificado SOMENTE dentro da empresa derivada do criador
-- (usuarios_empresa_email_key, GA-4C2.3-EMAIL) — mesmo e-mail em empresas
-- diferentes é permitido e nunca consultado. Pré-check amigável + handler
-- estreito de unique_violation (só usuarios_empresa_email_key é traduzida;
-- qualquer outra violação sobe intacta via RAISE puro) cobrem,
-- respectivamente, o caso comum e a corrida genuína.
--
-- Histórico (usuarios_provisionamento_historico) ampliado com snapshot do
-- grupo no momento do provisionamento — grupo_id sem FK (mesma filosofia
-- K1 de criado_por_id/usuario_criado_id: auditoria nunca trava exclusão
-- futura do grupo), grupo_nome/grupo_era_adm como snapshot textual/booleano
-- para permanecer legível mesmo se o grupo for renomeado/excluído depois.
-- CHECK garante "3 NULL" (linhas legadas, nunca preenchidas) ou "3
-- preenchidos" (toda nova linha desta RPC) — nunca parcial.
--
-- NÃO toca: provisionar_usuario, auth.users (escrita), RLS, policies,
-- triggers de GA-4C2.1, mover_usuario_grupo_acesso/alterar_ativo_usuario,
-- usuario_e_admin()/empresa_atual_id(), baseline, documentação.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1. Ampliação do histórico — snapshot do grupo no provisionamento.
-- ---------------------------------------------------------------------

alter table public.usuarios_provisionamento_historico
  add column grupo_id uuid,
  add column grupo_nome text,
  add column grupo_era_adm boolean;

alter table public.usuarios_provisionamento_historico
  add constraint usuarios_provisionamento_historico_grupo_snapshot_chk
  check (
    (grupo_id is null and grupo_nome is null and grupo_era_adm is null)
    or
    (grupo_id is not null and grupo_nome is not null and grupo_era_adm is not null)
  );

comment on column public.usuarios_provisionamento_historico.grupo_id is
  'GA-4C2.3-D: snapshot do grupo de acesso no momento do provisionamento. Sem FK — auditoria nunca pode travar exclusão futura do grupo (mesma filosofia K1 de criado_por_id/usuario_criado_id). NULL em linhas legadas (anteriores a esta coluna); preenchido em toda linha gravada por provisionar_usuario_com_grupo — nunca parcial (ver CHECK grupo_snapshot_chk).';

-- ---------------------------------------------------------------------
-- 2. RPC de provisionamento com Grupo de Acesso (Modelo B, service_role).
-- ---------------------------------------------------------------------

create function public.provisionar_usuario_com_grupo(
  p_user_id uuid,
  p_nome text,
  p_email_comercial text,
  p_grupo_id uuid,
  p_criado_por uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_nome text;
  v_email text;
  v_auth_email text;
  v_criador_empresa_id uuid;
  v_criador_email_comercial text;
  v_grupo_nome text;
  v_grupo_e_adm boolean;
  v_nivel_acesso public.nivel_acesso;
  v_constraint_name text;
begin
  -- 1. parâmetros obrigatórios.
  if p_user_id is null or p_nome is null or p_email_comercial is null
     or p_grupo_id is null or p_criado_por is null then
    raise exception 'provisionar_usuario_com_grupo: todos os parâmetros são obrigatórios.';
  end if;

  -- 2. normalizar nome.
  v_nome := btrim(p_nome);

  -- 3. normalizar e-mail comercial.
  v_email := lower(btrim(p_email_comercial));

  -- 4. rejeitar nome vazio.
  if v_nome = '' then
    raise exception 'provisionar_usuario_com_grupo: nome obrigatório.';
  end if;

  -- 5. rejeitar e-mail vazio.
  if v_email = '' then
    raise exception 'provisionar_usuario_com_grupo: e-mail comercial obrigatório.';
  end if;

  -- 6. formato mínimo do e-mail (estrutural, não entregabilidade).
  if position('@' in v_email) < 2 or position('@' in v_email) = length(v_email) then
    raise exception 'provisionar_usuario_com_grupo: e-mail comercial em formato inválido.';
  end if;

  -- 7. auth.users existe + contrato de identidade técnica E4.
  select email into v_auth_email from auth.users where id = p_user_id;

  if not found then
    raise exception 'provisionar_usuario_com_grupo: usuário % não existe em auth.users.', p_user_id;
  end if;

  if v_auth_email is null or lower(v_auth_email) not like '%@auth.nexotfe.internal' then
    raise exception 'provisionar_usuario_com_grupo: identidade Auth do usuário % não segue o contrato técnico E4.', p_user_id;
  end if;

  -- 8. ainda não provisionado (profiles/usuarios).
  if exists (select 1 from public.profiles where id = p_user_id)
     or exists (select 1 from public.usuarios where id = p_user_id) then
    raise exception 'provisionar_usuario_com_grupo: usuário % já possui profile e/ou registro em usuarios.', p_user_id;
  end if;

  -- 9. resolver + validar p_criado_por — Grupo ADM é a autoridade primária;
  --    níveis legados são coerência estrutural secundária, também
  --    obrigatórios. FOR UPDATE OF p trava a linha durante toda a
  --    transação (serialização com GA-4C2.2 — ver cabeçalho).
  select p.empresa_id, u.email
    into v_criador_empresa_id, v_criador_email_comercial
    from public.profiles p
    join public.grupos_acesso g
      on g.id = p.grupo_id and g.empresa_id = p.empresa_id
    join public.usuarios u
      on u.id = p.id and u.empresa_id = p.empresa_id
    where p.id = p_criado_por
      and p.ativo = true
      and g.e_grupo_adm = true
      and p.nivel_acesso = 'admin'
      and u.nivel_acesso = 'admin'
    for update of p;

  if not found then
    raise exception 'Criador não autorizado para provisionar usuários.';
  end if;

  -- 10. criado_por não pode ser o próprio alvo.
  if p_criado_por = p_user_id then
    raise exception 'provisionar_usuario_com_grupo: criado_por não pode ser o próprio usuário criado.';
  end if;

  -- 11. grupo — existe, mesma empresa do criador, nome, e_grupo_adm.
  select nome, e_grupo_adm
    into v_grupo_nome, v_grupo_e_adm
    from public.grupos_acesso
    where id = p_grupo_id and empresa_id = v_criador_empresa_id;

  if not found then
    raise exception 'Grupo de acesso não encontrado para a empresa atual.';
  end if;

  -- 12. derivar nivel_acesso a partir do grupo.
  if v_grupo_e_adm then
    v_nivel_acesso := 'admin';
  else
    -- 'operador' aqui é somente o enum técnico legado de não-admin — NÃO
    -- representa o Operador de produção do NEXOTFE (mesma ressalva
    -- obrigatória já registrada em GA-4C2.2/GA-4C2.3).
    v_nivel_acesso := 'operador';
  end if;

  -- 13. pré-check amigável de duplicidade — só dentro da empresa derivada.
  if exists (
    select 1 from public.usuarios
    where empresa_id = v_criador_empresa_id and email = v_email
  ) then
    raise exception 'Já existe um usuário com este e-mail nesta empresa.';
  end if;

  -- 14. INSERT usuarios, com handler estreito para a corrida genuína.
  begin
    insert into public.usuarios (id, empresa_id, nome, email, nivel_acesso)
    values (p_user_id, v_criador_empresa_id, v_nome, v_email, v_nivel_acesso);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = 'usuarios_empresa_email_key' then
        raise exception 'Já existe um usuário com este e-mail nesta empresa.';
      else
        raise;
      end if;
  end;

  -- 15. INSERT profiles — grupo_id/nivel_acesso/ativo já corretos desde o nascimento.
  insert into public.profiles (id, empresa_id, nome, nivel_acesso, grupo_id, ativo)
  values (p_user_id, v_criador_empresa_id, v_nome, v_nivel_acesso, p_grupo_id, true);

  -- 16. INSERT histórico — snapshot do grupo incluído.
  insert into public.usuarios_provisionamento_historico (
    empresa_id, usuario_criado_id, email_criado,
    criado_por_id, email_criador, nivel_acesso, origem,
    grupo_id, grupo_nome, grupo_era_adm
  )
  values (
    v_criador_empresa_id, p_user_id, v_email,
    p_criado_por, v_criador_email_comercial, v_nivel_acesso, 'admin_tenant',
    p_grupo_id, v_grupo_nome, v_grupo_e_adm
  );

  -- 17. retorno mínimo.
  return jsonb_build_object(
    'usuario_id', p_user_id,
    'empresa_id', v_criador_empresa_id,
    'grupo_id', p_grupo_id
  );
end;
$function$;

comment on function public.provisionar_usuario_com_grupo(uuid, text, text, uuid, uuid) is
  'GA-4C2.3-D: RPC oficial de provisionamento com Grupo de Acesso obrigatório (modelo E4). Chamada exclusiva do servidor (service_role), depois de auth.admin.createUser(...) com identidade técnica opaca (@auth.nexotfe.internal). Autoridade do criador: Grupo ADM (profiles.grupo_id -> grupos_acesso.e_grupo_adm) é primária; nivel_acesso em profiles/usuarios é coerência secundária. Deriva nivel_acesso do grupo escolhido (admin no Grupo ADM; operador — enum legado, não o Operador de produção do NEXOTFE — em grupo comum). Não reimplementa nem substitui o provisionamento legado (provisionar_usuario), que permanece congelado e intocado.';

alter function public.provisionar_usuario_com_grupo(uuid, text, text, uuid, uuid) owner to postgres;

revoke all on function public.provisionar_usuario_com_grupo(uuid, text, text, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.provisionar_usuario_com_grupo(uuid, text, text, uuid, uuid)
  to service_role;

commit;
