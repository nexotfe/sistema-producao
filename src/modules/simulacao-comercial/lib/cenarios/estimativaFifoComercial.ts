// DEC-007 - previsão comercial por capacidade, próximo incremento pós
// Etapa 1 (seleção de fonte + agregação, ver compromissoCapacidade.ts).
//
// Reaproveita alocarOperacaoDiaAdia.ts (núcleo já testado do motor
// diário) SEM alterá-lo e SEM generalizar estimativaFifoLegado.ts - ver
// a auditoria feita antes desta função: estimativaFifoLegado.ts fixa 1
// comprometido a 1 recurso já decidido e não tem seu comportamento de
// "filas independentes por recurso" comprovado por execução. Esta
// função escreve sua PRÓPRIA orquestração, com seus próprios testes,
// especificamente para o contrato CompromissoCapacidade.
//
// "Previsão comercial por capacidade - não é programação de PCP": esta
// função nunca reconstrói uma cadeia de operações nem impõe precedência
// entre CompromissoCapacidade - cada recurso tem sua fila FIFO
// inteiramente independente, processada em paralelo conceitual (nenhum
// recurso influencia o resultado de outro).
import type { CandidatoComCapacidadeDiaria, FaixaCapacidadeDia } from "./alocarOperacaoDiaAdia";
import { alocarOperacaoDiaAdia } from "./alocarOperacaoDiaAdia";
import type { CompromissoCapacidade } from "./compromissoCapacidade";
import { validarDataIso, validarDatasEstritamenteCrescentes } from "./validacoes";

/** Capacidade normal (horas-máquina/dia) e produtividade de 1 recurso - nesta etapa, sem hora adicional/convenção (fica para o incremento de integração de cenários). */
export interface CapacidadeRecursoFifo {
  readonly recursoId: string;
  readonly capacidadeHorasMaquinaDia: number;
  readonly produtividade: number;
}

export interface ResultadoFilaRecurso {
  readonly recursoId: string;
  /** Maior data entre as alocações do(s) compromisso(s) classeFila="orcamento_novo" processados neste recurso - null quando não coube dentro de datasGrade. */
  readonly terminoOrcamentoNovo: string | null;
  /** Soma do deficitResidualHorasPadrao de todo compromisso classeFila="orcamento_novo" deste recurso - 0 quando coube inteiro. */
  readonly deficitResidualHorasPadrao: number;
}

export interface ResultadoPrevisaoComercialFifo {
  readonly dataSolicitadaCliente: string;
  readonly atendeDataSolicitada: boolean;
  /** Maior término entre os recursosNecessarios - null quando horizonteTecnico="insuficiente". */
  readonly primeiraEntregaPossivel: string | null;
  /** Todos os recursos cuja última alocação do orçamento novo coincide com primeiraEntregaPossivel - nunca escolhe um arbitrariamente em empate. [] quando horizonteTecnico="insuficiente". */
  readonly recursosQueDeterminamTermino: readonly string[];
  readonly horizonteTecnico: "suficiente" | "insuficiente";
  /** Detalhe por recurso - auditoria, "Ver detalhes" futuro. */
  readonly filasPorRecurso: readonly ResultadoFilaRecurso[];
}

/**
 * classeFila="confirmado" sempre antes de "orcamento_novo" - nunca por
 * data (dataEntradaFila do orçamento novo é sempre null) nem por
 * prioridade inventada. Exportada para reuso por
 * avaliarPrevisaoComercialFlexivel.ts (ordena só confirmados ali -
 * mesma fórmula, nunca uma segunda implementação).
 */
