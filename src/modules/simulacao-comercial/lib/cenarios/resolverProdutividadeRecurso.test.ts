import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverProdutividadeRecurso } from "./resolverProdutividadeRecurso";

function clienteFalso(resposta: { data: unknown; error: { message: string } | null }): SupabaseClient {
  return {
    rpc: (_nome: string, _params: Record<string, unknown>) => Promise.resolve(resposta),
  } as unknown as SupabaseClient;
}

describe("resolverProdutividadeRecurso", () => {
  it("devolve a produtividade cadastrada", async () => {
    const client = clienteFalso({ data: 0.82, error: null });
    await expect(resolverProdutividadeRecurso(client, "recurso-A")).resolves.toBe(0.82);
  });

  it("produtividade não cadastrada (RPC devolve null) -> fallback 100% (1), nunca erro", async () => {
    const client = clienteFalso({ data: null, error: null });
    await expect(resolverProdutividadeRecurso(client, "recurso-A")).resolves.toBe(1);
  });

  it("propaga erro da RPC como Error explícito", async () => {
    const client = clienteFalso({ data: null, error: { message: "falha simulada" } });
    await expect(resolverProdutividadeRecurso(client, "recurso-A")).rejects.toThrow(/falha simulada/);
  });
});
