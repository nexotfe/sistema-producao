// DEC-007 §6.2/Fase 8b (redesenho: recurso temporário na planilha) -
// produtividade real do recurso de REFERÊNCIA escolhido para um recurso
// temporário (RecursoTemporarioCenario.recursoReferenciaId) - nunca
// digitada (ver cabeçalho de recursoTemporario.ts). Mesma RPC e mesmo
// fallback (produtividade não cadastrada -> 100%) já usados por
// `produtividadeEfetivaDoRecurso` em prepararEntradasMotor.ts, mas essa
// função é privada e amarrada a `comprometidoDoRecurso` (que exige um
// projetoId real, sem sentido para um recurso hipotético que não
// pertence a nenhum projeto) - por isso este wrapper fino próprio, em
// vez de reaproveitar aquela função ou alterar o motor antigo.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolverProdutividadeRecurso(client: SupabaseClient, recursoId: string): Promise<number> {
  const { data, error } = await client.rpc("calcular_produtividade_efetiva", {
    p_recurso_id: recursoId,
  });

  if (error) {
    throw new Error(`Erro ao chamar calcular_produtividade_efetiva para recurso ${recursoId}: ${error.message}`);
  }

  return data === null ? 1 : Number(data);
}
