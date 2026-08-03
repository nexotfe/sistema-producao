// Testes do núcleo puro (Entrega 2 - distribuição parcial). Sem rede,
// sem Supabase - só entradas em memória e o algoritmo em si. Cobre o
// exemplo funcional do enunciado (140/40/20 sobre 200h) e os cenários
// obrigatórios definidos na auditoria de 2026-08-02.
import { describe, expect, it } from "vitest";
import {
  executarMotorAvaliacaoSequencial,
  normalizarCandidatos,
  type EntradasMotor,
} from "./motorAvaliacaoSequencial";
import { CandidatoDuplicadoError } from "./errors";

function operacao(overrides: Partial<EntradasMotor["operacoesOrdenadas"][number]> = {}) {
  return {
    bomOperacaoId: "op-1",
    recursoOriginalId: "recurso-original",
    tempoEstimadoMinutos: 60,
    quantidade: 1,
    ...overrides,
  };
}

describe("normalizarCandidatos", () => {
  it("coloca o original primeiro, por construção explícita - não por um sentinela numérico", () => {
    const candidatos = normalizarCandidatos("original", [
      { recursoId: "compat-2", prioridade: 2 },
      { recursoId: "compat-1", prioridade: 1 },
    ]);

    expect(candidatos.map((c) => c.recursoId)).toEqual(["original", "compat-1", "compat-2"]);
    expect(candidatos[0].origem).toBe("ORIGINAL");
    expect(candidatos[0].prioridade).toBeNull();
    expect(candidatos[1].prioridade).toBe(1);
  });

  it("lança CandidatoDuplicadoError se o original também aparecer entre os compatíveis", () => {
    expect(() =>
      normalizarCandidatos("original", [{ recursoId: "original", prioridade: 1 }]),
    ).toThrow(CandidatoDuplicadoError);
  });

  it("lança CandidatoDuplicadoError se um compatível se repetir", () => {
    expect(() =>
      normalizarCandidatos("original", [
        { recursoId: "compat-1", prioridade: 1 },
        { recursoId: "compat-1", prioridade: 2 },
      ]),
    ).toThrow(CandidatoDuplicadoError);
  });
});

