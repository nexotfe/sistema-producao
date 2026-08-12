// DEC-007 §6.2/§18 - Fase 8a, recorte 1 (hora extra/sábado-domingo-
// feriado): composição pura das peças do motor - escalonador conjunto
// (§7) + Calculador Reverso conjunto (§8) + custeio de contratações
// (§10) - sobre a base já carregada por carregarBaseCenarios.ts. Sem
// I/O nenhum aqui: toda consulta de rede já aconteceu na "base
// congelada" (DEC-007 §18) - avaliar um 2º/3º cenário nunca toca a
// rede de novo.
//
// Simplificação conhecida deste recorte (8b, condição registrada no
// DEC-007 §6.2, decisão confirmada com o usuário): comprometidoInicialPorRecurso
// é AGREGADO (calcular_comprometido_v2), não por dia. Consumido aqui a
// partir dos dias mais próximos do início da grade compartilhada,
// ANTES de disponibilizar qualquer hora normal/extra ao escalonador -
// nunca ignorado, mas também não é a reconstrução real por dia que 8c
// vai trazer. Todo resultado deste módulo é uma ESTIMATIVA PRELIMINAR -
// quem consome (a interface, Fase 8b) precisa deixar isso explícito,
// nunca tratar como aprovação definitiva.
import type { BaseCenarios } from "./carregarBaseCenarios";
import type { CapacidadeExtraDia } from "./capacidadeDia";
import { horasPadraoParaHorasMaquina } from "./unidades";
import type {
  CandidatoComCapacidadeDiaria,
  FaixaCapacidadeDia,
  NaturezaCapacidade,
} from "./alocarOperacaoDiaAdia";
import {
  escalonarConjuntoComFilaDeProntos,
  type CriterioPrioridadeDeNegocio,
  type OcorrenciaEscalonavel,
} from "./escalonadorConjunto";
import { buscarDataInicioMaisTardiaViavel, type ResultadoBuscaDStar } from "./calculadorReversoConjunto";
import { calcularCustoContratacoes, type Contratacao, type ResultadoCustoContratacoes } from "./contratacao";
import { chaveOcorrenciaParaString } from "./chaveOcorrencia";

export interface DecisoesCenarioHoraExtra {
  /** Capacidade extra autorizada NESTE cenário - hora extra e/ou sábado/domingo/feriado. */
  capacidadeExtra: CapacidadeExtraDia[];
  /** Contratações referenciadas por CapacidadeExtraDia.contratacaoId - custeio delas neste cenário. */
  contratacoes: Contratacao[];
}

export interface GradeCompartilhada {
  /** Dias corridos, ordenados, cobrindo desde antes do início até bem depois do prazo - mesma grade para todas as candidatas do Calculador Reverso. */
  datasGradeCompartilhada: string[];
  /** Subconjunto de datasGradeCompartilhada, ascendentes, do piso técnico até prazoInterno (inclusive) - candidatas testadas de trás para frente. */
  datasCandidatas: string[];
  prazoInterno: string;
}

export type ResultadoAvaliacaoCenario = ResultadoBuscaDStar & {
  custoAdicionalTotal: number;
  custoPorContratacaoId: Map<string, number>;
};

/**
 * Consome, a partir do início da grade (dias mais próximos primeiro),
 * o equivalente em horas de máquina de um total AGREGADO de
 * comprometido (horas-padrão, mesma convenção de calcular_comprometido_v2/
 * prepararEntradasMotor.ts) - simplificação conhecida do 8b (ver
 * cabeçalho). Nunca consome mais que a capacidade normal de cada dia;
 * o que sobrar de comprometido além do fim da grade é descartado (a
 * grade já é generosa o bastante para o caso comum - se isso acontecer
 * de verdade, o défice apareceria de outra forma, como capacidade
 * insuficiente).
 */
