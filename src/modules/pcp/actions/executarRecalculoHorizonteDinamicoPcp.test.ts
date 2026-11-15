import { describe, expect, it, vi } from "vitest";
import {
  executarRecalculoHorizonteDinamicoPcp,
  type DependenciasRecalculoHorizonteDinamicoPcp,
} from "./executarRecalculoHorizonteDinamicoPcp";
import type { ResultadoCalculoMotorSupervisionado, OperacaoCalculadaPcp } from "./orquestrarSolicitacaoCalculoPcp";
import type { EntradaMotorPcpSerializavel } from "../lib/motor/montarEntradaMotorPcp";
import type { IngredientesParaEstimativaHorizontePcp } from "../lib/motor/estimarHorizonteNecessarioPcp";

const INGREDIENTES_PADRAO: IngredientesParaEstimativaHorizontePcp = {
  ocorrencias: [
    {
      chave: { opId: "op-1" },
      projetoId: "projeto-1",
      necessarioHorasPadrao: 8,
      candidatoIdsPorPrioridade: ["recurso-a"],
      ehOrcamentoNovo: false,
      dataInicioJanela: "2027-01-01",
    },
  ],
  dependencias: [],
  candidatos: [{ recursoId: "recurso-a", capacidadeHorasDia: 8, produtividade: 1 }],
};

function gerarGrade(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `2027-01-${String(i + 1).padStart(2, "0")}`);
}

function entradaFalsa(diasProdutivos: string[]): EntradaMotorPcpSerializavel {
  return {
    ocorrencias: [],
    dependencias: [],
    candidatos: [],
    datasGradeCompartilhada: diasProdutivos,
    diasProdutivos,
    posicaoPorProjeto: {},
    excluidas: [],
    ofIdPorOpId: {},
  };
}

function resultadoMotorOk(operacoes: OperacaoCalculadaPcp[], diasProdutivos: string[]): ResultadoCalculoMotorSupervisionado {
  return { ok: true, versaoCapacidadeUtilizada: "1", operacoes, excluidas: [], entrada: entradaFalsa(diasProdutivos) };
}

function criarDepsFalsas(
  overrides: Partial<{
    ingredientes: typeof INGREDIENTES_PADRAO;
    erroIngredientes: Error;
    resolucoesGrade: Array<{ ok: true; datasGradeCompartilhada: string[] } | { ok: false; motivo: "orcamento_esgotado_na_sondagem_de_calendario"; diasProdutivosEncontrados: number; diasProdutivosNecessarios: number; ultimaJanelaCorridaTestada: number }>;
    resultadosMotor: ResultadoCalculoMotorSupervisionado[];
    margensRestantes: number[];
    limiteMinimoViavelMs: number;
  }> = {},
) {
  const resolucoesGrade = [...(overrides.resolucoesGrade ?? [])];
  const resultadosMotor = [...(overrides.resultadosMotor ?? [])];
  const margensRestantes = [...(overrides.margensRestantes ?? [])];

  const montarIngredientesEstimativa = vi.fn(async () => {
    if (overrides.erroIngredientes) throw overrides.erroIngredientes;
    return overrides.ingredientes ?? INGREDIENTES_PADRAO;
  });
  const resolverGradeProdutiva = vi.fn(async (_params: { dataInicio: string; diasProdutivosNecessarios: number; prazoFinalMs: number }) => {
    return resolucoesGrade.shift() ?? { ok: true as const, datasGradeCompartilhada: gerarGrade(10) };
  });
  const executarCalculoMotor = vi.fn(async (_grade: string[]) => {
    return resultadosMotor.shift() ?? resultadoMotorOk([], gerarGrade(10));
  });
  const margemRestanteMs = vi.fn(() => margensRestantes.shift() ?? 200_000);

  const deps: DependenciasRecalculoHorizonteDinamicoPcp = {
    dataInicio: "2027-01-01",
    agoraMs: () => 0,
    margemRestanteMs,
    limiteMinimoViavelMs: overrides.limiteMinimoViavelMs ?? 10_000,
    montarIngredientesEstimativa,
    resolverGradeProdutiva,
    executarCalculoMotor,
  };

  return { deps, montarIngredientesEstimativa, resolverGradeProdutiva, executarCalculoMotor, margemRestanteMs };
}

