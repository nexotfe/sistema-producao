import { describe, expect, it } from "vitest";
import { construirSnapshotCenarioComercial, type ParametrosSnapshotCenarioComercial } from "./cenarioComercialAprovadoSnapshot";
import type { SaidaPrevisaoComercial } from "./montarPrevisaoComercialProjeto";

function saidaCalculada(overrides: Partial<SaidaPrevisaoComercial> = {}): SaidaPrevisaoComercial {
  return {
    dataSolicitadaCliente: "2026-09-01",
    status: "calculado",
    primeiraEntregaPossivel: "2026-09-10",
    atendeDataSolicitada: true,
    diferencaEmDias: 9,
    recursosQueDeterminamTermino: [],
    horizonteTecnico: "suficiente",
    diagnosticos: [],
    tipoAnalise: "previsao_comercial_por_capacidade",
    custoAdicional: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, total: 0 },
    capacidadeUtilizada: { horaAdicionalHoras: 0, recursoTemporarioHoras: 0 },
    detalhamentoPorRecurso: [],
    ...overrides,
  };
}

function parametrosBase(overrides: Partial<ParametrosSnapshotCenarioComercial> = {}): ParametrosSnapshotCenarioComercial {
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    tipoCenario: "atual",
    premissas: { dataNecessidade: "2026-09-01", margemSegurancaDias: 0, dataPrevistaAprovacaoPedido: "2026-08-20" },
    disponibilidadeMaterial: { original: "2026-08-25", negociada: null },
    decisoesCapacidade: { capacidadeExtraAutorizada: [], temporariosPorPrioridade: [], contratacoes: [], contratacaoNegociacaoMaterial: null },
    saidaPrevisaoComercial: saidaCalculada(),
    custoTecnicoAtual: 50000,
    custoAdicionalPorCategoria: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, terceirizacao: 0 },
    valorComercialAtualReferencia: 62000,
    ...overrides,
  };
}

describe("construirSnapshotCenarioComercial", () => {
  it("versaoFormato é sempre 1", () => {
    expect(construirSnapshotCenarioComercial(parametrosBase()).versaoFormato).toBe(1);
  });

  it("cenário atual sem custo adicional: custoAdicionalTotal=0, novoCustoTecnico=custoTecnicoAtual", () => {
    const snapshot = construirSnapshotCenarioComercial(parametrosBase());
    expect(snapshot.custoAdicionalTotal).toBe(0);
    expect(snapshot.novoCustoTecnico).toBe(snapshot.custoTecnicoAtual);
  });

  it("soma exata das 4 categorias em custoAdicionalTotal", () => {
    const snapshot = construirSnapshotCenarioComercial(
      parametrosBase({
        custoAdicionalPorCategoria: { negociacaoMaterial: 1200.5, horaAdicional: 3400.25, recursoTemporario: 800, terceirizacao: 0 },
      }),
    );
    expect(snapshot.custoAdicionalTotal).toBeCloseTo(1200.5 + 3400.25 + 800, 6);
  });

  it("novoCustoTecnico = custoTecnicoAtual + custoAdicionalTotal", () => {
    const snapshot = construirSnapshotCenarioComercial(
      parametrosBase({
        custoTecnicoAtual: 50000,
        custoAdicionalPorCategoria: { negociacaoMaterial: 1000, horaAdicional: 500, recursoTemporario: 0, terceirizacao: 0 },
      }),
    );
    expect(snapshot.novoCustoTecnico).toBeCloseTo(51500, 6);
  });

  it("nunca usa valorComercialAtualReferencia na soma - só custoTecnicoAtual", () => {
    const snapshot = construirSnapshotCenarioComercial(
      parametrosBase({ custoTecnicoAtual: 50000, valorComercialAtualReferencia: 999999 }),
    );
    expect(snapshot.novoCustoTecnico).toBe(50000);
  });

  it("aprovadoPor/aprovadoEm são sempre placeholder - nunca um valor final", () => {
    const snapshot = construirSnapshotCenarioComercial(parametrosBase());
    expect(snapshot.aprovadoPor).toBe("PLACEHOLDER_SOBRESCRITO_PELA_RPC");
    expect(snapshot.aprovadoEm).toBe("PLACEHOLDER_SOBRESCRITO_PELA_RPC");
  });

  it("preserva o SaidaPrevisaoComercial completo, sem transformação", () => {
    const saida = saidaCalculada({ primeiraEntregaPossivel: "2026-10-01" });
    const snapshot = construirSnapshotCenarioComercial(parametrosBase({ saidaPrevisaoComercial: saida }));
    expect(snapshot.saidaPrevisaoComercial).toBe(saida);
  });
});
