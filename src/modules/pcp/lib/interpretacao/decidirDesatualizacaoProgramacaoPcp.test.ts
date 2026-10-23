import { describe, expect, it } from "vitest";
import { decidirDesatualizacaoProgramacaoPcp } from "./decidirDesatualizacaoProgramacaoPcp";

describe("decidirDesatualizacaoProgramacaoPcp", () => {
  it("versoes iguais -> vigente_atualizada", () => {
    expect(decidirDesatualizacaoProgramacaoPcp({ versaoOrigem: 10, versaoAtual: 10 })).toBe("vigente_atualizada");
  });

  it("versao atual maior que a origem -> vigente_desatualizada", () => {
    expect(decidirDesatualizacaoProgramacaoPcp({ versaoOrigem: 10, versaoAtual: 11 })).toBe("vigente_desatualizada");
  });

  it("versao atual menor que a origem (nao deveria ocorrer, mas e so uma comparacao de igualdade) -> vigente_desatualizada", () => {
    expect(decidirDesatualizacaoProgramacaoPcp({ versaoOrigem: 10, versaoAtual: 9 })).toBe("vigente_desatualizada");
  });

  it("determinismo - mesma entrada produz mesma saida", () => {
    const entrada = { versaoOrigem: 5, versaoAtual: 5 };
    expect(decidirDesatualizacaoProgramacaoPcp(entrada)).toBe(decidirDesatualizacaoProgramacaoPcp({ ...entrada }));
  });
});
