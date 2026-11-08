// NEXOTFE — Etapa 64E: testes da Server Action consolidada de carga
// inicial da OF. Mocka cada função de lib/ individualmente (nunca o
// client Supabase "de verdade") para isolar a ORQUESTRAÇÃO (ondas,
// paralelismo, isolamento de falha por seção, regra "falha não é
// vazio válido") das regras de negócio de cada leitura em si - essas
// já são cobertas pelos testes próprios de cada lib/buscarXxx.ts.
import { afterEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const rpcServiceMock = vi.fn();
const buscarOfsPcpMock = vi.fn();
const buscarPropostaMomentoYMock = vi.fn();
const buscarOperacoesOfPcpMock = vi.fn();
const buscarDependenciasOperacoesOfPcpMock = vi.fn();
const buscarSaldoLivreMateriasPrimasPcpMock = vi.fn();
const buscarResumoLegadoOfPcpMock = vi.fn();
const buscarNecessidadesConfirmadasOfPcpMock = vi.fn();

vi.mock("@/lib/supabaseServerClient", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));
vi.mock("@/lib/supabaseServiceClient", () => ({
  createSupabaseServiceClient: () => ({
    rpc: rpcServiceMock,
  }),
}));
vi.mock("../lib/buscarOfsPcp", () => ({
  buscarOfsPcp: (...args: unknown[]) => buscarOfsPcpMock(...args),
}));
vi.mock("../lib/buscarPropostaMomentoY", () => ({
  buscarPropostaMomentoY: (...args: unknown[]) => buscarPropostaMomentoYMock(...args),
}));
vi.mock("../lib/buscarOperacoesOfPcp", () => ({
  buscarOperacoesOfPcp: (...args: unknown[]) => buscarOperacoesOfPcpMock(...args),
}));
vi.mock("../lib/buscarDependenciasOperacoesOfPcp", () => ({
  buscarDependenciasOperacoesOfPcp: (...args: unknown[]) => buscarDependenciasOperacoesOfPcpMock(...args),
}));
vi.mock("../lib/buscarSaldoLivreMateriasPrimasPcp", () => ({
  buscarSaldoLivreMateriasPrimasPcp: (...args: unknown[]) => buscarSaldoLivreMateriasPrimasPcpMock(...args),
}));
vi.mock("../lib/buscarResumoLegadoOfPcp", () => ({
  buscarResumoLegadoOfPcp: (...args: unknown[]) => buscarResumoLegadoOfPcpMock(...args),
}));
vi.mock("../lib/buscarNecessidadesConfirmadasOfPcp", () => ({
  buscarNecessidadesConfirmadasOfPcp: (...args: unknown[]) => buscarNecessidadesConfirmadasOfPcpMock(...args),
}));

import { consultarCargaInicialOfPcpAction } from "./consultarCargaInicialOfPcpAction";

const OF_ID = "of-1";
const USUARIO_PADRAO = { id: "usuario-1" };

function configurarPermissoesPadrao() {
  rpcServiceMock.mockResolvedValue({ data: true, error: null });
}

function configurarBasePadrao() {
  getUserMock.mockResolvedValue({ data: { user: USUARIO_PADRAO }, error: null });
  buscarOfsPcpMock.mockResolvedValue({ ok: true, resultado: { linhas: [{ numeroOf: "1" }], totalRegistros: 1, pagina: 1, tamanhoPagina: 1 } });
  buscarOperacoesOfPcpMock.mockResolvedValue({ ok: true, operacoes: [] });
  buscarDependenciasOperacoesOfPcpMock.mockResolvedValue({ ok: true, dependenciasPorOpId: new Map() });
  configurarPermissoesPadrao();
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("consultarCargaInicialOfPcpAction — autenticação", () => {
  it("1. Sessão não autenticada bloqueia tudo - nenhuma leitura é disparada", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await consultarCargaInicialOfPcpAction(OF_ID);

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(buscarOfsPcpMock).not.toHaveBeenCalled();
    expect(buscarPropostaMomentoYMock).not.toHaveBeenCalled();
    expect(buscarOperacoesOfPcpMock).not.toHaveBeenCalled();
    expect(rpcServiceMock).not.toHaveBeenCalled();
  });
});

