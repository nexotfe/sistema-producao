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
//
// Entrega 2 (distribuição parcial): valida só a FORMA do payload -
// inclusive das distribuições aninhadas. A correção ARITMÉTICA
// (soma das distribuições + déficit = necessário, saldo antes/depois
// coerente) não precisa ser checada aqui: a persistência real nunca usa
// os valores deste payload - orquestrarAprovacaoAutoritativa.ts sempre
// recalcula do zero no servidor e só persiste o resultado recalculado
// (revalidacaoServidor.itensPorOperacao), comparando com este payload
// só para decidir se a aprovação pode prosseguir sem exigir nova
// simulação (DEC-002). A RPC valida a cadeia matemática dos valores que
// ELA vai persistir (os recalculados), não os deste payload.
import type {
  ItemSimulacaoOperacao,
  DistribuicaoParaPersistencia,
  ResultadoSimulacao,
} from "../lib/executarSimulacao";

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const ORIGENS_VALIDAS = new Set(["ORIGINAL", "COMPATIBILIDADE"]);

// Limites de defesa (não regra de negócio) - generosos o suficiente
// para não rejeitar nenhum caso real, apertados o suficiente para
// barrar payload absurdo/abusivo.
const MAX_ITENS = 2000;
const MAX_DISTRIBUICOES_POR_ITEM = 500;
const MAX_TAMANHO_TEXTO_LIVRE = 200;
const MAX_MARGEM_SEGURANCA_DIAS = 3650;

export type PayloadAprovacao = {
  projetoId: string;
  resultado: ResultadoSimulacao;
  cenarioDemanda: string;
  modoProducao: string;
  dataNecessidade: string;
  margemSegurancaDias: number;
  /** Estimativa do orçamentista de quando o pedido do cliente será confirmado (DEC-004 v1.1) - premissa obrigatória, informada antes da simulação. */
  dataPrevistaAprovacaoPedido: string;
  /** = dataDisponibilidadeProducao calculada pelo cliente na última revalidação (PAD-008 v2.0 §17) - só para comparação; o servidor recalcula a própria e nunca persiste este valor sem revalidar (ver aprovarSimulacaoComercialAction.ts). */
  janelaInicio: string;
  /** = prazoInterno calculado pelo cliente na última revalidação - mesma ressalva de janelaInicio. */
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

function ehNumeroFinitoPositivo(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0;
}

// Mesma faixa do cadastro real (recursos_produtivos.produtividade /
// grupos_recursos.produtividade_padrao - CHECK > 0 and <= 1).
function ehProdutividadeValida(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 && valor <= 1;
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
  "dataPrevistaAprovacaoPedido",
  "janelaInicio",
  "janelaFim",
  "chaveIdempotencia",
]);

const CAMPOS_RESULTADO = new Set(["itensPorOperacao"]);

const CAMPOS_ITEM = new Set([
  "bomOperacaoId",
  "recursoOriginalId",
  "necessario",
  "deficit",
  "distribuicoes",
]);

const CAMPOS_DISTRIBUICAO = new Set([
  "recursoId",
  "origem",
  "ordemConsideracao",
  "capacidadeBrutaPeriodo",
  "produtividadeConsiderada",
  "capacidadeEfetiva",
  "comprometidoInicial",
  "capacidadeDisponivelInicial",
  "capacidadeDisponivelAntes",
  "horasPadraoAlocadas",
  "horasMaquinaEstimadas",
  "capacidadeDisponivelDepois",
]);

function validarDistribuicao(distribuicao: unknown): distribuicao is DistribuicaoParaPersistencia {
  if (typeof distribuicao !== "object" || distribuicao === null) return false;
  if (!temSoCamposConhecidos(distribuicao, CAMPOS_DISTRIBUICAO)) return false;

  const registro = distribuicao as Record<string, unknown>;

  if (!ehUuid(registro.recursoId)) return false;
  if (typeof registro.origem !== "string" || !ORIGENS_VALIDAS.has(registro.origem)) return false;

  // ordemConsideracao: 0 exatamente para ORIGINAL, > 0 exatamente para
  // COMPATIBILIDADE (prioridade cadastrada, sempre > 0 por
  // recurso_produtivo_compatibilidades_prioridade_check) - mistura
  // entre os dois é payload inconsistente.
  if (
    typeof registro.ordemConsideracao !== "number" ||
    !Number.isInteger(registro.ordemConsideracao) ||
    (registro.origem === "ORIGINAL" && registro.ordemConsideracao !== 0) ||
    (registro.origem === "COMPATIBILIDADE" && registro.ordemConsideracao <= 0)
  ) {
    return false;
  }

  if (!ehNumeroFinitoNaoNegativo(registro.capacidadeBrutaPeriodo)) return false;
  if (!ehProdutividadeValida(registro.produtividadeConsiderada)) return false;
  if (!ehNumeroFinitoNaoNegativo(registro.capacidadeEfetiva)) return false;
  if (!ehNumeroFinitoNaoNegativo(registro.comprometidoInicial)) return false;
  if (!ehNumeroFinitoNaoNegativo(registro.capacidadeDisponivelInicial)) return false;
  if (!ehNumeroFinitoNaoNegativo(registro.capacidadeDisponivelAntes)) return false;
  if (!ehNumeroFinitoPositivo(registro.horasPadraoAlocadas)) return false;
  if (!ehNumeroFinitoPositivo(registro.horasMaquinaEstimadas)) return false;
  if (!ehNumeroFinitoNaoNegativo(registro.capacidadeDisponivelDepois)) return false;

  return true;
}

function validarItem(item: unknown): item is ItemSimulacaoOperacao {
  if (typeof item !== "object" || item === null) return false;
  if (!temSoCamposConhecidos(item, CAMPOS_ITEM)) return false;

  const registro = item as Record<string, unknown>;

  if (!ehUuid(registro.bomOperacaoId)) return false;
  if (!ehUuid(registro.recursoOriginalId)) return false;
  if (!ehNumeroFinitoNaoNegativo(registro.necessario)) return false;
  if (!ehNumeroFinitoNaoNegativo(registro.deficit)) return false;

  const distribuicoes = registro.distribuicoes;
  if (!Array.isArray(distribuicoes)) return false;
  if (distribuicoes.length > MAX_DISTRIBUICOES_POR_ITEM) return false;
  if (!distribuicoes.every(validarDistribuicao)) return false;

  // recursoId duplicado dentro da mesma operação é dado corrompido -
  // a constraint simulacao_comercial_item_distribuicoes_recurso_unico
  // rejeitaria na persistência, mas barrar aqui evita chegar até lá.
  const recursoIdsVistos = new Set<string>();
  for (const distribuicao of distribuicoes as DistribuicaoParaPersistencia[]) {
    if (recursoIdsVistos.has(distribuicao.recursoId)) return false;
    recursoIdsVistos.add(distribuicao.recursoId);
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

  if (!ehDataIsoValida(registro.dataPrevistaAprovacaoPedido)) {
    return { valido: false, motivo: "dataPrevistaAprovacaoPedido inválida" };
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
  // seção 18). Duplicata aqui poderia confundir o hash de idempotência.
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
      dataPrevistaAprovacaoPedido: registro.dataPrevistaAprovacaoPedido as string,
      janelaInicio: registro.janelaInicio as string,
      janelaFim: registro.janelaFim as string,
      chaveIdempotencia: registro.chaveIdempotencia as string,
    },
  };
}
