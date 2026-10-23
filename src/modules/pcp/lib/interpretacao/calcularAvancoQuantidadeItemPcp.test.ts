import { describe, expect, it } from "vitest";
import { calcularAvancoQuantidadePorItemPcp, type OfQuantidadeItemPcp } from "./calcularAvancoQuantidadeItemPcp";

function of(parcial: Partial<OfQuantidadeItemPcp> & { ofId: string; projetoItemId: string }): OfQuantidadeItemPcp {
  return { estadoExecucao: "concluida", ofOrigemRetrabalhoId: null, quantidadePlanejada: 0, ...parcial };
}

describe("calcularAvancoQuantidadePorItemPcp", () => {
  it("exemplo do proprietario: item de 200 pecas em 4 OFs de 50, 1 concluida -> 25%", () => {
    const resultado = calcularAvancoQuantidadePorItemPcp({
      ofs: [
        of({ ofId: "of1", projetoItemId: "item1", quantidadePlanejada: 50, estadoExecucao: "concluida" }),
        of({ ofId: "of2", projetoItemId: "item1", quantidadePlanejada: 50, estadoExecucao: "em_producao" }),
        of({ ofId: "of3", projetoItemId: "item1", quantidadePlanejada: 50, estadoExecucao: "planejada" }),
        of({ ofId: "of4", projetoItemId: "item1", quantidadePlanejada: 50, estadoExecucao: "planejada" }),
      ],
      quantidadeContratadaPorItem: new Map([["item1", 200]]),
    });
    expect(resultado).toEqual([{ projetoItemId: "item1", quantidadeContratada: 200, quantidadeAtendida: 50 }]);
  });

  it("2 das 4 OFs concluidas -> 50%", () => {
    const resultado = calcularAvancoQuantidadePorItemPcp({
      ofs: [
        of({ ofId: "of1", projetoItemId: "item1", quantidadePlanejada: 50, estadoExecucao: "concluida" }),
        of({ ofId: "of2", projetoItemId: "item1", quantidadePlanejada: 50, estadoExecucao: "concluida" }),
        of({ ofId: "of3", projetoItemId: "item1", quantidadePlanejada: 50, estadoExecucao: "planejada" }),
        of({ ofId: "of4", projetoItemId: "item1", quantidadePlanejada: 50, estadoExecucao: "planejada" }),
      ],
      quantidadeContratadaPorItem: new Map([["item1", 200]]),
    });
    expect(resultado[0].quantidadeAtendida).toBe(100);
  });

  it("retrabalho concluido NUNCA soma a quantidade atendida", () => {
    const resultado = calcularAvancoQuantidadePorItemPcp({
      ofs: [
        of({ ofId: "original", projetoItemId: "item1", quantidadePlanejada: 50, estadoExecucao: "concluida" }),
        of({ ofId: "retrabalho1", projetoItemId: "item1", quantidadePlanejada: 5, estadoExecucao: "concluida", ofOrigemRetrabalhoId: "original" }),
      ],
      quantidadeContratadaPorItem: new Map([["item1", 200]]),
    });
    expect(resultado[0].quantidadeAtendida).toBe(50); // nunca 55.
  });

  it("OF cancelada nunca representa pecas fabricadas", () => {
    const resultado = calcularAvancoQuantidadePorItemPcp({
      ofs: [of({ ofId: "of1", projetoItemId: "item1", quantidadePlanejada: 50, estadoExecucao: "cancelada" })],
      quantidadeContratadaPorItem: new Map([["item1", 200]]),
    });
    expect(resultado[0].quantidadeAtendida).toBe(0);
  });

  it("10. projeto com varios itens e quantidades diferentes - nunca soma entre itens (isolamento por item)", () => {
    const resultado = calcularAvancoQuantidadePorItemPcp({
      ofs: [
        of({ ofId: "of1", projetoItemId: "itemA", quantidadePlanejada: 50, estadoExecucao: "concluida" }),
        of({ ofId: "of2", projetoItemId: "itemB", quantidadePlanejada: 10, estadoExecucao: "concluida" }),
        of({ ofId: "of3", projetoItemId: "itemB", quantidadePlanejada: 10, estadoExecucao: "planejada" }),
      ],
      quantidadeContratadaPorItem: new Map([
        ["itemA", 100],
        ["itemB", 20],
      ]),
    });
    expect(resultado).toEqual([
      { projetoItemId: "itemA", quantidadeContratada: 100, quantidadeAtendida: 50 },
      { projetoItemId: "itemB", quantidadeContratada: 20, quantidadeAtendida: 10 },
    ]);
    // nenhum campo de total/percentual global agregando os dois itens existe no tipo de retorno.
    expect(resultado.every((item) => Object.keys(item).sort().join(",") === "projetoItemId,quantidadeAtendida,quantidadeContratada")).toBe(
      true,
    );
  });

  it("11a. item referenciado por OF mas ausente de quantidadeContratadaPorItem -> erro explicito, nunca 0 por omissao", () => {
    expect(() =>
      calcularAvancoQuantidadePorItemPcp({
        ofs: [of({ ofId: "of1", projetoItemId: "item-sem-contrato", quantidadePlanejada: 50 })],
        quantidadeContratadaPorItem: new Map(),
      }),
    ).toThrow(/inconsistência de dados/);
  });

  it("entrada vazia -> array vazio", () => {
    expect(calcularAvancoQuantidadePorItemPcp({ ofs: [], quantidadeContratadaPorItem: new Map() })).toEqual([]);
  });

  it("imutabilidade - nao muta a entrada", () => {
    const ofs = [of({ ofId: "of1", projetoItemId: "item1", quantidadePlanejada: 50 })];
    const copia = JSON.parse(JSON.stringify(ofs));
    calcularAvancoQuantidadePorItemPcp({ ofs, quantidadeContratadaPorItem: new Map([["item1", 100]]) });
    expect(ofs).toEqual(copia);
  });
});
