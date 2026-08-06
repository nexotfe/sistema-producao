// Camada fina sobre a RPC calcular_resumo_produtivo_projeto (migration
// 202608060001) - toda a lógica de negócio (expansão recursiva de
// roteiros/subconjuntos, detecção de ciclo e de profundidade excedida,
// estado calculado/incompleto) mora no banco; aqui só existe o
// contrato de chamada e a conversão de snake_case (linhas do Postgres)
// para os tipos usados no cliente.
//
// A RPC retorna um único objeto composto (não SETOF) - supabase-js
// entrega `data` como objeto direto, não como array de linhas.
import type { SupabaseClient } from "@supabase/supabase-js";

export type LinhaResumoProdutivoRecurso = {
  recursoId: string | null;
  codigo: string | null;
  nome: string | null;
  minutos: number;
};

export type ItemResumoProdutivoStatus = {
  projetoItemId: string;
  produtoId: string;
  produtoCodigo: string;
  estruturaOk: boolean;
  motivo: "sem_roteiro" | "ciclo" | "profundidade_excedida" | null;
};

export type ResultadoResumoProdutivoProjeto = {
  estado: "calculado" | "incompleto";
  mensagem: string | null;
  recursos: LinhaResumoProdutivoRecurso[];
  itens: ItemResumoProdutivoStatus[];
};

type RecursoRow = {
  recurso_produtivo_id: string | null;
  recurso_codigo: string | null;
  recurso_nome: string | null;
  minutos: number;
};

type ItemStatusRow = {
  projeto_item_id: string;
  produto_id: string;
  produto_codigo: string;
  estrutura_ok: boolean;
  motivo: string | null;
};

type ResultadoRpcRow = {
  estado: "calculado" | "incompleto";
  mensagem: string | null;
  recursos: RecursoRow[] | null;
  itens: ItemStatusRow[] | null;
};

/**
 * Calcula o resumo produtivo (minutos por Recurso Produtivo) de todos
 * os itens ativos de um projeto, em uma única chamada - a RPC já
 * percorre recursivamente os roteiros (inclusive subconjuntos).
 * `estado === "incompleto"` sinaliza que um ou mais itens não têm
 * estrutura totalmente resolvível (sem roteiro, ciclo, ou profundidade
 * excedida) - os minutos retornados nesse caso são parciais e não
 * devem ser apresentados como total confiável. Lança Error com a
 * mensagem exata da RPC em caso de bloqueio real (projeto não
 * encontrado, item com quantidade inválida).
 */
export async function calcularResumoProdutivoProjeto(
  client: SupabaseClient,
  projetoId: string,
): Promise<ResultadoResumoProdutivoProjeto> {
  const { data, error } = await client.rpc("calcular_resumo_produtivo_projeto", {
    p_projeto_id: projetoId,
  });

  if (error) {
    throw new Error(
      error.message || "Não foi possível calcular o resumo produtivo do projeto.",
    );
  }

  if (!data) {
    throw new Error("O cálculo do resumo produtivo não retornou resultado.");
  }

  const bruto = data as ResultadoRpcRow;

  const recursos: LinhaResumoProdutivoRecurso[] = (bruto.recursos ?? []).map(
    (recurso) => ({
      recursoId: recurso.recurso_produtivo_id,
      codigo: recurso.recurso_codigo,
      nome: recurso.recurso_nome,
      minutos: Number(recurso.minutos),
    }),
  );

  const itens: ItemResumoProdutivoStatus[] = (bruto.itens ?? []).map((item) => ({
    projetoItemId: item.projeto_item_id,
    produtoId: item.produto_id,
    produtoCodigo: item.produto_codigo,
    estruturaOk: item.estrutura_ok,
    motivo: item.motivo as ItemResumoProdutivoStatus["motivo"],
  }));

  return {
    estado: bruto.estado,
    mensagem: bruto.mensagem,
    recursos,
    itens,
  };
}
