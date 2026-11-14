// Testes da Server Action liberarOfCombinadoPcpAction: autenticação,
// isolamento multiempresa (via RLS do client de sessão), portão de
// implantação (reaproveitado de Liberação de OF), permissões/estados/
// concorrência (delegados à RPC), aprovação+liberação combinadas vs.
// só liberação, idempotência e preservação de dados em erro. Mocka os
// clients e a lib (RPC real já testada isoladamente em
// persistirAprovacaoELiberacaoOfPcp.test.ts) - nunca exercita rede real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CHAVE_ENV_LIBERACAO = "PCP_LIBERACAO_OF_HABILITADA";
const CHAVE_ENV_APROVACAO = "PCP_APROVACAO_OF_HABILITADA";

const getUserMock = vi.fn();
const empresaAtualIdMock = vi.fn();
const selectOfMock = vi.fn();
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
vi.mock("../lib/persistirAprovacaoELiberacaoOfPcp", () => ({
  persistirAprovacaoELiberacaoOfPcp: (...args: unknown[]) => persistirMock(...args),
  classificarErroAprovacaoELiberacaoOfPcp: (mensagem: string) => {
    if (mensagem.includes("sessao invalida")) return "nao_autenticado";
    if (mensagem.includes("empresa atual nao encontrada")) return "empresa_nao_encontrada";
    if (mensagem.includes("usuario sem permissao para aprovar OF")) return "nao_autorizado_aprovar";
    if (mensagem.includes("usuario sem permissao para liberar OF")) return "nao_autorizado_liberar";
    if (mensagem.includes("OF") && mensagem.includes("nao encontrada")) return "of_nao_encontrada";
    if (mensagem.includes("nao e um usuario valido")) return "liberado_por_invalido";
    if (mensagem.includes("Momento Y pendente")) return "momento_y_pendente";
    if (mensagem.includes("transicao invalida") || mensagem.includes("precisa estar aprovada+planejada")) return "estado_incompativel";
    if (mensagem.includes("estado mudou durante a operacao")) return "conflito_concorrencia";
    return "erro_desconhecido";
  },
}));

import { liberarOfCombinadoPcpAction } from "./liberarOfCombinadoPcpAction";

function configurarCaminhoFeliz() {
  getUserMock.mockResolvedValue({ data: { user: { id: "usuario-real-1" } }, error: null });
  empresaAtualIdMock.mockResolvedValue({ data: "empresa-1", error: null });
  selectOfMock.mockResolvedValue({ data: { id: "of-1" }, error: null });
  persistirMock.mockResolvedValue({ resultado: "liberada", numeroOf: "900301-0001", aprovacaoRealizada: true, erro: null });
}

beforeEach(() => {
  process.env[CHAVE_ENV_LIBERACAO] = "true";
});

afterEach(() => {
  delete process.env[CHAVE_ENV_LIBERACAO];
  delete process.env[CHAVE_ENV_APROVACAO];
  vi.clearAllMocks();
});

