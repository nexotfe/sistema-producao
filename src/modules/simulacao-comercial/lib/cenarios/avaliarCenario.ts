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
  type ResultadoOcorrenciaEscalonada,
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

/**
 * Negociação com fornecedor para antecipar a chegada/disponibilidade de
 * um material - a 4ª alternativa do 8b (DEC-007 §6.2.4/§6.2.7). Ao
 * contrário de hora extra/terceirização/recurso temporário (que
 * adicionam ou substituem CAPACIDADE), esta altera a JANELA PRODUTIVA em
 * si: a ocorrência referenciada não pode começar antes da disponibilidade
 * vigente (ver construirOcorrenciasEscalonaveis/maiorData) - efeito real
 * na busca D*, não só no diagnóstico/exibição (calculadorReversoConjunto.ts
 * também respeita esse piso, ver `buscarDataInicioMaisTardiaViavel`).
 *
 * A disponibilidade ORIGINAL não é campo desta decisão - vem de
 * `BaseCenarios.restricaoMaterialPorChave` (DEC-007 §6.2.7, correção de
 * auditoria: um metadado dentro da decisão deixava o cenário-base SEM
 * NENHUM piso, produzindo `diasGanhosVsBase` negativo mesmo após negociar
 * com sucesso - errado). O cenário-base (sem esta decisão) já respeita o
 * piso original automaticamente, via `base.restricaoMaterialPorChave`;
 * esta decisão só existe para SUBSTITUIR esse piso por um mais cedo.
 */
export interface DecisaoAntecipacaoMaterial {
  /** A ocorrência cujo início mínimo passa a respeitar a nova disponibilidade do material. */
  chave: ChaveOcorrencia;
  /**
   * Nova data de disponibilidade, após negociar - SUBSTITUI (não
   * combina via max) o piso de `base.restricaoMaterialPorChave` para
   * esta ocorrência; o resultado ainda passa por
   * `max(piso ativo, candidata testada)` como qualquer outro piso (ver
   * construirOcorrenciasEscalonaveis). Precisa ser ESTRITAMENTE anterior
   * ao piso original em `base.restricaoMaterialPorChave` para esta chave
   * (validarDecisoesAntecipacaoMaterial rejeita igual, posterior, ou
   * ausência de piso original para negociar - "não há o que antecipar").
   */
  dataDisponibilidadeAntecipada: string;
  contratacaoId: string;
}

export interface DecisoesCenario {
  /** Capacidade extra autorizada NESTE cenário - hora extra e/ou sábado/domingo/feriado. */
  capacidadeExtra: CapacidadeExtraDia[];
  /** Contratações referenciadas por CapacidadeExtraDia.contratacaoId, DecisaoTerceirizacao.contratacaoId, RecursoTemporarioCenario.contratacaoId ou DecisaoAntecipacaoMaterial.contratacaoId - custeio de todas neste cenário. */
  contratacoes: Contratacao[];
  terceirizacoes: DecisaoTerceirizacao[];
  recursosTemporarios: DecisaoRecursoTemporario[];
  antecipacoesMaterial: DecisaoAntecipacaoMaterial[];
}

/**
 * Nem terceirização nem antecipação de material produzem `horasUsadas`
 * reais (a unidade sintética "1/dia" da terceirização - ver
 * `criarCandidatoTerceirizado` - não é hora de máquina; antecipação de
 * material não tem candidato/alocação própria alguma, só desloca
 * dataInicioJanela). Por isso, para as duas, só as 2 abrangências cujo
 * valor depende exclusivamente de `Contratacao.valor` (nunca de uso)
 * são aceitas - qualquer uma que dependesse de horas ou de
 * `datas.length` correndo o risco de o CHAMADOR informar um número que
 * não bate com um total não verificável aqui é rejeitada explicitamente,
 * nunca resolvida como custo 0 silencioso:
 * - `por_periodo_completo` - cobrado uma vez, valor fixo.
 * - `valor_fixo_unico` - idêntico no cálculo, só muda o rótulo.
 * Rejeitadas: `por_hora_utilizada` (não há horas reais para medir) e
 * `por_dia_contratado` (dependeria de `datas.length` bater com um total
 * que este módulo não pode verificar sozinho).
 */
