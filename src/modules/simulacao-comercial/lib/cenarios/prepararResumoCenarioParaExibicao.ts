// DEC-007 §6.2/§18 - Fase 8b (desenho): agrega resultadosPorOcorrencia
// (avaliarCenario.ts) num resumo pronto para a grade de comparação -
// mesma separação "núcleo puro devolve dado bruto, uma função separada
// prepara para exibição" já usada no motor antigo
// (prepararResultadoParaExibicao.ts). Puro, sem I/O, sem mutar nenhuma
// entrada.
//
// TERMINOLOGIA (decisão do usuário, substitui a rodada anterior de
// "Conclusão estimada"):
// - "Término calculado" = terminoCalculado (dataFimReal do resultado,
//   quando existe) - o resultado bruto do sistema, sempre que houver.
// - "Início calculado" = inicioCalculado - menor dataInicioReal entre
//   resultadosPorOcorrencia (a raiz que efetivamente começa primeiro;
//   por construção do grafo, uma raiz nunca começa depois de uma
//   sucessora). Espelha terminoCalculado: também é o resultado REAL da
//   réplica, não um alvo/target (que seria dataEstimadaInicioNecessario,
//   só existe em viavel/viavel_no_limite).
// - "Data solicitada pelo cliente" = dataSolicitadaCliente - parâmetro
//   EXPLÍCITO desta função (o valor original informado pelo usuário,
//   ex.: dataNecessidade do projeto - responsabilidade do CHAMADOR
//   resolver essa origem, este módulo não lê nada sozinho). NUNCA
//   derivado de grade.prazoInterno: prazoInterno normalmente já embute
//   margem de segurança (calculado, não a data pedida) - confundir os
//   dois esconderia a folga real que o cliente enxergaria. Os dois
//   ficam expostos separadamente (dataSolicitadaCliente e prazoInterno)
//   para a tela poder mostrar as duas, nunca uma no lugar da outra.
// - "Prazo proposto" - termo reservado para quando o ORÇAMENTISTA
//   escolher uma data/cenário para apresentar ao cliente. Não existe
//   campo correspondente aqui: é estado de seleção da UI (Fase 8b/9),
//   fora do escopo desta função pura - nunca confundir com
//   terminoCalculado, que é só o resultado cru do cálculo.
//
// Este módulo NUNCA classifica o orçamento como "comercialmente viável"
// ou "inviável" - `resultado.estado` (viavel/viavel_no_limite/
// prazo_inviavel/horizonte_tecnico_excedido/dados_insuficientes) é uma
// classificação TÉCNICA de agendamento (DEC-007 §8), não um veredito
// comercial. O resumo só expõe fatos (término calculado, diferença vs.
// solicitado, dias ganhos vs. base, custos, diagnóstico técnico) - a
// decisão de aceitar/propor é sempre humana.
//
// "Operações afetadas" é sempre relativo a um CENÁRIO-BASE (avaliado
// sem nenhuma decisão) - nunca uma contagem absoluta de alocações. Uma
// ocorrência conta como afetada se sua "assinatura" (status + datas +
// terceirizada + conjunto de alocações) difere entre o cenário e a
// base, incluindo o caso de não existir no resultado da base (ex.:
// base em dados_insuficientes, resultadosPorOcorrencia=[]).
//
// resultadosSaoDiagnostico (repassado de ResultadoAvaliacaoCenario) é o
// que distingue um resumo de programação ACEITA de um resumo puramente
// DIAGNÓSTICO (cenário inviável, mas com a melhor tentativa relevante
// preservada - ver avaliarCenario.ts). Quem exibe este resumo tem que
// checar esse campo antes de tratar terminoCalculado como uma
// programação de fato concluída - em prazo_inviavel, por exemplo,
// terminoCalculado existe mas é tardio (ver diferencaDiasCivisVsSolicitado).
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";
import type {
  DecisoesCenario,
  GradeCompartilhada,
  ResultadoAvaliacaoCenario,
  ResultadoOcorrenciaCenario,
} from "./avaliarCenario";

export interface OperacaoTerceirizadaResumo {
  readonly chave: ChaveOcorrencia;
  readonly diasCorridos: number;
}

