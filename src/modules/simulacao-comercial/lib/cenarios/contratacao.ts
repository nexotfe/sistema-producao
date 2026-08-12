// DEC-007 §10 - Fase 4: contratação como entidade - evita cobrança
// repetida de valor_fixo_unico (ou qualquer abrangência) em várias datas.
// Núcleo puro, sem I/O.
//
// Fórmula de custo por abrangência (não especificada literalmente no
// DEC-007 - decisão confirmada com o usuário antes desta implementação):
// - "por_hora_utilizada": valor × horas REALMENTE usadas (soma real de
//   consumo, informada pelo chamador via horasUsadasPorContratacaoId -
//   a origem dessa soma varia por tipo de contratação: para capacidade
//   extra em recurso real, vem de AlocacaoDiaria.contratacaoId; para
//   recurso temporário, vem de somar as alocações cujo recursoId é o
//   idTemporario e mapear para o contratacaoId do RecursoTemporarioCenario
//   - fora do escopo deste módulo, que só agrega o valor final).
// - "por_dia_contratado": valor × contratacao.datas.length - paga o dia
//   CONTRATADO (ex.: diária de máquina alugada), usado ou não nesse dia.
//   NOTA PARA A FASE 8 (interface, registrada aqui para não se perder):
//   a TELA de por_dia_contratado precisa mostrar dias contratados,
//   utilização real e ociosidade lado a lado - não só o valor monetário
//   final. O cálculo monetário em si (valor × datas.length) NÃO muda -
//   "utilização real"/"ociosidade" são dado exibido, derivado cruzando
//   `datas` com o uso real (mesma fonte de horasUsadasPorContratacaoId),
//   nunca uma fórmula de custo alternativa.
// - "por_periodo_completo" e "valor_fixo_unico": valor cobrado UMA única
//   vez, independente de datas.length ou uso real - as duas se comportam
//   de forma idêntica no cálculo (diferem só na rotulagem/relatório).
import { validarDataIso, validarHorasFinitasNaoNegativas } from "./validacoes";

export type TipoContratacao = "hora_extra" | "sabado_domingo_feriado" | "maquina_alugada" | "freelancer" | "terceirizacao";
export type AbrangenciaContratacao = "por_hora_utilizada" | "por_dia_contratado" | "por_periodo_completo" | "valor_fixo_unico";

export interface Contratacao {
  id: string;
  tipo: TipoContratacao;
  abrangencia: AbrangenciaContratacao;
  valor: number;
  moeda: string;
  fornecedorOuContratado: string;
  referenciaProposta: string | null;
  justificativa: string;
  datas: string[];
}

export interface ResultadoCustoContratacoes {
  custoTotal: number;
  /** Custo de cada contratação, uma entrada por id - nunca duplicado, mesmo se referenciada várias vezes em outro lugar do cenário. */
  custoPorContratacaoId: Map<string, number>;
}

function validarContratacao(contratacao: Contratacao): void {
  if (!Number.isFinite(contratacao.valor) || contratacao.valor < 0) {
    throw new RangeError(`Contratação "${contratacao.id}": valor precisa ser finito e não negativo - recebido: ${contratacao.valor}.`);
  }

  const datasVistas = new Set<string>();
  for (const data of contratacao.datas) {
    validarDataIso(data, `Contratação "${contratacao.id}" - data em "datas"`);
    if (datasVistas.has(data)) {
      throw new RangeError(`Contratação "${contratacao.id}": data "${data}" duplicada em "datas" - inflaria o custo de por_dia_contratado (valor × datas.length) contando o mesmo dia mais de uma vez.`);
    }
    datasVistas.add(data);
  }

  if (contratacao.abrangencia === "por_dia_contratado" && contratacao.datas.length === 0) {
    throw new RangeError(`Contratação "${contratacao.id}" (abrangencia="por_dia_contratado") precisa ter pelo menos 1 data - não há como cobrar por dia contratado sem nenhum dia.`);
  }
}