function calcularConsumoFrenteComprometido(params: {
  datasGradeCompartilhada: string[];
  capacidadeDiariaHorasMaquina: number;
  comprometidoInicialHorasPadrao: number;
  produtividade: number;
}): Map<string, number> {
  const { datasGradeCompartilhada, capacidadeDiariaHorasMaquina, comprometidoInicialHorasPadrao, produtividade } = params;
  const consumoPorDia = new Map<string, number>();

  let restanteHM = horasPadraoParaHorasMaquina(comprometidoInicialHorasPadrao, produtividade);
  for (const data of datasGradeCompartilhada) {
    if (restanteHM <= 0) break;
    const consumidoNesteDia = Math.min(capacidadeDiariaHorasMaquina, restanteHM);
    if (consumidoNesteDia > 0) {
      consumoPorDia.set(data, consumidoNesteDia);
      restanteHM -= consumidoNesteDia;
    }
  }

  return consumoPorDia;
}

function criarCandidatoRecurso(params: {
  recursoId: string;
  capacidadeDiariaHorasMaquina: number;
  produtividade: number;
  consumoFrenteComprometidoPorDia: Map<string, number>;
  capacidadeExtraDoRecurso: CapacidadeExtraDia[];
}): CandidatoComCapacidadeDiaria {
  const { recursoId, capacidadeDiariaHorasMaquina, produtividade, consumoFrenteComprometidoPorDia, capacidadeExtraDoRecurso } = params;

  // Estado mutável - inicializado sob demanda, por (data, natureza),
  // nunca clonado entre chamadas (contrato de alocarOperacaoDiaAdia.ts:
  // o candidato É o estado).
  const restantePorChave = new Map<string, number>();
  const extraPorDia = new Map<string, CapacidadeExtraDia[]>();
  for (const extra of capacidadeExtraDoRecurso) {
    if (!extraPorDia.has(extra.data)) extraPorDia.set(extra.data, []);
    extraPorDia.get(extra.data)!.push(extra);
  }

  function chave(data: string, natureza: NaturezaCapacidade): string {
    return `${data}::${natureza}`;
  }

  function restanteNormal(data: string): number {
    const k = chave(data, "normal");
    if (!restantePorChave.has(k)) {
      const consumidoDeAntemao = consumoFrenteComprometidoPorDia.get(data) ?? 0;
      restantePorChave.set(k, Math.max(0, capacidadeDiariaHorasMaquina - consumidoDeAntemao));
    }
    return restantePorChave.get(k)!;
  }

  function restanteExtra(data: string, extra: CapacidadeExtraDia): number {
    const k = chave(data, extra.natureza);
    if (!restantePorChave.has(k)) {
      restantePorChave.set(k, extra.horasAdicionaisDisponiveis);
    }
    return restantePorChave.get(k)!;
  }

  return {
    id: recursoId,
    produtividade,
    faixasDoDia: (data: string): FaixaCapacidadeDia[] => {
      const faixas: FaixaCapacidadeDia[] = [
        { natureza: "normal", horasDisponiveis: restanteNormal(data), contratacaoId: null, elegibilidade: null },
      ];
      for (const extra of extraPorDia.get(data) ?? []) {
        faixas.push({
          natureza: extra.natureza,
          horasDisponiveis: restanteExtra(data, extra),
          contratacaoId: extra.contratacaoId,
          elegibilidade: extra.elegibilidade,
        });
      }
      return faixas;
    },
    consumir: (data: string, natureza: NaturezaCapacidade, horasMaquina: number) => {
      const k = chave(data, natureza);
      const atual = restantePorChave.get(k) ?? 0;
      restantePorChave.set(k, Math.max(0, atual - horasMaquina));
    },
  };
}

/**
 * Fábrica de registroCandidatos - chamada 1 vez por candidata testada
 * pelo Calculador Reverso (isolamento entre tentativas, DEC-007 §8).
 * capacidadeExtra é reaplicada por completo a cada chamada (mesmos
 * dados de entrada, novo estado mutável) - nunca reaproveitada entre
 * tentativas.
 */
