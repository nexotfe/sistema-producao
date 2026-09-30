begin;

-- ============================================================================
-- GA-4B — Integridade completa de dependências + RPC oficial de permissões
-- (Administração Segura de Usuários — frente Grupo de Acesso do NEXOTFE)
--
-- Fecha o que GA-4A deixou deliberadamente pendente: valida o conjunto
-- final de permissões de um grupo contra o grafo de dependências, cria o
-- caminho oficial (RPC) para um ADM salvar esse conjunto, e abre a
-- primeira escrita operacional real em grupo_permissoes — sempre pela
-- RPC, nunca por policy de escrita direta para authenticated.
--
-- Desenho fechado ao longo de GA-4B-A / GA-4B-A2 / GA-4B-A3 (revisões
-- técnicas incorporadas antes desta escrita, nenhuma decidida sozinha):
--   - lock estrutural por linha real de grupos_acesso (não advisory
--     lock — já existe uma linha representando o recurso);
--   - lock trava TODOS os grupos OLD/NEW envolvidos numa mutação de
--     grupo_permissoes, em ordem determinística (UUID crescente) —
--     evita deadlock por inversão de ordem entre duas transações que
--     movem linhas entre os mesmos dois grupos em sentidos opostos;
--   - validação do conjunto final de um grupo é DEFERRABLE INITIALLY
--     DEFERRED — permite substituir o conjunto inteiro (remover +
--     inserir) na mesma transação sem falso erro intermediário;
--   - integridade "comum/sensível nunca alcança reservada" é uma
--     invariante GLOBAL do catálogo, validada sobre o ESTADO FINAL da
--     transação (constraint trigger deferred), nunca por checagem
--     imediata linha a linha como garantia final — e usa a MESMA
--     função interna reutilizável independente de qual tabela mudou
--     (permissao_dependencias ou permissoes.categoria), evitando duas
--     regras semanticamente diferentes para o mesmo invariante;
--   - RPC SECURITY DEFINER é a ÚNICA via operacional de escrita —
--     authenticated continua sem INSERT/UPDATE/DELETE direto em
--     grupo_permissoes (nenhuma policy de mutation criada).
--
-- 100% dentro do escopo autorizado. Não toca em: profiles, usuarios,
-- nivel_acesso, usuario_e_admin(), empresa_atual_id(), provisionar_usuario,
-- U7/U9, grupos_acesso (CRUD operacional continua fora de escopo), UI,
-- Server Actions, email/senha/primeiro acesso, colaboradores, OF/OP.
-- Não altera a migration GA-4A publicada (20260930090000) — só adiciona.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1. Lock estrutural de grupo_permissoes — trigger imediato
--    (GA-4B-A2 ponto 3, corrigido em GA-4B-A3)
-- ---------------------------------------------------------------------

-- Trava a(s) linha(s) real(is) de grupos_acesso ANTES de qualquer
-- mutação em grupo_permissoes — vale tanto para a RPC oficial quanto
-- para qualquer escrita privilegiada direta, porque é acionado pela
-- própria tabela, não por disciplina de quem escreve. TG_OP explícito:
-- INSERT usa só NEW, DELETE usa só OLD, UPDATE considera os dois (uma
-- UPDATE que mova a linha de um grupo para outro afeta AMBOS). Dedupe +
-- ordenação por UUID crescente elimina inversão de ordem de lock ENTRE
-- OS GRUPOS CONSIDERADOS NESTE DISPARO (o(s) grupo(s) OLD/NEW desta
-- linha) — não é garantia absoluta de ausência de deadlock para
-- transações arbitrárias multi-linha/multi-grupo; o detector de
-- deadlock nativo do Postgres permanece como rede de segurança para
-- qualquer padrão de acesso fora deste escopo.
create or replace function public.trg_grupo_permissoes_travar_grupo()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_grupo_ids uuid[];
  v_grupo_id uuid;
begin
  v_grupo_ids := array_remove(array[new.grupo_id, old.grupo_id], null);

  select array_agg(distinct x order by x) into v_grupo_ids
    from unnest(v_grupo_ids) as x;

  foreach v_grupo_id in array v_grupo_ids loop
    perform 1 from public.grupos_acesso where id = v_grupo_id for update;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$function$;

revoke execute on function public.trg_grupo_permissoes_travar_grupo() from public, anon, authenticated;

create trigger grupo_permissoes_travar_grupo
  before insert or update or delete on public.grupo_permissoes
  for each row
  execute function public.trg_grupo_permissoes_travar_grupo();

