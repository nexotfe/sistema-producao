import { describe, expect, it } from "vitest";
import { construirImpactosProjetosDeslocados, type MetadadosProjetoDeslocado } from "./impactoProjetoDeslocado";
import { escalonarConjuntoComFilaDeProntos, type OcorrenciaEscalonavel, type ResultadoOcorrenciaEscalonada } from "./escalonadorConjunto";
import type { CandidatoComCapacidadeDiaria } from "./alocarOperacaoDiaAdia";
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";

function chave(bomOperacaoId: string, projetoItemId: string): ChaveOcorrencia {
  return { projetoItemId, produtoRaizId: "PR-1", caminhoBomItemIds: [], bomOperacaoId };
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

function ocorrencia(overrides: Partial<OcorrenciaEscalonavel> & { chave: ChaveOcorrencia; projetoId: string }): OcorrenciaEscalonavel {
  return {
    necessarioHorasPadrao: 1,
    candidatoIdsPorPrioridade: [],
    ehOrcamentoNovo: false,
    dataInicioJanela: "2026-11-09",
    ...overrides,
  };
}

/** Constrói um ResultadoOcorrenciaEscalonada sintético, para testar construirImpactosProjetosDeslocados isoladamente (sem depender de um cenário real do escalonador) quando o que importa é o CONTEÚDO do resultado, não como ele foi produzido. */
function resultadoOcorrencia(overrides: Partial<ResultadoOcorrenciaEscalonada> & { chave: ChaveOcorrencia }): ResultadoOcorrenciaEscalonada {
  return {
    status: "concluida",
    dataInicioReal: "2026-11-09",
    dataFimReal: "2026-11-09",
    alocacoes: [],
    deficitResidualHorasPadrao: 0,
    ...overrides,
  };
}

function rodar(ocorrencias: OcorrenciaEscalonavel[], prioridades: Record<string, number>, datas: string[], capacidadeR1: Record<string, number>) {
  return escalonarConjuntoComFilaDeProntos({
    ocorrencias,
    dependencias: [],
    registroCandidatos: new Map([["R1", criarCandidato("R1", 1, capacidadeR1)]]),
    datasGradeCompartilhada: datas,
    criterioPrioridadeDeNegocio: (oc) => prioridades[chaveOcorrenciaParaString(oc.chave)],
  });
}

describe("construirImpactosProjetosDeslocados — cenário básico (B×Y adaptado)", () => {
  const DATAS = ["2026-11-09", "2026-11-10", "2026-11-11"];
  const CAPACIDADE_R1 = { "2026-11-09": 8, "2026-11-10": 8, "2026-11-11": 8 };

  const b = ocorrencia({ chave: chave("OP-B", "PROJ-B"), projetoId: "PROJ-B", necessarioHorasPadrao: 12, candidatoIdsPorPrioridade: ["R1"] });
  const y = ocorrencia({ chave: chave("OP-Y", "ORCAMENTO"), projetoId: "ORCAMENTO", necessarioHorasPadrao: 8, candidatoIdsPorPrioridade: ["R1"], ehOrcamentoNovo: true });

  it("projeto deslocado aparece com origens, operação afetada e término atrasado", () => {
    // Base: só B está comprometido - roda sozinho.
    const resultadosBase = rodar([b], { [chaveOcorrenciaParaString(b.chave)]: 1 }, DATAS, CAPACIDADE_R1);
    // Cenário: Y (orçamento novo) inserido com prioridade MAIOR (1) que B (2).
    const resultadosCenario = rodar(
      [b, y],
      { [chaveOcorrenciaParaString(y.chave)]: 1, [chaveOcorrenciaParaString(b.chave)]: 2 },
      DATAS,
      CAPACIDADE_R1,
    );

    const metadados = new Map<string, MetadadosProjetoDeslocado>([
      ["PROJ-B", { numeroProjeto: "2026/0042", producaoIniciada: false }],
    ]);

    const impactos = construirImpactosProjetosDeslocados({
      ocorrencias: [b, y],
      projetoIdOrcamentoNovo: "ORCAMENTO",
      resultadosBase,
      resultadosCenario,
      metadadosPorProjetoId: metadados,
    });

    expect(impactos).toHaveLength(1);
    const [impacto] = impactos;
    expect(impacto.projetoId).toBe("PROJ-B");
    expect(impacto.numeroProjeto).toBe("2026/0042");
    expect(impacto.producaoIniciada).toBe(false);

    // B perdeu exatamente as 8h que tinha em 09/11 na base (lá ele usava o dia todo; no cenário, Y tomou o dia inteiro).
    expect(impacto.origens).toEqual([{ recursoId: "R1", data: "2026-11-09", horasRetiradas: 8 }]);

    // Mesma categoria de estado (concluida->concluida) mas data-fim piorou - ainda entra em operacoesAfetadas.
    expect(impacto.operacoesAfetadas).toEqual([
      { chave: b.chave, estadoAnterior: "concluida", estadoPosterior: "concluida" },
    ]);

    expect(impacto.terminoProgramadoAnterior).toBe("2026-11-10");
    expect(impacto.terminoProgramadoNovo).toBe("2026-11-11");
    expect(impacto.diasDeAtraso).toBe(1);
  });

  it("projeto sem NENHUMA sobreposição de recurso não aparece na lista de impactos", () => {
    const c = ocorrencia({ chave: chave("OP-C", "PROJ-C"), projetoId: "PROJ-C", necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R2"] });
    const r2Capacidade = { "2026-11-09": 8, "2026-11-10": 8, "2026-11-11": 8 };
    const resultadosBase = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [b, c],
      dependencias: [],
      registroCandidatos: new Map([["R1", criarCandidato("R1", 1, CAPACIDADE_R1)], ["R2", criarCandidato("R2", 1, r2Capacidade)]]),
      datasGradeCompartilhada: DATAS,
      criterioPrioridadeDeNegocio: () => 0,
    });
    const resultadosCenario = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [b, c, y],
      dependencias: [],
      registroCandidatos: new Map([["R1", criarCandidato("R1", 1, CAPACIDADE_R1)], ["R2", criarCandidato("R2", 1, r2Capacidade)]]),
      datasGradeCompartilhada: DATAS,
      criterioPrioridadeDeNegocio: (oc) => (chaveOcorrenciaParaString(oc.chave) === chaveOcorrenciaParaString(y.chave) ? 1 : 2),
    });

    const impactos = construirImpactosProjetosDeslocados({
      ocorrencias: [b, c, y],
      projetoIdOrcamentoNovo: "ORCAMENTO",
      resultadosBase,
      resultadosCenario,
      metadadosPorProjetoId: new Map([
        ["PROJ-B", { numeroProjeto: "B", producaoIniciada: false }],
        ["PROJ-C", { numeroProjeto: "C", producaoIniciada: false }],
      ]),
    });

    expect(impactos.map((i) => i.projetoId)).toEqual(["PROJ-B"]); // PROJ-C nunca usou R1 - não afetado, não aparece
  });

  it("rejeita projeto afetado sem entrada em metadadosPorProjetoId", () => {
    const resultadosBase = rodar([b], { [chaveOcorrenciaParaString(b.chave)]: 1 }, DATAS, CAPACIDADE_R1);
    const resultadosCenario = rodar(
      [b, y],
      { [chaveOcorrenciaParaString(y.chave)]: 1, [chaveOcorrenciaParaString(b.chave)]: 2 },
      DATAS,
      CAPACIDADE_R1,
    );
    expect(() =>
      construirImpactosProjetosDeslocados({
        ocorrencias: [b, y],
        projetoIdOrcamentoNovo: "ORCAMENTO",
        resultadosBase,
        resultadosCenario,
        metadadosPorProjetoId: new Map(), // PROJ-B ausente
      }),
    ).toThrow(RangeError);
  });

  it("resultadosBase e resultadosCenario NÃO precisam ter as mesmas chaves - base legitimamente exclui o orçamento novo (DEC-007 §9)", () => {
    // resultadosBase só tem B (projeto já comprometido); resultadosCenario tem B+Y (orçamento novo incluído) - isso é o ESPERADO, nunca um erro.
    const resultadosBase = rodar([b], { [chaveOcorrenciaParaString(b.chave)]: 1 }, DATAS, CAPACIDADE_R1);
    const resultadosCenario = rodar(
      [b, y],
      { [chaveOcorrenciaParaString(y.chave)]: 1, [chaveOcorrenciaParaString(b.chave)]: 2 },
      DATAS,
      CAPACIDADE_R1,
    );
    expect(() =>
      construirImpactosProjetosDeslocados({
        ocorrencias: [b, y],
        projetoIdOrcamentoNovo: "ORCAMENTO",
        resultadosBase,
        resultadosCenario,
        metadadosPorProjetoId: new Map([["PROJ-B", { numeroProjeto: "B", producaoIniciada: false }]]),
      }),
    ).not.toThrow();
  });

  it("rejeita resultadosBase faltando uma ocorrência de projeto JÁ COMPROMETIDO (não é o orçamento novo)", () => {
    const resultadosBase: ReadonlyMap<string, ResultadoOcorrenciaEscalonada> = new Map(); // B ausente - erro real
    const resultadosCenario = rodar(
      [b, y],
      { [chaveOcorrenciaParaString(y.chave)]: 1, [chaveOcorrenciaParaString(b.chave)]: 2 },
      DATAS,
      CAPACIDADE_R1,
    );
    expect(() =>
      construirImpactosProjetosDeslocados({
        ocorrencias: [b, y],
        projetoIdOrcamentoNovo: "ORCAMENTO",
        resultadosBase,
        resultadosCenario,
        metadadosPorProjetoId: new Map(),
      }),
    ).toThrow(RangeError);
  });

  it("rejeita resultadosCenario faltando uma ocorrência presente em ocorrencias", () => {
    const resultadosBase = rodar([b], { [chaveOcorrenciaParaString(b.chave)]: 1 }, DATAS, CAPACIDADE_R1);
    const resultadosCenario: ReadonlyMap<string, ResultadoOcorrenciaEscalonada> = new Map(); // vazio - falta tudo
    expect(() =>
      construirImpactosProjetosDeslocados({
        ocorrencias: [b],
        projetoIdOrcamentoNovo: "ORCAMENTO",
        resultadosBase,
        resultadosCenario,
        metadadosPorProjetoId: new Map(),
      }),
    ).toThrow(RangeError);
  });
});

