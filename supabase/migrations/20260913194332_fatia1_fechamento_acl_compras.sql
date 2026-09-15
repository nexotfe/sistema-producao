-- Incremento 9 - Fatia 1: fechamento de ACL de pedidos_compra,
-- pedido_compra_itens e planejamento_compra_origens.
--
-- Achado real (investigacao read-only ao vivo, autorizada e reconfirmada
-- nesta sessao, 4 metodos independentes - information_schema.role_table_
-- grants, pg_class.relacl, has_table_privilege, pg_default_acl): as 3
-- tabelas tem hoje GRANT completo (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/
-- TRIGGER/REFERENCES) para anon E authenticated, herdado do ALTER DEFAULT
-- PRIVILEGES do schema public - nunca fechado por nenhuma migration
-- anterior (diferente de requisicoes_compra/planejamentos_compra, ja
-- fechadas nos Incrementos 6/8). RLS mitiga em nivel de linha, mas o
-- privilegio de TABELA continua aberto - uma falha futura de RLS (bug de
-- policy, policy removida por engano) ficaria sem a segunda camada de
-- defesa que as outras tabelas do mesmo dominio ja tem.
--
-- Zero consumidor de frontend nessas 3 tabelas/RPCs (reconfirmado por
-- grep fresco em todo src/ nesta sessao) - fechar o GRANT direto nao
-- remove nenhuma capacidade funcional real em uso hoje.
--
-- Escopo desta migration, deliberadamente limitado (revisao humana
-- explicita, varias rodadas): SOMENTE o fechamento de ACL das 3 tabelas
-- + a correcao MINIMA de definir_planejamento_compra_origem, estritamente
-- necessaria para essa funcao sobreviver ao fechamento (ela e SECURITY
-- INVOKER, sem search_path, sem gate de papel, e por isso DEPENDE do
-- GRANT de tabela do chamador para funcionar - sem esta correcao, o
-- REVOKE a deixaria permanentemente inerte, quebrando uma capacidade ja
-- existente, o que foi explicitamente rejeitado). NAO inclui (ficam para
-- fatias futuras, em checkpoints proprios): estados/fornecedor/numeracao
-- de Pedido de Compra, Recebimento, Estoque, Reserva, decisao humana de
-- CI/CE, liberar_of_para_producao, nem qualquer UI.
--
-- Nenhuma mudanca de regra funcional em definir_planejamento_compra_origem
-- alem do estritamente necessario para preservar a operacao apos os
-- REVOKEs: mesma assinatura, mesmos parametros, mesmo retorno, mesmos 2
-- campos atualizados (incluir_no_planejamento, ordem_agrupamento), mesma
-- validacao (UPDATE por id+empresa_id, "not found" -> excecao), mesma
-- mensagem de excecao literal ('Origem do planejamento nao encontrada.'),
-- mesmo efeito de negocio. Unicamente acrescentados: autenticacao
-- explicita, gate de papel funcional (comprador/admin - mesma familia
-- funcional das demais RPCs de planejamento de compra ja existentes:
-- criar_planejamento_compra_a_partir_de_requisicoes, decidir_compra_
-- planejamento, cancelar_planejamento_compra, gerar_pedido_compra_
-- rascunho), SECURITY DEFINER, search_path fixo.
--
-- service_role NUNCA aparece em nenhum REVOKE desta migration - mantem
-- o grant completo que ja tem hoje nas 3 tabelas (infraestrutura de
-- backend/admin confiavel, nunca exposta a cliente final).
--
-- Migration inteira em uma unica transacao - qualquer falha reverte tudo,
-- nenhum estado intermediario (tabela fechada + funcao ainda com a casca
-- antiga, ou vice-versa) pode persistir.
begin;

-- =============================================================================
-- 1. Hardening das tabelas - remove privilegio direto de escrita de
--    PUBLIC/anon/authenticated, preserva SOMENTE SELECT para authenticated.
--    authenticated sempre explicito no REVOKE (nunca so PUBLIC) - achado
--    real ja documentado em migrations anteriores deste mesmo projeto:
--    pg_default_acl do schema public concede privilegios a authenticated
--    (e a anon) INDIVIDUALMENTE em toda tabela nova, nao so via PUBLIC -
--    "REVOKE ALL FROM PUBLIC, anon" sozinho nao remove essa concessao
--    individual de authenticated.
-- =============================================================================
revoke all on public.pedidos_compra from public, anon, authenticated;
grant select on public.pedidos_compra to authenticated;

revoke all on public.pedido_compra_itens from public, anon, authenticated;
grant select on public.pedido_compra_itens to authenticated;

revoke all on public.planejamento_compra_origens from public, anon, authenticated;
grant select on public.planejamento_compra_origens to authenticated;

-- =============================================================================
-- 2. Correcao minima de definir_planejamento_compra_origem - mesma
--    assinatura exata (mesmos parametros, tipos, ordem, defaults) e mesmo
--    corpo funcional de 202606050024_planejamento_compras_17_funcao_
--    origem.sql (unica definicao existente, nunca redefinida ate aqui -
--    reconfirmado por busca ampla nesta sessao), com a casca de seguranca
--    minima necessaria acrescentada.
-- =============================================================================
create or replace function public.definir_planejamento_compra_origem(
  p_origem_id uuid,
  p_incluir_no_planejamento boolean,
  p_ordem_agrupamento integer default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_empresa_id uuid;
begin
  if auth.uid() is null then
    raise exception 'definir_planejamento_compra_origem: sessao invalida.';
  end if;

  if not (coalesce(public.usuario_tem_papel_funcional('comprador'), false) or coalesce(public.usuario_e_admin(), false)) then
    raise exception 'definir_planejamento_compra_origem: usuario sem permissao.';
  end if;

  -- tenant sempre resolvido pelo contexto autenticado, nunca aceito do
  -- cliente - identico ao comportamento ja existente (v_empresa_id nunca
  -- foi parametro desta funcao).
  v_empresa_id := public.empresa_atual_id();

  update public.planejamento_compra_origens
  set incluir_no_planejamento = p_incluir_no_planejamento,
      ordem_agrupamento = p_ordem_agrupamento
  where id = p_origem_id
    and empresa_id = v_empresa_id;

  if not found then
    raise exception 'Origem do planejamento nao encontrada.';
  end if;

  return p_origem_id;
end;
$$;

comment on function public.definir_planejamento_compra_origem(uuid, boolean, integer) is
  'Incremento 9, Fatia 1: correcao minima de seguranca (SECURITY DEFINER + search_path fixo + autenticacao explicita + gate de papel comprador/admin), necessaria para esta funcao sobreviver ao fechamento de ACL de planejamento_compra_origens nesta mesma migration. Assinatura, parametros, retorno, campos atualizados, validacao e mensagem de excecao identicos a definicao original (202606050024_planejamento_compras_17_funcao_origem.sql) - nenhuma mudanca de regra funcional alem do estritamente necessario.';

-- =============================================================================
-- 3. EXECUTE da funcao - revoga de PUBLIC/anon/authenticated, concede de
--    volta exclusivamente a authenticated (controle real passa a ser o
--    gate de papel dentro do corpo da funcao, nao so o GRANT).
-- =============================================================================
revoke all on function public.definir_planejamento_compra_origem(uuid, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.definir_planejamento_compra_origem(uuid, boolean, integer)
  to authenticated;

commit;
