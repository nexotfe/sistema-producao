// Etapa 65A — testes da Server Action removerOperacaoOfPcpAction.
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
vi.mock("../lib/persistirRemocaoOperacaoOfPcp", () => ({
  persistirRemocaoOperacaoOfPcp: (...args: unknown[]) => persistirMock(...args),
  classificarErroRemocaoOperacaoOfPcp: (mensagem: string) =>
    mensagem.includes("dependencias relacionadas")
      ? "dependencias_pendentes"
      : mensagem.includes("execucao registrada")
        ? "apontamento_bloqueado"
        : "erro_desconhecido",
}));

import { removerOperacaoOfPcpAction } from "./removerOperacaoOfPcpAction";

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

describe("removerOperacaoOfPcpAction — bloqueio provisório de implantação", () => {
  it("bloqueia por padrão quando a chave de ambiente não está definida, mesmo com tudo mais válido", async () => {
    delete process.env[CHAVE_ENV_GRAVACOES];
    configurarCaminhoFeliz();

    const resultado = await removerOperacaoOfPcpAction("op-1", "motivo real");

    expect(resultado).toEqual({ ok: false, motivo: "implantacao_bloqueada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("removerOperacaoOfPcpAction — autenticação e autorização", () => {
  it("1. Sessão não autenticada: bloqueia tudo", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await removerOperacaoOfPcpAction("op-1", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it("2. Sem permissão pcp.remover_operacao_of: bloqueia antes da RPC", async () => {
    configurarCaminhoFeliz();
    rpcPermissaoMock.mockResolvedValue({ data: false, error: null });

    const resultado = await removerOperacaoOfPcpAction("op-1", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("removerOperacaoOfPcpAction — isolamento multiempresa", () => {
  it("3. OP de outra empresa (RLS filtra): rejeita como 'op_nao_encontrada'", async () => {
    configurarCaminhoFeliz();
    selectOpMock.mockResolvedValue({ data: null, error: null });

    const resultado = await removerOperacaoOfPcpAction("op-de-outra-empresa", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "op_nao_encontrada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("removerOperacaoOfPcpAction — validação de entrada", () => {
  it("4. Motivo vazio: rejeita antes de chamar a RPC", async () => {
    configurarCaminhoFeliz();

    const resultado = await removerOperacaoOfPcpAction("op-1", "   ");

    expect(resultado).toEqual({ ok: false, motivo: "dados_invalidos" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("removerOperacaoOfPcpAction — autoria, concorrência e gravação incerta", () => {
  it("5. Sucesso: passa o auth.uid() REAL como marcado_por", async () => {
    configurarCaminhoFeliz();

    const resultado = await removerOperacaoOfPcpAction("op-1", "peça descontinuada");

    expect(resultado).toEqual({ ok: true });
    expect(persistirMock).toHaveBeenCalledWith(expect.anything(), "op-1", "usuario-real-1", "peça descontinuada");
  });

  it("6. Dependência criada durante a tentativa (concorrência): rejeita e NUNCA remove a dependência automaticamente", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ erro: "marcar_op_nao_aplicavel: OP op-1 tem dependencias relacionadas (op-1->op-2) - revise..." });

    const resultado = await removerOperacaoOfPcpAction("op-1", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "dependencias_pendentes" });
    // Nenhuma segunda chamada (ex.: a nenhuma RPC de remover dependência) foi feita.
    expect(persistirMock).toHaveBeenCalledTimes(1);
  });

  it("7. OP com apontamento registrado enquanto outro processo apontava: rejeita com motivo distinto", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ erro: "marcar_op_nao_aplicavel: OP op-1 ja tem execucao registrada - remocao operacional bloqueada apos inicio." });

    const resultado = await removerOperacaoOfPcpAction("op-1", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "apontamento_bloqueado" });
  });

  it("8. Gravação incerta: nunca tenta de novo sozinha", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ erro: "conexao perdida", gravacaoIncerta: true });

    const resultado = await removerOperacaoOfPcpAction("op-1", "motivo");

    expect(resultado).toEqual({ ok: false, motivo: "gravacao_incerta" });
    expect(persistirMock).toHaveBeenCalledTimes(1);
  });
});
