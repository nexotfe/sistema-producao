// Entrega 3 (Calculador Reverso) - Fase 1. Testes 100% puros, sem
// SupabaseClient nem calendário real - P é uma sequência sintética de
// dias civis consecutivos (o que P representa - dias PRODUTIVOS - é
// responsabilidade de quem a constrói, Fase 2; aqui só a lógica de
// busca/classificação é exercitada).
import { describe, expect, it, vi } from "vitest";
import {
  ESTIMATIVA_METODO_VERSAO,
  avaliarPorDiasProdutivos,
  buscarMaiorIndiceViavel,
  calcularEstimativaInicioNecessario,
  distanciaProdutivaComSinal,
  indiceEmP,
  verificarCapacidadeCadastralSuficiente,
  type AvaliacaoJanela,
} from "./estimarInicioNecessario";
import { executarMotorAvaliacaoSequencial } from "./motorAvaliacaoSequencial";
import type { BaseFixaMotor } from "./prepararEntradasMotor";

function somarDiasCivis(data: string, quantidade: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + quantidade)).toISOString().slice(0, 10);
}

function gerarP(dataInicial: string, quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => somarDiasCivis(dataInicial, i));
}

// Fake que trata todo dia civil como produtivo - suficiente para testar
// a lógica pura de busca/distância sem depender de regras de calendário
// reais (já cobertas em contextoCalendario.test.ts, e de novo com o
// calendário real em prepararCalculadorReverso.test.ts, Fase 2).
// Assíncrona só para respeitar o contrato real (Promise<number>) - o
// valor em si é síncrono por construção.
async function contarDiasCivisInclusive(a: string, b: string): Promise<number> {
  const [anoA, mesA, diaA] = a.split("-").map(Number);
  const [anoB, mesB, diaB] = b.split("-").map(Number);
  const utcA = Date.UTC(anoA, mesA - 1, diaA);
  const utcB = Date.UTC(anoB, mesB - 1, diaB);
  return Math.round((utcB - utcA) / 86400000) + 1;
}

function baseFixa(overrides: Partial<BaseFixaMotor> = {}): BaseFixaMotor {
  return {
    operacoesOrdenadas: [
      { bomOperacaoId: "op-1", recursoOriginalId: "r1", tempoEstimadoMinutos: 60, quantidade: 24 }, // 24h necessárias
    ],
    recursoIds: ["r1"],
    compatibilidades: {},
    capacidadeDiariaPorRecurso: { r1: 8 },
    produtividadePorRecurso: { r1: 1 },
    comprometidoInicialPorRecurso: { r1: 0 },
    ...overrides,
  };
}

const P10 = gerarP("2026-01-01", 10); // P[0..9], 2026-01-01 .. 2026-01-10

describe("verificarCapacidadeCadastralSuficiente", () => {
  it("não bloqueia quando o original tem capacidade positiva", () => {
    expect(verificarCapacidadeCadastralSuficiente(baseFixa())).toBeNull();
  });

  it("bloqueia (capacidade_cadastral_zero) quando NENHUM candidato (original + compatíveis) tem capacidade positiva", () => {
    const base = baseFixa({ capacidadeDiariaPorRecurso: { r1: 0 } });
    const resultado = verificarCapacidadeCadastralSuficiente(base);
    expect(resultado).toEqual({
      causa: "capacidade_cadastral_zero",
      operacaoAfetada: "op-1",
      recursosAfetados: ["r1"],
    });
  });

  it("NÃO bloqueia quando o original é zero mas um compatível tem capacidade positiva (correção: nenhum candidato, não apenas algum)", () => {
    const base = baseFixa({
      recursoIds: ["r1", "r2"],
      capacidadeDiariaPorRecurso: { r1: 0, r2: 8 },
      produtividadePorRecurso: { r1: 1, r2: 1 },
      comprometidoInicialPorRecurso: { r1: 0, r2: 0 },
      compatibilidades: { r1: [{ recursoId: "r2", prioridade: 1 }] },
    });

    expect(verificarCapacidadeCadastralSuficiente(base)).toBeNull();
  });

  it("bloqueia quando o candidato tem capacidade positiva mas produtividade zero (capacidade efetiva também zero)", () => {
    const base = baseFixa({ produtividadePorRecurso: { r1: 0 } });
    const resultado = verificarCapacidadeCadastralSuficiente(base);
    expect(resultado?.causa).toBe("capacidade_cadastral_zero");
  });
});

