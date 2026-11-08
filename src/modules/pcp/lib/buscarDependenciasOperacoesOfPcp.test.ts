// Etapa 59A — fixtures isoladas, nenhuma gravação no Supabase.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarDependenciasOperacoesOfPcp } from "./buscarDependenciasOperacoesOfPcp";

type Linha = Record<string, unknown>;

interface Fixtures {
  of_operacao_dependencias: Linha[];
  ordens_fabricacao_operacoes: Linha[];
  erroEm?: "of_operacao_dependencias" | "ordens_fabricacao_operacoes";
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
        in(coluna: string, valores: unknown[]) {
          linhas = linhas.filter((l) => valores.includes(l[coluna]));
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

describe("buscarDependenciasOperacoesOfPcp", () => {
  it("1. Lista de ops vazia: mapa vazio, sem nenhuma consulta de dependência", async () => {
    const client = clienteFalso({ of_operacao_dependencias: [], ordens_fabricacao_operacoes: [] });
    const resultado = await buscarDependenciasOperacoesOfPcp(client, []);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.dependenciasPorOpId.size).toBe(0);
    }
  });

  it("2. OP é origem (pré-requisito) de outra: papel 'origem', com o código real da relacionada", async () => {
    const client = clienteFalso({
      of_operacao_dependencias: [{ op_origem_id: "op-1", op_dependente_id: "op-2" }],
      ordens_fabricacao_operacoes: [
        { id: "op-1", codigo_operacional: "OP10" },
        { id: "op-2", codigo_operacional: "OP20" },
      ],
    });
    const resultado = await buscarDependenciasOperacoesOfPcp(client, ["op-1", "op-2"]);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.dependenciasPorOpId.get("op-1")).toEqual([
        { opRelacionadaId: "op-2", codigoOperacionalRelacionada: "OP20", papel: "origem" },
      ]);
      expect(resultado.dependenciasPorOpId.get("op-2")).toEqual([
        { opRelacionadaId: "op-1", codigoOperacionalRelacionada: "OP10", papel: "dependente" },
      ]);
    }
  });

  it("3. OP sem nenhuma dependência relacionada: ausente do mapa (nunca uma entrada vazia enganosa)", async () => {
    const client = clienteFalso({
      of_operacao_dependencias: [{ op_origem_id: "op-1", op_dependente_id: "op-2" }],
      ordens_fabricacao_operacoes: [
        { id: "op-1", codigo_operacional: "OP10" },
        { id: "op-2", codigo_operacional: "OP20" },
      ],
    });
    const resultado = await buscarDependenciasOperacoesOfPcp(client, ["op-1", "op-2", "op-3"]);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.dependenciasPorOpId.has("op-3")).toBe(false);
    }
  });

  it("4. Erro ao consultar of_operacao_dependencias: propaga falha, nunca 'sem dependências' por omissão", async () => {
    const client = clienteFalso({
      of_operacao_dependencias: [],
      ordens_fabricacao_operacoes: [],
      erroEm: "of_operacao_dependencias",
    });
    const resultado = await buscarDependenciasOperacoesOfPcp(client, ["op-1"]);
    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });
});
