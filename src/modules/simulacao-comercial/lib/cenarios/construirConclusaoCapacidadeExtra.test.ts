import { describe, expect, it } from "vitest";
import { construirConclusaoDireta } from "./construirConclusaoCapacidadeExtra";

// Nunca hardcoda o texto de moeda formatado (ex.: "R$ 120,00") como
// string literal - toLocaleString("pt-BR", {style:"currency",...}) usa
// um ESPAÇO NÃO-QUEBRÁVEL (U+00A0) entre "R$" e o valor, não um espaço
// comum - um literal digitado à mão nunca bate por igualdade estrita.
// Reaproveita a mesma formatação para montar o valor esperado.
function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

describe("construirConclusaoDireta", () => {
  it("com ganho de prazo: 'Usando X horas extras, a entrega é antecipada em Y dias e o orçamento aumenta R$ Z.'", () => {
    const texto = construirConclusaoDireta(2, 3, 120);
    expect(texto).toBe(`Usando 2 horas extras, a entrega é antecipada em 3 dias e o orçamento aumenta ${moeda(120)}.`);
  });

  it("sem ganho de prazo (diasAntecipados <= 0): 'Estas X horas extras aumentam o custo em R$ Z, mas não antecipam a entrega.'", () => {
    const texto = construirConclusaoDireta(2, 0, 120);
    expect(texto).toBe(`Estas 2 horas extras aumentam o custo em ${moeda(120)}, mas não antecipam a entrega.`);
  });

  it("sem ganho de prazo (diasAntecipados negativo) usa a mesma mensagem de 'não antecipam'", () => {
    const texto = construirConclusaoDireta(2, -1, 120);
    expect(texto).toBe(`Estas 2 horas extras aumentam o custo em ${moeda(120)}, mas não antecipam a entrega.`);
  });

  it("sem ganho de prazo (diasAntecipados null) usa a mesma mensagem de 'não antecipam'", () => {
    const texto = construirConclusaoDireta(2, null, 120);
    expect(texto).toBe(`Estas 2 horas extras aumentam o custo em ${moeda(120)}, mas não antecipam a entrega.`);
  });

  it("nenhuma hora utilizada -> null (nada a concluir)", () => {
    expect(construirConclusaoDireta(0, 3, 120)).toBeNull();
  });

  it("singular: '1 hora extra' e '1 dia'", () => {
    const texto = construirConclusaoDireta(1, 1, 50);
    expect(texto).toBe(`Usando 1 hora extra, a entrega é antecipada em 1 dia e o orçamento aumenta ${moeda(50)}.`);
  });

  it("horas fracionárias formatadas com 1 casa decimal", () => {
    const texto = construirConclusaoDireta(1.5, 2, 75);
    expect(texto).toBe(`Usando 1,5 horas extras, a entrega é antecipada em 2 dias e o orçamento aumenta ${moeda(75)}.`);
  });
});