describe("consultarCargaInicialOfPcpAction — dados básicos da OF", () => {
  it("2. Repassa resultadoOf exatamente como a lib devolveu, chamando com {ofId},1,1", async () => {
    configurarBasePadrao();
    buscarPropostaMomentoYMock.mockResolvedValue({ ok: true, leitura: { ofId: OF_ID, regime: "legado", propostaOriginal: [], interruptorAtivo: false } });
    buscarResumoLegadoOfPcpMock.mockResolvedValue({ ok: true, resumo: null, itens: [] });

    const resultado = await consultarCargaInicialOfPcpAction(OF_ID);

    expect(buscarOfsPcpMock).toHaveBeenCalledWith(expect.anything(), { ofId: OF_ID }, 1, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultadoOf).toEqual({ ok: true, resultado: { linhas: [{ numeroOf: "1" }], totalRegistros: 1, pagina: 1, tamanhoPagina: 1 } });
    }
  });

  it("3. OF inexistente (linhas vazias) não impede as outras seções independentes de carregar", async () => {
    configurarBasePadrao();
    buscarOfsPcpMock.mockResolvedValue({ ok: true, resultado: { linhas: [], totalRegistros: 0, pagina: 1, tamanhoPagina: 1 } });
    buscarPropostaMomentoYMock.mockResolvedValue({ ok: false, motivo: "of_nao_encontrada" });

    const resultado = await consultarCargaInicialOfPcpAction(OF_ID);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperado ok:true");
    expect(resultado.resultadoOf).toEqual({ ok: true, resultado: { linhas: [], totalRegistros: 0, pagina: 1, tamanhoPagina: 1 } });
    expect(resultado.resultadoOperacoes).toEqual({ ok: true, operacoes: [] });
    expect(resultado.resultadoPermissoesOperacoes.ok).toBe(true);
    expect(resultado.resultadoSaldoLivre).toBeNull();
    expect(resultado.resultadoLegado).toBeNull();
    expect(resultado.resultadoConfirmadas).toBeNull();
  });
});

describe("consultarCargaInicialOfPcpAction — os três regimes de matérias-primas", () => {
  it("4. Regime legado: busca resumo legado, nunca saldo livre ou necessidades confirmadas", async () => {
    configurarBasePadrao();
    buscarPropostaMomentoYMock.mockResolvedValue({
      ok: true,
      leitura: { ofId: OF_ID, regime: "legado", propostaOriginal: [], interruptorAtivo: false },
    });
    buscarResumoLegadoOfPcpMock.mockResolvedValue({ ok: true, resumo: null, itens: [] });

    const resultado = await consultarCargaInicialOfPcpAction(OF_ID);

    expect(buscarResumoLegadoOfPcpMock).toHaveBeenCalledWith(expect.anything(), OF_ID);
    expect(buscarSaldoLivreMateriasPrimasPcpMock).not.toHaveBeenCalled();
    expect(buscarNecessidadesConfirmadasOfPcpMock).not.toHaveBeenCalled();
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultadoLegado).toEqual({ ok: true, resumo: null, itens: [] });
      expect(resultado.resultadoConfirmadas).toBeNull();
      expect(resultado.resultadoSaldoLivre).toBeNull();
    }
  });

  it("5. Regime confirmado: busca necessidades confirmadas, nunca resumo legado ou saldo livre", async () => {
    configurarBasePadrao();
    buscarPropostaMomentoYMock.mockResolvedValue({
      ok: true,
      leitura: { ofId: OF_ID, regime: "confirmado_momento_y", propostaOriginal: [], interruptorAtivo: false },
    });
    buscarNecessidadesConfirmadasOfPcpMock.mockResolvedValue({ ok: true, itens: [] });

    const resultado = await consultarCargaInicialOfPcpAction(OF_ID);

    expect(buscarNecessidadesConfirmadasOfPcpMock).toHaveBeenCalledWith(expect.anything(), OF_ID);
    expect(buscarResumoLegadoOfPcpMock).not.toHaveBeenCalled();
    expect(buscarSaldoLivreMateriasPrimasPcpMock).not.toHaveBeenCalled();
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultadoConfirmadas).toEqual({ ok: true, itens: [] });
      expect(resultado.resultadoLegado).toBeNull();
    }
  });

  it("6. Regime pendente com materiais: busca saldo livre em lote, nunca resumo legado ou necessidades confirmadas", async () => {
    configurarBasePadrao();
    buscarPropostaMomentoYMock.mockResolvedValue({
      ok: true,
      leitura: {
        ofId: OF_ID,
        regime: "pendente_momento_y",
        propostaOriginal: [{ materia_prima_id: "mp-1", quantidade_sugerida: 10, unidade: "KG", descricao: "x", especificacao: null }],
        interruptorAtivo: false,
      },
    });
    buscarSaldoLivreMateriasPrimasPcpMock.mockResolvedValue({ ok: true, saldoLivrePorMaterial: new Map([["mp-1", 5]]) });

    const resultado = await consultarCargaInicialOfPcpAction(OF_ID);

    expect(buscarSaldoLivreMateriasPrimasPcpMock).toHaveBeenCalledWith(expect.anything(), ["mp-1"]);
    expect(buscarResumoLegadoOfPcpMock).not.toHaveBeenCalled();
    expect(buscarNecessidadesConfirmadasOfPcpMock).not.toHaveBeenCalled();
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultadoSaldoLivre).toEqual({ ok: true, saldoLivrePorMaterial: { "mp-1": 5 } });
    }
  });

  it("7. Regime pendente SEM materiais (proposta vazia): nenhuma das três leituras condicionais é chamada", async () => {
    configurarBasePadrao();
    buscarPropostaMomentoYMock.mockResolvedValue({
      ok: true,
      leitura: { ofId: OF_ID, regime: "pendente_momento_y", propostaOriginal: [], interruptorAtivo: false },
    });

    const resultado = await consultarCargaInicialOfPcpAction(OF_ID);

    expect(buscarSaldoLivreMateriasPrimasPcpMock).not.toHaveBeenCalled();
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.resultadoSaldoLivre).toBeNull();
  });
});

