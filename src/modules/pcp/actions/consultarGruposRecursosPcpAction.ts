"use server";
// Planejamento Diário (PCP) — leitura só de consulta dos Grupos de
// Recursos reais, para o filtro da tela. Client de SESSÃO - nunca
// service_role. Mesma permissão de leitura das demais telas do PCP.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import { buscarGruposRecursosPcp, type RespostaBuscarGruposRecursosPcp } from "../lib/buscarGruposRecursosPcp";

const PERMISSAO_VISUALIZAR_PROGRAMACAO = "pcp.visualizar_programacao";

export type ResultadoConsultaGruposRecursosPcp = RespostaBuscarGruposRecursosPcp | { ok: false; motivo: "nao_autenticado" | "nao_autorizado" };

export async function consultarGruposRecursosPcpAction(): Promise<ResultadoConsultaGruposRecursosPcp> {
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
    console.error("consultarGruposRecursosPcpAction: falha tecnica ao checar permissao", erroPermissao);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!autorizado) {
    return { ok: false, motivo: "nao_autorizado" };
  }

  return buscarGruposRecursosPcp(serverClient);
}
