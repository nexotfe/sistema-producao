// DEC-007 §6.2/§18 - Fase 8a: composição pura das peças do motor -
// escalonador conjunto (§7) + Calculador Reverso conjunto (§8) +
// custeio de contratações (§10) - sobre a base já carregada por
// carregarBaseCenarios.ts. Sem I/O nenhum aqui: toda consulta de rede
// já aconteceu na "base congelada" (DEC-007 §18) - avaliar um 2º/3º
// cenário nunca toca a rede de novo.
//
// Recorte 1 (hora extra/sábado-domingo-feriado) fechado e auditado -
// comportamento preservado sem alteração nesta extensão. Recorte 2
// (terceirização + recurso temporário/freelancer) adicionado aqui,
// combinável com hora extra no mesmo cenário, cada operação usando no
// máximo 1 caminho por vez (nunca dois ao mesmo tempo na MESMA
// ocorrência - ver `construirOcorrenciasEscalonaveis`).
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
import { calcularCustoContratacoes, type AbrangenciaContratacao, type Contratacao } from "./contratacao";
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";
import {
  criarCandidatoRecursoTemporario,
  recursoTemporarioAplicavelA,
  type RecursoTemporarioCenario,
} from "./recursoTemporario";

export interface DecisaoTerceirizacao {
  /** A ocorrência específica que vai ser terceirizada (DEC-007 §12: terceirizacoes é keyed por chave, não por recurso). */
  chave: ChaveOcorrencia;
  fornecedor: string;
  /** Duração INCLUSIVA em dias corridos - mesma semântica de calcularDatasTerceirizacao (terceirizacao.ts). */
  prazoDiasCorridos: number;
  contratacaoId: string;
}

export interface DecisaoRecursoTemporario {
  recursoTemporario: RecursoTemporarioCenario;
  /**
   * Produtividade herdada de recursoTemporario.recursoReferenciaId -
   * resolvida pelo CHAMADOR (leitura de recursos_produtivos), nunca
   * aqui dentro (avaliarCenario é sem I/O - mesma disciplina de
   * criarCandidatoRecursoTemporario, que já recebe isso como parâmetro
   * separado em vez de ler o cadastro sozinha).
   */
  produtividadeReferencia: number;
}

export interface DecisoesCenario {
  /** Capacidade extra autorizada NESTE cenário - hora extra e/ou sábado/domingo/feriado. */
  capacidadeExtra: CapacidadeExtraDia[];
  /** Contratações referenciadas por CapacidadeExtraDia.contratacaoId, DecisaoTerceirizacao.contratacaoId ou RecursoTemporarioCenario.contratacaoId - custeio de todas neste cenário. */
  contratacoes: Contratacao[];
  terceirizacoes: DecisaoTerceirizacao[];
  recursosTemporarios: DecisaoRecursoTemporario[];
}

/**
 * Terceirização não produz `horasUsadas` reais (a unidade sintética
 * "1/dia" do candidato de terceirização - ver `criarCandidatoTerceirizado`
 * - não é hora de máquina, é só um dispositivo para reproduzir a
 * duração inclusiva dentro do escalonador). Por isso só as duas
 * abrangências cujo valor depende exclusivamente de `Contratacao.valor`
 * (nunca de uso) são aceitas - qualquer uma que dependesse de horas ou
 * de `datas.length` correndo o risco de o CHAMADOR informar um número
 * que não bate com `prazoDiasCorridos` (dado não verificado por este
 * módulo) é rejeitada explicitamente, nunca resolvida como custo 0
 * silencioso:
 * - `por_periodo_completo` - cobrado uma vez, valor fixo.
 * - `valor_fixo_unico` - idêntico no cálculo, só muda o rótulo.
 * Rejeitadas: `por_hora_utilizada` (não há horas reais para medir) e
 * `por_dia_contratado` (dependeria de `datas.length` bater com
 * `prazoDiasCorridos`, uma consistência que este módulo não pode
 * verificar sozinho - preferível recusar a confiar silenciosamente).
 */
const ABRANGENCIAS_VALIDAS_TERCEIRIZACAO: ReadonlySet<AbrangenciaContratacao> = new Set([
  "por_periodo_completo",
  "valor_fixo_unico",
]);

/**
 * Valida, ANTES de qualquer cálculo, que toda DecisaoTerceirizacao
 * referencia uma Contratacao existente em decisoes.contratacoes (nunca
 * uma referência solta, que resultaria em custo 0 silencioso - a
 * mesma classe de bug que motivou esta função) e que sua abrangencia é
 * uma das aceitas para terceirização.
 */