describe("consultarCargaInicialOfPcpAction — operações e dependências", () => {
  it("8. Dependências usa exatamente os opIds das operações carregadas", async () => {
    configurarBasePadrao();
    buscarPropostaMomentoYMock.mockResolvedValue({ ok: true, leitura: { ofId: OF_ID, regime: "legado", propostaOriginal: [], interruptorAtivo: false } });
    buscarResumoLegadoOfPcpMock.mockResolvedValue({ ok: true, resumo: null, itens: [] });
    buscarOperacoesOfPcpMock.mockResolvedValue({ ok: true, operacoes: [{ opId: "op-1" }, { opId: "op-2" }] });
    buscarDependenciasOperacoesOfPcpMock.mockResolvedValue({ ok: true, dependenciasPorOpId: new Map([["op-1", [{ opRelacionadaId: "op-2", codigoOperacionalRelacionada: "OP2", papel: "origem" }]]]) });

    const resultado = await consultarCargaInicialOfPcpAction(OF_ID);

    expect(buscarDependenciasOperacoesOfPcpMock).toHaveBeenCalledWith(expect.anything(), ["op-1", "op-2"]);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultadoDependencias).toEqual({
        ok: true,
        dependenciasPorOpId: { "op-1": [{ opRelacionadaId: "op-2", codigoOperacionalRelacionada: "OP2", papel: "origem" }] },
      });
    }
  });

  it("9. Falha na leitura de operações NUNCA vira 'sem dependências' — fica explicitamente indeterminada, e a lib de dependências nem é chamada", async () => {
    configurarBasePadrao();
    buscarPropostaMomentoYMock.mockResolvedValue({ ok: true, leitura: { ofId: OF_ID, regime: "legado", propostaOriginal: [], interruptorAtivo: false } });
    buscarResumoLegadoOfPcpMock.mockResolvedValue({ ok: true, resumo: null, itens: [] });
    buscarOperacoesOfPcpMock.mockResolvedValue({ ok: false, motivo: "erro_desconhecido" });

    const resultado = await consultarCargaInicialOfPcpAction(OF_ID);

    expect(buscarDependenciasOperacoesOfPcpMock).not.toHaveBeenCalled();
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultadoDependencias).toEqual({ ok: false, motivo: "operacoes_indisponiveis" });
    }
  });
});

