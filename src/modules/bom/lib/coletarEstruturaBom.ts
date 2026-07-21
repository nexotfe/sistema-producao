// Travessia recursiva de uma estrutura BOM - extraída da Simulação
// Comercial (Etapa 4) para ser compartilhável por qualquer consumidor
// TypeScript futuro, não só o Motor de Avaliação Sequencial de
// Capacidade.
//
// Pendência conhecida: calcular_custo_bom (SQL, function de produção já
// existente e testada) e este módulo (TypeScript) implementam a mesma
// regra de resolução de BOM ativo/travessia de subconjuntos de forma
// independente - reconciliação futura recomendada se a regra mudar,
// para evitar divergência entre cálculo de custo e Simulação Comercial.
"use client";

import { supabase } from "@/lib/supabaseClient";
import { resolverBomAtivo } from "./resolverBomAtivo";
import { OperacaoSemRecursoError, ProfundidadeMaximaBomError } from "./errors";

const PROFUNDIDADE_MAXIMA_BOM = 20;

export interface OperacaoBom {
  bomOperacaoId: string;
  recursoProdutivoId: string;
  /** Tempo desta operação para UMA unidade, em minutos (bom_operacoes.tempo_estimado_minutos). */
  tempoEstimadoMinutos: number;
  /** Quantidade acumulada até esta operação (quantidade do item de origem × quantidade de cada nível de subconjunto atravessado). */
  quantidadeAcumulada: number;
}

type BomOperacaoRow = {
  id: string;
  ordem: number;
  tempo_estimado_minutos: number;
  recurso_produtivo_id: string | null;
};

type BomItemSubconjuntoRow = {
  quantidade: number;
  componente_produto_id: string;
};

/**
 * Coleta as operações de um BOM (ordenadas por `ordem`), descendo
 * recursivamente em subconjuntos - mesmo padrão de calcular_custo_bom.
 * quantidadeAcumulada é o multiplicador (quantidade do consumidor ×
 * quantidade de cada nível de subconjunto atravessado).
 */
export async function coletarEstruturaBom(
  bomId: string,
  quantidadeAcumulada: number,
  profundidade = 0,
): Promise<OperacaoBom[]> {
  if (profundidade > PROFUNDIDADE_MAXIMA_BOM) {
    throw new ProfundidadeMaximaBomError(bomId);
  }

  const { data: operacoesData, error: erroOperacoes } = await supabase
    .from("bom_operacoes")
    .select("id,ordem,tempo_estimado_minutos,recurso_produtivo_id")
    .eq("bom_id", bomId)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("ordem", { ascending: true });

  if (erroOperacoes) {
    throw new Error(
      `Erro ao consultar bom_operacoes para bom_id=${bomId}: ${erroOperacoes.message}`,
    );
  }

  const operacoes: OperacaoBom[] = [];
  for (const op of (operacoesData ?? []) as BomOperacaoRow[]) {
    if (!op.recurso_produtivo_id) {
      throw new OperacaoSemRecursoError(op.id);
    }

    operacoes.push({
      bomOperacaoId: op.id,
      recursoProdutivoId: op.recurso_produtivo_id,
      tempoEstimadoMinutos: Number(op.tempo_estimado_minutos),
      quantidadeAcumulada,
    });
  }

  const { data: subItens, error: erroSubItens } = await supabase
    .from("bom_itens")
    .select("quantidade,componente_produto_id")
    .eq("bom_id", bomId)
    .eq("componente_tipo", "subconjunto")
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("ordem", { ascending: true });

  if (erroSubItens) {
    throw new Error(
      `Erro ao consultar bom_itens (subconjuntos) para bom_id=${bomId}: ${erroSubItens.message}`,
    );
  }

  for (const sub of (subItens ?? []) as BomItemSubconjuntoRow[]) {
    const bomFilhoId = await resolverBomAtivo(sub.componente_produto_id);
    if (bomFilhoId) {
      const operacoesFilho = await coletarEstruturaBom(
        bomFilhoId,
        quantidadeAcumulada * Number(sub.quantidade),
        profundidade + 1,
      );
      operacoes.push(...operacoesFilho);
    }
  }

  return operacoes;
}
