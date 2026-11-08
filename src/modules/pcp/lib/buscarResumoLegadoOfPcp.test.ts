// PCP — Etapa 58B: fixtures isoladas, nenhuma gravação no Supabase.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarResumoLegadoOfPcp } from "./buscarResumoLegadoOfPcp";

type Linha = Record<string, unknown>;

function clienteFalso(fixtures: { vw_of_fluxo_operacional: Linha[]; vw_of_consumo_detalhado: Linha[] }): SupabaseClient {
  return {
    from(tabela: string) {
      const base = (fixtures as Record<string, Linha[]>)[tabela] ?? [];
      let linhas = base.slice();
      const api = {
        select(_cols: string) {
          return api;
        },
        eq(coluna: string, valor: unknown) {
          linhas = linhas.filter((l) => l[coluna] === valor);
          return api;
        },
        maybeSingle() {
          return Promise.resolve({ data: linhas[0] ?? null, error: null });
        },
        then(resolve: (v: { data: unknown; error: null }) => void) {
          resolve({ data: linhas, error: null });
        },
      };
      return api;
    },
  } as unknown as SupabaseClient;
}

describe("buscarResumoLegadoOfPcp", () => {
  it("1. resumo e itens reais de uma OF em regime legado", async () => {
    const client = clienteFalso({
      vw_of_fluxo_operacional: [
        {
          of_id: "of-1",
          bom_versao: "v2",
          total_demanda_bom: 12.8,
          total_estoque_livre: 5,
          total_consumo_interno: 5,
          total_compra_externa: 7.8,
          status_fluxo: "compra_total",
        },
      ],
      vw_of_consumo_detalhado: [
        {
          of_id: "of-1",
          materia_prima_codigo: "MP-01",
          materia_prima_descricao: "Barra redonda",
          componente_tipo: "materia_prima",
          bom_quantidade: 12.8,
          bom_unidade: "kg",
          estoque_saldo_livre: 5,
          quantidade_consumo_interno: 5,
          quantidade_compra_externa: 7.8,
          status_fluxo: "compra_total",
        },
      ],
    });
    const resultado = await buscarResumoLegadoOfPcp(client, "of-1");
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resumo).toEqual({
        bomVersao: "v2",
        totalDemandaBom: 12.8,
        totalEstoqueLivre: 5,
        totalConsumoInterno: 5,
        totalCompraExterna: 7.8,
        statusFluxo: "compra_total",
      });
      expect(resultado.itens).toHaveLength(1);
      expect(resultado.itens[0].materiaPrimaDescricao).toBe("Barra redonda");
    }
  });

  it("2. OF sem nenhum dado legado (resumo null, itens vazios) - nunca inventa valor", async () => {
    const client = clienteFalso({ vw_of_fluxo_operacional: [], vw_of_consumo_detalhado: [] });
    const resultado = await buscarResumoLegadoOfPcp(client, "of-2");
    expect(resultado).toEqual({ ok: true, resumo: null, itens: [] });
  });

  it("3. isolamento entre OFs na mesma fixture (of_id filtra corretamente)", async () => {
    const client = clienteFalso({
      vw_of_fluxo_operacional: [
        { of_id: "of-1", bom_versao: "v1", total_demanda_bom: 1, total_estoque_livre: 1, total_consumo_interno: 1, total_compra_externa: 0, status_fluxo: "ci_total" },
        { of_id: "of-2", bom_versao: "v9", total_demanda_bom: 9, total_estoque_livre: 0, total_consumo_interno: 0, total_compra_externa: 9, status_fluxo: "compra_total" },
      ],
      vw_of_consumo_detalhado: [],
    });
    const resultado = await buscarResumoLegadoOfPcp(client, "of-2");
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resumo?.bomVersao).toBe("v9");
    }
  });
});
