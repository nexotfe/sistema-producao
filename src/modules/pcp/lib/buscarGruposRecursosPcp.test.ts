import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarGruposRecursosPcp } from "./buscarGruposRecursosPcp";

type Linha = Record<string, unknown>;

interface Fixtures {
  grupos_recursos?: Linha[];
  recursos_produtivos?: Linha[];
  erroEm?: "grupos_recursos" | "recursos_produtivos";
}

function clienteFalso(fixtures: Fixtures): SupabaseClient {
  return {
    from(tabela: string) {
      const base = (fixtures as unknown as Record<string, Linha[]>)[tabela] ?? [];
      let linhas = base.slice();
      const erro = fixtures.erroEm === tabela ? { message: `falha simulada em ${tabela}`, code: "ERR" } : null;
      const api = {
        select(_cols: string) {
          return api;
        },
        eq(coluna: string, valor: unknown) {
          linhas = linhas.filter((l) => l[coluna] === valor);
          return api;
        },
        order(coluna: string) {
          linhas = linhas.slice().sort((a, b) => ((a[coluna] as string) < (b[coluna] as string) ? -1 : 1));
          return api;
        },
        then(resolve: (v: { data: unknown; error: typeof erro }) => void) {
          resolve({ data: erro ? null : linhas, error: erro });
        },
      };
      return api;
    },
  } as unknown as SupabaseClient;
}

describe("buscarGruposRecursosPcp", () => {
  it("1. Grupos ativos e mapa recurso->grupo montados corretamente", async () => {
    const client = clienteFalso({
      grupos_recursos: [
        { id: "grp-2", nome: "Usinagem", ativo: true },
        { id: "grp-1", nome: "Corte", ativo: true },
      ],
      recursos_produtivos: [
        { id: "rec-1", grupo_id: "grp-1", ativo: true },
        { id: "rec-2", grupo_id: "grp-2", ativo: true },
      ],
    });
    const resultado = await buscarGruposRecursosPcp(client);
    expect(resultado).toEqual({
      ok: true,
      grupos: [
        { id: "grp-1", nome: "Corte" },
        { id: "grp-2", nome: "Usinagem" },
      ],
      grupoIdPorRecursoId: { "rec-1": "grp-1", "rec-2": "grp-2" },
    });
  });

  it("2. Falha técnica em grupos_recursos: propagada", async () => {
    const client = clienteFalso({ erroEm: "grupos_recursos" });
    const resultado = await buscarGruposRecursosPcp(client);
    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });

  it("3. Falha técnica em recursos_produtivos: propagada", async () => {
    const client = clienteFalso({ grupos_recursos: [], erroEm: "recursos_produtivos" });
    const resultado = await buscarGruposRecursosPcp(client);
    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });
});