-- ---------------------------------------------------------------------
-- 2. Validador do conjunto final de um grupo — constraint trigger
--    deferred (GA-4B-A, seção 3; GA-4B-A2 ponto 1)
-- ---------------------------------------------------------------------

-- Reúne o(s) grupo_id(s) a revalidar a partir de NEW e OLD (cobre
-- INSERT, UPDATE — inclusive mudança de grupo_id, revalidando os dois
-- lados — e DELETE), mesmo padrão real já usado em
-- validar_hierarquia_of (20260826184412_of_hierarquia_mae_filha.sql).
-- DEFERRABLE INITIALLY DEFERRED: revalida o estado real no fim da
-- transação, nunca valores de trânsito — necessário para a RPC poder
-- remover permissões antigas e inserir novas na mesma transação sem
-- falhar num estado intermediário que nunca será o estado final.
create or replace function public.trg_grupo_permissoes_validar_conjunto_dependencias()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_grupo_ids uuid[];
  v_grupo_id uuid;
  v_faltante record;
begin
  v_grupo_ids := array_remove(array[new.grupo_id, old.grupo_id], null);

  select array_agg(distinct x order by x) into v_grupo_ids
    from unnest(v_grupo_ids) as x;

  foreach v_grupo_id in array v_grupo_ids loop
    select pd.permissao_id, pd.depende_de_id
      into v_faltante
    from public.permissao_dependencias pd
    where pd.permissao_id in (
        select permissao_id from public.grupo_permissoes where grupo_id = v_grupo_id
      )
      and pd.depende_de_id not in (
        select permissao_id from public.grupo_permissoes where grupo_id = v_grupo_id
      )
    limit 1;

    if found then
      raise exception 'grupo_permissoes: conjunto final do grupo % está incompleto — permissão % exige % que não está presente.',
        v_grupo_id, v_faltante.permissao_id, v_faltante.depende_de_id;
    end if;
  end loop;

  return null;
end;
$function$;

revoke execute on function public.trg_grupo_permissoes_validar_conjunto_dependencias() from public, anon, authenticated;

create constraint trigger grupo_permissoes_validar_conjunto_dependencias
  after insert or update or delete on public.grupo_permissoes
  deferrable initially deferred
  for each row
  execute function public.trg_grupo_permissoes_validar_conjunto_dependencias();

-- ---------------------------------------------------------------------
-- 3. Integridade categoria × grafo — invariante global do catálogo
--    (GA-4B-A2 ponto 4; corrigida em GA-4B-A3; validação final
--    deferred exigida nesta etapa — GA-4B-B seção 4)
-- ---------------------------------------------------------------------

-- Função interna reutilizável: varre o catálogo inteiro procurando
-- QUALQUER caminho de uma permissão não-reservada até uma reservada
-- (direto ou indireto, via a travessia já existente
-- permissao_dependencia_alcancavel, criada em GA-4A — reaproveitada,
-- nenhuma lógica recursiva nova). Chamada pelos DOIS triggers abaixo —
-- a mesma regra vale independente de qual tabela foi alterada
-- (permissao_dependencias ou permissoes.categoria), nunca duas
-- implementações semanticamente diferentes do mesmo invariante.
create or replace function public.permissao_categoria_grafo_violacao()
returns table(
  permissao_id uuid,
  permissao_chave text,
  categoria public.permissao_categoria,
  alcancada_id uuid,
  alcancada_chave text
)
language sql
stable
set search_path = 'public'
as $$
  select p.id, p.chave, p.categoria, r.id, r.chave
  from public.permissoes p
  join public.permissao_dependencia_alcancavel(p.id) a on true
  join public.permissoes r on r.id = a.permissao_id
  where p.categoria <> 'reservada'
    and not a.ciclo
    and a.permissao_id <> p.id
    and r.categoria = 'reservada'
  limit 1;
$$;

revoke execute on function public.permissao_categoria_grafo_violacao() from public, anon, authenticated;

-- Lado do grafo: nova aresta ou aresta alterada em permissao_dependencias
-- pode criar um caminho novo até uma reservada. DELETE de aresta nunca
-- pode CRIAR essa violação (só remove alcançabilidade), por isso não
-- está no evento — mesmo raciocínio já usado no trigger de ciclo (GA-4A),
-- que também é só INSERT/UPDATE.
create or replace function public.trg_permissao_dependencias_validar_categoria_grafo_final()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_violacao record;
begin
  select * into v_violacao from public.permissao_categoria_grafo_violacao();

  if found then
    raise exception 'integridade categoria x grafo: permissão % (%) alcança % (reservada) — combinação inválida no estado final da transação.',
      v_violacao.permissao_chave, v_violacao.categoria, v_violacao.alcancada_chave;
  end if;

  return null;