const ABRANGENCIAS_SEM_USO_REAL: ReadonlySet<AbrangenciaContratacao> = new Set([
  "por_periodo_completo",
  "valor_fixo_unico",
]);

/**
 * Valida, ANTES de qualquer cálculo, que toda decisão de `itens`
 * referencia uma Contratacao existente em decisoes.contratacoes (nunca
 * uma referência solta, que resultaria em custo 0 silencioso) e que sua
 * abrangencia é uma das aceitas para alternativas sem uso real
 * mensurável (ver ABRANGENCIAS_SEM_USO_REAL). Compartilhada entre
 * terceirização e antecipação de material - mesma classe de bug, mesma
 * correção, só o rótulo do erro muda.
 */
function validarContratacoesSemUsoReal(
  itens: readonly { chave: ChaveOcorrencia; contratacaoId: string }[],
  decisoes: DecisoesCenario,
  rotulo: string,
): void {
  const contratacaoPorId = new Map(decisoes.contratacoes.map((c) => [c.id, c]));

  for (const item of itens) {
    const contratacao = contratacaoPorId.get(item.contratacaoId);
    if (!contratacao) {
      throw new RangeError(
        `${rotulo} inválida: contratacaoId="${item.contratacaoId}" (ocorrência "${chaveOcorrenciaParaString(item.chave)}") não corresponde a nenhuma Contratacao em decisoes.contratacoes - sem ela, o custo desta ${rotulo.toLowerCase()} seria 0 silenciosamente.`,
      );
    }
    if (!ABRANGENCIAS_SEM_USO_REAL.has(contratacao.abrangencia)) {
      throw new RangeError(
        `${rotulo} inválida: contratação "${contratacao.id}" (ocorrência "${chaveOcorrenciaParaString(item.chave)}") usa abrangencia="${contratacao.abrangencia}" - ${rotulo.toLowerCase()} só aceita "por_periodo_completo" ou "valor_fixo_unico" (valor fixo, independente de uso), nunca "por_hora_utilizada" (sem horas de máquina reais) nem "por_dia_contratado" (dependeria de datas.length bater com um total não verificável aqui).`,
      );
    }
  }
}

function validarDecisoesTerceirizacao(decisoes: DecisoesCenario): void {
  validarContratacoesSemUsoReal(decisoes.terceirizacoes, decisoes, "Terceirização");
}

/**
 * Além da validação de contratação/abrangência (ver
 * validarContratacoesSemUsoReal), exige que exista um piso ORIGINAL
 * registrado em `base.restricaoMaterialPorChave` para a ocorrência (sem
 * ele, não há "antecipar" coisa nenhuma - a antecipação existe para
 * SUBSTITUIR um piso já conhecido, nunca para inventar um do zero) e que
 * a nova data seja ESTRITAMENTE anterior a esse piso original - igual ou
 * posterior contradiria o próprio nome do campo (negociar para MELHORAR,
 * nunca para piorar ou empatar silenciosamente).
 */
function validarDecisoesAntecipacaoMaterial(decisoes: DecisoesCenario, base: BaseCenarios): void {
  validarContratacoesSemUsoReal(decisoes.antecipacoesMaterial, decisoes, "Antecipação de material");

  for (const antecipacao of decisoes.antecipacoesMaterial) {
    const chaveStr = chaveOcorrenciaParaString(antecipacao.chave);
    const disponibilidadeOriginal = base.restricaoMaterialPorChave[chaveStr];
    if (disponibilidadeOriginal === undefined) {
      throw new RangeError(
        `Antecipação de material inválida (ocorrência "${chaveStr}"): não há nenhum piso original registrado em base.restricaoMaterialPorChave para esta ocorrência - sem uma disponibilidade original conhecida, não há o que antecipar.`,
      );
    }
    if (antecipacao.dataDisponibilidadeAntecipada >= disponibilidadeOriginal) {
      throw new RangeError(
        `Antecipação de material inválida (ocorrência "${chaveStr}"): dataDisponibilidadeAntecipada="${antecipacao.dataDisponibilidadeAntecipada}" não é ANTERIOR ao piso original ("${disponibilidadeOriginal}", base.restricaoMaterialPorChave) - igual ou posterior não é uma antecipação (nenhum ganho real negociado).`,
      );
    }
  }
}