describe("construirImpactosProjetosDeslocados — estado nunca melhora ao perder capacidade", () => {
  it("projeto que perde capacidade tem seu estado piorado (concluida -> bloqueada_por_deficit), nunca melhorado", () => {
    // Grade com só 2 dias (09,10) - sem folga de 11/11 desta vez, para forçar déficit real.
    const DATAS = ["2026-11-09", "2026-11-10"];
    const CAPACIDADE_R1 = { "2026-11-09": 8, "2026-11-10": 8 };
    const b = ocorrencia({ chave: chave("OP-B", "PROJ-B"), projetoId: "PROJ-B", necessarioHorasPadrao: 12, candidatoIdsPorPrioridade: ["R1"] });
    const y = ocorrencia({ chave: chave("OP-Y", "ORCAMENTO"), projetoId: "ORCAMENTO", necessarioHorasPadrao: 8, candidatoIdsPorPrioridade: ["R1"], ehOrcamentoNovo: true });

    // Base: B sozinho fecha exatamente com os 2 dias (8+4=12).
    const resultadosBase = rodar([b], { [chaveOcorrenciaParaString(b.chave)]: 1 }, DATAS, CAPACIDADE_R1);
    expect(resultadosBase.get(chaveOcorrenciaParaString(b.chave))!.status).toBe("concluida");

    // Cenário: Y entra com prioridade maior, consome 09/11 inteiro - B só tem 10/11 (8h) para 12h necessárias.
    const resultadosCenario = rodar(
      [b, y],
      { [chaveOcorrenciaParaString(y.chave)]: 1, [chaveOcorrenciaParaString(b.chave)]: 2 },
      DATAS,
      CAPACIDADE_R1,
    );
    expect(resultadosCenario.get(chaveOcorrenciaParaString(b.chave))!.status).toBe("bloqueada_por_deficit");

    const impactos = construirImpactosProjetosDeslocados({
      ocorrencias: [b, y],
      projetoIdOrcamentoNovo: "ORCAMENTO",
      resultadosBase,
      resultadosCenario,
      metadadosPorProjetoId: new Map([["PROJ-B", { numeroProjeto: "B", producaoIniciada: false }]]),
    });

    const [impacto] = impactos;
    expect(impacto.origens.length).toBeGreaterThan(0); // perdeu capacidade de verdade
    expect(impacto.operacoesAfetadas).toEqual([{ chave: b.chave, estadoAnterior: "concluida", estadoPosterior: "bloqueada_por_deficit" }]);
    // Nunca o inverso (bloqueada -> concluida) neste cenário - a perda de capacidade correlaciona com piora, nunca melhora.
  });
});