describe("consultarCargaInicialOfPcpAction — permissões", () => {
  it("10. Agrega as 3 RPCs corretamente quando todas têm sucesso", async () => {
    configurarBasePadrao();
    buscarPropostaMomentoYMock.mockResolvedValue({ ok: true, leitura: { ofId: OF_ID, regime: "legado", propostaOriginal: [], interruptorAtivo: false } });
    buscarResumoLegadoOfPcpMock.mockResolvedValue({ ok: true, resumo: null, itens: [] });
    rpcServiceMock
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    const resultado = await consultarCargaInicialOfPcpAction(OF_ID);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultadoPermissoesOperacoes).toEqual({
        ok: true,
        podeCriarOperacao: true,
        podeEditarOperacao: false,
        podeRemoverOperacao: true,
      });
    }
  });

  it("11. Falha na leitura de permissões NUNCA libera as 3 operações — motivo erro_desconhecido", async () => {
    configurarBasePadrao();
    buscarPropostaMomentoYMock.mockResolvedValue({ ok: true, leitura: { ofId: OF_ID, regime: "legado", propostaOriginal: [], interruptorAtivo: false } });
    buscarResumoLegadoOfPcpMock.mockResolvedValue({ ok: true, resumo: null, itens: [] });
    rpcServiceMock
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "falha" } })
      .mockResolvedValueOnce({ data: true, error: null });

    const resultado = await consultarCargaInicialOfPcpAction(OF_ID);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultadoPermissoesOperacoes).toEqual({ ok: false, motivo: "erro_desconhecido" });
    }
  });
});

describe("consultarCargaInicialOfPcpAction — isolamento de falhas individuais", () => {
  it("12. Uma exceção de rede numa leitura (operações) não derruba as outras seções independentes", async () => {
    configurarBasePadrao();
    buscarPropostaMomentoYMock.mockResolvedValue({ ok: true, leitura: { ofId: OF_ID, regime: "legado", propostaOriginal: [], interruptorAtivo: false } });
    buscarResumoLegadoOfPcpMock.mockResolvedValue({ ok: true, resumo: null, itens: [] });
    buscarOperacoesOfPcpMock.mockRejectedValue(new Error("falha de rede"));

    const resultado = await consultarCargaInicialOfPcpAction(OF_ID);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperado ok:true");
    expect(resultado.resultadoOperacoes).toEqual({ ok: false, motivo: "erro_desconhecido" });
    // as outras seções independentes continuam OK, nunca contaminadas pela falha isolada:
    expect(resultado.resultadoOf.ok).toBe(true);
    expect(resultado.resultadoMateriais.ok).toBe(true);
    expect(resultado.resultadoPermissoesOperacoes.ok).toBe(true);
  });

  it("13. Saldo livre indisponível (erro da lib) nunca é tratado como saldo zero — motivo erro_desconhecido explícito", async () => {
    configurarBasePadrao();
    buscarPropostaMomentoYMock.mockResolvedValue({
      ok: true,
      leitura: {
        ofId: OF_ID,
        regime: "pendente_momento_y",
        propostaOriginal: [{ materia_prima_id: "mp-1", quantidade_sugerida: 10, unidade: "KG", descricao: "x", especificacao: null }],
        interruptorAtivo: false,
      },
    });
    buscarSaldoLivreMateriasPrimasPcpMock.mockResolvedValue({ ok: false, motivo: "erro_desconhecido" });

    const resultado = await consultarCargaInicialOfPcpAction(OF_ID);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultadoSaldoLivre).toEqual({ ok: false, motivo: "erro_desconhecido" });
    }
  });
});

describe("consultarCargaInicialOfPcpAction — ausência de gravação", () => {
  it("14. Nunca chama nada alem de leituras (rpc de permissao) no client de servico - nenhuma escrita", async () => {
    configurarBasePadrao();
    buscarPropostaMomentoYMock.mockResolvedValue({ ok: true, leitura: { ofId: OF_ID, regime: "legado", propostaOriginal: [], interruptorAtivo: false } });
    buscarResumoLegadoOfPcpMock.mockResolvedValue({ ok: true, resumo: null, itens: [] });

    await consultarCargaInicialOfPcpAction(OF_ID);

    expect(rpcServiceMock).toHaveBeenCalledTimes(3);
    for (const chamada of rpcServiceMock.mock.calls) {
      expect(chamada[0]).toBe("usuario_tem_permissao");
    }
  });
});
