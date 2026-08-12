// DEC-007 §9 - Fase 5: "reunir o orçamento novo e todos os projetos
// concorrentes conectados (transitivamente, via travessia com visited -
// conjunto de projetos é finito por empresa)". Núcleo puro, sem I/O.
//
// Conexão = MESMO candidatoId exato referenciado por alguma ocorrência de
// cada projeto (decisão confirmada com o usuário antes desta
// implementação) - é exatamente o que faz dois projetos competirem de
// verdade pela mesma instância de capacidade no escalonador (Fase 2).
//
// "Cascata sem corte arbitrário" (DEC-007 §9): o limite técnico é um
// FREIO DE SEGURANÇA contra bug (grafo com erro produzindo uma travessia
// sem fim), NUNCA um corte de negócio - se atingido, a travessia inteira
// é rejeitada (lança erro, cenário bloqueado), nunca devolve um
// subconjunto truncado como se fosse completo.
import type { OcorrenciaEscalonavel } from "./escalonadorConjunto";

/** Alto o bastante para nunca truncar uma cadeia real (nº de projetos concorrentes por empresa é finito e pequeno) - só protege contra bug. */
export const LIMITE_TECNICO_PROJETOS_CONECTADOS = 10_000;

/**
 * Componente conexo de projetos (via candidatoId compartilhado) que
 * contém `projetoIdOrcamentoNovo` - sempre inclui o próprio orçamento
 * novo, mesmo que ele não compartilhe recurso com ninguém (componente de
 * tamanho 1).
 */
export function encontrarProjetosConectados(params: {
  ocorrencias: OcorrenciaEscalonavel[];
  projetoIdOrcamentoNovo: string;
  limiteTecnicoProjetos?: number;
}): Set<string> {
  const { ocorrencias, projetoIdOrcamentoNovo, limiteTecnicoProjetos = LIMITE_TECNICO_PROJETOS_CONECTADOS } = params;

  if (!Number.isInteger(limiteTecnicoProjetos) || limiteTecnicoProjetos < 1) {
    throw new RangeError(`limiteTecnicoProjetos precisa ser um inteiro >= 1 - recebido: ${limiteTecnicoProjetos}.`);
  }

  const projetoIdsConhecidos = new Set(ocorrencias.map((oc) => oc.projetoId));
  if (!projetoIdsConhecidos.has(projetoIdOrcamentoNovo)) {
    throw new RangeError(`projetoIdOrcamentoNovo "${projetoIdOrcamentoNovo}" não corresponde ao projetoId de nenhuma ocorrência em "ocorrencias".`);
  }

  // candidatoId -> conjunto de projetoIds que o referenciam em alguma ocorrência.
  const projetosPorCandidatoId = new Map<string, Set<string>>();
  // projetoId -> conjunto de candidatoIds que ele referencia em alguma ocorrência.
  const candidatosPorProjetoId = new Map<string, Set<string>>();

  for (const oc of ocorrencias) {
    if (!candidatosPorProjetoId.has(oc.projetoId)) candidatosPorProjetoId.set(oc.projetoId, new Set());
    const candidatosDoProjeto = candidatosPorProjetoId.get(oc.projetoId)!;
    for (const candidatoId of oc.candidatoIdsPorPrioridade) {
      candidatosDoProjeto.add(candidatoId);
      if (!projetosPorCandidatoId.has(candidatoId)) projetosPorCandidatoId.set(candidatoId, new Set());
      projetosPorCandidatoId.get(candidatoId)!.add(oc.projetoId);
    }
  }

  const visitados = new Set<string>([projetoIdOrcamentoNovo]);
  const fila: string[] = [projetoIdOrcamentoNovo];
  let passos = 0;

  while (fila.length > 0) {
    passos++;
    if (passos > limiteTecnicoProjetos) {
      throw new RangeError(
        `Travessia de projetos concorrentes conectados excedeu o limite técnico de segurança (${limiteTecnicoProjetos}) - ` +
          `isso é sinal de bug (ciclo/grafo malformado), nunca um corte de negócio. Cenário bloqueado, nenhum subconjunto parcial é devolvido.`,
      );
    }

    const projetoAtual = fila.shift()!;
    const candidatosDoProjeto = candidatosPorProjetoId.get(projetoAtual) ?? new Set();
    for (const candidatoId of candidatosDoProjeto) {
      const projetosDoCandidato = projetosPorCandidatoId.get(candidatoId) ?? new Set();
      for (const projetoVizinho of projetosDoCandidato) {
        if (!visitados.has(projetoVizinho)) {
          visitados.add(projetoVizinho);
          fila.push(projetoVizinho);
        }
      }
    }
  }

  return visitados;
}
