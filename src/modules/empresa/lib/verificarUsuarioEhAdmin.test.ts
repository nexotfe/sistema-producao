import { describe, expect, it, vi } from "vitest";
import { verificarUsuarioEhAdmin } from "./verificarUsuarioEhAdmin";

function criarClienteMock(resposta: { data?: boolean; error?: { message: string } | null }) {
  return {
    rpc: vi.fn(async (nome: string) => {
      if (nome !== "usuario_e_admin") {
        throw new Error(`RPC inesperada no mock: ${nome}`);
      }
      return { data: resposta.data ?? null, error: resposta.error ?? null };
    }),
  };
}

describe("verificarUsuarioEhAdmin", () => {
  it("admin: retorna true", async () => {
    const client = criarClienteMock({ data: true });
    await expect(verificarUsuarioEhAdmin(client as any)).resolves.toBe(true);
  });

  it("não-admin: retorna false", async () => {
    const client = criarClienteMock({ data: false });
    await expect(verificarUsuarioEhAdmin(client as any)).resolves.toBe(false);
  });

  it("erro na RPC: lança erro explícito, não mascara como false", async () => {
    const client = criarClienteMock({ error: { message: "permission denied" } });
    await expect(verificarUsuarioEhAdmin(client as any)).rejects.toThrow(/permission denied/);
  });
});