/** Custo agregado por alternativa (as 4 do 8b) - nunca por contratacaoId individual (ver custoPorContratacaoId, já existente, para esse nível de detalhe). */
export interface CustoPorAlternativaResumo {
  readonly horaExtra: number;
  readonly terceirizacao: number;
  readonly recursoTemporario: number;
  readonly antecipacaoMaterial: number;
}

/**
 * Diagnóstico técnico de 1 ocorrência problemática - só existe quando
 * resultadosSaoDiagnostico=true (cenário inviável) E a ocorrência não
 * concluiu (status != "concluida"), ou quando não havia nenhum candidato
 * disponível para ela ("sem_candidato", origem: estado dados_insuficientes,
 * onde resultadosPorOcorrencia nem chega a ser calculado). Nunca inclui
 * ocorrências que concluíram (mesmo tarde - prazo_inviavel sempre conclui
 * todas, ver avaliarCenario.ts; o problema ali é atraso, já reportado em
 * ResultadoAvaliacaoCenario.diasCivisDeAtraso, não uma ocorrência
 * individual para diagnosticar).
 */
export interface DiagnosticoOcorrencia {
  readonly chave: ChaveOcorrencia;
  readonly status: ResultadoOcorrenciaCenario["status"] | "sem_candidato";
  /** null só em "sem_candidato" (nunca chegou a calcular déficit - não há candidatoIdsPorPrioridade para tentar). */
  readonly deficitResidualHorasPadrao: number | null;
  /** candidatoIdsPorPrioridade desta ocorrência - recursos OFERECIDOS ao escalonador, mesmo que insuficientes. [] em "sem_candidato". */
  readonly recursosConsiderados: readonly string[];
  /** recursoId distintos que de fato receberam alguma alocação (subconjunto de recursosConsiderados, possivelmente vazio). */
  readonly recursosUsados: readonly string[];
}

export interface ResumoCenarioParaExibicao {
  readonly horasNormais: number;
  readonly horasHoraExtra: number;
  readonly horasSabado: number;
  readonly horasDomingo: number;
  readonly horasFeriado: number;
  readonly horasRecursoTemporario: number;
  /** 1 entrada por ocorrência terceirizada - quantidade = .length, total de dias = soma de diasCorridos. */
  readonly operacoesTerceirizadas: readonly OperacaoTerceirizadaResumo[];
  readonly operacoesComHoraExtra: readonly ChaveOcorrencia[];
  readonly operacoesComRecursoTemporario: readonly ChaveOcorrencia[];
  readonly deficitResidualTotalHorasPadrao: number;
  readonly custoAdicionalTotal: number;
  readonly custoPorContratacaoId: ReadonlyMap<string, number>;
  readonly custoPorAlternativa: CustoPorAlternativaResumo;
  /** Ocorrências cuja assinatura (status/datas/terceirizada/alocações) difere do cenário-base. */
  readonly operacoesAfetadas: readonly ChaveOcorrencia[];
  /**
   * Repassado de ResultadoAvaliacaoCenario.resultadosSaoDiagnostico - true
   * quando resultadosPorOcorrencia/deficitResidualTotalHorasPadrao vêm de
   * uma tentativa DIAGNÓSTICA (cenário inviável), nunca uma programação
   * aceita. Quem exibe este resumo NUNCA pode tratar terminoCalculado
   * como uma entrega de fato - só como diagnóstico de por que o cenário é
   * inviável (ver avaliarCenario.ts e o cabeçalho deste módulo).
   */
  readonly resultadosSaoDiagnostico: boolean;
  /** "Término calculado" - resultado.dataFimReal quando existe (viavel/viavel_no_limite/prazo_inviavel); null em horizonte_tecnico_excedido/dados_insuficientes (não há término calculável nesses 2 estados). */
  readonly terminoCalculado: string | null;
  /** "Início calculado" - menor dataInicioReal entre resultadosPorOcorrencia; null quando não há nenhuma alocação real (ex.: dados_insuficientes, ou horizonte_tecnico_excedido sem nenhuma alocação sequer). */
  readonly inicioCalculado: string | null;
  /** "Data solicitada pelo cliente" - repassado do parâmetro `dataSolicitadaCliente` (origem: dado original informado pelo usuário, ex.: dataNecessidade - nunca derivado de prazoInterno/grade). */
  readonly dataSolicitadaCliente: string;
  /** "Prazo interno calculado" - grade.prazoInterno, exposto separadamente (já embute margem de segurança - nunca a mesma coisa que dataSolicitadaCliente). */
  readonly prazoInterno: string;
  /** dias civis entre dataSolicitadaCliente e terminoCalculado (positivo = término DEPOIS do solicitado/atraso; negativo = término ANTES/adiantado). null quando terminoCalculado é null. */
  readonly diferencaDiasCivisVsSolicitado: number | null;
  /** dias civis "ganhos" comparado ao cenário-base (positivo = este cenário termina mais cedo que o base). null se este cenário ou o base não tiverem terminoCalculado. */
  readonly diasGanhosVsBase: number | null;
  /** custoAdicionalTotal / diasGanhosVsBase - null quando diasGanhosVsBase é null ou <= 0 (não antecipou nada, dividir não faz sentido). */
  readonly custoPorDiaAntecipado: number | null;
  /** Diagnóstico técnico das ocorrências problemáticas - [] quando resultadosSaoDiagnostico=false (nada para diagnosticar) e também pode ser [] mesmo com resultadosSaoDiagnostico=true (ex.: prazo_inviavel, onde todas concluem). */
  readonly diagnosticos: readonly DiagnosticoOcorrencia[];
}