describe("executarMotorAvaliacaoSequencial", () => {
  it("original atende tudo - 1 distribuição, déficit 0", () => {
    const entradas: EntradasMotor = {
      operacoesOrdenadas: [operacao({ tempoEstimadoMinutos: 60, quantidade: 5 })], // 5h
      capacidadeDisponivelInicial: { "recurso-original": 10 },
      compatibilidades: {},
    };

    const [resultado] = executarMotorAvaliacaoSequencial(entradas);

    expect(resultado.deficit).toBe(0);
    expect(resultado.distribuicoes).toHaveLength(1);
    expect(resultado.distribuicoes[0]).toMatchObject({
      recursoId: "recurso-original",
      origem: "ORIGINAL",
      horasPadraoAlocadas: 5,
      capacidadeDisponivelAntes: 10,
      capacidadeDisponivelDepois: 5,
    });
  });

  it("exemplo funcional do enunciado: 200h -> original 140 + compatível 1 (40) + compatível 2 (20), déficit 0", () => {
    const entradas: EntradasMotor = {
      operacoesOrdenadas: [operacao({ tempoEstimadoMinutos: 200 * 60, quantidade: 1 })],
      capacidadeDisponivelInicial: {
        "recurso-original": 140,
        "compat-1": 40,
        "compat-2": 20,
      },
      compatibilidades: {
        "recurso-original": [
          { recursoId: "compat-1", prioridade: 1 },
          { recursoId: "compat-2", prioridade: 2 },
        ],
      },
    };

    const [resultado] = executarMotorAvaliacaoSequencial(entradas);

    expect(resultado.deficit).toBe(0);
    expect(resultado.distribuicoes.map((d) => [d.recursoId, d.horasPadraoAlocadas])).toEqual([
      ["recurso-original", 140],
      ["compat-1", 40],
      ["compat-2", 20],
    ]);
  });

  it("déficit residual quando a soma de todos os candidatos não cobre a necessidade", () => {
    const entradas: EntradasMotor = {
      operacoesOrdenadas: [operacao({ tempoEstimadoMinutos: 100 * 60, quantidade: 1 })], // 100h
      capacidadeDisponivelInicial: { "recurso-original": 30, "compat-1": 20 },
      compatibilidades: {
        "recurso-original": [{ recursoId: "compat-1", prioridade: 1 }],
      },
    };

    const [resultado] = executarMotorAvaliacaoSequencial(entradas);

    expect(resultado.deficit).toBe(50);
    expect(resultado.distribuicoes.map((d) => d.horasPadraoAlocadas)).toEqual([30, 20]);
  });

  it("consumo compartilhado entre operações sucessivas - a 2a operação vê o saldo já reduzido pela 1a", () => {
    const entradas: EntradasMotor = {
      operacoesOrdenadas: [
        operacao({ bomOperacaoId: "op-1", tempoEstimadoMinutos: 60 * 60, quantidade: 1 }), // 60h
        operacao({ bomOperacaoId: "op-2", tempoEstimadoMinutos: 50 * 60, quantidade: 1 }), // 50h
      ],
      capacidadeDisponivelInicial: { "recurso-original": 80 },
      compatibilidades: {},
    };

    const [resultado1, resultado2] = executarMotorAvaliacaoSequencial(entradas);

    expect(resultado1.deficit).toBe(0);
    expect(resultado1.distribuicoes[0].capacidadeDisponivelDepois).toBe(20);

    // op-2 precisa de 50h, mas só sobrou 20h do recurso original (nem
    // op-1 nem op-2 têm compatível) - déficit de 30h.
    expect(resultado2.distribuicoes[0].capacidadeDisponivelAntes).toBe(20);
    expect(resultado2.distribuicoes[0].horasPadraoAlocadas).toBe(20);
    expect(resultado2.deficit).toBe(30);
  });

  it("ordenação determinística - mesma entrada, execuções repetidas, mesmo resultado", () => {
    const entradas: EntradasMotor = {
      operacoesOrdenadas: [operacao({ tempoEstimadoMinutos: 100 * 60, quantidade: 1 })],
      capacidadeDisponivelInicial: { "recurso-original": 30, "compat-1": 40, "compat-2": 50 },
      compatibilidades: {
        "recurso-original": [
          { recursoId: "compat-2", prioridade: 2 },
          { recursoId: "compat-1", prioridade: 1 },
        ],
      },
    };

    const execucao1 = executarMotorAvaliacaoSequencial(entradas);
    const execucao2 = executarMotorAvaliacaoSequencial(entradas);

    expect(execucao1).toEqual(execucao2);
    expect(execucao1[0].distribuicoes.map((d) => d.recursoId)).toEqual([
      "recurso-original",
      "compat-1",
      "compat-2",
    ]);
  });

  it("operação sem recurso compatível cadastrado - só o original é candidato", () => {
    const entradas: EntradasMotor = {
      operacoesOrdenadas: [operacao({ tempoEstimadoMinutos: 100 * 60, quantidade: 1 })],
      capacidadeDisponivelInicial: { "recurso-original": 40 },
      compatibilidades: {},
    };

    const [resultado] = executarMotorAvaliacaoSequencial(entradas);

    expect(resultado.distribuicoes).toHaveLength(1);
    expect(resultado.distribuicoes[0].recursoId).toBe("recurso-original");
    expect(resultado.deficit).toBe(60);
  });

  it("resíduo de ponto flutuante próximo de zero não vira déficit nem saldo negativo artificial", () => {
    const entradas: EntradasMotor = {
      operacoesOrdenadas: [
        operacao({ bomOperacaoId: "op-1", tempoEstimadoMinutos: 0.1 * 60, quantidade: 1 }),
        operacao({ bomOperacaoId: "op-2", tempoEstimadoMinutos: 0.2 * 60, quantidade: 1 }),
      ],
      // 0.1 + 0.2 = 0.30000000000000004 em ponto flutuante - a soma das
      // duas operações bate exatamente a capacidade disponível.
      capacidadeDisponivelInicial: { "recurso-original": 0.3 },
      compatibilidades: {},
    };

    const [resultado1, resultado2] = executarMotorAvaliacaoSequencial(entradas);

    expect(resultado1.deficit).toBe(0);
    expect(resultado2.deficit).toBe(0);
    expect(resultado2.distribuicoes[0].capacidadeDisponivelDepois).toBeGreaterThanOrEqual(0);
  });

  it("comprometido nunca é subtraído duas vezes - capacidadeDisponivelInicial já é líquida", () => {
    // O núcleo recebe capacidadeDisponivelInicial JÁ LÍQUIDA (ver
    // prepararEntradasMotor.ts - é o único lugar onde o desconto de
    // comprometido acontece). `comprometido` não é mais um campo de
    // EntradasMotor - este teste prova que o núcleo consome
    // capacidadeDisponivelInicial diretamente, sem nenhum desconto
    // adicional.
    const entradas: EntradasMotor = {
      operacoesOrdenadas: [operacao({ tempoEstimadoMinutos: 10 * 60, quantidade: 1 })], // 10h
      capacidadeDisponivelInicial: { "recurso-original": 10 }, // já líquido
      compatibilidades: {},
    };

    const [resultado] = executarMotorAvaliacaoSequencial(entradas);

    expect(resultado.deficit).toBe(0);
    expect(resultado.distribuicoes[0].horasPadraoAlocadas).toBe(10);
  });
});