describe("liberarOfCombinadoPcpAction — portão reaproveitado de Liberação de OF", () => {
  it("1. Bloqueia por padrão quando PCP_LIBERACAO_OF_HABILITADA não está definida", async () => {
    delete process.env[CHAVE_ENV_LIBERACAO];
    configurarCaminhoFeliz();

    const resultado = await liberarOfCombinadoPcpAction("of-1");

    expect(resultado).toEqual({ ok: false, motivo: "implantacao_bloqueada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it("2. Nunca reaproveita o portão de Aprovação de OF - continua bloqueado mesmo com PCP_APROVACAO_OF_HABILITADA=true", async () => {
    delete process.env[CHAVE_ENV_LIBERACAO];
    process.env[CHAVE_ENV_APROVACAO] = "true";
    configurarCaminhoFeliz();

    const resultado = await liberarOfCombinadoPcpAction("of-1");

    expect(resultado).toEqual({ ok: false, motivo: "implantacao_bloqueada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("liberarOfCombinadoPcpAction — autenticação, empresa e isolamento multiempresa", () => {
  it("3. Sessão não autenticada: bloqueia tudo, nunca chega a chamar a RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await liberarOfCombinadoPcpAction("of-1");

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it("4. Empresa atual não encontrada: bloqueia antes de chamar a RPC", async () => {
    configurarCaminhoFeliz();
    empresaAtualIdMock.mockResolvedValue({ data: null, error: null });

    const resultado = await liberarOfCombinadoPcpAction("of-1");

    expect(resultado).toEqual({ ok: false, motivo: "empresa_nao_encontrada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it("5. OF de outra empresa (RLS filtra, select retorna null): rejeita como 'of_nao_encontrada', nunca chama a RPC", async () => {
    configurarCaminhoFeliz();
    selectOfMock.mockResolvedValue({ data: null, error: null });

    const resultado = await liberarOfCombinadoPcpAction("of-de-outra-empresa");

    expect(resultado).toEqual({ ok: false, motivo: "of_nao_encontrada" });
    expect(persistirMock).not.toHaveBeenCalled();
  });
});

describe("liberarOfCombinadoPcpAction — permissão, estados e concorrência (decididos pela RPC)", () => {
  it("6. Sem permissão pcp.aprovar_of (OF aguardando auditoria): propaga o motivo distinto", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({
      resultado: null,
      numeroOf: null,
      aprovacaoRealizada: false,
      erro: "aprovar_e_liberar_of: usuario sem permissao para aprovar OF.",
    });

    const resultado = await liberarOfCombinadoPcpAction("of-1");

    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado_aprovar" });
  });

  it("7. Sem permissão pcp.liberar_of (OF já aprovada): propaga o motivo distinto", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({
      resultado: null,
      numeroOf: null,
      aprovacaoRealizada: false,
      erro: "aprovar_e_liberar_of: usuario sem permissao para liberar OF.",
    });

    const resultado = await liberarOfCombinadoPcpAction("of-1");

    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado_liberar" });
  });

  it("8. Momento Y pendente: mensagem compreensível, sem ativar o Momento Y", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({
      resultado: null,
      numeroOf: null,
      aprovacaoRealizada: false,
      erro: "liberar_of: OF x ainda nao teve as materias-primas conferidas (Momento Y pendente).",
    });

    const resultado = await liberarOfCombinadoPcpAction("of-1");

    expect(resultado).toEqual({ ok: false, motivo: "momento_y_pendente" });
  });

  it("9. Estado incompatível (ex.: cancelada): propaga o motivo sem reescrever a checagem", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({
      resultado: null,
      numeroOf: null,
      aprovacaoRealizada: false,
      erro: "liberar_of: OF x em aprovada/cancelada nao pode ser liberada - precisa estar aprovada+planejada.",
    });

    const resultado = await liberarOfCombinadoPcpAction("of-1");

    expect(resultado).toEqual({ ok: false, motivo: "estado_incompativel" });
  });

  it("10. Conflito de concorrência: propaga o motivo distinto", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({
      resultado: null,
      numeroOf: null,
      aprovacaoRealizada: false,
      erro: "liberar_of: falha ao liberar OF x - estado mudou durante a operacao.",
    });

    const resultado = await liberarOfCombinadoPcpAction("of-1");

    expect(resultado).toEqual({ ok: false, motivo: "conflito_concorrencia" });
  });
});

describe("liberarOfCombinadoPcpAction — combinação, idempotência e preservação de dados", () => {
  it("11. Sucesso combinado (OF aguardando auditoria): jaLiberada=false, aprovacaoRealizada=true", async () => {
    configurarCaminhoFeliz();

    const resultado = await liberarOfCombinadoPcpAction("of-1", "obs aprovação", "motivo liberação");

    expect(resultado).toEqual({ ok: true, jaLiberada: false, aprovacaoRealizada: true, numeroOf: "900301-0001" });
    expect(persistirMock).toHaveBeenCalledWith(expect.anything(), "of-1", "obs aprovação", "motivo liberação");
  });

  it("12. Sucesso só liberação (OF já aprovada): aprovacaoRealizada=false", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ resultado: "liberada", numeroOf: "900301-0002", aprovacaoRealizada: false, erro: null });

    const resultado = await liberarOfCombinadoPcpAction("of-1");

    expect(resultado).toEqual({ ok: true, jaLiberada: false, aprovacaoRealizada: false, numeroOf: "900301-0002" });
  });

  it("13. OF já liberada (idempotente): sucesso sinalizando jaLiberada=true, nunca um erro", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ resultado: "ja_liberada", numeroOf: "900301-0003", aprovacaoRealizada: false, erro: null });

    const resultado = await liberarOfCombinadoPcpAction("of-1");

    expect(resultado).toEqual({ ok: true, jaLiberada: true, aprovacaoRealizada: false, numeroOf: "900301-0003" });
  });

  it("14. Observações em branco: normaliza para null, nunca envia string vazia/whitespace à RPC", async () => {
    configurarCaminhoFeliz();

    await liberarOfCombinadoPcpAction("of-1", "   ", "   ");

    expect(persistirMock).toHaveBeenCalledWith(expect.anything(), "of-1", null, null);
  });

  it("15. Gravação incerta: nunca tenta de novo sozinha, devolve o motivo distinto", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ resultado: null, numeroOf: null, aprovacaoRealizada: false, erro: "falha de rede", gravacaoIncerta: true });

    const resultado = await liberarOfCombinadoPcpAction("of-1");

    expect(resultado).toEqual({ ok: false, motivo: "gravacao_incerta" });
    expect(persistirMock).toHaveBeenCalledTimes(1);
  });

  it("16. Erro limpo da RPC não reconhecido: cai em erro_desconhecido, nunca finge sucesso", async () => {
    configurarCaminhoFeliz();
    persistirMock.mockResolvedValue({ resultado: null, numeroOf: null, aprovacaoRealizada: false, erro: "algo totalmente inesperado" });

    const resultado = await liberarOfCombinadoPcpAction("of-1");

    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
  });
});