function validarDecisoesTerceirizacao(decisoes: DecisoesCenario): void {
  const contratacaoPorId = new Map(decisoes.contratacoes.map((c) => [c.id, c]));

  for (const terceirizacao of decisoes.terceirizacoes) {
    const contratacao = contratacaoPorId.get(terceirizacao.contratacaoId);
    if (!contratacao) {
      throw new RangeError(
        `Terceirização inválida: contratacaoId="${terceirizacao.contratacaoId}" (ocorrência "${chaveOcorrenciaParaString(terceirizacao.chave)}") não corresponde a nenhuma Contratacao em decisoes.contratacoes - sem ela, o custo desta terceirização seria 0 silenciosamente.`,
      );
    }
    if (!ABRANGENCIAS_VALIDAS_TERCEIRIZACAO.has(contratacao.abrangencia)) {
      throw new RangeError(
        `Terceirização inválida: contratação "${contratacao.id}" (ocorrência "${chaveOcorrenciaParaString(terceirizacao.chave)}") usa abrangencia="${contratacao.abrangencia}" - terceirização só aceita "por_periodo_completo" ou "valor_fixo_unico" (valor fixo, independente de uso), nunca "por_hora_utilizada" (sem horas de máquina reais) nem "por_dia_contratado" (dependeria de datas.length bater com prazoDiasCorridos, não verificável aqui).`,
      );
    }
  }
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

function candidatoTerceirizadoId(chaveStr: string): string {
  return `terceirizado::${chaveStr}`;
}

/**
 * Candidato sintético "1 unidade por dia corrido" - reproduz
 * calcularDatasTerceirizacao (terceirizacao.ts: duração INCLUSIVA fixa
 * em dias corridos, fora da capacidade interna) dentro do escalonador
 * já existente, sem modificá-lo. A ocorrência terceirizada tem
 * necessarioHorasPadrao redefinido para prazoDiasCorridos (unidade
 * sintética "1 dia" - nunca misturada com horas reais, porque este
 * candidato nunca é referenciado por nenhuma outra ocorrência, exclusivo
 * por construção via candidatoTerceirizadoId).
 *
 * resolverDataMinimaBruta do escalonador já aplica exatamente a mesma
 * fórmula de calcularDatasTerceirizacao (resolverDataInicioMinima com
 * calendário identidade) para achar a data de início a partir da(s)
 * predecessora(s) - consumir 1 unidade/dia a partir daí, por N dias
 * corridos CONSECUTIVOS da grade compartilhada (sem furos - garantido
 * por quem monta GradeCompartilhada), produz
 * dataFimReal = dataInicioReal + (prazoDiasCorridos - 1), exatamente
 * calcularFimPorDuracaoInclusiva. Sem estado: este candidato é
 * exclusivo de UMA ocorrência, nunca revisitado além dos
 * prazoDiasCorridos dias que ela precisa - não há saldo a rastrear
 * nem risco de outra ocorrência "roubar" a mesma capacidade sintética.
 */
function criarCandidatoTerceirizado(id: string): CandidatoComCapacidadeDiaria {
  return {
    id,
    produtividade: 1,
    faixasDoDia: () => [{ natureza: "normal", horasDisponiveis: 1, contratacaoId: null, elegibilidade: null }],
    consumir: () => {},
  };
}

/**
 * Fábrica de registroCandidatos - chamada 1 vez por candidata testada
 * pelo Calculador Reverso (isolamento entre tentativas, DEC-007 §8).
 * Toda decisão (capacidade extra, terceirizações, recursos temporários)
 * é reaplicada por completo a cada chamada (mesmos dados de entrada,
 * novo estado mutável) - nunca reaproveitada entre tentativas.
 */
function criarFabricaRegistroCandidatos(
  base: BaseCenarios,
  decisoes: DecisoesCenario,
  grade: GradeCompartilhada,
): () => ReadonlyMap<string, CandidatoComCapacidadeDiaria> {
  const capacidadeExtraPorRecurso = new Map<string, CapacidadeExtraDia[]>();
  for (const extra of decisoes.capacidadeExtra) {
    if (!capacidadeExtraPorRecurso.has(extra.recursoId)) capacidadeExtraPorRecurso.set(extra.recursoId, []);
    capacidadeExtraPorRecurso.get(extra.recursoId)!.push(extra);
  }

  // IDs de recurso temporário nunca podem colidir com recursos reais
  // nem entre si - uma colisão contaria a mesma capacidade (ou
  // custaria a mesma contratação) duas vezes sob a mesma chave do Map.
  const idsRecursosTemporarios = new Set<string>();
  for (const { recursoTemporario } of decisoes.recursosTemporarios) {
    if (base.recursoIds.includes(recursoTemporario.idTemporario)) {
      throw new RangeError(
        `Recurso temporário "${recursoTemporario.idTemporario}" colide com o id de um recurso real do roteiro - precisa ser um id sintético, nunca reaproveitar um recursoId real.`,
      );
    }
    if (idsRecursosTemporarios.has(recursoTemporario.idTemporario)) {
      throw new RangeError(`Recurso temporário "${recursoTemporario.idTemporario}" duplicado em decisoes.recursosTemporarios.`);
    }
    idsRecursosTemporarios.add(recursoTemporario.idTemporario);
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

    for (const { recursoTemporario, produtividadeReferencia } of decisoes.recursosTemporarios) {
      registro.set(recursoTemporario.idTemporario, criarCandidatoRecursoTemporario(recursoTemporario, produtividadeReferencia));
    }

    for (const terceirizacao of decisoes.terceirizacoes) {
      const id = candidatoTerceirizadoId(chaveOcorrenciaParaString(terceirizacao.chave));
      registro.set(id, criarCandidatoTerceirizado(id));
    }

    return registro;
  };
}

/**
 * Uma ocorrência terceirizada usa EXCLUSIVAMENTE o candidato sintético
 * da terceirização (nunca combina com hora extra/compatibilidade/
 * recurso temporário na MESMA ocorrência - terceirizar significa que
 * ela sai inteiramente da capacidade interna, DEC-007 §10). Recurso
 * temporário, quando aplicável (recursoTemporarioAplicavelA), entra
 * como ÚLTIMA alternativa, depois do original e dos compatíveis -
 * "contratar temporário" é o recurso mais caro/menos preferido entre
 * as opções internas, tentado só se nada interno bastar.
 */
function construirOcorrenciasEscalonaveis(
  base: BaseCenarios,
  dataInicioJanela: string,
  decisoes: DecisoesCenario,
): OcorrenciaEscalonavel[] {
  const terceirizacaoPorChave = new Map<string, DecisaoTerceirizacao>();
  for (const t of decisoes.terceirizacoes) {
    const chaveStr = chaveOcorrenciaParaString(t.chave);
    if (terceirizacaoPorChave.has(chaveStr)) {
      throw new RangeError(
        `Terceirização duplicada: a ocorrência "${chaveStr}" tem mais de uma DecisaoTerceirizacao neste cenário - qual delas é a real?`,
      );
    }
    terceirizacaoPorChave.set(chaveStr, t);
  }

  // "Erro explícito, nunca ignorado silenciosamente" (mesma disciplina
  // do resto de lib/cenarios/): uma DecisaoTerceirizacao apontando para
  // uma chave que não existe em base.ocorrencias é dado órfão - quase
  // sempre um bug de quem montou o cenário (chave errada, ocorrência de
  // outra base) - detectado abaixo, depois do .map, comparando o que
  // foi de fato consumido contra o que foi declarado.
  const chavesConsumidas = new Set<string>();

  const ocorrenciasEscalonaveis = base.ocorrencias.map(({ ocorrencia, necessarioHorasPadrao, recursoOriginalId }) => {
    const chaveStr = chaveOcorrenciaParaString(ocorrencia.chave);
    const terceirizacao = terceirizacaoPorChave.get(chaveStr);

    if (terceirizacao) {
      chavesConsumidas.add(chaveStr);
      return {
        chave: ocorrencia.chave,
        projetoId: base.projetoId,
        necessarioHorasPadrao: terceirizacao.prazoDiasCorridos,
        candidatoIdsPorPrioridade: [candidatoTerceirizadoId(chaveStr)],
        ehOrcamentoNovo: true,
        dataInicioJanela,
      };
    }

    const compativeis = base.compatibilidades[recursoOriginalId] ?? [];
    const temporariosAplicaveis = decisoes.recursosTemporarios
      .filter((rt) => recursoTemporarioAplicavelA(rt.recursoTemporario, ocorrencia.chave))
      .map((rt) => rt.recursoTemporario.idTemporario);

    return {
      chave: ocorrencia.chave,
      projetoId: base.projetoId,
      necessarioHorasPadrao,
      candidatoIdsPorPrioridade: [recursoOriginalId, ...compativeis.map((c) => c.recursoId), ...temporariosAplicaveis],
      ehOrcamentoNovo: true,
      dataInicioJanela,
    };
  });

  for (const chaveStr of terceirizacaoPorChave.keys()) {
    if (!chavesConsumidas.has(chaveStr)) {
      throw new RangeError(
        `Terceirização órfã: DecisaoTerceirizacao referencia a ocorrência "${chaveStr}", que não existe em base.ocorrencias deste cenário.`,
      );
    }
  }

  return ocorrenciasEscalonaveis;
}

// Critério de prioridade trivial - único orçamento nesta avaliação
// (8b, single-projeto, sem concorrência com outros projetos ainda -
// isso é 8c). A ordem final continua determinística por desempate de
// data mínima + chave (escalonadorConjunto.ts), mesmo com prioridade
// constante para todas as ocorrências.
const PRIORIDADE_UNICA: CriterioPrioridadeDeNegocio = () => 0;

/**
 * Custo do cenário: agrega horas realmente usadas por contratacaoId a
 * partir das alocações efetivamente produzidas pela candidata
 * vencedora (nunca estimado) - hora extra vem de AlocacaoDiaria.contratacaoId
 * diretamente; recurso temporário vem de cruzar AlocacaoDiaria.recursoId
 * (=idTemporario) com RecursoTemporarioCenario.contratacaoId (as faixas
 * de recurso temporário nunca carregam contratacaoId próprio - ver
 * recursoTemporario.ts). Terceirização não produz horasUsadas (a
 * unidade sintética "1/dia" não é horas de máquina reais) - sua
 * Contratacao só pode ter abrangencia por_periodo_completo/
 * valor_fixo_unico, já GARANTIDO por validarDecisoesTerceirizacao antes
 * de qualquer cálculo (avaliarCenario chama essa validação primeiro) -
 * as duas ignoram horasUsadasPorContratacaoId por definição
 * (calcularCustoContratacoes), então não precisam de nenhum tratamento
 * especial aqui.
 */
function calcularCustoCenario(
  decisoes: DecisoesCenario,
  resultados: ReadonlyMap<string, { alocacoes: { contratacaoId: string | null; recursoId: string; horasMaquina: number }[] }>,
) {
  const contratacaoIdPorIdTemporario = new Map(
    decisoes.recursosTemporarios.map((rt) => [rt.recursoTemporario.idTemporario, rt.recursoTemporario.contratacaoId]),
  );

  const horasUsadasPorContratacaoId = new Map<string, number>();
  function somar(contratacaoId: string, horas: number) {
    horasUsadasPorContratacaoId.set(contratacaoId, (horasUsadasPorContratacaoId.get(contratacaoId) ?? 0) + horas);
  }

  for (const resultado of resultados.values()) {
    for (const alocacao of resultado.alocacoes) {
      if (alocacao.contratacaoId !== null) {
        somar(alocacao.contratacaoId, alocacao.horasMaquina);
        continue;
      }
      const contratacaoIdTemporario = contratacaoIdPorIdTemporario.get(alocacao.recursoId);
      if (contratacaoIdTemporario !== undefined) {
        somar(contratacaoIdTemporario, alocacao.horasMaquina);
      }
    }
  }

  return calcularCustoContratacoes({
    contratacoes: decisoes.contratacoes,
    horasUsadasPorContratacaoId,
  });
}

/**
 * Avalia 1 cenário completo (hora extra, terceirização, recurso
 * temporário/freelancer - combináveis livremente entre operações
 * diferentes do mesmo cenário) sobre a base já carregada - pura, sem
 * I/O. Roda o Calculador Reverso conjunto (que por sua vez roda o
 * escalonador 1x por candidata testada) e, com o resultado, custeia as
 * contratações referenciadas pelas alocações realmente produzidas.
 */
export function avaliarCenario(
  base: BaseCenarios,
  decisoes: DecisoesCenario,
  grade: GradeCompartilhada,
): ResultadoAvaliacaoCenario {
  validarDecisoesTerceirizacao(decisoes);

  const ocorrenciasTemplate = construirOcorrenciasEscalonaveis(base, grade.datasGradeCompartilhada[0], decisoes);
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
    const custoSemUso = calcularCustoCenario(decisoes, new Map());
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

  const custo = calcularCustoCenario(decisoes, resultadosVencedores);

  return { ...resultadoBusca, custoAdicionalTotal: custo.custoTotal, custoPorContratacaoId: custo.custoPorContratacaoId };
}
