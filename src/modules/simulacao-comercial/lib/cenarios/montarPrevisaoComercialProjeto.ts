// DEC-007 - previsão comercial por capacidade: camada de montagem PURA
// (sem I/O) que liga a base congelada (carregarBasePrevisaoComercial.ts)
// ao motor de cálculo (avaliarPrevisaoComercialFlexivel.ts) e compõe a
// "saída comercial" final - a única peça que faltava para reavaliar
// hora extra/temporário/antecipação de material quantas vezes for
// preciso sobre a MESMA base, nunca requisitando a rede de novo (a
// assinatura desta função nem recebe `client`).
//
// "Previsão comercial por capacidade - não é programação de PCP.":
// `tipoAnalise` é constante e literal, para que qualquer consumidor
// (interface futura) rotule a saída corretamente, sem confundir com uma
// programação real de chão de fábrica.
//
// CORREÇÃO (achada em teste visual real, projeto 260011, DEC-007): a
// disponibilidade de material do orçamento novo é POR CENÁRIO
// (`cenario.disponibilidadeMaterialOrcamentoNovo`), nunca fixa na base -
// "Cenário atual" usa a disponibilidade original, "Cenário ajustado"
// pode usar uma data negociada ANTERIOR, sem nenhuma nova consulta (a
// grade da base, construirGradeCompartilhada, já foi carregada larga o
// bastante para cobrir isso - ver comentário de carregarBasePrevisaoComercial.ts).
// A substituição de `disponivelAPartirDe` acontece SÓ nas necessidades
// do orçamento novo, em memória, por cenário - `base.compromissosConfirmados`
// nunca é tocado (material restringe só o orçamento novo, nunca
// projetos já confirmados - regra de negócio confirmada).
//
// Duas situações NUNCA chamam avaliarPrevisaoComercialFlexivel (que
// exigiria necessidadesOrcamentoNovo não-vazio e lançaria RangeError
// nesse caso) - em ambas, nenhum cálculo acontece, e os campos
// numéricos/booleanos da previsão (primeiraEntregaPossivel,
// atendeDataSolicitada, diferencaEmDias, custoAdicional) são `null`,
// nunca `false`/0: `false`/0 significaria "o cálculo rodou", o que é
// uma afirmação diferente de "não foi possível calcular":
//  1. `necessidadesOrcamentoNovo` vazio (projeto sem simulação vigente
//     ou sem itens - status "sem_necessidades", diagnóstico já
//     explicando o motivo, herdado da base).
//  2. Algum diagnóstico da base tem `bloqueiaCalculo=true` (status
//     "bloqueado_por_diagnostico").
import { avaliarPrevisaoComercialFlexivel, type ResultadoOpOrcamentoNovo } from "./avaliarPrevisaoComercialFlexivel";
import type { BasePrevisaoComercial, DiagnosticoPrevisaoComercial } from "./carregarBasePrevisaoComercial";
import type { CapacidadeExtraDia } from "./capacidadeDia";
import type { DecisaoRecursoTemporario } from "./avaliarCenario";
import type { NecessidadeCapacidadeFlexivel } from "./necessidadeCapacidadeFlexivel";
import { calcularCustoContratacoes, type Contratacao } from "./contratacao";
import { construirDetalhamentoPorRecurso, type DetalhamentoRecursoPrevisaoComercial } from "./detalhamentoCapacidadePorRecurso";
import { validarDataIso } from "./validacoes";

export type StatusPrevisaoComercial = "calculado" | "sem_necessidades" | "bloqueado_por_diagnostico";

/**
 * Soma exata de 3 categorias - nenhuma cobra a mesma contratação duas
 * vezes (cada `Contratacao.id` só existe em UM dos 3 buckets, ver
 * calcularCustoAdicional). `total` é sempre a soma dos outros 3 campos
 * quando o objeto existe - `null` (nunca 0 fingido) é o único jeito de
 * representar "não foi possível calcular o custo".
 */
export interface CustoAdicionalPrevisaoComercial {
  readonly negociacaoMaterial: number;
  readonly horaAdicional: number;
  readonly recursoTemporario: number;
  readonly total: number;
}

/**
 * Horas REALMENTE alocadas pelo motor novo (nunca o teto autorizado em
 * `cenario.capacidadeExtraAutorizada[].horasAdicionaisDisponiveis`) -
 * direto de `AlocacaoNecessidadeFlexivel.tipoCapacidade`/`.horasMaquina`,
 * a mesma fonte de `custoAdicional`. Sempre um número real quando
 * status="calculado" (soma pura, nunca pode falhar) - `null` só quando
 * status !== "calculado" (nenhum cálculo rodou).
 */
