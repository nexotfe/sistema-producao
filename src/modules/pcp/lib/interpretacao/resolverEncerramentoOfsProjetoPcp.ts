// PCP-P8I-B5.2.2: camada de integração que decide, a partir dos OFs/OPs
// reais de um projeto (já consultados por fora - função pura, sem I/O),
// quais OFs ainda representam trabalho pendente, e monta o
// `RequisitoCoberturaProjetoPcp` que as funções puras de B5.2.1
// (calcularTerminoIntegralProjetoPcp.ts) já esperam - sem alterá-las.
//
// Regras de negócio aplicadas aqui (decisões do proprietário, B5.2.2):
// - `concluida` e `cancelada` NUNCA são pendência - uma OF cancelada
//   deixa de representar trabalho pendente mesmo sem substituta (a
//   decisão de criar uma substituta é do responsável do PCP, fora
//   deste cálculo).
// - `desdobrada` (OF-mãe) só é considerada resolvida se tiver ao menos
//   1 filha válida (of_pai_id apontando para ela) e todas as filhas
//   (recursivamente, pois uma filha pode também estar desdobrada)
//   estiverem resolvidas. Zero filhas encontradas é um relacionamento
//   INCONSISTENTE - nunca tratado como resolvido nem como pendente
//   simples.
// - Retrabalho (`ofOrigemRetrabalhoId` preenchido) segue a MESMA lógica
//   de resolução de qualquer OF - só é tratado de forma diferente no
//   cálculo de quantidade (calcularAvancoQuantidadeItemPcp.ts), nunca
//   aqui.
import type { RequisitoCoberturaProjetoPcp } from "./calcularTerminoIntegralProjetoPcp";

export type EstadoExecucaoOfPcp = "planejada" | "liberada" | "em_producao" | "suspensa" | "concluida" | "cancelada" | "desdobrada";

export interface OfProjetoPcp {
  readonly ofId: string;
  readonly estadoExecucao: EstadoExecucaoOfPcp;
  readonly ofPaiId: string | null;
}

export interface OpNecessariaProjetoPcp {
  readonly opId: string;
  readonly ofId: string;
  readonly naoAplicavel: boolean;
}

export interface OfInconsistentePcp {
  readonly ofId: string;
  readonly motivo: string;
}

export type SituacaoEncerramentoProjetoPcp =
  | { readonly situacao: "sem_base_de_ofs" }
  | { readonly situacao: "estrutura_inconsistente"; readonly detalhes: readonly OfInconsistentePcp[] }
  | { readonly situacao: "encerrado_quanto_as_ofs" }
  | { readonly situacao: "com_pendencias"; readonly requisito: RequisitoCoberturaProjetoPcp };

type ResultadoResolucaoOf = "resolvida" | "pendente" | "inconsistente";

/** Resolve 1 OF, recursivamente através de of_pai_id quando desdobrada. `visitados` evita loop infinito em dado corrompido (o banco já impede ciclo na origem, mas esta função nunca presume isso). */
function resolverOf(
  ofId: string,
  porId: ReadonlyMap<string, OfProjetoPcp>,
  filhasPorPai: ReadonlyMap<string, readonly OfProjetoPcp[]>,
  visitados: Set<string>,
  inconsistencias: OfInconsistentePcp[],
): ResultadoResolucaoOf {
  if (visitados.has(ofId)) {
    inconsistencias.push({ ofId, motivo: "ciclo detectado na hierarquia of_pai_id - nunca deveria ocorrer, dado corrompido." });
    return "inconsistente";
  }
  visitados.add(ofId);

  const of = porId.get(ofId);
  if (!of) {
    inconsistencias.push({ ofId, motivo: "OF referenciada (como filha) não encontrada no conjunto fornecido." });
    return "inconsistente";
  }

  if (of.estadoExecucao === "concluida" || of.estadoExecucao === "cancelada") {
    return "resolvida";
  }

  if (of.estadoExecucao === "desdobrada") {
    const filhas = filhasPorPai.get(ofId) ?? [];
    if (filhas.length === 0) {
      inconsistencias.push({ ofId, motivo: "OF desdobrada sem nenhuma filha vinculada (of_pai_id) - relacionamento inconsistente." });
      return "inconsistente";
    }
    let todasResolvidas = true;
    for (const filha of filhas) {
      const resultadoFilha = resolverOf(filha.ofId, porId, filhasPorPai, visitados, inconsistencias);
      if (resultadoFilha === "inconsistente") return "inconsistente";
      if (resultadoFilha === "pendente") todasResolvidas = false;
    }
    return todasResolvidas ? "resolvida" : "pendente";
  }

  // planejada / liberada / em_producao / suspensa - sempre pendente, independente de ser retrabalho ou não.
  return "pendente";
}

