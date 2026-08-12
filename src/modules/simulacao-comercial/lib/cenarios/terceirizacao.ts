// DEC-007 §10 - Fase 4: terceirização opera FORA do calendário produtivo
// interno (dias corridos, não dias produtivos) - o fornecedor terceiro
// trabalha no próprio calendário dele, que não é o desta empresa, então
// não faz sentido aplicar "próximo dia produtivo/disponível" (isso seria
// um conceito do calendário INTERNO). Precedência exata via DEC-007 §6:
// só inicia quando a(s) predecessora(s) têm data-fim real conhecida.
//
// Composição pura do que já existe e já está testado (Fase 1) - nenhuma
// lógica de data nova: resolverDataInicioMinima com calendário IDENTIDADE
// (mesmo padrão já usado por escalonadorConjunto.ts para a "data mínima
// bruta") resolve o início; calcularFimPorDuracaoInclusiva resolve o fim.
import { resolverDataInicioMinima, calcularFimPorDuracaoInclusiva } from "./datasPrecedencia";

export interface ResultadoDatasTerceirizacao {
  dataInicioCalculada: string;
  dataFimCalculada: string;
}

export function calcularDatasTerceirizacao(params: {
  /** Data mais cedo em que a terceirização poderia começar, na ausência de predecessora. */
  dataInicioJanela: string;
  /** dataFimReal das predecessoras já concluídas - vazio se a terceirização não tem predecessora. */
  dataFimPredecessoras: string[];
  /** Duração INCLUSIVA em dias corridos (DEC-007 §6) - início 14/11, prazo=3 cobre 14,15,16 -> fim=16/11. */
  prazoDiasCorridos: number;
}): ResultadoDatasTerceirizacao {
  const { dataInicioJanela, dataFimPredecessoras, prazoDiasCorridos } = params;

  const dataInicioCalculada = resolverDataInicioMinima({
    dataInicioJanela,
    dataFimPredecessoras,
    proximoDiaProdutivoAPartirDe: (data) => data, // identidade - dias corridos, calendário produtivo interno não se aplica ao terceiro
  });
  const dataFimCalculada = calcularFimPorDuracaoInclusiva(dataInicioCalculada, prazoDiasCorridos);

  return { dataInicioCalculada, dataFimCalculada };
}
