begin;

-- ============================================================================
-- GA-4C2.1 — Proteção estrutural de acesso/usuário
-- (Administração Segura de Usuários — frente Grupo de Acesso do NEXOTFE)
--
-- Fecha as lacunas de segurança encontradas durante a investigação GA-4C2-A
-- (A/A2/A3/A5/A6): hoje, sem nenhuma proteção além da RLS, um ADM
-- autenticado consegue via UPDATE/DELETE direto (1) autodesativar-se ou
-- desativar outro ADM até zerar a continuidade administrativa da empresa;
-- (2) criar divergência profiles.nivel_acesso × usuarios.nivel_acesso, o
-- que dispara falso-positivo em resolver_consistencia_vinculo_operacional_
-- atual() (U7/U9), redirecionando o usuário para a rota de vínculo
-- inconsistente; (3) excluir o último ADM (inclusive via cascade de
-- DELETE auth.users, confirmado empiricamente que o trigger dispara mesmo
-- nesse caminho). Esta migration NÃO ativa Grupo de Acesso como
-- autoridade real do sistema, NÃO cria nenhuma RPC operacional — só
-- fecha os caminhos diretos, deixando tudo estruturalmente pronto para
-- a RPC de movimentação (GA-4C2.2, ainda não escrita).
--
-- Mecanismo de proteção (GA-4C2-A2, achado crítico): a flag transacional
-- app.grupo_id_via_function usada pela GA-4C1 foi identificada como
-- insuficiente — o próprio histórico deste projeto já tinha descoberto e
-- corrigido o mesmo problema duas vezes antes (ver
-- 20260826184418_necessidades_of_material.sql:158-164 e
-- 202608220001_congelar_custos_ao_aprovar.sql:16-21,181): set_config()
-- para um GUC custom (namespace app.*) não exige nenhum privilégio
-- especial no Postgres — qualquer conexão SQL comum pode setá-la e
-- contornar a proteção. Por isso esta migration ELIMINA COMPLETAMENTE
-- app.grupo_id_via_function e substitui todo o modelo de proteção por
-- current_user='postgres' — dentro de uma function SECURITY DEFINER de
-- dono postgres, current_user vira postgres durante toda a execução,
-- inclusive em triggers disparados por comandos que ela executa (GA-4C2-
-- A2, confirmado empiricamente em sandbox: SECURITY DEFINER chamada por
-- authenticated faz o trigger disparado enxergar current_user=postgres).
-- authenticated/anon/service_role NUNCA conseguem SET ROLE postgres por
-- conta própria — não há nenhum sinal que o cliente possa forjar.
--
-- IMPORTANTE (registrado conforme exigido, seção 13 da autorização):
-- current_user='postgres' NÃO é autorização de negócio — é somente sinal
-- de que esta escrita veio de um contexto privilegiado controlado
-- (Barreira 1: guard imediato, bloqueia escrita direta por role
-- operacional). A validação de coerência deferred (Barreira 2: constraint
-- trigger DEFERRABLE INITIALLY DEFERRED) protege o estado final da
-- transação inclusive contra bug de código privilegiado — não corrige
-- nada automaticamente, só recusa o commit. A autorização de negócio real
-- (chamador é ADM, tenant, alvo, último-ADM já embutido estruturalmente
-- nos guards desta migration) é Barreira 3, implementada pela futura RPC
-- (GA-4C2.2) — current_user='postgres' nunca a substitui.
--
-- auth.uid() dentro de SECURITY DEFINER continua representando o
-- chamador real (GA-4C2-A2, confirmado empiricamente: GUC de sessão,
-- independente da role elevada) — por isso os guards conseguem combinar
-- os dois sinais (current_user + auth.uid()) para implementar self-check
-- e proteção de último ADM inteiramente nesta fatia, sem depender de
-- nenhuma informação que só a futura RPC teria (GA-4C2-A5/A6).
--
-- Grupo ADM (grupos_acesso, e_grupo_adm=true, GA-4A) é o ponto estrutural
-- CANÔNICO de membresia administrativa nesta frente. usuarios.nivel_acesso
-- é espelho técnico transitório de profiles.nivel_acesso — nunca fonte
-- futura de autoridade (GA-4C2-A2/A3) — mantido em sincronia só porque
-- resolver_consistencia_vinculo_operacional_atual() (U7/U9) ainda compara
-- os dois lados.
--
-- 100% dentro do escopo autorizado (GA-4C2-A...A6). NÃO altera:
-- usuario_e_admin(), empresa_atual_id(),
-- resolver_consistencia_vinculo_operacional_atual(), provisionar_usuario(),
-- RLS existente, grants de tabela, nivel_acesso, profiles.grupo_id
-- (continua nullable). NÃO cria RPC de movimentação/ativação/exclusão,
-- NÃO cria provisionar_usuario_com_grupo, NÃO torna grupo_id NOT NULL,
-- NÃO classifica não-admin pendente, NÃO cria UI. Não altera a migration
-- GA-4C1 publicada (20260930120000) — só substitui o CORPO da função de
-- trigger já existente (create or replace, mesma assinatura de trigger,
-- sem novo create trigger para ela).
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1. Lock de serialização contra DML concorrente — ANTES de qualquer
--    validação. Fecha o TOCTOU: sem isso, uma transação concorrente
--    poderia escrever entre "validou" e "instalou os guards", deixando
--    a validação prévia inútil. Ordem canônica confirmada por leitura
--    direta do único escritor real que toca as duas tabelas na mesma
--    transação (public.provisionar_usuario,
--    20260923180000_provisionamento_usuarios_v2.sql:213-217): INSERT em
--    usuarios primeiro, profiles depois — nenhum outro INSERT/UPDATE/
--    DELETE em usuarios existe em todo o histórico de migrations (grep
--    exaustivo). Ordem canônica adotada: usuarios, profiles.
--    SHARE MODE (não ACCESS EXCLUSIVE): conflita com ROW EXCLUSIVE (o
--    modo que INSERT/UPDATE/DELETE sempre adquire), suficiente para
--    bloquear escrita concorrente, mas nunca bloqueia SELECT comum.
--    Sem NOWAIT: a migration espera qualquer DML pré-existente terminar
--    antes de validar um estado já estabilizado. Os locks são liberados
--    só no COMMIT desta migration (final do arquivo) — cobrem toda a
--    sequência de validação + instalação dos guards/constraint triggers.
-- ---------------------------------------------------------------------

