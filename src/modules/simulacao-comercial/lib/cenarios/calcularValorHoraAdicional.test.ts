import { describe, expect, it } from "vitest";
import { calcularValorHoraAdicional } from "./calcularValorHoraAdicional";
import type { ConvencaoHorasAdicionaisVigencia } from "./resolverConvencaoParaData";

const convencao: ConvencaoHorasAdicionaisVigencia = {
  percentualSegundaSexta: 0.3,
  percentualSabado: 0.5,
  percentualDomingo: 1.0,
  percentualFeriado: 1.0,
  vigenteDesde: "2026-01-01",
  vigenteAte: null,
};

describe("calcularValorHoraAdicional", () => {
  it("acréscimo de 30% (hora_extra) -> valor-hora × 1,30", () => {
    expect(calcularValorHoraAdicional(20, "hora_extra", convencao)).toBeCloseTo(26, 6);
  });

  it("acréscimo de 50% (sabado) -> valor-hora × 1,50", () => {
    expect(calcularValorHoraAdicional(20, "sabado", convencao)).toBeCloseTo(30, 6);
  });

  it("acréscimo de 100% (domingo/feriado) -> valor-hora × 2,00", () => {
    expect(calcularValorHoraAdicional(20, "domingo", convencao)).toBeCloseTo(40, 6);
    expect(calcularValorHoraAdicional(20, "feriado", convencao)).toBeCloseTo(40, 6);
  });

  it("rejeita valorHoraBase negativo", () => {
    expect(() => calcularValorHoraAdicional(-1, "hora_extra", convencao)).toThrow(RangeError);
  });

  it("rejeita valorHoraBase não finito", () => {
    expect(() => calcularValorHoraAdicional(Number.NaN, "hora_extra", convencao)).toThrow(RangeError);
  });

  it("valorHoraBase zero é válido (custo adicional também fica zero)", () => {
    expect(calcularValorHoraAdicional(0, "hora_extra", convencao)).toBe(0);
  });
});
