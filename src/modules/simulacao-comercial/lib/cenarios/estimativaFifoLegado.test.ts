import { describe, expect, it } from "vitest";
import { estimarDistribuicaoFifoLegada, type ComprometidoAgregadoLegado } from "./estimativaFifoLegado";
import type { CandidatoComCapacidadeDiaria } from "./alocarOperacaoDiaAdia";
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";

function chave(bomOperacaoId: string): ChaveOcorrencia {
  return { projetoItemId: "PI-1", produtoRaizId: "PR-1", caminhoBomItemIds: [], bomOperacaoId };
}

function criarCandidato(id: string, produtividade: number, capacidadePorData: Record<string, number>): CandidatoComCapacidadeDiaria {
  const restante = { ...capacidadePorData };
  return {
    id,
    produtividade,
    faixasDoDia: (data) =>
      data in restante ? [{ natureza: "normal", horasDisponiveis: restante[data], contratacaoId: null, elegibilidade: null }] : [],
    consumir: (data, _natureza, horasMaquina) => {
      restante[data] = (restante[data] ?? 0) - horasMaquina;
    },
  };
}

function comprometido(overrides: Partial<ComprometidoAgregadoLegado> & { chave: ChaveOcorrencia }): ComprometidoAgregadoLegado {
  return { recursoId: "R1", necessarioHorasPadrao: 4, projetoId: "PROJ-LEGADO", ordemFifo: 0, ...overrides };
}

