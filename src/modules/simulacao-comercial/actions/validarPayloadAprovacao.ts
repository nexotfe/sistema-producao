// Barreira de validação de entrada da aprovação autoritativa (PAD-008,
// seções 7-8) - roda antes de qualquer consulta ou cálculo na Server
// Action. TypeScript não protege esta fronteira: o payload de uma
// Server Action chega pela rede, e nada garante em runtime que ele
// respeita o tipo declarado - só essa validação garante isso.
//
// Sem biblioteca de validação: `zod` aparece em node_modules só como
// dependência transitiva do eslint-plugin-react-hooks (devDependency),
// não é dependência direta do projeto nem usado em nenhum lugar de
// src/ - não conta como "biblioteca já em uso". Adicionar zod como
// dependência direta só para isto violaria "não adicionar dependência
// nova" (a restrição mais forte do pedido) - por isso a validação
// abaixo é feita à mão, sem nenhuma lib.
import type { ItemSimulacaoOperacao, ResultadoSimulacao } from "../lib/executarSimulacao";

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MOTIVOS_VALIDOS = new Set(["ORIGINAL", "COMPATIBILIDADE"]);

// Limites de defesa (não regra de negócio) - generosos o suficiente
// para não rejeitar nenhum caso real, apertados o suficiente para
// barrar payload absurdo/abusivo.
const MAX_ITENS = 2000;
const MAX_TAMANHO_TEXTO_LIVRE = 200;
const MAX_MARGEM_SEGURANCA_DIAS = 3650;

export type PayloadAprovacao = {
  projetoId: string;
  resultado: ResultadoSimulacao;
  cenarioDemanda: string;
  modoProducao: string;
  dataNecessidade: string;
  margemSegurancaDias: number;
  janelaInicio: string;
  janelaFim: string;
  chaveIdempotencia: string;
};

export type ResultadoValidacao =
  | { valido: true; dados: PayloadAprovacao }
  | { valido: false; motivo: string };

function ehUuid(valor: unknown): valor is string {
  return typeof valor === "string" && REGEX_UUID.test(valor);
}

function ehDataIsoValida(valor: unknown): valor is string {
  if (typeof valor !== "string" || !REGEX_DATA_ISO.test(valor)) {
    return false;
  }

  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

// cenarioDemanda/modoProducao são texto livre por decisão explícita
// (ver simulacoes_comerciais.cenario_demanda/modo_producao - "não há
// tabela de configuração ainda, decisão explícita, não descuido") -
// validar como enum fechado aqui contradiria essa decisão. Só limite
// de forma (não vazio, tamanho razoável), não de conteúdo.
function ehTextoLivreValido(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    valor.trim().length > 0 &&
    valor.length <= MAX_TAMANHO_TEXTO_LIVRE
  );
}

function ehNumeroFinitoNaoNegativo(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0;
}

function temSoCamposConhecidos(objeto: object, camposConhecidos: Set<string>): boolean {
  return Object.keys(objeto).every((chave) => camposConhecidos.has(chave));
}

const CAMPOS_PAYLOAD = new Set([
  "projetoId",
  "resultado",
  "cenarioDemanda",
  "modoProducao",
  "dataNecessidade",
  "margemSegurancaDias",
  "janelaInicio",
  "janelaFim",
  "chaveIdempotencia",
]);

const CAMPOS_RESULTADO = new Set(["itensPorOperacao"]);

const CAMPOS_ITEM = new Set([
  "bomOperacaoId",
  "recursoOriginalId",
  "recursoConsideradoId",
  "motivoConsideracao",
  "necessario",
  "capacidadeBruta",
  "capacidadeEfetiva",
  "capacidadeDisponivel",
  "comprometido",
  "livre",
  "deficit",
]);

function validarItem(item: unknown): item is ItemSimulacaoOperacao {
  if (typeof item !== "object" || item === null) return false;
  if (!temSoCamposConhecidos(item, CAMPOS_ITEM)) return false;

  const registro = item as Record<string, unknown>;

  if (!ehUuid(registro.bomOperacaoId)) return false;
  if (!ehUuid(registro.recursoOriginalId)) return false;

  const recursoConsideradoId = registro.recursoConsideradoId;
  if (recursoConsideradoId !== null && !ehUuid(recursoConsideradoId)) return false;

  const motivo = registro.motivoConsideracao;
  if (motivo !== null && !MOTIVOS_VALIDOS.has(motivo as string)) return false;

  // recursoConsideradoId e motivoConsideracao são NULL juntos, sempre -
  // mesma regra que a RPC já impõe (constraint motivo_consistente_chk).
  if ((recursoConsideradoId === null) !== (motivo === null)) return false;

  if (!ehNumeroFinitoNaoNegativo(registro.necessario)) return false;
  if (!ehNumeroFinitoNaoNegativo(registro.deficit)) return false;

  const camposCapacidade = [
    registro.capacidadeBruta,
    registro.capacidadeEfetiva,
    registro.capacidadeDisponivel,
    registro.comprometido,
    registro.livre,
  ];

  if (recursoConsideradoId === null) {
    // Déficit total: os 5 campos de capacidade têm que ser NULL.
    if (camposCapacidade.some((valor) => valor !== null)) return false;
  } else if (camposCapacidade.some((valor) => !ehNumeroFinitoNaoNegativo(valor))) {
    return false;
  }

  return true;
}

