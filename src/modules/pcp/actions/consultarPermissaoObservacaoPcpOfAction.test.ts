import { afterEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const rpcPermissaoMock = vi.fn();

vi.mock("@/lib/supabaseServerClient", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));
vi.mock("@/lib/supabaseServiceClient", () => ({
  createSupabaseServiceClient: () => ({ rpc: rpcPermissaoMock }),
}));

import { consultarPermissaoObservacaoPcpOfAction } from "./consultarPermissaoObservacaoPcpOfAction";

afterEach(() => {
  vi.clearAllMocks();
});

describe("consultarPermissaoObservacaoPcpOfAction", () => {
  it("1. Sessão não autenticada: bloqueia", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await consultarPermissaoObservacaoPcpOfAction();

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(rpcPermissaoMock).not.toHaveBeenCalled();
  });

  it("2. Com permissão: devolve true e checa a chave certa", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcPermissaoMock.mockResolvedValue({ data: true, error: null });

    const resultado = await consultarPermissaoObservacaoPcpOfAction();

    expect(resultado).toEqual({ ok: true, podeEditarObservacao: true });
    expect(rpcPermissaoMock).toHaveBeenCalledWith("usuario_tem_permissao", {
      p_usuario_id: "usuario-1",
      p_chave: "pcp.editar_observacao_of",
    });
  });

  it("3. Sem permissão: devolve false honestamente", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcPermissaoMock.mockResolvedValue({ data: false, error: null });

    const resultado = await consultarPermissaoObservacaoPcpOfAction();

    expect(resultado).toEqual({ ok: true, podeEditarObservacao: false });
  });

  it("4. Falha técnica na RPC: erro_desconhecido", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcPermissaoMock.mockResolvedValue({ data: null, error: { message: "timeout" } });

    const resultado = await consultarPermissaoObservacaoPcpOfAction();

    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });
});
