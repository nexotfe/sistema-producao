// DEC-007 - previsão comercial por capacidade: `capacidadesNormais`
// (constante por dia, por recurso) exigido por
// avaliarPrevisaoComercialFlexivel.ts - reaproveita EXATAMENTE os mesmos
// helpers batch já usados pelo motor antigo
// (`capacidadesDiariasDosRecursos`, `produtividadeEfetivaDoRecurso` de
// prepararEntradasMotor.ts), nunca uma segunda consulta/fórmula.
//
// NUNCA reaproveita `produtividadesEComprometidosDosRecursos` inteiro:
// aquele helper TAMBÉM calcula `comprometidoInicialPorRecurso` via
// `calcular_comprometido_v2` - essa RPC já agrega exatamente a mesma
// capacidade confirmada que `carregarConfirmadosComerciais.ts` monta do
// zero (granular por granular) neste redesenho. Chamar as duas juntas
// contaria a mesma capacidade confirmada 2 vezes. Só a metade de
// produtividade é reaproveitada aqui, isolada da metade de comprometido.
import type { SupabaseClient } from "@supabase/supabase-js";
import { capacidadesDiariasDosRecursos, produtividadeEfetivaDoRecurso } from "../prepararEntradasMotor";
import type { CapacidadeNormalRecurso } from "./necessidadeCapacidadeFlexivel";

/**
 * `recursoIds` tipicamente é a UNIÃO de recursos referenciados pelos
 * compromissos confirmados e pelas necessidades do orçamento novo
 * (original + compatíveis) - resolvida pelo CHAMADOR, nunca por este
 * módulo (que não conhece nenhuma das duas fontes).
 */
export async function carregarCapacidadesNormaisPrevisao(
  client: SupabaseClient,
  recursoIds: readonly string[],
): Promise<Map<string, CapacidadeNormalRecurso>> {
  const idsUnicos = Array.from(new Set(recursoIds));
  if (idsUnicos.length === 0) return new Map();

  const [capacidadeHorasMaquinaDiaPorRecurso, produtividades] = await Promise.all([
    capacidadesDiariasDosRecursos(client, idsUnicos),
    Promise.all(idsUnicos.map((recursoId) => produtividadeEfetivaDoRecurso(client, recursoId))),
  ]);

  const resultado = new Map<string, CapacidadeNormalRecurso>();
  idsUnicos.forEach((recursoId, indice) => {
    resultado.set(recursoId, {
      recursoId,
      produtividade: produtividades[indice],
      capacidadeHorasMaquinaDia: capacidadeHorasMaquinaDiaPorRecurso[recursoId],
    });
  });
  return resultado;
}
