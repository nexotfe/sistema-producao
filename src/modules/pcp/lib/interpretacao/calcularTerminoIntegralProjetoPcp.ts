// PCP-P8I-B5.2.1: classificação B (término/cobertura/atraso previsto).
// Três conceitos DELIBERADAMENTE separados, nunca fundidos:
//
// 1. "Término das operações programadas" - só sobre o que JÁ está no
//    conjunto recebido (vigente ou cálculo), nunca chamado de "prazo do
//    projeto" - um projeto pode ter OFs inteiras fora desse conjunto
//    (ainda não liberadas, por exemplo) sem que isso apareça aqui.
// 2. "Cobertura integral do projeto" - comparação de CONJUNTOS (OFs/OPs
//    necessárias × OFs/OPs presentes), fornecidos pelo chamador. Esta
//    função pura NUNCA consulta o banco para descobrir quais são as
//    OFs/OPs necessárias - isso é responsabilidade de uma camada de I/O
//    futura (B5.2.2), que também decide, por regra de negócio ainda não
//    fechada, quais estados de OF contam como "necessários à entrega"
//    (ambiguidade registrada na investigação B5.2) e que já deve
//    excluir OFs com estado_execucao='concluida' (essas nunca aparecem
//    no conjunto do Motor por desenho, e isso é esperado, não ausência).
// 3. "Atraso previsto" - só pode ser afirmado sobre uma cobertura
//    INTEGRAL, nunca sobre o término parcial do item 1.
//
// Conclusão PARCIAL ≠ conclusão INTEGRAL (regra do proprietário, B5.2):
// uma operação com status != 'concluida' nunca contribui com sua
// dataFimPrevista para nenhum termino aqui - mesmo que o campo venha
// preenchido (dataFimReal "até onde chegou", nunca um término real -
// ver escalonadorConjunto.ts).
import type { StatusOperacaoPcp } from "./classificarDeficitOperacaoPcp";

export interface OperacaoParaAgregacaoPcp {
  readonly ofId: string;
  readonly opId: string;
  readonly status: StatusOperacaoPcp;
  readonly dataFimPrevista: string | null;
}

/**
 * Compara duas datas ISO (YYYY-MM-DD) em aritmética civil UTC - mesma
 * convenção já usada (reimplementada localmente em cada módulo, por
 * desenho do projeto) em compararProgramacoes.ts/montarPrevisaoComercialProjeto.ts etc.
 * Nenhum utilitário compartilhado existe para isto no projeto hoje.
 */
function dataIsoMaior(a: string, b: string): boolean {
  return a > b; // comparação lexicográfica de YYYY-MM-DD é equivalente a comparação cronológica.
}

// --- 1. Término das operações programadas (escopo explícito, nunca "prazo do projeto") ---
export function calcularTerminoOperacoesProgramadasPcp(operacoes: readonly OperacaoParaAgregacaoPcp[]): string | null {
  if (operacoes.length === 0) return null;

  let termino: string | null = null;
  for (const operacao of operacoes) {
    if (operacao.status !== "concluida") {
      return null; // qualquer operação não-concluída invalida o término agregado por inteiro.
    }
    if (operacao.dataFimPrevista === null) {
      throw new Error(
        `calcularTerminoOperacoesProgramadasPcp: contrato violado - operação ${operacao.opId} com status 'concluida' nunca tem dataFimPrevista nula (garantido pelo Motor).`,
      );
    }
    if (termino === null || dataIsoMaior(operacao.dataFimPrevista, termino)) {
      termino = operacao.dataFimPrevista;
    }
  }
  return termino;
}

// --- 2. Cobertura integral (comparação de conjuntos, sem I/O) ---
export interface RequisitoCoberturaProjetoPcp {
  readonly idsOfsNecessarias: readonly string[];
  readonly idsOpsNecessariasPorOf: ReadonlyMap<string, readonly string[]>;
}

export type CoberturaProjetoPcp =
  | { readonly tipo: "sem_base_para_previsao" }
  | { readonly tipo: "incompleta"; readonly ofsAusentes: readonly string[]; readonly opsAusentesPorOf: ReadonlyMap<string, readonly string[]> }
  | { readonly tipo: "completa" };

