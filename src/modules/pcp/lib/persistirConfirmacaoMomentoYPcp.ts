// Etapa 63 — chamada de rede à RPC real confirmar_necessidades_momento_y
// (confirmada em produção via pg_get_functiondef, Etapas 61/62), isolada
// atrás de um client injetável - mesmo princípio de
// persistirViaRpcAprovacaoCenario.ts (testável sem sessão real).
//
// Distinção de falha (mesmo contrato já usado para a aprovação de
// cenário comercial - ver cabeçalho daquele arquivo e
// ResumoFinanceiroCard.tsx):
// - erro LIMPO (cliente.rpc resolve com `{ error }`) - o ciclo
//   requisição/resposta terminou normalmente; a função é uma única
//   transação, então uma exceção desfaz tudo - sabemos com certeza que
//   nada foi gravado.
// - erro AMBÍGUO (a própria chamada de rede lança, nunca chega a uma
//   resposta) - não sabemos se a RPC chegou a rodar e gravar antes da
//   conexão cair. Nunca decide sozinho aqui - devolve
//   `gravacaoIncerta: true` para o chamador decidir, consultando o
//   estado oficial da OF antes de agir.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ItemConfirmacaoMomentoYPayload {
  readonly materia_prima_id: string;
  readonly origem_fornecimento: "empresa" | "cliente";
  readonly quantidade_confirmada: number;
  readonly quantidade_ci: number;
  readonly observacao_tecnica: string;
}

export interface RespostaRpcConfirmacaoMomentoY {
  readonly resultado: string;
  readonly of_id: string;
  readonly total_materiais: number;
  readonly total_reservas_ci: number;
  readonly total_itens_requisicao_ce: number;
  readonly requisicao_compra_id: string | null;
}

export interface ResultadoPersistenciaConfirmacaoMomentoY {
  readonly resposta: RespostaRpcConfirmacaoMomentoY | null;
  /** Mensagem TÉCNICA bruta da RPC - nunca repassada ao usuário, só para log no chamador. */
  readonly erro: string | null;
  /** true = a CHAMADA DE REDE em si falhou (nunca houve um ciclo requisição/resposta completo) - resultado AMBÍGUO, pode ou não ter gravado. Ausente/false = resposta limpa (sucesso ou erro definitivo - já sabemos que não gravou). */
  readonly gravacaoIncerta?: boolean;
}

/**
 * Única chamada de rede desta função: confirmar_necessidades_momento_y.
 * p_proposta_original precisa ser repassada EXATAMENTE como veio de
 * sugerir_proposta_momento_y (via consultarPropostaMomentoYAction) -
 * nunca reconstruída a partir dos itens editados, porque a própria RPC
 * recompara contra o BOM fresco usando esses mesmos valores.
 */
export async function persistirConfirmacaoMomentoYPcp(
  client: SupabaseClient,
  ofId: string,
  propostaOriginal: unknown,
  itensConfirmados: readonly ItemConfirmacaoMomentoYPayload[],
): Promise<ResultadoPersistenciaConfirmacaoMomentoY> {
  let resposta: { data: unknown; error: { message: string; code?: string } | null };
  try {
    resposta = await client.rpc("confirmar_necessidades_momento_y", {
      p_of_id: ofId,
      p_proposta_original: propostaOriginal,
      p_itens_confirmados: itensConfirmados,
    });
  } catch (erroDeRede) {
    return {
      resposta: null,
      erro: erroDeRede instanceof Error ? erroDeRede.message : String(erroDeRede),
      gravacaoIncerta: true,
    };
  }

  const { data, error } = resposta;
  if (error) {
    return { resposta: null, erro: error.message };
  }

  return { resposta: data as RespostaRpcConfirmacaoMomentoY, erro: null };
}

export type MotivoRejeicaoConfirmacaoMomentoYPcp =
  | "nao_autorizado"
  | "of_nao_encontrada"
  | "of_estado_final"
  | "of_nao_aprovada"
  | "ja_confirmado"
  | "proposta_desatualizada"
  | "observacoes_divergentes"
  | "dados_invalidos"
  | "saldo_insuficiente"
  | "confirmacao_concorrente"
  /**
   * Etapa 63B — a partir da migration 20261107140000, a própria RPC
   * passa a rejeitar com esta mensagem quando o interruptor
   * pcp.ci_ce_momento_y.ativo está desligado para a empresa (antes,
   * só a Server Action verificava isso - contornável chamando a RPC
   * diretamente). Mesmo motivo "interruptor_desligado" já usado pela
   * checagem de aplicação em confirmarNecessidadesMomentoYPcpAction.ts -
   * a mensagem mostrada ao usuário é idêntica nos dois casos.
   */
  | "interruptor_desligado"
  | "erro_desconhecido";

/**
 * Classifica a mensagem TÉCNICA bruta da RPC (texto real, confirmado
 * contra produção via pg_get_functiondef - Etapas 61/62/63B) num
 * motivo estável para a interface. Nunca usado para decidir se algo
 * foi gravado (isso é sempre `erro` != null = nada foi gravado, a
 * função é atômica) - só para escolher a mensagem certa a mostrar.
 */
export function classificarErroConfirmacaoMomentoYPcp(mensagem: string): MotivoRejeicaoConfirmacaoMomentoYPcp {
  if (mensagem.includes("sem permissao para confirmar")) return "nao_autorizado";
  if (mensagem.includes("ja teve o Momento Y confirmado")) return "ja_confirmado";
  if (mensagem.includes("esta em estado final")) return "of_estado_final";
  if (mensagem.includes("nao esta aprovada")) return "of_nao_aprovada";
  if (mensagem.includes("confirmacao de materias-primas via Momento Y nao esta habilitada")) return "interruptor_desligado";
  if (mensagem.includes("nao encontrada")) return "of_nao_encontrada";
  if (mensagem.includes("a proposta de materiais mudou")) return "proposta_desatualizada";
  if (mensagem.includes("observacoes tecnicas divergentes")) return "observacoes_divergentes";
  if (mensagem.includes("saldo livre insuficiente")) return "saldo_insuficiente";
  if (mensagem.includes("foi confirmado por outra operacao")) return "confirmacao_concorrente";
  if (
    mensagem.includes("quantidade confirmada invalida") ||
    mensagem.includes("origem_fornecimento invalida") ||
    mensagem.includes("nao pode ter reserva CI propria") ||
    mensagem.includes("CI nao pode exceder")
  ) {
    return "dados_invalidos";
  }
  return "erro_desconhecido";
}
