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
import type { DependenciaOcorrencia } from "./grafoPrecedencia";

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

/** 1 operação dentro da Cadeia precedente observada - mesmos dados reais já usados no diagnóstico (nunca uma 2ª fonte). */
export interface EloCadeiaObservada {
  readonly chave: ChaveOcorrencia;
  readonly recursosUsados: readonly string[];
  readonly inicioReal: string | null;
  readonly terminoReal: string | null;
}

/**
 * 1 passo da Cadeia precedente observada, em ordem de EXECUÇÃO (raiz →
 * nó final) - nunca a ordem em que o rastreamento a percorreu (que é
 * para trás). Nomenclatura deliberadamente sem causalidade (nunca
 * "origem do atraso"/"operação causadora" - pedido explícito do
 * usuário): a cadeia mostra a SEQUÊNCIA observada, não uma conclusão.
 * - "raiz": ocorrência sem nenhuma predecessora - início da cadeia.
 * - "elo": ocorrência com uma única predecessora identificável (a de
 *   maior terminoReal entre as candidatas, ver reconstruirCadeiaObservada).
 *   `gapNaoAtribuivel` descreve a relação desta operação com O QUE VEM
 *   ANTES dela na lista (raiz→...→esta): `false` = inicioReal desta
 *   operação é exatamente 1 dia civil após o terminoReal de referência
 *   (imediato, atribuível à cadeia); `true` = há um intervalo maior -
 *   NUNCA afirmar que a cadeia determinou o início aqui (pode ser
 *   disponibilidade de material, disputa por recurso, etc. - não
 *   determinável por estes dados); `null` = não há nenhuma data de
 *   referência confiável para comparar (a entrada anterior da lista é
 *   um passo "empate" ou "indisponivel").
 * - "empate": 2+ predecessoras empatadas no maior terminoReal - a
 *   cadeia NUNCA escolhe uma arbitrariamente; lista todas e para de
 *   rastrear further atrás deste ponto.
 * - "indisponivel": não foi possível continuar (dependência aponta para
 *   uma ocorrência sem resultado calculado, ou nenhuma predecessora tem
 *   terminoReal) - motivo explícito, a cadeia para aqui SEM se
 *   apresentar como completa.
 */
export type PassoCadeiaObservada =
  | { readonly tipo: "raiz"; readonly operacao: EloCadeiaObservada }
  | { readonly tipo: "elo"; readonly operacao: EloCadeiaObservada; readonly gapNaoAtribuivel: boolean | null }
  | { readonly tipo: "empate"; readonly operacoesEmpatadas: readonly EloCadeiaObservada[] }
  | { readonly tipo: "indisponivel"; readonly motivo: string };

/**
 * "Cadeia precedente observada" (nunca "origem do atraso" nem "operação
 * causadora" - ver PassoCadeiaObservada). Reconstruída SÓ com dados já
 * produzidos pelo motor (dataInicioReal/dataFimReal/alocacoes de
 * resultadosPorOcorrencia + dependencias de BaseCenarios) - nenhum
 * cálculo novo, nenhuma consulta ao banco. Existe apenas para nós FINAIS
 * atrasados (ver construirDiagnosticos) - null nos demais diagnósticos.
 */
export interface CadeiaObservada {
  readonly passos: readonly PassoCadeiaObservada[];
}

function paraElo(r: ResultadoOcorrenciaCenario): EloCadeiaObservada {
  return {
    chave: r.chave,
    recursosUsados: Object.freeze(Array.from(new Set(r.alocacoes.map((a) => a.recursoId)))),
    inicioReal: r.dataInicioReal,
    terminoReal: r.dataFimReal,
  };
}

/**
 * Anda para trás pelas dependencias a partir de `chaveFinal`, sempre
 * seguindo a predecessora de MAIOR terminoReal (a que, nos dados reais,
 * mais tarde liberou capacidade para a sucessora) - nunca uma escolha
 * arbitrária em caso de empate (para o rastreamento e lista todas as
 * empatadas). Predecessoras sem terminoReal são excluídas da comparação
 * (nunca comparáveis a uma data real) - só bloqueiam o rastreamento
 * quando TODAS as predecessoras de um passo carecem de terminoReal.
 */