end;
$function$;

revoke execute on function public.trg_permissao_dependencias_validar_categoria_grafo_final() from public, anon, authenticated;

create constraint trigger permissao_dependencias_validar_categoria_grafo_final
  after insert or update of permissao_id, depende_de_id on public.permissao_dependencias
  deferrable initially deferred
  for each row
  execute function public.trg_permissao_dependencias_validar_categoria_grafo_final();

-- Lado da categoria: mudar permissoes.categoria pode, sozinho, criar a
-- mesma violação sem tocar em nenhuma aresta (ex.: R1->R2 reservada,
-- ambas válidas; promover R1 para comum torna R1 comum -> R2 reservada
-- inválido, mesmo sem nenhuma aresta mudar). Mesma função reutilizada.
create or replace function public.trg_permissoes_validar_categoria_grafo_final()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_violacao record;
begin
  select * into v_violacao from public.permissao_categoria_grafo_violacao();

  if found then
    raise exception 'integridade categoria x grafo: permissão % (%) alcança % (reservada) — combinação inválida no estado final da transação.',
      v_violacao.permissao_chave, v_violacao.categoria, v_violacao.alcancada_chave;
  end if;

  return null;
end;
$function$;

revoke execute on function public.trg_permissoes_validar_categoria_grafo_final() from public, anon, authenticated;

create constraint trigger permissoes_validar_categoria_grafo_final
  after update of categoria on public.permissoes
  deferrable initially deferred
  for each row
  execute function public.trg_permissoes_validar_categoria_grafo_final();

-- ---------------------------------------------------------------------
-- 4. RPC oficial — única via operacional de escrita em grupo_permissoes
--    (GA-4B-A seção 4/5; simplificada em GA-4B-A2 ponto 2)
-- ---------------------------------------------------------------------

