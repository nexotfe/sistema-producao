// DEC-007 §9 - Fase 2: diff leve entre duas execuções independentes do
// escalonador conjunto (mesma grade real, ordens de prioridade
// diferentes: programação-base × programação-proposta). NÃO é o
// ImpactoProjetoDeslocado completo do §9 (que depende de D* - Fase 3 - e
// de leitura de ordens_producao/operacoes_producao para producaoIniciada -
// I/O fora desta fase pura) - é o diff estrutural sobre o qual a Fase 5
// constrói esse impacto completo.
//
// diasVariacaoFim é DIAS CIVIS (calendário, corridos) NESTA FASE - a
// distância em dias PRODUTIVOS (que pesa feriados/fins de semana, mesma
// semântica de distanciaProdutivaComSinal) é responsabilidade da Fase 5,
// quando o impacto completo for calculado.
//
// diasVariacaoFim só é calculado quando os DOIS lados estão
// status==="concluida" - dataFimReal de uma ocorrência
// bloqueada_por_deficit é só "até onde chegou" (ResultadoOcorrenciaEscalonada,
// escalonadorConjunto.ts), nunca um término real; comparar essa data
// parcial como se fosse término produziria uma variação enganosa (um
// "adiantamento"/"atraso" que não corresponde a nenhuma conclusão de
// verdade). Ausência de conclusão em qualquer um dos lados -> null.
//
// O array retornado é ordenado pela chave completa da ocorrência (string)
// - nunca pela ordem de inserção dos Maps recebidos, que reflete só a
// ordem em que escalonarConjuntoComFilaDeProntos processou cada lado
// (potencialmente diferente entre base e proposta) e não é informação de
// negócio.
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";
import { validarDataIso } from "./validacoes";
import type { ResultadoOcorrenciaEscalonada, StatusOcorrenciaEscalonada } from "./escalonadorConjunto";

export interface DiffOcorrencia {
  chave: ChaveOcorrencia;
  statusBase: StatusOcorrenciaEscalonada;
  statusProposta: StatusOcorrenciaEscalonada;
  dataFimRealBase: string | null;
  dataFimRealProposta: string | null;
  /** dias CIVIS (proposta - base); negativo = adiantado, positivo = atrasado; null se alguma data-fim for null. */
  diasVariacaoFim: number | null;
  deficitResidualHorasPadraoBase: number;
  deficitResidualHorasPadraoProposta: number;
}

// Mesma aritmética UTC já usada em datasPrecedencia.ts deste módulo -
// reimplementada localmente (função pura self-contida do núcleo, mesma
// convenção já adotada por diaCivilSeguinte/resolverDataInicioMinima).
function diasCivisEntreDatas(dataInicio: string, dataFim: string): number {
  const [anoA, mesA, diaA] = dataInicio.split("-").map(Number);
  const [anoB, mesB, diaB] = dataFim.split("-").map(Number);
  const utcInicio = Date.UTC(anoA, mesA - 1, diaA);
  const utcFim = Date.UTC(anoB, mesB - 1, diaB);
  return Math.round((utcFim - utcInicio) / 86_400_000);
}

function validarResultado(resultado: ResultadoOcorrenciaEscalonada, chaveStrEsperada: string, rotulo: string): void {
  const chaveStrReal = chaveOcorrenciaParaString(resultado.chave);
  if (chaveStrReal !== chaveStrEsperada) {
    throw new RangeError(
      `compararProgramacoes: em "${rotulo}", a chave-string "${chaveStrEsperada}" no mapa não corresponde à chave completa embutida no resultado ("${chaveStrReal}") - mapa incompatível.`,
    );
  }
  if (resultado.status === "concluida" && resultado.dataFimReal === null) {
    throw new RangeError(
      `compararProgramacoes: em "${rotulo}", ocorrência "${chaveStrEsperada}" está com status "concluida" mas dataFimReal é nula - resultado inconsistente.`,
    );
  }
  if (resultado.dataFimReal !== null) {
    validarDataIso(resultado.dataFimReal, `${rotulo} dataFimReal ("${chaveStrEsperada}")`);
  }
}

export function compararProgramacoes(
  base: ReadonlyMap<string, ResultadoOcorrenciaEscalonada>,
  proposta: ReadonlyMap<string, ResultadoOcorrenciaEscalonada>,
): DiffOcorrencia[] {
  const chavesBase = new Set(base.keys());
  const chavesProposta = new Set(proposta.keys());

  const somenteBase = [...chavesBase].filter((chaveStr) => !chavesProposta.has(chaveStr));
  const somenteProposta = [...chavesProposta].filter((chaveStr) => !chavesBase.has(chaveStr));
  if (somenteBase.length > 0 || somenteProposta.length > 0) {
    throw new RangeError(
      `compararProgramacoes exige o MESMO conjunto de ocorrências nas duas programações - ` +
        `somente na base: [${somenteBase.join(", ")}]; somente na proposta: [${somenteProposta.join(", ")}].`,
    );
  }

  const diffs: DiffOcorrencia[] = [];
  for (const chaveStr of chavesBase) {
    const resultadoBase = base.get(chaveStr)!;
    const resultadoProposta = proposta.get(chaveStr)!;

    validarResultado(resultadoBase, chaveStr, "base");
    validarResultado(resultadoProposta, chaveStr, "proposta");
    if (chaveOcorrenciaParaString(resultadoBase.chave) !== chaveOcorrenciaParaString(resultadoProposta.chave)) {
      throw new RangeError(
        `compararProgramacoes: chave "${chaveStr}" tem chaves completas divergentes entre base e proposta - mapas incompatíveis.`,
      );
    }

    const diasVariacaoFim =
      resultadoBase.status === "concluida" && resultadoProposta.status === "concluida"
        ? diasCivisEntreDatas(resultadoBase.dataFimReal!, resultadoProposta.dataFimReal!)
        : null;

    diffs.push({
      chave: resultadoBase.chave,
      statusBase: resultadoBase.status,
      statusProposta: resultadoProposta.status,
      dataFimRealBase: resultadoBase.dataFimReal,
      dataFimRealProposta: resultadoProposta.dataFimReal,
      diasVariacaoFim,
      deficitResidualHorasPadraoBase: resultadoBase.deficitResidualHorasPadrao,
      deficitResidualHorasPadraoProposta: resultadoProposta.deficitResidualHorasPadrao,
    });
  }

  diffs.sort((a, b) => {
    const chaveStrA = chaveOcorrenciaParaString(a.chave);
    const chaveStrB = chaveOcorrenciaParaString(b.chave);
    return chaveStrA < chaveStrB ? -1 : chaveStrA > chaveStrB ? 1 : 0;
  });

  return diffs;
}
