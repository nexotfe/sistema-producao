// 4d - Monta o resultado final da simulação na MESMA granularidade em
// que o Motor decide: 1 item por OPERAÇÃO do roteiro (bomOperacaoId),
// nunca consolidado por recurso. Ver Princípio de Persistência da
// Simulação Comercial, seção 18 da arquitetura - qualquer consolidação
// por recurso é uma visão derivada (SUM/GROUP BY em consulta), nunca a
// fonte primária.
//
// Sem "use client": simularCapacidadeProjeto e aprovarSimulacaoComercial
// recebem o client Supabase por parâmetro - portável entre o preview
// no navegador (client da sessão do browser) e a revalidação
// autoritativa no servidor (client da sessão do servidor, PAD-008,
// seções 7-8). aprovarSimulacaoComercial chama a RPC v1
// (aprovar_projeto_com_simulacao) e continua existindo só como
// caminho de rollback - o fluxo novo usa a Server Action + RPC v2, não
// esta função.
import type { SupabaseClient } from "@supabase/supabase-js";
import { prepararEntradasMotor } from "./prepararEntradasMotor";
import { executarMotorAvaliacaoSequencial } from "./motorAvaliacaoSequencial";

export interface ItemSimulacaoOperacao {
  bomOperacaoId: string;
  recursoOriginalId: string;
  /** NULL quando NENHUM recurso (original nem compatível) comportou a operação inteira - déficit total. Nunca "preenchido com o original" para forçar um valor. */
  recursoConsideradoId: string | null;
  /** NULL exatamente quando recursoConsideradoId é NULL (déficit total) - ver constraint simulacao_comercial_itens_motivo_consistente_chk. */
  motivoConsideracao: "ORIGINAL" | "COMPATIBILIDADE" | null;
  /** Horas necessárias desta operação especificamente - não agregado por recurso. */
  necessario: number;
  /** Valores do recurso_considerado_id, no momento da simulação - denormalizados: linhas diferentes que compartilham o mesmo recurso repetem o mesmo valor. NULL em déficit total (recursoConsideradoId null): não há recurso considerado para essas capacidades se referirem - o original foi tentado e recusado, não aceito. */
  capacidadeBruta: number | null;
  capacidadeEfetiva: number | null;
  capacidadeDisponivel: number | null;
  comprometido: number | null;
  livre: number | null;
  /** Déficit desta operação: 0 se algum recurso a comportou inteira, ou igual a necessario se nenhum comportou (operações são indivisíveis). */
  deficit: number;
}

export interface ResultadoSimulacao {
  itensPorOperacao: ItemSimulacaoOperacao[];
}

/**
 * Roda o Motor e monta o resultado por operação, sem persistir.
 * Separado de aprovarSimulacao() para permitir uma futura tela de
 * "pré-visualização" (rodar a simulação sem aprovar o projeto).
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

  const itensPorOperacao: ItemSimulacaoOperacao[] = resultadosOperacoes.map((item) => {
    // Déficit total: nenhum recurso (original nem compatível)
    // comportou a operação inteira - o Motor não decidiu um recurso
    // considerado real. recursoConsideradoId/motivoConsideracao ficam
    // NULL (propagados como estão), e os 5 campos de
    // capacidade/comprometido/livre também ficam NULL - NÃO buscamos a
    // capacidade do recurso original como substituto: ele foi tentado e
    // RECUSADO nessa operação, reportar a capacidade dele aqui como se
    // fosse "a capacidade considerada" seria enganoso.
    if (item.recursoConsideradoId === null) {
      return {
        bomOperacaoId: item.bomOperacaoId,
        recursoOriginalId: item.recursoOriginalId,
        recursoConsideradoId: null,
        motivoConsideracao: null,
        necessario: item.tempoNecessarioHoras,
        capacidadeBruta: null,
        capacidadeEfetiva: null,
        capacidadeDisponivel: null,
        comprometido: null,
        livre: null,
        deficit: item.tempoNecessarioHoras,
      };
    }

    const capacidade = capacidadePorRecurso[item.recursoConsideradoId];
    if (!capacidade) {
      throw new Error(
        `Capacidade não preparada para o recurso ${item.recursoConsideradoId} - inconsistência interna entre preparação de entradas e resultado do Motor.`,
      );
    }

    const comprometidoRecurso = entradas.comprometido[item.recursoConsideradoId] ?? 0;
    const livre = Math.max(capacidade.capacidadeDisponivel - comprometidoRecurso, 0);

    return {
      bomOperacaoId: item.bomOperacaoId,
      recursoOriginalId: item.recursoOriginalId,
      recursoConsideradoId: item.recursoConsideradoId,
      motivoConsideracao: item.motivoConsideracao,
      necessario: item.tempoNecessarioHoras,
      capacidadeBruta: capacidade.capacidadeBruta,
      capacidadeEfetiva: capacidade.capacidadeEfetiva,
      capacidadeDisponivel: capacidade.capacidadeDisponivel,
      comprometido: comprometidoRecurso,
      livre,
      deficit: 0,
    };
  });

  return { itensPorOperacao };
}

/**
 * Wrapper fino sobre aprovar_projeto_com_simulacao - so mapeia
 * camelCase -> snake_case e chama a RPC. NAO roda o Motor: recebe
 * `resultado` ja calculado (o mesmo que o usuario revisou na tela, via
 * simularCapacidadeProjeto na acao de "Simular"). DEC-002: a aprovacao
 * persiste exatamente o resultado exibido, nunca um recalculo feito
 * silenciosamente aqui dentro - a revalidacao (rodar o Motor de novo
 * para comparar) e responsabilidade de quem chama esta funcao, nao
 * dela.
 */
export async function aprovarSimulacaoComercial(
  client: SupabaseClient,
  params: {
    projetoId: string;
    resultado: ResultadoSimulacao;
    cenarioDemanda: string;
    modoProducao: string;
    dataNecessidade: string;
    margemSegurancaDias: number;
    janelaInicio: string;
    janelaFim: string;
  },
): Promise<{ simulacaoComercialId: string }> {
  const { data, error } = await client.rpc("aprovar_projeto_com_simulacao", {
    p_projeto_id: params.projetoId,
    p_cenario_demanda: params.cenarioDemanda,
    p_modo_producao: params.modoProducao,
    p_data_necessidade: params.dataNecessidade,
    p_margem_seguranca_dias: params.margemSegurancaDias,
    p_janela_inicio: params.janelaInicio,
    p_janela_fim: params.janelaFim,
    p_itens: params.resultado.itensPorOperacao.map((item) => ({
      bom_operacao_id: item.bomOperacaoId,
      recurso_original_id: item.recursoOriginalId,
      recurso_considerado_id: item.recursoConsideradoId,
      motivo_consideracao: item.motivoConsideracao,
      necessario: item.necessario,
      capacidade_bruta: item.capacidadeBruta,
      capacidade_efetiva: item.capacidadeEfetiva,
      capacidade_disponivel: item.capacidadeDisponivel,
      comprometido: item.comprometido,
      livre: item.livre,
      deficit: item.deficit,
    })),
  });

  if (error) {
    throw new Error(`Erro ao aprovar projeto com simulação: ${error.message}`);
  }

  return { simulacaoComercialId: data as string };
}
