// 4d - Monta o resultado final da simulação na MESMA granularidade em
// que o Motor decide: 1 item por OPERAÇÃO do roteiro (bomOperacaoId),
// nunca consolidado por recurso. Ver Princípio de Persistência da
// Simulação Comercial, seção 18 da arquitetura - qualquer consolidação
// por recurso é uma visão derivada (SUM/GROUP BY em consulta), nunca a
// fonte primária.
//
// Sem "use client": simularCapacidadeProjeto recebe o client Supabase
// por parâmetro - portável entre o preview no navegador (client da
// sessão do browser) e a revalidação autoritativa no servidor
// (PAD-008, seções 7-8).
//
// Entrega 2 (distribuição parcial): cada operação pode agora ter 0..N
// distribuições (uma por recurso que participou). O núcleo
// (motorAvaliacaoSequencial.ts) só sabe recursoId/origem/horas
// alocadas/saldo antes-depois - é aqui, na camada de enriquecimento,
// que cada distribuição ganha a base completa de cálculo (capacidade
// bruta do período, produtividade considerada, capacidade efetiva,
// comprometido inicial, capacidade disponível inicial) e o valor
// derivado (horas de máquina = horas-padrão ÷ produtividade) - nunca
// recalculados a partir de cadastros que podem mudar depois, sempre a
// partir do mesmo capacidadePorRecurso que o núcleo usou nesta
// execução.
import type { SupabaseClient } from "@supabase/supabase-js";
import { prepararEntradasMotor } from "./prepararEntradasMotor";
import { executarMotorAvaliacaoSequencial } from "./motorAvaliacaoSequencial";

export type MotivoConsideracao = "ORIGINAL" | "COMPATIBILIDADE";

export interface DistribuicaoParaPersistencia {
  recursoId: string;
  origem: MotivoConsideracao;
  /** 0 para ORIGINAL; prioridade cadastrada (sempre > 0) para COMPATIBILIDADE. Só para persistência/auditoria. */
  ordemConsideracao: number;
  /** Dias produtivos × capacidade diária do recurso, no período desta simulação - sem produtividade, sem comprometido. */
  capacidadeBrutaPeriodo: number;
  /** Fração 0-1 usada para esta alocação. */
  produtividadeConsiderada: number;
  /** = capacidadeBrutaPeriodo × produtividadeConsiderada. */
  capacidadeEfetiva: number;
  /** calcular_comprometido_v2 para este recurso, antes desta simulação consumir qualquer saldo. */
  comprometidoInicial: number;
  /** = max(0, capacidadeEfetiva - comprometidoInicial). */
  capacidadeDisponivelInicial: number;
  /** Saldo do recurso imediatamente antes desta alocação específica (pode ser menor que capacidadeDisponivelInicial se outra operação desta mesma simulação já consumiu o recurso). */
  capacidadeDisponivelAntes: number;
  /** Horas-padrão desta fatia. */
  horasPadraoAlocadas: number;
  /** = horasPadraoAlocadas ÷ produtividadeConsiderada. Campo derivado, só para exibição/auditoria - nunca reentra no cálculo de capacidade remanescente. */
  horasMaquinaEstimadas: number;
  /** = capacidadeDisponivelAntes - horasPadraoAlocadas. */
  capacidadeDisponivelDepois: number;
}

export interface ItemSimulacaoOperacao {
  bomOperacaoId: string;
  recursoOriginalId: string;
  /** Horas necessárias desta operação especificamente - não agregado por recurso. */
  necessario: number;
  /** 0..N alocações, uma por recurso que participou desta operação. Vazio = déficit total. */
  distribuicoes: DistribuicaoParaPersistencia[];
  /** = necessario - soma(distribuicoes.horasPadraoAlocadas). Sempre >= 0. */
  deficit: number;
}

export interface ResultadoSimulacao {
  itensPorOperacao: ItemSimulacaoOperacao[];
}

/**
 * Roda o Motor e monta o resultado por operação, sem persistir.
 * Separado da persistência para permitir a tela de pré-visualização
 * (rodar a simulação sem aprovar o projeto).
 */
export async function simularCapacidadeProjeto(
  client: SupabaseClient,
  empresaId: string,
  projetoId: string,
  janelaInicio: string,
  janelaFim: string,
): Promise<ResultadoSimulacao> {
  const { entradas, capacidadePorRecurso } = await prepararEntradasMotor(
    client,
    empresaId,
    projetoId,
    janelaInicio,
    janelaFim,
  );

  const resultadosOperacoes = executarMotorAvaliacaoSequencial(entradas);

  const itensPorOperacao: ItemSimulacaoOperacao[] = resultadosOperacoes.map((item) => ({
    bomOperacaoId: item.bomOperacaoId,
    recursoOriginalId: item.recursoOriginalId,
    necessario: item.tempoNecessarioHoras,
    deficit: item.deficit,
    distribuicoes: item.distribuicoes.map((distribuicao) => {
      const capacidade = capacidadePorRecurso[distribuicao.recursoId];
      if (!capacidade) {
        throw new Error(
          `Capacidade não preparada para o recurso ${distribuicao.recursoId} - inconsistência interna entre preparação de entradas e resultado do Motor.`,
        );
      }

      return {
        recursoId: distribuicao.recursoId,
        origem: distribuicao.origem,
        ordemConsideracao: distribuicao.ordemConsideracao,
        capacidadeBrutaPeriodo: capacidade.capacidadeBruta,
        produtividadeConsiderada: capacidade.produtividade,
        capacidadeEfetiva: capacidade.capacidadeEfetiva,
        comprometidoInicial: capacidade.comprometidoInicial,
        capacidadeDisponivelInicial: capacidade.capacidadeDisponivelInicial,
        capacidadeDisponivelAntes: distribuicao.capacidadeDisponivelAntes,
        horasPadraoAlocadas: distribuicao.horasPadraoAlocadas,
        horasMaquinaEstimadas: distribuicao.horasPadraoAlocadas / capacidade.produtividade,
        capacidadeDisponivelDepois: distribuicao.capacidadeDisponivelDepois,
      };
    }),
  }));

  return { itensPorOperacao };
}