export function compararParaFila(a: CompromissoCapacidade, b: CompromissoCapacidade): number {
  const rankA = a.classeFila === "confirmado" ? 0 : 1;
  const rankB = b.classeFila === "confirmado" ? 0 : 1;
  if (rankA !== rankB) return rankA - rankB;

  if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;

  if (a.classeFila === "confirmado") {
    // Etapa 1 (selecionarFonteVencedora) já garante dataEntradaFila não-nula para classeFila="confirmado".
    const dataA = a.dataEntradaFila as string;
    const dataB = b.dataEntradaFila as string;
    if (dataA !== dataB) return dataA < dataB ? -1 : 1;
  }

  if (a.chaveOrdenacao !== b.chaveOrdenacao) return a.chaveOrdenacao < b.chaveOrdenacao ? -1 : 1;
  return 0;
}

/**
 * Candidato "só capacidade normal" (sem hora adicional nesta etapa) -
 * fechamento com estado mutável PRÓPRIO desta chamada (Map local, nunca
 * compartilhado entre chamadas de estimarFifoComercial) - é isso que
 * garante "nova instância de capacidade em cada cenário, sem
 * contaminação": cada avaliação (cada cenário) cria seus próprios
 * candidatos do zero, nunca reaproveita o estado mutado de uma
 * avaliação anterior.
 */
function criarCandidatoCapacidadeNormal(recursoId: string, capacidadeHorasMaquinaDia: number, produtividade: number): CandidatoComCapacidadeDiaria {
  const consumidoPorData = new Map<string, number>();

  return {
    id: recursoId,
    produtividade,
    faixasDoDia(data: string): FaixaCapacidadeDia[] {
      const consumido = consumidoPorData.get(data) ?? 0;
      const restante = Math.max(0, capacidadeHorasMaquinaDia - consumido);
      return [{ natureza: "normal", horasDisponiveis: restante, contratacaoId: null, elegibilidade: null }];
    },
    consumir(data: string, natureza, horasMaquina: number): void {
      if (natureza !== "normal") {
        throw new RangeError(
          `candidato "${recursoId}": esta etapa só oferece a faixa "normal" (sem hora adicional) - recebeu consumo de natureza "${natureza}".`,
        );
      }
      consumidoPorData.set(data, (consumidoPorData.get(data) ?? 0) + horasMaquina);
    },
  };
}

/** Exportada pelo mesmo motivo de compararParaFila - reuso, nunca duplicação. */
export function maiorData(datas: readonly string[]): string | null {
  if (datas.length === 0) return null;
  return datas.reduce((maior, atual) => (atual > maior ? atual : maior));
}

/**
 * Processa a fila de 1 recurso, do início ao fim, na ordem FIFO
 * definida - independente de qualquer outro recurso (nenhum estado
 * compartilhado entre chamadas desta função para recursos diferentes,
 * nenhuma precedência artificial entre os CompromissoCapacidade além da
 * ordem FIFO documentada).
 */
function processarFilaDoRecurso(params: {
  recursoId: string;
  capacidade: CapacidadeRecursoFifo;
  compromissosDoRecurso: readonly CompromissoCapacidade[];
  datasGrade: readonly string[];
}): ResultadoFilaRecurso {
  const { recursoId, capacidade, compromissosDoRecurso, datasGrade } = params;

  const candidato = criarCandidatoCapacidadeNormal(recursoId, capacidade.capacidadeHorasMaquinaDia, capacidade.produtividade);
  const ordenados = [...compromissosDoRecurso].sort(compararParaFila);

  const datasOrcamentoNovo: string[] = [];
  let deficitResidualHorasPadrao = 0;

  for (const compromisso of ordenados) {
    const datasDisponiveis = datasGrade.filter((d) => d >= compromisso.disponivelAPartirDe);
    const resultado = alocarOperacaoDiaAdia({
      necessarioHorasPadrao: compromisso.horasRestantesPadrao,
      candidatosPorPrioridade: [candidato],
      datasOrdenadas: datasDisponiveis,
      projetoId: compromisso.projetoId,
      ehOrcamentoNovo: compromisso.classeFila === "orcamento_novo",
    });

    if (compromisso.classeFila === "orcamento_novo") {
      for (const alocacao of resultado.alocacoes) {
        datasOrcamentoNovo.push(alocacao.data);
      }
      deficitResidualHorasPadrao += resultado.deficitResidualHorasPadrao;
    }
  }

  const terminoOrcamentoNovo = deficitResidualHorasPadrao > 0 ? null : maiorData(datasOrcamentoNovo);

  return { recursoId, terminoOrcamentoNovo, deficitResidualHorasPadrao };
}

