import { afterEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const rpcPermissaoMock = vi.fn();
const buscarMock = vi.fn();

vi.mock("@/lib/supabaseServerClient", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));
vi.mock("@/lib/supabaseServiceClient", () => ({
  createSupabaseServiceClient: () => ({ rpc: rpcPermissaoMock }),
}));
vi.mock("../lib/buscarGruposRecursosPcp", () => ({
  buscarGruposRecursosPcp: (...args: unknown[]) => buscarMock(...args),
}));

import { consultarGruposRecursosPcpAction } from "./consultarGruposRecursosPcpAction";

afterEach(() => {
  vi.clearAllMocks();
});

describe("consultarGruposRecursosPcpAction", () => {
  it("1. Sessão não autenticada: bloqueia", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await consultarGruposRecursosPcpAction();

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(buscarMock).not.toHaveBeenCalled();
  });

  it("2. Sem permissão: bloqueia", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcPermissaoMock.mockResolvedValue({ data: false, error: null });

    const resultado = await consultarGruposRecursosPcpAction();

    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado" });
    expect(buscarMock).not.toHaveBeenCalled();
  });

  it("3. Autorizado: repassa o resultado real", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcPermissaoMock.mockResolvedValue({ data: true, error: null });
    buscarMock.mockResolvedValue({ ok: true, grupos: [{ id: "grp-1", nome: "Corte" }], grupoIdPorRecursoId: { "rec-1": "grp-1" } });

    const resultado = await consultarGruposRecursosPcpAction();

    expect(resultado).toEqual({ ok: true, grupos: [{ id: "grp-1", nome: "Corte" }], grupoIdPorRecursoId: { "rec-1": "grp-1" } });
  });
});
