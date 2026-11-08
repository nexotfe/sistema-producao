-- PCP — Etapa 52C: RPC de leitura em lote para "OP resolvida", usada
-- por buscarPrazoOfsPcp.ts para excluir operações já concluídas de
-- verdade do cálculo de prazo futuro da OF (sem alterar o Motor).
--
-- CANDIDATA — aplicada e testada SÓ em banco local descartável
-- (Etapas 52C e 52D). NÃO aplicada no Supabase de produção. Renomeada
-- na Etapa 52D para um timestamp real sequencial, só para permitir o
-- dry-run seletivo de demonstração — ainda assim, aplicação real exige
-- autorização própria e separada (checkpoint humano, CLAUDE.md Regra 9).
--
-- Decisões de segurança (auditoria completa na Etapa 52B, aprovação
-- condicionada na 52C):
--   1. SECURITY DEFINER, mas reutiliza EXCLUSIVAMENTE a regra oficial
--      op_esta_resolvida — nenhuma lógica de conclusão duplicada aqui.
--   2. Nenhum grant novo em op_esta_resolvida/of_apontamentos_efetivos -
--      elas continuam service_role-only, exatamente como estão.
--   3. Empresa do chamador resolvida SÓ por auth.uid() -> usuarios,
--      nunca por parâmetro (um parâmetro poderia ser forjado).
--   4. Filtro explícito por empresa_id ANTES de avaliar resolução -
--      nunca confia na RLS (o dono, postgres, tem rolbypassrls=true,
--      então RLS não protege nada dentro desta função).
--   5. search_path = '' (vazio) — mais restritivo que a convenção
--      search_path=public já usada em criar_op_no_y/encerrar_of/
--      registrar_apontamento (Etapa 52D, a pedido do usuário). Toda
--      referência no corpo já é 100% qualificada (public.usuarios,
--      public.op_esta_resolvida, public.ordens_fabricacao_operacoes,
--      auth.uid()) - testado empiricamente com search_path='' e com
--      search_path=public: resultado byte-a-byte idêntico nos dois,
--      confirmando que não há NENHUMA dependência de resolução não
--      qualificada. public também não concede CREATE a nenhum papel de
--      aplicação (confirmado via pg_namespace.nspacl - só
--      pg_database_owner tem C), então nem haveria superfície de
--      hijack de search_path mesmo sem essa qualificação - a defesa é
--      em profundidade, não a única barreira.
--   6. Limite de 500 ids por chamada - documentado abaixo.
--   7. Id inexistente e id de outra empresa são SEMPRE indistinguíveis
--      (ambos simplesmente ausentes do resultado, nunca um erro).
--   8. Ausência no resultado nunca é "resolvida" - essa interpretação é
--      responsabilidade do chamador (buscarPrazoOfsPcp.ts), documentada
--      aqui para quem reusar esta função não presumir o contrário.

create or replace function public.ops_resolvidas(p_op_ids uuid[])
returns table(op_id uuid, resolvida boolean)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_empresa_id uuid;
  v_quantidade integer;
begin
  if p_op_ids is null then
    return;
  end if;

  v_quantidade := array_length(p_op_ids, 1);
  if v_quantidade is null then
    return; -- array vazio ({}) - nada a avaliar, nunca um erro.
  end if;

  -- Limite documentado (item 6, Etapa 52C): uma página do Controle de
  -- Produção hoje mostra no máximo algumas dezenas de OFs, cada uma com
  -- poucas operações - 500 dá margem folgada sem permitir um array
  -- arbitrariamente grande numa única chamada. Ajustável no futuro, com
  -- nova medição, se o volume real crescer.
  if v_quantidade > 500 then
    raise exception 'ops_resolvidas: no maximo 500 ids por chamada (recebido %).', v_quantidade;
  end if;

  select u.empresa_id into v_empresa_id
  from public.usuarios u
  where u.id = auth.uid();

  if v_empresa_id is null then
    raise exception 'ops_resolvidas: usuario autenticado nao encontrado ou sem empresa.';
  end if;

  -- Filtro explícito por empresa ANTES de avaliar a regra oficial -
  -- nunca depende de RLS (ver item 4 acima). Id de outra empresa ou
  -- inexistente: simplesmente não aparece aqui, nunca um erro
  -- diferenciado (item 7) - indistinguível por desenho.
  return query
  select o.id, public.op_esta_resolvida(o.id)
  from public.ordens_fabricacao_operacoes o
  where o.id = any(p_op_ids)
    and o.empresa_id = v_empresa_id;
end;
$function$;

comment on function public.ops_resolvidas(uuid[]) is
  'PCP-Etapa52C: leitura em lote de "OP resolvida" para buscarPrazoOfsPcp.ts. SECURITY DEFINER que só compõe a regra oficial op_esta_resolvida (nunca a reimplementa) - filtra por empresa do chamador (auth.uid() -> usuarios, nunca parametro) antes de avaliar. Id inexistente ou de outra empresa: ausente do resultado, nunca um erro diferenciado. Limite de 500 ids por chamada. CANDIDATA testada em local descartavel (Etapa 52C) - nao aplicada em producao.';

revoke all on function public.ops_resolvidas(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.ops_resolvidas(uuid[]) to authenticated;