export function estimarFifoComercial(params: {
  dataSolicitadaCliente: string;
  /** Recursos que o orçamento novo precisa - a previsão comercial é o maior término entre eles. */
  recursosNecessarios: readonly string[];
  /** Todos os compromissos de todos os recursos envolvidos (confirmados + orçamento novo) - já vindos de agregarCompromissosPorRecurso. */
  compromissos: readonly CompromissoCapacidade[];
  capacidadesPorRecurso: ReadonlyMap<string, CapacidadeRecursoFifo>;
  /** Já filtrada por calendário produtivo, estritamente crescente, e estendida além de dataSolicitadaCliente (horizonte técnico) - responsabilidade do chamador. */
  datasGrade: readonly string[];
}): ResultadoPrevisaoComercialFifo {
  const { dataSolicitadaCliente, recursosNecessarios, compromissos, capacidadesPorRecurso, datasGrade } = params;

  validarDataIso(dataSolicitadaCliente, "dataSolicitadaCliente");
  validarDatasEstritamenteCrescentes([...datasGrade], "datasGrade");

  if (recursosNecessarios.length === 0) {
    throw new RangeError("recursosNecessarios está vazio - não há como determinar a previsão comercial sem nenhum recurso necessário.");
  }

  for (const recursoId of recursosNecessarios) {
    if (!capacidadesPorRecurso.has(recursoId)) {
      throw new RangeError(`capacidadesPorRecurso não tem entrada para o recurso necessário "${recursoId}".`);
    }
  }

  const compromissosPorRecurso = new Map<string, CompromissoCapacidade[]>();
  for (const c of compromissos) {
    if (!capacidadesPorRecurso.has(c.recursoId)) {
      throw new RangeError(`capacidadesPorRecurso não tem entrada para o recurso "${c.recursoId}" referenciado em compromissos.`);
    }
    const lista = compromissosPorRecurso.get(c.recursoId);
    if (lista) {
      lista.push(c);
    } else {
      compromissosPorRecurso.set(c.recursoId, [c]);
    }
  }

  // Cada recurso é processado de forma inteiramente independente - "fila
  // própria por recurso" e "recursos diferentes em paralelo" são a MESMA
  // garantia: nenhum estado é compartilhado entre as chamadas abaixo.
  const filasPorRecurso = recursosNecessarios.map((recursoId) =>
    processarFilaDoRecurso({
      recursoId,
      capacidade: capacidadesPorRecurso.get(recursoId) as CapacidadeRecursoFifo,
      compromissosDoRecurso: compromissosPorRecurso.get(recursoId) ?? [],
      datasGrade,
    }),
  );

  const algumRecursoSemTermino = filasPorRecurso.some((f) => f.terminoOrcamentoNovo === null);

  if (algumRecursoSemTermino) {
    return {
      dataSolicitadaCliente,
      atendeDataSolicitada: false,
      primeiraEntregaPossivel: null,
      recursosQueDeterminamTermino: [],
      horizonteTecnico: "insuficiente",
      filasPorRecurso,
    };
  }

  const termino = maiorData(filasPorRecurso.map((f) => f.terminoOrcamentoNovo as string)) as string;
  const recursosQueDeterminamTermino = filasPorRecurso.filter((f) => f.terminoOrcamentoNovo === termino).map((f) => f.recursoId);

  return {
    dataSolicitadaCliente,
    atendeDataSolicitada: termino <= dataSolicitadaCliente,
    primeiraEntregaPossivel: termino,
    recursosQueDeterminamTermino,
    horizonteTecnico: "suficiente",
    filasPorRecurso,
  };
}