describe("avaliarPorDiasProdutivos", () => {
  it("reaproveita exatamente executarMotorAvaliacaoSequencial - mesmo resultado, não uma cópia", () => {
    const base = baseFixa();
    const avaliacao = avaliarPorDiasProdutivos(base, 3); // 3 dias × 8h = 24h = necessário exato

    const entradasEquivalentes = {
      operacoesOrdenadas: base.operacoesOrdenadas,
      capacidadeDisponivelInicial: { r1: 24 },
      compatibilidades: base.compatibilidades,
    };
    const resultadoDireto = executarMotorAvaliacaoSequencial(entradasEquivalentes);

    expect(avaliacao.resultadoPorOperacao).toEqual(resultadoDireto);
    expect(avaliacao.deficitTotal).toBe(0);
  });

  it("soma déficit de múltiplas operações compartilhando o mesmo recurso (pool acumulado preservado)", () => {
    const base = baseFixa({
      operacoesOrdenadas: [
        { bomOperacaoId: "op-1", recursoOriginalId: "r1", tempoEstimadoMinutos: 60, quantidade: 20 },
        { bomOperacaoId: "op-2", recursoOriginalId: "r1", tempoEstimadoMinutos: 60, quantidade: 20 },
      ],
    });
    // 2 dias produtivos × 8h = 16h disponíveis, 40h necessárias no total.
    const avaliacao = avaliarPorDiasProdutivos(base, 2);
    expect(avaliacao.deficitTotal).toBe(40 - 16);
  });

  it("distribui entre original e compatível quando o original sozinho não basta (Entrega 2 reaproveitada)", () => {
    const base = baseFixa({
      operacoesOrdenadas: [
        { bomOperacaoId: "op-1", recursoOriginalId: "original", tempoEstimadoMinutos: 60, quantidade: 40 },
      ],
      recursoIds: ["original", "compativel"],
      capacidadeDiariaPorRecurso: { original: 5, compativel: 3 },
      produtividadePorRecurso: { original: 1, compativel: 1 },
      comprometidoInicialPorRecurso: { original: 0, compativel: 0 },
      compatibilidades: { original: [{ recursoId: "compativel", prioridade: 1 }] },
    });

    // 5 dias produtivos: original 25h, compatível 15h = 40h = necessário exato.
    const avaliacao = avaliarPorDiasProdutivos(base, 5);
    expect(avaliacao.deficitTotal).toBe(0);
    const [item] = avaliacao.resultadoPorOperacao;
    expect(item.distribuicoes.map((d) => d.recursoId)).toEqual(["original", "compativel"]);
    expect(item.distribuicoes.map((d) => d.origem)).toEqual(["ORIGINAL", "COMPATIBILIDADE"]);
  });
});

describe("buscarMaiorIndiceViavel", () => {
  it("encontra o maior índice viável por busca binária - confirmado contra varredura linear força-bruta", () => {
    const casos: Array<{ base: BaseFixaMotor; n: number }> = [
      { base: baseFixa(), n: 10 }, // 24h necessárias, 8h/dia
      { base: baseFixa({ operacoesOrdenadas: [{ bomOperacaoId: "op-1", recursoOriginalId: "r1", tempoEstimadoMinutos: 60, quantidade: 57 }] }), n: 15 },
      { base: baseFixa({ capacidadeDiariaPorRecurso: { r1: 3 } }), n: 20 },
    ];

    for (const { base, n } of casos) {
      const avaliarPorIndice = (i: number) => avaliarPorDiasProdutivos(base, n - i);

      // Varredura linear força-bruta - referência independente da busca binária.
      let esperado: number | null = null;
      for (let i = 0; i < n; i++) {
        if (avaliarPorIndice(i).deficitTotal === 0) esperado = i;
      }

      expect(buscarMaiorIndiceViavel(n, avaliarPorIndice)).toBe(esperado);
    }
  });

  it("retorna null quando nenhum índice é viável (n=0 ou déficit persistente)", () => {
    expect(buscarMaiorIndiceViavel(0, () => ({ deficitTotal: 0, resultadoPorOperacao: [] }))).toBeNull();
    expect(buscarMaiorIndiceViavel(5, () => ({ deficitTotal: 1, resultadoPorOperacao: [] }))).toBeNull();
  });
});

