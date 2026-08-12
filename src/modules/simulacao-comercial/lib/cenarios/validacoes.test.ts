import { describe, expect, it } from "vitest";
import {
  validarProdutividade,
  validarHorasFinitasNaoNegativas,
  validarDataIso,
  validarDatasEstritamenteCrescentes,
} from "./validacoes";

describe("validarProdutividade", () => {
  it("aceita valores no intervalo (0, 1]", () => {
    expect(() => validarProdutividade(0.9)).not.toThrow();
    expect(() => validarProdutividade(1)).not.toThrow();
    expect(() => validarProdutividade(0.0001)).not.toThrow();
  });

  it("rejeita zero (causaria divisão por zero)", () => {
    expect(() => validarProdutividade(0)).toThrow(RangeError);
  });

  it("rejeita negativo", () => {
    expect(() => validarProdutividade(-0.5)).toThrow(RangeError);
  });

  it("rejeita maior que 1 (100%)", () => {
    expect(() => validarProdutividade(1.5)).toThrow(RangeError);
  });

  it("rejeita NaN e Infinity", () => {
    expect(() => validarProdutividade(NaN)).toThrow(RangeError);
    expect(() => validarProdutividade(Infinity)).toThrow(RangeError);
    expect(() => validarProdutividade(-Infinity)).toThrow(RangeError);
  });
});

describe("validarHorasFinitasNaoNegativas", () => {
  it("aceita zero e positivos finitos", () => {
    expect(() => validarHorasFinitasNaoNegativas(0, "x")).not.toThrow();
    expect(() => validarHorasFinitasNaoNegativas(8.5, "x")).not.toThrow();
  });

  it("rejeita negativo, NaN e Infinity", () => {
    expect(() => validarHorasFinitasNaoNegativas(-1, "x")).toThrow(RangeError);
    expect(() => validarHorasFinitasNaoNegativas(NaN, "x")).toThrow(RangeError);
    expect(() => validarHorasFinitasNaoNegativas(Infinity, "x")).toThrow(RangeError);
  });
});

describe("validarDataIso", () => {
  it("aceita data ISO válida", () => {
    expect(() => validarDataIso("2026-11-09")).not.toThrow();
  });

  it("rejeita formato inválido e string vazia", () => {
    expect(() => validarDataIso("09/11/2026")).toThrow(RangeError);
    expect(() => validarDataIso("")).toThrow(RangeError);
  });

  it("rejeita mês fora de 1-12", () => {
    expect(() => validarDataIso("2026-13-01")).toThrow(RangeError);
    expect(() => validarDataIso("2026-00-01")).toThrow(RangeError);
  });

  it("rejeita dia inexistente dentro de um mês válido (não confia em Date.parse/rollover silencioso)", () => {
    expect(() => validarDataIso("2026-02-30")).toThrow(RangeError); // fevereiro não tem 30 dias
    expect(() => validarDataIso("2026-04-31")).toThrow(RangeError); // abril tem 30 dias
    expect(() => validarDataIso("2026-02-29")).toThrow(RangeError); // 2026 não é bissexto
  });

  it("aceita 29 de fevereiro em ano bissexto real", () => {
    expect(() => validarDataIso("2028-02-29")).not.toThrow(); // 2028 é bissexto
  });
});

describe("validarDatasEstritamenteCrescentes", () => {
  it("aceita sequência estritamente crescente", () => {
    expect(() => validarDatasEstritamenteCrescentes(["2026-11-09", "2026-11-10", "2026-11-11"])).not.toThrow();
  });

  it("aceita lista vazia e lista de 1 data", () => {
    expect(() => validarDatasEstritamenteCrescentes([])).not.toThrow();
    expect(() => validarDatasEstritamenteCrescentes(["2026-11-09"])).not.toThrow();
  });

  it("rejeita data repetida", () => {
    expect(() => validarDatasEstritamenteCrescentes(["2026-11-09", "2026-11-09"])).toThrow(RangeError);
  });

  it("rejeita data fora de ordem", () => {
    expect(() => validarDatasEstritamenteCrescentes(["2026-11-10", "2026-11-09"])).toThrow(RangeError);
  });

  it("rejeita data ISO inválida em qualquer posição", () => {
    expect(() => validarDatasEstritamenteCrescentes(["2026-11-09", "data-invalida"])).toThrow(RangeError);
  });
});