export function validarPayloadAprovacao(payload: unknown): ResultadoValidacao {
  if (typeof payload !== "object" || payload === null) {
    return { valido: false, motivo: "payload não é um objeto" };
  }

  if (!temSoCamposConhecidos(payload, CAMPOS_PAYLOAD)) {
    return { valido: false, motivo: "payload com campos inesperados" };
  }

  const registro = payload as Record<string, unknown>;

  if (!ehUuid(registro.projetoId)) {
    return { valido: false, motivo: "projetoId inválido" };
  }

  if (!ehUuid(registro.chaveIdempotencia)) {
    return { valido: false, motivo: "chaveIdempotencia inválida" };
  }

  if (!ehDataIsoValida(registro.janelaInicio)) {
    return { valido: false, motivo: "janelaInicio inválida" };
  }

  if (!ehDataIsoValida(registro.janelaFim)) {
    return { valido: false, motivo: "janelaFim inválida" };
  }

  if ((registro.janelaFim as string) < (registro.janelaInicio as string)) {
    return { valido: false, motivo: "janelaFim anterior a janelaInicio" };
  }

  if (!ehDataIsoValida(registro.dataNecessidade)) {
    return { valido: false, motivo: "dataNecessidade inválida" };
  }

  if (!ehTextoLivreValido(registro.cenarioDemanda)) {
    return { valido: false, motivo: "cenarioDemanda inválido" };
  }

  if (!ehTextoLivreValido(registro.modoProducao)) {
    return { valido: false, motivo: "modoProducao inválido" };
  }

  if (
    typeof registro.margemSegurancaDias !== "number" ||
    !Number.isInteger(registro.margemSegurancaDias) ||
    registro.margemSegurancaDias < 0 ||
    registro.margemSegurancaDias > MAX_MARGEM_SEGURANCA_DIAS
  ) {
    return { valido: false, motivo: "margemSegurancaDias inválida" };
  }

  const resultado = registro.resultado;
  if (typeof resultado !== "object" || resultado === null) {
    return { valido: false, motivo: "resultado inválido" };
  }

  if (!temSoCamposConhecidos(resultado, CAMPOS_RESULTADO)) {
    return { valido: false, motivo: "resultado com campos inesperados" };
  }

  const itens = (resultado as Record<string, unknown>).itensPorOperacao;
  if (!Array.isArray(itens)) {
    return { valido: false, motivo: "itensPorOperacao não é array" };
  }

  if (itens.length === 0 || itens.length > MAX_ITENS) {
    return { valido: false, motivo: "itensPorOperacao com tamanho inválido" };
  }

  if (!itens.every(validarItem)) {
    return { valido: false, motivo: "item de itensPorOperacao inválido" };
  }

  // Rejeita bomOperacaoId duplicado ANTES do hash/persistência - cada
  // operação de roteiro só pode aparecer uma vez no resultado (mesma
  // granularidade "1 item por operação" da Arquitetura Vigente,
  // seção 18). Duplicata aqui poderia inflar necessário/déficit ou
  // confundir o hash de idempotência.
  const bomOperacaoIdsVistos = new Set<string>();
  for (const item of itens as ItemSimulacaoOperacao[]) {
    if (bomOperacaoIdsVistos.has(item.bomOperacaoId)) {
      return { valido: false, motivo: "itensPorOperacao com bomOperacaoId duplicado" };
    }
    bomOperacaoIdsVistos.add(item.bomOperacaoId);
  }

  return {
    valido: true,
    dados: {
      projetoId: registro.projetoId as string,
      resultado: resultado as ResultadoSimulacao,
      cenarioDemanda: registro.cenarioDemanda as string,
      modoProducao: registro.modoProducao as string,
      dataNecessidade: registro.dataNecessidade as string,
      margemSegurancaDias: registro.margemSegurancaDias as number,
      janelaInicio: registro.janelaInicio as string,
      janelaFim: registro.janelaFim as string,
      chaveIdempotencia: registro.chaveIdempotencia as string,
    },
  };
}
