import { describe, expect, it } from "vitest";
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";

function chave(overrides: Partial<ChaveOcorrencia> = {}): ChaveOcorrencia {
  return {
    projetoItemId: "item-1",
    produtoRaizId: "produto-1",
    caminhoBomItemIds: ["bomitem-a", "bomitem-b"],
    bomOperacaoId: "operacao-1",
    ...overrides,
  };
}

describe("chaveOcorrenciaParaString — desambiguação de ocorrências do mesmo bomOperacaoId", () => {
  it("mesma chave produz a mesma string", () => {
    expect(chaveOcorrenciaParaString(chave())).toBe(chaveOcorrenciaParaString(chave()));
  });

  it("mesmo bomOperacaoId, produtoItemId diferente (mesma operação usada em 2 itens do projeto): strings diferentes", () => {
    const a = chaveOcorrenciaParaString(chave({ projetoItemId: "item-1" }));
    const b = chaveOcorrenciaParaString(chave({ projetoItemId: "item-2" }));
    expect(a).not.toBe(b);
  });

  it("mesmo bomOperacaoId, caminho de subconjunto diferente: strings diferentes", () => {
    const a = chaveOcorrenciaParaString(chave({ caminhoBomItemIds: ["bomitem-a"] }));
    const b = chaveOcorrenciaParaString(chave({ caminhoBomItemIds: ["bomitem-a", "bomitem-c"] }));
    expect(a).not.toBe(b);
  });

  it("caminho vazio (operação do produto raiz, sem subconjunto) produz string válida e distinta de caminho não vazio", () => {
    const semCaminho = chaveOcorrenciaParaString(chave({ caminhoBomItemIds: [] }));
    const comCaminho = chaveOcorrenciaParaString(chave({ caminhoBomItemIds: ["bomitem-a"] }));
    expect(semCaminho).not.toBe(comCaminho);
  });
});
