// Etapa 65C — testes de consultarRecursosProdutivosPcpAction.
import { afterEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const buscarMock = vi.fn();

vi.mock("@/lib/supabaseServerClient", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));
vi.mock("../lib/buscarRecursosProdutivosPcp", () => ({
  buscarRecursosProdutivosPcp: (...args: unknown[]) => buscarMock(...args),
}));

import { consultarRecursosProdutivosPcpAction } from "./consultarRecursosProdutivosPcpAction";

afterEach(() => {
  vi.clearAllMocks();
});

describe("consultarRecursosProdutivosPcpAction", () => {
  it("1. Sessão não autenticada: bloqueia, nunca chega a consultar recursos", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await consultarRecursosProdutivosPcpAction();

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(buscarMock).not.toHaveBeenCalled();
  });

  it("2. Sucesso: repassa a lista da lib sem alterar", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    buscarMock.mockResolvedValue({ ok: true, recursos: [{ id: "rec-1", label: "TC01 — Torno CNC 01" }] });

    const resultado = await consultarRecursosProdutivosPcpAction();

    expect(resultado).toEqual({ ok: true, recursos: [{ id: "rec-1", label: "TC01 — Torno CNC 01" }] });
  });
});
