// DEC-007 §6.2/Fase 8b (aprovação do cenário comercial) - isola a
// chamada de rede à RPC aprovar_cenario_comercial_v2 atrás de um
// client injetável (mesmo motivo de persistirViaRpcV5.ts: testável com
// um client Supabase simulado, sem sessão real).
//
// Migração 20260822165408 (Fase 1 - transição em duas fases, correção
// explícita do usuário): esta função SEMPRE chamou a RPC nova - nunca
// a antiga (aprovar_cenario_comercial, 12 parâmetros), que continua
// existindo no banco intocada só para não quebrar nenhum outro
// caminho até a Fase 2 (migration futura) removê-la. O client injetado
// aqui é sempre o PRIVILEGIADO (createSupabaseServiceClient), criado
// pelo chamador (aprovarCenarioComercialAction.ts) só DEPOIS de
// autenticar/autorizar com o client de sessão. empresaId/aprovadoPor
// são parâmetros explícitos do payload (ver
// montarPayloadAprovacaoCenario.ts) - a RPC não tem JWT para derivar
// auth.uid()/empresa_atual_id()/usuario_e_admin() sozinha.
import { montarPayloadAprovacaoCenario, type ParametrosPayloadAprovacaoCenario, type PayloadRpcAprovacaoCenario } from "./montarPayloadAprovacaoCenario";

/** Único formato de client que este helper precisa - o client de sessão real (createSupabaseServerClient) satisfaz esta interface estruturalmente, sem cast. */
export interface ClienteRpcAprovacaoCenario {
  rpc: (
    fn: "aprovar_cenario_comercial_v2",
    args: PayloadRpcAprovacaoCenario,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface ResultadoPersistenciaAprovacaoCenario {
  cenarioComercialAprovadoId: string | null;
  /** Mensagem TÉCNICA do Supabase - nunca repassada ao usuário, só para log no chamador. */
  erro: string | null;
}

/**
 * Única chamada de rede desta função: aprovar_cenario_comercial_v2.
 * Sem fallback para nenhuma outra via em nenhum ramo (nem para a RPC
 * antiga) - falha aqui sempre volta como erro no retorno, nunca tenta
 * escrever de outro jeito.
 */
export async function persistirViaRpcAprovacaoCenario(
  cliente: ClienteRpcAprovacaoCenario,
  params: ParametrosPayloadAprovacaoCenario,
): Promise<ResultadoPersistenciaAprovacaoCenario> {
  const payload = montarPayloadAprovacaoCenario(params);
  const { data, error } = await cliente.rpc("aprovar_cenario_comercial_v2", payload);

  if (error) {
    return { cenarioComercialAprovadoId: null, erro: error.message };
  }

  return { cenarioComercialAprovadoId: data as string, erro: null };
}
