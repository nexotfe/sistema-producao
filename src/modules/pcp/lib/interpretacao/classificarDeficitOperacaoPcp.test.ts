import { describe, expect, it } from "vitest";
import { classificarDeficitOperacaoPcp } from "./classificarDeficitOperacaoPcp";

describe("classificarDeficitOperacaoPcp", () => {
  it("concluida com deficit 0 -> sem_deficit", () => {
    expect(classificarDeficitOperacaoPcp({ status: "concluida", alocacoesLength: 2, deficitResidual: 0 })).toBe("sem_deficit");
  });

  it("concluida com deficit != 0 -> contrato violado, lanca erro (nunca silencia)", () => {
    expect(() => classificarDeficitOperacaoPcp({ status: "concluida", alocacoesLength: 2, deficitResidual: 3 })).toThrow(/contrato violado/);
  });

  it("bloqueada_por_deficit com alocacoes -> deficit_parcial_de_capacidade", () => {
    expect(classificarDeficitOperacaoPcp({ status: "bloqueada_por_deficit", alocacoesLength: 1, deficitResidual: 4 })).toBe(
      "deficit_parcial_de_capacidade",
    );
  });

  it("bloqueada_por_deficit sem nenhuma alocacao -> sem_alocacao_indistinguivel (nunca 'fora_da_janela')", () => {
    expect(classificarDeficitOperacaoPcp({ status: "bloqueada_por_deficit", alocacoesLength: 0, deficitResidual: 8 })).toBe(
      "sem_alocacao_indistinguivel",
    );
  });

  it("bloqueada_por_predecessora -> bloqueio_por_predecessora, mesmo com deficitResidual preenchido (artefato do Motor)", () => {
    expect(classificarDeficitOperacaoPcp({ status: "bloqueada_por_predecessora", alocacoesLength: 0, deficitResidual: 10 })).toBe(
      "bloqueio_por_predecessora",
    );
  });

  it("bloqueada_por_predecessora com alocacoesLength>0 (teoricamente impossivel no Motor, mas a funcao nunca reclassifica por isso) -> ainda bloqueio_por_predecessora", () => {
    expect(classificarDeficitOperacaoPcp({ status: "bloqueada_por_predecessora", alocacoesLength: 3, deficitResidual: 10 })).toBe(
      "bloqueio_por_predecessora",
    );
  });

  it("determinismo", () => {
    const entrada = { status: "bloqueada_por_deficit" as const, alocacoesLength: 1, deficitResidual: 2 };
    expect(classificarDeficitOperacaoPcp(entrada)).toBe(classificarDeficitOperacaoPcp({ ...entrada }));
  });
});
