// DEC-007 §6.2/Fase 8b (redesenho: convenção coletiva) - resolve, dentre
// todas as vigências já carregadas (BaseCenarios.convencoesHorasAdicionais -
// "base congelada uma vez", carregadas 1 única vez por avaliação, nunca
// reconsultadas por regra/data), qual delas vale para UMA data
// específica. Pura, sem I/O - o carregamento em si (todas as vigências
// que cruzam a janela produtiva do cenário) é responsabilidade do
// chamador. `null` quando nenhuma vigência cobre a data (nunca presume
// acréscimo 0 - o chamador precisa bloquear explicitamente nesse caso).
export interface ConvencaoHorasAdicionaisVigencia {
  percentualSegundaSexta: number;
  percentualSabado: number;
  percentualDomingo: number;
  percentualFeriado: number;
  vigenteDesde: string;
  vigenteAte: string | null;
}

export function resolverConvencaoParaData(
  convencoes: readonly ConvencaoHorasAdicionaisVigencia[],
  data: string,
): ConvencaoHorasAdicionaisVigencia | null {
  for (const convencao of convencoes) {
    if (convencao.vigenteDesde <= data && (convencao.vigenteAte === null || convencao.vigenteAte >= data)) {
      return convencao;
    }
  }
  return null;
}
