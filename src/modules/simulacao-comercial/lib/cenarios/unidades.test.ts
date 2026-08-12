import { describe, expect, it } from "vitest";
import { horasMaquinaParaHorasPadrao, horasPadraoParaHorasMaquina } from "./unidades";

describe("conversão de unidade — ida e volta sem perda", () => {
  it("2h de máquina a 90% de produtividade equivalem a 1,8h-padrão (exemplo do enunciado, invertido)", () => {
    expect(horasMaquinaParaHorasPadrao(2, 0.9)).toBeCloseTo(1.8, 10);
  });

  it("2h-padrão a 90% de produtividade equivalem a 2,2222h de máquina (exemplo real do enunciado)", () => {
    expect(horasPadraoParaHorasMaquina(2, 0.9)).toBeCloseTo(2.2222222222222223, 10);
  });

  it("ida e volta preserva o valor original (dentro da precisão de ponto flutuante)", () => {
    const produtividade = 0.73;
    const horasMaquinaOriginal = 5.4;
    const horasPadrao = horasMaquinaParaHorasPadrao(horasMaquinaOriginal, produtividade);
    const horasMaquinaDeVolta = horasPadraoParaHorasMaquina(horasPadrao, produtividade);
    expect(horasMaquinaDeVolta).toBeCloseTo(horasMaquinaOriginal, 10);
  });

  it("produtividade 100% é identidade nos dois sentidos", () => {
    expect(horasMaquinaParaHorasPadrao(4, 1)).toBe(4);
    expect(horasPadraoParaHorasMaquina(4, 1)).toBe(4);
  });

  it("zero horas em qualquer unidade converte para zero", () => {
    expect(horasMaquinaParaHorasPadrao(0, 0.5)).toBe(0);
    expect(horasPadraoParaHorasMaquina(0, 0.5)).toBe(0);
  });
});

describe("conversão de unidade — validação defensiva (produtividade zero causaria divisão por zero)", () => {
  it("rejeita produtividade zero, negativa ou acima de 1 nos dois sentidos", () => {
    expect(() => horasMaquinaParaHorasPadrao(2, 0)).toThrow(RangeError);
    expect(() => horasPadraoParaHorasMaquina(2, 0)).toThrow(RangeError);
    expect(() => horasMaquinaParaHorasPadrao(2, -0.5)).toThrow(RangeError);
    expect(() => horasMaquinaParaHorasPadrao(2, 1.5)).toThrow(RangeError);
  });

  it("rejeita horas negativas ou não finitas nos dois sentidos", () => {
    expect(() => horasMaquinaParaHorasPadrao(-1, 0.9)).toThrow(RangeError);
    expect(() => horasPadraoParaHorasMaquina(NaN, 0.9)).toThrow(RangeError);
    expect(() => horasMaquinaParaHorasPadrao(Infinity, 0.9)).toThrow(RangeError);
  });
});
