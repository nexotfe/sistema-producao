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
//
// Migração 20260822195805 (idempotência - correção do usuário após o
// achado de travamento em "Aprovando..."): distingue duas famílias de
// falha, porque só uma delas é segura de tratar como "não gravou":
// - erro LIMPO (cliente.rpc resolve com `{ error }`) - o ciclo
//   requisição/resposta terminou normalmente, a RPC rodou até uma
//   exceção controlada (ou nunca rodou, ex.: 42501 de ACL) - sabemos
//   com certeza que nada foi gravado (a função inteira roda numa
//   transação implícita, uma exceção desfaz tudo);
// - erro AMBÍGUO (a PRÓPRIA chamada de rede lança, nunca chega a uma
//   resposta) - não sabemos se a RPC chegou a rodar e gravar antes da
//   conexão cair. Nunca decide sozinho aqui - devolve
//   `gravacaoIncerta: true` para o chamador (orquestrador/UI) decidir
//   com uma consulta de verificação antes de liberar qualquer nova
//   tentativa.
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
  /** true = a CHAMADA DE REDE em si falhou (nunca houve um ciclo requisição/resposta completo) - resultado AMBÍGUO, pode ou não ter gravado. Ausente/false = resposta limpa da RPC (sucesso ou erro definitivo - já sabemos que não gravou). */
  gravacaoIncerta?: boolean;
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

  let resposta: { data: unknown; error: { message: string } | null };
  try {
    resposta = await cliente.rpc("aprovar_cenario_comercial_v2", payload);
  } catch (erroDeRede) {
    return {
      cenarioComercialAprovadoId: null,
      erro: erroDeRede instanceof Error ? erroDeRede.message : String(erroDeRede),
      gravacaoIncerta: true,
    };
  }

  const { data, error } = resposta;

  if (error) {
    return { cenarioComercialAprovadoId: null, erro: error.message };
  }

  return { cenarioComercialAprovadoId: data as string, erro: null };
}