/**
 * Cada contratação pertence a EXATAMENTE 1 categoria de alternativa
 * (hora_extra/sabado_domingo_feriado, terceirizacao, recurso_temporario)
 * - nunca contabilizada em duas ao mesmo tempo (custoPorAlternativa,
 * prepararResumoCenarioParaExibicao.ts, depende dessa garantia para
 * atribuição inequívoca; sem ela, o mesmo custo poderia aparecer
 * duplicado em 2 baldes, ou silenciosamente só no primeiro checado).
 * Reaproveitar o MESMO contratacaoId várias vezes DENTRO da mesma
 * categoria continua permitido (ex.: capacidadeExtra em vários dias
 * apontando para a mesma contratação) - só a mistura ENTRE categorias é
 * rejeitada.
 */
function validarUnicidadeContratacoesPorCategoria(decisoes: DecisoesCenario): void {
  const categoriaPorContratacaoId = new Map<string, string>();

  function registrar(contratacaoId: string, categoria: string): void {
    const categoriaExistente = categoriaPorContratacaoId.get(contratacaoId);
    if (categoriaExistente !== undefined && categoriaExistente !== categoria) {
      throw new RangeError(
        `Contratação "${contratacaoId}" referenciada em mais de 1 categoria de alternativa ("${categoriaExistente}" e "${categoria}") - cada contratação pertence a exatamente 1 alternativa, nunca contabilizada em duas ao mesmo tempo.`,
      );
    }
    categoriaPorContratacaoId.set(contratacaoId, categoria);
  }

  for (const c of decisoes.capacidadeExtra) registrar(c.contratacaoId, "hora_extra");
  for (const t of decisoes.terceirizacoes) registrar(t.contratacaoId, "terceirizacao");
  for (const rt of decisoes.recursosTemporarios) registrar(rt.recursoTemporario.contratacaoId, "recurso_temporario");
  for (const am of decisoes.antecipacoesMaterial) registrar(am.contratacaoId, "antecipacao_material");
}

/** Maior das 2 datas ISO (comparação lexicográfica = cronológica em YYYY-MM-DD). */
function maiorData(a: string, b: string): string {
  return a > b ? a : b;
}

export interface GradeCompartilhada {
  /** Dias corridos, ordenados, cobrindo desde antes do início até bem depois do prazo - mesma grade para todas as candidatas do Calculador Reverso. */
  datasGradeCompartilhada: string[];
  /** Subconjunto de datasGradeCompartilhada, ascendentes, do piso técnico até prazoInterno (inclusive) - candidatas testadas de trás para frente. */
  datasCandidatas: string[];
  prazoInterno: string;
}

/**
 * Cópia plana, congelada (Object.freeze - imutabilidade real, não só de
 * tipo) de 1 alocação diária. Campos `readonly` no tipo E congelados em
 * execução - as duas camadas de proteção, nunca só uma.
 */
export interface AlocacaoDiariaCenario {
  readonly data: string;
  readonly natureza: NaturezaCapacidade;
  readonly contratacaoId: string | null;
  readonly horasMaquina: number;
  readonly horasPadrao: number;
  readonly recursoId: string;
}

