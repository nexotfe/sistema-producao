begin;

-- ============================================================================
-- GA-4C2.2 — RPCs operacionais de administração de Grupo de Acesso
-- (Administração Segura de Usuários — frente Grupo de Acesso do NEXOTFE)
--
-- Introduz as duas RPCs que passam a ser o ÚNICO caminho operacional capaz
-- de mover um usuário entre grupos de acesso e de (de)ativá-lo:
--
--   public.mover_usuario_grupo_acesso(p_usuario_id uuid, p_grupo_id uuid)
--   public.alterar_ativo_usuario(p_usuario_id uuid, p_ativo boolean)
--
-- Design fechado em GA-4C2.2-A (investigação, 21 seções) e GA-4C2.2-B
-- (resolução do bloqueio de negócio pendente + especificação completa,
-- aprovada pelo proprietário). Ambas SECURITY DEFINER, owner explicitamente
-- postgres — current_user vira 'postgres' durante toda a execução,
-- inclusive nos triggers de GA-4C2.1 disparados pelos UPDATEs desta
-- migration (Barreira 1, confirmada empiricamente em GA-4C2-A2/GA-4C2.1).
--
-- Responsabilidade das RPCs (Barreira 3 — autorização de negócio real):
-- autenticação, autorização do chamador (usuario_e_admin()), tenant,
-- existência do alvo, existência do grupo, derivação de nivel_acesso,
-- sincronização profiles/usuarios, regra de grupo obrigatório para
-- ativação. NENHUMA destas RPCs reimplementa autopromoção,
-- autorrebaixamento, autodesativação, último ADM ativo, self-delete ou o
-- lock canônico do Grupo ADM — essas invariantes permanecem inteiramente
-- nos triggers de GA-4C2.1 (20260930130000), que disparam normalmente
-- sobre os UPDATEs feitos aqui, current_user='postgres' nesta execução.
--
-- 'operador' usado na transição ADM -> comum é exclusivamente o enum
-- técnico legado de não-admin (nivel_acesso) — NÃO representa o Operador
-- de produção do NEXOTFE (decisão de negócio explícita do proprietário em
-- GA-4C2.2-B, resolvendo o bloqueio registrado em GA-4C2.2-A seção 6).
--
-- 100% dentro do escopo autorizado (GA-4C2.2-A/B). NÃO altera: triggers
-- de GA-4C2.1, RLS, grants de tabela, usuario_e_admin(), empresa_atual_id(),
-- resolver_consistencia_vinculo_operacional_atual(), provisionar_usuario(),
-- schema de profiles/usuarios/grupos_acesso, grupo_id (continua nullable).
-- NÃO cria RPC de exclusão, provisionamento novo, NOT NULL, UI, histórico
-- novo, nem parâmetro nivel_acesso em nenhuma das duas RPCs.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1. mover_usuario_grupo_acesso — movimentação entre grupos de acesso.
-- ---------------------------------------------------------------------

