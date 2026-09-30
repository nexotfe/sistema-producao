begin;

-- ============================================================================
-- GA-4C1 — Fundação do vínculo profiles.grupo_id -> grupos_acesso
-- (Administração Segura de Usuários — frente Grupo de Acesso do NEXOTFE)
--
-- Introduz a coluna que será, no futuro, a fonte única do vínculo
-- Usuário -> Grupo de Acesso. Backfill determinístico só dos
-- administradores existentes (destino inequívoco: o Grupo ADM da
-- própria empresa, já criado e garantido único por GA-4A). Nenhum
-- usuário não-admin recebe grupo nesta fatia (GA-3-D1: pendência
-- intencional, classificação exige decisão explícita de um ADM,
-- endereçada em GA-4C2/C3).
--
-- 100% dentro do escopo autorizado (GA-4C-A/A2). NÃO ativa Grupo de
-- Acesso como autoridade real do sistema. NÃO toca: usuarios,
-- nivel_acesso, usuario_e_admin(), empresa_atual_id(),
-- provisionar_usuario(), RLS existente de profiles, U7/U9,
-- papeis_funcionais. NÃO cria RPC, NÃO cria UI, NÃO torna grupo_id
-- NOT NULL, NÃO protege "último ADM" (isso depende de movimentação
-- operacional, que só existe a partir de GA-4C2).
--
-- Sequência desta migration (GA-4C-A2, ponto 1 — owner ignora RLS,
-- nunca ignora trigger): coluna + FK + índice -> backfill -> validação
-- de integridade do backfill -> SÓ ENTÃO o trigger de bloqueio é
-- instalado. Enquanto o trigger não existe nesta própria transação, o
-- backfill grava livremente; a partir do CREATE TRIGGER (mesma
-- transação, antes do commit), qualquer UPDATE de grupo_id passa a
-- exigir a flag transacional autorizadora — e nenhuma RPC capaz de
-- setar essa flag existe ainda em GA-4C1, então NENHUM caminho normal
-- (incluindo a policy "FOR ALL admin" já existente em profiles, que
-- hoje permite UPDATE de qualquer coluna) consegue mudar grupo_id a
-- partir do fim desta migration. Isso fecha a lacuna encontrada em
-- GA-4C-A/seção A: RLS sozinha nunca protegeu granularmente coluna a
-- coluna — o mesmo padrão real já usado no projeto para o mesmo tipo
-- de problema (app.aprovacao_via_function + trigger, ver
-- 202607190006_simulacao_comercial_snapshot.sql) é reaproveitado aqui
-- como app.grupo_id_via_function.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1. profiles.grupo_id — nullable, sem tocar nivel_acesso/ativo.
-- ---------------------------------------------------------------------

alter table public.profiles
  add column grupo_id uuid null;

comment on column public.profiles.grupo_id is
  'GA-4C1: vínculo estrutural Usuário -> Grupo de Acesso (fonte única, não duplicado em usuarios). Nullable nesta fatia — usuário não-admin existente permanece intencionalmente sem grupo até classificação explícita por um ADM (GA-3-D1). Ainda NÃO é autoridade real do sistema. Alteração fora do protocolo autorizado (RPC oficial, a existir em GA-4C2) é bloqueada estruturalmente por trigger — ver profiles_bloquear_grupo_id_direto.';

-- ---------------------------------------------------------------------
-- 2. FK composta tenant-safe — reaproveita a chave candidata já
--    existente em grupos_acesso (grupos_acesso_empresa_id_id_uniq,
--    GA-4A), mesmo padrão já usado por grupo_permissoes_grupo_empresa_fk
--    (GA-4B). Impede estruturalmente associar usuário da empresa A a
--    grupo da empresa B.
-- ---------------------------------------------------------------------

alter table public.profiles
  add constraint profiles_grupo_empresa_fk
  foreign key (grupo_id, empresa_id)
  references public.grupos_acesso(id, empresa_id)
  on delete restrict;

-- ---------------------------------------------------------------------
-- 3. Índice.
-- ---------------------------------------------------------------------

create index profiles_grupo_id_idx on public.profiles (grupo_id);

-- ---------------------------------------------------------------------
-- 4. Backfill determinístico — só nivel_acesso='admin', sem filtrar por
--    ativo (GA-4C-A2, ponto 3/4: inativo continua contando como
--    vinculado). Nenhum grupo padrão para não-admin — grupo_id
--    permanece NULL para eles, intencionalmente.
-- ---------------------------------------------------------------------