export function determinarSituacaoEncerramentoProjetoPcp(params: {
  readonly ofs: readonly OfProjetoPcp[];
  readonly opsNecessarias: readonly OpNecessariaProjetoPcp[];
}): SituacaoEncerramentoProjetoPcp {
  const { ofs, opsNecessarias } = params;

  if (ofs.length === 0) {
    return { situacao: "sem_base_de_ofs" };
  }

  const porId = new Map(ofs.map((of) => [of.ofId, of] as const));
  const filhasPorPai = new Map<string, OfProjetoPcp[]>();
  for (const of of ofs) {
    if (of.ofPaiId === null) continue;
    const lista = filhasPorPai.get(of.ofPaiId) ?? [];
    lista.push(of);
    filhasPorPai.set(of.ofPaiId, lista);
  }

  const inconsistencias: OfInconsistentePcp[] = [];
  const pendentes: string[] = [];
  const alcancadas = new Set<string>();

  // Só resolve as OFs-RAIZ desta lista (sem of_pai_id) diretamente - uma
  // OF-filha é avaliada dentro da recursão da sua mãe desdobrada, nunca
  // como pendência própria solta (senão uma OF-filha "em_producao"
  // apareceria 2x: uma vez via a mãe, outra vez como entrada avulsa).
  const ofsRaiz = ofs.filter((of) => of.ofPaiId === null);
  for (const ofRaiz of ofsRaiz) {
    const visitadosDesteRamo = new Set<string>();
    const resultado = resolverOf(ofRaiz.ofId, porId, filhasPorPai, visitadosDesteRamo, inconsistencias);
    for (const id of visitadosDesteRamo) alcancadas.add(id);
    if (resultado === "pendente") {
      coletarPendentesFolha(ofRaiz.ofId, porId, filhasPorPai, pendentes);
    }
  }

  // Qualquer OF com of_pai_id preenchido mas nunca alcançada a partir de
  // nenhuma raiz (ciclo sem raiz, ou cadeia cujo pai nunca existe de
  // verdade) é relacionamento inconsistente - nunca silenciosamente
  // ignorada só porque não é uma raiz.
  for (const of of ofs) {
    if (of.ofPaiId !== null && !alcancadas.has(of.ofId)) {
      inconsistencias.push({ ofId: of.ofId, motivo: "OF com of_pai_id preenchido nunca alcançada a partir de nenhuma OF-raiz (ciclo sem raiz ou cadeia órfã)." });
    }
  }

  if (inconsistencias.length > 0) {
    return { situacao: "estrutura_inconsistente", detalhes: inconsistencias };
  }
  if (pendentes.length === 0) {
    return { situacao: "encerrado_quanto_as_ofs" };
  }

  const idsOpsNecessariasPorOf = new Map<string, readonly string[]>();
  for (const ofId of pendentes) {
    idsOpsNecessariasPorOf.set(
      ofId,
      opsNecessarias.filter((op) => op.ofId === ofId && !op.naoAplicavel).map((op) => op.opId),
    );
  }

  return {
    situacao: "com_pendencias",
    requisito: { idsOfsNecessarias: pendentes, idsOpsNecessariasPorOf },
  };
}

/** Coleta as OFs-FOLHA realmente pendentes (nunca a mãe desdobrada em si, que nunca aparece na programação do Motor). */
function coletarPendentesFolha(
  ofId: string,
  porId: ReadonlyMap<string, OfProjetoPcp>,
  filhasPorPai: ReadonlyMap<string, readonly OfProjetoPcp[]>,
  pendentes: string[],
): void {
  const of = porId.get(ofId);
  if (!of) return;

  if (of.estadoExecucao === "desdobrada") {
    for (const filha of filhasPorPai.get(ofId) ?? []) {
      coletarPendentesFolha(filha.ofId, porId, filhasPorPai, pendentes);
    }
    return;
  }

  if (of.estadoExecucao !== "concluida" && of.estadoExecucao !== "cancelada") {
    pendentes.push(ofId);
  }
}
