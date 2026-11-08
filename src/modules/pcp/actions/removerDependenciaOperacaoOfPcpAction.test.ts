// Etapa 66E (Fase B) — testes da Server Action removerDependenciaOperacaoOfPcpAction.
// Mesmo princípio de adicionarDependenciaOperacaoOfPcpAction.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CHAVE_ENV_GRAVACOES = "PCP_GRAVACOES_OP_DEPENDENCIAS_HABILITADAS";

const getUserMock = vi.fn();
const empresaAtualIdMock = vi.fn();
const selectOpsMock = vi.fn();
const rpcPermissaoMock = vi.fn();
const persistirMock = vi.fn();
const ambienteHabilitadoMock = vi.fn();

vi.mock("@/lib/supabaseServerClient", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    rpc: (nome: string) => (nome === "empresa_atual_id" ? empresaAtualIdMock() : Promise.resolve({ data: null, error: null })),
    from: () => ({
      select: () => ({
        in: selectOpsMock,
      }),
    }),
  }),
}));
vi.mock("@/lib/supabaseServiceClient", () => ({
  createSupabaseServiceClient: () => ({ rpc: rpcPermissaoMock }),
}));
vi.mock("../lib/persistirAlteracaoDependenciaOperacaoOfPcp", () => ({
  persistirAlteracaoDependenciaOperacaoOfPcp: (...args: unknown[]) => persistirMock(...args),
  verificarAmbienteDependenciaOperacaoOfPcpHabilitado: () => ambienteHabilitadoMock(),
  classificarErroAlteracaoDependenciaOperacaoOfPcp: (mensagem: string) =>
    mensagem.includes("execucao registrada") ? "apontamento_bloqueado" : "erro_desconhecido",
}));

import { removerDependenciaOperacaoOfPcpAction } from "./removerDependenciaOperacaoOfPcpAction";

function configurarCaminhoFeliz() {
  getUserMock.mockResolvedValue({ data: { user: { id: "usuario-real-1" } }, error: null });
  empresaAtualIdMock.mockResolvedValue({ data: "empresa-1", error: null });
  selectOpsMock.mockResolvedValue({ data: [{ id: "op-1" }, { id: "op-2" }], error: null });
  ambienteHabilitadoMock.mockResolvedValue(true);
  rpcPermissaoMock.mockResolvedValue({ data: true, error: null });
  persistirMock.mockResolvedValue({ erro: null });
}

beforeEach(() => {
  // Etapa "fechamento objetivo para publicação" (pós-66L): o bloqueio
  // provisório de implantação bloqueia por padrão - os testes abaixo
  // exercitam o comportamento APÓS o deploy ligar a chave, exatamente
  // como os testes desta Action já faziam antes deste bloqueio existir.
  process.env[CHAVE_ENV_GRAVACOES] = "true";
});

afterEach(() => {
  delete process.env[CHAVE_ENV_GRAVACOES];
  vi.clearAllMocks();
});

describe("removerDependenciaOperacaoOfPcpAction — bloqueio provisório de implantação", () => {
  it("bloqueia por padrão quando a chave de ambiente não está definida, mesmo com tudo mais válido", async () => {
    delete process.env[CHAVE_ENV_GRAVACOES];
    configurarCaminhoFeliz();

    const resultado = await removerDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo real");

    expect(resultado).toEqual({ ok: false, motivo: "implantacao_bloqueada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("removerDependenciaOperacaoOfPcpAction — autenticação e autorização", () => {
  it("1. Sessão não autenticada: bloqueia tudo", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await removerDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it("2. Sem permissão pcp.remover_dependencia_operacao: bloqueia antes da RPC", async () => {
    configurarCaminhoFeliz();
    rpcPermissaoMock.mockResolvedValue({ data: false, error: null });

    const resultado = await removerDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado" });
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it("2b. Ambiente não habilitado (migration candidata ausente): bloqueia ANTES de checar permissão (Etapa 66F)", async () => {
    configurarCaminhoFeliz();
    ambienteHabilitadoMock.mockResolvedValue(false);

    const resultado = await removerDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "ambiente_nao_habilitado" });
    expect(rpcPermissaoMock).not.toHaveBeenCalled();
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("removerDependenciaOperacaoOfPcpAction — isolamento multiempresa", () => {
  it("3. Uma das OPs não pertence à empresa atual: rejeita como 'op_nao_encontrada'", async () => {
    configurarCaminhoFeliz();
    selectOpsMock.mockResolvedValue({ data: [{ id: "op-1" }], error: null });

    const resultado = await removerDependenciaOperacaoOfPcpAction("op-1", "op-de-outra-empresa", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "op_nao_encontrada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("removerDependenciaOperacaoOfPcpAction — validação de entrada", () => {
  it("4. Motivo vazio: rejeita antes de chamar a RPC", async () => {
    configurarCaminhoFeliz();

    const resultado = await removerDependenciaOperacaoOfPcpAction("op-1", "op-2", "   ");

    expect(resultado).toEqual({ ok: false, motivo: "dados_invalidos" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("removerDependenciaOperacaoOfPcpAction — autoria, idempotência e gravação incerta", () => {
  it("5. Sucesso: passa o auth.uid() REAL como alterado_por e p_acao='remover'", async () => {
    configurarCaminhoFeliz();

    const resultado = await removerDependenciaOperacaoOfPcpAction("op-1", "op-2", "pré-requisito não é mais válido");

    expect(resultado).toEqual({ ok: true });
    expect(persistirMock).toHaveBeenCalledWith(expect.anything(), "op-1", "op-2", "remover", "usuario-real-1", "pré-requisito não é mais válido");
  });

  it("6. Remover um vínculo que já não existe: sucesso idempotente (a RPC nunca dá erro nesse caso)", async () => {
    configurarCaminhoFeliz();

    const resultado = await removerDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo");

    expect(resultado).toEqual({ ok: true });
  });

  it("7. OP com apontamento registrado: rejeita com motivo próprio", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({
      erro: "alterar_dependencia_operacao: uma das OPs (op-1 ou op-2) ja tem execucao registrada - dependencia nao pode mais ser alterada.",
    });

    const resultado = await removerDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "apontamento_bloqueado" });
  });

  it("8. Gravação incerta: nunca tenta de novo sozinha", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ erro: "conexao perdida", gravacaoIncerta: true });

    const resultado = await removerDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "gravacao_incerta" });
    expect(persistirMock).toHaveBeenCalledTimes(1);
  });
});