function criarFabricaRegistroCandidatos(
  base: BaseCenarios,
  decisoes: DecisoesCenarioHoraExtra,
  grade: GradeCompartilhada,
): () => ReadonlyMap<string, CandidatoComCapacidadeDiaria> {
  const capacidadeExtraPorRecurso = new Map<string, CapacidadeExtraDia[]>();
  for (const extra of decisoes.capacidadeExtra) {
    if (!capacidadeExtraPorRecurso.has(extra.recursoId)) capacidadeExtraPorRecurso.set(extra.recursoId, []);
    capacidadeExtraPorRecurso.get(extra.recursoId)!.push(extra);
  }

  return () => {
    const registro = new Map<string, CandidatoComCapacidadeDiaria>();
    for (const recursoId of base.recursoIds) {
      const capacidadeDiaria = base.capacidadeDiariaPorRecurso[recursoId];
      const produtividade = base.produtividadePorRecurso[recursoId];
      // Sem "?? 0": carregarBaseCenarios.ts garante uma entrada aqui
      // para TODO recursoId de base.recursoIds (mesmo "sem comprometido"
      // já chega como 0 explícito de comprometidoDoRecurso). Uma chave
      // ausente é inconsistência interna, nunca "sem comprometido" -
      // precisa quebrar alto, não virar 0 silenciosamente.
      const comprometidoInicial = base.comprometidoInicialPorRecurso[recursoId];
      if (comprometidoInicial === undefined) {
        throw new RangeError(
          `Inconsistência interna: comprometidoInicialPorRecurso não tem entrada para recursoId="${recursoId}" (presente em base.recursoIds) - carregarBaseCenarios.ts deveria ter preenchido isso para todo recurso.`,
        );
      }
      const consumoFrenteComprometidoPorDia = calcularConsumoFrenteComprometido({
        datasGradeCompartilhada: grade.datasGradeCompartilhada,
        capacidadeDiariaHorasMaquina: capacidadeDiaria,
        comprometidoInicialHorasPadrao: comprometidoInicial,
        produtividade,
      });

      registro.set(
        recursoId,
        criarCandidatoRecurso({
          recursoId,
          capacidadeDiariaHorasMaquina: capacidadeDiaria,
          produtividade,
          consumoFrenteComprometidoPorDia,
          capacidadeExtraDoRecurso: capacidadeExtraPorRecurso.get(recursoId) ?? [],
        }),
      );
    }
    return registro;
  };
}

function construirOcorrenciasEscalonaveis(base: BaseCenarios, dataInicioJanela: string): OcorrenciaEscalonavel[] {
  return base.ocorrencias.map(({ ocorrencia, necessarioHorasPadrao, recursoOriginalId }) => {
    const compativeis = base.compatibilidades[recursoOriginalId] ?? [];
    return {
      chave: ocorrencia.chave,
      projetoId: base.projetoId,
      necessarioHorasPadrao,
      candidatoIdsPorPrioridade: [recursoOriginalId, ...compativeis.map((c) => c.recursoId)],
      ehOrcamentoNovo: true,
      dataInicioJanela,
    };
  });
}

// Critério de prioridade trivial - único orçamento nesta avaliação
// (8b, single-projeto, sem concorrência com outros projetos ainda -
// isso é 8c). A ordem final continua determinística por desempate de
// data mínima + chave (escalonadorConjunto.ts), mesmo com prioridade
// constante para todas as ocorrências.
const PRIORIDADE_UNICA: CriterioPrioridadeDeNegocio = () => 0;

/**
 * Avalia 1 cenário completo (hora extra/sábado-domingo-feriado) sobre
 * a base já carregada - pura, sem I/O. Roda o Calculador Reverso
 * conjunto (que por sua vez roda o escalonador 1x por candidata
 * testada) e, com o resultado, custeia as contratações referenciadas
 * pela capacidade extra realmente usada.
 */
