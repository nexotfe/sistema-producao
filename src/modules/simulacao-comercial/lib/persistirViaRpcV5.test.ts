// Fase 2 (DEC-006, correção): teste comportamental da wiring real de
// persistência - client Supabase SIMULADO (não a leitura do código-fonte
// da Server Action, frágil e que não prova nada sobre o payload
// efetivamente enviado). Prova: uma única chamada a
// aprovar_projeto_com_simulacao_v5, com os 17 parâmetros exatos, e que
// erro da v5 é propagado sem qualquer tentativa de fallback para v4.
import { describe, expect, it, vi } from "vitest";
import { persistirViaRpcV5, type ClienteRpcV5 } from "./persistirViaRpcV5";
import { montarPayloadV5, type ParametrosPayloadV5, type EstimativaPersistivelV5 } from "./montarPayloadV5";
import type { DistribuicaoParaPersistencia, ItemSimulacaoOperacao } from "./executarSimulacao";

function distribuicao(overrides: Partial<DistribuicaoParaPersistencia> = {}): DistribuicaoParaPersistencia {
  return {
    recursoId: "recurso-1",
    origem: "ORIGINAL",
    ordemConsideracao: 0,
    capacidadeBrutaPeriodo: 100,
    produtividadeConsiderada: 0.8,
    capacidadeEfetiva: 80,
    comprometidoInicial: 0,
    capacidadeDisponivelInicial: 80,
    capacidadeDisponivelAntes: 80,
    horasPadraoAlocadas: 10,
    horasMaquinaEstimadas: 12.5,
    capacidadeDisponivelDepois: 70,
    ...overrides,
  };
}

function item(overrides: Partial<ItemSimulacaoOperacao> = {}): ItemSimulacaoOperacao {
  return {
    bomOperacaoId: "op-1",
    recursoOriginalId: "recurso-1",
    necessario: 10,
    deficit: 0,
    distribuicoes: [distribuicao()],
    ...overrides,
  };
}

const ESTIMATIVA_VIAVEL: EstimativaPersistivelV5 = {
  estado: "viavel",
  dataEstimadaInicioNecessario: "2026-11-18",
  folgaDiasProdutivos: 3,
  metodoVersao: 1,
};

function parametros(overrides: Partial<ParametrosPayloadV5> = {}): ParametrosPayloadV5 {
  return {
    aprovadoPor: "usuario-1",
    projetoId: "projeto-1",
    cenarioDemanda: "Pedidos confirmados",
    modoProducao: "Normal",
    dataNecessidade: "2026-11-26",
    margemSegurancaDias: 3,
    dataPrevistaAprovacaoPedido: "2026-11-02",
    dataChegadaPrevista: "2026-11-13",
    janelaInicio: "2026-11-16",
    janelaFim: "2026-11-26",
    estimativa: ESTIMATIVA_VIAVEL,
    itens: [item()],
    chaveIdempotencia: "11111111-1111-1111-1111-111111111111",
    hashSolicitacao: "hash-abc",
    ...overrides,
  };
}

function clienteSimulado(
  resposta: { data: unknown; error: { message: string } | null },
): ClienteRpcV5 & { rpc: ReturnType<typeof vi.fn> } {
  return { rpc: vi.fn(async () => resposta) };
}

describe("persistirViaRpcV5 — wiring real (client Supabase simulado)", () => {
  it("sucesso: chama a RPC exatamente uma vez, só aprovar_projeto_com_simulacao_v5", async () => {
    const cliente = clienteSimulado({ data: "snapshot-1", error: null });

    await persistirViaRpcV5(cliente, parametros());

    expect(cliente.rpc).toHaveBeenCalledTimes(1);
    expect(cliente.rpc.mock.calls[0][0]).toBe("aprovar_projeto_com_simulacao_v5");
  });

  it("sucesso: envia os 17 parâmetros exatos - idênticos ao payload de montarPayloadV5 para os mesmos dados", async () => {
    const cliente = clienteSimulado({ data: "snapshot-1", error: null });
    const params = parametros();

    await persistirViaRpcV5(cliente, params);

    const payloadEnviado = cliente.rpc.mock.calls[0][1];
    expect(payloadEnviado).toEqual(montarPayloadV5(params));
    expect(Object.keys(payloadEnviado)).toHaveLength(17);
  });

  it("sucesso: devolve o id do snapshot retornado pela RPC, sem erro", async () => {
    const cliente = clienteSimulado({ data: "snapshot-xyz", error: null });

    const resultado = await persistirViaRpcV5(cliente, parametros());

    expect(resultado).toEqual({ simulacaoComercialId: "snapshot-xyz", erro: null });
  });

  it("erro da v5: é propagado no retorno (erro preenchido, simulacaoComercialId null), sem qualquer tentativa de v4", async () => {
    const cliente = clienteSimulado({
      data: null,
      error: { message: "Conflito de idempotencia: chave já foi usada para uma solicitação com conteúdo diferente." },
    });

    const resultado = await persistirViaRpcV5(cliente, parametros());

    expect(resultado).toEqual({
      simulacaoComercialId: null,
      erro: "Conflito de idempotencia: chave já foi usada para uma solicitação com conteúdo diferente.",
    });

    // Nenhuma segunda tentativa - nem para v5 de novo, nem para v4.
    expect(cliente.rpc).toHaveBeenCalledTimes(1);
    expect(cliente.rpc.mock.calls[0][0]).toBe("aprovar_projeto_com_simulacao_v5");
  });

  it("os 4 campos de estimativa no payload enviado vêm de params.estimativa - muda a estimativa, muda só esses 4 campos no payload enviado à RPC", async () => {
    const cliente = clienteSimulado({ data: "snapshot-1", error: null });

    await persistirViaRpcV5(
      cliente,
      parametros({
        estimativa: {
          estado: "janela_insuficiente",
          dataEstimadaInicioNecessario: "2026-11-20",
          dataDisponibilidadeProducao: "2026-11-25",
          folgaDiasProdutivos: -3,
          avaliacaoNaJanelaRealmentePermitida: { deficitTotal: 2, resultadoPorOperacao: [] },
          metodoVersao: 1,
        },
      }),
    );

    const payloadEnviado = cliente.rpc.mock.calls[0][1];
    expect(payloadEnviado.p_estimativa_estado).toBe("janela_insuficiente");
    expect(payloadEnviado.p_estimativa_inicio_necessario).toBe("2026-11-20");
    expect(payloadEnviado.p_folga_dias_produtivos).toBe(-3);
    expect(payloadEnviado.p_estimativa_metodo_versao).toBe(1);
  });
});
