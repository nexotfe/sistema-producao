import { describe, expect, it } from "vitest";
import { compararProgramacoes } from "./compararProgramacoes";
import type { ResultadoOcorrenciaEscalonada } from "./escalonadorConjunto";
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";

function chave(bomOperacaoId: string): ChaveOcorrencia {
  return { projetoItemId: "PI-1", produtoRaizId: "PR-1", caminhoBomItemIds: [], bomOperacaoId };
}

function resultado(overrides: Partial<ResultadoOcorrenciaEscalonada> & { chave: ChaveOcorrencia }): ResultadoOcorrenciaEscalonada {
  return {
    status: "concluida",
    dataInicioReal: "2026-11-09",
    dataFimReal: "2026-11-09",
    alocacoes: [],
    deficitResidualHorasPadrao: 0,
    ...overrides,
  };
}

describe("compararProgramacoes", () => {
  it("calcula diasVariacaoFim (dias civis) e reporta status dos dois lados", () => {
    const chaveA = chave("A");
    const base = new Map([[chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA, dataFimReal: "2026-11-10" })]]);
    const proposta = new Map([[chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA, dataFimReal: "2026-11-12" })]]);

    const [diff] = compararProgramacoes(base, proposta);
    expect(diff.diasVariacaoFim).toBe(2);
    expect(diff.statusBase).toBe("concluida");
    expect(diff.statusProposta).toBe("concluida");
  });

  it("diasVariacaoFim negativo quando a proposta antecipa a data-fim", () => {
    const chaveA = chave("A");
    const base = new Map([[chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA, dataFimReal: "2026-11-11" })]]);
    const proposta = new Map([[chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA, dataFimReal: "2026-11-09" })]]);

    const [diff] = compararProgramacoes(base, proposta);
    expect(diff.diasVariacaoFim).toBe(-2);
  });

  it("diasVariacaoFim é null quando qualquer um dos dois lados não tem dataFimReal", () => {
    const chaveA = chave("A");
    const base = new Map([
      [chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA, status: "bloqueada_por_deficit", dataFimReal: null, deficitResidualHorasPadrao: 3 })],
    ]);
    const proposta = new Map([[chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA, dataFimReal: "2026-11-09" })]]);

    const [diff] = compararProgramacoes(base, proposta);
    expect(diff.diasVariacaoFim).toBeNull();
  });

  it("ocorrência parcialmente alocada (bloqueada_por_deficit) nos DOIS lados gera diasVariacaoFim=null, mesmo com dataFimReal preenchida nos dois - dataFimReal parcial não é término", () => {
    const chaveA = chave("A");
    // Os dois lados têm dataFimReal NÃO NULA (fizeram algum progresso antes de travar em déficit),
    // mas nenhum dos dois está "concluida" - comparar essas datas como se fossem término produziria
    // uma variação enganosa (a ocorrência nunca terminou de verdade em nenhum dos dois cenários).
    const base = new Map([
      [chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA, status: "bloqueada_por_deficit", dataFimReal: "2026-11-10", deficitResidualHorasPadrao: 2 })],
    ]);
    const proposta = new Map([
      [chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA, status: "bloqueada_por_deficit", dataFimReal: "2026-11-15", deficitResidualHorasPadrao: 1 })],
    ]);

    const [diff] = compararProgramacoes(base, proposta);
    expect(diff.diasVariacaoFim).toBeNull();
    expect(diff.statusBase).toBe("bloqueada_por_deficit");
    expect(diff.statusProposta).toBe("bloqueada_por_deficit");
    // As datas parciais continuam disponíveis no diff para fins informativos - só a VARIAÇÃO calculada é que fica null.
    expect(diff.dataFimRealBase).toBe("2026-11-10");
    expect(diff.dataFimRealProposta).toBe("2026-11-15");
  });

  it("diasVariacaoFim é null quando um lado concluiu e o outro só ficou parcialmente alocado (bloqueada_por_deficit com dataFimReal preenchida)", () => {
    const chaveA = chave("A");
    const base = new Map([[chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA, status: "concluida", dataFimReal: "2026-11-10" })]]);
    const proposta = new Map([
      [chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA, status: "bloqueada_por_deficit", dataFimReal: "2026-11-12", deficitResidualHorasPadrao: 3 })],
    ]);

    const [diff] = compararProgramacoes(base, proposta);
    expect(diff.diasVariacaoFim).toBeNull();
  });

  it("resultado ordenado pela chave completa da ocorrência, independente da ordem de inserção dos mapas", () => {
    const chaveZ = chave("Z");
    const chaveA = chave("A");
    const chaveM = chave("M");

    // Mapas inseridos deliberadamente fora de ordem alfabética (Z, A, M) - a saída precisa vir A, M, Z.
    const base = new Map([
      [chaveOcorrenciaParaString(chaveZ), resultado({ chave: chaveZ, dataFimReal: "2026-11-09" })],
      [chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA, dataFimReal: "2026-11-09" })],
      [chaveOcorrenciaParaString(chaveM), resultado({ chave: chaveM, dataFimReal: "2026-11-09" })],
    ]);
    const proposta = new Map([
      [chaveOcorrenciaParaString(chaveM), resultado({ chave: chaveM, dataFimReal: "2026-11-09" })],
      [chaveOcorrenciaParaString(chaveZ), resultado({ chave: chaveZ, dataFimReal: "2026-11-09" })],
      [chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA, dataFimReal: "2026-11-09" })],
    ]);

    const diffs = compararProgramacoes(base, proposta);
    expect(diffs.map((d) => chaveOcorrenciaParaString(d.chave))).toEqual([
      chaveOcorrenciaParaString(chaveA),
      chaveOcorrenciaParaString(chaveM),
      chaveOcorrenciaParaString(chaveZ),
    ]);
  });

  it("rejeita ocorrência presente só na base", () => {
    const chaveA = chave("A");
    const base = new Map([[chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA })]]);
    const proposta = new Map<string, ResultadoOcorrenciaEscalonada>();
    expect(() => compararProgramacoes(base, proposta)).toThrow(RangeError);
  });

  it("rejeita ocorrência presente só na proposta", () => {
    const chaveA = chave("A");
    const base = new Map<string, ResultadoOcorrenciaEscalonada>();
    const proposta = new Map([[chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA })]]);
    expect(() => compararProgramacoes(base, proposta)).toThrow(RangeError);
  });

  it("rejeita status='concluida' com dataFimReal nula (resultado inconsistente)", () => {
    const chaveA = chave("A");
    const base = new Map([[chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA, status: "concluida", dataFimReal: null })]]);
    const proposta = new Map([[chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA })]]);
    expect(() => compararProgramacoes(base, proposta)).toThrow(RangeError);
  });

  it("rejeita chave-string do mapa incompatível com a chave completa embutida no resultado", () => {
    const chaveA = chave("A");
    const chaveB = chave("B");
    // Mapa indexado por "A", mas o resultado carrega a chave completa de "B" - mapa corrompido/incompatível.
    const base = new Map([[chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveB })]]);
    const proposta = new Map([[chaveOcorrenciaParaString(chaveA), resultado({ chave: chaveA })]]);
    expect(() => compararProgramacoes(base, proposta)).toThrow(RangeError);
  });
});
