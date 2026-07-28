// Camada de apresentação da Simulação de Capacidade - traduz o
// resultado cru do Motor (UUIDs) para algo exibível (descrição da
// operação, nome dos recursos), consultando bom_operacoes e
// recursos_produtivos pelos IDs envolvidos. Não recalcula nada do
// Motor, só enriquece para exibição - reutilizável por qualquer tela
// futura que precise do mesmo resultado legível (ex: V1.1, antes de
// aprovar).
"use client";

import { supabase } from "@/lib/supabaseClient";
import type { ResultadoSimulacao } from "./executarSimulacao";

export interface OperacaoParaExibicao {
  bomOperacaoId: string;
  operacaoOrdem: number;
  operacaoDescricao: string;
  recursoOriginalNome: string;
  /** NULL exatamente quando a operação está em déficit total - ver ItemSimulacaoOperacao.recursoConsideradoId. */
  recursoConsideradoNome: string | null;
  motivoConsideracao: "ORIGINAL" | "COMPATIBILIDADE" | null;
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
 * contra depender da ordem natural de retorno do banco.
 */
export async function prepararResultadoParaExibicao(
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
      resultado.itensPorOperacao.flatMap((item) =>
        [item.recursoOriginalId, item.recursoConsideradoId].filter(
          (id): id is string => id !== null,
        ),
      ),
    ),
  );

  const { data: operacoesData, error: erroOperacoes } = await supabase
    .from("bom_operacoes")
    .select("id,ordem,descricao")
    .in("id", bomOperacaoIds)
    .order("ordem", { ascending: true });

  if (erroOperacoes) {
    throw new Error(
      `Erro ao consultar bom_operacoes para exibição: ${erroOperacoes.message}`,
    );
  }

  const { data: recursosData, error: erroRecursos } = await supabase
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

  return resultado.itensPorOperacao.map((item) => {
    const operacao = operacaoPorId.get(item.bomOperacaoId);
    const recursoOriginal = recursoPorId.get(item.recursoOriginalId);
    const recursoConsiderado = item.recursoConsideradoId
      ? recursoPorId.get(item.recursoConsideradoId)
      : null;

    return {
      bomOperacaoId: item.bomOperacaoId,
      operacaoOrdem: operacao?.ordem ?? 0,
      operacaoDescricao: operacao?.descricao ?? `Operação ${item.bomOperacaoId}`,
      recursoOriginalNome: recursoOriginal
        ? formatarRecurso(recursoOriginal)
        : item.recursoOriginalId,
      recursoConsideradoNome: recursoConsiderado
        ? formatarRecurso(recursoConsiderado)
        : null,
      motivoConsideracao: item.motivoConsideracao,
      necessario: item.necessario,
      deficit: item.deficit,
    };
  });
}