-- SECURITY DEFINER: authenticated não tem nenhum GRANT de
-- INSERT/UPDATE/DELETE em grupo_permissoes (GA-4A) — uma função
-- SECURITY INVOKER falharia no DELETE/INSERT por falta de privilégio de
-- tabela, independente de qualquer validação de negócio passar. DEFINER
-- é o único jeito de a RPC gravar enquanto authenticated continua sem
-- acesso direto. Nenhum empresa_id é aceito como parâmetro do cliente —
-- sempre derivado de empresa_atual_id(), fechando IDOR por UUID
-- conhecido. Autoridade usa usuario_e_admin() (mecanismo legado real,
-- já tenant-scoped internamente) — não reescrito, só consumido, porque
-- o novo modelo de Grupo de Acesso ainda não é a autoridade real do
-- sistema nesta fase (profiles.grupo_id não existe).
create or replace function public.salvar_permissoes_grupo_acesso(
  p_grupo_id uuid,
  p_permissao_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_grupo_e_adm boolean;
  v_permissoes_ids uuid[];
  v_qtd_encontrada int;
  v_faltante record;
begin
  if auth.uid() is null then
    raise exception 'salvar_permissoes_grupo_acesso: operação requer sessão autenticada.';
  end if;

  if v_empresa_id is null then
    raise exception 'Empresa atual não encontrada.';
  end if;

  if not public.usuario_e_admin() then
    raise exception 'salvar_permissoes_grupo_acesso: exige autoridade de administrador (usuario_e_admin()).';
  end if;

  if p_grupo_id is null then
    raise exception 'Informe o grupo de acesso alvo.';
  end if;

  if p_permissao_ids is not null and array_position(p_permissao_ids, null) is not null then
    raise exception 'A lista de permissões não pode conter um elemento nulo.';
  end if;

  -- NULL do parâmetro inteiro (nenhuma lista informada) é tratado como
  -- conjunto vazio — esvaziar o grupo é uma operação válida (GA-4B-A2:
  -- lista vazia é um estado legítimo, fail-closed, compatível com GA-2).
  v_permissoes_ids := coalesce(p_permissao_ids, '{}'::uuid[]);

  if array_length(v_permissoes_ids, 1) is not null
     and array_length(v_permissoes_ids, 1) <> (select count(distinct x) from unnest(v_permissoes_ids) as x)
  then
    raise exception 'A lista de permissões não pode conter IDs repetidos.';
  end if;

  -- Trava a linha real do grupo antes de qualquer mutação — falha
  -- rápido com mensagem de negócio antes de tentar gravar. Busca já
  -- filtrada por empresa_atual_id() (GA-4B-C1: isolamento estrito de
  -- tenant) — UUID inexistente e UUID real pertencente a outra empresa
  -- produzem exatamente a mesma resposta neutra, sem revelar a
  -- existência de um objeto de outro tenant. A mesma linha também será
  -- travada pelo trigger estrutural (grupo_permissoes_travar_grupo) no
  -- primeiro INSERT/DELETE abaixo — reaquisição pela mesma transação é
  -- no-op.
  select e_grupo_adm into v_grupo_e_adm
    from public.grupos_acesso
    where id = p_grupo_id
      and empresa_id = v_empresa_id
    for update;

  if not found then
    raise exception 'Grupo de acesso não encontrado para a empresa atual.';
  end if;

  if v_grupo_e_adm then
    raise exception 'salvar_permissoes_grupo_acesso: o Grupo ADM nunca recebe permissão atribuída explicitamente.';
  end if;

  if array_length(v_permissoes_ids, 1) is not null then
    select count(*) into v_qtd_encontrada
      from public.permissoes where id = any(v_permissoes_ids);

    if v_qtd_encontrada <> array_length(v_permissoes_ids, 1) then
      raise exception 'Uma ou mais permissões informadas não existem no catálogo.';
    end if;

    if exists (
      select 1 from public.permissoes
      where id = any(v_permissoes_ids) and categoria = 'reservada'
    ) then
      raise exception 'salvar_permissoes_grupo_acesso: permissão reservada não pode ser atribuída a grupo comum.';
    end if;

    select pd.permissao_id, pd.depende_de_id into v_faltante
      from public.permissao_dependencias pd
      where pd.permissao_id = any(v_permissoes_ids)
        and pd.depende_de_id <> all(v_permissoes_ids)
      limit 1;

    if found then
      raise exception 'salvar_permissoes_grupo_acesso: permissão % exige % — inclua-a no conjunto antes de salvar.',
        v_faltante.permissao_id, v_faltante.depende_de_id;
    end if;
  end if;

  -- Substituição atômica: remove o que não está na lista final, insere
  -- o que falta. <> all('{}'::uuid[]) é verdadeiro para toda linha
  -- quando a lista é vazia — implementa corretamente "esvaziar o grupo".
  delete from public.grupo_permissoes
    where grupo_id = p_grupo_id and permissao_id <> all(v_permissoes_ids);

  insert into public.grupo_permissoes (grupo_id, empresa_id, permissao_id, created_by)
  select p_grupo_id, v_empresa_id, x, auth.uid()
    from unnest(v_permissoes_ids) as x
  on conflict (grupo_id, permissao_id) do nothing;

  return jsonb_build_object(
    'grupo_id', p_grupo_id,
    'permissoes_finais', v_permissoes_ids,
    'total_permissoes', coalesce(array_length(v_permissoes_ids, 1), 0)
  );
end;
$function$;

alter function public.salvar_permissoes_grupo_acesso(uuid, uuid[]) owner to postgres;

comment on function public.salvar_permissoes_grupo_acesso(uuid, uuid[]) is
  'GA-4B: única via operacional de escrita em grupo_permissoes. SECURITY DEFINER — authenticated não tem GRANT direto na tabela. Autoridade: usuario_e_admin() (mecanismo legado, não reescrito). Substitui o conjunto inteiro de permissões de um grupo comum numa única transação atômica; lista vazia esvazia o grupo. Grupo ADM e permissão reservada sempre rejeitados; dependências ausentes rejeitadas antecipadamente (mensagem amigável) — o constraint trigger deferred em grupo_permissoes continua sendo a garantia estrutural final, inclusive contra escrita privilegiada direta.';

-- ---------------------------------------------------------------------
-- 5. ACL — RPC: só authenticated. Nenhuma função interna executável
--    por PUBLIC/anon/authenticated (ALTER DEFAULT PRIVILEGES deste
--    projeto concede EXECUTE a anon/authenticated automaticamente em
--    toda função nova — confirmado em 202607190006, linhas 295-297 —
--    por isso todo revoke acima e abaixo é explícito).
-- ---------------------------------------------------------------------

revoke all on function public.salvar_permissoes_grupo_acesso(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.salvar_permissoes_grupo_acesso(uuid, uuid[])
  to authenticated;

-- ---------------------------------------------------------------------
-- 6. RLS — nenhuma mudança. Nenhuma policy de mutation criada para
--    grupo_permissoes — a escrita passa a existir só pela RPC
--    SECURITY DEFINER (grava como postgres, dono da tabela, sem
--    depender de policy). grupos_acesso permanece sem CRUD
--    operacional, fora de escopo desta fatia.
-- ---------------------------------------------------------------------

commit;
