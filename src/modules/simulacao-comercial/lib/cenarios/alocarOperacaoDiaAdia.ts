// DEC-007 §4 - Fase 0: ordem do alocador diário é DATA externa,
// CANDIDATO interno - nunca o contrário. Esgotar todos os dias de um
// candidato antes de testar o próximo pode ignorar que um candidato de
// disponibilidade restrita (máquina alugada, freelancer, hora extra
// autorizada só em datas específicas) só estava disponível em datas
// anteriores às que sobraram depois do candidato de maior prioridade.
//
// Dentro do mesmo (candidato, dia), consome SEMPRE a faixa "normal"
// antes de qualquer faixa extra (hora_extra/sabado/domingo/feriado) -
// e só consome extra se o projeto desta ocorrência for elegível para
// aquela faixa específica (DEC-007 §3) - senão um projeto antigo de
// prioridade maior poderia consumir hora extra contratada para
// viabilizar o orçamento novo.
//
// Contrato de mutação: este módulo não clona nada - candidato.consumir
// muta o estado que o CHAMADOR injetou. Isso é deliberado (permite que
// duas ocorrências do mesmo cenário, competindo pelo mesmo recurso na
// mesma data, dividam corretamente o mesmo saldo ao receber a MESMA
// instância de candidato nas duas chamadas - ver alocarOperacaoDiaAdia.test.ts).
// Comparar cenários diferentes exige que o CHAMADOR construa candidatos
// com estado independente por cenário - este módulo não tem noção de
// "cenário", só de candidato/data.
import { horasMaquinaParaHorasPadrao, horasPadraoParaHorasMaquina } from "./unidades";
import { tratarComoZero } from "../constantesNumericas";
import { projetoElegivelParaExtra, type ElegibilidadeCapacidadeExtra } from "./capacidadeDia";
import { validarDatasEstritamenteCrescentes, validarHorasFinitasNaoNegativas, validarProdutividade } from "./validacoes";

export type NaturezaCapacidade = "normal" | "hora_extra" | "sabado" | "domingo" | "feriado";

export interface FaixaCapacidadeDia {
  /**
   * Identifica a faixa DE FORMA ÚNICA dentro do dia - cada candidato só
   * pode devolver, no máximo, 1 faixa por natureza em cada data
   * (validado em validarFaixasDoDia; violação é erro de candidato mal
   * formado, rejeitado explicitamente, nunca silenciosamente ignorado
   * ou sobrescrito).
   */
  natureza: NaturezaCapacidade;
  /** Horas de máquina disponíveis nesta faixa, nesta data - >= 0. */
  horasDisponiveis: number;
  /** null se e somente se natureza="normal" (jornada cadastrada, não é uma contratação) - invariante validada. */
  contratacaoId: string | null;
  /** null se e somente se natureza="normal" (sempre acessível a quem já é candidato da operação) - invariante validada. */
  elegibilidade: ElegibilidadeCapacidadeExtra | null;
}

export interface CandidatoComCapacidadeDiaria {
  /** recursoId (recurso real/compatível) ou idTemporario (recurso temporário do cenário). */
  id: string;
  produtividade: number;
  /** Faixas de capacidade disponíveis nesta data - no máximo 1 por natureza (ver FaixaCapacidadeDia.natureza). */
  faixasDoDia: (data: string) => FaixaCapacidadeDia[];
  /** Efeito colateral controlado - reduz a capacidade disponível desta natureza, nesta data, para a próxima chamada refletir o consumo. */
  consumir: (data: string, natureza: NaturezaCapacidade, horasMaquina: number) => void;
}

export interface AlocacaoDiaria {
  recursoId: string;
  data: string;
  natureza: NaturezaCapacidade;
  contratacaoId: string | null;
  horasMaquina: number;
  horasPadrao: number;
}

export interface ResultadoAlocacaoDiaria {
  alocacoes: AlocacaoDiaria[];
  deficitResidualHorasPadrao: number;
}

/**
 * Valida as invariantes de FaixaCapacidadeDia que o tipo só documenta,
 * mas não garante em tempo de compilação: no máximo 1 faixa por
 * natureza no dia (é o que permite `natureza` sozinha identificar a
 * faixa para `consumir`), e contratacaoId/elegibilidade nulos SE E
 * SOMENTE SE natureza="normal". Um candidato mal formado é rejeitado
 * aqui, antes de qualquer alocação - nunca deixado para um crash
 * silencioso mais adiante (ex.: elegibilidade nula tratada como não
 * nula).
 */
