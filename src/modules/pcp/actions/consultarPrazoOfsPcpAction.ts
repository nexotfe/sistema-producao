"use server";
// PCP — Etapa 54: Server Action de LEITURA do prazo das OFs exibidas na
// página atual do Controle de Produção. Client de SESSÃO para todo
// dado operacional (buscarPrazoOfsPcp) — nunca service_role para ler
// programação/OF/OP real. O client de serviço existe SÓ para perguntar
// a permissão (usuario_tem_permissao é service_role-only por desenho,
// P8I-B2) — mesmo desvio deliberado já documentado e aceito em
// consultarProgramacaoVigentePcpAction.ts, confirmado com o usuário
// nesta etapa antes de implementar. Não grava nada, não recalcula nada.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import { buscarPrazoOfsPcp } from "../lib/buscarPrazoOfsPcp";
import type { InterpretacaoPrazoOfPcp } from "../lib/interpretacao/classificarPrazoOfPcp";

const PERMISSAO_VISUALIZAR_PROGRAMACAO = "pcp.visualizar_programacao";

export type ResultadoConsultaPrazoOfsPcp =
  | { ok: true; prazosPorOfId: Record<string, InterpretacaoPrazoOfPcp> }
  | { ok: false; motivo: "nao_autenticado" }
  | { ok: false; motivo: "nao_autorizado" }
  | { ok: false; motivo: "erro_desconhecido" };

function logErroTecnicoPrazoOfsPcp(erro: unknown): void {
  console.error("consultarPrazoOfsPcpAction: falha tecnica", erro);
}

export async function consultarPrazoOfsPcpAction(ofIds: readonly string[]): Promise<ResultadoConsultaPrazoOfsPcp> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  if (ofIds.length === 0) {
    return { ok: true, prazosPorOfId: {} };
  }

  // Nega ANTES de qualquer leitura de programação/operação - nenhuma
  // chamada a buscarPrazoOfsPcp acontece se esta checagem não passar. A
  // lista de OFs em si (consultarOfsPcpAction) não depende desta
  // permissão e continua funcionando normalmente mesmo sem ela.
  const serviceClient = createSupabaseServiceClient();
  const { data: autorizado, error: erroAutorizacao } = await serviceClient.rpc("usuario_tem_permissao", {
    p_usuario_id: user.id,
    p_chave: PERMISSAO_VISUALIZAR_PROGRAMACAO,
  });

  if (erroAutorizacao || autorizado !== true) {
    return { ok: false, motivo: "nao_autorizado" };
  }

  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const mapa = await buscarPrazoOfsPcp(serverClient, ofIds, hoje);
    return { ok: true, prazosPorOfId: Object.fromEntries(mapa) };
  } catch (erro) {
    logErroTecnicoPrazoOfsPcp(erro);
    return { ok: false, motivo: "erro_desconhecido" };
  }
}
