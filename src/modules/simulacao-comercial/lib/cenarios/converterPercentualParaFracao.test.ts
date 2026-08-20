import { describe, expect, it } from "vitest";
import { converterPercentualParaFracao } from "./converterPercentualParaFracao";

describe("converterPercentualParaFracao", () => {
  it("converte 30 para 0,30", () => {
    expect(converterPercentualParaFracao("30", "segunda a sexta")).toBe(0.3);
  });

  it("converte 50 para 0,50", () => {
    expect(converterPercentualParaFracao("50", "sábado")).toBe(0.5);
  });

  it("converte 100 para 1,00", () => {
    expect(converterPercentualParaFracao("100", "domingo")).toBe(1);
  });

  it("converte 0 para 0", () => {
    expect(converterPercentualParaFracao("0", "feriado")).toBe(0);
  });

  it("aceita vírgula como separador decimal", () => {
    expect(converterPercentualParaFracao("32,5", "sábado")).toBeCloseTo(0.325);
  });

  it("rejeita percentual negativo", () => {
    expect(() => converterPercentualParaFracao("-10", "segunda a sexta")).toThrow(
      /percentual válido/,
    );
  });

  it("rejeita texto vazio", () => {
    expect(() => converterPercentualParaFracao("", "domingo")).toThrow(/percentual válido/);
  });

  it("rejeita texto só com espaços", () => {
    expect(() => converterPercentualParaFracao("   ", "domingo")).toThrow(/percentual válido/);
  });

  it("rejeita valor não numérico (NaN)", () => {
    expect(() => converterPercentualParaFracao("abc", "feriado")).toThrow(/percentual válido/);
  });

  it("rejeita infinito", () => {
    expect(() => converterPercentualParaFracao("Infinity", "feriado")).toThrow(/percentual válido/);
  });

  it("a mensagem de erro cita o nome do parâmetro", () => {
    expect(() => converterPercentualParaFracao("-1", "feriado")).toThrow(/feriado/);
  });
});