/**
 * Custo de UMA contratação, dado quantas horas foram realmente usadas
 * contra ela (só relevante para abrangencia="por_hora_utilizada" - as
 * outras 3 abrangências não dependem de uso real).
 */
function calcularCustoUnitario(contratacao: Contratacao, horasUsadas: number): number {
  switch (contratacao.abrangencia) {
    case "por_hora_utilizada":
      return contratacao.valor * horasUsadas;
    case "por_dia_contratado":
      return contratacao.valor * contratacao.datas.length;
    case "por_periodo_completo":
    case "valor_fixo_unico":
      return contratacao.valor;
    default: {
      const _exaustivo: never = contratacao.abrangencia;
      throw new RangeError(`Contratação "${contratacao.id}": abrangencia desconhecida - "${_exaustivo}".`);
    }
  }
}

/**
 * Agrega o custo de uma lista de contratações - cada `id` é cobrado
 * EXATAMENTE UMA VEZ, mesmo que a lista contenha referências indiretas
 * repetidas em outras estruturas do cenário (capacidadeExtra,
 * recursosTemporarios, terceirizações - todas apontam para um
 * contratacaoId, nunca embutem o valor de novo). Rejeita `id` duplicado
 * na própria lista - lista com duas Contratacao para o mesmo id é dado
 * inconsistente (qual delas é a "real"?), nunca resolvido silenciosamente
 * pegando a última.
 */
export function calcularCustoContratacoes(params: {
  contratacoes: Contratacao[];
  /** Horas realmente usadas por contratacaoId - só consultado para abrangencia="por_hora_utilizada"; a origem da soma é responsabilidade do chamador (ver comentário do módulo). */
  horasUsadasPorContratacaoId: ReadonlyMap<string, number>;
}): ResultadoCustoContratacoes {
  const { contratacoes, horasUsadasPorContratacaoId } = params;

  const idsVistos = new Set<string>();
  for (const contratacao of contratacoes) {
    if (idsVistos.has(contratacao.id)) {
      throw new RangeError(`Contratação duplicada: o id "${contratacao.id}" aparece mais de uma vez na lista - cada contratação deve ser cobrada uma única vez.`);
    }
    idsVistos.add(contratacao.id);
    validarContratacao(contratacao);
  }

  // horasUsadasPorContratacaoId nunca pode ter uma chave "órfã" (sem
  // Contratacao correspondente) - se ignorada silenciosamente, um
  // contratacaoId digitado errado (ou de uma contratação removida/
  // renomeada) faria essas horas somem do custo sem nenhum aviso -
  // sub-cobrança silenciosa, pior que um erro explícito.
  for (const contratacaoId of horasUsadasPorContratacaoId.keys()) {
    if (!idsVistos.has(contratacaoId)) {
      throw new RangeError(`horasUsadasPorContratacaoId contém o id "${contratacaoId}", que não existe em "contratacoes" - toda entrada precisa corresponder a uma contratação real.`);
    }
  }

  const custoPorContratacaoId = new Map<string, number>();
  let custoTotal = 0;

  for (const contratacao of contratacoes) {
    const horasUsadas = horasUsadasPorContratacaoId.get(contratacao.id) ?? 0;
    validarHorasFinitasNaoNegativas(horasUsadas, `horasUsadasPorContratacaoId["${contratacao.id}"]`);

    const custo = calcularCustoUnitario(contratacao, horasUsadas);
    if (!Number.isFinite(custo)) {
      throw new RangeError(`Contratação "${contratacao.id}": custo calculado não é finito (${custo}) - valor/horas/dias válidos individualmente ainda podem estourar ao multiplicar.`);
    }
    custoPorContratacaoId.set(contratacao.id, custo);
    custoTotal += custo;
  }

  if (!Number.isFinite(custoTotal)) {
    throw new RangeError(`custoTotal não é finito (${custoTotal}) após somar os custos individuais - possível estouro na acumulação.`);
  }

  return { custoTotal, custoPorContratacaoId };
}
