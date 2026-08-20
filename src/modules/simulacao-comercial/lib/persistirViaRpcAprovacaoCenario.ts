// DEC-007 §6.2/Fase 8b (aprovação do cenário comercial) - isola a
// chamada de rede à RPC aprovar_cenario_comercial atrás de um client
// injetável (mesmo motivo de persistirViaRpcV5.ts: testável com um
// client Supabase simulado, sem sessão real).
//
// Diferença deliberada de persistirViaRpcV5.ts: o client aqui é sempre
// o de SESSÃO (createSupabaseServerClient, RLS do usuário) - a RPC é
// SECURITY DEFINER mas chamável diretamente por `authenticated` (grant
// explícito na migration), autorização (usuario_e_admin) e tenant
// (empresa_atual_id) resolvidos DENTRO da função - nunca precisa, e
// nunca deve, receber o client privilegiado (service_role).
import { montarPayloadAprovacaoCenario, type ParametrosPayloadAprovacaoCenario, type PayloadRpcAprovacaoCenario } from "./montarPayloadAprovacaoCenario";

/** Único formato de client que este helper precisa - o client de sessão real (createSupabaseServerClient) satisfaz esta interface estruturalmente, sem cast. */
export interface ClienteRpcAprovacaoCenario {
  rpc: (
    fn: "aprovar_cenario_comercial",
    args: PayloadRpcAprovacaoCenario,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface ResultadoPersistenciaAprovacaoCenario {
  cenarioComercialAprovadoId: string | null;
  /** Mensagem TÉCNICA do Supabase - nunca repassada ao usuário, só para log no chamador. */
  erro: string | null;
}

/**
 * Única chamada de rede desta função: aprovar_cenario_comercial. Sem
 * fallback para nenhuma outra via em nenhum ramo - falha aqui sempre
 * volta como erro no retorno, nunca tenta escrever de outro jeito.
 */
export async function persistirViaRpcAprovacaoCenario(
  cliente: ClienteRpcAprovacaoCenario,
  params: ParametrosPayloadAprovacaoCenario,
): Promise<ResultadoPersistenciaAprovacaoCenario> {
  const payload = montarPayloadAprovacaoCenario(params);
  const { data, error } = await cliente.rpc("aprovar_cenario_comercial", payload);

  if (error) {
    return { cenarioComercialAprovadoId: null, erro: error.message };
  }

  return { cenarioComercialAprovadoId: data as string, erro: null };
}