function reconstruirCadeiaObservada(
  chaveFinal: ChaveOcorrencia,
  resultadosPorChave: ReadonlyMap<string, ResultadoOcorrenciaCenario>,
  predecessorasPorChave: ReadonlyMap<string, readonly ChaveOcorrencia[]>,
): CadeiaObservada {
  const passosInvertidos: PassoCadeiaObservada[] = [];
  let atual = resultadosPorChave.get(chaveOcorrenciaParaString(chaveFinal));

  if (!atual) {
    return { passos: [{ tipo: "indisponivel", motivo: "Resultado da operação final não foi encontrado - cadeia indisponível." }] };
  }

  while (true) {
    const predecessorasChaves = predecessorasPorChave.get(chaveOcorrenciaParaString(atual.chave)) ?? [];

    if (predecessorasChaves.length === 0) {
      passosInvertidos.push({ tipo: "raiz", operacao: paraElo(atual) });
      break;
    }

    const predecessorasResultados = predecessorasChaves.map((c) => resultadosPorChave.get(chaveOcorrenciaParaString(c)));
    if (predecessorasResultados.some((r) => r === undefined)) {
      passosInvertidos.push({ tipo: "elo", operacao: paraElo(atual), gapNaoAtribuivel: null });
      passosInvertidos.push({
        tipo: "indisponivel",
        motivo: "Uma dependência aponta para uma operação sem resultado calculado - cadeia interrompida aqui.",
      });
      break;
    }

    const predecessorasValidas = predecessorasResultados as ResultadoOcorrenciaCenario[];
    const comTermino = predecessorasValidas.filter((r) => r.dataFimReal !== null);

    if (comTermino.length === 0) {
      passosInvertidos.push({ tipo: "elo", operacao: paraElo(atual), gapNaoAtribuivel: null });
      passosInvertidos.push({
        tipo: "indisponivel",
        motivo: "Nenhuma predecessora tem término real registrado - cadeia interrompida aqui.",
      });
      break;
    }

    const maiorTermino = comTermino.reduce((maior, r) => ((r.dataFimReal as string) > maior ? (r.dataFimReal as string) : maior), comTermino[0].dataFimReal as string);
    const empatadas = comTermino.filter((r) => r.dataFimReal === maiorTermino);
    const gapNaoAtribuivel = atual.dataInicioReal === null || diasCivisEntreDatas(maiorTermino, atual.dataInicioReal) !== 1;

    if (empatadas.length > 1) {
      passosInvertidos.push({ tipo: "elo", operacao: paraElo(atual), gapNaoAtribuivel });
      passosInvertidos.push({ tipo: "empate", operacoesEmpatadas: Object.freeze(empatadas.map(paraElo)) });
      break;
    }

    passosInvertidos.push({ tipo: "elo", operacao: paraElo(atual), gapNaoAtribuivel });
    atual = empatadas[0];
  }

  return { passos: Object.freeze(passosInvertidos.reverse()) };
}

/**
 * Diagnóstico técnico de 1 ocorrência problemática - entra quando:
 * (a) a ocorrência não concluiu (status != "concluida" - bloqueada por
 * déficit ou por predecessora), OU (b) é uma ocorrência FINAL da cadeia
 * (chavesFinaisOrcamentoNovo) cujo terminoReal ficou depois do
 * prazoInterno do cenário (cobre prazo_inviavel: todas as ocorrências
 * concluem, só tarde - ver ResultadoAvaliacaoCenario, ninguém teria
 * déficit ali, então o critério (a) sozinho nunca capturaria esse caso).
 * Ocorrências INTERMEDIÁRIAS concluídas tarde, mas que não são nó final,
 * ficam de fora deliberadamente - o atraso delas chega ao diagnóstico
 * através do nó final que herda o atraso pela precedência (nunca
 * duplicado aqui). Também existe para "sem_candidato" (origem: estado
 * dados_insuficientes, onde resultadosPorOcorrencia nem chega a ser
 * calculado).
 */
