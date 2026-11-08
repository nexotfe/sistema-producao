"use server";
// Etapa 65C — Server Action fina de LEITURA dos recursos produtivos
// ativos da empresa, para o seletor de "Recurso" dos modais
// Adicionar/Editar OP. Client de sessão apenas - nenhum service_role
// (é leitura simples, já isolada por RLS tenant). Carregada só quando
// o modal abre (lazy) - nunca no mount da página da OF.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { buscarRecursosProdutivosPcp, type RespostaRecursosProdutivosPcp } from "../lib/buscarRecursosProdutivosPcp";

export type ResultadoConsultaRecursosProdutivosPcp = RespostaRecursosProdutivosPcp | { ok: false; motivo: "nao_autenticado" };

export async function consultarRecursosProdutivosPcpAction(): Promise<ResultadoConsultaRecursosProdutivosPcp> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  return buscarRecursosProdutivosPcp(serverClient);
}
