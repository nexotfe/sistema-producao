import { describe, expect, it } from "vitest";
import {
  calcularResumoOrcamento,
  calcularValorComercialProjeto,
  calcularNovoValorOrcamento,
} from "./calcularResumoOrcamento";

describe("calcularValorComercialProjeto", () => {
  it("soma o custo de todos os itens e aplica a fórmula do DEC-001 (margem por fora, carga por dentro, desconto por cima)", () => {
    const resultado = calcularValorComercialProjeto({
      itens: [{ custo: 200 }, { custo: 150 }],
      margemLucroPercent: 20,
      cargaTributariaPercent: null,
      cargaTributariaSugerida: 10,
      descontoPercentual: 5,
    });

    // custoTotal=350; lucro=350*0.20=70; subtotal=420; carga=0.10;
    // valorTecnico=420/0.90=466.666...; desconto=466.666...*0.05=23.333...;
    // valorComercial=466.666...-23.333...=443.333...
    expect(resultado.custoTotal).toBe(350);
    expect(resultado.valorTecnico).toBeCloseTo(466.6666667, 5);
    expect(resultado.valorComercial).toBeCloseTo(443.3333333, 5);
  });

  it("usa cargaTributariaPercent do projeto quando presente, ignora a sugerida", () => {
    const resultado = calcularValorComercialProjeto({
      itens: [{ custo: 100 }],
      margemLucroPercent: 0,
      cargaTributariaPercent: 15,
      cargaTributariaSugerida: 999,
      descontoPercentual: null,
    });
    // custoTotal=100; lucro=0; subtotal=100; carga=0.15; valorTecnico=100/0.85=117.647...
    expect(resultado.valorTecnico).toBeCloseTo(117.6470588, 5);
  });

  it("usa a sugerida quando cargaTributariaPercent do projeto é null", () => {
    const resultado = calcularValorComercialProjeto({
      itens: [{ custo: 100 }],
      margemLucroPercent: 0,
      cargaTributariaPercent: null,
      cargaTributariaSugerida: 20,
      descontoPercentual: null,
    });
    // carga=0.20; valorTecnico=100/0.80=125
    expect(resultado.valorTecnico).toBeCloseTo(125, 6);
  });

  it("lista de itens vazia -> custoTotal=0, valorComercial=0", () => {
    const resultado = calcularValorComercialProjeto({
      itens: [],
      margemLucroPercent: 20,
      cargaTributariaPercent: 10,
      cargaTributariaSugerida: 0,
      descontoPercentual: null,
    });
    expect(resultado.custoTotal).toBe(0);
    expect(resultado.valorComercial).toBe(0);
  });
});

describe("calcularNovoValorOrcamento - caso completo pedido pelo usuário (números fáceis de conferir)", () => {
  it("novo valor do orçamento = valor atual + custo adicional efetivamente utilizado: R$ 59.230,21 + R$ 208,00 = R$ 59.438,21", () => {
    const novoValor = calcularNovoValorOrcamento(59230.21, 208.0);
    expect(novoValor).toBeCloseTo(59438.21, 6);
  });

  it("custo adicional zero não altera o valor do orçamento", () => {
    expect(calcularNovoValorOrcamento(59230.21, 0)).toBeCloseTo(59230.21, 6);
  });

  it("é comutativo/simples: soma direta, sem arredondamento manual escondido", () => {
    expect(calcularNovoValorOrcamento(100, 50)).toBe(150);
    expect(calcularNovoValorOrcamento(0, 208)).toBe(208);
  });
});

describe("calcularResumoOrcamento - fórmula base (regressão)", () => {
  it("sem desconto, sem carga: valorComercial = custo + lucro", () => {
    const resultado = calcularResumoOrcamento({ custoTotal: 100, margemLucroPercent: 20, cargaTributariaPercent: 0 });
    expect(resultado.valorComercial).toBeCloseTo(120, 6);
  });
});
