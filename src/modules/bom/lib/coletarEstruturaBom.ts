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
// Sem "use client" - mesma razão de resolverBomAtivo.ts: recebe o
// client Supabase por parâmetro, portável entre preview no navegador
// e revalidação autoritativa no servidor.
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverBomAtivo } from "./resolverBomAtivo";
import { OperacaoSemRecursoError, ProfundidadeMaximaBomError, SubconjuntoSemBomError } from "./errors";

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
  client: SupabaseClient,
  bomId: string,
  quantidadeAcumulada: number,
  profundidade = 0,
  /**
   * Ids dos produtos já percorridos até este BOM (raiz incluída) - só
   * usados para montar a mensagem de SubconjuntoSemBomError (resolvidos
   * para código em lote, uma única consulta, só no caminho de erro).
   * Nunca consultados no caminho feliz - custo igual ao de antes desta
   * correção.
   */
  caminhoIds: string[] = [],
): Promise<OperacaoBom[]> {
  if (profundidade > PROFUNDIDADE_MAXIMA_BOM) {
    throw new ProfundidadeMaximaBomError(bomId);
  }

  const { data: operacoesData, error: erroOperacoes } = await client
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

  const { data: subItens, error: erroSubItens } = await client
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
    const bomFilhoId = await resolverBomAtivo(client, sub.componente_produto_id);

    if (!bomFilhoId) {
      // Corrige lacuna conhecida: um subconjunto sem BOM resolvível não
      // pode mais ser ignorado silenciosamente - bloqueia citando código
      // e caminho. Vale para qualquer natureza de projeto (inclusive
      // industrialização): operações produtivas precisam estar
      // completas independente de quem fornece a matéria-prima.
      throw await criarSubconjuntoSemBomError(client, sub.componente_produto_id, [
        ...caminhoIds,
        sub.componente_produto_id,
      ]);
    }

    const operacoesFilho = await coletarEstruturaBom(
      client,
      bomFilhoId,
      quantidadeAcumulada * Number(sub.quantidade),
      profundidade + 1,
      [...caminhoIds, sub.componente_produto_id],
    );
    operacoes.push(...operacoesFilho);
  }

  return operacoes;
}

// Só chamada no caminho de ERRO (nunca no caminho feliz) - uma única
// consulta em lote resolve todos os códigos do caminho de uma vez,
// nunca N+1.
async function criarSubconjuntoSemBomError(
  client: SupabaseClient,
  produtoSemBomId: string,
  caminhoIds: string[],
): Promise<SubconjuntoSemBomError> {
  const { data } = await client.from("itens_industriais").select("id,codigo").in("id", caminhoIds);

  const codigoPorId = new Map(
    ((data ?? []) as { id: string; codigo: string }[]).map((linha) => [linha.id, linha.codigo]),
  );
  const caminhoCodigos = caminhoIds.map((id) => codigoPorId.get(id) ?? id);
  const codigo = codigoPorId.get(produtoSemBomId) ?? produtoSemBomId;

  return new SubconjuntoSemBomError(produtoSemBomId, codigo, caminhoCodigos);
}
