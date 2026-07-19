-- PAD-004 secao 2 - Lote C. Remove o filtro deleted_at is null das
-- policies de SELECT e da clausula USING de UPDATE das 9 tabelas
-- restantes da lista de 15 (AUD-2026-07-19_Soft_Delete.md). Mesmo
-- padrao dos Lotes A e B (202607190001, 202607190002).
--
-- 8 destas tabelas nao tem nenhum consumidor no frontend hoje
-- (requisicoes_compra, pedidos_compra, planejamentos_compra,
-- numeracao_configuracoes, producao_configuracoes, consumos_internos,
-- propostas, requisicao_compra_itens) - reconfirmado por grep fresco
-- em src/ antes desta migration, sem nenhum achado novo em relacao a
-- auditoria original. Por isso a correcao de RLS pode ser feita direto,
-- sem etapa de ajuste de query antes (secao 3 ja satisfeita por nao
-- ter query nenhuma).
--
-- ordens_fabricacao tem 4 consumidores reais (app/ordens/[id]/page.tsx,
-- pcp/planejamento/page.tsx, pcp/programacao-diaria/page.tsx,
-- useProjeto.ts), todos ja corrigidos em rodada anterior (commits
-- 720d3b2, a4e646b) - reconfirmado nesta rodada, sem achado novo.
-- Incluida neste lote por ter a mesma forma de policy das demais 8.
--
-- propostas e um caso a parte: nao existe policy de UPDATE para essa
-- tabela hoje (so SELECT, INSERT, DELETE bloqueado) - confirmado via
-- pg_policy (catalogo, nao a view pg_policies) antes desta migration.
-- Isso significa que soft delete de propostas ja e impossivel via app
-- hoje, independente desta migration - fora de escopo criar essa
-- policy agora (seria decisao de negocio nova). Nesta tabela, so a
-- policy de SELECT muda.
--
-- O filtro ativo = true permanece em todas as 9 tabelas (ja existia
-- antes desta migration) - mesma divida tecnica consciente registrada
-- na secao 2 do PAD-004 nos Lotes A e B, remocao pendente de auditoria
-- propria.

-- requisicoes_compra
alter policy requisicoes_compra_select_tenant
  on public.requisicoes_compra
  using ((empresa_id = empresa_atual_id()) and (ativo = true));

alter policy requisicoes_compra_update_tenant
  on public.requisicoes_compra
  using ((empresa_id = empresa_atual_id()) and (ativo = true))
  with check (empresa_id = empresa_atual_id());

-- pedidos_compra
alter policy pedidos_compra_select_tenant
  on public.pedidos_compra
  using ((empresa_id = empresa_atual_id()) and (ativo = true));

alter policy pedidos_compra_update_tenant
  on public.pedidos_compra
  using ((empresa_id = empresa_atual_id()) and (ativo = true))
  with check (empresa_id = empresa_atual_id());

-- planejamentos_compra
alter policy planejamentos_compra_select_tenant
  on public.planejamentos_compra
  using ((empresa_id = empresa_atual_id()) and (ativo = true));

alter policy planejamentos_compra_update_tenant
  on public.planejamentos_compra
  using ((empresa_id = empresa_atual_id()) and (ativo = true))
  with check (empresa_id = empresa_atual_id());

-- numeracao_configuracoes
alter policy numeracao_configuracoes_select_tenant
  on public.numeracao_configuracoes
  using ((empresa_id = empresa_atual_id()) and (ativo = true));

alter policy numeracao_configuracoes_update_tenant
  on public.numeracao_configuracoes
  using ((empresa_id = empresa_atual_id()) and (ativo = true))
  with check (empresa_id = empresa_atual_id());

-- producao_configuracoes
alter policy producao_configuracoes_select_tenant
  on public.producao_configuracoes
  using ((empresa_id = empresa_atual_id()) and (ativo = true));

alter policy producao_configuracoes_update_tenant
  on public.producao_configuracoes
  using ((empresa_id = empresa_atual_id()) and (ativo = true))
  with check (empresa_id = empresa_atual_id());

-- consumos_internos
alter policy consumos_internos_select_tenant
  on public.consumos_internos
  using ((empresa_id = empresa_atual_id()) and (ativo = true));

alter policy consumos_internos_update_tenant
  on public.consumos_internos
  using ((empresa_id = empresa_atual_id()) and (ativo = true))
  with check (empresa_id = empresa_atual_id());

-- requisicao_compra_itens
alter policy requisicao_compra_itens_select_tenant
  on public.requisicao_compra_itens
  using ((empresa_id = empresa_atual_id()) and (ativo = true));

alter policy requisicao_compra_itens_update_tenant
  on public.requisicao_compra_itens
  using ((empresa_id = empresa_atual_id()) and (ativo = true))
  with check (empresa_id = empresa_atual_id());

-- ordens_fabricacao
alter policy ordens_fabricacao_select_tenant
  on public.ordens_fabricacao
  using ((empresa_id = empresa_atual_id()) and (ativo = true));

alter policy ordens_fabricacao_update_tenant
  on public.ordens_fabricacao
  using ((empresa_id = empresa_atual_id()) and (ativo = true))
  with check (empresa_id = empresa_atual_id());

-- propostas: so SELECT muda, nao existe policy de UPDATE
alter policy propostas_select_tenant
  on public.propostas
  using ((empresa_id = empresa_atual_id()) and (ativo = true));
