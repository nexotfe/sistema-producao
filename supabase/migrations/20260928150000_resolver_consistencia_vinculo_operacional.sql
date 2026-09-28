-- Consistência ESTRUTURAL do vínculo operacional do usuário autenticado
-- atual (Administração Segura de Usuários, fatia 1 — artefato
-- fundacional isolado; contrato fechado nas rodadas U1-U3 desta frente).
--
-- Objetivo: dar a proxy.ts/AuthGate (consumo desenhado, NÃO implementado
-- nesta migration) um único ponto reutilizável para responder "a sessão
-- autenticada atual corresponde a um usuário operacional estruturalmente
-- íntegro?" — sem duplicar essa regra em mais de um lugar.
--
-- ESCOPO DELIBERADAMENTE LIMITADO — 'coerente' NÃO significa:
--   - usuário ativo;
--   - usuário autorizado;
--   - usuário habilitado;
--   - usuário apto a operar.
-- Significa só que public.profiles e public.usuarios existem para o
-- mesmo id e concordam entre si (empresa_id, nivel_acesso).
-- profiles.ativo NÃO participa desta regra (fica para a futura fatia de
-- desativação). Autorização de admin continua sendo usuario_e_admin();
-- resolução de tenant continua sendo empresa_atual_id() — nenhuma das
-- duas é alterada ou substituída por esta migration.
--
-- SECURITY INVOKER (não DEFINER, correção explícita sobre o desenho
-- anterior): a função nunca lê auth.users diretamente. profiles.id e
-- usuarios.id têm "references auth.users(id) on delete cascade" desde
-- o bootstrap retroativo (202606200001_bootstrap_retroativo_julho.sql),
-- nunca enfraquecida por nenhuma migration posterior (reconfirmado
-- nesta migration, U4.1) — logo, a existência de profiles/usuarios para
-- um id já garante estruturalmente a existência do auth.users
-- correspondente; não há necessidade de privilégio elevado para checar
-- isso. Se essa FK for removida/alterada no futuro, esta função precisa
-- ser reavaliada.
--
-- Zero parâmetros: a identidade é sempre auth.uid() da sessão do
-- chamador — nunca aceita user_id do cliente. Combinado com SECURITY
-- INVOKER (a função roda com a RLS do próprio chamador), torna
-- estruturalmente impossível consultar o vínculo de outro usuário.

create type public.consistencia_vinculo_operacional_estado as enum (
  'coerente',
  'inconsistente'
);

comment on type public.consistencia_vinculo_operacional_estado is
  'Estado de CONSISTÊNCIA ESTRUTURAL do vínculo operacional (public.profiles + public.usuarios) do usuário autenticado atual, produzido por public.resolver_consistencia_vinculo_operacional_atual(). NÃO representa atividade, autorização ou aptidão para operar — profiles.ativo fica deliberadamente fora desta checagem, que é resolvida por outras funções (usuario_e_admin(), empresa_atual_id()) e pela futura fatia de desativação.';

create function public.resolver_consistencia_vinculo_operacional_atual()
returns public.consistencia_vinculo_operacional_estado
language sql
stable
security invoker
set search_path to 'public'
as $$
  select case
    when auth.uid() is null
      then 'inconsistente'::public.consistencia_vinculo_operacional_estado
    when exists (
      select 1
        from public.profiles p
        join public.usuarios u on u.id = p.id
       where p.id = auth.uid()
         and p.empresa_id = u.empresa_id
         and p.nivel_acesso = u.nivel_acesso
    )
      then 'coerente'::public.consistencia_vinculo_operacional_estado
    else 'inconsistente'::public.consistencia_vinculo_operacional_estado
  end
$$;

comment on function public.resolver_consistencia_vinculo_operacional_atual() is
  'Consistência ESTRUTURAL do vínculo operacional (public.profiles + public.usuarios) do usuário AUTENTICADO ATUAL. Identidade sempre derivada de auth.uid() da sessão do chamador -- função sem parâmetros, nunca aceita user_id de nenhuma origem. "coerente" NAO significa usuário ativo, autorizado, habilitado ou apto a operar -- só que profiles e usuarios existem para o mesmo id e concordam em empresa_id/nivel_acesso. profiles.ativo fica deliberadamente fora desta regra (ver comentário do tipo de retorno). SECURITY INVOKER: nunca consulta auth.users diretamente -- essa garantia depende das FKs profiles.id/usuarios.id -> auth.users(id) existentes desde o bootstrap retroativo (202606200001); se essas FKs forem alteradas no futuro, esta função precisa ser reavaliada. Consumo previsto (NAO implementado nesta migration): proxy.ts como barreira de navegação, distinguindo vínculo INCONSISTENTE de erro técnico ao verificar -- erro técnico nunca deve ser convertido em COERENTE.';

revoke all on function public.resolver_consistencia_vinculo_operacional_atual() from public, anon, authenticated, service_role, postgres;
grant execute on function public.resolver_consistencia_vinculo_operacional_atual() to authenticated;