update public.profiles p
set grupo_id = g.id
from public.grupos_acesso g
where p.nivel_acesso = 'admin'
  and g.empresa_id = p.empresa_id
  and g.e_grupo_adm = true;

-- ---------------------------------------------------------------------
-- 5. Validação obrigatória do backfill — aborta a migration inteira se
--    qualquer profiles admin não tiver terminado corretamente vinculado
--    ao Grupo ADM da própria empresa. Nenhum backfill parcial ou
--    incorreto passa silenciosamente.
-- ---------------------------------------------------------------------

do $$
declare
  v_invalidos int;
begin
  select count(*) into v_invalidos
  from public.profiles p
  where p.nivel_acesso = 'admin'
    and (
      p.grupo_id is null
      or not exists (
        select 1 from public.grupos_acesso g
        where g.id = p.grupo_id
          and g.empresa_id = p.empresa_id
          and g.e_grupo_adm = true
      )
    );

  if v_invalidos > 0 then
    raise exception 'GA-4C1: backfill de grupo_id para administradores está incompleto ou incorreto — % linha(s) de profiles com nivel_acesso=admin sem grupo_id apontando corretamente para o Grupo ADM da própria empresa.',
      v_invalidos;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Trigger estrutural de bloqueio — instalado SÓ DEPOIS do backfill
--    validado acima (GA-4C-A2, ponto 1). Contrato: sem mudança efetiva
--    de grupo_id (comparação null-safe), passa sem erro; com mudança,
--    exige app.grupo_id_via_function = 'true' na transação — ausência
--    da GUC é tratada como NÃO autorizada (fail-closed via
--    current_setting(..., true) + coalesce). Nenhuma RPC capaz de
--    setar essa flag existe em GA-4C1 — logo nenhum caminho normal
--    (aplicação/RLS) consegue mudar grupo_id nesta fatia. Não é
--    impossibilidade absoluta para um superusuário/owner que configure
--    deliberadamente a mesma GUC fora do protocolo — a garantia é
--    contra qualquer caminho normal da aplicação, não contra
--    administração direta de banco.
-- ---------------------------------------------------------------------

create or replace function public.trg_profiles_bloquear_grupo_id_direto()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
begin
  -- INSERT transitório da C1: profile pode nascer ainda não
  -- classificado (provisionar_usuario legado não conhece grupo_id).
  if tg_op = 'INSERT' and new.grupo_id is null then
    return new;
  end if;

  -- UPDATE que apenas menciona grupo_id na lista de SET, mas não o
  -- altera de fato (comparação null-safe) — nunca acessa OLD no
  -- caminho de INSERT.
  if tg_op = 'UPDATE'
     and new.grupo_id is not distinct from old.grupo_id then
    return new;
  end if;

  -- INSERT já nascendo classificado, ou mudança efetiva de grupo_id
  -- num UPDATE: só pelo protocolo autorizado.
  if coalesce(current_setting('app.grupo_id_via_function', true), '') <> 'true' then
    raise exception 'profiles: % de grupo_id só pode ser feita pelo protocolo autorizado (RPC oficial de movimentação — ainda não existe nesta etapa, GA-4C2).',
      case when tg_op = 'INSERT' then 'definição' else 'alteração' end;
  end if;

  return new;
end;
$function$;

comment on function public.trg_profiles_bloquear_grupo_id_direto() is
  'GA-4C1: bloqueia INSERT com grupo_id já preenchido e UPDATE direto de profiles.grupo_id, fora do protocolo autorizado. INSERT com grupo_id NULL continua permitido (provisionar_usuario legado não conhece grupo_id — a coluna nasce NULL e passa livremente). Mesmo padrão já usado no projeto para o mesmo tipo de problema (app.aprovacao_via_function, ver 202607190006_simulacao_comercial_snapshot.sql) — RLS sozinha (policy "FOR ALL admin" em profiles, GA-4C-A seção A, FOR ALL inclui INSERT) não distingue coluna a coluna nem estado de nascimento; esta trigger fecha essa lacuna estruturalmente, inclusive contra escrita privilegiada. Sem GRANT operacional nesta fatia — nenhuma RPC seta a flag ainda. DELETE fica fora de C1 (pertence a C2, junto com último ADM/continuidade administrativa).';

revoke execute on function public.trg_profiles_bloquear_grupo_id_direto() from public, anon, authenticated;

create trigger profiles_bloquear_grupo_id_direto
  before insert or update of grupo_id on public.profiles
  for each row
  execute function public.trg_profiles_bloquear_grupo_id_direto();

commit;
