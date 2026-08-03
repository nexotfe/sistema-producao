import { describe, expect, it } from "vitest";
import { compararResultadosSimulacao } from "./compararResultadosSimulacao";
import type { DistribuicaoParaPersistencia, ItemSimulacaoOperacao, ResultadoSimulacao } from "./executarSimulacao";

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

function resultado(itens: ItemSimulacaoOperacao[]): ResultadoSimulacao {
  return { itensPorOperacao: itens };
}

describe("compararResultadosSimulacao", () => {
  it("resultados idênticos (mesmo objeto reconstruído) são identico=true", () => {
    const a = resultado([item()]);
    const b = resultado([item()]);

    expect(compararResultadosSimulacao(a, b).identico).toBe(true);
  });

  it("mesma distribuição em ordem de array diferente ainda é identico=true (compara por recursoId, não posição)", () => {
    const a = resultado([
      item({ distribuicoes: [distribuicao({ recursoId: "r1" }), distribuicao({ recursoId: "r2" })] }),
    ]);
    const b = resultado([
      item({ distribuicoes: [distribuicao({ recursoId: "r2" }), distribuicao({ recursoId: "r1" })] }),
    ]);

    expect(compararResultadosSimulacao(a, b).identico).toBe(true);
  });

  it("distribuição a mais é detectada", () => {
    const a = resultado([item({ distribuicoes: [distribuicao({ recursoId: "r1" })] })]);
    const b = resultado([
      item({ distribuicoes: [distribuicao({ recursoId: "r1" }), distribuicao({ recursoId: "r2" })] }),
    ]);

    const comparacao = compararResultadosSimulacao(a, b);
    expect(comparacao.identico).toBe(false);
    expect(comparacao.diferencas.some((d) => d.campo === "distribuicoes")).toBe(true);
  });

  it("necessario diferente é detectado", () => {
    const a = resultado([item({ necessario: 10 })]);
    const b = resultado([item({ necessario: 15 })]);

    const comparacao = compararResultadosSimulacao(a, b);
    expect(comparacao.identico).toBe(false);
    expect(comparacao.diferencas.some((d) => d.campo === "necessario")).toBe(true);
  });

  it("operação removida/adicionada é detectada", () => {
    const a = resultado([item({ bomOperacaoId: "op-1" })]);
    const b = resultado([item({ bomOperacaoId: "op-2" })]);

    const comparacao = compararResultadosSimulacao(a, b);
    expect(comparacao.identico).toBe(false);
    expect(comparacao.diferencas.map((d) => d.campo)).toEqual(
      expect.arrayContaining(["presenca", "presenca"]),
    );
  });

  it("diferença numérica dentro da tolerância (EPSILON_HORAS) não conta como divergência", () => {
    const a = resultado([item({ distribuicoes: [distribuicao({ horasPadraoAlocadas: 10 })] })]);
    const b = resultado([item({ distribuicoes: [distribuicao({ horasPadraoAlocadas: 10 + 1e-9 })] })]);

    expect(compararResultadosSimulacao(a, b).identico).toBe(true);
  });

  it("diferença numérica além da tolerância conta como divergência", () => {
    const a = resultado([item({ distribuicoes: [distribuicao({ horasPadraoAlocadas: 10 })] })]);
    const b = resultado([item({ distribuicoes: [distribuicao({ horasPadraoAlocadas: 10.01 })] })]);

    expect(compararResultadosSimulacao(a, b).identico).toBe(false);
  });

  it("recursoId duplicado dentro de uma mesma operação lança erro explícito, nunca vira Map silenciosamente", () => {
    const a = resultado([
      item({
        distribuicoes: [
          distribuicao({ recursoId: "r1", horasPadraoAlocadas: 5 }),
          distribuicao({ recursoId: "r1", horasPadraoAlocadas: 5 }),
        ],
      }),
    ]);
    const b = resultado([item({ distribuicoes: [distribuicao({ recursoId: "r1" })] })]);

    expect(() => compararResultadosSimulacao(a, b)).toThrow(/recursoId duplicado/);
  });
});
