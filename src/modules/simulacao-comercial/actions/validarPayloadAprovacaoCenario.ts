// Barreira de validação de entrada da aprovação de cenário comercial
// (DEC-007 §6.2/Fase 8b) - roda antes de qualquer recálculo na Server
// Action. Mesmo princípio de validarPayloadAprovacao.ts (motor antigo):
// TypeScript não protege esta fronteira em runtime, e nada aqui decide
// SOZINHO se a aprovação é válida - só garante que o payload tem forma
// suficiente para o recálculo autoritativo rodar sem estourar. A
// verdade sobre prazo/horas/custo continua sendo, sempre, o que
// orquestrarAprovacaoCenarioComercial.ts recalcula do zero no servidor e
// compara (compararDadosParaAprovacaoCenario.ts) - esta validação NUNCA
// é o que decide se o cenário está certo, só se o payload é processável.
//
// Sem lib de validação (zod não é dependência direta do projeto - ver
// mesmo raciocínio em validarPayloadAprovacao.ts) - validação à mão.
//
// Escopo deliberadamente mais leve que validarPayloadAprovacao.ts nos
// campos aninhados (capacidadeExtraAutorizada/temporariosPorPrioridade/
// contratacoes): valida forma/tipo de cada campo, não every invariante
// de negócio - decisão consciente, porque a recomputação server-side
// (avaliarPrevisaoComercialFlexivel) já rejeita internamente qualquer
// combinação inconsistente com uma exceção explícita, e a comparação
// final nunca aprova algo que o servidor não recalculou identicamente.
import type { CapacidadeExtraDia, ElegibilidadeCapacidadeExtra } from "../lib/cenarios/capacidadeDia";
import type { Contratacao, TipoContratacao, AbrangenciaContratacao } from "../lib/cenarios/contratacao";
import type { DecisaoRecursoTemporario } from "../lib/cenarios/avaliarCenario";
import type { StatusPrevisaoComercial, CustoAdicionalPrevisaoComercial } from "../lib/cenarios/montarPrevisaoComercialProjeto";

const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TAMANHO_TEXTO_LIVRE = 500;
const MAX_ITENS_LISTA = 500;
const MAX_MARGEM_SEGURANCA_DIAS = 3650;

const TIPOS_CENARIO = new Set(["atual", "ajustado"]);
const STATUS_PREVISAO = new Set(["calculado", "sem_necessidades", "bloqueado_por_diagnostico"]);
const NATUREZAS_CAPACIDADE_EXTRA = new Set(["hora_extra", "sabado", "domingo", "feriado"]);
const ESCOPOS_ELEGIBILIDADE = new Set(["somente_orcamento_novo", "qualquer_projeto_do_cenario", "projetos_especificos"]);
const TIPOS_CONTRATACAO = new Set<TipoContratacao>([
  "hora_extra",
  "sabado_domingo_feriado",
  "maquina_alugada",
  "equipamento_adicional",
  "freelancer",
  "terceirizacao",
  "antecipacao_material",
]);
const ABRANGENCIAS_CONTRATACAO = new Set<AbrangenciaContratacao>([
  "por_hora_utilizada",
  "por_dia_contratado",
  "por_periodo_completo",
  "valor_fixo_unico",
]);

