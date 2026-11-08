// Etapa 65A — testes da Server Action adicionarOperacaoOfPcpAction:
// autenticação, autorização, isolamento multiempresa (via RLS do
// client de sessão), validação de entrada, mapeamento de erros. Mocka
// os clients e a função de lib (RPC real já testada isoladamente em
// persistirCriacaoOperacaoOfPcp.test.ts) - nunca exercita rede real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CHAVE_ENV_GRAVACOES = "PCP_GRAVACOES_OP_DEPENDENCIAS_HABILITADAS";

const getUserMock = vi.fn();
const empresaAtualIdMock = vi.fn();
const selectOfMock = vi.fn();
const rpcPermissaoMock = vi.fn();
const persistirMock = vi.fn();

vi.mock("@/lib/supabaseServerClient", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    rpc: (nome: string) => (nome === "empresa_atual_id" ? empresaAtualIdMock() : Promise.resolve({ data: null, error: null })),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: selectOfMock,
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabaseServiceClient", () => ({
  createSupabaseServiceClient: () => ({ rpc: rpcPermissaoMock }),
}));
vi.mock("../lib/persistirCriacaoOperacaoOfPcp", () => ({
  persistirCriacaoOperacaoOfPcp: (...args: unknown[]) => persistirMock(...args),
  classificarErroCriacaoOperacaoOfPcp: (mensagem: string) =>
    mensagem.includes("estado final") ? "of_estado_final" : "erro_desconhecido",
}));

import { adicionarOperacaoOfPcpAction, type DadosNovaOperacaoOfPcp } from "./adicionarOperacaoOfPcpAction";

const DADOS_PADRAO: DadosNovaOperacaoOfPcp = {
  codigoOperacional: "OP40",
  descricao: "Pintura",
  sequenciaVigente: 4,
  recursoVigenteId: null,
  tempoVigenteMinutos: null,
  motivo: "demanda nova identificada pelo PCP",
};

function configurarCaminhoFeliz() {
  getUserMock.mockResolvedValue({ data: { user: { id: "usuario-real-1" } }, error: null });
  empresaAtualIdMock.mockResolvedValue({ data: "empresa-1", error: null });
  selectOfMock.mockResolvedValue({ data: { id: "of-1" }, error: null });
  rpcPermissaoMock.mockResolvedValue({ data: true, error: null });
  persistirMock.mockResolvedValue({ novoOpId: "op-novo-1", erro: null });
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

describe("adicionarOperacaoOfPcpAction — bloqueio provisório de implantação", () => {
  it("bloqueia por padrão quando a chave de ambiente não está definida, mesmo com tudo mais válido", async () => {
    delete process.env[CHAVE_ENV_GRAVACOES];
    configurarCaminhoFeliz();

    const resultado = await adicionarOperacaoOfPcpAction("of-1", DADOS_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "implantacao_bloqueada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("adicionarOperacaoOfPcpAction — autenticação e autorização", () => {
  it("1. Sessão não autenticada: bloqueia tudo, nunca chega a checar permissão ou chamar a RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await adicionarOperacaoOfPcpAction("of-1", DADOS_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(rpcPermissaoMock).not.toHaveBeenCalled();
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it("2. Sem permissão pcp.criar_operacao_of: bloqueia antes de validar entrada ou chamar a RPC", async () => {
    configurarCaminhoFeliz();
    rpcPermissaoMock.mockResolvedValue({ data: false, error: null });

    const resultado = await adicionarOperacaoOfPcpAction("of-1", DADOS_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado" });
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it("3. Falha técnica ao checar permissão: nunca libera por omissão", async () => {
    configurarCaminhoFeliz();
    rpcPermissaoMock.mockResolvedValue({ data: null, error: { message: "falha" } });

    const resultado = await adicionarOperacaoOfPcpAction("of-1", DADOS_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("adicionarOperacaoOfPcpAction — isolamento multiempresa", () => {
  it("4. OF de outra empresa (RLS filtra, select retorna null): rejeita como 'of_nao_encontrada', nunca chama a RPC", async () => {
    configurarCaminhoFeliz();
    selectOfMock.mockResolvedValue({ data: null, error: null });

    const resultado = await adicionarOperacaoOfPcpAction("of-de-outra-empresa", DADOS_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "of_nao_encontrada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("adicionarOperacaoOfPcpAction — validação de entrada", () => {
  it.each([
    ["codigo", { ...DADOS_PADRAO, codigoOperacional: "  " }],
    ["descricao", { ...DADOS_PADRAO, descricao: "" }],
    ["sequencia", { ...DADOS_PADRAO, sequenciaVigente: -1 }],
    ["sequencia", { ...DADOS_PADRAO, sequenciaVigente: 1.5 }],
    ["tempo", { ...DADOS_PADRAO, tempoVigenteMinutos: -5 }],
    ["motivo", { ...DADOS_PADRAO, motivo: "   " }],
  ])("5. Campo %s inválido: rejeita antes de chamar a RPC", async (campo, dados) => {
    configurarCaminhoFeliz();

    const resultado = await adicionarOperacaoOfPcpAction("of-1", dados);

    expect(resultado).toEqual({ ok: false, motivo: "dados_invalidos", campo });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("adicionarOperacaoOfPcpAction — autoria e mapeamento de resultado", () => {
  it("6. Sucesso: passa o auth.uid() REAL como criado_por, nunca um valor do chamador", async () => {
    configurarCaminhoFeliz();

    const resultado = await adicionarOperacaoOfPcpAction("of-1", DADOS_PADRAO);

    expect(resultado).toEqual({ ok: true, novoOpId: "op-novo-1" });
    expect(persistirMock).toHaveBeenCalledWith(
      expect.anything(),
      "of-1",
      "usuario-real-1",
      "OP40",
      "Pintura",
      4,
      null,
      null,
      "demanda nova identificada pelo PCP",
    );
  });

  it("7. Gravação incerta: nunca tenta de novo sozinha, devolve o motivo distinto", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ novoOpId: null, erro: "falha de rede", gravacaoIncerta: true });

    const resultado = await adicionarOperacaoOfPcpAction("of-1", DADOS_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "gravacao_incerta" });
    expect(persistirMock).toHaveBeenCalledTimes(1);
  });

  it("8. Código duplicado (unique_violation real do banco): mapeia para motivo distinto", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({
      novoOpId: null,
      erro: 'duplicate key value violates unique constraint "ordens_fabricacao_operacoes_codigo_uniq"',
    });

    const resultado = await adicionarOperacaoOfPcpAction("of-1", DADOS_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "codigo_duplicado" });
  });

  it("9. OF em estado final: mapeia via o classificador da lib", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ novoOpId: null, erro: "OF x esta em estado final (cancelada) - ..." });

    const resultado = await adicionarOperacaoOfPcpAction("of-1", DADOS_PADRAO);

    expect(resultado).toEqual({ ok: false, motivo: "of_estado_final" });
  });
});
