// Camada de apresentação da Simulação de Capacidade - traduz o
// resultado cru do Motor (UUIDs) para algo exibível (descrição da
// operação, nome dos recursos), consultando bom_operacoes e
// recursos_produtivos pelos IDs envolvidos. Não recalcula nada do
// Motor, só enriquece para exibição - reutilizável por qualquer tela
// futura que precise do mesmo resultado legível.
// Sem "use client" - recebe o client Supabase por parâmetro, por
// consistência com o resto da cadeia.
//
// Entrega 2 (distribuição parcial): cada operação vira hierárquica -
// uma linha por distribuição (recurso participante), não mais um único
// "recurso considerado" por operação.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultadoSimulacao } from "./executarSimulacao";

export interface DistribuicaoParaExibicao {
  recursoNome: string;
  origem: "ORIGINAL" | "COMPATIBILIDADE";
  capacidadeBrutaPeriodo: number;
  produtividadeConsiderada: number;
  capacidadeEfetiva: number;
  comprometidoInicial: number;
  capacidadeDisponivelInicial: number;
  capacidadeDisponivelAntes: number;
  horasPadraoAlocadas: number;
  horasMaquinaEstimadas: number;
  capacidadeDisponivelDepois: number;
}

export interface OperacaoParaExibicao {
  bomOperacaoId: string;
  operacaoOrdem: number;
  operacaoDescricao: string;
  recursoOriginalNome: string;
  /** 0..N - vazio quando a operação está em déficit total. */
  distribuicoes: DistribuicaoParaExibicao[];
  necessario: number;
  deficit: number;
}

type BomOperacaoRow = { id: string; ordem: number; descricao: string };
type RecursoRow = { id: string; nome: string; codigo: string };

function formatarRecurso(recurso: RecursoRow): string {
  return `${recurso.codigo} — ${recurso.nome}`;
}

/**
 * Enriquece o resultado cru de simularCapacidadeProjeto com descrição
 * da operação e nome dos recursos, para exibição. A ordem do array
 * retornado é a MESMA de resultado.itensPorOperacao - essa ordem já é
 * a ordem correta e determinística estabelecida pelo Motor (por item
 * de projeto, depois por bom_operacoes.ordem dentro de cada item - ver
 * prepararEntradasMotor.ts). Não reordenamos aqui por "ordem" bruto:
 * como ordem só é única DENTRO de um mesmo BOM
 * (unique(empresa_id, bom_id, ordem)), um projeto com múltiplos itens
 * (múltiplos BOMs) pode ter operações de itens diferentes com o mesmo
 * número de ordem - ordenar globalmente por esse número misturaria
 * itens distintos de forma incorreta. A consulta a bom_operacoes abaixo
 * usa ORDER BY explícito mesmo assim, como defesa em profundidade
 * contra depender da ordem natural de retorno do banco. A ordem das
 * distribuições DENTRO de cada operação também é preservada como o
 * Motor decidiu (original primeiro, depois compatíveis por prioridade).
 */
export async function prepararResultadoParaExibicao(
  client: SupabaseClient,
  resultado: ResultadoSimulacao,
): Promise<OperacaoParaExibicao[]> {
  const bomOperacaoIds = Array.from(
    new Set(resultado.itensPorOperacao.map((item) => item.bomOperacaoId)),
  );

  if (bomOperacaoIds.length === 0) {
    return [];
  }

  const recursoIds = Array.from(
    new Set(
      resultado.itensPorOperacao.flatMap((item) => [
        item.recursoOriginalId,
        ...item.distribuicoes.map((distribuicao) => distribuicao.recursoId),
      ]),
    ),
  );

  const { data: operacoesData, error: erroOperacoes } = await client
    .from("bom_operacoes")
    .select("id,ordem,descricao")
    .in("id", bomOperacaoIds)
    .order("ordem", { ascending: true });

  if (erroOperacoes) {
    throw new Error(
      `Erro ao consultar bom_operacoes para exibição: ${erroOperacoes.message}`,
    );
  }

  const { data: recursosData, error: erroRecursos } = await client
    .from("recursos_produtivos")
    .select("id,nome,codigo")
    .in("id", recursoIds.length > 0 ? recursoIds : [""]);

  if (erroRecursos) {
    throw new Error(
      `Erro ao consultar recursos_produtivos para exibição: ${erroRecursos.message}`,
    );
  }

  const operacaoPorId = new Map<string, BomOperacaoRow>(
    (operacoesData ?? []).map((operacao) => [operacao.id, operacao as BomOperacaoRow]),
  );
  const recursoPorId = new Map<string, RecursoRow>(
    (recursosData ?? []).map((recurso) => [recurso.id, recurso as RecursoRow]),
  );

  function nomeDoRecurso(recursoId: string): string {
    const recurso = recursoPorId.get(recursoId);
    return recurso ? formatarRecurso(recurso) : recursoId;
  }

  return resultado.itensPorOperacao.map((item) => {
    const operacao = operacaoPorId.get(item.bomOperacaoId);

    return {
      bomOperacaoId: item.bomOperacaoId,
      operacaoOrdem: operacao?.ordem ?? 0,
      operacaoDescricao: operacao?.descricao ?? `Operação ${item.bomOperacaoId}`,
      recursoOriginalNome: nomeDoRecurso(item.recursoOriginalId),
      necessario: item.necessario,
      deficit: item.deficit,
      distribuicoes: item.distribuicoes.map((distribuicao) => ({
        recursoNome: nomeDoRecurso(distribuicao.recursoId),
        origem: distribuicao.origem,
        capacidadeBrutaPeriodo: distribuicao.capacidadeBrutaPeriodo,
        produtividadeConsiderada: distribuicao.produtividadeConsiderada,
        capacidadeEfetiva: distribuicao.capacidadeEfetiva,
        comprometidoInicial: distribuicao.comprometidoInicial,
        capacidadeDisponivelInicial: distribuicao.capacidadeDisponivelInicial,
        capacidadeDisponivelAntes: distribuicao.capacidadeDisponivelAntes,
        horasPadraoAlocadas: distribuicao.horasPadraoAlocadas,
        horasMaquinaEstimadas: distribuicao.horasMaquinaEstimadas,
        capacidadeDisponivelDepois: distribuicao.capacidadeDisponivelDepois,
      })),
    };
  });
}
