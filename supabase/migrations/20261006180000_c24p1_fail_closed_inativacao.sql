-- C2.4-P1 — pré-requisitos estruturais de inativação (fail-closed), validados
-- em C2.4-V1 (sandbox descartável, evidência real) antes desta formalização.
--
-- Escopo deliberadamente restrito a 2 pontos, nenhum outro objeto tocado:
--
-- 1. public.empresa_atual_id() — correção do gap real encontrado em V1.1:
--    o fallback para usuarios não filtrava por atividade (usuarios não tem
--    coluna ativo), permitindo que um usuario com profiles.ativo=false ainda
--    resolvesse empresa_id via COALESCE. Correção mínima: o fallback só vale
--    quando NÃO existe linha em profiles para o id (preserva o caso legado
--    "profiles nunca existiu", nunca o caso "profiles existe e está
--    inativo"). Mesmo corpo testado em V1.1 (gap confirmado + correção
--    validada + zero regressão em usuario_e_admin() e em policy real de
--    clientes).
--
-- 2. public.usuario_atual_esta_ativo() — nova função ADITIVA (não substitui
--    nem altera resolver_consistencia_vinculo_operacional_atual(), que
--    permanece byte a byte igual — seu contrato documentado de não
--    considerar profiles.ativo continua válido para ELA; a checagem de
--    atividade passa a ser uma segunda barreira INDEPENDENTE, combinada
--    pelo proxy). Contrato mínimo e previsível: zero parâmetros, identidade
--    sempre de auth.uid(), retorno boolean simples, false quando não houver
--    profiles correspondente OU quando estiver inativo, true somente quando
--    profiles.ativo = true. Sem fallback para usuarios nesta função -- ela
--    responde uma coisa só: "o usuário operacional atual está ativo?".
--
-- Fora de escopo nesta migration: primeiro acesso, links, e-mail, reset
-- administrativo, qualquer RPC de credencial, qualquer outra tabela/função.

-- ---------------------------------------------------------------------
-- 1. Correção de empresa_atual_id().
-- ---------------------------------------------------------------------

create or replace function public.empresa_atual_id()
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
        and not exists (
          select 1 from public.profiles where profiles.id = auth.uid()
        )
    )
  )
$function$;

comment on function public.empresa_atual_id() is
  'C2.4-P1: resolve o empresa_id do usuário autenticado atual. Caminho principal: profiles.ativo=true. Fallback para usuarios SOMENTE quando não existe nenhuma linha em profiles para o id (caso legado) -- nunca quando profiles existe mas está inativo (gap corrigido, validado em C2.4-V1/V1.1). usuarios não tem coluna ativo; por isso o fallback precisa desta exclusão explícita, não de um filtro de atividade próprio.';

-- ACL inalterada (mesma desde o bootstrap) -- revogar/conceder de novo é
-- idempotente e deixa explícito que a superfície de quem pode chamar não mudou.
revoke all on function public.empresa_atual_id() from public, anon, authenticated, service_role, postgres;
grant execute on function public.empresa_atual_id() to public, anon, authenticated, postgres, service_role;

-- ---------------------------------------------------------------------
-- 2. Nova função: usuario_atual_esta_ativo().
-- ---------------------------------------------------------------------

create function public.usuario_atual_esta_ativo()
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.ativo = true
  )
$function$;

comment on function public.usuario_atual_esta_ativo() is
  'C2.4-P1: segunda barreira, independente e paralela a resolver_consistencia_vinculo_operacional_atual() (que não muda e continua sem considerar atividade). Contrato mínimo: zero parâmetros, identidade sempre de auth.uid(), retorno boolean. false quando não existe profiles para o id OU quando profiles.ativo=false. true somente quando profiles.ativo=true. Sem fallback para usuarios -- responde só "o usuário operacional atual está ativo?". Consumida pelo proxy (src/proxy.ts) depois de confirmar vínculo=coerente.';

alter function public.usuario_atual_esta_ativo() owner to postgres;

revoke all on function public.usuario_atual_esta_ativo() from public, anon, authenticated, service_role, postgres;
grant execute on function public.usuario_atual_esta_ativo() to authenticated;
