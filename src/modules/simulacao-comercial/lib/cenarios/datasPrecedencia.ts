// DEC-007 §6 - Fase 1: semântica de datas do grafo de precedência.
// Granularidade é diária, sem hora do dia - "terminar em D" = fim do
// expediente de D; sucessora sempre começa no primeiro dia
// produtivo/disponível ESTRITAMENTE após D (nunca no mesmo dia -
// limitação real da granularidade diária, declarada, não contornada;
// aproveitar o resto do mesmo dia exigiria granularidade por horário,
// fora desta entrega).
import { validarDataIso } from "./validacoes";

/** Dia civil seguinte (calendário, não produtivo) - mesma aritmética UTC já usada em estimarInicioNecessario.ts/prepararJanelaComercial.ts deste módulo. */
export function diaCivilSeguinte(data: string): string {
  validarDataIso(data, "data");
  const [ano, mes, dia] = data.split("-").map(Number);
  const proximo = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return proximo.toISOString().slice(0, 10);
}

/**
 * dataInicioOperacao(op) = max(dataInicioJanela, dataFimOperacao(predecessora)),
 * avançado ao primeiro dia produtivo/disponível ESTRITAMENTE após esse
 * máximo quando há predecessora - nunca no mesmo dia em que ela
 * terminou. Sem nenhuma predecessora (primeira ocorrência da cadeia),
 * o próprio dataInicioJanela é elegível (inclusive).
 *
 * proximoDiaProdutivoAPartirDe é injetado - I/O real de calendário
 * (calendario_operacional_empresa/feriados) fica fora desta fase pura;
 * recebe uma data e devolve o primeiro dia produtivo/disponível A
 * PARTIR DELA (inclusive, se ela mesma já for produtiva).
 */
export function resolverDataInicioMinima(params: {
  dataInicioJanela: string;
  dataFimPredecessoras: string[];
  proximoDiaProdutivoAPartirDe: (data: string) => string;
}): string {
  const { dataInicioJanela, dataFimPredecessoras, proximoDiaProdutivoAPartirDe } = params;
  validarDataIso(dataInicioJanela, "dataInicioJanela");
  for (const [indice, data] of dataFimPredecessoras.entries()) {
    validarDataIso(data, `dataFimPredecessoras[${indice}]`);
  }

  const dataBase =
    dataFimPredecessoras.length === 0
      ? dataInicioJanela
      : (() => {
          const maiorFimPredecessora = dataFimPredecessoras.reduce((maior, atual) => (atual > maior ? atual : maior));
          const primeiroDiaElegivel = diaCivilSeguinte(maiorFimPredecessora);
          return primeiroDiaElegivel > dataInicioJanela ? primeiroDiaElegivel : dataInicioJanela;
        })();

  const resultado = proximoDiaProdutivoAPartirDe(dataBase);
  // O retorno da função injetada não é confiado sem checagem - é
  // fronteira externa como qualquer outra. Precisa ser uma data ISO
  // válida e nunca anterior à data pedida (senão a garantia de
  // "sucessora nunca antes de D+1" seria quebrada por uma implementação
  // de calendário com bug, silenciosamente).
  validarDataIso(resultado, "retorno de proximoDiaProdutivoAPartirDe");
  if (resultado < dataBase) {
    throw new RangeError(
      `proximoDiaProdutivoAPartirDe("${dataBase}") devolveu "${resultado}", anterior à data pedida - a função injetada precisa devolver uma data igual ou posterior à informada.`,
    );
  }
  return resultado;
}

/**
 * prazoDiasCorridos é duração INCLUSIVA: início 14/11, prazo=3 dias
 * corridos cobre 14, 15 e 16 -> fim=16/11 (nunca 17/11, que contaria o
 * dia de início como "dia 0" mais 3 dias adiante).
 */
export function calcularFimPorDuracaoInclusiva(dataInicio: string, prazoDiasCorridos: number): string {
  validarDataIso(dataInicio, "dataInicio");
  if (!Number.isInteger(prazoDiasCorridos) || prazoDiasCorridos < 1) {
    throw new RangeError(`prazoDiasCorridos precisa ser um número inteiro >= 1 - recebido: ${prazoDiasCorridos}`);
  }
  const [ano, mes, dia] = dataInicio.split("-").map(Number);
  const fim = new Date(Date.UTC(ano, mes - 1, dia + prazoDiasCorridos - 1));
  return fim.toISOString().slice(0, 10);
}