export interface CapacidadeUtilizadaPrevisaoComercial {
  readonly horaAdicionalHoras: number;
  readonly recursoTemporarioHoras: number;
}

export interface SaidaPrevisaoComercial {
  readonly dataSolicitadaCliente: string;
  readonly status: StatusPrevisaoComercial;
  readonly primeiraEntregaPossivel: string | null;
  readonly atendeDataSolicitada: boolean | null;
  /**
   * diasCivisEntre(dataSolicitadaCliente, primeiraEntregaPossivel) -
   * positivo = entrega DEPOIS da data solicitada (atraso), negativo =
   * ANTES (folga), 0 = exata. `null` quando status !== "calculado" ou
   * quando horizonteTecnico="insuficiente" (não há primeiraEntregaPossivel
   * para comparar). Tradução para linguagem comercial ("3 dias depois
   * da data solicitada") é responsabilidade da interface, fora deste
   * incremento.
   */
  readonly diferencaEmDias: number | null;
  readonly recursosQueDeterminamTermino: readonly string[];
  readonly horizonteTecnico: "suficiente" | "insuficiente" | null;
  readonly diagnosticos: readonly DiagnosticoPrevisaoComercial[];
  readonly tipoAnalise: "previsao_comercial_por_capacidade";
  /**
   * `null` = "custo não calculável" (status !== "calculado", ou
   * calcularCustoContratacoes detectou uma inconsistência real de dado -
   * ver calcularCustoAdicional) - NUNCA confundido com um custo
   * genuinamente igual a zero (ex.: "Cenário atual", que nunca autoriza
   * nenhuma alternativa, tem custoAdicional={0,0,0,total:0} de verdade,
   * calculado, não "não calculável").
   */
  readonly custoAdicional: CustoAdicionalPrevisaoComercial | null;
  readonly capacidadeUtilizada: CapacidadeUtilizadaPrevisaoComercial | null;
  /**
   * Correção de transparência (DEC-007 §6.2, achada em teste visual real -
   * projeto 260011): mesmos números de `capacidadeUtilizada`/`custoAdicional`,
   * mas por RECURSO em vez de somados em todos de uma vez - nunca uma
   * segunda fonte de verdade (construirDetalhamentoPorRecurso lê os
   * mesmos `resultadosPorOp` desta função). `[]` quando status !==
   * "calculado" (nenhuma alocação existe para detalhar).
   */
  readonly detalhamentoPorRecurso: readonly DetalhamentoRecursoPrevisaoComercial[];
}

/**
 * Entradas de UM cenário - `capacidadeExtraAutorizada`/`temporariosPorPrioridade`
 * já existiam; os 3 campos de material/custo são a correção deste
 * incremento. Tudo aqui é DADO puro (nenhuma consulta) - reavaliar com
 * valores diferentes nunca toca a rede.
 */
export interface CenarioParaPrevisaoComercial {
  readonly capacidadeExtraAutorizada: readonly CapacidadeExtraDia[];
  readonly temporariosPorPrioridade: readonly DecisaoRecursoTemporario[];
  /**
   * Data efetiva de disponibilidade de material do ORÇAMENTO NOVO neste
   * cenário - "Cenário atual" usa a disponibilidade original; "Cenário
   * ajustado" pode usar uma data negociada. Nunca afeta
   * `base.compromissosConfirmados` (já carregados com seu próprio piso,
   * resolvido em carregarBasePrevisaoComercial.ts, fora deste módulo).
   */
  readonly disponibilidadeMaterialOrcamentoNovo: string;
  /**
   * Todas as contratações referenciadas por
   * `capacidadeExtraAutorizada[].contratacaoId` ou
   * `temporariosPorPrioridade[].recursoTemporario.contratacaoId` neste
   * cenário - NUNCA a de negociação de material (essa é
   * `contratacaoNegociacaoMaterial`, cobrada à parte, sem depender de
   * horas usadas).
   */
  readonly contratacoes: readonly Contratacao[];
  /** `null` = nenhuma negociação de material configurada neste cenário (custo de negociação = 0, genuinamente calculado, nunca "não calculável"). */
  readonly contratacaoNegociacaoMaterial: Contratacao | null;
}

function diasCivisEntreDatas(dataInicio: string, dataFim: string): number {
  const [anoA, mesA, diaA] = dataInicio.split("-").map(Number);
  const [anoB, mesB, diaB] = dataFim.split("-").map(Number);
  const utcInicio = Date.UTC(anoA, mesA - 1, diaA);
  const utcFim = Date.UTC(anoB, mesB - 1, diaB);
  return Math.round((utcFim - utcInicio) / 86_400_000);
}