lock table public.usuarios, public.profiles in share mode;

-- ---------------------------------------------------------------------
-- 2. Validação prévia do estado existente — ANTES de instalar qualquer
--    trigger novo. Nenhuma correção automática: qualquer divergência
--    aborta a migration inteira com RAISE EXCEPTION. União implícita dos
--    IDs de profiles/usuarios via anti-join nos dois sentidos (nunca
--    auth.users como universo). Com os locks acima já adquiridos, este
--    estado está estabilizado — nenhuma transação concorrente pode
--    alterá-lo enquanto esta migration não commitar.
-- ---------------------------------------------------------------------

do $$
declare
  v_count int;
begin
  -- 1. profile sem usuarios correspondente
  select count(*) into v_count
    from public.profiles p
    where not exists (select 1 from public.usuarios u where u.id = p.id);
  if v_count > 0 then
    raise exception 'GA-4C2.1: validação prévia falhou — % profile(s) sem linha correspondente em usuarios.', v_count;
  end if;

  -- 2. usuarios sem profile correspondente
  select count(*) into v_count
    from public.usuarios u
    where not exists (select 1 from public.profiles p where p.id = u.id);
  if v_count > 0 then
    raise exception 'GA-4C2.1: validação prévia falhou — % linha(s) de usuarios sem profile correspondente.', v_count;
  end if;

  -- 3. empresa_id divergente entre os dois espelhos
  select count(*) into v_count
    from public.profiles p
    join public.usuarios u on u.id = p.id
    where p.empresa_id <> u.empresa_id;
  if v_count > 0 then
    raise exception 'GA-4C2.1: validação prévia falhou — % usuário(s) com empresa_id divergente entre profiles e usuarios.', v_count;
  end if;

  -- 4. nivel_acesso divergente entre os dois espelhos
  select count(*) into v_count
    from public.profiles p
    join public.usuarios u on u.id = p.id
    where p.nivel_acesso <> u.nivel_acesso;
  if v_count > 0 then
    raise exception 'GA-4C2.1: validação prévia falhou — % usuário(s) com nivel_acesso divergente entre profiles e usuarios.', v_count;
  end if;

  -- 5. nivel_acesso=admin sem grupo_id apontando pro Grupo ADM da propria empresa
  select count(*) into v_count
    from public.profiles p
    where p.nivel_acesso = 'admin'
      and not exists (
        select 1 from public.grupos_acesso g
        where g.id = p.grupo_id and g.empresa_id = p.empresa_id and g.e_grupo_adm = true
      );
  if v_count > 0 then
    raise exception 'GA-4C2.1: validação prévia falhou — % profile(s) com nivel_acesso=admin sem grupo_id apontando corretamente para o Grupo ADM da própria empresa.', v_count;
  end if;

  -- 6. grupo_id aponta pro Grupo ADM mas nivel_acesso <> admin em algum dos dois espelhos
  select count(*) into v_count
    from public.profiles p
    join public.grupos_acesso g on g.id = p.grupo_id
    join public.usuarios u on u.id = p.id
    where g.e_grupo_adm = true
      and (p.nivel_acesso <> 'admin' or u.nivel_acesso <> 'admin');
  if v_count > 0 then
    raise exception 'GA-4C2.1: validação prévia falhou — % vínculo(s) de Grupo ADM sem nivel_acesso=admin em profiles e/ou usuarios.', v_count;
  end if;

  -- ativo=false é valido para ADM: nenhuma checagem de ativo acima, de proposito.
