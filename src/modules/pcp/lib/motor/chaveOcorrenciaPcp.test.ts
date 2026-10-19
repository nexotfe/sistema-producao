import { describe, expect, it } from "vitest";
import { escalonarConjuntoGenerico, type OcorrenciaEscalonavel } from "@/modules/simulacao-comercial/lib/cenarios/escalonadorConjunto";
import type { CandidatoComCapacidadeDiaria } from "@/modules/simulacao-comercial/lib/cenarios/alocarOperacaoDiaAdia";
import { chaveOcorrenciaPcpParaString, type ChaveOcorrenciaPcp } from "./chaveOcorrenciaPcp";

/** Candidato só com faixa "normal", capacidade fixa por data - mesmo padrão dos testes do Comercial. */
function criarCandidato(id: string, capacidadePorData: Record<string, number>): CandidatoComCapacidadeDiaria {
  const restante = { ...capacidadePorData };
  return {
    id,
    produtividade: 1,
    faixasDoDia: (data) =>
      data in restante ? [{ natureza: "normal", horasDisponiveis: restante[data], contratacaoId: null, elegibilidade: null }] : [],
    consumir: (data, _natureza, horasMaquina) => {
      restante[data] = (restante[data] ?? 0) - horasMaquina;
    },
  };
}

function ocorrenciaPcp(opId: string): OcorrenciaEscalonavel<ChaveOcorrenciaPcp> {
  return {
    chave: { opId },
    projetoId: "projeto-pcp",
    necessarioHorasPadrao: 1,
    candidatoIdsPorPrioridade: ["R1"],
    ehOrcamentoNovo: false,
    dataInicioJanela: "2026-11-09",
  };
}

describe("ChaveOcorrenciaPcp — identidade por op_id no Motor B genérico (PCP-P8C/DEC-P8-03)", () => {
  it("aceita duas ocorrências que colidiriam por ChaveOcorrencia (mesma origem de roteiro), porque op_id é distinto", () => {
    // Cenário real do P8A: duas filhas de um desdobramento copiam o
    // mesmo bom_operacao_id da mãe - ChaveOcorrencia colidiria aqui.
    // ChaveOcorrenciaPcp nunca olha para bom_operacao_id, só para op_id.
    const filha1 = ocorrenciaPcp("op-filha-1111");
    const filha2 = ocorrenciaPcp("op-filha-2222");
    const r1 = criarCandidato("R1", { "2026-11-09": 1, "2026-11-10": 1 });

    expect(() =>
      escalonarConjuntoGenerico({
        ocorrencias: [filha1, filha2],
        dependencias: [],
        registroCandidatos: new Map([["R1", r1]]),
        datasGradeCompartilhada: ["2026-11-09", "2026-11-10"],
        criterioPrioridadeDeNegocio: () => 0,
        serializarChave: chaveOcorrenciaPcpParaString,
      }),
    ).not.toThrow();
  });

  it("serializa cada op_id de forma única", () => {
    expect(chaveOcorrenciaPcpParaString({ opId: "op-filha-1111" })).toBe("op-filha-1111");
    expect(chaveOcorrenciaPcpParaString({ opId: "op-filha-1111" })).not.toBe(chaveOcorrenciaPcpParaString({ opId: "op-filha-2222" }));
  });

  it("desempate determinístico: mesma prioridade e mesma data mínima - quem vence é sempre o mesmo, independente da ordem de entrada no array", () => {
    const filhaA = ocorrenciaPcp("op-aaaa-1111"); // lexicograficamente menor
    const filhaB = ocorrenciaPcp("op-bbbb-2222");

    // Capacidade para só 1h/dia em R1 - força a segunda ocorrência
    // processada a esperar o dia seguinte, revelando a ORDEM de despacho
    // via dataInicioReal.
    const executar = (ocorrencias: OcorrenciaEscalonavel<ChaveOcorrenciaPcp>[]) =>
      escalonarConjuntoGenerico({
        ocorrencias,
        dependencias: [],
        registroCandidatos: new Map([["R1", criarCandidato("R1", { "2026-11-09": 1, "2026-11-10": 1 })]]),
        datasGradeCompartilhada: ["2026-11-09", "2026-11-10"],
        criterioPrioridadeDeNegocio: () => 0, // empate de prioridade de propósito
        serializarChave: chaveOcorrenciaPcpParaString,
      });

    const resultadoOrdemNormal = executar([filhaA, filhaB]);
    const resultadoOrdemInvertida = executar([filhaB, filhaA]);

    // Em ambas as execuções, a MESMA ocorrência (a de menor chave-string)
    // precisa ter sido despachada primeiro (dataInicioReal mais cedo) -
    // determinístico pelo conteúdo da chave, nunca pela ordem de entrada.
    expect(resultadoOrdemNormal.get("op-aaaa-1111")!.dataInicioReal).toBe("2026-11-09");
    expect(resultadoOrdemNormal.get("op-bbbb-2222")!.dataInicioReal).toBe("2026-11-10");

    expect(resultadoOrdemInvertida.get("op-aaaa-1111")!.dataInicioReal).toBe("2026-11-09");
    expect(resultadoOrdemInvertida.get("op-bbbb-2222")!.dataInicioReal).toBe("2026-11-10");
  });
});
