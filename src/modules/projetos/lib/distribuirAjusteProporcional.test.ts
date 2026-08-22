import { describe, expect, it } from "vitest";
import { distribuirAjusteProporcional } from "./distribuirAjusteProporcional";

function somar(itens: { valorTotal: number }[]): number {
  return Math.round(itens.reduce((acc, item) => acc + item.valorTotal, 0) * 100) / 100;
}

describe("distribuirAjusteProporcional", () => {
  it("lista vazia: retorna vazio, sem dividir por zero", () => {
    expect(distribuirAjusteProporcional([], 500)).toEqual([]);
  });

  it("um único item: recebe o valor-alvo inteiro", () => {
    const resultado = distribuirAjusteProporcional([{ id: "a", valorTotal: 100 }], 133.33);
    expect(resultado).toEqual([{ id: "a", valorTotal: 133.33 }]);
  });

  it("múltiplos itens, ajuste positivo: cada item cresce na mesma proporção do seu peso base, soma bate exata com o alvo", () => {
    // base: 100 / 200 / 300 (soma 600) - pesos 1/6, 2/6, 3/6.
    // alvo 660 (ajuste positivo de +60, +10%): cada item deveria crescer ~10%.
    const resultado = distribuirAjusteProporcional(
      [
        { id: "a", valorTotal: 100 },
        { id: "b", valorTotal: 200 },
        { id: "c", valorTotal: 300 },
      ],
      660,
    );

    expect(somar(resultado)).toBe(660);
    expect(resultado[0].valorTotal).toBeCloseTo(110, 2);
    expect(resultado[1].valorTotal).toBeCloseTo(220, 2);
    expect(resultado[2].valorTotal).toBeCloseTo(330, 2);
  });

  it("diferença negativa: itens encolhem proporcionalmente, soma bate exata com o alvo menor", () => {
    // base 1000 (400+600), alvo 850 (ajuste de -150, -15%).
    const resultado = distribuirAjusteProporcional(
      [
        { id: "a", valorTotal: 400 },
        { id: "b", valorTotal: 600 },
      ],
      850,
    );

    expect(somar(resultado)).toBe(850);
    expect(resultado[0].valorTotal).toBeCloseTo(340, 2);
    expect(resultado[1].valorTotal).toBeCloseTo(510, 2);
  });

  it("alvo negativo (caso extremo): distribui um valor-alvo negativo mantendo a soma exata", () => {
    const resultado = distribuirAjusteProporcional(
      [
        { id: "a", valorTotal: 100 },
        { id: "b", valorTotal: 300 },
      ],
      -40,
    );

    expect(somar(resultado)).toBe(-40);
  });

  it("arredondamento: 3 itens iguais dividindo um alvo que não fecha em centavos exatos - soma ainda bate exata", () => {
    // base 3x100 (soma 300), alvo 100.01 - 100.01/3 = 33.336666... por item.
    const resultado = distribuirAjusteProporcional(
      [
        { id: "a", valorTotal: 100 },
        { id: "b", valorTotal: 100 },
        { id: "c", valorTotal: 100 },
      ],
      100.01,
    );

    expect(somar(resultado)).toBe(100.01);
    // Nenhum item pode diferir de outro por mais de 1 centavo (distribuição cumulativa é estável).
    const valores = resultado.map((item) => item.valorTotal);
    const maximo = Math.max(...valores);
    const minimo = Math.min(...valores);
    expect(Math.round((maximo - minimo) * 100) / 100).toBeLessThanOrEqual(0.01);
  });

  it("todos os itens com valorTotal 0 (soma-base zero): distribui igualmente entre os itens, sem NaN/Infinity", () => {
    const resultado = distribuirAjusteProporcional(
      [
        { id: "a", valorTotal: 0 },
        { id: "b", valorTotal: 0 },
      ],
      100,
    );

    expect(somar(resultado)).toBe(100);
    expect(resultado[0].valorTotal).toBeCloseTo(50, 2);
    expect(resultado[1].valorTotal).toBeCloseTo(50, 2);
    expect(Number.isFinite(resultado[0].valorTotal)).toBe(true);
    expect(Number.isFinite(resultado[1].valorTotal)).toBe(true);
  });

  it("ajuste zero (sem cenário aprovado, ou soma já bate): itens permanecem essencialmente com o valor base", () => {
    const resultado = distribuirAjusteProporcional(
      [
        { id: "a", valorTotal: 100 },
        { id: "b", valorTotal: 200 },
      ],
      300,
    );

    expect(resultado[0].valorTotal).toBeCloseTo(100, 2);
    expect(resultado[1].valorTotal).toBeCloseTo(200, 2);
  });

  it("preserva os demais campos do item, só substitui valorTotal", () => {
    const resultado = distribuirAjusteProporcional(
      [{ id: "a", valorTotal: 100, descricao: "Item A", quantidade: 2 }],
      110,
    );

    expect(resultado[0]).toEqual({ id: "a", valorTotal: 110, descricao: "Item A", quantidade: 2 });
  });
});
