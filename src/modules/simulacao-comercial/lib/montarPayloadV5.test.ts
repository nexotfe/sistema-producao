// Fase 2 do rollout de DEC-006: prova que montarPayloadV5 monta os 17
// parâmetros nativos de aprovar_projeto_com_simulacao_v5 com os nomes
// exatos da assinatura da RPC (supabase/migrations/202608030001_...sql)
// e que a estimativa transportada é SEMPRE a recalculada
// (params.estimativa, nunca outro valor). O teste comportamental da
// chamada real de RPC (client Supabase simulado, chamada única, erro
// propagado sem fallback para v4) vive em persistirViaRpcV5.test.ts -
// este arquivo cobre só o mapeamento puro, sem rede.
import { describe, expect, it } from "vitest";
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

describe("montarPayloadV5 — payload completo, nomes/ordem exatos da RPC v5", () => {
  it("monta os 17 parâmetros com os nomes exatos da assinatura de aprovar_projeto_com_simulacao_v5", () => {
    const resultado = montarPayloadV5(parametros());

    expect(Object.keys(resultado)).toEqual([
      "p_aprovado_por",
      "p_projeto_id",
      "p_cenario_demanda",
      "p_modo_producao",
      "p_data_necessidade",
      "p_margem_seguranca_dias",
      "p_data_prevista_aprovacao_pedido",
      "p_data_chegada_prevista",
      "p_janela_inicio",
      "p_janela_fim",
      "p_estimativa_inicio_necessario",
      "p_estimativa_estado",
      "p_estimativa_metodo_versao",
      "p_folga_dias_produtivos",
      "p_itens",
      "p_chave_idempotencia",
      "p_hash_solicitacao",
    ]);
  });

  it("transporta os campos comerciais/janela sem transformação", () => {
    const resultado = montarPayloadV5(
      parametros({
        aprovadoPor: "usuario-77",
        projetoId: "projeto-77",
        cenarioDemanda: "Pedidos confirmados",
        modoProducao: "Urgente",
        dataNecessidade: "2026-12-01",
        margemSegurancaDias: 5,
        dataPrevistaAprovacaoPedido: "2026-11-05",
        dataChegadaPrevista: "2026-11-15",
        janelaInicio: "2026-11-18",
        janelaFim: "2026-12-01",
        chaveIdempotencia: "chave-77",
        hashSolicitacao: "hash-77",
      }),
    );

    expect(resultado).toMatchObject({
      p_aprovado_por: "usuario-77",
      p_projeto_id: "projeto-77",
      p_cenario_demanda: "Pedidos confirmados",
      p_modo_producao: "Urgente",
      p_data_necessidade: "2026-12-01",
      p_margem_seguranca_dias: 5,
      p_data_prevista_aprovacao_pedido: "2026-11-05",
      p_data_chegada_prevista: "2026-11-15",
      p_janela_inicio: "2026-11-18",
      p_janela_fim: "2026-12-01",
      p_chave_idempotencia: "chave-77",
      p_hash_solicitacao: "hash-77",
    });
  });

  it("p_itens usa o mesmo mapeamento nativo já provado em montarItensParaV4 (sem perda)", () => {
    const resultado = montarPayloadV5(
      parametros({ itens: [item({ bomOperacaoId: "op-x", necessario: 50, deficit: 10 })] }),
    );

    expect(resultado.p_itens).toEqual([
      {
        bom_operacao_id: "op-x",
        recurso_original_id: "recurso-1",
        necessario: 50,
        deficit: 10,
        distribuicoes: [
          {
            recurso_id: "recurso-1",
            origem: "ORIGINAL",
            ordem_consideracao: 0,
            capacidade_bruta_periodo: 100,
            produtividade_considerada: 0.8,
            capacidade_efetiva: 80,
            comprometido_inicial: 0,
            capacidade_disponivel_inicial: 80,
            capacidade_disponivel_antes: 80,
            horas_padrao_alocadas: 10,
            horas_maquina_estimadas: 12.5,
            capacidade_disponivel_depois: 70,
          },
        ],
      },
    ]);
  });
});

describe("montarPayloadV5 — campos novos (estimativa), sempre vindos de params.estimativa", () => {
  it("estado viavel: mapeia dataEstimadaInicioNecessario/estado/metodoVersao/folgaDiasProdutivos 1:1", () => {
    const resultado = montarPayloadV5(
      parametros({
        estimativa: {
          estado: "viavel",
          dataEstimadaInicioNecessario: "2026-11-20",
          folgaDiasProdutivos: 4,
          metodoVersao: 1,
        },
      }),
    );

    expect(resultado.p_estimativa_inicio_necessario).toBe("2026-11-20");
    expect(resultado.p_estimativa_estado).toBe("viavel");
    expect(resultado.p_estimativa_metodo_versao).toBe(1);
    expect(resultado.p_folga_dias_produtivos).toBe(4);
  });

  it("estado viavel_no_limite: folga zero é transportada como zero (não confundida com ausente/falsy)", () => {
    const resultado = montarPayloadV5(
      parametros({
        estimativa: {
          estado: "viavel_no_limite",
          dataEstimadaInicioNecessario: "2026-11-16",
          folgaDiasProdutivos: 0,
          metodoVersao: 1,
        },
      }),
    );

    expect(resultado.p_estimativa_estado).toBe("viavel_no_limite");
    expect(resultado.p_folga_dias_produtivos).toBe(0);
  });

  it("estado janela_insuficiente: folga negativa é transportada com sinal preservado", () => {
    const resultado = montarPayloadV5(
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

    expect(resultado.p_estimativa_estado).toBe("janela_insuficiente");
    expect(resultado.p_folga_dias_produtivos).toBe(-3);
    expect(resultado.p_estimativa_inicio_necessario).toBe("2026-11-20");
  });

  it("os 4 campos de estimativa vêm exclusivamente de params.estimativa - nunca de outro campo de params", () => {
    // Sentinela: se a implementação um dia passar a ler algum outro
    // campo de `params` (ex.: um campo de estimativa solto no nível
    // raiz) por engano, mudar só `estimativa` aqui detectaria a falha
    // porque o resto do objeto passado permanece intacto.
    const base = parametros();
    const resultadoBase = montarPayloadV5(base);

    const resultadoAlterado = montarPayloadV5({
      ...base,
      estimativa: {
        estado: "viavel",
        dataEstimadaInicioNecessario: "2099-01-01",
        folgaDiasProdutivos: 999,
        metodoVersao: 1,
      },
    });

    expect(resultadoAlterado.p_estimativa_inicio_necessario).not.toBe(resultadoBase.p_estimativa_inicio_necessario);
    expect(resultadoAlterado.p_folga_dias_produtivos).not.toBe(resultadoBase.p_folga_dias_produtivos);
    // Nenhum outro campo do payload muda quando só a estimativa muda.
    expect(resultadoAlterado.p_aprovado_por).toBe(resultadoBase.p_aprovado_por);
    expect(resultadoAlterado.p_itens).toEqual(resultadoBase.p_itens);
  });
});
