// DEC-002, secao "Criterio de Revalidacao": a aprovacao so e permitida
// se os campos persistidos pela RPC forem identicos entre o resultado
// exibido e a revalidacao imediatamente anterior a aprovacao.
import type { ItemSimulacaoOperacao, ResultadoSimulacao } from "./executarSimulacao";

export type DiferencaSimulacao = {
  operacao: string;
  campo: string;
  valorAnterior: unknown;
  valorNovo: unknown;
};

export type ResultadoComparacaoSimulacao = {
  identico: boolean;
  diferencas: DiferencaSimulacao[];
};

// Exatamente os campos que aprovar_projeto_com_simulacao persiste em
// simulacao_comercial_itens (recurso_considerado_id, motivo_consideracao,
// deficit, necessario, e os 5 campos de capacidade) - nenhuma lista
// separada de "campos importantes" (DEC-002).
const CAMPOS_COMPARADOS: Array<keyof ItemSimulacaoOperacao> = [
  "recursoConsideradoId",
  "motivoConsideracao",
  "deficit",
  "necessario",
  "capacidadeBruta",
  "capacidadeEfetiva",
  "capacidadeDisponivel",
  "comprometido",
  "livre",
];

/**
 * Compara dois resultados do Motor por bomOperacaoId. Operacao
 * adicionada, removida, ou com qualquer campo de CAMPOS_COMPARADOS
 * diferente torna os resultados NAO identicos - a aprovacao so pode
 * usar o resultado revisado (o "anterior") quando identico == true.
 */
export function compararResultadosSimulacao(
  anterior: ResultadoSimulacao,
  novo: ResultadoSimulacao,
): ResultadoComparacaoSimulacao {
  const diferencas: DiferencaSimulacao[] = [];

  const anteriorPorId = new Map(
    anterior.itensPorOperacao.map((item) => [item.bomOperacaoId, item]),
  );
  const novoPorId = new Map(
    novo.itensPorOperacao.map((item) => [item.bomOperacaoId, item]),
  );

  for (const [bomOperacaoId, itemAnterior] of anteriorPorId) {
    const itemNovo = novoPorId.get(bomOperacaoId);

    if (!itemNovo) {
      diferencas.push({
        operacao: bomOperacaoId,
        campo: "presenca",
        valorAnterior: "presente",
        valorNovo: "removida",
      });
      continue;
    }

    for (const campo of CAMPOS_COMPARADOS) {
      if (itemAnterior[campo] !== itemNovo[campo]) {
        diferencas.push({
          operacao: bomOperacaoId,
          campo,
          valorAnterior: itemAnterior[campo],
          valorNovo: itemNovo[campo],
        });
      }
    }
  }

  for (const bomOperacaoId of novoPorId.keys()) {
    if (!anteriorPorId.has(bomOperacaoId)) {
      diferencas.push({
        operacao: bomOperacaoId,
        campo: "presenca",
        valorAnterior: "ausente",
        valorNovo: "adicionada",
      });
    }
  }

  return { identico: diferencas.length === 0, diferencas };
}