/**
 * Assinatura canônica de 1 ResultadoOcorrenciaCenario - usada só para
 * comparação de igualdade (cenário × base), nunca exposta como dado em
 * si. Deliberadamente SEM `dataInicioReal`/`dataFimReal` nem a `data`
 * de cada alocação: "recebeu algum ajuste" significa mudança na FONTE
 * de capacidade usada (natureza/recurso/horas), não a operação
 * simplesmente ter caído em outro dia porque o D* do cenário inteiro
 * se deslocou (efeito indireto de outra ocorrência, não um ajuste
 * NESTA). Alocações ordenadas antes de juntar, para a comparação não
 * depender da ordem em que o escalonador as produziu.
 */
function assinaturaOcorrencia(r: ResultadoOcorrenciaCenario): string {
  const alocacoesOrdenadas = r.alocacoes
    .map((a) => `${a.natureza}|${a.recursoId}|${a.horasMaquina}`)
    .sort()
    .join(";");
  return [r.status, r.terceirizada ? "T" : "F", alocacoesOrdenadas].join("::");
}

function calcularOperacoesAfetadas(
  ocorrenciasCenario: readonly ResultadoOcorrenciaCenario[],
  ocorrenciasBase: readonly ResultadoOcorrenciaCenario[],
): ChaveOcorrencia[] {
  const basePorChave = new Map(ocorrenciasBase.map((r) => [chaveOcorrenciaParaString(r.chave), r]));
  const afetadas: ChaveOcorrencia[] = [];

  for (const r of ocorrenciasCenario) {
    const doBase = basePorChave.get(chaveOcorrenciaParaString(r.chave));
    if (!doBase || assinaturaOcorrencia(doBase) !== assinaturaOcorrencia(r)) {
      afetadas.push(r.chave);
    }
  }

  return afetadas;
}

/** "Término calculado" - só existe nos 3 estados que produzem um dataFimReal de cenário inteiro (ver ResultadoBuscaDStar, calculadorReversoConjunto.ts). */
function terminoCalculadoDe(resultado: ResultadoAvaliacaoCenario): string | null {
  return resultado.estado === "viavel" || resultado.estado === "viavel_no_limite" || resultado.estado === "prazo_inviavel"
    ? resultado.dataFimReal
    : null;
}

/**
 * "Início calculado" - menor dataInicioReal entre resultadosPorOcorrencia.
 * Nunca a "janela pedida" (dataInicioJanela/dataEstimadaInicioNecessario,
 * que é um ALVO) - é o resultado REAL da réplica, mesma disciplina de
 * terminoCalculado (que também é dataFimReal real, não prazoInterno).
 * Por construção do grafo de dependências, uma sucessora nunca começa
 * antes de sua predecessora terminar - logo o menor dataInicioReal do
 * conjunto sempre é atingido por alguma ocorrência-raiz, sem precisar
 * filtrar por raiz explicitamente aqui.
 */
function inicioCalculadoDe(resultado: ResultadoAvaliacaoCenario): string | null {
  let inicio: string | null = null;
  for (const r of resultado.resultadosPorOcorrencia) {
    if (r.dataInicioReal !== null && (inicio === null || r.dataInicioReal < inicio)) {
      inicio = r.dataInicioReal;
    }
  }
  return inicio;
}

