// DEC-007 §6.2/Fase 8b (redesenho: recurso temporário na planilha) -
// resolve DecisaoRecursoTemporario.aplicavelAsOperacoes /
// RecursoTemporarioCenario.aplicavelAsOperacoes (recursoTemporario.ts) a
// partir do recurso de REFERÊNCIA escolhido pelo usuário - o recurso
// temporário substitui exatamente onde o recurso de referência já
// poderia atuar (original ou compatível), nunca uma fonte nova: as
// mesmas duas fontes que `avaliarCenario.ts` já usa para montar
// candidatoIdsPorPrioridade (base.ocorrencias[].recursoOriginalId e
// base.compatibilidades), nenhuma consulta adicional.
import type { BaseCenarios } from "./carregarBaseCenarios";
import type { ChaveOcorrencia } from "./chaveOcorrencia";

export function ocorrenciasAplicaveisARecurso(base: BaseCenarios, recursoReferenciaId: string): ChaveOcorrencia[] {
  const resultado: ChaveOcorrencia[] = [];

  for (const { ocorrencia, recursoOriginalId } of base.ocorrencias) {
    const ehRecursoOriginal = recursoOriginalId === recursoReferenciaId;
    const ehCompativel = (base.compatibilidades[recursoOriginalId] ?? []).some(
      (candidato) => candidato.recursoId === recursoReferenciaId,
    );
    if (ehRecursoOriginal || ehCompativel) {
      resultado.push(ocorrencia.chave);
    }
  }

  return resultado;
}
