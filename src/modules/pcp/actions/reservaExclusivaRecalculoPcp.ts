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

// =====================================================================
// ETAPA 2O.8B-I6H: conclusão de uma EXECUÇÃO DO MOTOR (distinto do
// encerramento acima, usado só para os caminhos em que o Motor nunca
// chegou a rodar - ex.: falha na própria reordenação da fila). Nunca os
// dois caminhos tocam a mesma reserva para a mesma execução - ver
// orquestrarSolicitacaoCalculoPcp.ts/orquestrarMovimentoPrioridadePcp.ts
// (condição 1 do desenho aprovado: nenhum caminho concorrente de
// finalização para uma execução já concluída/publicada).
// =====================================================================
export type ResultadoEfetivoConclusaoMotorPcp = "concluido" | "obsoleto" | "falhou_recuperavel";

export interface ParametrosConclusaoExecucaoMotorPcp {
  empresaId: string;
  execucaoId: string;
  /** "obsoleto" nunca é afirmado pelo chamador - só concluir_execucao_motor_pcp decide isso, por si mesma, comparando a versão de capacidade. */
  resultado: "concluido" | "falhou_recuperavel";
  empresaCapacidadeVersaoOrigem?: number;
  janelaInicio?: string;
  janelaFim?: string;
  ocorrencias?: unknown[];
  motivo?: string | null;
}

export type ResultadoConclusaoExecucaoMotorPcp =
  | {
      aceito: true;
      resultadoEfetivo: ResultadoEfetivoConclusaoMotorPcp;
      programacaoId: string | null;
      /** true quando este resultado veio de consultarHistoricoExecucao após uma exceção de concluirExecucao (condição 3) - nunca um sucesso "normal" do primeiro retorno da RPC. */
      viaRecuperacaoPosFalhaDeComunicacao: boolean;
    }
  | { aceito: false; motivoRejeicao: string };

export interface DependenciasConclusaoExecucaoMotorPcp {
  /** concluir_execucao_motor_pcp real (service_role). Pode lançar em falha de comunicação genuína (ex. rede) - NUNCA em rejeição de negócio, que vem como aceito:false no retorno normal, tratada sem exceção. */
  concluirExecucao: (params: ParametrosConclusaoExecucaoMotorPcp) => Promise<{
    aceito: boolean;
    resultadoEfetivo: string | null;
    programacaoId: string | null;
    motivoRejeicao: string | null;
  }>;
  /** Consulta pcp_recalculo_execucao_historico por execucao_id - usada SOMENTE depois de uma exceção de concluirExecucao, para nunca presumir falha (nem sucesso) só pela exceção (condição 3 do desenho aprovado). */
  consultarHistoricoExecucao: (execucaoId: string) => Promise<{
    resultado: ResultadoEfetivoConclusaoMotorPcp;
    programacaoId: string | null;
  } | null>;
}

/**
 * Condição 3 do desenho aprovado pelo usuário: se concluirExecucao
 * lançar (falha de comunicação, nunca rejeição de negócio - essa vem
 * como aceito:false no retorno normal, tratada sem exceção), NUNCA
 * presumir falha nem sucesso só pela exceção - consultar
 * pcp_recalculo_execucao_historico pelo execucao_id antes de decidir
 * qualquer coisa. Se o histórico confirmar que a execução já concluiu,
 * reportar isso (resposta perdida, trabalho real já feito - nunca
 * repetir nem liberar por suposição). Se o histórico não tiver nada,
 * reportar como falha desconhecida, SEM liberar a reserva por conta
 * própria - o estado correto nesse caso é deixar a reserva em_andamento
 * seguir seu curso normal (expira_em / recuperacao_pendente, nunca uma
 * segunda via de liberação daqui).
 */
export async function concluirExecucaoComTratamentoExplicito(
  deps: DependenciasConclusaoExecucaoMotorPcp,
  params: ParametrosConclusaoExecucaoMotorPcp,
): Promise<ResultadoConclusaoExecucaoMotorPcp> {
  try {
    const resultado = await deps.concluirExecucao(params);
    if (!resultado.aceito) {
      return { aceito: false, motivoRejeicao: resultado.motivoRejeicao ?? "rejeitado_sem_motivo_informado" };
    }
    return {
      aceito: true,
      resultadoEfetivo: resultado.resultadoEfetivo as ResultadoEfetivoConclusaoMotorPcp,
      programacaoId: resultado.programacaoId,
      viaRecuperacaoPosFalhaDeComunicacao: false,
    };
  } catch (erro) {
    const historico = await deps.consultarHistoricoExecucao(params.execucaoId);
    if (historico) {
      return {
        aceito: true,
        resultadoEfetivo: historico.resultado,
        programacaoId: historico.programacaoId,
        viaRecuperacaoPosFalhaDeComunicacao: true,
      };
    }
    return {
      aceito: false,
      motivoRejeicao: `falha_de_comunicacao_sem_confirmacao_no_historico: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  }
}
