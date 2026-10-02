begin;

-- ============================================================================
-- GA-4C2.3-EMAIL — unicidade de e-mail por empresa em public.usuarios
-- (Administração Segura de Usuários — frente identidade/e-mail multiempresa)
--
-- E-mail comercial passa a ser identidade dentro da empresa, não mais
-- globalmente — empresas diferentes podem possuir o mesmo e-mail
-- comercial. Valores são sempre armazenados já normalizados
-- (lower(btrim(email))), nunca corrigidos silenciosamente pelo banco.
-- Identidade técnica de Auth (auth.users.email) é separada do e-mail
-- comercial pelo modelo E4 (GA-4C2.3-EMAIL) — fora do escopo desta
-- migration, que toca somente public.usuarios.
--
-- Auditoria prévia (GA-4C2.3-EMAIL-U2, banco linked): 3 usuários reais,
-- 2 empresas, 0 e-mails não normalizados, 0 colisões intraempresa,
-- 0 NULL/vazio — reconfirmado abaixo via validação própria da migration,
-- nunca presumido.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1. Pré-validação — email NULL ou vazio. Aborta antes de qualquer ALTER.
-- ---------------------------------------------------------------------

do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.usuarios
    where email is null or btrim(email) = '';

  if v_count > 0 then
    raise exception 'GA-4C2.3-EMAIL: % linha(s) de usuarios com email NULL ou vazio — migration abortada, nenhuma correção automática.', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Pré-validação — email não normalizado.
-- ---------------------------------------------------------------------

do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.usuarios
    where email is distinct from lower(btrim(email));

  if v_count > 0 then
    raise exception 'GA-4C2.3-EMAIL: % linha(s) de usuarios com email não normalizado (diferente de lower(btrim(email))) — migration abortada, nenhuma correção automática.', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Pré-validação — colisão de email normalizado dentro da mesma
--    empresa. Nenhuma escolha automática de qual registro preservar.
-- ---------------------------------------------------------------------

do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from (
      select empresa_id, lower(btrim(email)) as email_normalizado
        from public.usuarios
        group by empresa_id, lower(btrim(email))
        having count(*) > 1
    ) colisoes;

  if v_count > 0 then
    raise exception 'GA-4C2.3-EMAIL: % grupo(s) de colisão de email normalizado dentro da mesma empresa — migration abortada, nenhuma escolha automática de qual registro preservar.', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Remove a constraint global atual. Sem IF EXISTS — se a estrutura
--    esperada não existir, a migration falha alto e claro.
-- ---------------------------------------------------------------------

alter table public.usuarios
  drop constraint usuarios_email_key;

-- ---------------------------------------------------------------------
-- 5. Unicidade por empresa. Sem índice funcional — o CHECK abaixo
--    garante que o valor armazenado já está normalizado.
-- ---------------------------------------------------------------------

alter table public.usuarios
  add constraint usuarios_empresa_email_key unique (empresa_id, email);

-- ---------------------------------------------------------------------
-- 6. CHECK fail-closed — o banco rejeita qualquer valor fora da regra,
--    nunca normaliza silenciosamente.
-- ---------------------------------------------------------------------

alter table public.usuarios
  add constraint usuarios_email_normalizado_chk
  check (email = lower(btrim(email)) and email <> '');

commit;