export interface DiagnosticoOcorrencia {
  readonly chave: ChaveOcorrencia;
  readonly status: ResultadoOcorrenciaCenario["status"] | "sem_candidato";
  /** É uma das chavesFinaisOrcamentoNovo (nó sem nenhuma sucessora) - determina se um atraso aqui reflete o atraso da entrega do cenário inteiro. */
  readonly ehOcorrenciaFinal: boolean;
  /** null só em "sem_candidato" (nunca chegou a calcular déficit - não há candidatoIdsPorPrioridade para tentar). */
  readonly deficitResidualHorasPadrao: number | null;
  /** candidatoIdsPorPrioridade desta ocorrência - recursos OFERECIDOS ao escalonador, mesmo que insuficientes. [] em "sem_candidato". */
  readonly recursosConsiderados: readonly string[];
  /** recursoId distintos que de fato receberam alguma alocação (subconjunto de recursosConsiderados, possivelmente vazio). */
  readonly recursosUsados: readonly string[];
  /** dataInicioReal, passthrough - null quando a ocorrência nunca chegou a começar. */
  readonly inicioReal: string | null;
  /** dataFimReal, passthrough - null quando a ocorrência nunca concluiu. */
  readonly terminoReal: string | null;
  /**
   * Maior `data` entre as próprias alocações desta ocorrência - "Último
   * dia com capacidade utilizada", NUNCA "semana necessária": não indica
   * quando a hora extra deveria ser configurada (isso exigiria uma regra
   * comprovada, fora do escopo deste diagnóstico de leitura) - só relevante
   * quando há déficit (quem exibe decide o gate). null quando a ocorrência
   * nunca recebeu nenhuma alocação.
   */
  readonly ultimoDiaComCapacidadeUtilizada: string | null;
  /** dias CIVIS entre prazoInterno e terminoReal (positivo = terminoReal depois do prazo/atraso). null quando terminoReal é null. */
  readonly diasAtrasoVsPrazoInterno: number | null;
  /**
   * "Cadeia precedente observada" - só reconstruída quando ehOcorrenciaFinal
   * && diasAtrasoVsPrazoInterno > 0 (mesmo gate do bloco de atraso); null
   * em todos os outros diagnósticos (não se aplica).
   */
  readonly cadeiaObservada: CadeiaObservada | null;
}

