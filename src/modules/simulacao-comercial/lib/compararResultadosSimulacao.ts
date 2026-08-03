// DEC-002, secao "Criterio de Revalidacao": a aprovacao so e permitida
// se os campos persistidos pela RPC forem identicos entre o resultado
// exibido e a revalidacao imediatamente anterior a aprovacao.
//
// Entrega 2 (distribuição parcial): cada operação agora tem 0..N
// distribuições (uma por recurso). Comparadas por `recursoId` (chave
// única dentro da operação - garantida pela constraint
// simulacao_comercial_item_distribuicoes_recurso_unico), nunca por
// posição de array, que não tem garantia de ordem estável entre duas
// execuções independentes do mesmo cálculo. Comparação numérica usa a
// mesma tolerância de todo o módulo (EPSILON_HORAS) - a divisão nova
// (horas de máquina) é o primeiro ponto real de risco de ponto
// flutuante deste módulo; igualdade exata (`!==`) deixou de ser segura.
import type { ItemSimulacaoOperacao, DistribuicaoParaPersistencia, ResultadoSimulacao } from "./executarSimulacao";
import { numerosIguais } from "./constantesNumericas";

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

function temRecursoIdDuplicado(distribuicoes: DistribuicaoParaPersistencia[]): boolean {
  const vistos = new Set<string>();
  for (const distribuicao of distribuicoes) {
    if (vistos.has(distribuicao.recursoId)) return true;
    vistos.add(distribuicao.recursoId);
  }
  return false;
}

// Contrato persistível completo de uma distribuição - qualquer campo
// diferente (dentro da tolerância numérica) torna as distribuições não
// idênticas. Não compara `capacidadeDisponivelDepois` porque ela é
// aritmeticamente derivada de `capacidadeDisponivelAntes` e
// `horasPadraoAlocadas`, ambos já comparados - mas mesmo assim está na
// lista abaixo por completude/auditoria, já que o resultado
// revalidado é uma execução independente do zero, não uma cópia.
function distribuicoesIdenticas(
  a: DistribuicaoParaPersistencia,
  b: DistribuicaoParaPersistencia,
): boolean {
  return (
    a.origem === b.origem &&
    a.ordemConsideracao === b.ordemConsideracao &&
    numerosIguais(a.capacidadeBrutaPeriodo, b.capacidadeBrutaPeriodo) &&
    numerosIguais(a.produtividadeConsiderada, b.produtividadeConsiderada) &&
    numerosIguais(a.capacidadeEfetiva, b.capacidadeEfetiva) &&
    numerosIguais(a.comprometidoInicial, b.comprometidoInicial) &&
    numerosIguais(a.capacidadeDisponivelInicial, b.capacidadeDisponivelInicial) &&
    numerosIguais(a.capacidadeDisponivelAntes, b.capacidadeDisponivelAntes) &&
    numerosIguais(a.horasPadraoAlocadas, b.horasPadraoAlocadas) &&
    numerosIguais(a.horasMaquinaEstimadas, b.horasMaquinaEstimadas) &&
    numerosIguais(a.capacidadeDisponivelDepois, b.capacidadeDisponivelDepois)
  );
}

function compararDistribuicoes(
  anteriores: DistribuicaoParaPersistencia[],
  novas: DistribuicaoParaPersistencia[],
): boolean {
  // Array com recursoId duplicado é dado corrompido (o núcleo/persistência
  // nunca deveriam produzir isso - ver CandidatoDuplicadoError e a
  // constraint _recurso_unico) - não vira Map silenciosamente
  // descartando a duplicata, propaga como falha explícita.
  if (temRecursoIdDuplicado(anteriores) || temRecursoIdDuplicado(novas)) {
    throw new Error(
      "compararResultadosSimulacao: distribuições com recursoId duplicado - dado corrompido, não comparável.",
    );
  }

  if (anteriores.length !== novas.length) return false;

  const novasPorRecurso = new Map(novas.map((distribuicao) => [distribuicao.recursoId, distribuicao]));

  return anteriores.every((distribuicaoAnterior) => {
    const distribuicaoNova = novasPorRecurso.get(distribuicaoAnterior.recursoId);
    return distribuicaoNova !== undefined && distribuicoesIdenticas(distribuicaoAnterior, distribuicaoNova);
  });
}

/**
 * Compara dois resultados do Motor por bomOperacaoId. Operacao
 * adicionada, removida, com necessario/deficit diferente (fora da
 * tolerância numérica), ou com qualquer distribuição diferente torna os
 * resultados NAO identicos - a aprovacao so pode usar o resultado
 * revisado (o "anterior") quando identico == true.
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

    if (!numerosIguais(itemAnterior.necessario, itemNovo.necessario)) {
      diferencas.push({
        operacao: bomOperacaoId,
        campo: "necessario",
        valorAnterior: itemAnterior.necessario,
        valorNovo: itemNovo.necessario,
      });
    }

    if (!numerosIguais(itemAnterior.deficit, itemNovo.deficit)) {
      diferencas.push({
        operacao: bomOperacaoId,
        campo: "deficit",
        valorAnterior: itemAnterior.deficit,
        valorNovo: itemNovo.deficit,
      });
    }

    if (!compararDistribuicoes(itemAnterior.distribuicoes, itemNovo.distribuicoes)) {
      diferencas.push({
        operacao: bomOperacaoId,
        campo: "distribuicoes",
        valorAnterior: itemAnterior.distribuicoes,
        valorNovo: itemNovo.distribuicoes,
      });
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
