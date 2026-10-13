-- PCP-P4T.2 - fecha as duas últimas vias legadas capazes de criar,
-- alterar ou excluir uma aprovação de cenário comercial fora de
-- aprovar_cenario_comercial_v3.
--
-- Investigação prévia (PCP-P4T.2, Partes A/B - não presumida):
--
-- A. RPC ORIGINAL (aprovar_cenario_comercial, 12 parâmetros,
--    202608180002) - ainda tinha EXECUTE para authenticated (concedido
--    na própria migration original, nunca revogado) e, adicionalmente,
--    para service_role (herdado, nunca usado). Busca exaustiva em
--    src/ não encontrou NENHUM `.rpc("aprovar_cenario_comercial", ...)`
--    (sem sufixo) - os únicos consumidores reais são:
--      - supabase/tests/cenarios_comerciais_aprovados_teste.sql e
--        supabase/tests/aprovar_cenario_comercial_service_role_teste.sql
--        - scripts HISTÓRICOS, sem nenhuma entrada em package.json/CI
--        que os execute (confirmado: nenhum script roda arquivos de
--        supabase/tests/*.sql automaticamente) - permanecem como
--        documentação, intocados;
--      - comentários/documentação já corretos descrevendo a transição.
--    Nenhum caller produtivo legítimo depende da RPC original.
--
-- B. DML DIRETO DE service_role NA TABELA - busca exaustiva em src/
--    mostrou que TODO acesso a cenarios_comerciais_aprovados pelo
--    código da aplicação é:
--      - SELECT, pelo client de SESSÃO (nunca service_role) -
--        buscarCenarioComercialAprovado.ts (useOrcamento.ts/
--        useProposta.ts/GeradorComparadorCenarios.tsx) e
--        buscarCenarioAprovadoPorChaveIdempotencia.ts
--        (ResumoFinanceiroCard.tsx) - ambos já cobertos pela policy
--        _select_tenant (authenticated), nunca tocados aqui;
--      - a ÚNICA via de ESCRITA real (INSERT) é dentro do corpo
--        SECURITY DEFINER das 3 gerações da RPC (original/v2/v3) -
--        persistirViaRpcAprovacaoCenario.ts só expõe `.rpc(...)`,
--        nunca `.from(...)`, para o client privilegiado
--        (createSupabaseServiceClient, criado em
--        aprovarCenarioComercialAction.ts/
--        aprovarSimulacaoComercialAction.ts).
--    Nenhum caller produtivo legítimo precisa de INSERT/UPDATE/DELETE
--    direto de service_role nesta tabela - os GRANTs existentes nunca
--    tiveram uso real, são herdados dos GRANTs padrão de projeto.
--    SELECT de service_role NÃO é revogado aqui (nenhuma evidência de
--    necessidade foi buscada a ponto de justificar revogar - decisão
--    conservadora, fora do escopo deste gate).
--
-- C. INDEPENDÊNCIA DO CALLER (SECURITY DEFINER) - aprovar_cenario_
--    comercial_v3 (owner: postgres, SECURITY DEFINER, search_path
--    fixo) escreve na tabela com os privilégios do OWNER da função,
--    nunca com os privilégios de quem a EXECUTA - por isso revogar
--    INSERT/UPDATE/DELETE de service_role na tabela não quebra a RPC
--    v3 (prova empírica feita em sandbox descartável, Parte F deste
--    gate, antes de aplicar esta migration em produção).
--
-- Decisão (critérios: rollback, clareza, segurança, histórico) -
-- REVOGAR, sem DROP/sem reescrever nenhum corpo: (A) EXECUTE da RPC
-- original para authenticated e service_role (preserva só postgres,
-- owner - mesmo padrão já usado para v2 em 20260822195805); (B)
-- INSERT/UPDATE/DELETE de service_role na tabela (preserva SELECT).
-- Reversível com GRANTs equivalentes, sem recriar função nem tabela.

revoke execute on function public.aprovar_cenario_comercial(
  uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text
) from authenticated, service_role;

comment on function public.aprovar_cenario_comercial(uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text) is
  'APOSENTADA (PCP-P4T.2) - EXECUTE revogado de TODOS os papéis (public/anon desde a criação, 202608180002; authenticated e service_role nesta migration). Corpo preservado intacto por histórico/rollback - nenhuma chamada real a alcança mais (busca exaustiva em src/ não encontrou nenhum `.rpc("aprovar_cenario_comercial", ...)` sem sufixo; os únicos consumidores eram scripts de teste históricos nunca automatizados). A via autoritativa para nova aprovação de cenário comercial é exclusivamente aprovar_cenario_comercial_v3 (20261009120000). Rollback: um único "grant execute ... to authenticated" restaura o comportamento original (nunca a service_role, que nunca teve uso real aqui).';

revoke insert, update, delete on public.cenarios_comerciais_aprovados from service_role;

comment on table public.cenarios_comerciais_aprovados is
  'Decisão comercial do orçamentista (DEC-007, Fase 8b) sobre um cenário calculado pela Previsão comercial por capacidade - nunca cria OF, nunca programa/reserva capacidade no PCP, nunca aprova o orçamento em si. Decoupled de simulacoes_comerciais/aprovar_projeto_com_simulacao_v* de propósito (motor diferente, sem service_role, sem efeito de PCP). Snapshot é uma decisão ATESTADA pelo administrador, nunca uma prova independente do banco sobre a previsão operacional (ver cabeçalho desta migration) - só 1 vigente por (empresa_id, projeto_id), histórico preservado, conteúdo imutável após a inserção (ver triggers). PCP-P4T.2: INSERT/UPDATE/DELETE direto de service_role foi revogado (busca exaustiva em src/ não encontrou nenhum uso real - toda escrita de produção passa pelo corpo SECURITY DEFINER de aprovar_cenario_comercial_v3, que escreve com os privilégios do OWNER da função, não do EXECUTOR, e por isso continua funcionando sem o GRANT direto). SELECT de service_role permanece concedido (nenhuma revogação decidida neste gate). Rollback: "grant insert, update, delete on public.cenarios_comerciais_aprovados to service_role", se uma necessidade real surgir.';
