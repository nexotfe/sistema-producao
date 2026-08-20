import { describe, expect, it } from "vitest";
import { compararDadosParaAprovacaoCenario, type DadosParaAprovacaoCenario } from "./compararDadosParaAprovacaoCenario";
import type { SaidaPrevisaoComercial } from "./montarPrevisaoComercialProjeto";

function dados(overrides: Partial<SaidaPrevisaoComercial> = {}, custoTecnicoAtual = 50000): DadosParaAprovacaoCenario {
  const saida: SaidaPrevisaoComercial = {
    dataSolicitadaCliente: "2026-09-01",
    status: "calculado",
    primeiraEntregaPossivel: "2026-09-10",
    atendeDataSolicitada: true,
    diferencaEmDias: 9,
    recursosQueDeterminamTermino: [],
    horizonteTecnico: "suficiente",
    diagnosticos: [],
    tipoAnalise: "previsao_comercial_por_capacidade",
    custoAdicional: { negociacaoMaterial: 100, horaAdicional: 200, recursoTemporario: 0, total: 300 },
    capacidadeUtilizada: { horaAdicionalHoras: 5, recursoTemporarioHoras: 0 },
    detalhamentoPorRecurso: [],
    ...overrides,
  };
  return { saida, custoTecnicoAtual };
}

describe("compararDadosParaAprovacaoCenario", () => {
  it("idêntico -> lista vazia", () => {
    expect(compararDadosParaAprovacaoCenario(dados(), dados())).toEqual([]);
  });

  it("prazo divergente é reportado", () => {
    const diferencas = compararDadosParaAprovacaoCenario(dados(), dados({ primeiraEntregaPossivel: "2026-09-15" }));
    expect(diferencas.some((d) => d.campo === "primeiraEntregaPossivel")).toBe(true);
  });

  it("custo por categoria divergente é reportado por categoria", () => {
    const diferencas = compararDadosParaAprovacaoCenario(
      dados(),
      dados({ custoAdicional: { negociacaoMaterial: 100, horaAdicional: 999, recursoTemporario: 0, total: 1099 } }),
    );
    expect(diferencas.map((d) => d.campo)).toContain("custoAdicional.horaAdicional");
    expect(diferencas.map((d) => d.campo)).toContain("custoAdicional.total");
    expect(diferencas.map((d) => d.campo)).not.toContain("custoAdicional.negociacaoMaterial");
  });

  it("custoTecnicoAtual divergente é reportado", () => {
    const diferencas = compararDadosParaAprovacaoCenario(dados({}, 50000), dados({}, 51000));
    expect(diferencas.some((d) => d.campo === "custoTecnicoAtual")).toBe(true);
  });

  it("um custoAdicional null e outro não-null diverge", () => {
    const diferencas = compararDadosParaAprovacaoCenario(dados({ custoAdicional: null }), dados());
    expect(diferencas.some((d) => d.campo === "custoAdicional")).toBe(true);
  });

  it("diferenças de ponto flutuante dentro da tolerância não divergem", () => {
    const diferencas = compararDadosParaAprovacaoCenario(
      dados({ custoAdicional: { negociacaoMaterial: 100, horaAdicional: 200, recursoTemporario: 0, total: 300 } }),
      dados({ custoAdicional: { negociacaoMaterial: 100.0000001, horaAdicional: 200, recursoTemporario: 0, total: 300.0000001 } }),
    );
    expect(diferencas).toEqual([]);
  });
});
