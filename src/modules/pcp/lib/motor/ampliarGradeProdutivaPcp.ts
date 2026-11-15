// PCP-B1-HORIZONTE: resolve a grade real de dias CORRIDOS a partir de
// uma estimativa de dias PRODUTIVOS necessários (estimarHorizonteNecessarioPcp.ts),
// consultando o calendário real da empresa (carregarContextoCalendario,
// já existente, nunca duplicado). Sondagem por tentativas, nunca um
// teto fixo de dias corridos (requisito explícito do proprietário) - o
// único critério de parada é o ORÇAMENTO DE TEMPO desta sondagem
// (prazoFinalMs, uma fatia pequena e medida do orçamento total do
// recálculo, nunca um número de dias arbitrário) ou a confirmação de
// que já há dias produtivos suficientes.
//
// Cada tentativa recarrega o calendário do zero para uma janela maior
// (nunca mescla incrementalmente) - simplicidade deliberada desta etapa
// (sem sistema de processamento parcial), o custo é uma consulta extra
// por tentativa, aceitável frente à simplicidade.
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarContextoCalendario, resolverDiaProdutivoComContexto } from "@/modules/calendario/lib/contextoCalendario";

function somarDiasCorridos(dataIso: string, dias: number): string {
  const data = new Date(`${dataIso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** Multiplicador inicial da sondagem - só um PONTO DE PARTIDA da busca (nunca um teto): assume pelo menos 1 em cada 2 dias corridos como produtivo; se a empresa tiver menos (ex.: muitos feriados, semana de 5 dias curta), a sondagem amplia sozinha, nunca trava aqui. */
const MULTIPLICADOR_INICIAL_SONDAGEM = 2;
/** Fator de ampliação por tentativa - geométrico, para o número de tentativas crescer em log(horizonte), nunca em proporção direta a ele. */
const FATOR_AMPLIACAO_SONDAGEM = 2;

export type ResultadoGradeProdutivaPcp =
  | { ok: true; datasGradeCompartilhada: string[] }
  | {
      ok: false;
      motivo: "orcamento_esgotado_na_sondagem_de_calendario";
      diasProdutivosEncontrados: number;
      diasProdutivosNecessarios: number;
      ultimaJanelaCorridaTestada: number;
    };

export async function resolverGradeProdutivaNecessariaPcp(params: {
  client: SupabaseClient;
  empresaId: string;
  dataInicio: string;
  diasProdutivosNecessarios: number;
  /** Injetável para teste - nunca Date.now() direto dentro da função. */
  agoraMs: () => number;
  /** Teto absoluto (Date.now()) desta sondagem - fatia do orçamento total do recálculo, nunca um número de dias. */
  prazoFinalMs: number;
}): Promise<ResultadoGradeProdutivaPcp> {
  const { client, empresaId, dataInicio, diasProdutivosNecessarios, agoraMs, prazoFinalMs } = params;

  if (diasProdutivosNecessarios <= 0) {
    // Backlog vazio (ou já coberto) - grade mínima não-vazia, exigida
    // por escalonarConjuntoGenerico mesmo sem nenhuma ocorrência real.
    return { ok: true, datasGradeCompartilhada: [dataInicio] };
  }

  let janelaCorridaAtual = diasProdutivosNecessarios * MULTIPLICADOR_INICIAL_SONDAGEM;

  // Sempre tenta pelo menos 1 vez, mesmo com orçamento já apertado - só
  // decide "esgotado" DEPOIS de uma tentativa real falhar em achar dias
  // suficientes, nunca antes de tentar.
  for (;;) {
    const dataFimJanela = somarDiasCorridos(dataInicio, janelaCorridaAtual - 1);
    const contexto = await carregarContextoCalendario(client, empresaId, dataInicio, dataFimJanela);

    let diasProdutivosEncontrados = 0;
    let dataFinalGrade: string | null = null;
    for (let offset = 0; offset < janelaCorridaAtual; offset += 1) {
      const data = somarDiasCorridos(dataInicio, offset);
      if (resolverDiaProdutivoComContexto(contexto, data).produtivo) {
        diasProdutivosEncontrados += 1;
        if (diasProdutivosEncontrados >= diasProdutivosNecessarios) {
          dataFinalGrade = data;
          break;
        }
      }
    }

    if (dataFinalGrade) {
      const grade: string[] = [];
      for (let offset = 0; somarDiasCorridos(dataInicio, offset) <= dataFinalGrade; offset += 1) {
        grade.push(somarDiasCorridos(dataInicio, offset));
      }
      return { ok: true, datasGradeCompartilhada: grade };
    }

    if (agoraMs() >= prazoFinalMs) {
      return {
        ok: false,
        motivo: "orcamento_esgotado_na_sondagem_de_calendario",
        diasProdutivosEncontrados,
        diasProdutivosNecessarios,
        ultimaJanelaCorridaTestada: janelaCorridaAtual,
      };
    }

    janelaCorridaAtual *= FATOR_AMPLIACAO_SONDAGEM;
  }
}
