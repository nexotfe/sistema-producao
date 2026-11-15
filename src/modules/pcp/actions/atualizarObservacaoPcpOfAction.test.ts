import { afterEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const rpcAtualizarMock = vi.fn();

vi.mock("@/lib/supabaseServerClient", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));
vi.mock("@/lib/supabaseServiceClient", () => ({
  createSupabaseServiceClient: () => ({ rpc: rpcAtualizarMock }),
}));

import { atualizarObservacaoPcpOfAction } from "./atualizarObservacaoPcpOfAction";

afterEach(() => {
  vi.clearAllMocks();
});

describe("atualizarObservacaoPcpOfAction", () => {
  it("1. Sessão não autenticada: bloqueia antes de chamar a RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await atualizarObservacaoPcpOfAction("of-1", "texto");

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(rpcAtualizarMock).not.toHaveBeenCalled();
  });

  it("2. Texto acima de 120 caracteres: rejeita antes de chamar a RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });

    const resultado = await atualizarObservacaoPcpOfAction("of-1", "x".repeat(121));

    expect(resultado).toEqual({ ok: false, motivo: "texto_muito_longo" });
    expect(rpcAtualizarMock).not.toHaveBeenCalled();
  });

  it("3. Gravação autorizada: chama a RPC com p_usuario_id da sessão real, nunca do corpo da requisição", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcAtualizarMock.mockResolvedValue({ data: { resultado: "gravado", of_id: "of-1" }, error: null });

    const resultado = await atualizarObservacaoPcpOfAction("of-1", "Aguardando ferramenta");

    expect(resultado).toEqual({ ok: true });
    expect(rpcAtualizarMock).toHaveBeenCalledWith("atualizar_observacao_pcp_of", {
      p_of_id: "of-1",
      p_usuario_id: "usuario-1",
      p_observacao: "Aguardando ferramenta",
    });
  });

  it("4. Usuário sem permissão: classifica como sem_permissao", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcAtualizarMock.mockResolvedValue({
      data: null,
      error: { message: "atualizar_observacao_pcp_of: usuario usuario-1 sem permissao pcp.editar_observacao_of." },
    });

    const resultado = await atualizarObservacaoPcpOfAction("of-1", "texto");

    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("5. OF em situação não permitida (já liberada/etc.): classifica como situacao_nao_permitida", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcAtualizarMock.mockResolvedValue({
      data: null,
      error: { message: "atualizar_observacao_pcp_of: OF of-1 em aprovada/liberada nao esta aguardando liberacao - OBS nao pode ser editada." },
    });

    const resultado = await atualizarObservacaoPcpOfAction("of-1", "texto");

    expect(resultado).toEqual({ ok: false, motivo: "situacao_nao_permitida" });
  });

  it("6. Empresa diferente: classifica como empresa_invalida", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcAtualizarMock.mockResolvedValue({
      data: null,
      error: { message: "atualizar_observacao_pcp_of: usuario usuario-1 nao pertence a empresa empresa-x da OF of-1." },
    });

    const resultado = await atualizarObservacaoPcpOfAction("of-1", "texto");

    expect(resultado).toEqual({ ok: false, motivo: "empresa_invalida" });
  });

  it("7. OF não encontrada: classifica como of_nao_encontrada", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcAtualizarMock.mockResolvedValue({
      data: null,
      error: { message: "atualizar_observacao_pcp_of: OF of-1 nao encontrada." },
    });

    const resultado = await atualizarObservacaoPcpOfAction("of-1", "texto");

    expect(resultado).toEqual({ ok: false, motivo: "of_nao_encontrada" });
  });

  it("8. Falha de rede (nunca completou o ciclo requisição/resposta): gravacao_incerta, nunca tratado como sucesso ou falha definitiva", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcAtualizarMock.mockRejectedValue(new Error("fetch failed"));

    const resultado = await atualizarObservacaoPcpOfAction("of-1", "texto");

    expect(resultado).toEqual({ ok: false, motivo: "gravacao_incerta" });
  });
});
