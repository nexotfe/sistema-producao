// PCP-P8I-B5.2.1: classificação E (concorrência por recurso). Duas
// funções DELIBERADAMENTE separadas, por decisão do proprietário:
// compartilhamento (mesmo recurso, qualquer data) é um sinal mais
// fraco e nunca deve ser chamado de "conflito"; sobreposição temporal
// (mesmo recurso, mesma data) é um sinal mais forte, mas AINDA
// descritivo. Nenhum dos dois tipos de retorno tem campo de causa -
// omissão estrutural deliberada, para nunca ser possível expressar
// "operação Y atrasou por causa de X" através deste contrato. O Motor
// nunca sobre-aloca um recurso além da capacidade (consumo sequencial
// por prioridade em alocarOperacaoDiaAdia) - a disputa real nunca
// aparece como conflito de horas, só como "quem entrou primeiro".
export interface AlocacaoParaConcorrenciaPcp {
  readonly opId: string;
  readonly recursoId: string;
  readonly data: string;
  readonly prioridadeUsada: number;
}

export interface OperacaoEmConcorrenciaPcp {
  readonly opId: string;
  readonly prioridadeUsada: number;
}

export interface RecursoCompartilhadoPcp {
  readonly recursoId: string;
  readonly operacoes: readonly OperacaoEmConcorrenciaPcp[];
}

export interface SobreposicaoTemporalRecursoPcp {
  readonly recursoId: string;
  readonly data: string;
  readonly operacoes: readonly OperacaoEmConcorrenciaPcp[];
}

function ordenarOperacoes(operacoes: Map<string, number>): OperacaoEmConcorrenciaPcp[] {
  return Array.from(operacoes.entries())
    .map(([opId, prioridadeUsada]) => ({ opId, prioridadeUsada }))
    .sort((a, b) => (a.prioridadeUsada !== b.prioridadeUsada ? a.prioridadeUsada - b.prioridadeUsada : a.opId.localeCompare(b.opId)));
}

/** E1 - por recurso, ignorando data: >=2 OPs DISTINTAS usando o mesmo recurso, em qualquer momento. */
export function identificarRecursosCompartilhadosPcp(
  alocacoes: readonly AlocacaoParaConcorrenciaPcp[],
): readonly RecursoCompartilhadoPcp[] {
  const porRecurso = new Map<string, Map<string, number>>();
  for (const alocacao of alocacoes) {
    const operacoes = porRecurso.get(alocacao.recursoId) ?? new Map<string, number>();
    operacoes.set(alocacao.opId, alocacao.prioridadeUsada);
    porRecurso.set(alocacao.recursoId, operacoes);
  }

  const resultado: RecursoCompartilhadoPcp[] = [];
  for (const [recursoId, operacoes] of porRecurso) {
    if (operacoes.size < 2) continue; // 1 única OP no recurso nunca é "compartilhado".
    resultado.push({ recursoId, operacoes: ordenarOperacoes(operacoes) });
  }
  return resultado.sort((a, b) => a.recursoId.localeCompare(b.recursoId));
}

/** E2 - por (recurso, data): >=2 OPs DISTINTAS no MESMO dia. Nunca inclui pares em dias diferentes. */
export function identificarSobreposicaoTemporalRecursoPcp(
  alocacoes: readonly AlocacaoParaConcorrenciaPcp[],
): readonly SobreposicaoTemporalRecursoPcp[] {
  const porRecursoData = new Map<string, { recursoId: string; data: string; operacoes: Map<string, number> }>();
  for (const alocacao of alocacoes) {
    const chave = `${alocacao.recursoId}\u0000${alocacao.data}`;
    const grupo = porRecursoData.get(chave) ?? { recursoId: alocacao.recursoId, data: alocacao.data, operacoes: new Map<string, number>() };
    grupo.operacoes.set(alocacao.opId, alocacao.prioridadeUsada);
    porRecursoData.set(chave, grupo);
  }

  const resultado: SobreposicaoTemporalRecursoPcp[] = [];
  for (const grupo of porRecursoData.values()) {
    if (grupo.operacoes.size < 2) continue;
    resultado.push({ recursoId: grupo.recursoId, data: grupo.data, operacoes: ordenarOperacoes(grupo.operacoes) });
  }
  return resultado.sort((a, b) => (a.recursoId !== b.recursoId ? a.recursoId.localeCompare(b.recursoId) : a.data.localeCompare(b.data)));
}