function resultadoSemCalculo(base: BasePrevisaoComercial, status: "sem_necessidades" | "bloqueado_por_diagnostico"): SaidaPrevisaoComercial {
  return {
    dataSolicitadaCliente: base.dataSolicitadaCliente,
    status,
    primeiraEntregaPossivel: null,
    atendeDataSolicitada: null,
    diferencaEmDias: null,
    recursosQueDeterminamTermino: [],
    horizonteTecnico: null,
    diagnosticos: base.diagnosticos,
    tipoAnalise: "previsao_comercial_por_capacidade",
    custoAdicional: null,
    capacidadeUtilizada: null,
    detalhamentoPorRecurso: [],
  };
}

/**
 * Soma pura de `horasMaquina` por `tipoCapacidade` ("adicional"/"temporario")
 * - mesma fonte de dado de `calcularCustoAdicional` (AlocacaoNecessidadeFlexivel),
 * nunca uma segunda leitura. Nunca falha (não depende de Contratacao
 * nenhuma) - por isso não devolve `null` por si só; o chamador usa
 * `null` só quando o cálculo inteiro não rodou (ver resultadoSemCalculo).
 */
function calcularCapacidadeUtilizada(resultadosPorOp: readonly ResultadoOpOrcamentoNovo[]): CapacidadeUtilizadaPrevisaoComercial {
  let horaAdicionalHoras = 0;
  let recursoTemporarioHoras = 0;
  for (const { resultado } of resultadosPorOp) {
    for (const alocacao of resultado.alocacoes) {
      if (alocacao.tipoCapacidade === "adicional") horaAdicionalHoras += alocacao.horasMaquina;
      else if (alocacao.tipoCapacidade === "temporario") recursoTemporarioHoras += alocacao.horasMaquina;
    }
  }
  return { horaAdicionalHoras, recursoTemporarioHoras };
}

/**
 * Custo adicional do cenário - NENHUMA fórmula nova: reaproveita
 * `calcularCustoContratacoes` (contratacao.ts, já usada pelo motor
 * antigo e por JanelaCapacidadeRecursos.tsx) duas vezes - uma para a
 * negociação de material (abrangência sempre fixa, "por_periodo_completo"/
 * "valor_fixo_unico" - não depende de horas, DEC-007 §10) e outra para
 * hora adicional/recurso temporário (tipicamente "por_hora_utilizada" -
 * cobrada pelas horas REALMENTE alocadas pelo motor novo, nunca pelo
 * teto autorizado - "cobrar só o efetivamente utilizado").
 *
 * `horasUsadasPorContratacaoId` vem direto de `AlocacaoNecessidadeFlexivel.contratacaoId`
 * (já preenchido pelo motor novo para "adicional"/"temporario" -
 * redeFluxoCapacidadeComercial.ts nunca deixa nulo nesses 2 casos,
 * diferente do motor antigo que precisava de um mapa auxiliar
 * idTemporario->contratacaoId) - soma direta, sem re-derivar nada.
 *
 * `null` (nunca 0 fingido) só quando `calcularCustoContratacoes`
 * detecta uma inconsistência real (contratacaoId de uma alocação sem
 * Contratacao correspondente em `cenario.contratacoes`) - nunca deveria
 * acontecer com wiring correto, mas um erro de custo nunca pode
 * derrubar a data já calculada.
 */
function calcularCustoAdicional(
  resultadosPorOp: readonly ResultadoOpOrcamentoNovo[],
  cenario: CenarioParaPrevisaoComercial,
): CustoAdicionalPrevisaoComercial | null {
  try {
    const negociacaoMaterial = cenario.contratacaoNegociacaoMaterial
      ? calcularCustoContratacoes({
          contratacoes: [cenario.contratacaoNegociacaoMaterial],
          horasUsadasPorContratacaoId: new Map(),
        }).custoTotal
      : 0;

    const horasPorContratacaoId = new Map<string, number>();
    for (const { resultado } of resultadosPorOp) {
      for (const alocacao of resultado.alocacoes) {
        if (alocacao.contratacaoId === null) continue;
        horasPorContratacaoId.set(alocacao.contratacaoId, (horasPorContratacaoId.get(alocacao.contratacaoId) ?? 0) + alocacao.horasMaquina);
      }
    }

    const { custoPorContratacaoId } = calcularCustoContratacoes({
      contratacoes: [...cenario.contratacoes],
      horasUsadasPorContratacaoId: horasPorContratacaoId,
    });

    const idsHoraAdicional = new Set(cenario.capacidadeExtraAutorizada.map((c) => c.contratacaoId));
    const idsTemporario = new Set(cenario.temporariosPorPrioridade.map((d) => d.recursoTemporario.contratacaoId));

    let horaAdicional = 0;
    let recursoTemporario = 0;
    for (const [contratacaoId, custo] of custoPorContratacaoId) {
      if (idsHoraAdicional.has(contratacaoId)) horaAdicional += custo;
      else if (idsTemporario.has(contratacaoId)) recursoTemporario += custo;
    }

    return { negociacaoMaterial, horaAdicional, recursoTemporario, total: negociacaoMaterial + horaAdicional + recursoTemporario };
  } catch {
    return null;
  }
}

