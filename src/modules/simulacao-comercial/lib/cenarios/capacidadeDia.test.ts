import { describe, expect, it } from "vitest";
import { capacidadeDia, projetoElegivelParaExtra } from "./capacidadeDia";

describe("capacidadeDia — normal/extra/sobrecarga separadas", () => {
  it("dia normal, sem comprometido, sem extra: tudo disponível na normal", () => {
    const resultado = capacidadeDia({
      jornadaNormalHorasMaquina: 8,
      comprometidoHorasMaquina: 0,
      capacidadeExtraAutorizadaHorasMaquina: 0,
    });
    expect(resultado).toEqual({ normalDisponivel: 8, sobrecarga: 0, extraDisponivel: 0 });
  });

  it("comprometido menor que a jornada: normalDisponivel é o líquido, sem sobrecarga", () => {
    const resultado = capacidadeDia({
      jornadaNormalHorasMaquina: 8,
      comprometidoHorasMaquina: 6.6667,
      capacidadeExtraAutorizadaHorasMaquina: 0,
    });
    expect(resultado.normalDisponivel).toBeCloseTo(1.3333, 3);
    expect(resultado.sobrecarga).toBe(0);
  });

  it("comprometido MAIOR que a jornada: sobrecarga real, visível, normalDisponivel zerado (não negativo)", () => {
    const resultado = capacidadeDia({
      jornadaNormalHorasMaquina: 8,
      comprometidoHorasMaquina: 10,
      capacidadeExtraAutorizadaHorasMaquina: 0,
    });
    expect(resultado.normalDisponivel).toBe(0);
    expect(resultado.sobrecarga).toBe(2);
  });

  it("sobrecarga NUNCA consome a capacidade extra autorizada para o cenário - extraDisponivel permanece intacto", () => {
    const resultado = capacidadeDia({
      jornadaNormalHorasMaquina: 8,
      comprometidoHorasMaquina: 10, // sobrecarga de 2h já existente, comprometida por outro projeto
      capacidadeExtraAutorizadaHorasMaquina: 4, // hora extra contratada especificamente para este cenário
    });
    expect(resultado.normalDisponivel).toBe(0);
    expect(resultado.sobrecarga).toBe(2);
    expect(resultado.extraDisponivel).toBe(4); // não reduzida pelos 2h de sobrecarga
  });

  it("sábado/domingo/feriado (jornada normal = 0): só a extra autorizada existe", () => {
    const resultado = capacidadeDia({
      jornadaNormalHorasMaquina: 0,
      comprometidoHorasMaquina: 0,
      capacidadeExtraAutorizadaHorasMaquina: 5,
    });
    expect(resultado).toEqual({ normalDisponivel: 0, sobrecarga: 0, extraDisponivel: 5 });
  });

  it("rejeita entradas negativas, NaN ou infinitas em qualquer um dos 3 parâmetros", () => {
    expect(() => capacidadeDia({ jornadaNormalHorasMaquina: -1, comprometidoHorasMaquina: 0, capacidadeExtraAutorizadaHorasMaquina: 0 })).toThrow(RangeError);
    expect(() => capacidadeDia({ jornadaNormalHorasMaquina: 8, comprometidoHorasMaquina: NaN, capacidadeExtraAutorizadaHorasMaquina: 0 })).toThrow(RangeError);
    expect(() => capacidadeDia({ jornadaNormalHorasMaquina: 8, comprometidoHorasMaquina: 0, capacidadeExtraAutorizadaHorasMaquina: Infinity })).toThrow(RangeError);
  });
});

describe("projetoElegivelParaExtra — escopo de elegibilidade da hora extra", () => {
  it("somente_orcamento_novo: só o próprio orçamento novo é elegível", () => {
    const elegibilidade = { escopo: "somente_orcamento_novo" as const };
    expect(projetoElegivelParaExtra(elegibilidade, "projeto-orcamento-novo", true)).toBe(true);
    expect(projetoElegivelParaExtra(elegibilidade, "projeto-antigo-prioridade-maior", false)).toBe(false);
  });

  it("qualquer_projeto_do_cenario: todos os projetos são elegíveis", () => {
    const elegibilidade = { escopo: "qualquer_projeto_do_cenario" as const };
    expect(projetoElegivelParaExtra(elegibilidade, "projeto-x", false)).toBe(true);
  });

  it("projetos_especificos: só os projetos explicitamente listados são elegíveis", () => {
    const elegibilidade = { escopo: "projetos_especificos" as const, projetoIds: ["projeto-a", "projeto-b"] };
    expect(projetoElegivelParaExtra(elegibilidade, "projeto-a", false)).toBe(true);
    expect(projetoElegivelParaExtra(elegibilidade, "projeto-c", false)).toBe(false);
  });
});