function diasCivisEntreDatas(dataInicio: string, dataFim: string): number {
  const [anoA, mesA, diaA] = dataInicio.split("-").map(Number);
  const [anoB, mesB, diaB] = dataFim.split("-").map(Number);
  const utcInicio = Date.UTC(anoA, mesA - 1, diaA);
  const utcFim = Date.UTC(anoB, mesB - 1, diaB);
  return Math.round((utcFim - utcInicio) / 86_400_000);
}

/**
 * Custo agregado por alternativa - agrupa custoPorContratacaoId pelas 4
 * categorias de DecisoesCenario (nunca por Contratacao.tipo: as
 * categorias já refletem exatamente as 4 alternativas do 8b). Uma mesma
 * Contratacao em mais de 1 categoria é REJEITADA por
 * avaliarCenario.ts (validarUnicidadeContratacoesPorCategoria, chamada
 * antes de qualquer cálculo) - por isso os `if/else if` abaixo, embora
 * pareçam "primeiro categoria vence", nunca de fato competem: por
 * construção, cada contratacaoId só pode estar em 1 dos 4 Sets.
 */
function calcularCustoPorAlternativa(
  resultado: ResultadoAvaliacaoCenario,
  decisoes: DecisoesCenario,
): CustoPorAlternativaResumo {
  const idsHoraExtra = new Set(decisoes.capacidadeExtra.map((c) => c.contratacaoId));
  const idsTerceirizacao = new Set(decisoes.terceirizacoes.map((t) => t.contratacaoId));
  const idsRecursoTemporario = new Set(decisoes.recursosTemporarios.map((rt) => rt.recursoTemporario.contratacaoId));
  const idsAntecipacaoMaterial = new Set(decisoes.antecipacoesMaterial.map((a) => a.contratacaoId));

  let horaExtra = 0;
  let terceirizacao = 0;
  let recursoTemporario = 0;
  let antecipacaoMaterial = 0;

  for (const [contratacaoId, custo] of resultado.custoPorContratacaoId) {
    if (idsHoraExtra.has(contratacaoId)) {
      horaExtra += custo;
    } else if (idsTerceirizacao.has(contratacaoId)) {
      terceirizacao += custo;
    } else if (idsRecursoTemporario.has(contratacaoId)) {
      recursoTemporario += custo;
    } else if (idsAntecipacaoMaterial.has(contratacaoId)) {
      antecipacaoMaterial += custo;
    }
  }

  return Object.freeze({ horaExtra, terceirizacao, recursoTemporario, antecipacaoMaterial });
}

function construirDiagnosticos(resultado: ResultadoAvaliacaoCenario): DiagnosticoOcorrencia[] {
  if (resultado.estado === "dados_insuficientes") {
    return [
      {
        chave: resultado.chave,
        status: "sem_candidato",
        deficitResidualHorasPadrao: null,
        recursosConsiderados: [],
        recursosUsados: [],
      },
    ];
  }

  return resultado.resultadosPorOcorrencia
    .filter((r) => r.status !== "concluida")
    .map((r) => ({
      chave: r.chave,
      status: r.status,
      deficitResidualHorasPadrao: r.deficitResidualHorasPadrao,
      recursosConsiderados: r.recursosConsiderados,
      recursosUsados: Object.freeze(Array.from(new Set(r.alocacoes.map((a) => a.recursoId)))),
    }));
}

