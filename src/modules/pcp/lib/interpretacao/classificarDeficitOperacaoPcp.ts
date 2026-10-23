// PCP-P8I-B5.2.1: classificação C (déficit de capacidade) + a parte de
// bloqueio-por-predecessora que o campo deficit_residual_horas_padrao
// NUNCA deve ser lido como déficit real quando ligada a esse status
// (ver escalonadorConjunto.ts: o campo é reaproveitado com a
// necessidade cheia da ocorrência nesse caso - artefato de
// implementação, não uma medida de capacidade).
export type StatusOperacaoPcp = "concluida" | "bloqueada_por_deficit" | "bloqueada_por_predecessora";

export type ClassificacaoDeficitOperacaoPcp =
  | "sem_deficit"
  | "deficit_parcial_de_capacidade"
  /** status='bloqueada_por_deficit' sem nenhuma alocação - indistinguível, com os dados hoje disponíveis, entre "capacidade zerada dentro da janela" e "janela de dias insuficiente para a ocorrência nem começar" (ver investigação B5.2, classificação D). Nunca rotular como "fora da janela" - seria inventar uma distinção que o contrato do Motor não sustenta. */
  | "sem_alocacao_indistinguivel"
  /** Nunca é déficit de capacidade - é uma dependência (predecessora) não resolvida dentro da janela. O campo deficitResidual, quando presente aqui, é só um artefato de implementação do Motor (reaproveita o campo com a necessidade cheia) - nunca interpretado como medida de capacidade. */
  | "bloqueio_por_predecessora";

export function classificarDeficitOperacaoPcp(params: {
  readonly status: StatusOperacaoPcp;
  readonly alocacoesLength: number;
  readonly deficitResidual: number;
}): ClassificacaoDeficitOperacaoPcp {
  const { status, alocacoesLength, deficitResidual } = params;

  if (status === "bloqueada_por_predecessora") {
    return "bloqueio_por_predecessora";
  }

  if (status === "concluida") {
    if (deficitResidual !== 0) {
      throw new Error(
        `classificarDeficitOperacaoPcp: contrato violado - status 'concluida' nunca tem deficitResidual != 0 (recebido ${deficitResidual}). O Motor garante deficitResidual===0 sempre que status==='concluida' (escalonarConjuntoGenerico); um valor diferente aqui indica dado corrompido ou contrato do Motor alterado sem atualizar esta função.`,
      );
    }
    return "sem_deficit";
  }

  // status === "bloqueada_por_deficit"
  return alocacoesLength > 0 ? "deficit_parcial_de_capacidade" : "sem_alocacao_indistinguivel";
}
