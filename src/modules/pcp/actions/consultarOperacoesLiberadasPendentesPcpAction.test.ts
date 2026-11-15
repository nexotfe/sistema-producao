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
vi.mock("../lib/buscarOperacoesLiberadasPendentesPcp", () => ({
  buscarOperacoesLiberadasPendentesPcp: (...args: unknown[]) => buscarMock(...args),
}));

import { consultarOperacoesLiberadasPendentesPcpAction } from "./consultarOperacoesLiberadasPendentesPcpAction";

afterEach(() => {
  vi.clearAllMocks();
});

describe("consultarOperacoesLiberadasPendentesPcpAction", () => {
  it("1. Sessão não autenticada: bloqueia antes de checar permissão", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await consultarOperacoesLiberadasPendentesPcpAction();

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(rpcPermissaoMock).not.toHaveBeenCalled();
    expect(buscarMock).not.toHaveBeenCalled();
  });

  it("2. Sem a permissão pcp.visualizar_programacao: bloqueia antes de consultar", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcPermissaoMock.mockResolvedValue({ data: false, error: null });

    const resultado = await consultarOperacoesLiberadasPendentesPcpAction();

    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado" });
    expect(buscarMock).not.toHaveBeenCalled();
  });

  it("3. Autorizado: repassa o resultado real da consulta", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcPermissaoMock.mockResolvedValue({ data: true, error: null });
    buscarMock.mockResolvedValue({ ok: true, itens: [], nomeEmpresa: "Empresa Teste" });

    const resultado = await consultarOperacoesLiberadasPendentesPcpAction();

    expect(resultado).toEqual({ ok: true, itens: [], nomeEmpresa: "Empresa Teste" });
    expect(rpcPermissaoMock).toHaveBeenCalledWith("usuario_tem_permissao", {
      p_usuario_id: "usuario-1",
      p_chave: "pcp.visualizar_programacao",
    });
  });
});
