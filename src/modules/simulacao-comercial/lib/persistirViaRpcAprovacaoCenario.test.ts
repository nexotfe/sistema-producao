import { describe, expect, it, vi } from "vitest";
import { persistirViaRpcAprovacaoCenario, type ClienteRpcAprovacaoCenario } from "./persistirViaRpcAprovacaoCenario";
import { construirSnapshotCenarioComercial } from "./cenarios/cenarioComercialAprovadoSnapshot";
import type { ParametrosPayloadAprovacaoCenario } from "./montarPayloadAprovacaoCenario";
import type { SaidaPrevisaoComercial } from "./cenarios/montarPrevisaoComercialProjeto";

function parametros(): ParametrosPayloadAprovacaoCenario {
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
    custoAdicional: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, total: 0 },
    capacidadeUtilizada: { horaAdicionalHoras: 0, recursoTemporarioHoras: 0 },
    detalhamentoPorRecurso: [],
  };
  return {
    empresaId: "empresa-1",
    aprovadoPor: "user-1",
    projetoId: "projeto-1",
    tipoCenario: "atual",
    dataSolicitadaCliente: "2026-09-01",
    prazoProposto: "2026-09-10",
    custoTecnicoAtual: 50000,
    custoAdicionalPorCategoria: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, terceirizacao: 0 },
    valorComercialAtualReferencia: null,
    assinaturaTecnica: "a".repeat(64),
    chaveIdempotencia: "11111111-1111-1111-1111-111111111111",
    hashSolicitacao: "c".repeat(64),
    snapshot: construirSnapshotCenarioComercial({
      empresaId: "empresa-1",
      projetoId: "projeto-1",
      tipoCenario: "atual",
      premissas: { dataNecessidade: "2026-09-01", margemSegurancaDias: 0, dataPrevistaAprovacaoPedido: "2026-08-20" },
      disponibilidadeMaterial: { original: "2026-08-25", negociada: null },
      decisoesCapacidade: { capacidadeExtraAutorizada: [], temporariosPorPrioridade: [], contratacoes: [], contratacaoNegociacaoMaterial: null },
      saidaPrevisaoComercial: saida,
      custoTecnicoAtual: 50000,
      custoAdicionalPorCategoria: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, terceirizacao: 0 },
      valorComercialAtualReferencia: null,
    }),
    motivoSubstituicao: null,
  };
}

describe("persistirViaRpcAprovacaoCenario", () => {
  it("chama aprovar_cenario_comercial_v2 (nunca a RPC antiga) com o payload mapeado e devolve o id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "novo-id", error: null });
    const cliente: ClienteRpcAprovacaoCenario = { rpc };

    const resultado = await persistirViaRpcAprovacaoCenario(cliente, parametros());

    expect(rpc).toHaveBeenCalledWith("aprovar_cenario_comercial_v2", expect.objectContaining({ p_projeto_id: "projeto-1", p_tipo_cenario: "atual" }));
    expect(resultado).toEqual({ cenarioComercialAprovadoId: "novo-id", erro: null });
  });

  it("devolve o erro técnico sem lançar, nunca tenta outra via", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "Só administradores podem aprovar um cenário comercial." } });
    const cliente: ClienteRpcAprovacaoCenario = { rpc };

    const resultado = await persistirViaRpcAprovacaoCenario(cliente, parametros());

    expect(resultado).toEqual({ cenarioComercialAprovadoId: null, erro: "Só administradores podem aprovar um cenário comercial." });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  // Migração 20260822195805 (idempotência) - distinção crítica: erro
  // LIMPO (acima) já sabemos que nada foi gravado; erro AMBÍGUO (aqui)
  // não sabemos - a própria chamada de rede nunca completou um ciclo
  // requisição/resposta.
  it("chamada de rede lança (nunca chega a uma resposta): devolve gravacaoIncerta=true, nunca assume sucesso nem falha definitiva", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const cliente: ClienteRpcAprovacaoCenario = { rpc };

    const resultado = await persistirViaRpcAprovacaoCenario(cliente, parametros());

    expect(resultado).toEqual({ cenarioComercialAprovadoId: null, erro: "fetch failed", gravacaoIncerta: true });
  });

  it("erro limpo da RPC (ciclo requisição/resposta completo): gravacaoIncerta nunca é true", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "Conflito de idempotência: chave já usada." } });
    const cliente: ClienteRpcAprovacaoCenario = { rpc };

    const resultado = await persistirViaRpcAprovacaoCenario(cliente, parametros());

    expect(resultado.gravacaoIncerta).not.toBe(true);
  });
});