describe("construirImpactosProjetosDeslocados — validações defensivas adicionais", () => {
  it("rejeita resultadosCenario com chave extra que não existe em ocorrencias", () => {
    const b = ocorrencia({ chave: chave("OP-B", "PROJ-B"), projetoId: "PROJ-B", candidatoIdsPorPrioridade: ["R1"] });
    const chaveFantasma = chave("OP-FANTASMA", "PROJ-B");
    const resultadosBase = new Map([[chaveOcorrenciaParaString(b.chave), resultadoOcorrencia({ chave: b.chave })]]);
    const resultadosCenario = new Map([
      [chaveOcorrenciaParaString(b.chave), resultadoOcorrencia({ chave: b.chave })],
      [chaveOcorrenciaParaString(chaveFantasma), resultadoOcorrencia({ chave: chaveFantasma })], // não existe em "ocorrencias"
    ]);
    expect(() =>
      construirImpactosProjetosDeslocados({
        ocorrencias: [b],
        projetoIdOrcamentoNovo: "ORCAMENTO",
        resultadosBase,
        resultadosCenario,
        metadadosPorProjetoId: new Map(),
      }),
    ).toThrow(RangeError);
  });

  it("rejeita resultadosBase contendo uma chave que pertence ao PRÓPRIO orçamento novo - programação-base nunca pode incluí-lo", () => {
    const b = ocorrencia({ chave: chave("OP-B", "PROJ-B"), projetoId: "PROJ-B", candidatoIdsPorPrioridade: ["R1"] });
    const y = ocorrencia({ chave: chave("OP-Y", "ORCAMENTO"), projetoId: "ORCAMENTO", candidatoIdsPorPrioridade: ["R1"], ehOrcamentoNovo: true });
    const resultadosBase = new Map([
      [chaveOcorrenciaParaString(b.chave), resultadoOcorrencia({ chave: b.chave })],
      // ERRO: a chave do orçamento novo (Y) não deveria nunca estar na programação-base.
      [chaveOcorrenciaParaString(y.chave), resultadoOcorrencia({ chave: y.chave })],
    ]);
    const resultadosCenario = new Map([
      [chaveOcorrenciaParaString(b.chave), resultadoOcorrencia({ chave: b.chave })],
      [chaveOcorrenciaParaString(y.chave), resultadoOcorrencia({ chave: y.chave })],
    ]);
    expect(() =>
      construirImpactosProjetosDeslocados({
        ocorrencias: [b, y],
        projetoIdOrcamentoNovo: "ORCAMENTO",
        resultadosBase,
        resultadosCenario,
        metadadosPorProjetoId: new Map(),
      }),
    ).toThrow(RangeError);
  });
});