export function avaliarCenario(
  base: BaseCenarios,
  decisoes: DecisoesCenarioHoraExtra,
  grade: GradeCompartilhada,
): ResultadoAvaliacaoCenario {
  const ocorrenciasTemplate = construirOcorrenciasEscalonaveis(base, grade.datasGradeCompartilhada[0]);
  const chavesRaiz = base.chavesRaizOrcamentoNovo;
  const chavesFinais = base.chavesFinaisOrcamentoNovo;
  const chavesTodas = base.ocorrencias.map((o) => o.ocorrencia.chave);

  const criarRegistroCandidatos = criarFabricaRegistroCandidatos(base, decisoes, grade);

  const resultadoBusca = buscarDataInicioMaisTardiaViavel({
    ocorrencias: ocorrenciasTemplate,
    dependencias: base.dependencias,
    projetoIdOrcamentoNovo: base.projetoId,
    chavesOrcamentoNovo: chavesTodas,
    chavesRaizOrcamentoNovo: chavesRaiz,
    chavesFinaisOrcamentoNovo: chavesFinais,
    criarRegistroCandidatos,
    datasGradeCompartilhada: grade.datasGradeCompartilhada,
    datasCandidatas: grade.datasCandidatas,
    criterioPrioridadeDeNegocio: PRIORIDADE_UNICA,
    prazoInterno: grade.prazoInterno,
  });

  // Custeio: horas realmente usadas por contratacaoId exige rodar de
  // novo com a candidata vencedora (a busca em si não devolve as
  // alocações do ponto viável, só a data e o resumo de viabilidade -
  // DEC-007 §8, ResultadoBuscaDStar é deliberadamente enxuto). Reexecuta
  // só 1 vez, com a MESMA dataEstimadaInicioNecessario já encontrada -
  // não é uma busca nova, é a reconstrução do resultado já decidido.
  if (resultadoBusca.estado !== "viavel" && resultadoBusca.estado !== "viavel_no_limite") {
    const custoSemUso = calcularCustoContratacoes({
      contratacoes: decisoes.contratacoes,
      horasUsadasPorContratacaoId: new Map(),
    });
    return { ...resultadoBusca, custoAdicionalTotal: custoSemUso.custoTotal, custoPorContratacaoId: custoSemUso.custoPorContratacaoId };
  }

  const ocorrenciasVencedoras = ocorrenciasTemplate.map((oc) =>
    chavesRaiz.some((raiz) => chaveOcorrenciaParaString(raiz) === chaveOcorrenciaParaString(oc.chave))
      ? { ...oc, dataInicioJanela: resultadoBusca.dataEstimadaInicioNecessario }
      : oc,
  );

  const resultadosVencedores = escalonarConjuntoComFilaDeProntos({
    ocorrencias: ocorrenciasVencedoras,
    dependencias: base.dependencias,
    registroCandidatos: criarRegistroCandidatos(),
    datasGradeCompartilhada: grade.datasGradeCompartilhada,
    criterioPrioridadeDeNegocio: PRIORIDADE_UNICA,
  });

  const horasUsadasPorContratacaoId = new Map<string, number>();
  for (const resultado of resultadosVencedores.values()) {
    for (const alocacao of resultado.alocacoes) {
      if (alocacao.contratacaoId === null) continue;
      const atual = horasUsadasPorContratacaoId.get(alocacao.contratacaoId) ?? 0;
      horasUsadasPorContratacaoId.set(alocacao.contratacaoId, atual + alocacao.horasMaquina);
    }
  }

  const custo = calcularCustoContratacoes({
    contratacoes: decisoes.contratacoes,
    horasUsadasPorContratacaoId,
  });

  return { ...resultadoBusca, custoAdicionalTotal: custo.custoTotal, custoPorContratacaoId: custo.custoPorContratacaoId };
}
