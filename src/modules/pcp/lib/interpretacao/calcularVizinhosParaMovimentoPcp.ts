// Extraído de src/app/pcp/prioridades/page.tsx (correção do build de
// produção): uma página Next não pode exportar nenhum símbolo além dos
// permitidos pelas rotas tipadas (default/metadata/...) - um export
// extra como este quebrava `next build` ao typecheckar a rota. Lógica
// idêntica, só realocada; nenhum comportamento foi alterado.
import type { ItemFilaPrioridadesPcp } from "../buscarFilaPrioridadesPcp";

/**
 * Calcula os vizinhos (anterior/seguinte) necessários para mover um
 * projeto da sua posição sequencial atual para `posicaoDestino` (1-based,
 * só apresentação) - nunca inventa identificadores, só reorganiza a
 * MESMA fila já carregada. `null` quando o destino é igual à posição
 * atual (nada a fazer) ou a fila tem 0/1 projeto (nenhum vizinho
 * possível) - nunca contorna a exigência de reordenar_fila_pcp de pelo
 * menos 1 vizinho chamando o servidor sem necessidade real.
 */
export function calcularVizinhosParaMovimento(
  fila: readonly ItemFilaPrioridadesPcp[],
  projetoId: string,
  posicaoDestino: number,
): { vizinhoAnteriorProjetoId: string | null; vizinhoSeguinteProjetoId: string | null } | null {
  if (fila.length <= 1) return null;

  const posicaoAtual = fila.find((item) => item.projetoId === projetoId)?.posicaoSequencial;
  if (posicaoAtual === undefined) return null;

  const destinoClamped = Math.max(1, Math.min(posicaoDestino, fila.length));
  if (destinoClamped === posicaoAtual) return null;

  const semProjeto = fila.filter((item) => item.projetoId !== projetoId);
  const indiceDestino = destinoClamped - 1;

  const vizinhoAnterior = indiceDestino > 0 ? semProjeto[indiceDestino - 1] : null;
  const vizinhoSeguinte = indiceDestino < semProjeto.length ? semProjeto[indiceDestino] : null;

  return {
    vizinhoAnteriorProjetoId: vizinhoAnterior?.projetoId ?? null,
    vizinhoSeguinteProjetoId: vizinhoSeguinte?.projetoId ?? null,
  };
}
