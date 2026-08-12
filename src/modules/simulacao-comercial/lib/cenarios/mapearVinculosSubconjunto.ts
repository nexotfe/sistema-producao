// DEC-007 §6/§7 - Fase 7: contrato de leitura de
// bom_operacao_dependencias_subconjunto (cadastro entregue pela Fase 7,
// migration 202608120001) para o formato em memória que
// grafoPrecedencia.ts (Fase 1, puro) espera.
//
// Este módulo NÃO é chamado por nenhum código real hoje - não existe
// ainda nenhum lugar do sistema que consulte a tabela e alimente
// construirGrafoOcorrencias numa simulação de verdade
// (prepararEntradasMotor.ts, o único wiring real equivalente que já
// existe no sistema, cuida de resolverBomAtivo, não deste grafo). Isso
// é trabalho de uma fase de integração do motor ainda não desenhada -
// nunca presumir que "o motor lê vínculos reais" enquanto essa ligação
// não existir de fato (correção de linguagem feita no DEC-007 §18).
import type { VinculoSubconjuntoOperacaoConsumidora } from "./grafoPrecedencia";

/** Formato de UMA linha, exatamente como o Supabase client devolve (snake_case, sem tradução). */
export interface LinhaBrutaDependenciaSubconjunto {
  bom_item_id: string;
  bom_operacao_id: string;
  deleted_at: string | null;
  ativo: boolean;
}

/**
 * Traduz linhas cruas de bom_operacao_dependencias_subconjunto para
 * VinculoSubconjuntoOperacaoConsumidora[] (formato de grafoPrecedencia.ts).
 *
 * - `deleted_at` preenchido = vínculo removido logicamente - excluído
 *   do resultado (não é dado inconsistente, é o caminho normal de
 *   remoção via UPDATE, Fase 7).
 * - `ativo !== true` numa linha viva (deleted_at nulo) NUNCA é
 *   ignorado silenciosamente - a migration 202608120001 garante
 *   `ativo = true` sempre via CHECK, mas este módulo não presume que
 *   essa garantia nunca poderá ser removida/contornada no futuro
 *   (mesma disciplina de "nunca presumir dado que pode estar
 *   obsoleto" usada no resto do núcleo) - lança erro explícito em vez
 *   de tratar como se o vínculo não existisse.
 */
export function mapearVinculosSubconjunto(
  linhas: LinhaBrutaDependenciaSubconjunto[],
): VinculoSubconjuntoOperacaoConsumidora[] {
  const vinculos: VinculoSubconjuntoOperacaoConsumidora[] = [];

  for (const linha of linhas) {
    if (linha.deleted_at !== null) {
      continue;
    }

    if (linha.ativo !== true) {
      throw new RangeError(
        `bom_operacao_dependencias_subconjunto: linha viva (deleted_at nulo) com ativo=${linha.ativo} - estado inesperado, o banco deveria garantir ativo=true sempre (ver migration 202608120001). bom_item_id="${linha.bom_item_id}", bom_operacao_id="${linha.bom_operacao_id}".`,
      );
    }

    vinculos.push({
      bomItemIdSubconjunto: linha.bom_item_id,
      bomOperacaoIdConsumidora: linha.bom_operacao_id,
    });
  }

  return vinculos;
}