/**
 * Reavaliável quantas vezes for preciso sobre a MESMA `base` - todo o
 * conteúdo de `cenario` (capacidadeExtraAutorizada/temporariosPorPrioridade/
 * disponibilidadeMaterialOrcamentoNovo/contratacoes/contratacaoNegociacaoMaterial)
 * pode variar entre chamadas sem nenhuma consulta nova; `base` nunca é
 * mutada aqui (a substituição de `disponivelAPartirDe` por cenário
 * constrói um array NOVO, nunca escreve nas necessidades congeladas da
 * base).
 */
export function montarPrevisaoComercialProjeto(base: BasePrevisaoComercial, cenario: CenarioParaPrevisaoComercial): SaidaPrevisaoComercial {
  validarDataIso(cenario.disponibilidadeMaterialOrcamentoNovo, "cenario.disponibilidadeMaterialOrcamentoNovo");

  if (base.necessidadesOrcamentoNovo.length === 0) {
    return resultadoSemCalculo(base, "sem_necessidades");
  }
  if (base.diagnosticos.some((d) => d.bloqueiaCalculo === true)) {
    return resultadoSemCalculo(base, "bloqueado_por_diagnostico");
  }

  // Disponibilidade de material é POR CENÁRIO - substitui o piso de
  // TODA necessidade do orçamento novo, uniformemente (mesma
  // granularidade já usada por carregarNecessidadesOrcamentoNovo.ts).
  // NUNCA toca base.compromissosConfirmados.
  const necessidadesComMaterialDoCenario: NecessidadeCapacidadeFlexivel[] = base.necessidadesOrcamentoNovo.map((n) => ({
    ...n,
    disponivelAPartirDe: cenario.disponibilidadeMaterialOrcamentoNovo,
  }));

  const avaliacao = avaliarPrevisaoComercialFlexivel({
    dataSolicitadaCliente: base.dataSolicitadaCliente,
    compromissosConfirmados: base.compromissosConfirmados,
    necessidadesOrcamentoNovo: necessidadesComMaterialDoCenario,
    capacidadesNormais: base.capacidadesNormais,
    capacidadeExtraAutorizada: cenario.capacidadeExtraAutorizada,
    temporariosPorPrioridade: cenario.temporariosPorPrioridade,
    datasGrade: base.datasGrade,
    diasProdutivos: base.diasProdutivos,
  });

  return {
    dataSolicitadaCliente: base.dataSolicitadaCliente,
    status: "calculado",
    primeiraEntregaPossivel: avaliacao.primeiraEntregaPossivel,
    atendeDataSolicitada: avaliacao.atendeDataSolicitada,
    diferencaEmDias:
      avaliacao.primeiraEntregaPossivel !== null
        ? diasCivisEntreDatas(base.dataSolicitadaCliente, avaliacao.primeiraEntregaPossivel)
        : null,
    recursosQueDeterminamTermino: avaliacao.recursosQueDeterminamTermino,
    horizonteTecnico: avaliacao.horizonteTecnico,
    diagnosticos: base.diagnosticos,
    tipoAnalise: "previsao_comercial_por_capacidade",
    custoAdicional: calcularCustoAdicional(avaliacao.resultadosPorOp, cenario),
    capacidadeUtilizada: calcularCapacidadeUtilizada(avaliacao.resultadosPorOp),
    detalhamentoPorRecurso: construirDetalhamentoPorRecurso({
      resultadosPorOp: avaliacao.resultadosPorOp,
      necessidades: necessidadesComMaterialDoCenario,
      capacidadeExtraAutorizada: cenario.capacidadeExtraAutorizada,
      contratacoes: cenario.contratacoes,
    }),
  };
}