export function verificarCoberturaIntegralProjetoPcp(params: {
  readonly requisito: RequisitoCoberturaProjetoPcp;
  readonly operacoesPresentes: readonly OperacaoParaAgregacaoPcp[];
}): CoberturaProjetoPcp {
  const { requisito, operacoesPresentes } = params;

  if (requisito.idsOfsNecessarias.length === 0) {
    // Projeto sem nenhuma OF identificada como necessária - nunca
    // tratado como "0 necessárias, logo 100% coberto": não há base
    // nenhuma para afirmar qualquer previsão.
    return { tipo: "sem_base_para_previsao" };
  }

  const ofIdsPresentes = new Set(operacoesPresentes.map((o) => o.ofId));
  const ofsAusentes = requisito.idsOfsNecessarias.filter((ofId) => !ofIdsPresentes.has(ofId));

  const opsAusentesPorOf = new Map<string, readonly string[]>();
  for (const ofId of requisito.idsOfsNecessarias) {
    if (ofsAusentes.includes(ofId)) continue; // já contabilizada como OF inteira ausente - não duplicar na granularidade de OP.

    const opsNecessarias = requisito.idsOpsNecessariasPorOf.get(ofId) ?? [];
    const opIdsPresentesNaOf = new Set(operacoesPresentes.filter((o) => o.ofId === ofId).map((o) => o.opId));
    const opsAusentes = opsNecessarias.filter((opId) => !opIdsPresentesNaOf.has(opId));
    if (opsAusentes.length > 0) {
      opsAusentesPorOf.set(ofId, opsAusentes);
    }
  }

  if (ofsAusentes.length > 0 || opsAusentesPorOf.size > 0) {
    return { tipo: "incompleta", ofsAusentes, opsAusentesPorOf };
  }
  return { tipo: "completa" };
}

// --- combina 1 + 2: término só é afirmado sobre cobertura completa ---
export type TerminoIntegralProjetoPcp =
  | { readonly cobertura: "sem_base_para_previsao" }
  | { readonly cobertura: "incompleta"; readonly ofsAusentes: readonly string[]; readonly opsAusentesPorOf: ReadonlyMap<string, readonly string[]> }
  | { readonly cobertura: "completa"; readonly termino: string | null };

export function calcularTerminoIntegralProjetoPcp(params: {
  readonly requisito: RequisitoCoberturaProjetoPcp;
  readonly operacoesPresentes: readonly OperacaoParaAgregacaoPcp[];
}): TerminoIntegralProjetoPcp {
  const cobertura = verificarCoberturaIntegralProjetoPcp(params);
  if (cobertura.tipo === "sem_base_para_previsao") {
    return { cobertura: "sem_base_para_previsao" };
  }
  if (cobertura.tipo === "incompleta") {
    return { cobertura: "incompleta", ofsAusentes: cobertura.ofsAusentes, opsAusentesPorOf: cobertura.opsAusentesPorOf };
  }
  return { cobertura: "completa", termino: calcularTerminoOperacoesProgramadasPcp(params.operacoesPresentes) };
}

// --- 3. Atraso previsto - só aceita o resultado de (2), nunca uma data solta ---
export type AtrasoProjetoPcp =
  | "sem_base_para_previsao"
  | "cobertura_incompleta"
  | "sem_conclusao_integral_prevista"
  | "prazo_indeterminado"
  | "atrasado"
  | "dentro_do_prazo";

export function decidirAtrasoProjetoPcp(params: {
  readonly terminoIntegral: TerminoIntegralProjetoPcp;
  readonly dataObjetivo: string | null;
}): AtrasoProjetoPcp {
  const { terminoIntegral, dataObjetivo } = params;

  if (terminoIntegral.cobertura === "sem_base_para_previsao") return "sem_base_para_previsao";
  if (terminoIntegral.cobertura === "incompleta") return "cobertura_incompleta";

  if (terminoIntegral.termino === null) return "sem_conclusao_integral_prevista";
  if (dataObjetivo === null) return "prazo_indeterminado";

  return dataIsoMaior(terminoIntegral.termino, dataObjetivo) ? "atrasado" : "dentro_do_prazo";
}