describe("construirImpactosProjetosDeslocados — operação afetada por início/alocação, mesmo com status e término iguais", () => {
  it("dataInicioReal diferente (status e dataFimReal iguais) ainda entra em operacoesAfetadas", () => {
    const b = ocorrencia({ chave: chave("OP-B", "PROJ-B"), projetoId: "PROJ-B", candidatoIdsPorPrioridade: ["R1"] });
    const resultadosBase = new Map([
      [chaveOcorrenciaParaString(b.chave), resultadoOcorrencia({ chave: b.chave, dataInicioReal: "2026-11-09", dataFimReal: "2026-11-10" })],
    ]);
    const resultadosCenario = new Map([
      // Mesmo status ("concluida") e mesma dataFimReal ("2026-11-10") - só o início mudou.
      [chaveOcorrenciaParaString(b.chave), resultadoOcorrencia({ chave: b.chave, dataInicioReal: "2026-11-08", dataFimReal: "2026-11-10" })],
    ]);

    const impactos = construirImpactosProjetosDeslocados({
      ocorrencias: [b],
      projetoIdOrcamentoNovo: "ORCAMENTO",
      resultadosBase,
      resultadosCenario,
      metadadosPorProjetoId: new Map([["PROJ-B", { numeroProjeto: "B", producaoIniciada: false }]]),
    });

    expect(impactos).toHaveLength(1);
    expect(impactos[0].operacoesAfetadas).toEqual([{ chave: b.chave, estadoAnterior: "concluida", estadoPosterior: "concluida" }]);
  });

  it("alocações com composição diferente (mesmo início, fim e status) ainda entra em operacoesAfetadas", () => {
    const b = ocorrencia({ chave: chave("OP-B", "PROJ-B"), projetoId: "PROJ-B", candidatoIdsPorPrioridade: ["R1"] });
    const resultadosBase = new Map([
      [
        chaveOcorrenciaParaString(b.chave),
        resultadoOcorrencia({
          chave: b.chave,
          dataInicioReal: "2026-11-09",
          dataFimReal: "2026-11-09",
          alocacoes: [{ recursoId: "R1", data: "2026-11-09", natureza: "normal", contratacaoId: null, horasMaquina: 8, horasPadrao: 8 }],
        }),
      ],
    ]);
    const resultadosCenario = new Map([
      [
        chaveOcorrenciaParaString(b.chave),
        resultadoOcorrencia({
          chave: b.chave,
          dataInicioReal: "2026-11-09",
          dataFimReal: "2026-11-09",
          // Mesmo total (8h), mesma data, mas metade veio de hora extra - composição diferente, mesmo início/fim/status.
          alocacoes: [
            { recursoId: "R1", data: "2026-11-09", natureza: "normal", contratacaoId: null, horasMaquina: 4, horasPadrao: 4 },
            { recursoId: "R1", data: "2026-11-09", natureza: "hora_extra", contratacaoId: "CT-1", horasMaquina: 4, horasPadrao: 4 },
          ],
        }),
      ],
    ]);

    const impactos = construirImpactosProjetosDeslocados({
      ocorrencias: [b],
      projetoIdOrcamentoNovo: "ORCAMENTO",
      resultadosBase,
      resultadosCenario,
      metadadosPorProjetoId: new Map([["PROJ-B", { numeroProjeto: "B", producaoIniciada: false }]]),
    });

    expect(impactos).toHaveLength(1);
    expect(impactos[0].operacoesAfetadas).toEqual([{ chave: b.chave, estadoAnterior: "concluida", estadoPosterior: "concluida" }]);
  });
});

