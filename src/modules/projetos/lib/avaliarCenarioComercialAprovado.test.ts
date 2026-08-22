import { describe, expect, it, vi } from "vitest";

const buscarDadosAssinaturaTecnicaMock = vi.fn();
vi.mock("@/modules/simulacao-comercial/lib/cenarios/buscarDadosAssinaturaTecnica", () => ({
  buscarDadosAssinaturaTecnica: (...args: unknown[]) => buscarDadosAssinaturaTecnicaMock(...args),
}));

const construirDocumentoAssinaturaTecnicaMock = vi.fn();
vi.mock("@/modules/simulacao-comercial/lib/cenarios/construirDocumentoAssinaturaTecnica", () => ({
  construirDocumentoAssinaturaTecnica: (...args: unknown[]) => construirDocumentoAssinaturaTecnicaMock(...args),
}));

const calcularHashAssinaturaTecnicaMock = vi.fn();
vi.mock("@/modules/simulacao-comercial/lib/cenarios/calcularHashAssinaturaTecnica", () => ({
  calcularHashAssinaturaTecnica: (...args: unknown[]) => calcularHashAssinaturaTecnicaMock(...args),
}));

import { avaliarCenarioComercialAprovado } from "./avaliarCenarioComercialAprovado";
import type { CenarioComercialAprovadoResumo } from "./buscarCenarioComercialAprovado";

const clienteFake = {} as never;

function cenario(overrides: Partial<CenarioComercialAprovadoResumo> = {}): CenarioComercialAprovadoResumo {
  return {
    id: "cenario-1",
    empresaId: "empresa-1",
    tipoCenario: "atual",
    dataSolicitadaCliente: "2026-08-01",
    prazoProposto: "2026-08-15",
    diferencaEmDias: 14,
    custoTecnicoAtual: 4920,
    custoAdicionalTotal: 0,
    novoCustoTecnico: 4920,
    aprovadoEm: "2026-08-05T10:00:00Z",
    assinaturaTecnica: "a".repeat(64),
    janelaInicio: "2026-07-25",
    janelaFim: "2026-08-10",
    ...overrides,
  };
}

describe("avaliarCenarioComercialAprovado", () => {
  it("sem cenário aprovado: devolve null, nenhuma chamada de rede", async () => {
    const resultado = await avaliarCenarioComercialAprovado(clienteFake, "projeto-1", "em_analise", null);
    expect(resultado).toBeNull();
    expect(buscarDadosAssinaturaTecnicaMock).not.toHaveBeenCalled();
  });

  it("projeto com status=aprovado: congelamento definitivo, NUNCA recalcula a assinatura (regra explícita)", async () => {
    const resultado = await avaliarCenarioComercialAprovado(clienteFake, "projeto-1", "aprovado", cenario());
    expect(resultado).toEqual({ usarCenario: true, motivo: "congelamento_definitivo" });
    expect(buscarDadosAssinaturaTecnicaMock).not.toHaveBeenCalled();
  });

  it("cenário legado (assinatura_tecnica null, ex.: 260007): desatualizado sem chamada de rede", async () => {
    const resultado = await avaliarCenarioComercialAprovado(
      clienteFake,
      "projeto-260007",
      "em_analise",
      cenario({ assinaturaTecnica: null }),
    );
    expect(resultado).toEqual({ usarCenario: false, motivoDesatualizado: "assinatura_nula_legado" });
    expect(buscarDadosAssinaturaTecnicaMock).not.toHaveBeenCalled();
  });

  it("snapshot sem janela extraível: erro de verificação (conservador), sem chamada de rede", async () => {
    const resultado = await avaliarCenarioComercialAprovado(
      clienteFake,
      "projeto-1",
      "em_analise",
      cenario({ janelaInicio: null }),
    );
    expect(resultado).toEqual({ usarCenario: false, motivoDesatualizado: "erro_verificacao" });
    expect(buscarDadosAssinaturaTecnicaMock).not.toHaveBeenCalled();
  });

  it("assinatura ao vivo igual à armazenada: usa o cenário - chama buscarDadosAssinaturaTecnica com empresaId/projetoId/janela do cenário", async () => {
    buscarDadosAssinaturaTecnicaMock.mockResolvedValue({ dados: "fake" });
    construirDocumentoAssinaturaTecnicaMock.mockReturnValue({ documento: "fake" });
    calcularHashAssinaturaTecnicaMock.mockResolvedValue("a".repeat(64));

    const resultado = await avaliarCenarioComercialAprovado(clienteFake, "projeto-1", "em_analise", cenario());

    expect(resultado).toEqual({ usarCenario: true, motivo: "assinatura_confere" });
    expect(buscarDadosAssinaturaTecnicaMock).toHaveBeenCalledWith(clienteFake, "empresa-1", "projeto-1", "2026-07-25", "2026-08-10");
  });

  it("assinatura ao vivo diferente da armazenada: desatualizado", async () => {
    buscarDadosAssinaturaTecnicaMock.mockResolvedValue({ dados: "fake" });
    construirDocumentoAssinaturaTecnicaMock.mockReturnValue({ documento: "fake" });
    calcularHashAssinaturaTecnicaMock.mockResolvedValue("b".repeat(64));

    const resultado = await avaliarCenarioComercialAprovado(clienteFake, "projeto-1", "em_analise", cenario());

    expect(resultado).toEqual({ usarCenario: false, motivoDesatualizado: "assinatura_divergente" });
  });

  it("erro ao buscar/calcular a assinatura ao vivo: comportamento conservador - desatualizado, nunca lança para o chamador", async () => {
    buscarDadosAssinaturaTecnicaMock.mockRejectedValue(new Error("falha de rede"));

    const resultado = await avaliarCenarioComercialAprovado(clienteFake, "projeto-1", "em_analise", cenario());

    expect(resultado).toEqual({ usarCenario: false, motivoDesatualizado: "erro_verificacao" });
  });

  it("erro ao montar o documento/hash (não só a busca): também conservador", async () => {
    buscarDadosAssinaturaTecnicaMock.mockResolvedValue({ dados: "fake" });
    construirDocumentoAssinaturaTecnicaMock.mockImplementation(() => {
      throw new Error("documento inválido");
    });

    const resultado = await avaliarCenarioComercialAprovado(clienteFake, "projeto-1", "em_analise", cenario());

    expect(resultado).toEqual({ usarCenario: false, motivoDesatualizado: "erro_verificacao" });
  });
});
