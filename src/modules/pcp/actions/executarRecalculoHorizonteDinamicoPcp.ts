// PCP-B1-HORIZONTE: núcleo testável do recálculo com horizonte dinâmico
// - extraído sem "use server" (mesmo princípio estrutural de
// orquestrarMovimentoPrioridadePcp.ts/orquestrarSolicitacaoCalculoPcp.ts),
// dependências injetadas, sem I/O real aqui dentro. moverPrioridadeProjetoPcpAction.ts
// só monta as dependências REAIS (service client, Worker, relógio).
//
// Fase 1 (estimativa) + Fase 2 (execução real + verificação + ampliação
// sob orçamento) - ver cabeçalho de moverPrioridadeProjetoPcpAction.ts
// para o raciocínio completo. Nenhum teto fixo de dias (7/90/365/400) -
// o único critério de parada é o orçamento de tempo (margemRestanteMs)
// ou a confirmação de que a grade é suficiente.
import {
  estimarDiasProdutivosNecessariosPcp,
  type IngredientesParaEstimativaHorizontePcp,
} from "../lib/motor/estimarHorizonteNecessarioPcp";
import { resolverGradeProdutivaNecessariaPcp, type ResultadoGradeProdutivaPcp } from "../lib/motor/ampliarGradeProdutivaPcp";
import type { ResultadoCalculoMotorSupervisionado } from "./orquestrarSolicitacaoCalculoPcp";
import type { ResultadoRecalculoConsultivoPosMovimento } from "./orquestrarMovimentoPrioridadePcp";

/** Fração do tempo restante reservada à sondagem de calendário em cada tentativa - nunca um valor fixo de ms, proporcional ao que falta. */
export const FRACAO_ORCAMENTO_SONDAGEM = 0.15;
export const PISO_ORCAMENTO_SONDAGEM_MS = 1_500;

export interface DependenciasRecalculoHorizonteDinamicoPcp {
  /** Ingredientes reais (ocorrências/dependências/candidatos) - independentes da grade de datas (ver montarIngredientesMotorPcp.ts). */
  montarIngredientesEstimativa: () => Promise<IngredientesParaEstimativaHorizontePcp>;
  resolverGradeProdutiva: (params: {
    dataInicio: string;
    diasProdutivosNecessarios: number;
    prazoFinalMs: number;
  }) => Promise<ResultadoGradeProdutivaPcp>;
  executarCalculoMotor: (datasGradeCompartilhada: string[]) => Promise<ResultadoCalculoMotorSupervisionado>;
  agoraMs: () => number;
  /** MAX_DURATION_FUNCAO_MS - (agoraMs() - inicioOrcamentoMs) - MARGEM_FINALIZACAO_MS, recalculado a cada chamada (nunca memorizado). */
  margemRestanteMs: () => number;
  limiteMinimoViavelMs: number;
  dataInicio: string;
}

export async function executarRecalculoHorizonteDinamicoPcp(
  deps: DependenciasRecalculoHorizonteDinamicoPcp,
): Promise<ResultadoRecalculoConsultivoPosMovimento> {
  let ingredientesEstimativa: IngredientesParaEstimativaHorizontePcp;
  try {
    ingredientesEstimativa = await deps.montarIngredientesEstimativa();
  } catch (erro) {
    return { ok: false, motivo: "falha_interna", detalhe: erro instanceof Error ? erro.message : String(erro) };
  }

  let diasProdutivosAlvo = estimarDiasProdutivosNecessariosPcp(ingredientesEstimativa);
  let resultadoAnterior: Map<string, { deficit: number; dataFimReal: string | null }> | null = null;

  for (;;) {
    const margemAgora = deps.margemRestanteMs();
    if (margemAgora < deps.limiteMinimoViavelMs) {
      return {
        ok: false,
        motivo: "horizonte_nao_confirmado_dentro_do_orcamento",
        detalhe: "orçamento de tempo esgotado antes de confirmar a grade de cálculo.",
      };
    }

    const resultadoGrade = await deps.resolverGradeProdutiva({
      dataInicio: deps.dataInicio,
      diasProdutivosNecessarios: diasProdutivosAlvo,
      prazoFinalMs: deps.agoraMs() + Math.max(margemAgora * FRACAO_ORCAMENTO_SONDAGEM, PISO_ORCAMENTO_SONDAGEM_MS),
    });
    if (!resultadoGrade.ok) {
      return {
        ok: false,
        motivo: "horizonte_nao_confirmado_dentro_do_orcamento",
        detalhe: `sondagem de calendário esgotou o orçamento antes de confirmar ${resultadoGrade.diasProdutivosNecessarios} dias produtivos (encontrados: ${resultadoGrade.diasProdutivosEncontrados}, janela corrida testada: ${resultadoGrade.ultimaJanelaCorridaTestada}).`,
      };
    }

    const resultadoMotor = await deps.executarCalculoMotor(resultadoGrade.datasGradeCompartilhada);
    if (!resultadoMotor.ok) {
      // Falha CONFIRMADA (ou estado desconhecido) do próprio Motor -
      // nunca mascarada por este laço, repassada como está (o
      // orquestrador já sabe tratar cada motivo).
      return resultadoMotor;
    }

    const diasProdutivosDaGrade = resultadoMotor.entrada.diasProdutivos;
    const ultimoDiaProdutivo = diasProdutivosDaGrade[diasProdutivosDaGrade.length - 1] ?? null;

    const algumNoLimiteDaGrade =
      ultimoDiaProdutivo !== null &&
      resultadoMotor.operacoes.some(
        (op) => op.deficitResidualHorasPadrao > 0 && (op.dataFimReal === null || op.dataFimReal >= ultimoDiaProdutivo),
      );

    if (!algumNoLimiteDaGrade) {
      // Sem sinal de horizonte insuficiente - aceito como resultado
      // final (todo item concluído, ou déficit real que não
      // melhoraria com mais dias).
      return resultadoMotor;
    }

    const resultadoAtual = new Map(
      resultadoMotor.operacoes.map((op) => [op.opId, { deficit: op.deficitResidualHorasPadrao, dataFimReal: op.dataFimReal }]),
    );

    if (resultadoAnterior) {
      const semMudancaAlguma = [...resultadoAtual.entries()].every(([opId, atual]) => {
        const anterior = resultadoAnterior!.get(opId);
        return anterior !== undefined && anterior.deficit === atual.deficit && anterior.dataFimReal === atual.dataFimReal;
      });
      if (semMudancaAlguma) {
        // Ampliar não mudou NADA - não insiste cegamente. Reporta
        // incerteza genuína, nunca presume déficit real nem horizonte
        // insuficiente.
        return {
          ok: false,
          motivo: "horizonte_nao_confirmado_dentro_do_orcamento",
          detalhe: "ampliar a grade não alterou nenhum resultado - não foi possível confirmar se é déficit real ou horizonte insuficiente.",
        };
      }
    }

    resultadoAnterior = resultadoAtual;
    diasProdutivosAlvo = Math.max(diasProdutivosAlvo, 1) * 2;
  }
}
