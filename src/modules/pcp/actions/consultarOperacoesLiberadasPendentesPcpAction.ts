"use server";
// Planejamento Diário (PCP) — leitura das operações pendentes das OFs
// formalmente liberadas. Client de SESSÃO (RLS normal) - nunca
// service_role. Mesma permissão de visualização já usada pelas demais
// telas de leitura do PCP (pcp.visualizar_programacao) - nenhuma
// permissão nova criada.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import {
  buscarOperacoesLiberadasPendentesPcp,
  type RespostaOperacoesLiberadasPendentesPcp,
} from "../lib/buscarOperacoesLiberadasPendentesPcp";

const PERMISSAO_VISUALIZAR_PROGRAMACAO = "pcp.visualizar_programacao";

export type ResultadoConsultaOperacoesLiberadasPendentesPcp =
  | RespostaOperacoesLiberadasPendentesPcp
  | { ok: false; motivo: "nao_autenticado" | "nao_autorizado" };

export async function consultarOperacoesLiberadasPendentesPcpAction(): Promise<ResultadoConsultaOperacoesLiberadasPendentesPcp> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();
  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: autorizado, error: erroPermissao } = await serviceClient.rpc("usuario_tem_permissao", {
    p_usuario_id: user.id,
    p_chave: PERMISSAO_VISUALIZAR_PROGRAMACAO,
  });
  if (erroPermissao) {
    console.error("consultarOperacoesLiberadasPendentesPcpAction: falha tecnica ao checar permissao", erroPermissao);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!autorizado) {
    return { ok: false, motivo: "nao_autorizado" };
  }

  return buscarOperacoesLiberadasPendentesPcp(serverClient);
}