export function prepararResumoCenarioParaExibicao(params: {
  resultado: ResultadoAvaliacaoCenario;
  decisoes: DecisoesCenario;
  resultadoBase: ResultadoAvaliacaoCenario;
  grade: GradeCompartilhada;
  /** Data original pedida pelo usuário (ex.: dataNecessidade do projeto) - responsabilidade do CHAMADOR resolver essa origem; nunca derivado de grade.prazoInterno aqui dentro (ver cabeçalho do módulo). */
  dataSolicitadaCliente: string;
}): ResumoCenarioParaExibicao {
  const { resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente } = params;

  const idsRecursosTemporarios = new Set(decisoes.recursosTemporarios.map((rt) => rt.recursoTemporario.idTemporario));

  let horasNormais = 0;
  let horasHoraExtra = 0;
  let horasSabado = 0;
  let horasDomingo = 0;
  let horasFeriado = 0;
  let horasRecursoTemporario = 0;
  let deficitResidualTotalHorasPadrao = 0;

  const operacoesTerceirizadas: OperacaoTerceirizadaResumo[] = [];
  const operacoesComHoraExtraPorChave = new Map<string, ChaveOcorrencia>();
  const operacoesComRecursoTemporarioPorChave = new Map<string, ChaveOcorrencia>();

  for (const r of resultado.resultadosPorOcorrencia) {
    deficitResidualTotalHorasPadrao += r.deficitResidualHorasPadrao;

    if (r.terceirizada) {
      // prazoDiasCorridosTerceirizacao é garantido não-nulo quando
      // terceirizada=true (invariante de avaliarCenario.ts). As
      // alocações sintéticas ("1 unidade/dia") não são horas de
      // máquina reais - nunca entram no somatório de horas.
      operacoesTerceirizadas.push({ chave: r.chave, diasCorridos: r.prazoDiasCorridosTerceirizacao as number });
      continue;
    }

    for (const a of r.alocacoes) {
      if (idsRecursosTemporarios.has(a.recursoId)) {
        horasRecursoTemporario += a.horasMaquina;
        operacoesComRecursoTemporarioPorChave.set(chaveOcorrenciaParaString(r.chave), r.chave);
        continue;
      }

      switch (a.natureza) {
        case "normal":
          horasNormais += a.horasMaquina;
          break;
        case "hora_extra":
          horasHoraExtra += a.horasMaquina;
          operacoesComHoraExtraPorChave.set(chaveOcorrenciaParaString(r.chave), r.chave);
          break;
        case "sabado":
          horasSabado += a.horasMaquina;
          operacoesComHoraExtraPorChave.set(chaveOcorrenciaParaString(r.chave), r.chave);
          break;
        case "domingo":
          horasDomingo += a.horasMaquina;
          operacoesComHoraExtraPorChave.set(chaveOcorrenciaParaString(r.chave), r.chave);
          break;
        case "feriado":
          horasFeriado += a.horasMaquina;
          operacoesComHoraExtraPorChave.set(chaveOcorrenciaParaString(r.chave), r.chave);
          break;
      }
    }
  }

  const terminoCalculado = terminoCalculadoDe(resultado);
  const terminoCalculadoBase = terminoCalculadoDe(resultadoBase);
  const inicioCalculado = inicioCalculadoDe(resultado);

  const diferencaDiasCivisVsSolicitado =
    terminoCalculado !== null ? diasCivisEntreDatas(dataSolicitadaCliente, terminoCalculado) : null;

  const diasGanhosVsBase =
    terminoCalculado !== null && terminoCalculadoBase !== null
      ? diasCivisEntreDatas(terminoCalculado, terminoCalculadoBase)
      : null;

  const custoPorDiaAntecipado =
    diasGanhosVsBase !== null && diasGanhosVsBase > 0 ? resultado.custoAdicionalTotal / diasGanhosVsBase : null;

  return Object.freeze({
    horasNormais,
    horasHoraExtra,
    horasSabado,
    horasDomingo,
    horasFeriado,
    horasRecursoTemporario,
    operacoesTerceirizadas: Object.freeze(operacoesTerceirizadas),
    operacoesComHoraExtra: Object.freeze(Array.from(operacoesComHoraExtraPorChave.values())),
    operacoesComRecursoTemporario: Object.freeze(Array.from(operacoesComRecursoTemporarioPorChave.values())),
    deficitResidualTotalHorasPadrao,
    custoAdicionalTotal: resultado.custoAdicionalTotal,
    custoPorContratacaoId: resultado.custoPorContratacaoId,
    custoPorAlternativa: calcularCustoPorAlternativa(resultado, decisoes),
    operacoesAfetadas: Object.freeze(
      calcularOperacoesAfetadas(resultado.resultadosPorOcorrencia, resultadoBase.resultadosPorOcorrencia),
    ),
    resultadosSaoDiagnostico: resultado.resultadosSaoDiagnostico,
    terminoCalculado,
    inicioCalculado,
    dataSolicitadaCliente,
    prazoInterno: grade.prazoInterno,
    diferencaDiasCivisVsSolicitado,
    diasGanhosVsBase,
    custoPorDiaAntecipado,
    diagnosticos: Object.freeze(construirDiagnosticos(resultado)),
  });
}
