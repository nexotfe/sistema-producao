"use server";
// NEXOTFE — Etapa 46: Server Action de LEITURA paginada de OFs para o
// futuro Controle de Produção do PCP. Client de sessão apenas
// (createSupabaseServerClient + auth.getUser()) — nenhum service_role.
// Não cria, altera ou exclui nenhuma OF; não conecta confirmação,
// reservas ou requisições.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { buscarOfsPcp, type FiltrosOfsPcp, type ResultadoBuscaOfsPcp } from "../lib/buscarOfsPcp";

export type ResultadoConsultaOfsPcp =
  | { ok: true; resultado: ResultadoBuscaOfsPcp }
  | { ok: false; motivo: "nao_autenticado" }
  | { ok: false; motivo: "filtro_invalido"; campo: string }
  | { ok: false; motivo: "erro_desconhecido" };

export async function consultarOfsPcpAction(
  filtros: FiltrosOfsPcp,
  pagina: number,
  tamanhoPagina?: number,
): Promise<ResultadoConsultaOfsPcp> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  return buscarOfsPcp(serverClient, filtros, pagina, tamanhoPagina);
}
