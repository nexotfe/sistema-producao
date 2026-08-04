// Cobre a regra de resolução determinística: prefere status='ativo';
// na ausência, o mais recente por created_at; desempate por id -
// idêntica à função SQL resolver_bom_ativo_produto, que usa
// order by (status='ativo') desc, created_at desc, id desc limit 1.
// Existe porque a versão anterior usava boms.find(status==='ativo'),
// que dependia da ordem arbitrária de retorno do banco quando havia
// mais de um BOM com status='ativo'.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverBomAtivo } from "./resolverBomAtivo";

type BomRow = { id: string; produto_id: string; status: string; created_at: string; ativo: boolean; deleted_at: string | null };

function criarClienteFalso(boms: BomRow[]): SupabaseClient {
  const filtrosEq: Record<string, unknown> = {};
  const filtrosIs: Record<string, unknown> = {};

  const builder = {
    select() {
      return builder;
    },
    eq(coluna: string, valor: unknown) {
      filtrosEq[coluna] = valor;
      return builder;
    },
    is(coluna: string, valor: unknown) {
      filtrosIs[coluna] = valor;
      return builder;
    },
    then(resolve: (valor: { data: unknown[]; error: null }) => void) {
      const filtradas = boms.filter((linha) => {
        for (const [coluna, valor] of Object.entries(filtrosEq)) {
          if ((linha as Record<string, unknown>)[coluna] !== valor) return false;
        }
        for (const [coluna, valor] of Object.entries(filtrosIs)) {
          if ((linha as Record<string, unknown>)[coluna] !== valor) return false;
        }
        return true;
      });
      resolve({ data: filtradas, error: null });
    },
  };

  return {
    from() {
      return builder;
    },
  } as unknown as SupabaseClient;
}

function bom(overrides: Partial<BomRow> = {}): BomRow {
  return {
    id: "bom-1",
    produto_id: "produto-1",
    status: "rascunho",
    created_at: "2026-01-01",
    ativo: true,
    deleted_at: null,
    ...overrides,
  };
}

describe("resolverBomAtivo", () => {
  it("retorna null quando o produto não tem nenhum BOM", async () => {
    const client = criarClienteFalso([]);
    expect(await resolverBomAtivo(client, "produto-1")).toBeNull();
  });

  it("com um único BOM não-ativo, resolve para ele (fallback mais recente)", async () => {
    const client = criarClienteFalso([bom({ id: "bom-rascunho", status: "rascunho" })]);
    expect(await resolverBomAtivo(client, "produto-1")).toBe("bom-rascunho");
  });

  it("prefere status='ativo' mesmo quando não é o mais recente por created_at", async () => {
    const client = criarClienteFalso([
      bom({ id: "bom-rascunho-novo", status: "rascunho", created_at: "2026-06-01" }),
      bom({ id: "bom-ativo-velho", status: "ativo", created_at: "2026-01-01" }),
    ]);
    expect(await resolverBomAtivo(client, "produto-1")).toBe("bom-ativo-velho");
  });

  it("com dois BOMs status='ativo', escolhe o de created_at mais recente - não depende da ordem de retorno do banco", async () => {
    const emOrdem = criarClienteFalso([
      bom({ id: "bom-ativo-antigo", status: "ativo", created_at: "2026-01-01" }),
      bom({ id: "bom-ativo-recente", status: "ativo", created_at: "2026-06-01" }),
    ]);
    const invertida = criarClienteFalso([
      bom({ id: "bom-ativo-recente", status: "ativo", created_at: "2026-06-01" }),
      bom({ id: "bom-ativo-antigo", status: "ativo", created_at: "2026-01-01" }),
    ]);

    expect(await resolverBomAtivo(emOrdem, "produto-1")).toBe("bom-ativo-recente");
    expect(await resolverBomAtivo(invertida, "produto-1")).toBe("bom-ativo-recente");
  });

  it("com dois BOMs status='ativo' e mesmo created_at, desempata por id (maior primeiro), em qualquer ordem de retorno", async () => {
    const emOrdem = criarClienteFalso([
      bom({ id: "aaa", status: "ativo", created_at: "2026-01-01" }),
      bom({ id: "bbb", status: "ativo", created_at: "2026-01-01" }),
    ]);
    const invertida = criarClienteFalso([
      bom({ id: "bbb", status: "ativo", created_at: "2026-01-01" }),
      bom({ id: "aaa", status: "ativo", created_at: "2026-01-01" }),
    ]);

    expect(await resolverBomAtivo(emOrdem, "produto-1")).toBe("bbb");
    expect(await resolverBomAtivo(invertida, "produto-1")).toBe("bbb");
  });

  it("ignora BOM com ativo=false mesmo com status='ativo'", async () => {
    const client = criarClienteFalso([bom({ id: "bom-desativado", status: "ativo", ativo: false })]);
    expect(await resolverBomAtivo(client, "produto-1")).toBeNull();
  });

  it("lança erro descritivo quando a consulta falha", async () => {
    const clienteComErro = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          is() {
            return this;
          },
          then(resolve: (valor: { data: null; error: { message: string } }) => void) {
            resolve({ data: null, error: { message: "conexão perdida" } });
          },
        };
      },
    } as unknown as SupabaseClient;

    await expect(resolverBomAtivo(clienteComErro, "produto-1")).rejects.toThrow(/conexão perdida/);
  });
});
