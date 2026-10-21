-- PCP-P8I-B2: funcao de autorizacao por Grupo de Acesso para as futuras
-- Server Actions do PCP (P8I-B3/B4+). Migration isolada - so a funcao,
-- nenhuma populacao de permissoes/grupo_permissoes (fica para etapa
-- separada, apos aprovacao do catalogo). Desenho revisado e aprovado
-- em PCP-P8I-B2 (4 correcoes incorporadas: validar chave antes de tudo
-- inclusive para ADM; reaproveitar a regra de
-- resolver_consistencia_vinculo_operacional_atual - mesma checagem
-- profiles<->usuarios, adaptada para p_usuario_id em vez de auth.uid()
-- por incompatibilidade de contexto de chamada (SECURITY INVOKER vs
-- DEFINER, EXECUTE restrito a authenticated vs service_role); ativo
-- IS NOT TRUE em vez de NOT ativo, para tratar NULL como rejeicao
-- (bug de logica de 3 valores corrigido antes de codificar); e
-- documentar que p_usuario_id chega de um chamador JA privilegiado,
-- nunca e prova independente de autenticacao - essa garantia e'
-- responsabilidade da Server Action futura (auth.getUser() no client
-- de sessao, nunca aceitando usuario_id do corpo da requisicao).

create or replace function public.usuario_tem_permissao(p_usuario_id uuid, p_chave text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id_profile uuid;
  v_empresa_id_usuario uuid;
  v_nivel_acesso_profile public.nivel_acesso;
  v_nivel_acesso_usuario public.nivel_acesso;
  v_grupo_id uuid;
  v_ativo boolean;
  v_e_adm boolean;
begin
  -- 1. chave precisa existir no catalogo global - antes de qualquer
  -- outra checagem, inclusive para ADM. Chave invalida/nula = false.
  if p_chave is null or not exists (select 1 from public.permissoes where chave = p_chave) then
    return false;
  end if;

  -- 2. vinculo operacional coerente - mesma regra de
  -- resolver_consistencia_vinculo_operacional_atual() (profiles x
  -- usuarios concordam em empresa_id/nivel_acesso), adaptada para
  -- p_usuario_id. Todas as colunas envolvidas sao NOT NULL em ambas
  -- as tabelas - equivalencia logica confirmada por leitura do
  -- catalogo real antes de escrever esta migration.
  select p.empresa_id, p.nivel_acesso, p.grupo_id, p.ativo
    into v_empresa_id_profile, v_nivel_acesso_profile, v_grupo_id, v_ativo
  from public.profiles p where p.id = p_usuario_id;

  select u.empresa_id, u.nivel_acesso
    into v_empresa_id_usuario, v_nivel_acesso_usuario
  from public.usuarios u where u.id = p_usuario_id;

  if v_empresa_id_profile is null or v_empresa_id_usuario is null then
    return false; -- sem vinculo em uma das duas tabelas
  end if;
  if v_empresa_id_profile is distinct from v_empresa_id_usuario
     or v_nivel_acesso_profile is distinct from v_nivel_acesso_usuario then
    return false; -- vinculo operacional inconsistente
  end if;

  -- 3. ativo estritamente true - false OU null rejeitam, inclusive ADM.
  if v_ativo is not true then
    return false;
  end if;

  if v_grupo_id is null then
    return false; -- sem grupo, sem autoridade
  end if;

  -- 4. autoridade total do ADM - so depois de validado tudo acima, e
  -- so depois de confirmar que a chave existe (passo 1).
  select e_grupo_adm into v_e_adm
  from public.grupos_acesso where id = v_grupo_id and empresa_id = v_empresa_id_profile;

  if v_e_adm then
    return true;
  end if;

  return exists (
    select 1 from public.grupo_permissoes gp
    join public.permissoes perm on perm.id = gp.permissao_id
    where gp.grupo_id = v_grupo_id
      and gp.empresa_id = v_empresa_id_profile
      and perm.chave = p_chave
  );
end;
$function$;

comment on function public.usuario_tem_permissao(uuid, text) is
  'PCP-P8I-B2: autorizacao por Grupo de Acesso. p_usuario_id chega de um chamador JA PRIVILEGIADO (service_role) - esta funcao NAO autentica ninguem e NAO e prova independente de identidade. A garantia de que p_usuario_id corresponde a sessao real e responsabilidade da Server Action chamadora (auth.getUser() no client de sessao, nunca aceitando usuario_id do corpo da requisicao). Verificar a permissao no momento de cada operacao - nunca cachear/reutilizar autorizacao anterior. Autoridade do ADM (grupos_acesso.e_grupo_adm) e total sobre qualquer chave valida do catalogo, nunca materializada em grupo_permissoes.';

alter function public.usuario_tem_permissao(uuid, text) owner to postgres;
revoke all on function public.usuario_tem_permissao(uuid, text) from public, anon, authenticated;
grant execute on function public.usuario_tem_permissao(uuid, text) to service_role;
