import "server-only";
// Helper server-only de INSERT em public.provisionamento_incidentes
// (GA-4C2.3-E1.1). Único ponto que grava incidente - aceita só estrutura
// já sanitizada pelo orquestrador, nunca recebe senha/token/service_role.
// Se o próprio INSERT falhar, NÃO mascara o incidente original: emite
// log crítico e devolve false - quem chamou continua respondendo o erro
// já decidido, nunca troca a resposta por "sucesso" por causa disto.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CodigoErroProvisionamento } from "./provisionamentoErros";

export type EtapaIncidente = "auth_create" | "rpc_provisionamento" | "compensacao" | "reconciliacao";
export type EstadoResultanteIncidente = "orfao_auth" | "parcial_incoerente";

export interface DadosIncidenteProvisionamento {
  tentativaId: string;
  identidadeTecnica: string;
  authUserId: string | null;
  empresaId: string | null;
  criadoPorId: string;
  etapa: EtapaIncidente;
  codigoErroPrincipal: CodigoErroProvisionamento;
  codigoErroCompensacao: CodigoErroProvisionamento | null;
  estadoResultante: EstadoResultanteIncidente;
}

export async function registrarIncidenteProvisionamento(
  serviceClient: SupabaseClient,
  incidente: DadosIncidenteProvisionamento,
): Promise<boolean> {
  try {
    const { error } = await serviceClient.from("provisionamento_incidentes").insert({
      tentativa_id: incidente.tentativaId,
      identidade_tecnica: incidente.identidadeTecnica,
      auth_user_id: incidente.authUserId,
      empresa_id: incidente.empresaId,
      criado_por_id: incidente.criadoPorId,
      etapa: incidente.etapa,
      codigo_erro_principal: incidente.codigoErroPrincipal,
      codigo_erro_compensacao: incidente.codigoErroCompensacao,
      estado_resultante: incidente.estadoResultante,
    });

    if (error) {
      console.error("[provisionamento] FALHA AO PERSISTIR INCIDENTE - sem rastro durável", {
        tentativaId: incidente.tentativaId,
        etapa: incidente.etapa,
        estadoResultante: incidente.estadoResultante,
        erro: error.message,
      });
      return false;
    }

    return true;
  } catch {
    console.error("[provisionamento] FALHA CRÍTICA AO PERSISTIR INCIDENTE - sem rastro durável", {
      tentativaId: incidente.tentativaId,
      etapa: incidente.etapa,
      estadoResultante: incidente.estadoResultante,
    });
    return false;
  }
}
