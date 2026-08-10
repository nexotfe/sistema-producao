// Fase 2 (DEC-006, correção): isola a chamada real à RPC v5 atrás de um
// client injetável. aprovarSimulacaoComercialAction.ts é "use server" e
// monta o client privilegiado (service_role) internamente - não dá para
// mockar isso testando o arquivo "use server" diretamente. Este helper
// extrai só a chamada de rede (mesmo motivo de extração de
// montarPayloadV4.ts/orquestrarAprovacaoAutoritativa.ts), para que a
// wiring real - não só o mapeamento de payload - possa ser testada com
// um client Supabase simulado.
import { montarPayloadV5, type ParametrosPayloadV5, type PayloadRpcV5 } from "./montarPayloadV5";

/**
 * Único formato de client que este helper precisa - o client privilegiado
 * real (createSupabaseServiceClient) satisfaz esta interface
 * estruturalmente, sem cast.
 */
export interface ClienteRpcV5 {
  rpc: (
    fn: "aprovar_projeto_com_simulacao_v5",
    args: PayloadRpcV5,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface ResultadoPersistenciaV5 {
  simulacaoComercialId: string | null;
  /** Mensagem TÉCNICA do Supabase - nunca repassada ao usuário, só para log no chamador. */
  erro: string | null;
}

/**
 * Única chamada de rede desta função: aprovar_projeto_com_simulacao_v5.
 * Sem fallback para nenhuma versão anterior da RPC em nenhum ramo -
 * falha aqui sempre volta como erro no retorno, nunca tenta outra via
 * silenciosamente.
 */
export async function persistirViaRpcV5(
  cliente: ClienteRpcV5,
  params: ParametrosPayloadV5,
): Promise<ResultadoPersistenciaV5> {
  const payload = montarPayloadV5(params);
  const { data, error } = await cliente.rpc("aprovar_projeto_com_simulacao_v5", payload);

  return {
    simulacaoComercialId: error ? null : (data as string),
    erro: error ? error.message : null,
  };
}
