import { describe, expect, it } from "vitest";
import { resolverConvencaoParaData, type ConvencaoHorasAdicionaisVigencia } from "./resolverConvencaoParaData";

function convencao(overrides: Partial<ConvencaoHorasAdicionaisVigencia> = {}): ConvencaoHorasAdicionaisVigencia {
  return {
    percentualSegundaSexta: 0.3,
    percentualSabado: 0.5,
    percentualDomingo: 1,
    percentualFeriado: 1,
    vigenteDesde: "2026-01-01",
    vigenteAte: null,
    ...overrides,
  };
}

describe("resolverConvencaoParaData", () => {
  it("encontra a única convenção quando ela é aberta (vigenteAte=null) e cobre a data", () => {
    const c = convencao({ vigenteDesde: "2026-01-01", vigenteAte: null });
    expect(resolverConvencaoParaData([c], "2026-06-15")).toBe(c);
  });

  it("data anterior a vigenteDesde -> null (nenhuma convenção cobre)", () => {
    const c = convencao({ vigenteDesde: "2026-06-01", vigenteAte: null });
    expect(resolverConvencaoParaData([c], "2026-05-31")).toBeNull();
  });

  it("lista vazia -> null", () => {
    expect(resolverConvencaoParaData([], "2026-06-15")).toBeNull();
  });

  it("cruzamento de vigência: escolhe a convenção correta para cada lado da troca", () => {
    const antiga = convencao({ vigenteDesde: "2026-01-01", vigenteAte: "2026-08-31", percentualSegundaSexta: 0.2 });
    const nova = convencao({ vigenteDesde: "2026-09-01", vigenteAte: null, percentualSegundaSexta: 0.35 });

    expect(resolverConvencaoParaData([antiga, nova], "2026-08-31")).toBe(antiga);
    expect(resolverConvencaoParaData([antiga, nova], "2026-09-01")).toBe(nova);
  });

  it("data dentro de um gap sem nenhuma convenção cadastrada -> null (nunca assume custo zero)", () => {
    const futura = convencao({ vigenteDesde: "2026-09-01", vigenteAte: null });
    expect(resolverConvencaoParaData([futura], "2026-08-15")).toBeNull();
  });
});
