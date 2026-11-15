import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const estado = { decidirProdutivo: (_data: string) => true };
  return {
    estado,
    carregarContextoCalendarioMock: vi.fn(async (_client: unknown, _empresaId: string, dataInicio: string, dataFim: string) => ({
      dataInicio,
      dataFim,
    })),
    resolverDiaProdutivoComContextoMock: vi.fn((_contexto: unknown, data: string) => ({
      produtivo: estado.decidirProdutivo(data),
      origem: "teste" as const,
      motivo: "teste",
    })),
  };
});

vi.mock("@/modules/calendario/lib/contextoCalendario", () => ({
  carregarContextoCalendario: mocks.carregarContextoCalendarioMock,
  resolverDiaProdutivoComContexto: mocks.resolverDiaProdutivoComContextoMock,
}));

import { resolverGradeProdutivaNecessariaPcp } from "./ampliarGradeProdutivaPcp";

afterEach(() => {
  vi.clearAllMocks();
  mocks.estado.decidirProdutivo = () => true;
});

const CLIENTE_FALSO = {} as never;

describe("resolverGradeProdutivaNecessariaPcp", () => {
  it("A. diasProdutivosNecessarios=0 -> grade mínima de 1 dia, nunca consulta o calendário", async () => {
    const resultado = await resolverGradeProdutivaNecessariaPcp({
      client: CLIENTE_FALSO,
      empresaId: "empresa-1",
      dataInicio: "2027-01-01",
      diasProdutivosNecessarios: 0,
      agoraMs: () => 0,
      prazoFinalMs: 1000,
    });

    expect(resultado).toEqual({ ok: true, datasGradeCompartilhada: ["2027-01-01"] });
    expect(mocks.carregarContextoCalendarioMock).not.toHaveBeenCalled();
  });

  it("B. calendário todo produtivo: 1ª tentativa já encontra os dias suficientes", async () => {
    const resultado = await resolverGradeProdutivaNecessariaPcp({
      client: CLIENTE_FALSO,
      empresaId: "empresa-1",
      dataInicio: "2027-01-01",
      diasProdutivosNecessarios: 3,
      agoraMs: () => 0,
      prazoFinalMs: 1000,
    });

    expect(resultado).toEqual({
      ok: true,
      datasGradeCompartilhada: ["2027-01-01", "2027-01-02", "2027-01-03"],
    });
    expect(mocks.carregarContextoCalendarioMock).toHaveBeenCalledTimes(1);
  });

  it("C. dias produtivos esparsos: amplia a sondagem até encontrar os 3 necessários (3 tentativas)", async () => {
    const produtivos = new Set(["2027-03-05", "2027-03-10", "2027-03-20"]);
    mocks.estado.decidirProdutivo = (data) => produtivos.has(data);

    const resultado = await resolverGradeProdutivaNecessariaPcp({
      client: CLIENTE_FALSO,
      empresaId: "empresa-1",
      dataInicio: "2027-03-01",
      diasProdutivosNecessarios: 3,
      agoraMs: () => 0,
      prazoFinalMs: 1_000_000,
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.datasGradeCompartilhada[0]).toBe("2027-03-01");
    expect(resultado.datasGradeCompartilhada[resultado.datasGradeCompartilhada.length - 1]).toBe("2027-03-20");
    expect(resultado.datasGradeCompartilhada).toHaveLength(20);
    // 6 dias (1ª tentativa) -> 12 dias (2ª) -> 24 dias (3ª, onde os 3 produtivos já cabem) - nunca mais que o necessário para confirmar.
    expect(mocks.carregarContextoCalendarioMock).toHaveBeenCalledTimes(3);
  });

  it("D. orçamento esgotado antes de confirmar: falha explícita com diagnóstico, nunca um resultado inventado", async () => {
    const produtivos = new Set(["2027-03-05", "2027-03-10", "2027-03-20"]);
    mocks.estado.decidirProdutivo = (data) => produtivos.has(data);

    const resultado = await resolverGradeProdutivaNecessariaPcp({
      client: CLIENTE_FALSO,
      empresaId: "empresa-1",
      dataInicio: "2027-03-01",
      diasProdutivosNecessarios: 3,
      // Tenta exatamente 1 vez (a função SEMPRE tenta ao menos 1 vez,
      // mesmo com orçamento já esgotado) e já reporta esgotado, nunca
      // trava num laço indefinido.
      agoraMs: () => 2000,
      prazoFinalMs: 1000,
    });

    expect(resultado).toEqual({
      ok: false,
      motivo: "orcamento_esgotado_na_sondagem_de_calendario",
      diasProdutivosEncontrados: 1,
      diasProdutivosNecessarios: 3,
      ultimaJanelaCorridaTestada: 6,
    });
    expect(mocks.carregarContextoCalendarioMock).toHaveBeenCalledTimes(1);
  });

  it("E. nenhum teto fixo de dias corridos - uma janela maior que 400 dias é aceita sem erro, se o orçamento permitir", async () => {
    // Só 1 dia produtivo bem distante (~450 dias corridos após 2027-01-01) - nenhum "limite de 365/400" deve impedir a sondagem de alcançá-lo.
    mocks.estado.decidirProdutivo = (data) => data === "2028-03-26";
    const resultado = await resolverGradeProdutivaNecessariaPcp({
      client: CLIENTE_FALSO,
      empresaId: "empresa-1",
      dataInicio: "2027-01-01",
      diasProdutivosNecessarios: 1,
      agoraMs: () => 0,
      prazoFinalMs: 1_000_000,
    });

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.datasGradeCompartilhada[resultado.datasGradeCompartilhada.length - 1]).toBe("2028-03-26");
    }
  });
});
