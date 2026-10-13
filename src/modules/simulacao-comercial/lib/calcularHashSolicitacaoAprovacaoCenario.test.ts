import { describe, expect, it } from "vitest";
import { calcularHashSolicitacaoAprovacaoCenario, type DadosHashSolicitacaoAprovacaoCenario } from "./calcularHashSolicitacaoAprovacaoCenario";
import { construirSnapshotCenarioComercial } from "./cenarios/cenarioComercialAprovadoSnapshot";
import type { SaidaPrevisaoComercial } from "./cenarios/montarPrevisaoComercialProjeto";
import type { DocumentoAssinaturaTecnica } from "./cenarios/construirDocumentoAssinaturaTecnica";

function snapshotTecnicoFixture(): DocumentoAssinaturaTecnica {
  return {
    versao: 2,
    projetoId: "projeto-1",
    empresaId: "empresa-1",
    janela: { inicio: "2026-08-26", fim: "2026-09-02" },
    itens: [],
    ocorrencias: [],
    dependencias: [],
    recursos: [],
    convencoesHorasAdicionais: [],
    restricaoMaterialPorChave: [],
    calendario: { padraoSemanal: null, feriadosOficiais: [], eventosEmpresa: [] },
  };
}

function saidaBase(): SaidaPrevisaoComercial {
  return {
    dataSolicitadaCliente: "2026-09-01",
    status: "calculado",
    primeiraEntregaPossivel: "2026-09-02",
    atendeDataSolicitada: true,
    diferencaEmDias: 1,
    recursosQueDeterminamTermino: [],
    horizonteTecnico: "suficiente",
    diagnosticos: [],
    tipoAnalise: "previsao_comercial_por_capacidade",
    custoAdicional: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, total: 0 },
    capacidadeUtilizada: { horaAdicionalHoras: 0, recursoTemporarioHoras: 0 },
    detalhamentoPorRecurso: [],
  };
}

function dados(overrides: Partial<DadosHashSolicitacaoAprovacaoCenario> = {}): DadosHashSolicitacaoAprovacaoCenario {
  const snapshot = construirSnapshotCenarioComercial({
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    tipoCenario: "atual",
    premissas: { dataNecessidade: "2026-09-08", margemSegurancaDias: 0, dataPrevistaAprovacaoPedido: "2026-08-26" },
    disponibilidadeMaterial: { original: "2026-08-26", negociada: null },
    decisoesCapacidade: { capacidadeExtraAutorizada: [], temporariosPorPrioridade: [], contratacoes: [], contratacaoNegociacaoMaterial: null },
    saidaPrevisaoComercial: saidaBase(),
    custoTecnicoAtual: 3975,
    custoAdicionalPorCategoria: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, terceirizacao: 0 },
    valorComercialAtualReferencia: null,
  });

  return {
    empresaId: "empresa-1",
    aprovadoPor: "user-1",
    projetoId: "projeto-1",
    tipoCenario: "atual",
    dataSolicitadaCliente: "2026-09-01",
    prazoProposto: "2026-09-02",
    custoTecnicoAtual: 3975,
    custoAdicionalPorCategoria: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, terceirizacao: 0 },
    valorComercialAtualReferencia: null,
    assinaturaTecnica: "a".repeat(64),
    snapshot,
    snapshotTecnico: snapshotTecnicoFixture(),
    snapshotTecnicoVersao: 2,
    motivoSubstituicao: null,
    ...overrides,
  };
}

describe("calcularHashSolicitacaoAprovacaoCenario", () => {
  it("é determinístico: os mesmos dados sempre produzem o mesmo hash (64 hex)", () => {
    const hash1 = calcularHashSolicitacaoAprovacaoCenario(dados());
    const hash2 = calcularHashSolicitacaoAprovacaoCenario(dados());
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("projetoId diferente produz hash diferente (nunca confunde duas solicitações de projetos diferentes)", () => {
    const hashA = calcularHashSolicitacaoAprovacaoCenario(dados({ projetoId: "projeto-1" }));
    const hashB = calcularHashSolicitacaoAprovacaoCenario(dados({ projetoId: "projeto-2" }));
    expect(hashA).not.toBe(hashB);
  });

  it("custoTecnicoAtual diferente produz hash diferente", () => {
    const hashA = calcularHashSolicitacaoAprovacaoCenario(dados({ custoTecnicoAtual: 3975 }));
    const hashB = calcularHashSolicitacaoAprovacaoCenario(dados({ custoTecnicoAtual: 4920 }));
    expect(hashA).not.toBe(hashB);
  });

  it("assinaturaTecnica diferente produz hash diferente", () => {
    const hashA = calcularHashSolicitacaoAprovacaoCenario(dados({ assinaturaTecnica: "a".repeat(64) }));
    const hashB = calcularHashSolicitacaoAprovacaoCenario(dados({ assinaturaTecnica: "b".repeat(64) }));
    expect(hashA).not.toBe(hashB);
  });

  it("motivoSubstituicao diferente produz hash diferente", () => {
    const hashA = calcularHashSolicitacaoAprovacaoCenario(dados({ motivoSubstituicao: null }));
    const hashB = calcularHashSolicitacaoAprovacaoCenario(dados({ motivoSubstituicao: "Motivo X" }));
    expect(hashA).not.toBe(hashB);
  });

  it("aprovadoPor diferente produz hash diferente (liga a solicitação a quem aprovou)", () => {
    const hashA = calcularHashSolicitacaoAprovacaoCenario(dados({ aprovadoPor: "user-1" }));
    const hashB = calcularHashSolicitacaoAprovacaoCenario(dados({ aprovadoPor: "user-2" }));
    expect(hashA).not.toBe(hashB);
  });

  // PCP-P4Q/R/S - snapshotTecnico/snapshotTecnicoVersao passam a fazer
  // parte de "tudo que será persistido" - um reuso de chaveIdempotencia
  // com snapshot técnico diferente precisa ser detectável pelo hash.
  it("snapshotTecnico diferente produz hash diferente", () => {
    const hashA = calcularHashSolicitacaoAprovacaoCenario(dados());
    const hashB = calcularHashSolicitacaoAprovacaoCenario(
      dados({ snapshotTecnico: { ...snapshotTecnicoFixture(), projetoId: "projeto-2" } }),
    );
    expect(hashA).not.toBe(hashB);
  });

  it("snapshotTecnicoVersao diferente produz hash diferente", () => {
    const hashA = calcularHashSolicitacaoAprovacaoCenario(dados({ snapshotTecnicoVersao: 2 }));
    const hashB = calcularHashSolicitacaoAprovacaoCenario(dados({ snapshotTecnicoVersao: 3 }));
    expect(hashA).not.toBe(hashB);
  });
});