function ehDataIsoValida(valor: unknown): valor is string {
  if (typeof valor !== "string" || !REGEX_DATA_ISO.test(valor)) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

function ehNumeroFinito(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

function ehNumeroFinitoNaoNegativo(valor: unknown): valor is number {
  return ehNumeroFinito(valor) && valor >= 0;
}

function ehTextoNaoVazio(valor: unknown, tamanhoMaximo = MAX_TAMANHO_TEXTO_LIVRE): valor is string {
  return typeof valor === "string" && valor.trim().length > 0 && valor.length <= tamanhoMaximo;
}

function ehElegibilidadeValida(valor: unknown): valor is ElegibilidadeCapacidadeExtra {
  if (typeof valor !== "object" || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  if (typeof registro.escopo !== "string" || !ESCOPOS_ELEGIBILIDADE.has(registro.escopo)) return false;
  if (registro.escopo === "projetos_especificos") {
    return Array.isArray(registro.projetoIds) && registro.projetoIds.every((id) => typeof id === "string");
  }
  return true;
}

function ehCapacidadeExtraDiaValida(valor: unknown): valor is CapacidadeExtraDia {
  if (typeof valor !== "object" || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return (
    typeof registro.recursoId === "string" &&
    registro.recursoId.length > 0 &&
    ehDataIsoValida(registro.data) &&
    ehNumeroFinitoNaoNegativo(registro.horasAdicionaisDisponiveis) &&
    typeof registro.natureza === "string" &&
    NATUREZAS_CAPACIDADE_EXTRA.has(registro.natureza) &&
    ehElegibilidadeValida(registro.elegibilidade) &&
    typeof registro.contratacaoId === "string" &&
    registro.contratacaoId.length > 0
  );
}

function ehContratacaoValida(valor: unknown): valor is Contratacao {
  if (typeof valor !== "object" || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return (
    typeof registro.id === "string" &&
    registro.id.length > 0 &&
    typeof registro.tipo === "string" &&
    TIPOS_CONTRATACAO.has(registro.tipo as TipoContratacao) &&
    typeof registro.abrangencia === "string" &&
    ABRANGENCIAS_CONTRATACAO.has(registro.abrangencia as AbrangenciaContratacao) &&
    ehNumeroFinitoNaoNegativo(registro.valor) &&
    typeof registro.moeda === "string" &&
    typeof registro.fornecedorOuContratado === "string" &&
    (registro.referenciaProposta === null || typeof registro.referenciaProposta === "string") &&
    typeof registro.justificativa === "string" &&
    Array.isArray(registro.datas) &&
    registro.datas.length <= MAX_ITENS_LISTA &&
    registro.datas.every(ehDataIsoValida)
  );
}

function ehDecisaoRecursoTemporarioValida(valor: unknown): valor is DecisaoRecursoTemporario {
  if (typeof valor !== "object" || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  if (typeof registro.recursoTemporario !== "object" || registro.recursoTemporario === null) return false;
  const recursoTemporario = registro.recursoTemporario as Record<string, unknown>;
  return (
    typeof recursoTemporario.idTemporario === "string" &&
    typeof recursoTemporario.contratacaoId === "string" &&
    typeof recursoTemporario.recursoReferenciaId === "string" &&
    Array.isArray(recursoTemporario.disponibilidade) &&
    recursoTemporario.disponibilidade.length <= MAX_ITENS_LISTA &&
    ehNumeroFinitoNaoNegativo(registro.produtividadeReferencia)
  );
}

function ehCustoAdicionalExibidoValido(valor: unknown): valor is CustoAdicionalPrevisaoComercial {
  if (typeof valor !== "object" || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return (
    ehNumeroFinitoNaoNegativo(registro.negociacaoMaterial) &&
    ehNumeroFinitoNaoNegativo(registro.horaAdicional) &&
    ehNumeroFinitoNaoNegativo(registro.recursoTemporario) &&
    ehNumeroFinitoNaoNegativo(registro.total)
  );
}

export interface PayloadAprovacaoCenario {
  readonly projetoId: string;
  readonly tipoCenario: "atual" | "ajustado";
  readonly dataNecessidade: string;
  readonly margemSegurancaDias: number;
  readonly dataPrevistaAprovacaoPedido: string;
  readonly capacidadeExtraAutorizada: readonly CapacidadeExtraDia[];
  readonly temporariosPorPrioridade: readonly DecisaoRecursoTemporario[];
  readonly disponibilidadeMaterialNegociada: string | null;
  readonly contratacoes: readonly Contratacao[];
  readonly contratacaoNegociacaoMaterial: Contratacao | null;
  /** Estes 5 campos são o que a tela está EXIBINDO e pedindo para aprovar - comparados contra o recálculo do servidor, nunca usados diretamente na RPC. */
  readonly statusExibido: StatusPrevisaoComercial;
  readonly primeiraEntregaPossivelExibida: string | null;
  readonly diferencaEmDiasExibida: number | null;
  readonly custoAdicionalExibido: CustoAdicionalPrevisaoComercial | null;
  readonly custoTecnicoAtualExibido: number;
  readonly valorComercialAtualReferenciaExibido: number | null;
  readonly motivoSubstituicao: string | null;
}

export type ResultadoValidacaoAprovacaoCenario =
  | { valido: true; dados: PayloadAprovacaoCenario }
  | { valido: false; motivo: string };

export function validarPayloadAprovacaoCenario(payload: unknown): ResultadoValidacaoAprovacaoCenario {
  if (typeof payload !== "object" || payload === null) {
    return { valido: false, motivo: "payload não é um objeto" };
  }
  const registro = payload as Record<string, unknown>;

  if (typeof registro.projetoId !== "string" || registro.projetoId.length === 0) {
    return { valido: false, motivo: "projetoId inválido" };
  }
  if (typeof registro.tipoCenario !== "string" || !TIPOS_CENARIO.has(registro.tipoCenario)) {
    return { valido: false, motivo: "tipoCenario inválido" };
  }
  if (!ehDataIsoValida(registro.dataNecessidade)) {
    return { valido: false, motivo: "dataNecessidade inválida" };
  }
  if (
    typeof registro.margemSegurancaDias !== "number" ||
    !Number.isInteger(registro.margemSegurancaDias) ||
    registro.margemSegurancaDias < 0 ||
    registro.margemSegurancaDias > MAX_MARGEM_SEGURANCA_DIAS
  ) {
    return { valido: false, motivo: "margemSegurancaDias inválida" };
  }
  if (!ehDataIsoValida(registro.dataPrevistaAprovacaoPedido)) {
    return { valido: false, motivo: "dataPrevistaAprovacaoPedido inválida" };
  }

  if (!Array.isArray(registro.capacidadeExtraAutorizada) || registro.capacidadeExtraAutorizada.length > MAX_ITENS_LISTA) {
    return { valido: false, motivo: "capacidadeExtraAutorizada inválida" };
  }
  if (!registro.capacidadeExtraAutorizada.every(ehCapacidadeExtraDiaValida)) {
    return { valido: false, motivo: "item de capacidadeExtraAutorizada inválido" };
  }

  if (!Array.isArray(registro.temporariosPorPrioridade) || registro.temporariosPorPrioridade.length > MAX_ITENS_LISTA) {
    return { valido: false, motivo: "temporariosPorPrioridade inválida" };
  }
  if (!registro.temporariosPorPrioridade.every(ehDecisaoRecursoTemporarioValida)) {
    return { valido: false, motivo: "item de temporariosPorPrioridade inválido" };
  }

  if (registro.disponibilidadeMaterialNegociada !== null && !ehDataIsoValida(registro.disponibilidadeMaterialNegociada)) {
    return { valido: false, motivo: "disponibilidadeMaterialNegociada inválida" };
  }

  if (!Array.isArray(registro.contratacoes) || registro.contratacoes.length > MAX_ITENS_LISTA) {
    return { valido: false, motivo: "contratacoes inválida" };
  }
  if (!registro.contratacoes.every(ehContratacaoValida)) {
    return { valido: false, motivo: "item de contratacoes inválido" };
  }

  if (registro.contratacaoNegociacaoMaterial !== null && !ehContratacaoValida(registro.contratacaoNegociacaoMaterial)) {
    return { valido: false, motivo: "contratacaoNegociacaoMaterial inválida" };
  }

  if (typeof registro.statusExibido !== "string" || !STATUS_PREVISAO.has(registro.statusExibido)) {
    return { valido: false, motivo: "statusExibido inválido" };
  }
  if (registro.primeiraEntregaPossivelExibida !== null && !ehDataIsoValida(registro.primeiraEntregaPossivelExibida)) {
    return { valido: false, motivo: "primeiraEntregaPossivelExibida inválida" };
  }
  if (
    registro.diferencaEmDiasExibida !== null &&
    (typeof registro.diferencaEmDiasExibida !== "number" || !Number.isInteger(registro.diferencaEmDiasExibida))
  ) {
    return { valido: false, motivo: "diferencaEmDiasExibida inválida" };
  }
  if (registro.custoAdicionalExibido !== null && !ehCustoAdicionalExibidoValido(registro.custoAdicionalExibido)) {
    return { valido: false, motivo: "custoAdicionalExibido inválido" };
  }
  if (!ehNumeroFinitoNaoNegativo(registro.custoTecnicoAtualExibido)) {
    return { valido: false, motivo: "custoTecnicoAtualExibido inválido" };
  }
  if (registro.valorComercialAtualReferenciaExibido !== null && !ehNumeroFinitoNaoNegativo(registro.valorComercialAtualReferenciaExibido)) {
    return { valido: false, motivo: "valorComercialAtualReferenciaExibido inválido" };
  }
  if (registro.motivoSubstituicao !== null && !ehTextoNaoVazio(registro.motivoSubstituicao)) {
    return { valido: false, motivo: "motivoSubstituicao inválido" };
  }

  return {
    valido: true,
    dados: {
      projetoId: registro.projetoId,
      tipoCenario: registro.tipoCenario as "atual" | "ajustado",
      dataNecessidade: registro.dataNecessidade,
      margemSegurancaDias: registro.margemSegurancaDias,
      dataPrevistaAprovacaoPedido: registro.dataPrevistaAprovacaoPedido,
      capacidadeExtraAutorizada: registro.capacidadeExtraAutorizada as CapacidadeExtraDia[],
      temporariosPorPrioridade: registro.temporariosPorPrioridade as DecisaoRecursoTemporario[],
      disponibilidadeMaterialNegociada: registro.disponibilidadeMaterialNegociada as string | null,
      contratacoes: registro.contratacoes as Contratacao[],
      contratacaoNegociacaoMaterial: registro.contratacaoNegociacaoMaterial as Contratacao | null,
      statusExibido: registro.statusExibido as StatusPrevisaoComercial,
      primeiraEntregaPossivelExibida: registro.primeiraEntregaPossivelExibida as string | null,
      diferencaEmDiasExibida: registro.diferencaEmDiasExibida as number | null,
      custoAdicionalExibido: registro.custoAdicionalExibido as CustoAdicionalPrevisaoComercial | null,
      custoTecnicoAtualExibido: registro.custoTecnicoAtualExibido as number,
      valorComercialAtualReferenciaExibido: registro.valorComercialAtualReferenciaExibido as number | null,
      motivoSubstituicao: registro.motivoSubstituicao as string | null,
    },
  };
}