end $$;

-- ---------------------------------------------------------------------
-- 3. Helper central de coerência final — chamado pelos dois constraint
--    triggers deferred abaixo. SECURITY DEFINER (precisa ler profiles/
--    usuarios/grupos_acesso independente de RLS — a garantia é sobre o
--    estado FÍSICO real, não sobre o que a sessão que disparou o
--    trigger enxergaria via RLS). Nunca exposta como RPC operacional.
--    Owner fixado explicitamente para postgres — nunca depender apenas
--    do role do runner da migration.
-- ---------------------------------------------------------------------

create or replace function public.validar_coerencia_vinculo_operacional(p_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_profile public.profiles%rowtype;
  v_usuario public.usuarios%rowtype;
  v_tem_profile boolean;
  v_tem_usuario boolean;
  v_grupo_adm_id uuid;
begin
  select * into v_profile from public.profiles where id = p_id;
  v_tem_profile := v_profile.id is not null;

  select * into v_usuario from public.usuarios where id = p_id;
  v_tem_usuario := v_usuario.id is not null;

  -- Nenhuma linha existe: valido (exclusao coordenada completa).
  if not v_tem_profile and not v_tem_usuario then
    return;
  end if;

  -- Exatamente uma existe: invalido.
  if v_tem_profile <> v_tem_usuario then
    raise exception 'vínculo operacional incoerente para % — existe em % mas não em %.',
      p_id,
      case when v_tem_profile then 'profiles' else 'usuarios' end,
      case when v_tem_profile then 'usuarios' else 'profiles' end;
  end if;

  -- As duas existem: validar coerencia completa.
  if v_profile.empresa_id <> v_usuario.empresa_id then
    raise exception 'vínculo operacional incoerente para % — empresa_id diverge entre profiles e usuarios.', p_id;
  end if;

  if v_profile.nivel_acesso <> v_usuario.nivel_acesso then
    raise exception 'vínculo operacional incoerente para % — nivel_acesso diverge entre profiles e usuarios.', p_id;
  end if;

  if v_profile.nivel_acesso = 'admin' then
    select g.id into v_grupo_adm_id
      from public.grupos_acesso g
      where g.empresa_id = v_profile.empresa_id and g.e_grupo_adm = true;

    if v_profile.grupo_id is distinct from v_grupo_adm_id then
      raise exception 'vínculo operacional incoerente para % — nivel_acesso=admin mas grupo_id não aponta para o Grupo ADM da própria empresa.', p_id;
    end if;
  end if;

  if v_profile.grupo_id is not null then
    if exists (select 1 from public.grupos_acesso g where g.id = v_profile.grupo_id and g.e_grupo_adm = true) then
      if v_profile.nivel_acesso <> 'admin' or v_usuario.nivel_acesso <> 'admin' then
        raise exception 'vínculo operacional incoerente para % — grupo_id aponta para o Grupo ADM mas nivel_acesso não é admin em profiles e/ou usuarios.', p_id;
      end if;
    end if;
  end if;

  -- ativo nunca entra nesta checagem, de proposito (ativo=false e valido para ADM).
end;
$function$;

comment on function public.validar_coerencia_vinculo_operacional(uuid) is
  'GA-4C2.1: valida o estado físico real (independente de RLS) da identidade operacional de um usuário — profiles × usuarios × Grupo ADM. Chamada só pelos constraint triggers deferred desta migration. Nunca exposta como RPC operacional.';

alter function public.validar_coerencia_vinculo_operacional(uuid) owner to postgres;

revoke execute on function public.validar_coerencia_vinculo_operacional(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Constraint triggers deferred — validam o estado FINAL da transação,
--    nunca valores de trânsito. Redundância entre linhas do mesmo ID é
--    aceita (mesmo padrão já usado em GA-4B). Nenhuma tabela auxiliar.
--    Wrappers SECURITY DEFINER (não INVOKER): a leitura de profiles/
--    usuarios/grupos_acesso dentro do helper precisa ser independente
--    de RLS mesmo quando o disparo vier de uma sessão authenticated
--    comum (ex.: INSERT legítimo feito pela futura RPC C2.2, que roda
--    como postgres — mas o constraint trigger, sendo deferred, pode
--    disparar em momento posterior da mesma transação; manter DEFINER
--    aqui evita qualquer dependência do contexto de quem disparou o
--    evento). Owner fixado explicitamente para postgres.
-- ---------------------------------------------------------------------

create or replace function public.trg_profiles_validar_coerencia_vinculo()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  perform public.validar_coerencia_vinculo_operacional(coalesce(new.id, old.id));
  return null;
end;
$function$;

alter function public.trg_profiles_validar_coerencia_vinculo() owner to postgres;

revoke execute on function public.trg_profiles_validar_coerencia_vinculo() from public, anon, authenticated;

create constraint trigger profiles_validar_coerencia_vinculo
  after insert or update of empresa_id, nivel_acesso, grupo_id or delete
  on public.profiles
  deferrable initially deferred
  for each row
  execute function public.trg_profiles_validar_coerencia_vinculo();

create or replace function public.trg_usuarios_validar_coerencia_vinculo()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  perform public.validar_coerencia_vinculo_operacional(coalesce(new.id, old.id));
  return null;
end;
$function$;

alter function public.trg_usuarios_validar_coerencia_vinculo() owner to postgres;

revoke execute on function public.trg_usuarios_validar_coerencia_vinculo() from public, anon, authenticated;

create constraint trigger usuarios_validar_coerencia_vinculo
  after insert or update of empresa_id, nivel_acesso or delete
  on public.usuarios
  deferrable initially deferred
  for each row
  execute function public.trg_usuarios_validar_coerencia_vinculo();

-- ---------------------------------------------------------------------
-- 5. Substitui o corpo de trg_profiles_bloquear_grupo_id_direto (GA-4C1)
--    — mesma assinatura de trigger, sem novo CREATE TRIGGER para ela.
--    Elimina completamente app.grupo_id_via_function. Incorpora
--    autopromoção/autorrebaixamento/último-ADM na fronteira do Grupo ADM
--    (GA-4C2-A6, comprovado empiricamente nos 6 casos obrigatórios).
-- ---------------------------------------------------------------------

create or replace function public.trg_profiles_bloquear_grupo_id_direto()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_old_e_adm boolean := false;
  v_new_e_adm boolean := false;
  v_ativos_restantes int;
begin
  if tg_op = 'INSERT' then
    if new.grupo_id is null then
      return new;
    end if;
    if current_user <> 'postgres' then
      raise exception 'profiles: definição de grupo_id só pode ser feita pelo protocolo autorizado.';
    end if;
    -- INSERT nunca executa logica de autopromocao/autorrebaixamento.
    return new;
  end if;

  -- TG_OP = 'UPDATE' a partir daqui.
  if new.grupo_id is not distinct from old.grupo_id then
    return new;
  end if;

  if current_user <> 'postgres' then
    raise exception 'profiles: alteração de grupo_id só pode ser feita pelo protocolo autorizado.';
  end if;

  -- Consultas sempre por (id, empresa_id) — nunca so por id (defesa em
  -- profundidade adicional, redundante com a FK composta, mas explicita
  -- aqui por clareza de intencao).
  if old.grupo_id is not null then
    select e_grupo_adm into v_old_e_adm
      from public.grupos_acesso
      where id = old.grupo_id and empresa_id = old.empresa_id;
  end if;

  if new.grupo_id is not null then
    select e_grupo_adm into v_new_e_adm
      from public.grupos_acesso
      where id = new.grupo_id and empresa_id = new.empresa_id;
  end if;

  -- nao-ADM -> ADM: autopromocao proibida; outro ADM promovendo e permitido estruturalmente.
  if v_new_e_adm and not v_old_e_adm then
    if old.id = auth.uid() then
      raise exception 'profiles: um usuário não pode se autopromover ao Grupo ADM.';
    end if;
    return new;
  end if;

  -- ADM -> nao-ADM: autorrebaixamento proibido; ultimo ADM ativo protegido.
  if v_old_e_adm and not v_new_e_adm then
    if old.id = auth.uid() then
      raise exception 'profiles: um ADM não pode se autorrebaixar (sair do Grupo ADM).';
    end if;

    if old.ativo then
      -- Lock canonico: linha do Grupo ADM em grupos_acesso, adquirido
      -- ANTES da contagem (mesmo protocolo ja comprovado em GA-4B).
      perform 1 from public.grupos_acesso where id = old.grupo_id for update;

      select count(*) into v_ativos_restantes
        from public.profiles
        where grupo_id = old.grupo_id and ativo = true and id <> old.id;

      if v_ativos_restantes = 0 then
        raise exception 'profiles: a empresa não pode ficar sem nenhum ADM ativo.';
      end if;
    end if;
    -- ADM inativo saindo: sem contagem, ja passou pelo self-check acima.
    return new;
  end if;

  -- nao-ADM -> nao-ADM, ou ADM -> ADM (este ultimo nao deveria ocorrer,
  -- dado o indice unico parcial de GA-4A, mas o caminho estrutural
  -- permanece correto: sem contagem adicional).
  return new;
end;
$function$;

comment on function public.trg_profiles_bloquear_grupo_id_direto() is
  'GA-4C2.1: substitui completamente o mecanismo de proteção da GA-4C1 (app.grupo_id_via_function eliminada — GA-4C2-A2, achado crítico: set_config em GUC custom não exige privilégio nenhum, mesmo problema já identificado e corrigido duas vezes antes neste projeto). Agora usa current_user=postgres (só verdadeiro dentro de SECURITY DEFINER de dono postgres, nunca forjável por authenticated/anon/service_role) + auth.uid() (chamador real, confirmado que permanece correto mesmo sob SECURITY DEFINER) para: bloquear escrita direta de grupo_id; proibir autopromoção ao Grupo ADM; proibir autorrebaixamento do Grupo ADM; proteger o último ADM ativo (lock em grupos_acesso antes da contagem). current_user=postgres não é autorização de negócio — só contexto privilegiado controlado; autorização real fica com a futura RPC (GA-4C2.2).';

-- ---------------------------------------------------------------------
-- 6. Guard BEFORE INSERT — profiles. Fecha o INSERT direto que a GA-4C1
--    ainda permitia transitoriamente (qualquer authenticated podia
--    inserir profile com grupo_id NULL). provisionar_usuario continua
--    estruturalmente compativel: SECURITY DEFINER, owner postgres, seus
--    INSERTs sao vistos pelos triggers como current_user=postgres.
-- ---------------------------------------------------------------------

create or replace function public.trg_profiles_bloquear_insert_direto()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
begin
  if current_user <> 'postgres' then
    raise exception 'profiles: criação de linha só pode ser feita pelo protocolo autorizado.';
  end if;
  return new;
end;
$function$;

comment on function public.trg_profiles_bloquear_insert_direto() is
  'GA-4C2.1: fecha o INSERT direto que a GA-4C1 ainda permitia transitoriamente quando grupo_id era NULL. provisionar_usuario (SECURITY DEFINER, owner postgres) continua funcionando sem nenhuma mudança.';

create trigger profiles_bloquear_insert_direto
  before insert on public.profiles
  for each row
  execute function public.trg_profiles_bloquear_insert_direto();

-- ---------------------------------------------------------------------
-- 7. Guard BEFORE UPDATE OF nivel_acesso — profiles. Sem contagem de
--    ADM aqui — a membresia do Grupo ADM (seção 4) e o ponto canônico.
-- ---------------------------------------------------------------------

create or replace function public.trg_profiles_bloquear_nivel_acesso_direto()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
begin
  if new.nivel_acesso is not distinct from old.nivel_acesso then
    return new;
  end if;

  if current_user <> 'postgres' then
    raise exception 'profiles: alteração de nivel_acesso só pode ser feita pelo protocolo autorizado.';
  end if;

  return new;
end;
$function$;

comment on function public.trg_profiles_bloquear_nivel_acesso_direto() is
  'GA-4C2.1: bloqueia UPDATE direto de profiles.nivel_acesso fora do protocolo autorizado — fecha a lacuna que permitia criar profiles.nivel_acesso != usuarios.nivel_acesso (dispara falso-positivo em U7/U9).';

create trigger profiles_bloquear_nivel_acesso_direto
  before update of nivel_acesso on public.profiles
  for each row
  execute function public.trg_profiles_bloquear_nivel_acesso_direto();

-- ---------------------------------------------------------------------
-- 8. Guard BEFORE UPDATE OF ativo — profiles. OPÇÃO A fechada (GA-4C2-
--    A3): toda mudança real de ativo exige o protocolo. Self-check só
--    na direção true->false (desativação); false->true nunca reduz
--    continuidade, sem contagem. Alvo fora do Grupo ADM: nenhuma regra
--    adicional além do guard de current_user.
-- ---------------------------------------------------------------------

create or replace function public.trg_profiles_guardar_ativo()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_e_grupo_adm boolean := false;
  v_ativos_restantes int;
begin
  if new.ativo is not distinct from old.ativo then
    return new;
  end if;

  if current_user <> 'postgres' then
    raise exception 'profiles: alteração de ativo só pode ser feita pelo protocolo autorizado.';
  end if;

  if old.grupo_id is not null then
    select e_grupo_adm into v_e_grupo_adm
      from public.grupos_acesso
      where id = old.grupo_id and empresa_id = old.empresa_id;
  end if;

  if v_e_grupo_adm and new.ativo = false then
    if old.id = auth.uid() then
      raise exception 'profiles: um ADM não pode se autodesativar.';
    end if;

    perform 1 from public.grupos_acesso where id = old.grupo_id for update;

    select count(*) into v_ativos_restantes
      from public.profiles
      where grupo_id = old.grupo_id and ativo = true and id <> old.id;

    if v_ativos_restantes = 0 then
      raise exception 'profiles: a empresa não pode ficar sem nenhum ADM ativo.';
    end if;
  end if;
  -- alvo fora do Grupo ADM, ou false->true: nenhuma regra adicional.

  return new;
end;
$function$;

comment on function public.trg_profiles_guardar_ativo() is
  'GA-4C2.1 (OPÇÃO A fechada): bloqueia UPDATE direto de profiles.ativo fora do protocolo autorizado. Quando o alvo é membro do Grupo ADM e a mudança é true->false: autodesativação sempre proibida; outro ADM desativando exige lock em grupos_acesso + contagem de ADM ativos restantes (≥1 obrigatório). false->true nunca reduz continuidade, sem contagem.';

create trigger profiles_guardar_ativo
  before update of ativo on public.profiles
  for each row
  execute function public.trg_profiles_guardar_ativo();

-- ---------------------------------------------------------------------
-- 9. Guard BEFORE DELETE — profiles. Confirmado empiricamente (GA-4C2-A)
--    que dispara normalmente mesmo em cascade de DELETE auth.users.
-- ---------------------------------------------------------------------

create or replace function public.trg_profiles_guardar_delete()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_e_grupo_adm boolean := false;
  v_ativos_restantes int;
begin
  if current_user <> 'postgres' then
    raise exception 'profiles: exclusão só pode ser feita pelo protocolo autorizado.';
  end if;

  if old.grupo_id is not null then
    select e_grupo_adm into v_e_grupo_adm
      from public.grupos_acesso
      where id = old.grupo_id and empresa_id = old.empresa_id;
  end if;

  if v_e_grupo_adm then
    if old.id = auth.uid() then
      raise exception 'profiles: um ADM não pode se autoexcluir.';
    end if;

    if old.ativo then
      perform 1 from public.grupos_acesso where id = old.grupo_id for update;

      select count(*) into v_ativos_restantes
        from public.profiles
        where grupo_id = old.grupo_id and ativo = true and id <> old.id;

      if v_ativos_restantes = 0 then
        raise exception 'profiles: a empresa não pode ficar sem nenhum ADM ativo.';
      end if;
    end if;
    -- ADM inativo excluido: sem contagem, ja passou pelo self-check acima.
  end if;

  return old;
end;
$function$;

comment on function public.trg_profiles_guardar_delete() is
  'GA-4C2.1: bloqueia DELETE direto de profiles fora do protocolo autorizado. Alvo membro do Grupo ADM: self-delete sempre proibido; ADM ativo exige lock em grupos_acesso + contagem (≥1 ADM ativo restante obrigatório); ADM inativo não entra na contagem. Dispara normalmente mesmo quando o DELETE se origina de um cascade de auth.users (confirmado empiricamente em GA-4C2-A).';

create trigger profiles_guardar_delete
  before delete on public.profiles
  for each row
  execute function public.trg_profiles_guardar_delete();

-- ---------------------------------------------------------------------
-- 10. Guards — usuarios. Nenhuma regra de último ADM aqui — fonte
--    estrutural canônica é profiles.grupo_id + profiles.ativo (seção
--    7/8). usuarios.nivel_acesso é só espelho técnico transitório.
-- ---------------------------------------------------------------------

create or replace function public.trg_usuarios_bloquear_insert_direto()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
begin
  if current_user <> 'postgres' then
    raise exception 'usuarios: criação de linha só pode ser feita pelo protocolo autorizado.';
  end if;
  return new;
end;
$function$;

comment on function public.trg_usuarios_bloquear_insert_direto() is
  'GA-4C2.1: bloqueia INSERT direto em usuarios fora do protocolo autorizado. provisionar_usuario (SECURITY DEFINER, owner postgres) continua funcionando sem nenhuma mudança.';

create trigger usuarios_bloquear_insert_direto
  before insert on public.usuarios
  for each row
  execute function public.trg_usuarios_bloquear_insert_direto();

create or replace function public.trg_usuarios_bloquear_nivel_acesso_direto()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
begin
  if new.nivel_acesso is not distinct from old.nivel_acesso then
    return new;
  end if;

  if current_user <> 'postgres' then
    raise exception 'usuarios: alteração de nivel_acesso só pode ser feita pelo protocolo autorizado.';
  end if;

  return new;
end;
$function$;

comment on function public.trg_usuarios_bloquear_nivel_acesso_direto() is
  'GA-4C2.1: bloqueia UPDATE direto de usuarios.nivel_acesso fora do protocolo autorizado — usuarios.nivel_acesso é espelho técnico transitório de profiles.nivel_acesso (nunca autoridade futura), mantido em sincronia só por causa de U7/U9.';

create trigger usuarios_bloquear_nivel_acesso_direto
  before update of nivel_acesso on public.usuarios
  for each row
  execute function public.trg_usuarios_bloquear_nivel_acesso_direto();

create or replace function public.trg_usuarios_bloquear_delete()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
begin
  if current_user <> 'postgres' then
    raise exception 'usuarios: exclusão só pode ser feita pelo protocolo autorizado.';
  end if;
  return old;
end;
$function$;

comment on function public.trg_usuarios_bloquear_delete() is
  'GA-4C2.1: bloqueia DELETE direto em usuarios fora do protocolo autorizado — evita que só um dos dois espelhos da identidade operacional seja excluído (o que U7/U9 detectaria como inconsistente). Nenhuma regra de último ADM aqui — canônico é profiles.';

create trigger usuarios_bloquear_delete
  before delete on public.usuarios
  for each row
  execute function public.trg_usuarios_bloquear_delete();

-- ---------------------------------------------------------------------
-- 11. ACL final — guards imediatos (SECURITY INVOKER) desta migration:
--     sem EXECUTE para PUBLIC/anon/authenticated (ALTER DEFAULT
--     PRIVILEGES deste projeto concede EXECUTE a authenticated/anon
--     automaticamente em toda função nova — confirmado em
--     202607190006, por isso todo revoke abaixo é explícito, inclusive
--     para a função já existente da GA-4C1 cujo corpo foi substituído
--     — CREATE OR REPLACE não altera ACL, mas o revoke é reemitido
--     aqui por auditabilidade/clareza, idempotente com o que a GA-4C1
--     já tinha feito). O helper e os 2 wrappers deferred já tiveram
--     owner e REVOKE fixados individualmente logo após sua criação
--     (seções 3 e 4) — não repetidos aqui.
-- ---------------------------------------------------------------------

revoke execute on function public.trg_profiles_bloquear_grupo_id_direto() from public, anon, authenticated;
revoke execute on function public.trg_profiles_bloquear_insert_direto() from public, anon, authenticated;
revoke execute on function public.trg_profiles_bloquear_nivel_acesso_direto() from public, anon, authenticated;
revoke execute on function public.trg_profiles_guardar_ativo() from public, anon, authenticated;
revoke execute on function public.trg_profiles_guardar_delete() from public, anon, authenticated;
revoke execute on function public.trg_usuarios_bloquear_insert_direto() from public, anon, authenticated;
revoke execute on function public.trg_usuarios_bloquear_nivel_acesso_direto() from public, anon, authenticated;
revoke execute on function public.trg_usuarios_bloquear_delete() from public, anon, authenticated;

commit;
