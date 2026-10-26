// Etapa 2O.8B-I5/I6-B: contrato e lógica de liberação da reserva
// exclusiva de recálculo (pcp_recalculo_execucao), compartilhados pelos
// dois caminhos que a usam (mover prioridade - contexto
// 'alterar_prioridade' - e recálculo independente - contexto
// 'solicitar_calculo'). Extraído de orquestrarMovimentoPrioridadePcp.ts
// na I6-B para nunca duplicar esta lógica quando o segundo caminho
// passou a precisar dela também.
export interface ResultadoIniciarReservaPcp {
  execucaoId: string;
  adquirida: boolean;
  /** 'adquirida' | 'ocupada' | 'recuperacao_pendente' - motivo devolvido por iniciar_recalculo_pcp. */
  motivo: string;
  responsavelAtualNome: string;
}

export type ResultadoLiberacaoReservaPcp = { liberada: true } | { liberada: false; detalhe: string };

export interface DependenciasReservaRecalculoPcp {
  /** iniciar_recalculo_pcp real (service_role) - contexto fixo por chamador, nunca escolhido pelo payload. Lança em caso de erro inesperado da RPC. */
  iniciarReserva: (empresaId: string, userId: string) => Promise<ResultadoIniciarReservaPcp>;
  /** finalizar_recalculo_pcp real (service_role). Lança em caso de erro inesperado da RPC. */
  finalizarReserva: (empresaId: string, execucaoId: string, situacao: "concluida" | "falhou") => Promise<boolean>;
}

/**
 * Libera a reserva com tratamento EXPLÍCITO de falha (auditoria Parte 3,
 * ressalva 3) - uma exceção ou um retorno `false` de finalizarReserva
 * NUNCA é escondido atrás de um log genérico; o chamador decide como
 * reportar isso ao usuário (nunca aparentando término normal), mas
 * SEMPRE recebe a informação.
 */
export async function liberarReservaComTratamentoExplicito(
  deps: DependenciasReservaRecalculoPcp,
  empresaId: string,
  execucaoId: string,
  situacao: "concluida" | "falhou",
): Promise<ResultadoLiberacaoReservaPcp> {
  try {
    const liberou = await deps.finalizarReserva(empresaId, execucaoId, situacao);
    if (!liberou) {
      return {
        liberada: false,
        detalhe: "finalizar_recalculo_pcp retornou false - execucao_id já não correspondia a uma reserva em_andamento desta empresa.",
      };
    }
    return { liberada: true };
  } catch (erro) {
    return { liberada: false, detalhe: erro instanceof Error ? erro.message : String(erro) };
  }
}
