// Etapa 2O.8B-I6-A: prova de equivalência da forma serializável -
// reconstruirEntradaMotorPcpDeSerializavel precisa produzir um
// resultado IDÊNTICO ao escalonamento direto com os fechamentos
// originais. Nunca depende de banco (ingredientes construídos à mão,
// como os reais montarEntradaMotorPcpSerializavel devolveria) - isola
// exatamente o risco real: a travessia de workerData, nunca a busca de
// dados (já coberta em outros testes do assembler).
import { describe, expect, it } from "vitest";
import {
  construirCandidatoPcp,
  reconstruirEntradaMotorPcpDeSerializavel,
  escalonarConjuntoGenerico,
  chaveOcorrenciaPcpParaString,
  type EntradaMotorPcp,
  type EntradaMotorPcpSerializavel,
} from "./montarEntradaMotorPcp";

const DATAS = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
const DIAS_PRODUTIVOS = new Set(DATAS);

function construirSerializavelRepresentativo(): EntradaMotorPcpSerializavel {
  return {
    ocorrencias: [
      { chave: { opId: "op-1" }, projetoId: "proj-1", necessarioHorasPadrao: 3, candidatoIdsPorPrioridade: ["r1"], ehOrcamentoNovo: false, dataInicioJanela: DATAS[0] },
      { chave: { opId: "op-2" }, projetoId: "proj-1", necessarioHorasPadrao: 5, candidatoIdsPorPrioridade: ["r1", "r2"], ehOrcamentoNovo: false, dataInicioJanela: DATAS[0] },
      { chave: { opId: "op-3" }, projetoId: "proj-2", necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["r2"], ehOrcamentoNovo: false, dataInicioJanela: DATAS[0] },
      { chave: { opId: "op-4" }, projetoId: "proj-2", necessarioHorasPadrao: 10, candidatoIdsPorPrioridade: ["r1", "r2"], ehOrcamentoNovo: false, dataInicioJanela: DATAS[0] },
    ],
    dependencias: [{ predecessora: { opId: "op-1" }, sucessora: { opId: "op-2" }, tipo: "sequencia_roteiro" }],
    candidatos: [
      { recursoId: "r1", capacidadeHorasDia: 8, produtividade: 1 },
      { recursoId: "r2", capacidadeHorasDia: 6, produtividade: 0.9 },
    ],
    datasGradeCompartilhada: DATAS,
    diasProdutivos: DATAS,
    posicaoPorProjeto: { "proj-1": 1, "proj-2": 2 },
    excluidas: [],
    ofIdPorOpId: { "op-1": "of-1", "op-2": "of-1", "op-3": "of-2", "op-4": "of-2" },
  };
}

/** Monta a entrada ORIGINAL (com fechamentos de verdade) a partir dos MESMOS dados planos - nunca a mesma instância de registroCandidatos da reconstrução, para o teste ser honesto. */
function construirEntradaOriginalEquivalente(serializavel: EntradaMotorPcpSerializavel): EntradaMotorPcp {
  const registroCandidatos = new Map(
    serializavel.candidatos.map((c) => [
      c.recursoId,
      construirCandidatoPcp({
        recursoId: c.recursoId,
        capacidadeHorasDia: c.capacidadeHorasDia,
        produtividade: c.produtividade,
        datasGradeCompartilhada: serializavel.datasGradeCompartilhada,
        diasProdutivos: DIAS_PRODUTIVOS,
      }),
    ]),
  );
  const posicaoPorProjeto = new Map(Object.entries(serializavel.posicaoPorProjeto));
  return {
    ocorrencias: serializavel.ocorrencias,
    dependencias: serializavel.dependencias,
    registroCandidatos,
    criterioPrioridadeDeNegocio: (oc) => posicaoPorProjeto.get(oc.projetoId) ?? Number.POSITIVE_INFINITY,
    excluidas: serializavel.excluidas,
  };
}

describe("I6-A - equivalência da forma serializável de EntradaMotorPcp", () => {
  it("reconstrução via reconstruirEntradaMotorPcpDeSerializavel produz resultado IDÊNTICO ao escalonamento com os fechamentos originais", () => {
    const serializavel = construirSerializavelRepresentativo();
    const entradaOriginal = construirEntradaOriginalEquivalente(serializavel);
    const entradaReconstruida = reconstruirEntradaMotorPcpDeSerializavel(serializavel);

    const resultadoOriginal = escalonarConjuntoGenerico({
      ocorrencias: entradaOriginal.ocorrencias,
      dependencias: entradaOriginal.dependencias,
      registroCandidatos: entradaOriginal.registroCandidatos,
      datasGradeCompartilhada: serializavel.datasGradeCompartilhada,
      criterioPrioridadeDeNegocio: entradaOriginal.criterioPrioridadeDeNegocio,
      serializarChave: chaveOcorrenciaPcpParaString,
    });

    const resultadoReconstruido = escalonarConjuntoGenerico({
      ocorrencias: entradaReconstruida.ocorrencias,
      dependencias: entradaReconstruida.dependencias,
      registroCandidatos: entradaReconstruida.registroCandidatos,
      datasGradeCompartilhada: serializavel.datasGradeCompartilhada,
      criterioPrioridadeDeNegocio: entradaReconstruida.criterioPrioridadeDeNegocio,
      serializarChave: chaveOcorrenciaPcpParaString,
    });

    expect(resultadoReconstruido.size).toBe(resultadoOriginal.size);
    for (const [chave, valorOriginal] of resultadoOriginal) {
      expect(resultadoReconstruido.get(chave)).toEqual(valorOriginal);
    }
  });

  it("repetir a reconstrução a partir do MESMO objeto serializável duas vezes produz dois resultados igualmente corretos - sem vazamento de estado mutável entre reconstruções (hipótese sobre a divergência observada no log da P3)", () => {
    const serializavel = construirSerializavelRepresentativo();

    const entradaReconstruida1 = reconstruirEntradaMotorPcpDeSerializavel(serializavel);
    const resultado1 = escalonarConjuntoGenerico({
      ocorrencias: entradaReconstruida1.ocorrencias,
      dependencias: entradaReconstruida1.dependencias,
      registroCandidatos: entradaReconstruida1.registroCandidatos,
      datasGradeCompartilhada: serializavel.datasGradeCompartilhada,
      criterioPrioridadeDeNegocio: entradaReconstruida1.criterioPrioridadeDeNegocio,
      serializarChave: chaveOcorrenciaPcpParaString,
    });

    // MESMO objeto serializavel (nunca clonado) - se a reconstrução
    // vazasse estado mutável de volta para os ingredientes planos, a
    // segunda reconstrução a partir dele divergiria da primeira.
    const entradaReconstruida2 = reconstruirEntradaMotorPcpDeSerializavel(serializavel);
    const resultado2 = escalonarConjuntoGenerico({
      ocorrencias: entradaReconstruida2.ocorrencias,
      dependencias: entradaReconstruida2.dependencias,
      registroCandidatos: entradaReconstruida2.registroCandidatos,
      datasGradeCompartilhada: serializavel.datasGradeCompartilhada,
      criterioPrioridadeDeNegocio: entradaReconstruida2.criterioPrioridadeDeNegocio,
      serializarChave: chaveOcorrenciaPcpParaString,
    });

    expect(resultado2.size).toBe(resultado1.size);
    for (const [chave, valor1] of resultado1) {
      expect(resultado2.get(chave)).toEqual(valor1);
    }
  });
});
