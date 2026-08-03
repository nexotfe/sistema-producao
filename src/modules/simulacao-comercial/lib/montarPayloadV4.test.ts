// Fase 3 do rollout da Entrega 2: prova que o mapeamento para o
// formato nativo da RPC v4 é íntegro (nenhum campo perdido, nenhum
// campo inventado) nos 4 formatos que a v4 representa nativamente -
// ao contrário da ponte v3 da Fase 2, nenhum desses casos é rejeitado.
import { describe, expect, it } from "vitest";
import { montarItensParaV4 } from "./montarPayloadV4";
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

describe("montarItensParaV4", () => {
  it("payload com 1 distribuição: mapeia todos os campos, 1:1, sem perda", () => {
    const [resultado] = montarItensParaV4([
      item({
        bomOperacaoId: "op-1",
        recursoOriginalId: "recurso-original",
        necessario: 10,
        deficit: 0,
        distribuicoes: [
          distribuicao({
            recursoId: "recurso-1",
            origem: "ORIGINAL",
            ordemConsideracao: 0,
            capacidadeBrutaPeriodo: 100,
            produtividadeConsiderada: 0.8,
            capacidadeEfetiva: 80,
            comprometidoInicial: 5,
            capacidadeDisponivelInicial: 75,
            capacidadeDisponivelAntes: 75,
            horasPadraoAlocadas: 10,
            horasMaquinaEstimadas: 12.5,
            capacidadeDisponivelDepois: 65,
          }),
        ],
      }),
    ]);

    expect(resultado).toEqual({
      bom_operacao_id: "op-1",
      recurso_original_id: "recurso-original",
      necessario: 10,
      deficit: 0,
      distribuicoes: [
        {
          recurso_id: "recurso-1",
          origem: "ORIGINAL",
          ordem_consideracao: 0,
          capacidade_bruta_periodo: 100,
          produtividade_considerada: 0.8,
          capacidade_efetiva: 80,
          comprometido_inicial: 5,
          capacidade_disponivel_inicial: 75,
          capacidade_disponivel_antes: 75,
          horas_padrao_alocadas: 10,
          horas_maquina_estimadas: 12.5,
          capacidade_disponivel_depois: 65,
        },
      ],
    });
  });

  it("payload com múltiplas distribuições (exemplo do enunciado: original 140 + compatível 1 (40) + compatível 2 (20), déficit 0)", () => {
    const [resultado] = montarItensParaV4([
      item({
        necessario: 200,
        deficit: 0,
        distribuicoes: [
          distribuicao({ recursoId: "original", origem: "ORIGINAL", ordemConsideracao: 0, horasPadraoAlocadas: 140 }),
          distribuicao({
            recursoId: "compat-1",
            origem: "COMPATIBILIDADE",
            ordemConsideracao: 1,
            horasPadraoAlocadas: 40,
          }),
          distribuicao({
            recursoId: "compat-2",
            origem: "COMPATIBILIDADE",
            ordemConsideracao: 2,
            horasPadraoAlocadas: 20,
          }),
        ],
      }),
    ]);

    expect(resultado.distribuicoes).toHaveLength(3);
    expect(resultado.distribuicoes.map((d) => [d.recurso_id, d.horas_padrao_alocadas])).toEqual([
      ["original", 140],
      ["compat-1", 40],
      ["compat-2", 20],
    ]);
    expect(resultado.deficit).toBe(0);
  });

  it("déficit residual: soma das distribuições menor que necessário, representado nativamente (sem rejeição, ao contrário da v3)", () => {
    const [resultado] = montarItensParaV4([
      item({
        necessario: 100,
        deficit: 50,
        distribuicoes: [
          distribuicao({ recursoId: "original", horasPadraoAlocadas: 30 }),
          distribuicao({ recursoId: "compat-1", origem: "COMPATIBILIDADE", ordemConsideracao: 1, horasPadraoAlocadas: 20 }),
        ],
      }),
    ]);

    expect(resultado.distribuicoes).toHaveLength(2);
    expect(resultado.deficit).toBe(50);
    expect(resultado.necessario).toBe(100);
  });

  it("déficit total: zero distribuições", () => {
    const [resultado] = montarItensParaV4([
      item({ necessario: 10, deficit: 10, distribuicoes: [] }),
    ]);

    expect(resultado.distribuicoes).toEqual([]);
    expect(resultado.deficit).toBe(10);
  });

  it("mapeia múltiplas operações preservando a ordem do array de entrada", () => {
    const resultado = montarItensParaV4([
      item({ bomOperacaoId: "op-1" }),
      item({ bomOperacaoId: "op-2", distribuicoes: [] , deficit: 10 }),
    ]);

    expect(resultado.map((i) => i.bom_operacao_id)).toEqual(["op-1", "op-2"]);
  });
});