describe("estimarDistribuicaoFifoLegada", () => {
  it("comprometido cabe na capacidade real atual - distribuição cronológica, deficit zero, status completa (individual e global)", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8, "2026-11-10": 8 });
    const c = comprometido({ chave: chave("OP-1"), necessarioHorasPadrao: 12 });
    const { resultados, statusGlobal } = estimarDistribuicaoFifoLegada({
      comprometidos: [c],
      registroCandidatos: new Map([["R1", r1]]),
      datasGradeCompartilhada: ["2026-11-09", "2026-11-10"],
    });
    const [resultado] = resultados;
    expect(resultado.deficitResidualHorasPadrao).toBe(0);
    expect(resultado.status).toBe("completa");
    expect(statusGlobal).toBe("completa");
    expect(resultado.alocacoesEstimadas.map((a) => [a.data, a.horasMaquina])).toEqual([
      ["2026-11-09", 8],
      ["2026-11-10", 4],
    ]);
  });

  it("capacidade real insuficiente - déficit relatado explicitamente, status do item parcial, E statusGlobal também parcial", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 4 });
    const c = comprometido({ chave: chave("OP-1"), necessarioHorasPadrao: 20 });
    const { resultados, statusGlobal } = estimarDistribuicaoFifoLegada({
      comprometidos: [c],
      registroCandidatos: new Map([["R1", r1]]),
      datasGradeCompartilhada: ["2026-11-09"],
    });
    expect(resultados[0].deficitResidualHorasPadrao).toBe(16);
    expect(resultados[0].status).toBe("parcial");
    expect(statusGlobal).toBe("parcial");
  });

  it("statusGlobal é 'parcial' se QUALQUER item do lote for parcial, mesmo com outros itens completos - bloqueio precisa ser visível no nível do lote inteiro", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const completo = comprometido({ chave: chave("OP-COMPLETO"), necessarioHorasPadrao: 4, ordemFifo: 1 });
    const parcial = comprometido({ chave: chave("OP-PARCIAL"), necessarioHorasPadrao: 100, ordemFifo: 2 }); // nunca cabe
    const { resultados, statusGlobal } = estimarDistribuicaoFifoLegada({
      comprometidos: [completo, parcial],
      registroCandidatos: new Map([["R1", r1]]),
      datasGradeCompartilhada: ["2026-11-09"],
    });
    const resultadoCompleto = resultados.find((r) => chaveOcorrenciaParaString(r.chave) === chaveOcorrenciaParaString(completo.chave))!;
    expect(resultadoCompleto.status).toBe("completa"); // esse item específico fechou
    expect(statusGlobal).toBe("parcial"); // mas o LOTE inteiro precisa ficar marcado como bloqueado
  });

  it("toda saída - completa OU parcial - sempre carrega fonte: 'estimativa_fifo_legado', nunca omitida (DEC-007 §9: premissa de proveniência congelada)", () => {
    const r1Completo = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const completo = comprometido({ chave: chave("OP-1"), necessarioHorasPadrao: 4 });
    const resultadoCompleto = estimarDistribuicaoFifoLegada({
      comprometidos: [completo],
      registroCandidatos: new Map([["R1", r1Completo]]),
      datasGradeCompartilhada: ["2026-11-09"],
    });
    expect(resultadoCompleto.fonte).toBe("estimativa_fifo_legado");
    expect(resultadoCompleto.statusGlobal).toBe("completa");

    const r1Parcial = criarCandidato("R1", 1, { "2026-11-09": 2 });
    const parcial = comprometido({ chave: chave("OP-2"), necessarioHorasPadrao: 100 });
    const resultadoParcial = estimarDistribuicaoFifoLegada({
      comprometidos: [parcial],
      registroCandidatos: new Map([["R1", r1Parcial]]),
      datasGradeCompartilhada: ["2026-11-09"],
    });
    // fonte precisa estar presente mesmo quando statusGlobal é "parcial" - a confirmação de
    // proveniência (fonte) e a suficiência de capacidade (statusGlobal) são checagens
    // independentes; uma nunca "some" por causa da outra.
    expect(resultadoParcial.fonte).toBe("estimativa_fifo_legado");
    expect(resultadoParcial.statusGlobal).toBe("parcial");
  });

  it("ordem de processamento é EXPLÍCITA (ordemFifo) - a ordem incidental do array NUNCA decide quem processa primeiro", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const primeiro = comprometido({ chave: chave("OP-1"), necessarioHorasPadrao: 5, ordemFifo: 1 });
    const segundo = comprometido({ chave: chave("OP-2"), necessarioHorasPadrao: 5, ordemFifo: 2 });

    // Array na ordem INVERSA de ordemFifo - se a ordem do array decidisse, "segundo" ganharia capacidade primeiro.
    const { resultados } = estimarDistribuicaoFifoLegada({
      comprometidos: [segundo, primeiro],
      registroCandidatos: new Map([["R1", r1]]),
      datasGradeCompartilhada: ["2026-11-09"],
    });

    const resultadoPrimeiro = resultados.find((r) => chaveOcorrenciaParaString(r.chave) === chaveOcorrenciaParaString(primeiro.chave))!;
    const resultadoSegundo = resultados.find((r) => chaveOcorrenciaParaString(r.chave) === chaveOcorrenciaParaString(segundo.chave))!;

    // "primeiro" (ordemFifo=1) processa antes, mesmo vindo depois no array - pega toda a capacidade que precisa.
    expect(resultadoPrimeiro.deficitResidualHorasPadrao).toBe(0);
    expect(resultadoSegundo.deficitResidualHorasPadrao).toBe(2); // só sobrou 3h das 5h que precisava
  });

  it("empate em ordemFifo é resolvido pela chave completa - desempate estável, não pela ordem do array", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const a = comprometido({ chave: chave("A"), necessarioHorasPadrao: 5, ordemFifo: 1 });
    const z = comprometido({ chave: chave("Z"), necessarioHorasPadrao: 5, ordemFifo: 1 }); // mesmo ordemFifo

    const { resultados: resultadosOrdemZA } = estimarDistribuicaoFifoLegada({
      comprometidos: [z, a],
      registroCandidatos: new Map([["R1", r1]]),
      datasGradeCompartilhada: ["2026-11-09"],
    });
    const r1b = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const { resultados: resultadosOrdemAZ } = estimarDistribuicaoFifoLegada({
      comprometidos: [a, z],
      registroCandidatos: new Map([["R1", r1b]]),
      datasGradeCompartilhada: ["2026-11-09"],
    });

    // "A" (chave menor) sempre processa primeiro, independente da ordem de entrada.
    const deficitADeZA = resultadosOrdemZA.find((r) => chaveOcorrenciaParaString(r.chave) === chaveOcorrenciaParaString(a.chave))!.deficitResidualHorasPadrao;
    const deficitADeAZ = resultadosOrdemAZ.find((r) => chaveOcorrenciaParaString(r.chave) === chaveOcorrenciaParaString(a.chave))!.deficitResidualHorasPadrao;
    expect(deficitADeZA).toBe(0);
    expect(deficitADeAZ).toBe(0);
  });

  it("rejeita chave duplicada", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const c1 = comprometido({ chave: chave("OP-1") });
    const c2 = comprometido({ chave: chave("OP-1") });
    expect(() =>
      estimarDistribuicaoFifoLegada({ comprometidos: [c1, c2], registroCandidatos: new Map([["R1", r1]]), datasGradeCompartilhada: ["2026-11-09"] }),
    ).toThrow(RangeError);
  });

  it("rejeita necessarioHorasPadrao <= 0", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const c = comprometido({ chave: chave("OP-1"), necessarioHorasPadrao: 0 });
    expect(() =>
      estimarDistribuicaoFifoLegada({ comprometidos: [c], registroCandidatos: new Map([["R1", r1]]), datasGradeCompartilhada: ["2026-11-09"] }),
    ).toThrow(RangeError);
  });

  it("rejeita recursoId sem correspondência em registroCandidatos", () => {
    const c = comprometido({ chave: chave("OP-1"), recursoId: "R-INEXISTENTE" });
    expect(() =>
      estimarDistribuicaoFifoLegada({ comprometidos: [c], registroCandidatos: new Map(), datasGradeCompartilhada: ["2026-11-09"] }),
    ).toThrow(RangeError);
  });

  it("rejeita ordemFifo não finita", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const c = comprometido({ chave: chave("OP-1"), ordemFifo: NaN });
    expect(() =>
      estimarDistribuicaoFifoLegada({ comprometidos: [c], registroCandidatos: new Map([["R1", r1]]), datasGradeCompartilhada: ["2026-11-09"] }),
    ).toThrow(RangeError);
  });
});
