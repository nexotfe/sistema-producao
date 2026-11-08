// Etapa 66E (Fase B) — testes da Server Action adicionarDependenciaOperacaoOfPcpAction.
// Mesmo princípio de adicionarOperacaoOfPcpAction.test.ts/removerOperacaoOfPcpAction.test.ts,
// adaptado para a consulta de DUAS OPs via .in() em vez de uma via .eq().maybeSingle().
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
    mensagem.includes("criaria ciclo")
      ? "ciclo_detectado"
      : mensagem.includes("execucao registrada")
        ? "apontamento_bloqueado"
        : mensagem.includes("MESMA OF")
          ? "of_diferente"
          : "erro_desconhecido",
}));

import { adicionarDependenciaOperacaoOfPcpAction } from "./adicionarDependenciaOperacaoOfPcpAction";

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

describe("adicionarDependenciaOperacaoOfPcpAction — bloqueio provisório de implantação", () => {
  it("bloqueia por padrão quando a chave de ambiente não está definida, mesmo com tudo mais válido", async () => {
    delete process.env[CHAVE_ENV_GRAVACOES];
    configurarCaminhoFeliz();

    const resultado = await adicionarDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo real");

    expect(resultado).toEqual({ ok: false, motivo: "implantacao_bloqueada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("adicionarDependenciaOperacaoOfPcpAction — autenticação e autorização", () => {
  it("1. Sessão não autenticada: bloqueia tudo", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await adicionarDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it("2. Sem permissão pcp.criar_dependencia_operacao: bloqueia antes da RPC", async () => {
    configurarCaminhoFeliz();
    rpcPermissaoMock.mockResolvedValue({ data: false, error: null });

    const resultado = await adicionarDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado" });
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it("2b. Ambiente não habilitado (migration candidata ausente): bloqueia ANTES de checar permissão (Etapa 66F)", async () => {
    configurarCaminhoFeliz();
    ambienteHabilitadoMock.mockResolvedValue(false);

    const resultado = await adicionarDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "ambiente_nao_habilitado" });
    expect(rpcPermissaoMock).not.toHaveBeenCalled();
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("adicionarDependenciaOperacaoOfPcpAction — isolamento multiempresa e integridade", () => {
  it("3. Uma das OPs não pertence à empresa atual (RLS filtra, .in() devolve só 1): rejeita como 'op_nao_encontrada'", async () => {
    configurarCaminhoFeliz();
    selectOpsMock.mockResolvedValue({ data: [{ id: "op-1" }], error: null });

    const resultado = await adicionarDependenciaOperacaoOfPcpAction("op-1", "op-de-outra-empresa", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "op_nao_encontrada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it("4. Nenhuma das duas OPs encontrada: rejeita como 'op_nao_encontrada'", async () => {
    configurarCaminhoFeliz();
    selectOpsMock.mockResolvedValue({ data: [], error: null });

    const resultado = await adicionarDependenciaOperacaoOfPcpAction("op-x", "op-y", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "op_nao_encontrada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("adicionarDependenciaOperacaoOfPcpAction — validação de entrada", () => {
  it("5. Motivo vazio: rejeita antes de chamar a RPC", async () => {
    configurarCaminhoFeliz();

    const resultado = await adicionarDependenciaOperacaoOfPcpAction("op-1", "op-2", "   ");

    expect(resultado).toEqual({ ok: false, motivo: "dados_invalidos" });
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it("6. OP origem igual à dependente: rejeita antes de chamar a RPC (nunca autorreferência)", async () => {
    configurarCaminhoFeliz();

    const resultado = await adicionarDependenciaOperacaoOfPcpAction("op-1", "op-1", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "dados_invalidos" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("adicionarDependenciaOperacaoOfPcpAction — autoria, bloqueios reais e gravação incerta", () => {
  it("7. Sucesso: passa o auth.uid() REAL como alterado_por e p_acao='criar'", async () => {
    configurarCaminhoFeliz();

    const resultado = await adicionarDependenciaOperacaoOfPcpAction("op-1", "op-2", "pré-requisito real de fabricação");

    expect(resultado).toEqual({ ok: true });
    expect(persistirMock).toHaveBeenCalledWith(expect.anything(), "op-1", "op-2", "criar", "usuario-real-1", "pré-requisito real de fabricação");
  });

  it("8. Ciclo detectado pela RPC: rejeita com motivo próprio", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ erro: "Dependencia rejeitada: criaria ciclo (ja existe caminho de op-2 para op-1)." });

    const resultado = await adicionarDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "ciclo_detectado" });
  });

  it("9. OP com apontamento registrado: rejeita com motivo distinto", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({
      erro: "alterar_dependencia_operacao: uma das OPs (op-1 ou op-2) ja tem execucao registrada - dependencia nao pode mais ser alterada.",
    });

    const resultado = await adicionarDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "apontamento_bloqueado" });
  });

  it("10. OF diferente entre as duas OPs: rejeita com motivo próprio", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ erro: "Dependencia so e permitida entre OPs da MESMA OF (PCP-P6C.3 Parte 19)." });

    const resultado = await adicionarDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "of_diferente" });
  });

  it("11. Gravação incerta: nunca tenta de novo sozinha", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ erro: "conexao perdida", gravacaoIncerta: true });

    const resultado = await adicionarDependenciaOperacaoOfPcpAction("op-1", "op-2", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "gravacao_incerta" });
    expect(persistirMock).toHaveBeenCalledTimes(1);
  });
});
