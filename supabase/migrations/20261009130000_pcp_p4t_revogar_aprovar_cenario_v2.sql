-- PCP-P4T (Fase 2) - endurecimento fail-closed: fecha a única via
-- restante capaz de gerar uma aprovação de cenário comercial sem o
-- Snapshot Técnico v2 (aprovar_cenario_comercial_v2, 17 parâmetros,
-- 20260822195805).
--
-- Investigação prévia (PCP-P4T, Parte B - não presumida):
--   - busca exaustiva em src/ não encontrou NENHUMA chamada real
--     (`.rpc("aprovar_cenario_comercial_v2", ...)`) - só comentários
--     históricos, já corretos, descrevendo a transição v2->v3.
--   - o único caller de produção (persistirViaRpcAprovacaoCenario.ts,
--     via aprovarCenarioComercialAction.ts/ResumoFinanceiroCard.tsx) já
--     chama exclusivamente aprovar_cenario_comercial_v3 desde a Fase 1
--     (PCP-P4S) - confirmado por leitura e por teste real.
--   - supabase/tests/aprovar_cenario_comercial_service_role_teste.sql
--     chama v2 diretamente, mas é um script de validação HISTÓRICO
--     (nunca aplicado em produção, sem nenhum script de CI/package.json
--     que o execute) - preservado como documentação da Fase 1, NUNCA
--     editado aqui; fica estruturalmente inexecutável com sucesso
--     depois desta migration (achado honesto, não escondido - é a
--     mesma classe de "teste histórico" já aceita para a RPC ainda
--     mais antiga, aprovar_cenario_comercial, 12 parâmetros).
--
-- Decisão (critérios: rollback, clareza, segurança, histórico) - REVOGAR
-- o EXECUTE de service_role (único papel que ainda o tinha - public/
-- anon/authenticated já estavam revogados desde 20260822195805), SEM
-- DROP da função. Preserva corpo/comentário/histórico intactos;
-- reversível com um único GRANT, sem recriação de função nem down
-- migration destrutiva. Rejeitado: (C) transformar v2 em wrapper da v3
-- exigiria inventar p_snapshot_tecnico/p_snapshot_tecnico_versao
-- sintéticos - violaria diretamente a proibição de "reconstruir
-- snapshot legado"/fallback silencioso. Rejeitado: (D) DROP - destrutivo
-- sem necessidade real, já que REVOKE fecha completamente o caminho de
-- escrita.
--
-- Nota honesta sobre o invariante snapshot+versão+hash (Parte E deste
-- gate, registrada aqui por não ter virado código): uma CHECK
-- constraint declarativa NÃO consegue, por si só, distinguir uma linha
-- legado legítima (ex.: assinatura_tecnica preenchida, snapshot_tecnico/
-- versão NULL - caso real já existente em produção) de uma linha nova
-- hipotética com a MESMA forma criada por um bypass futuro - ambas são
-- estruturalmente idênticas. Resolver isso por data de criação
-- (created_at > X) é a "gambiarra temporal" que este gate pede para
-- evitar. Por isso a proteção real contra uma NOVA aprovação incompleta
-- é esta REVOGAÇÃO (fecha a única via que ainda produzia essa forma),
-- não uma CHECK nova - os 2 CHECKs já aplicados em 20261009120000
-- (domínio da versão; coerência entre a versão na coluna e a versão
-- dentro do JSON) continuam sendo a defesa em profundidade correta,
-- time-independente, e não precisam de alteração.

revoke execute on function public.aprovar_cenario_comercial_v2(
  uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text, text, text
) from service_role;

comment on function public.aprovar_cenario_comercial_v2(uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text, text, text) is
  'APOSENTADA (PCP-P4T, Fase 2) - EXECUTE revogado de TODOS os papéis (public/anon/authenticated desde 20260822195805; service_role nesta migration). Corpo preservado intacto por histórico/rollback - nenhuma chamada real a alcança mais. A via autoritativa para nova aprovação de cenário comercial é exclusivamente aprovar_cenario_comercial_v3 (20261009120000), que exige Snapshot Técnico v2 completo (snapshot_tecnico + snapshot_tecnico_versao=2 + assinatura_tecnica). Rollback: um único "grant execute ... to service_role" restaura o comportamento anterior, sem recriar a função.';
