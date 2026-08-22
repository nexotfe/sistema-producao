import { describe, expect, it } from "vitest";
import { normalizarDecimalCanonico } from "./normalizarDecimalCanonico";

describe("normalizarDecimalCanonico", () => {
  it("remove zeros à esquerda e à direita, preservando dígitos significativos", () => {
    expect(normalizarDecimalCanonico("001.5000")).toBe("1.5");
    expect(normalizarDecimalCanonico("1.0")).toBe("1");
    expect(normalizarDecimalCanonico("0100")).toBe("100");
    expect(normalizarDecimalCanonico("00.0100")).toBe("0.01");
  });

  it('"-0" e variações viram "0" - sinal de zero puro não é significativo', () => {
    expect(normalizarDecimalCanonico("-0")).toBe("0");
    expect(normalizarDecimalCanonico("-0.00")).toBe("0");
    expect(normalizarDecimalCanonico("0.0")).toBe("0");
    expect(normalizarDecimalCanonico("0")).toBe("0");
  });

  it("preserva sinal negativo em valores não-zero", () => {
    expect(normalizarDecimalCanonico("-1.50")).toBe("-1.5");
    expect(normalizarDecimalCanonico("-100")).toBe("-100");
  });

  it("aceita sinal positivo explícito, sem incluir no resultado", () => {
    expect(normalizarDecimalCanonico("+1.50")).toBe("1.5");
  });

  it("preserva todos os dígitos significativos, sem arredondar", () => {
    expect(normalizarDecimalCanonico("1500.123456789")).toBe("1500.123456789");
    expect(normalizarDecimalCanonico("0.000000001")).toBe("0.000000001");
  });

  it("expande notação científica para decimal plano - positiva e negativa", () => {
    expect(normalizarDecimalCanonico("1e2")).toBe("100");
    expect(normalizarDecimalCanonico("1.5e2")).toBe("150");
    expect(normalizarDecimalCanonico("1.5e3")).toBe("1500");
    expect(normalizarDecimalCanonico("1e-7")).toBe("0.0000001");
    expect(normalizarDecimalCanonico("-1.23e-4")).toBe("-0.000123");
    expect(normalizarDecimalCanonico("2.5E+2")).toBe("250");
  });

  it("notação científica e decimal plano do mesmo valor produzem o mesmo canônico", () => {
    expect(normalizarDecimalCanonico("1e2")).toBe(normalizarDecimalCanonico("100"));
    expect(normalizarDecimalCanonico("1e-7")).toBe(normalizarDecimalCanonico("0.0000001"));
  });

  it("aceita number finito, inclusive quando toString() produz notação científica", () => {
    expect(normalizarDecimalCanonico(1.5)).toBe("1.5");
    expect(normalizarDecimalCanonico(0)).toBe("0");
    expect(normalizarDecimalCanonico(-0)).toBe("0");
    expect(normalizarDecimalCanonico(0.0000001)).toBe("0.0000001"); // (0.0000001).toString() === "1e-7"
  });

  it("rejeita NaN e Infinity - number e string", () => {
    expect(() => normalizarDecimalCanonico(Number.NaN)).toThrow(RangeError);
    expect(() => normalizarDecimalCanonico(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => normalizarDecimalCanonico(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
    expect(() => normalizarDecimalCanonico("NaN")).toThrow(RangeError);
    expect(() => normalizarDecimalCanonico("Infinity")).toThrow(RangeError);
    expect(() => normalizarDecimalCanonico("-Infinity")).toThrow(RangeError);
  });

  it("rejeita entrada vazia e formato inválido", () => {
    expect(() => normalizarDecimalCanonico("")).toThrow(RangeError);
    expect(() => normalizarDecimalCanonico("   ")).toThrow(RangeError);
    expect(() => normalizarDecimalCanonico("abc")).toThrow(RangeError);
    expect(() => normalizarDecimalCanonico("1.2.3")).toThrow(RangeError);
    expect(() => normalizarDecimalCanonico("1,5")).toThrow(RangeError);
    expect(() => normalizarDecimalCanonico("R$ 1,50")).toThrow(RangeError);
  });

  it("tolera espaços nas bordas da string", () => {
    expect(normalizarDecimalCanonico("  1.50  ")).toBe("1.5");
  });
});
