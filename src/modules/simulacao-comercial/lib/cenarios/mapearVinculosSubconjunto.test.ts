import { describe, expect, it } from "vitest";
import { mapearVinculosSubconjunto, type LinhaBrutaDependenciaSubconjunto } from "./mapearVinculosSubconjunto";

function linha(overrides: Partial<LinhaBrutaDependenciaSubconjunto> = {}): LinhaBrutaDependenciaSubconjunto {
  return {
    bom_item_id: "item-1",
    bom_operacao_id: "operacao-1",
    deleted_at: null,
    ativo: true,
    ...overrides,
  };
}

describe("mapearVinculosSubconjunto", () => {
  it("mapeia uma linha viva para o formato esperado por grafoPrecedencia.ts", () => {
    const resultado = mapearVinculosSubconjunto([linha()]);
    expect(resultado).toEqual([{ bomItemIdSubconjunto: "item-1", bomOperacaoIdConsumidora: "operacao-1" }]);
  });

  it("exclui linhas com deleted_at preenchido (vínculo removido logicamente)", () => {
    const resultado = mapearVinculosSubconjunto([linha({ deleted_at: "2026-08-12T10:00:00Z" })]);
    expect(resultado).toEqual([]);
  });

  it("mapeia múltiplas linhas para múltiplos vínculos, cada uma independente", () => {
    const resultado = mapearVinculosSubconjunto([
      linha({ bom_item_id: "item-1", bom_operacao_id: "operacao-A" }),
      linha({ bom_item_id: "item-2", bom_operacao_id: "operacao-B" }),
      linha({ bom_item_id: "item-3", bom_operacao_id: "operacao-A", deleted_at: "2026-08-12T10:00:00Z" }),
    ]);
    expect(resultado).toEqual([
      { bomItemIdSubconjunto: "item-1", bomOperacaoIdConsumidora: "operacao-A" },
      { bomItemIdSubconjunto: "item-2", bomOperacaoIdConsumidora: "operacao-B" },
    ]);
  });

  it("lança erro explícito se uma linha viva tiver ativo=false, em vez de ignorar silenciosamente", () => {
    expect(() => mapearVinculosSubconjunto([linha({ ativo: false })])).toThrow(RangeError);
    expect(() => mapearVinculosSubconjunto([linha({ ativo: false })])).toThrow(/ativo=false/);
  });

  it("linha removida com ativo=false não lança erro - deleted_at já a exclui antes da checagem de ativo", () => {
    expect(() => mapearVinculosSubconjunto([linha({ deleted_at: "2026-08-12T10:00:00Z", ativo: false })])).not.toThrow();
  });

  it("lista vazia produz lista vazia", () => {
    expect(mapearVinculosSubconjunto([])).toEqual([]);
  });
});
