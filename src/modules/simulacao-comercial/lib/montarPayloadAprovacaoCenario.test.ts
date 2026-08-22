import { describe, expect, it } from "vitest";
import { montarPayloadAprovacaoCenario, type ParametrosPayloadAprovacaoCenario } from "./montarPayloadAprovacaoCenario";
import { construirSnapshotCenarioComercial } from "./cenarios/cenarioComercialAprovadoSnapshot";
import type { SaidaPrevisaoComercial } from "./cenarios/montarPrevisaoComercialProjeto";

function parametros(overrides: Partial<ParametrosPayloadAprovacaoCenario> = {}): ParametrosPayloadAprovacaoCenario {
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
  };
  const snapshot = construirSnapshotCenarioComercial({
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    tipoCenario: "ajustado",
    premissas: { dataNecessidade: "2026-09-01", margemSegurancaDias: 0, dataPrevistaAprovacaoPedido: "2026-08-20" },
    disponibilidadeMaterial: { original: "2026-08-25", negociada: null },
    decisoesCapacidade: { capacidadeExtraAutorizada: [], temporariosPorPrioridade: [], contratacoes: [], contratacaoNegociacaoMaterial: null },
    saidaPrevisaoComercial: saida,
    custoTecnicoAtual: 50000,
    custoAdicionalPorCategoria: { negociacaoMaterial: 100, horaAdicional: 200, recursoTemporario: 0, terceirizacao: 0 },
    valorComercialAtualReferencia: 62000,
  });

  return {
    empresaId: "empresa-1",
    aprovadoPor: "user-1",
    projetoId: "projeto-1",
    tipoCenario: "ajustado",
    dataSolicitadaCliente: "2026-09-01",
    prazoProposto: "2026-09-10",
    custoTecnicoAtual: 50000,
    custoAdicionalPorCategoria: { negociacaoMaterial: 100, horaAdicional: 200, recursoTemporario: 0, terceirizacao: 0 },
    valorComercialAtualReferencia: 62000,
    snapshot,
    assinaturaTecnica: "a".repeat(64),
    chaveIdempotencia: "11111111-1111-1111-1111-111111111111",
    hashSolicitacao: "b".repeat(64),
    motivoSubstituicao: null,
    ...overrides,
  };
}

describe("montarPayloadAprovacaoCenario", () => {
  it("mapeia cada campo para o parâmetro p_* correspondente da RPC", () => {
    const payload = montarPayloadAprovacaoCenario(parametros());

    expect(payload).toEqual({
      p_empresa_id: "empresa-1",
      p_aprovado_por: "user-1",
      p_projeto_id: "projeto-1",
      p_tipo_cenario: "ajustado",
      p_data_solicitada_cliente: "2026-09-01",
      p_prazo_proposto: "2026-09-10",
      p_custo_tecnico_atual: 50000,
      p_custo_negociacao_material: 100,
      p_custo_hora_adicional: 200,
      p_custo_recurso_temporario: 0,
      p_custo_terceirizacao: 0,
      p_valor_comercial_atual_referencia: 62000,
      p_snapshot: parametros().snapshot,
      p_assinatura_tecnica: "a".repeat(64),
      p_chave_idempotencia: "11111111-1111-1111-1111-111111111111",
      p_hash_solicitacao: "b".repeat(64),
      p_motivo_substituicao: null,
    });
  });

  it("propaga motivoSubstituicao quando presente", () => {
    const payload = montarPayloadAprovacaoCenario(parametros({ motivoSubstituicao: "Cliente renegociou prazo." }));
    expect(payload.p_motivo_substituicao).toBe("Cliente renegociou prazo.");
  });
});