/**
 * Resultado por ocorrência, achatado e congelado para exibição/teste/
 * futura persistência - nunca o Map interno do escalonador (que só é
 * imutável em tempo de compilação, não em execução) nem os objetos que
 * ele produziu (mesmo que hoje não sejam mutados depois de criados,
 * este contrato não deve depender disso continuar verdade para
 * sempre).
 */
export interface ResultadoOcorrenciaCenario {
  readonly chave: ChaveOcorrencia;
  readonly status: "concluida" | "bloqueada_por_deficit" | "bloqueada_por_predecessora";
  readonly dataInicioReal: string | null;
  readonly dataFimReal: string | null;
  readonly deficitResidualHorasPadrao: number;
  readonly alocacoes: readonly AlocacaoDiariaCenario[];
  readonly terceirizada: boolean;
  /** Não-nulo se e somente se terceirizada=true. */
  readonly prazoDiasCorridosTerceirizacao: number | null;
  /**
   * candidatoIdsPorPrioridade desta ocorrência (recurso original +
   * compatíveis + temporários aplicáveis, ou o candidato sintético de
   * terceirização) - recursos que foram CONSIDERADOS/oferecidos ao
   * escalonador, mesmo que insuficientes ou nunca usados. Nunca
   * confundir com os recursos efetivamente USADOS - esses vêm de
   * `alocacoes[].recursoId` (um subconjunto, possivelmente vazio, de
   * `recursosConsiderados`). Existe principalmente para diagnóstico de
   * cenários inviáveis: "quais recursos foram tentados antes do déficit".
   */
  readonly recursosConsiderados: readonly string[];
}