describe("executarRecalculoHorizonteDinamicoPcp", () => {
  it("A. sem sinal de horizonte insuficiente: aceita o 1º resultado, nunca tenta de novo", async () => {
    const grade = gerarGrade(10);
    const { deps, executarCalculoMotor, resolverGradeProdutiva } = criarDepsFalsas({
      resultadosMotor: [resultadoMotorOk([{ opId: "op-1", status: "concluida", dataInicioReal: "2027-01-01", dataFimReal: "2027-01-02", alocacoes: [], deficitResidualHorasPadrao: 0 }], grade)],
    });

    const resultado = await executarRecalculoHorizonteDinamicoPcp(deps);

    expect(resultado.ok).toBe(true);
    expect(executarCalculoMotor).toHaveBeenCalledTimes(1);
    expect(resolverGradeProdutiva).toHaveBeenCalledTimes(1);
  });

  it("B. precisa ampliar e resolve na 2ª tentativa: diasProdutivosNecessarios dobra, 2 execuções do Motor, aceita o resultado final", async () => {
    const grade1 = gerarGrade(5);
    const grade2 = gerarGrade(10);
    const { deps, executarCalculoMotor, resolverGradeProdutiva } = criarDepsFalsas({
      resultadosMotor: [
        resultadoMotorOk([{ opId: "op-1", status: "bloqueada_por_deficit", dataInicioReal: "2027-01-01", dataFimReal: grade1[grade1.length - 1], alocacoes: [], deficitResidualHorasPadrao: 2 }], grade1),
        resultadoMotorOk([{ opId: "op-1", status: "concluida", dataInicioReal: "2027-01-01", dataFimReal: "2027-01-02", alocacoes: [], deficitResidualHorasPadrao: 0 }], grade2),
      ],
    });

    const resultado = await executarRecalculoHorizonteDinamicoPcp(deps);

    expect(resultado.ok).toBe(true);
    expect(executarCalculoMotor).toHaveBeenCalledTimes(2);
    const diasPedidosSegundaTentativa = resolverGradeProdutiva.mock.calls[1]?.[0].diasProdutivosNecessarios;
    const diasPedidosPrimeiraTentativa = resolverGradeProdutiva.mock.calls[0]?.[0].diasProdutivosNecessarios;
    expect(diasPedidosSegundaTentativa).toBe(diasPedidosPrimeiraTentativa * 2);
  });

  it("C. déficit real que não melhora com a ampliação (capacidade insuficiente): reporta incerteza explícita, nunca presume déficit real nem horizonte insuficiente", async () => {
    const grade1 = gerarGrade(5);
    const grade2 = gerarGrade(10);
    const opIgual = { opId: "op-1", status: "bloqueada_por_deficit" as const, dataInicioReal: "2027-01-01", dataFimReal: null, alocacoes: [], deficitResidualHorasPadrao: 8 };
    const { deps, executarCalculoMotor } = criarDepsFalsas({
      resultadosMotor: [resultadoMotorOk([opIgual], grade1), resultadoMotorOk([{ ...opIgual }], grade2)],
    });

    const resultado = await executarRecalculoHorizonteDinamicoPcp(deps);

    expect(resultado).toEqual({
      ok: false,
      motivo: "horizonte_nao_confirmado_dentro_do_orcamento",
      detalhe: "ampliar a grade não alterou nenhum resultado - não foi possível confirmar se é déficit real ou horizonte insuficiente.",
    });
    expect(executarCalculoMotor).toHaveBeenCalledTimes(2); // tentou ampliar 1 vez, nunca insistiu indefinidamente.
  });

  it("D. orçamento já esgotado antes de qualquer tentativa: falha explícita, nunca chama resolverGradeProdutiva/executarCalculoMotor", async () => {
    const { deps, resolverGradeProdutiva, executarCalculoMotor } = criarDepsFalsas({
      margensRestantes: [5_000], // abaixo do limiteMinimoViavelMs padrão (10_000)
    });

    const resultado = await executarRecalculoHorizonteDinamicoPcp(deps);

    expect(resultado).toEqual({
      ok: false,
      motivo: "horizonte_nao_confirmado_dentro_do_orcamento",
      detalhe: "orçamento de tempo esgotado antes de confirmar a grade de cálculo.",
    });
    expect(resolverGradeProdutiva).not.toHaveBeenCalled();
    expect(executarCalculoMotor).not.toHaveBeenCalled();
  });

  it("E. sondagem de calendário esgota o orçamento: falha explícita com diagnóstico, nunca chama executarCalculoMotor", async () => {
    const { deps, executarCalculoMotor } = criarDepsFalsas({
      resolucoesGrade: [
        { ok: false, motivo: "orcamento_esgotado_na_sondagem_de_calendario", diasProdutivosEncontrados: 2, diasProdutivosNecessarios: 10, ultimaJanelaCorridaTestada: 20 },
      ],
    });

    const resultado = await executarRecalculoHorizonteDinamicoPcp(deps);

    expect(resultado).toMatchObject({ ok: false, motivo: "horizonte_nao_confirmado_dentro_do_orcamento" });
    if (resultado.ok || resultado.motivo !== "horizonte_nao_confirmado_dentro_do_orcamento") return;
    expect(resultado.detalhe).toContain("sondagem de calendário esgotou o orçamento");
    expect(executarCalculoMotor).not.toHaveBeenCalled();
  });

  it("F. falha CONFIRMADA do próprio Motor (ex.: interrompido pelo supervisor): repassada como está, nunca convertida em horizonte_nao_confirmado", async () => {
    const { deps } = criarDepsFalsas({
      resultadosMotor: [{ ok: false, motivo: "interrompido_por_limite_de_tempo" }],
    });

    const resultado = await executarRecalculoHorizonteDinamicoPcp(deps);

    expect(resultado).toEqual({ ok: false, motivo: "interrompido_por_limite_de_tempo" });
  });

  it("G. montarIngredientesEstimativa lança exceção: falha_interna, nunca propagada sem tratamento", async () => {
    const { deps } = criarDepsFalsas({ erroIngredientes: new Error("carregar_estado_motor_pcp: timeout") });

    const resultado = await executarRecalculoHorizonteDinamicoPcp(deps);

    expect(resultado).toEqual({ ok: false, motivo: "falha_interna", detalhe: "carregar_estado_motor_pcp: timeout" });
  });

  it("H. backlog sintético grande (2000 ocorrências) + cadeia de dependência longa (500 operações): o laço de orquestração conclui rapidamente", async () => {
    const ocorrencias = Array.from({ length: 2000 }, (_, i) => ({
      chave: { opId: `op-${i}` },
      projetoId: `projeto-${i % 50}`,
      necessarioHorasPadrao: 4,
      candidatoIdsPorPrioridade: [`recurso-${i % 20}`],
      ehOrcamentoNovo: false,
      dataInicioJanela: "2027-01-01",
    }));
    const dependencias = Array.from({ length: 499 }, (_, i) => ({
      predecessora: { opId: `op-${i}` },
      sucessora: { opId: `op-${i + 1}` },
      tipo: "sequencia_roteiro" as const,
    }));
    const candidatos = Array.from({ length: 20 }, (_, i) => ({ recursoId: `recurso-${i}`, capacidadeHorasDia: 8, produtividade: 1 }));

    const grade = gerarGrade(10);
    const { deps } = criarDepsFalsas({
      ingredientes: { ocorrencias, dependencias, candidatos },
      resultadosMotor: [resultadoMotorOk([], grade)],
    });

    const inicio = Date.now();
    const resultado = await executarRecalculoHorizonteDinamicoPcp(deps);
    const duracaoMs = Date.now() - inicio;

    expect(resultado.ok).toBe(true);
    // Medição de sanidade (deps falsas, instantâneas) - garante que o
    // laço de orquestração em si não tem complexidade patológica frente
    // ao tamanho do backlog; NUNCA mede o tempo real do Motor/Worker.
    expect(duracaoMs).toBeLessThan(500);
  });
});