function validarFaixasDoDia(faixas: FaixaCapacidadeDia[], candidatoId: string, data: string): void {
  const naturezasVistas = new Set<NaturezaCapacidade>();
  for (const faixa of faixas) {
    if (naturezasVistas.has(faixa.natureza)) {
      throw new RangeError(
        `candidato "${candidatoId}" devolveu mais de uma faixa de natureza "${faixa.natureza}" para a data "${data}" - no máximo 1 faixa por natureza é permitida (natureza precisa identificar a faixa de forma única).`,
      );
    }
    naturezasVistas.add(faixa.natureza);

    if (faixa.natureza === "normal") {
      if (faixa.contratacaoId !== null || faixa.elegibilidade !== null) {
        throw new RangeError(
          `candidato "${candidatoId}", data "${data}": faixa natureza="normal" precisa ter contratacaoId e elegibilidade nulos (jornada cadastrada, não é uma contratação).`,
        );
      }
    } else if (faixa.contratacaoId === null || faixa.elegibilidade === null) {
      throw new RangeError(
        `candidato "${candidatoId}", data "${data}": faixa natureza="${faixa.natureza}" precisa ter contratacaoId e elegibilidade preenchidos.`,
      );
    }

    validarHorasFinitasNaoNegativas(
      faixa.horasDisponiveis,
      `horasDisponiveis (candidato "${candidatoId}", data "${data}", natureza "${faixa.natureza}")`,
    );
  }
}

export function alocarOperacaoDiaAdia(params: {
  necessarioHorasPadrao: number;
  candidatosPorPrioridade: CandidatoComCapacidadeDiaria[];
  datasOrdenadas: string[];
  projetoId: string;
  ehOrcamentoNovo: boolean;
}): ResultadoAlocacaoDiaria {
  const { necessarioHorasPadrao, candidatosPorPrioridade, datasOrdenadas, projetoId, ehOrcamentoNovo } = params;

  validarHorasFinitasNaoNegativas(necessarioHorasPadrao, "necessarioHorasPadrao");
  validarDatasEstritamenteCrescentes(datasOrdenadas);

  const idsVistos = new Set<string>();
  for (const candidato of candidatosPorPrioridade) {
    if (idsVistos.has(candidato.id)) {
      throw new RangeError(
        `candidatosPorPrioridade contém id duplicado "${candidato.id}" - dois candidatos com o mesmo id e estado independente criariam capacidade duplicada.`,
      );
    }
    idsVistos.add(candidato.id);
    validarProdutividade(candidato.produtividade, `produtividade do candidato "${candidato.id}"`);
  }

  let restante = necessarioHorasPadrao;
  const alocacoes: AlocacaoDiaria[] = [];

  for (const data of datasOrdenadas) {
    if (tratarComoZero(restante) || restante < 0) break;
    for (const candidato of candidatosPorPrioridade) {
      if (tratarComoZero(restante) || restante < 0) break;

      const faixas = candidato.faixasDoDia(data);
      validarFaixasDoDia(faixas, candidato.id, data);
      const faixasOrdenadas = [
        ...faixas.filter((f) => f.natureza === "normal"),
        ...faixas.filter((f) => f.natureza !== "normal"),
      ];

      for (const faixa of faixasOrdenadas) {
        if (tratarComoZero(restante) || restante < 0) break;
        if (faixa.horasDisponiveis <= 0) continue;

        // Seguro pela invariante validada acima: natureza != "normal" implica elegibilidade não nula.
        if (
          faixa.natureza !== "normal" &&
          !projetoElegivelParaExtra(faixa.elegibilidade!, projetoId, ehOrcamentoNovo)
        ) {
          continue; // projeto não autorizado a consumir esta faixa extra - pula, nunca consome
        }

        const restanteHM = horasPadraoParaHorasMaquina(restante, candidato.produtividade);
        let alocadoHM = Math.min(faixa.horasDisponiveis, restanteHM);
        let alocadoHP = horasMaquinaParaHorasPadrao(alocadoHM, candidato.produtividade);
        if (alocadoHP > restante) {
          // Nunca aloca mais horas-padrão do que resta, mesmo com
          // arredondamento de ponto flutuante na ida/volta de unidade -
          // e, ao limitar alocadoHP, RECALCULA alocadoHM a partir do
          // valor já limitado, para o consumo de capacidade de máquina
          // reportado a `consumir` nunca exceder o trabalho
          // efetivamente registrado (um resíduo mínimo de alocadoHM não
          // descontado além do que foi de fato credenciado em horas-padrão).
          alocadoHP = restante;
          alocadoHM = horasPadraoParaHorasMaquina(alocadoHP, candidato.produtividade);
        }
        if (alocadoHP <= 0) continue;

        alocacoes.push({
          recursoId: candidato.id,
          data,
          natureza: faixa.natureza,
          contratacaoId: faixa.contratacaoId,
          horasMaquina: alocadoHM,
          horasPadrao: alocadoHP,
        });
        candidato.consumir(data, faixa.natureza, alocadoHM);
        restante -= alocadoHP;
      }
    }
  }

  // Tolerância única do motor (constantesNumericas.ts, já usada pelo
  // resto do módulo) - um resíduo de ponto flutuante como 2e-15 nunca
  // deve virar déficit fantasma que bloquearia uma operação de fato concluída.
  const deficitResidualHorasPadrao = tratarComoZero(restante) ? 0 : Math.max(0, restante);

  return { alocacoes, deficitResidualHorasPadrao };
}
