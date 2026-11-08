// Etapa 65A — testes da Server Action alterarOperacaoOfPcpAction.
// Mesmo princípio de adicionarOperacaoOfPcpAction.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CHAVE_ENV_GRAVACOES = "PCP_GRAVACOES_OP_DEPENDENCIAS_HABILITADAS";

const getUserMock = vi.fn();
const empresaAtualIdMock = vi.fn();
const selectOpMock = vi.fn();
const rpcPermissaoMock = vi.fn();
const persistirMock = vi.fn();

vi.mock("@/lib/supabaseServerClient", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    rpc: (nome: string) => (nome === "empresa_atual_id" ? empresaAtualIdMock() : Promise.resolve({ data: null, error: null })),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: selectOpMock,
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabaseServiceClient", () => ({
  createSupabaseServiceClient: () => ({ rpc: rpcPermissaoMock }),
}));
vi.mock("../lib/persistirAlteracaoOperacaoOfPcp", () => ({
  persistirAlteracaoOperacaoOfPcp: (...args: unknown[]) => persistirMock(...args),
  classificarErroAlteracaoOperacaoOfPcp: (mensagem: string) =>
    mensagem.includes("execucao registrada") ? "apontamento_bloqueado" : "erro_desconhecido",
}));

import { alterarOperacaoOfPcpAction, type AlteracoesOperacaoOfPcp } from "./alterarOperacaoOfPcpAction";

const ALTERACOES_PADRAO: AlteracoesOperacaoOfPcp = {
  recursoVigenteId: "recurso-2",
  tempoVigenteMinutos: 45,
  sequenciaVigente: null,
  motivo: "troca de recurso por manutenção",
};

function configurarCaminhoFeliz() {
  getUserMock.mockResolvedValue({ data: { user: { id: "usuario-real-1" } }, error: null });
  empresaAtualIdMock.mockResolvedValue({ data: "empresa-1", error: null });
  selectOpMock.mockResolvedValue({ data: { id: "op-1" }, error: null });
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

describe("alterarOperacaoOfPcpAction — bloqueio provisório de implantação", () => {
  it("bloqueia por padrão quando a chave de ambiente não está definida, mesmo com tudo mais válido", async () => {
    delete process.env[CHAVE_ENV_GRAVACOES];
    configurarCaminhoFeliz();

    const resultado = await alterarOperacaoOfPcpAction("op-1", ALTERACOES_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "implantacao_bloqueada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("alterarOperacaoOfPcpAction — autenticação e autorização", () => {
  it("1. Sessão não autenticada: bloqueia tudo", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await alterarOperacaoOfPcpAction("op-1", ALTERACOES_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it("2. Sem permissão pcp.editar_operacao_of: bloqueia antes da RPC", async () => {
    configurarCaminhoFeliz();
    rpcPermissaoMock.mockResolvedValue({ data: false, error: null });

    const resultado = await alterarOperacaoOfPcpAction("op-1", ALTERACOES_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("alterarOperacaoOfPcpAction — isolamento multiempresa", () => {
  it("3. OP de outra empresa (RLS filtra): rejeita como 'op_nao_encontrada', nunca chama a RPC", async () => {
    configurarCaminhoFeliz();
    selectOpMock.mockResolvedValue({ data: null, error: null });

    const resultado = await alterarOperacaoOfPcpAction("op-de-outra-empresa", ALTERACOES_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "op_nao_encontrada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("alterarOperacaoOfPcpAction — validação de entrada", () => {
  it.each([
    ["sequencia", { ...ALTERACOES_PADRAO, sequenciaVigente: -1 }],
    ["tempo", { ...ALTERACOES_PADRAO, tempoVigenteMinutos: -1 }],
    ["motivo", { ...ALTERACOES_PADRAO, motivo: "" }],
  ])("4. Campo %s inválido: rejeita antes de chamar a RPC", async (campo, alteracoes) => {
    configurarCaminhoFeliz();

    const resultado = await alterarOperacaoOfPcpAction("op-1", alteracoes);

    expect(resultado).toEqual({ ok: false, motivo: "dados_invalidos", campo });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("alterarOperacaoOfPcpAction — autoria, bloqueio por apontamento e gravação incerta", () => {
  it("5. Sucesso: passa o auth.uid() REAL como alterado_por", async () => {
    configurarCaminhoFeliz();

    const resultado = await alterarOperacaoOfPcpAction("op-1", ALTERACOES_PADRAO);

    expect(resultado).toEqual({ ok: true });
    expect(persistirMock).toHaveBeenCalledWith(expect.anything(), "op-1", "usuario-real-1", "recurso-2", 45, null, "troca de recurso por manutenção");
  });

  it("6. OP com apontamento (concorrência: iniciada entre a leitura da tela e o clique em Salvar): rejeita com motivo distinto", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ erro: "alterar_y_operacao: OP op-1 ja tem execucao registrada - planejamento (Y) bloqueado apos inicio." });

    const resultado = await alterarOperacaoOfPcpAction("op-1", ALTERACOES_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "apontamento_bloqueado" });
  });

  it("7. Gravação incerta (falha de rede após possível gravação): nunca tenta de novo sozinha", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ erro: "falha de rede", gravacaoIncerta: true });

    const resultado = await alterarOperacaoOfPcpAction("op-1", ALTERACOES_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "gravacao_incerta" });
    expect(persistirMock).toHaveBeenCalledTimes(1);
  });
});
