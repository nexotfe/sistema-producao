import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarCapacidadesNormaisPrevisao } from "./carregarCapacidadesNormaisPrevisao";

function clienteMock(params: { capacidadePorRecurso: Record<string, number>; produtividadePorRecurso: Record<string, number> }): SupabaseClient {
  const chamadasRpc: string[] = [];
  const from = (tabela: string) => {
    if (tabela !== "recursos_produtivos") throw new Error(`Tabela inesperada neste mock: ${tabela}`);
    const builder = {
      select: () => builder,
      in: () => builder,
      then: (resolve: (v: unknown) => unknown) => {
        const data = Object.entries(params.capacidadePorRecurso).map(([id, capacidade_horas_dia]) => ({ id, capacidade_horas_dia }));
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return builder;
  };
  const rpc = (nome: string, args: Record<string, unknown>) => {
    chamadasRpc.push(nome);
    if (nome !== "calcular_produtividade_efetiva") throw new Error(`RPC inesperada neste mock: ${nome}`);
    const recursoId = args.p_recurso_id as string;
    return Promise.resolve({ data: params.produtividadePorRecurso[recursoId] ?? null, error: null });
  };
  return { from, rpc, __chamadasRpc: chamadasRpc } as unknown as SupabaseClient;
}

describe("carregarCapacidadesNormaisPrevisao", () => {
  it("lista vazia de recursos não consulta nada e devolve mapa vazio", async () => {
    const client = clienteMock({ capacidadePorRecurso: {}, produtividadePorRecurso: {} });
    const resultado = await carregarCapacidadesNormaisPrevisao(client, []);
    expect(resultado.size).toBe(0);
  });

  it("combina capacidade (recursos_produtivos) e produtividade (calcular_produtividade_efetiva) por recurso, sem chamar calcular_comprometido_v2", async () => {
    const client = clienteMock({
      capacidadePorRecurso: { "recurso-A": 8, "recurso-B": 4 },
      produtividadePorRecurso: { "recurso-A": 0.9, "recurso-B": 1 },
    });
    const resultado = await carregarCapacidadesNormaisPrevisao(client, ["recurso-A", "recurso-B", "recurso-A"]); // duplicado deliberadamente

    expect(resultado.size).toBe(2);
    expect(resultado.get("recurso-A")).toEqual({ recursoId: "recurso-A", produtividade: 0.9, capacidadeHorasMaquinaDia: 8 });
    expect(resultado.get("recurso-B")).toEqual({ recursoId: "recurso-B", produtividade: 1, capacidadeHorasMaquinaDia: 4 });
  });

  it("recurso sem produtividade cadastrada (RPC devolve null) recebe 100% - mesma regra já usada pelo motor antigo, nunca reimplementada", async () => {
    const client = clienteMock({ capacidadePorRecurso: { "recurso-A": 8 }, produtividadePorRecurso: {} });
    const resultado = await carregarCapacidadesNormaisPrevisao(client, ["recurso-A"]);
    expect(resultado.get("recurso-A")?.produtividade).toBe(1);
  });
});