describe("indiceEmP", () => {
  it("localiza a data por busca binária", () => {
    expect(indiceEmP(P10, P10[0])).toBe(0);
    expect(indiceEmP(P10, P10[7])).toBe(7);
    expect(indiceEmP(P10, P10[9])).toBe(9);
  });

  it("lança erro interno quando a data não está na sequência", () => {
    expect(() => indiceEmP(P10, "2099-01-01")).toThrow(/não encontrada/);
  });
});

describe("distanciaProdutivaComSinal", () => {
  it("retorna 0 e não chama contarDiasProdutivosEntre quando as datas são iguais", async () => {
    const contador = vi.fn();
    const resultado = await distanciaProdutivaComSinal("2026-01-05", "2026-01-05", contador);
    expect(resultado).toBe(0);
    expect(contador).not.toHaveBeenCalled();
  });

  it("material ANTES de D*: positivo, conta a partir do dia SEGUINTE ao material até D*", async () => {
    const contador = vi.fn(async () => 42);
    const resultado = await distanciaProdutivaComSinal("2026-01-05", "2026-01-10", contador);
    expect(resultado).toBe(42);
    expect(contador).toHaveBeenCalledWith("2026-01-06", "2026-01-10");
  });

  it("material DEPOIS de D*: negativo, conta a partir do dia SEGUINTE a D* até o material - cobre o intervalo INTEIRO (correção do bug anterior)", async () => {
    const contador = vi.fn(async () => 7);
    const resultado = await distanciaProdutivaComSinal("2026-01-10", "2026-01-05", contador);
    expect(resultado).toBe(-7);
    // Correção: conta a partir do dia seguinte a D* (não do dia seguinte
    // a algum outro marco intermediário) - cobre [D*, material] inteiro.
    expect(contador).toHaveBeenCalledWith("2026-01-06", "2026-01-10");
  });
});