export type ResultadoAvaliacaoCenario = ResultadoBuscaDStar & {
  custoAdicionalTotal: number;
  custoPorContratacaoId: Map<string, number>;
  /**
   * viavel/viavel_no_limite: a candidata vencedora, reexecutada (mesma
   * lógica de sempre). prazo_inviavel: a candidata que produziu
   * exatamente `dataFimReal` (busca dedicada, replay de
   * buscarDataInicioMaisTardiaViavel - ver encontrarTentativaPrazoInviavel)
   * - IMPORTANTE: por definição de `melhorConclusaoTardia` dentro do
   * Calculador Reverso, essa candidata teve TODAS as finais concluídas
   * (só mais tarde que o prazo) - `deficitResidualHorasPadrao` será 0
   * em todo item; o problema aqui é ATRASO (`diasCivisDeAtraso`, já no
   * nível superior), não falta de capacidade. horizonte_tecnico_excedido:
   * a candidata mais generosa (datasCandidatas[0], a mais cedo) -
   * NENHUMA candidata concluiu neste estado, então esta é só UM exemplo
   * representativo (não provadamente o "melhor" - não monotonicidade,
   * DEC-007 §8.1), mas é o que mostra o déficit real de capacidade mais
   * claramente. dados_insuficientes: [] - a `chave` sem nenhum
   * candidato já vem no próprio ResultadoBuscaDStar, sem precisar de
   * detalhamento adicional.
   */
  resultadosPorOcorrencia: readonly ResultadoOcorrenciaCenario[];
  /**
   * true quando resultadosPorOcorrencia vem de uma tentativa
   * DIAGNÓSTICA (estado != viavel/viavel_no_limite) - a melhor tentativa
   * relevante para EXPLICAR a inviabilidade, nunca uma programação
   * aceita. Quem exibe isso NUNCA pode rotular como "Conclusão
   * estimada" nem qualquer linguagem de compromisso - só como
   * diagnóstico. false nos estados viavel/viavel_no_limite E em
   * dados_insuficientes (onde resultadosPorOcorrencia fica vazio).
   */
  resultadosSaoDiagnostico: boolean;
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
 * as opções internas, tentado só se nada interno bastar. Antecipação de
 * material, ao contrário das outras 3, NÃO é exclusiva de terceirização
 * nem de mais nada - aplica-se como piso de `dataInicioJanela` em
 * QUALQUER ocorrência (terceirizada ou não), porque mesmo uma operação
 * terceirizada pode depender de material antes de começar.
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

  const antecipacaoPorChave = new Map<string, DecisaoAntecipacaoMaterial>();
  for (const a of decisoes.antecipacoesMaterial) {
    const chaveStr = chaveOcorrenciaParaString(a.chave);
    if (antecipacaoPorChave.has(chaveStr)) {
      throw new RangeError(
        `Antecipação de material duplicada: a ocorrência "${chaveStr}" tem mais de uma DecisaoAntecipacaoMaterial neste cenário - qual delas é a real?`,
      );
    }
    antecipacaoPorChave.set(chaveStr, a);
  }

  // "Erro explícito, nunca ignorado silenciosamente" (mesma disciplina
  // do resto de lib/cenarios/): uma DecisaoTerceirizacao/
  // DecisaoAntecipacaoMaterial apontando para uma chave que não existe
  // em base.ocorrencias é dado órfão - quase sempre um bug de quem
  // montou o cenário (chave errada, ocorrência de outra base) -
  // detectado abaixo, depois do .map, comparando o que foi de fato
  // consumido contra o que foi declarado.
  const chavesConsumidas = new Set<string>();
  const chavesComAntecipacaoConsumidas = new Set<string>();

  const ocorrenciasEscalonaveis = base.ocorrencias.map(({ ocorrencia, necessarioHorasPadrao, recursoOriginalId }) => {
    const chaveStr = chaveOcorrenciaParaString(ocorrencia.chave);
    const terceirizacao = terceirizacaoPorChave.get(chaveStr);
    const antecipacao = antecipacaoPorChave.get(chaveStr);
    if (antecipacao) chavesComAntecipacaoConsumidas.add(chaveStr);
    // Piso de material ATIVO para esta ocorrência: a decisão de
    // antecipação (quando presente) SUBSTITUI o piso original da base -
    // nunca combinado via max() com ele (max(original, antecipada) só
    // devolveria o original, já que antecipada é sempre anterior, por
    // validação - "substituir" é o próprio propósito da decisão). Sem
    // decisão, o piso original da base já vale sozinho - é ele quem
    // garante que o cenário-base também respeita a disponibilidade
    // conhecida do material, não só o cenário com decisão (DEC-007
    // §6.2.7).
    const pisoMaterialAtivo = antecipacao?.dataDisponibilidadeAntecipada ?? base.restricaoMaterialPorChave[chaveStr];
    const dataInicioJanelaEfetiva = pisoMaterialAtivo !== undefined ? maiorData(dataInicioJanela, pisoMaterialAtivo) : dataInicioJanela;

    if (terceirizacao) {
      chavesConsumidas.add(chaveStr);
      return {
        chave: ocorrencia.chave,
        projetoId: base.projetoId,
        necessarioHorasPadrao: terceirizacao.prazoDiasCorridos,
        candidatoIdsPorPrioridade: [candidatoTerceirizadoId(chaveStr)],
        ehOrcamentoNovo: true,
        dataInicioJanela: dataInicioJanelaEfetiva,
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
      dataInicioJanela: dataInicioJanelaEfetiva,
    };
  });

  for (const chaveStr of terceirizacaoPorChave.keys()) {
    if (!chavesConsumidas.has(chaveStr)) {
      throw new RangeError(
        `Terceirização órfã: DecisaoTerceirizacao referencia a ocorrência "${chaveStr}", que não existe em base.ocorrencias deste cenário.`,
      );
    }
  }
  for (const chaveStr of antecipacaoPorChave.keys()) {
    if (!chavesComAntecipacaoConsumidas.has(chaveStr)) {
      throw new RangeError(
        `Antecipação de material órfã: DecisaoAntecipacaoMaterial referencia a ocorrência "${chaveStr}", que não existe em base.ocorrencias deste cenário.`,
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
 * Cópia congelada de ChaveOcorrencia - Object.freeze no objeto pai
 * (ResultadoOcorrenciaCenario) é SUPERFICIAL, não alcança `chave` (um
 * objeto aninhado) nem `chave.caminhoBomItemIds` (um array dentro
 * dele). Sem isso, os dois continuariam mutáveis mesmo com o resultado
 * "congelado" por fora - congela cada nível explicitamente.
 */
function copiarECongelarChave(chave: ChaveOcorrencia): ChaveOcorrencia {
  return Object.freeze({
    projetoItemId: chave.projetoItemId,
    produtoRaizId: chave.produtoRaizId,
    caminhoBomItemIds: Object.freeze([...chave.caminhoBomItemIds]),
    bomOperacaoId: chave.bomOperacaoId,
  });
}

/**
 * Achata o Map interno do escalonador (mutável em execução, mesmo que
 * tipado ReadonlyMap) para uma lista plana e congelada de dados puros -
 * cópia de cada campo (inclusive `chave`, congelada em profundidade -
 * ver copiarECongelarChave), `Object.freeze` em cada alocação, em cada
 * `alocacoes[]` e no array final. Nunca reexpõe o Map nem os objetos
 * originais do escalonador. Ordenada explicitamente por
 * chaveOcorrenciaParaString - nunca depende da ordem de inserção do
 * Map (determinística hoje, mas não é um contrato que este módulo deva
 * expor ao chamador).
 */
function construirResultadosPorOcorrencia(
  resultados: ReadonlyMap<
    string,
    {
      chave: ChaveOcorrencia;
      status: "concluida" | "bloqueada_por_deficit" | "bloqueada_por_predecessora";
      dataInicioReal: string | null;
      dataFimReal: string | null;
      deficitResidualHorasPadrao: number;
      alocacoes: { data: string; natureza: NaturezaCapacidade; contratacaoId: string | null; horasMaquina: number; horasPadrao: number; recursoId: string }[];
    }
  >,
  decisoes: DecisoesCenario,
  ocorrenciasTemplate: readonly OcorrenciaEscalonavel[],
): readonly ResultadoOcorrenciaCenario[] {
  const terceirizacaoPorChave = new Map(decisoes.terceirizacoes.map((t) => [chaveOcorrenciaParaString(t.chave), t]));
  const candidatosPorChaveStr = new Map(
    ocorrenciasTemplate.map((oc) => [chaveOcorrenciaParaString(oc.chave), oc.candidatoIdsPorPrioridade]),
  );

  const lista: ResultadoOcorrenciaCenario[] = [];
  for (const resultado of resultados.values()) {
    const chaveStr = chaveOcorrenciaParaString(resultado.chave);
    const terceirizacao = terceirizacaoPorChave.get(chaveStr);
    const recursosConsiderados = Object.freeze([...(candidatosPorChaveStr.get(chaveStr) ?? [])]);

    const alocacoes = Object.freeze(
      resultado.alocacoes.map((a) =>
        Object.freeze({
          data: a.data,
          natureza: a.natureza,
          contratacaoId: a.contratacaoId,
          horasMaquina: a.horasMaquina,
          horasPadrao: a.horasPadrao,
          recursoId: a.recursoId,
        }),
      ),
    );

    lista.push(
      Object.freeze({
        chave: copiarECongelarChave(resultado.chave),
        status: resultado.status,
        dataInicioReal: resultado.dataInicioReal,
        dataFimReal: resultado.dataFimReal,
        deficitResidualHorasPadrao: resultado.deficitResidualHorasPadrao,
        alocacoes,
        terceirizada: terceirizacao !== undefined,
        prazoDiasCorridosTerceirizacao: terceirizacao?.prazoDiasCorridos ?? null,
        recursosConsiderados,
      }),
    );
  }

  lista.sort((a, b) => {
    const strA = chaveOcorrenciaParaString(a.chave);
    const strB = chaveOcorrenciaParaString(b.chave);
    return strA < strB ? -1 : strA > strB ? 1 : 0;
  });

  return Object.freeze(lista);
}

type ResultadosEscalonador = ReadonlyMap<string, ResultadoOcorrenciaEscalonada>;

/**
 * Reexecuta o escalonador para 1 candidata específica - ocorrências-raiz
 * recebem `dataInicioJanela = max(piso já no template, candidata)`
 * (mesma regra de `montarOcorrenciasParaCandidato` dentro de
 * calculadorReversoConjunto.ts - "resultado oficial e detalhamento usam
 * a mesma regra", DEC-007 §6.2.4: sem isso, um piso de antecipação de
 * material aplicado em `construirOcorrenciasEscalonaveis` seria
 * silenciosamente apagado aqui no replay), registroCandidatos sempre
 * FRESCO (isolamento entre tentativas, nunca reaproveitado). Usado tanto
 * para reconstruir a candidata vencedora (viável) quanto para
 * diagnóstico (inviável).
 */
function replayCandidata(params: {
  ocorrenciasTemplate: OcorrenciaEscalonavel[];
  chavesRaiz: ChaveOcorrencia[];
  dependencias: BaseCenarios["dependencias"];
  criarRegistroCandidatos: () => ReadonlyMap<string, CandidatoComCapacidadeDiaria>;
  datasGradeCompartilhada: string[];
  dataCandidata: string;
}): ResultadosEscalonador {
  const { ocorrenciasTemplate, chavesRaiz, dependencias, criarRegistroCandidatos, datasGradeCompartilhada, dataCandidata } = params;

  const ocorrenciasParaCandidata = ocorrenciasTemplate.map((oc) =>
    chavesRaiz.some((raiz) => chaveOcorrenciaParaString(raiz) === chaveOcorrenciaParaString(oc.chave))
      ? { ...oc, dataInicioJanela: maiorData(oc.dataInicioJanela, dataCandidata) }
      : oc,
  );

  return escalonarConjuntoComFilaDeProntos({
    ocorrencias: ocorrenciasParaCandidata,
    dependencias,
    registroCandidatos: criarRegistroCandidatos(),
    datasGradeCompartilhada,
    criterioPrioridadeDeNegocio: PRIORIDADE_UNICA,
  });
}

/**
 * prazo_inviavel: buscarDataInicioMaisTardiaViavel já encontrou
 * `dataFimRealAlvo` (a MELHOR/menor conclusão tardia entre as
 * candidatas que concluíram POR COMPLETO - ver melhorConclusaoTardia
 * em calculadorReversoConjunto.ts), mas não expõe QUAL candidata
 * produziu isso. Refaz a mesma varredura de trás para frente (mesma
 * ordem do Calculador Reverso), parando na primeira candidata cujas
 * finais TODAS concluem com a maior data-fim batendo exatamente com o
 * valor já decidido - nunca uma busca nova, é a reconstrução do
 * resultado já determinado (mesma disciplina do replay do caminho
 * viável). Garantido encontrar por construção (o próprio algoritmo
 * originou esse valor a partir deste mesmo conjunto de candidatas) -
 * o retorno vazio no fim é só defensivo.
 */
function encontrarTentativaPrazoInviavel(params: {
  ocorrenciasTemplate: OcorrenciaEscalonavel[];
  chavesRaiz: ChaveOcorrencia[];
  chavesFinais: ChaveOcorrencia[];
  dependencias: BaseCenarios["dependencias"];
  criarRegistroCandidatos: () => ReadonlyMap<string, CandidatoComCapacidadeDiaria>;
  datasGradeCompartilhada: string[];
  datasCandidatas: string[];
  dataFimRealAlvo: string;
}): ResultadosEscalonador {
  const { chavesFinais, datasCandidatas, dataFimRealAlvo, ...resto } = params;

  for (let indice = datasCandidatas.length - 1; indice >= 0; indice--) {
    const resultados = replayCandidata({ ...resto, dataCandidata: datasCandidatas[indice] });

    let todasConcluidas = true;
    let maiorDataFim: string | null = null;
    for (const chaveFinal of chavesFinais) {
      const r = resultados.get(chaveOcorrenciaParaString(chaveFinal));
      if (!r || r.status !== "concluida") {
        todasConcluidas = false;
        break;
      }
      if (r.dataFimReal !== null && (maiorDataFim === null || r.dataFimReal > maiorDataFim)) {
        maiorDataFim = r.dataFimReal;
      }
    }

    if (todasConcluidas && maiorDataFim === dataFimRealAlvo) {
      return resultados;
    }
  }

  return new Map();
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
  validarDecisoesAntecipacaoMaterial(decisoes, base);
  validarUnicidadeContratacoesPorCategoria(decisoes);

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

  if (resultadoBusca.estado !== "viavel" && resultadoBusca.estado !== "viavel_no_limite") {
    const custoSemUso = calcularCustoCenario(decisoes, new Map());

    // Diagnóstico: prazo_inviavel e horizonte_tecnico_excedido ganham a
    // melhor tentativa relevante (ver encontrarTentativaPrazoInviavel e
    // o comentário de ResultadoAvaliacaoCenario) - dados_insuficientes
    // fica vazio, a chave sem candidato já vem em resultadoBusca.
    let resultadosDiagnostico: ResultadosEscalonador = new Map();

    if (resultadoBusca.estado === "prazo_inviavel") {
      resultadosDiagnostico = encontrarTentativaPrazoInviavel({
        ocorrenciasTemplate,
        chavesRaiz,
        chavesFinais,
        dependencias: base.dependencias,
        criarRegistroCandidatos,
        datasGradeCompartilhada: grade.datasGradeCompartilhada,
        datasCandidatas: grade.datasCandidatas,
        dataFimRealAlvo: resultadoBusca.dataFimReal,
      });
    } else if (resultadoBusca.estado === "horizonte_tecnico_excedido" && grade.datasCandidatas.length > 0) {
      resultadosDiagnostico = replayCandidata({
        ocorrenciasTemplate,
        chavesRaiz,
        dependencias: base.dependencias,
        criarRegistroCandidatos,
        datasGradeCompartilhada: grade.datasGradeCompartilhada,
        dataCandidata: grade.datasCandidatas[0],
      });
    }

    return {
      ...resultadoBusca,
      custoAdicionalTotal: custoSemUso.custoTotal,
      custoPorContratacaoId: custoSemUso.custoPorContratacaoId,
      resultadosPorOcorrencia: construirResultadosPorOcorrencia(resultadosDiagnostico, decisoes, ocorrenciasTemplate),
      resultadosSaoDiagnostico: resultadosDiagnostico.size > 0,
    };
  }

  // Custeio: horas realmente usadas por contratacaoId exige rodar de
  // novo com a candidata vencedora (a busca em si não devolve as
  // alocações do ponto viável, só a data e o resumo de viabilidade -
  // DEC-007 §8, ResultadoBuscaDStar é deliberadamente enxuto). Reexecuta
  // só 1 vez, com a MESMA dataEstimadaInicioNecessario já encontrada -
  // não é uma busca nova, é a reconstrução do resultado já decidido.
  const resultadosVencedores = replayCandidata({
    ocorrenciasTemplate,
    chavesRaiz,
    dependencias: base.dependencias,
    criarRegistroCandidatos,
    datasGradeCompartilhada: grade.datasGradeCompartilhada,
    dataCandidata: resultadoBusca.dataEstimadaInicioNecessario,
  });

  const custo = calcularCustoCenario(decisoes, resultadosVencedores);

  return {
    ...resultadoBusca,
    custoAdicionalTotal: custo.custoTotal,
    custoPorContratacaoId: custo.custoPorContratacaoId,
    resultadosPorOcorrencia: construirResultadosPorOcorrencia(resultadosVencedores, decisoes, ocorrenciasTemplate),
    resultadosSaoDiagnostico: false,
  };
}