export interface ResumoCenarioParaExibicao {
  readonly horasNormais: number;
  readonly horasHoraExtra: number;
  readonly horasSabado: number;
  readonly horasDomingo: number;
  readonly horasFeriado: number;
  readonly horasRecursoTemporario: number;
  /**
   * Soma de `decisoes.capacidadeExtra[].horasAdicionaisDisponiveis` -
   * quanto foi AUTORIZADO pelas regras de hora adicional (potencial),
   * nunca o quanto foi de fato usado pelo escalonador (isso é
   * `horasHoraExtra + horasSabado + horasDomingo + horasFeriado`, acima -
   * as duas podem divergir porque o escalonador só usa capacidade extra
   * quando realmente precisa, mesmo que mais tenha sido disponibilizado).
   */
  readonly horasAdicionaisDisponibilizadas: number;
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

function ultimaDataEntre(datas: readonly string[]): string | null {
  if (datas.length === 0) return null;
  return datas.reduce((maior, atual) => (atual > maior ? atual : maior));
}

function construirDiagnosticos(
  resultado: ResultadoAvaliacaoCenario,
  chavesFinais: readonly ChaveOcorrencia[],
  prazoInterno: string,
  dependencias: readonly DependenciaOcorrencia[],
): DiagnosticoOcorrencia[] {
  const chavesFinaisSet = new Set(chavesFinais.map(chaveOcorrenciaParaString));

  if (resultado.estado === "dados_insuficientes") {
    return [
      {
        chave: resultado.chave,
        status: "sem_candidato",
        ehOcorrenciaFinal: chavesFinaisSet.has(chaveOcorrenciaParaString(resultado.chave)),
        deficitResidualHorasPadrao: null,
        recursosConsiderados: [],
        recursosUsados: [],
        inicioReal: null,
        terminoReal: null,
        ultimoDiaComCapacidadeUtilizada: null,
        diasAtrasoVsPrazoInterno: null,
        cadeiaObservada: null,
      },
    ];
  }

  const resultadosPorChave = new Map(resultado.resultadosPorOcorrencia.map((r) => [chaveOcorrenciaParaString(r.chave), r]));
  const predecessorasPorChave = new Map<string, ChaveOcorrencia[]>();
  for (const dep of dependencias) {
    const chaveSucessora = chaveOcorrenciaParaString(dep.sucessora);
    const lista = predecessorasPorChave.get(chaveSucessora);
    if (lista) {
      lista.push(dep.predecessora);
    } else {
      predecessorasPorChave.set(chaveSucessora, [dep.predecessora]);
    }
  }

  return resultado.resultadosPorOcorrencia
    .filter((r) => {
      if (r.status !== "concluida") return true;
      const ehFinal = chavesFinaisSet.has(chaveOcorrenciaParaString(r.chave));
      return ehFinal && r.dataFimReal !== null && r.dataFimReal > prazoInterno;
    })
    .map((r) => {
      const ehOcorrenciaFinal = chavesFinaisSet.has(chaveOcorrenciaParaString(r.chave));
      const diasAtrasoVsPrazoInterno = r.dataFimReal !== null ? diasCivisEntreDatas(prazoInterno, r.dataFimReal) : null;
      const temAtraso = diasAtrasoVsPrazoInterno !== null && diasAtrasoVsPrazoInterno > 0;

      return {
        chave: r.chave,
        status: r.status,
        ehOcorrenciaFinal,
        deficitResidualHorasPadrao: r.deficitResidualHorasPadrao,
        recursosConsiderados: r.recursosConsiderados,
        recursosUsados: Object.freeze(Array.from(new Set(r.alocacoes.map((a) => a.recursoId)))),
        inicioReal: r.dataInicioReal,
        terminoReal: r.dataFimReal,
        ultimoDiaComCapacidadeUtilizada: ultimaDataEntre(r.alocacoes.map((a) => a.data)),
        diasAtrasoVsPrazoInterno,
        cadeiaObservada:
          ehOcorrenciaFinal && temAtraso ? reconstruirCadeiaObservada(r.chave, resultadosPorChave, predecessorasPorChave) : null,
      };
    });
}

export function prepararResumoCenarioParaExibicao(params: {
  resultado: ResultadoAvaliacaoCenario;
  decisoes: DecisoesCenario;
  resultadoBase: ResultadoAvaliacaoCenario;
  grade: GradeCompartilhada;
  /** Data original pedida pelo usuário (ex.: dataNecessidade do projeto) - responsabilidade do CHAMADOR resolver essa origem; nunca derivado de grade.prazoInterno aqui dentro (ver cabeçalho do módulo). */
  dataSolicitadaCliente: string;
  /** BaseCenarios.chavesFinaisOrcamentoNovo - obrigatório (nunca default `[]`): sem isto, diagnosticos nunca capturaria o caso prazo_inviavel (nó final concluído tarde, sem déficit - ver DiagnosticoOcorrencia). */
  chavesFinais: readonly ChaveOcorrencia[];
  /** BaseCenarios.dependencias - obrigatório: sem isto, a "Cadeia precedente observada" nunca poderia ser reconstruída para nenhum nó final atrasado. */
  dependencias: readonly DependenciaOcorrencia[];
}): ResumoCenarioParaExibicao {
  const { resultado, decisoes, resultadoBase, grade, dataSolicitadaCliente, chavesFinais, dependencias } = params;

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

  const horasAdicionaisDisponibilizadas = decisoes.capacidadeExtra.reduce(
    (soma, c) => soma + c.horasAdicionaisDisponiveis,
    0,
  );

  return Object.freeze({
    horasNormais,
    horasHoraExtra,
    horasSabado,
    horasDomingo,
    horasFeriado,
    horasRecursoTemporario,
    horasAdicionaisDisponibilizadas,
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
    diagnosticos: Object.freeze(construirDiagnosticos(resultado, chavesFinais, grade.prazoInterno, dependencias)),
  });
}