describe("calcularEstimativaInicioNecessario", () => {
  // Cenário base: necessário 24h, 8h/dia, P = 10 dias (2026-01-01..10).
  // D* = P[7] (2026-01-08): 3 dias produtivos (P[7],P[8],P[9]) × 8h = 24h exatos;
  // P[8] só dá 2 dias = 16h, insuficiente.
  const prazoInterno = P10[9];

  it("viavel - material disponível antes de D*, com folga", async () => {
    const resultado = await calcularEstimativaInicioNecessario(
      baseFixa(),
      P10,
      prazoInterno,
      P10[5],
      contarDiasCivisInclusive,
      100,
    );

    expect(resultado.estado).toBe("viavel");
    if (resultado.estado === "viavel") {
      expect(resultado.dataEstimadaInicioNecessario).toBe(P10[7]);
      expect(resultado.folgaDiasProdutivos).toBe(2); // P[6],P[7]
      expect(resultado.metodoVersao).toBe(ESTIMATIVA_METODO_VERSAO);
    }
  });

  it("viavel_no_limite - material disponível exatamente em D*", async () => {
    const resultado = await calcularEstimativaInicioNecessario(
      baseFixa(),
      P10,
      prazoInterno,
      P10[7],
      contarDiasCivisInclusive,
      100,
    );

    expect(resultado.estado).toBe("viavel_no_limite");
    if (resultado.estado === "viavel_no_limite") {
      expect(resultado.folgaDiasProdutivos).toBe(0);
    }
  });

  it("janela_insuficiente (caso B - material dentro do horizonte, depois de D*)", async () => {
    const resultado = await calcularEstimativaInicioNecessario(
      baseFixa(),
      P10,
      prazoInterno,
      P10[9],
      contarDiasCivisInclusive,
      100,
    );

    expect(resultado.estado).toBe("janela_insuficiente");
    if (resultado.estado === "janela_insuficiente") {
      expect(resultado.dataEstimadaInicioNecessario).toBe(P10[7]);
      expect(resultado.dataDisponibilidadeProducao).toBe(P10[9]);
      expect(resultado.folgaDiasProdutivos).toBe(-2); // P[8],P[9]
      // Janela realmente permitida = [P[9], prazoInterno] = 1 dia produtivo = 8h < 24h necessárias.
      expect(resultado.avaliacaoNaJanelaRealmentePermitida.deficitTotal).toBe(16);
    }
  });

  it("janela_insuficiente (caso A - material depois do Prazo Interno, fora de P) - conta o intervalo inteiro entre D* e o material", async () => {
    const dataDisponibilidadeProducao = somarDiasCivis(prazoInterno, 3); // além do fim de P

    const resultado = await calcularEstimativaInicioNecessario(
      baseFixa(),
      P10,
      prazoInterno,
      dataDisponibilidadeProducao,
      contarDiasCivisInclusive,
      100,
    );

    expect(resultado.estado).toBe("janela_insuficiente");
    if (resultado.estado === "janela_insuficiente") {
      expect(resultado.dataEstimadaInicioNecessario).toBe(P10[7]);
      // D*=P[7]=2026-01-08; material=prazoInterno(2026-01-10)+3=2026-01-13.
      // Intervalo [dia seguinte a D*, material] = 09,10,11,12,13 = 5 dias.
      expect(resultado.folgaDiasProdutivos).toBe(-5);
      // Janela realmente permitida = 0 dias produtivos (material > prazoInterno) -> déficit = necessário inteiro.
      expect(resultado.avaliacaoNaJanelaRealmentePermitida.deficitTotal).toBe(24);
    }
  });

  it("viavel (caso C - material antes do piso técnico, fora de P) - folga calculada pelo intervalo inteiro, não presumida", async () => {
    const dataDisponibilidadeProducao = somarDiasCivis(P10[0], -3); // antes do início de P

    const resultado = await calcularEstimativaInicioNecessario(
      baseFixa(),
      P10,
      prazoInterno,
      dataDisponibilidadeProducao,
      contarDiasCivisInclusive,
      100,
    );

    expect(resultado.estado).toBe("viavel");
    if (resultado.estado === "viavel") {
      expect(resultado.dataEstimadaInicioNecessario).toBe(P10[7]);
      // material = P10[0]-3 = 2025-12-29; D* = P[7] = 2026-01-08.
      // Intervalo [dia seguinte ao material, D*] = 30,31,01,02,03,04,05,06,07,08 = 10 dias.
      expect(resultado.folgaDiasProdutivos).toBe(10);
    }
  });

  it("dados_insuficientes - bloqueia antes de qualquer busca, nenhuma chamada a contarDiasProdutivosEntre", async () => {
    const contador = vi.fn();
    const base = baseFixa({ capacidadeDiariaPorRecurso: { r1: 0 } });

    const resultado = await calcularEstimativaInicioNecessario(base, P10, prazoInterno, P10[5], contador, 100);

    expect(resultado.estado).toBe("dados_insuficientes");
    if (resultado.estado === "dados_insuficientes") {
      expect(resultado.causa).toBe("capacidade_cadastral_zero");
    }
    expect(contador).not.toHaveBeenCalled();
  });

  it("horizonte_tecnico_excedido - déficit persiste mesmo na maior janela dentro de P, material nunca é consultado", async () => {
    const contador = vi.fn();
    // necessário = 1000h, capacidade máxima em P = 10 dias × 8h = 80h.
    const base = baseFixa({
      operacoesOrdenadas: [
        { bomOperacaoId: "op-1", recursoOriginalId: "r1", tempoEstimadoMinutos: 60000, quantidade: 1 },
      ],
    });

    const resultado = await calcularEstimativaInicioNecessario(base, P10, prazoInterno, P10[5], contador, 100);

    expect(resultado.estado).toBe("horizonte_tecnico_excedido");
    if (resultado.estado === "horizonte_tecnico_excedido") {
      expect(resultado.diasCivisExaminados).toBe(100);
      expect(resultado.avaliacaoNoLimiteTecnico.deficitTotal).toBe(1000 - 80);
    }
    // Estado técnico - a busca nunca chegou a comparar com o material.
    expect(contador).not.toHaveBeenCalled();
  });
});