describe("construirImpactosProjetosDeslocados — compensação interna entre operações do mesmo projeto (correção)", () => {
  it("operação X perde 4h e operação Y do MESMO projeto ganha 4h no MESMO recurso/data - origens não reporta retirada líquida (compensação interna)", () => {
    const x = ocorrencia({ chave: chave("OP-X", "PROJ-B"), projetoId: "PROJ-B", candidatoIdsPorPrioridade: ["R1"] });
    const yOp = ocorrencia({ chave: chave("OP-Y", "PROJ-B"), projetoId: "PROJ-B", candidatoIdsPorPrioridade: ["R1"] });

    const resultadosBase = new Map([
      [
        chaveOcorrenciaParaString(x.chave),
        resultadoOcorrencia({ chave: x.chave, alocacoes: [{ recursoId: "R1", data: "2026-11-09", natureza: "normal", contratacaoId: null, horasMaquina: 8, horasPadrao: 8 }] }),
      ],
      [
        chaveOcorrenciaParaString(yOp.chave),
        resultadoOcorrencia({ chave: yOp.chave, alocacoes: [{ recursoId: "R1", data: "2026-11-09", natureza: "normal", contratacaoId: null, horasMaquina: 4, horasPadrao: 4 }] }),
      ],
    ]);
    const resultadosCenario = new Map([
      // X perdeu 4h (8->4) em R1/09-11; Y ganhou exatamente essas 4h (4->8) no MESMO recurso/data - saldo líquido do projeto = zero.
      [
        chaveOcorrenciaParaString(x.chave),
        resultadoOcorrencia({ chave: x.chave, alocacoes: [{ recursoId: "R1", data: "2026-11-09", natureza: "normal", contratacaoId: null, horasMaquina: 4, horasPadrao: 4 }] }),
      ],
      [
        chaveOcorrenciaParaString(yOp.chave),
        resultadoOcorrencia({ chave: yOp.chave, alocacoes: [{ recursoId: "R1", data: "2026-11-09", natureza: "normal", contratacaoId: null, horasMaquina: 8, horasPadrao: 8 }] }),
      ],
    ]);

    const impactos = construirImpactosProjetosDeslocados({
      ocorrencias: [x, yOp],
      projetoIdOrcamentoNovo: "ORCAMENTO",
      resultadosBase,
      resultadosCenario,
      metadadosPorProjetoId: new Map([["PROJ-B", { numeroProjeto: "B", producaoIniciada: false }]]),
    });

    // Ainda existe IMPACTO (as alocações internas mudaram - X e Y entram em operacoesAfetadas),
    // mas "origens" (perda LÍQUIDA de capacidade do projeto) precisa estar vazia - a
    // compensação interna anula a perda antes de virar OrigemHorasRetiradas.
    expect(impactos).toHaveLength(1);
    expect(impactos[0].origens).toEqual([]);
    expect(impactos[0].operacoesAfetadas.map((o) => chaveOcorrenciaParaString(o.chave)).sort()).toEqual(
      [chaveOcorrenciaParaString(x.chave), chaveOcorrenciaParaString(yOp.chave)].sort(),
    );
  });

  it("perda parcialmente compensada: só o saldo LÍQUIDO aparece em origens", () => {
    const x = ocorrencia({ chave: chave("OP-X", "PROJ-B"), projetoId: "PROJ-B", candidatoIdsPorPrioridade: ["R1"] });
    const yOp = ocorrencia({ chave: chave("OP-Y", "PROJ-B"), projetoId: "PROJ-B", candidatoIdsPorPrioridade: ["R1"] });

    const resultadosBase = new Map([
      [chaveOcorrenciaParaString(x.chave), resultadoOcorrencia({ chave: x.chave, alocacoes: [{ recursoId: "R1", data: "2026-11-09", natureza: "normal", contratacaoId: null, horasMaquina: 8, horasPadrao: 8 }] })],
      [chaveOcorrenciaParaString(yOp.chave), resultadoOcorrencia({ chave: yOp.chave, alocacoes: [{ recursoId: "R1", data: "2026-11-09", natureza: "normal", contratacaoId: null, horasMaquina: 2, horasPadrao: 2 }] })],
    ]);
    const resultadosCenario = new Map([
      // X perde 8->3 (5h a menos); Y ganha 2->4 (2h a mais) - saldo líquido do projeto: -3h.
      [chaveOcorrenciaParaString(x.chave), resultadoOcorrencia({ chave: x.chave, alocacoes: [{ recursoId: "R1", data: "2026-11-09", natureza: "normal", contratacaoId: null, horasMaquina: 3, horasPadrao: 3 }] })],
      [chaveOcorrenciaParaString(yOp.chave), resultadoOcorrencia({ chave: yOp.chave, alocacoes: [{ recursoId: "R1", data: "2026-11-09", natureza: "normal", contratacaoId: null, horasMaquina: 4, horasPadrao: 4 }] })],
    ]);

    const impactos = construirImpactosProjetosDeslocados({
      ocorrencias: [x, yOp],
      projetoIdOrcamentoNovo: "ORCAMENTO",
      resultadosBase,
      resultadosCenario,
      metadadosPorProjetoId: new Map([["PROJ-B", { numeroProjeto: "B", producaoIniciada: false }]]),
    });

    expect(impactos[0].origens).toEqual([{ recursoId: "R1", data: "2026-11-09", horasRetiradas: 3 }]);
  });
});
