// Etapa 66E (Fase B) — testes da Server Action
// consultarPermissoesDependenciasOperacoesOfPcpAction.
import { afterEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const rpcPermissaoMock = vi.fn();
const ambienteHabilitadoMock = vi.fn();

vi.mock("@/lib/supabaseServerClient", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));
vi.mock("@/lib/supabaseServiceClient", () => ({
  createSupabaseServiceClient: () => ({ rpc: rpcPermissaoMock }),
}));
vi.mock("../lib/persistirAlteracaoDependenciaOperacaoOfPcp", () => ({
  verificarAmbienteDependenciaOperacaoOfPcpHabilitado: () => ambienteHabilitadoMock(),
}));

import { consultarPermissoesDependenciasOperacoesOfPcpAction } from "./consultarPermissoesDependenciasOperacoesOfPcpAction";

afterEach(() => {
  vi.clearAllMocks();
});

describe("consultarPermissoesDependenciasOperacoesOfPcpAction", () => {
  it("1. Sessão não autenticada: bloqueia tudo", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await consultarPermissoesDependenciasOperacoesOfPcpAction();

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(rpcPermissaoMock).not.toHaveBeenCalled();
  });

  it("2. Checa as 2 chaves reais e devolve os 2 booleanos + o probe real de ambiente (Etapa 66F)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcPermissaoMock.mockImplementation((_nome: string, params: { p_chave: string }) =>
      Promise.resolve({ data: params.p_chave === "pcp.criar_dependencia_operacao", error: null }),
    );
    ambienteHabilitadoMock.mockResolvedValue(true);

    const resultado = await consultarPermissoesDependenciasOperacoesOfPcpAction();

    expect(resultado).toEqual({ ok: true, podeCriarDependencia: true, podeRemoverDependencia: false, ambienteHabilitado: true });
    expect(rpcPermissaoMock).toHaveBeenCalledWith("usuario_tem_permissao", {
      p_usuario_id: "usuario-1",
      p_chave: "pcp.criar_dependencia_operacao",
    });
    expect(rpcPermissaoMock).toHaveBeenCalledWith("usuario_tem_permissao", {
      p_usuario_id: "usuario-1",
      p_chave: "pcp.remover_dependencia_operacao",
    });
  });

  it("3. Falha técnica numa das checagens: erro_desconhecido", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcPermissaoMock.mockResolvedValue({ data: null, error: { message: "timeout" } });
    ambienteHabilitadoMock.mockResolvedValue(true);

    const resultado = await consultarPermissoesDependenciasOperacoesOfPcpAction();

    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });

  it("4. Ambiente não habilitado: devolve ambienteHabilitado=false honestamente, mesmo com permissão concedida (Etapa 66F)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null });
    rpcPermissaoMock.mockResolvedValue({ data: true, error: null });
    ambienteHabilitadoMock.mockResolvedValue(false);

    const resultado = await consultarPermissoesDependenciasOperacoesOfPcpAction();

    expect(resultado).toEqual({ ok: true, podeCriarDependencia: true, podeRemoverDependencia: true, ambienteHabilitado: false });
  });
});