create or replace function public.mover_usuario_grupo_acesso(
  p_usuario_id uuid,
  p_grupo_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_empresa_id uuid;
  v_grupo_atual_id uuid;
  v_destino_e_grupo_adm boolean;
  v_origem_e_grupo_adm boolean := false;
  v_linhas_usuarios int;
begin
  -- 1. auth.uid() não pode ser NULL.
  if auth.uid() is null then
    raise exception 'mover_usuario_grupo_acesso: operação requer sessão autenticada.';
  end if;

  -- 2. empresa atual só é resolvida depois do check acima.
  v_empresa_id := public.empresa_atual_id();

  -- 3. empresa atual não pode ser NULL.
  if v_empresa_id is null then
    raise exception 'Empresa atual não encontrada.';
  end if;

  -- 4. exigir autoridade de administrador.
  if not public.usuario_e_admin() then
    raise exception 'mover_usuario_grupo_acesso: exige autoridade de administrador.';
  end if;

  -- 5. validar parâmetros.
  if p_usuario_id is null then
    raise exception 'Informe o usuário alvo.';
  end if;

  if p_grupo_id is null then
    raise exception 'Informe o grupo de acesso destino.';
  end if;

  -- 6. localizar + lockar profiles alvo (id, empresa_id, FOR UPDATE).
  select grupo_id into v_grupo_atual_id
    from public.profiles
    where id = p_usuario_id and empresa_id = v_empresa_id
    for update;

  -- 7. ausência.
  if not found then
    raise exception 'Usuário não encontrado para a empresa atual.';
  end if;

  -- 8. localizar grupo destino UMA ÚNICA VEZ (id, empresa_id, e_grupo_adm).
  select e_grupo_adm into v_destino_e_grupo_adm
    from public.grupos_acesso
    where id = p_grupo_id and empresa_id = v_empresa_id;

  -- 9. ausência.
  if not found then
    raise exception 'Grupo de acesso não encontrado para a empresa atual.';
  end if;

  -- 10. mesmo grupo -> sucesso idempotente, sem UPDATE.
  if v_grupo_atual_id is not distinct from p_grupo_id then
    return jsonb_build_object('usuario_id', p_usuario_id, 'grupo_id', p_grupo_id);
  end if;

  -- 11. determinar se a origem é ADM — sempre via (id, empresa_id),
  --     nunca consulta global do grupo atual.
  if v_grupo_atual_id is not null then
    select e_grupo_adm into v_origem_e_grupo_adm
      from public.grupos_acesso
      where id = v_grupo_atual_id and empresa_id = v_empresa_id;
  end if;

  -- 12. executar a transição correspondente.
  if v_destino_e_grupo_adm and not v_origem_e_grupo_adm then
    -- comum -> ADM.
    update public.profiles
      set grupo_id = p_grupo_id,
          nivel_acesso = 'admin'
      where id = p_usuario_id and empresa_id = v_empresa_id;

    update public.usuarios
      set nivel_acesso = 'admin'
      where id = p_usuario_id and empresa_id = v_empresa_id;

    get diagnostics v_linhas_usuarios = row_count;
    if v_linhas_usuarios <> 1 then
      raise exception 'Falha ao sincronizar vínculo operacional do usuário.';
    end if;

  elsif v_origem_e_grupo_adm and not v_destino_e_grupo_adm then
    -- ADM -> comum. 'operador' aqui é exclusivamente o enum técnico
    -- legado de não-admin (nivel_acesso) — NÃO representa o Operador
    -- de produção do NEXOTFE (decisão do proprietário, GA-4C2.2-B).
    update public.profiles
      set grupo_id = p_grupo_id,
          nivel_acesso = 'operador'
      where id = p_usuario_id and empresa_id = v_empresa_id;

    update public.usuarios
      set nivel_acesso = 'operador'
      where id = p_usuario_id and empresa_id = v_empresa_id;

    get diagnostics v_linhas_usuarios = row_count;
    if v_linhas_usuarios <> 1 then
      raise exception 'Falha ao sincronizar vínculo operacional do usuário.';
    end if;

  else
    -- comum -> comum. (ADM -> ADM é estruturalmente inatingível aqui:
    -- já teria sido capturado pela idempotência de "mesmo grupo" acima,
    -- dado o índice único parcial de no máximo um Grupo ADM por empresa,
    -- GA-4A.) Atualiza somente grupo_id — nivel_acesso nunca mencionado
    -- no SET, preservando ambos os legados.
    update public.profiles
      set grupo_id = p_grupo_id
      where id = p_usuario_id and empresa_id = v_empresa_id;
  end if;

  return jsonb_build_object('usuario_id', p_usuario_id, 'grupo_id', p_grupo_id);
end;
$function$;

comment on function public.mover_usuario_grupo_acesso(uuid, uuid) is
  'GA-4C2.2: RPC oficial de movimentação de usuário entre grupos de acesso — único caminho operacional autorizado a alterar profiles.grupo_id com efeito. Deriva nivel_acesso (admin na entrada do Grupo ADM; operador — enum técnico legado, não o Operador de produção do NEXOTFE — na saída) e sincroniza usuarios.nivel_acesso com fail-fast se a sincronização não afetar exatamente 1 linha. Não reimplementa autopromoção/autorrebaixamento/último-ADM/lock do Grupo ADM — essas invariantes pertencem aos triggers de GA-4C2.1 (20260930130000), que disparam normalmente sobre os UPDATEs desta função (current_user=postgres).';

alter function public.mover_usuario_grupo_acesso(uuid, uuid) owner to postgres;

revoke all on function public.mover_usuario_grupo_acesso(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mover_usuario_grupo_acesso(uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- 2. alterar_ativo_usuario — (de)ativação de usuário.
-- ---------------------------------------------------------------------

create or replace function public.alterar_ativo_usuario(
  p_usuario_id uuid,
  p_ativo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_empresa_id uuid;
  v_ativo_atual boolean;
  v_grupo_id uuid;
begin
  -- 1. validar auth.uid().
  if auth.uid() is null then
    raise exception 'alterar_ativo_usuario: operação requer sessão autenticada.';
  end if;

  -- 2. empresa atual só é resolvida depois do check acima.
  v_empresa_id := public.empresa_atual_id();

  -- 3. empresa não pode ser NULL.
  if v_empresa_id is null then
    raise exception 'Empresa atual não encontrada.';
  end if;

  -- 4. exigir autoridade de administrador.
  if not public.usuario_e_admin() then
    raise exception 'alterar_ativo_usuario: exige autoridade de administrador.';
  end if;

  -- 5. validar parâmetros.
  if p_usuario_id is null then
    raise exception 'Informe o usuário alvo.';
  end if;

  if p_ativo is null then
    raise exception 'Informe o novo estado de ativo.';
  end if;

  -- 6. localizar + lockar profile alvo da mesma empresa.
  select ativo, grupo_id into v_ativo_atual, v_grupo_id
    from public.profiles
    where id = p_usuario_id and empresa_id = v_empresa_id
    for update;

  -- 7. ausência.
  if not found then
    raise exception 'Usuário não encontrado para a empresa atual.';
  end if;

  -- idempotência: mesmo valor -> sucesso sem UPDATE.
  if v_ativo_atual is not distinct from p_ativo then
    return jsonb_build_object('usuario_id', p_usuario_id, 'ativo', v_ativo_atual);
  end if;

  -- false -> true: exige grupo_id definido.
  if p_ativo = true and v_grupo_id is null then
    raise exception 'Usuário sem Grupo de Acesso não pode ser ativado.';
  end if;

  update public.profiles
    set ativo = p_ativo
    where id = p_usuario_id and empresa_id = v_empresa_id;

  -- usuarios não é alterada: não possui coluna ativo.

  return jsonb_build_object('usuario_id', p_usuario_id, 'ativo', p_ativo);
end;
$function$;

comment on function public.alterar_ativo_usuario(uuid, boolean) is
  'GA-4C2.2: RPC oficial de (de)ativação de usuário — único caminho operacional autorizado a alterar profiles.ativo com efeito. false->true exige grupo_id já definido. Não toca usuarios (sem coluna ativo). Não reimplementa autodesativação/último-ADM/self-delete — essas invariantes pertencem aos triggers de GA-4C2.1 (20260930130000), que disparam normalmente sobre o UPDATE desta função (current_user=postgres).';

alter function public.alterar_ativo_usuario(uuid, boolean) owner to postgres;

revoke all on function public.alterar_ativo_usuario(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.alterar_ativo_usuario(uuid, boolean)
  to authenticated;

commit;
