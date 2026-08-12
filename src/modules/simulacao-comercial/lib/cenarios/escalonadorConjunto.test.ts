import { describe, expect, it } from "vitest";
import {
  escalonarConjuntoComFilaDeProntos,
  type OcorrenciaEscalonavel,
  type ResultadoOcorrenciaEscalonada,
} from "./escalonadorConjunto";
import type { DependenciaOcorrencia } from "./grafoPrecedencia";
import type { CandidatoComCapacidadeDiaria, FaixaCapacidadeDia } from "./alocarOperacaoDiaAdia";
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";

function chave(bomOperacaoId: string, overrides: Partial<ChaveOcorrencia> = {}): ChaveOcorrencia {
  return { projetoItemId: "PI-1", produtoRaizId: "PR-1", caminhoBomItemIds: [], bomOperacaoId, ...overrides };
}

/** Candidato só com faixa "normal" - capacidade diária fixa, sem hora extra (suficiente para os cenários que não testam extra). */
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

/** Candidato com controle total das faixas por data (normal/extra) - para os testes de capacidade extra em fim de semana/feriado. */
function criarCandidatoComFaixas(id: string, produtividade: number, faixasPorData: Record<string, FaixaCapacidadeDia[]>): CandidatoComCapacidadeDiaria {
  const estado: Record<string, FaixaCapacidadeDia[]> = Object.fromEntries(
    Object.entries(faixasPorData).map(([data, faixas]) => [data, faixas.map((f) => ({ ...f }))]),
  );
  return {
    id,
    produtividade,
    faixasDoDia: (data) => estado[data] ?? [],
    consumir: (data, natureza, horasMaquina) => {
      const faixa = (estado[data] ?? []).find((f) => f.natureza === natureza);
      if (faixa) faixa.horasDisponiveis -= horasMaquina;
    },
  };
}

function ocorrencia(overrides: Partial<OcorrenciaEscalonavel> & { chave: ChaveOcorrencia }): OcorrenciaEscalonavel {
  return {
    projetoId: "projeto-generico",
    necessarioHorasPadrao: 1,
    candidatoIdsPorPrioridade: [],
    ehOrcamentoNovo: false,
    dataInicioJanela: "2026-11-09",
    ...overrides,
  };
}

/** Extrator de chave numérica (API atual) - menor número = maior prioridade. */
function prioridadePorMapa(prioridades: Record<string, number>) {
  return (oc: OcorrenciaEscalonavel) => prioridades[chaveOcorrenciaParaString(oc.chave)];
}

describe("escalonarConjuntoComFilaDeProntos — grade compartilhada e validações estruturais", () => {
  it("rejeita candidatoId sem registro central - nunca aceita objeto embutido por fora do registro", () => {
    const oc = ocorrencia({ chave: chave("OP-1"), necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R1"] });
    expect(() =>
      escalonarConjuntoComFilaDeProntos({
        ocorrencias: [oc],
        dependencias: [],
        registroCandidatos: new Map(), // R1 não registrado
        datasGradeCompartilhada: ["2026-11-09"],
        criterioPrioridadeDeNegocio: () => 0,
      }),
    ).toThrow(RangeError);
  });

  it("rejeita registroCandidatos com chave/id divergentes", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    expect(() =>
      escalonarConjuntoComFilaDeProntos({
        ocorrencias: [],
        dependencias: [],
        registroCandidatos: new Map([["R1-CHAVE-ERRADA", r1]]),
        datasGradeCompartilhada: ["2026-11-09"],
        criterioPrioridadeDeNegocio: () => 0,
      }),
    ).toThrow(RangeError);
  });

  it("rejeita necessarioHorasPadrao <= 0 - sem exceção para zero", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const oc = ocorrencia({ chave: chave("OP-1"), necessarioHorasPadrao: 0, candidatoIdsPorPrioridade: ["R1"] });
    expect(() =>
      escalonarConjuntoComFilaDeProntos({
        ocorrencias: [oc],
        dependencias: [],
        registroCandidatos: new Map([["R1", r1]]),
        datasGradeCompartilhada: ["2026-11-09"],
        criterioPrioridadeDeNegocio: () => 0,
      }),
    ).toThrow(RangeError);
  });

  it("rejeita ciclo de precedência - aborta o cenário inteiro (nunca vira 'ciclo_ou_erro_estrutural' por ocorrência)", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const a = ocorrencia({ chave: chave("A"), candidatoIdsPorPrioridade: ["R1"] });
    const b = ocorrencia({ chave: chave("B"), candidatoIdsPorPrioridade: ["R1"] });
    const dependencias: DependenciaOcorrencia[] = [
      { predecessora: a.chave, sucessora: b.chave, tipo: "sequencia_roteiro" },
      { predecessora: b.chave, sucessora: a.chave, tipo: "sequencia_roteiro" },
    ];
    expect(() =>
      escalonarConjuntoComFilaDeProntos({
        ocorrencias: [a, b],
        dependencias,
        registroCandidatos: new Map([["R1", r1]]),
        datasGradeCompartilhada: ["2026-11-09"],
        criterioPrioridadeDeNegocio: () => 0,
      }),
    ).toThrow(RangeError);
  });

  it("rejeita dependência referenciando chave fora do conjunto informado", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const a = ocorrencia({ chave: chave("A"), candidatoIdsPorPrioridade: ["R1"] });
    const foraDoConjunto = chave("FORA");
    expect(() =>
      escalonarConjuntoComFilaDeProntos({
        ocorrencias: [a],
        dependencias: [{ predecessora: foraDoConjunto, sucessora: a.chave, tipo: "sequencia_roteiro" }],
        registroCandidatos: new Map([["R1", r1]]),
        datasGradeCompartilhada: ["2026-11-09"],
        criterioPrioridadeDeNegocio: () => 0,
      }),
    ).toThrow(RangeError);
  });

  it("rejeita criterioPrioridadeDeNegocio não-finito", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8, "2026-11-10": 8 });
    const a = ocorrencia({ chave: chave("A"), necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R1"] });
    const b = ocorrencia({ chave: chave("B"), necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R1"] });
    expect(() =>
      escalonarConjuntoComFilaDeProntos({
        ocorrencias: [a, b],
        dependencias: [],
        registroCandidatos: new Map([["R1", r1]]),
        datasGradeCompartilhada: ["2026-11-09", "2026-11-10"],
        criterioPrioridadeDeNegocio: () => NaN,
      }),
    ).toThrow(RangeError);
  });

  it("prioridade binária malformada deixa de ser possível pela nova API - o critério é um extrator de chave numérica, não um comparador (a,b)", () => {
    // A API antiga aceitava (a,b)=>number, permitindo um comparador
    // não-transitivo (A>B, B>C, C>A simultaneamente) sem nenhuma
    // validação capturar isso - um Array.sort sobre um comparador assim
    // não tem resultado determinístico garantido. A API atual só aceita
    // (ocorrencia)=>number - o TypeScript já rejeita em tempo de
    // compilação qualquer tentativa de passar uma função binária; este
    // teste prova a CONSEQUÊNCIA em runtime: com 3 ocorrências disputando
    // o MESMO recurso com capacidade insuficiente para todas, a ordem de
    // processamento é EXATAMENTE a ordem total das chaves numéricas
    // (B=1 < C=2 < A=3) - as duas primeiras (por prioridade) fecham, a
    // terceira fica com déficit. Um comparador binário mal formado
    // poderia produzir qualquer subconjunto vencedor, dependendo só de
    // como o algoritmo de sort decidiu comparar os pares.
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 2 }); // só dá para 2 das 3 ocorrências (1h cada)
    const a = ocorrencia({ chave: chave("A"), necessarioHorasPadrao: 1, candidatoIdsPorPrioridade: ["R1"] });
    const b = ocorrencia({ chave: chave("B"), necessarioHorasPadrao: 1, candidatoIdsPorPrioridade: ["R1"] });
    const c = ocorrencia({ chave: chave("C"), necessarioHorasPadrao: 1, candidatoIdsPorPrioridade: ["R1"] });
    const prioridades: Record<string, number> = {
      [chaveOcorrenciaParaString(a.chave)]: 3,
      [chaveOcorrenciaParaString(b.chave)]: 1,
      [chaveOcorrenciaParaString(c.chave)]: 2,
    };

    const resultados = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [a, b, c],
      dependencias: [],
      registroCandidatos: new Map([["R1", r1]]),
      datasGradeCompartilhada: ["2026-11-09"],
      criterioPrioridadeDeNegocio: prioridadePorMapa(prioridades),
    });

    // Ordem total esperada e única: B (prioridade 1) e C (2) fecham; A (3) fica com déficit.
    expect(resultados.get(chaveOcorrenciaParaString(b.chave))!.status).toBe("concluida");
    expect(resultados.get(chaveOcorrenciaParaString(c.chave))!.status).toBe("concluida");
    expect(resultados.get(chaveOcorrenciaParaString(a.chave))!.status).toBe("bloqueada_por_deficit");
    expect(resultados.get(chaveOcorrenciaParaString(a.chave))!.deficitResidualHorasPadrao).toBe(1);
  });

  it("extrator de prioridade é chamado EXATAMENTE UMA VEZ por ocorrência, mesmo quando várias rodadas do laço são necessárias", () => {
    // 3 ocorrências independentes, cada uma no seu próprio recurso (sem
    // disputa de capacidade, sem predecessoras) - todas ficam "prontas"
    // já na primeira rodada e permanecem na fila até serem escolhidas uma
    // por rodada (3 rodadas no total). Antes da correção, o critério de
    // prioridade era recalculado para toda ocorrência ainda pendente em
    // CADA rodada (contagem > 3); a correção calcula tudo uma vez, antes
    // do laço.
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const r2 = criarCandidato("R2", 1, { "2026-11-09": 8 });
    const r3 = criarCandidato("R3", 1, { "2026-11-09": 8 });
    const a = ocorrencia({ chave: chave("A"), necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R1"] });
    const b = ocorrencia({ chave: chave("B"), necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R2"] });
    const c = ocorrencia({ chave: chave("C"), necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R3"] });
    const prioridades: Record<string, number> = {
      [chaveOcorrenciaParaString(a.chave)]: 1,
      [chaveOcorrenciaParaString(b.chave)]: 2,
      [chaveOcorrenciaParaString(c.chave)]: 3,
    };

    let chamadas = 0;
    const criterioComContagem = (oc: OcorrenciaEscalonavel) => {
      chamadas++;
      return prioridades[chaveOcorrenciaParaString(oc.chave)];
    };

    const resultados = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [a, b, c],
      dependencias: [],
      registroCandidatos: new Map([["R1", r1], ["R2", r2], ["R3", r3]]),
      datasGradeCompartilhada: ["2026-11-09"],
      criterioPrioridadeDeNegocio: criterioComContagem,
    });

    expect(chamadas).toBe(3);
    expect([...resultados.values()].every((r) => r.status === "concluida")).toBe(true);
  });

  it("prioridade inválida numa SUCESSORA aborta antes de qualquer chamada a consumir - nenhuma capacidade é mutada", () => {
    const consumirChamadas: string[] = [];
    function candidatoComEspiao(id: string, capacidadePorData: Record<string, number>): CandidatoComCapacidadeDiaria {
      const restante = { ...capacidadePorData };
      return {
        id,
        produtividade: 1,
        faixasDoDia: (data) =>
          data in restante ? [{ natureza: "normal", horasDisponiveis: restante[data], contratacaoId: null, elegibilidade: null }] : [],
        consumir: (data, _natureza, horasMaquina) => {
          consumirChamadas.push(id);
          restante[data] = (restante[data] ?? 0) - horasMaquina;
        },
      };
    }

    const r1 = candidatoComEspiao("R1", { "2026-11-09": 8 });
    const predecessora = ocorrencia({ chave: chave("PRED"), necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R1"] });
    const sucessora = ocorrencia({ chave: chave("SUC"), necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R1"] });

    const prioridades: Record<string, number> = {
      [chaveOcorrenciaParaString(predecessora.chave)]: 1, // válida
      [chaveOcorrenciaParaString(sucessora.chave)]: NaN, // inválida - só ficaria "pronta" depois da predecessora concluir
    };

    expect(() =>
      escalonarConjuntoComFilaDeProntos({
        ocorrencias: [predecessora, sucessora],
        dependencias: [{ predecessora: predecessora.chave, sucessora: sucessora.chave, tipo: "sequencia_roteiro" }],
        registroCandidatos: new Map([["R1", r1]]),
        datasGradeCompartilhada: ["2026-11-09"],
        criterioPrioridadeDeNegocio: prioridadePorMapa(prioridades),
      }),
    ).toThrow(RangeError);

    // Nenhuma capacidade foi consumida - a predecessora, mesmo com
    // prioridade válida e pronta desde o início, nunca chegou a ser
    // processada, porque a validação de prioridade cobre TODAS as
    // ocorrências (inclusive a sucessora, ainda bloqueada) antes do laço.
    expect(consumirChamadas).toHaveLength(0);
  });

  it("grade vazia com ocorrências pendentes é erro estrutural (configuração), NUNCA déficit comercial", () => {
    const r1 = criarCandidato("R1", 1, {});
    const oc = ocorrencia({ chave: chave("OP-1"), necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R1"] });
    expect(() =>
      escalonarConjuntoComFilaDeProntos({
        ocorrencias: [oc],
        dependencias: [],
        registroCandidatos: new Map([["R1", r1]]),
        datasGradeCompartilhada: [], // vazia
        criterioPrioridadeDeNegocio: () => 0,
      }),
    ).toThrow(RangeError);
  });

  it("grade vazia SEM ocorrências não é erro (nada para escalonar)", () => {
    const resultados = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [],
      dependencias: [],
      registroCandidatos: new Map(),
      datasGradeCompartilhada: [],
      criterioPrioridadeDeNegocio: () => 0,
    });
    expect(resultados.size).toBe(0);
  });
});

describe("escalonarConjuntoComFilaDeProntos — capacidade extra em dia não produtivo (sábado/domingo/feriado)", () => {
  it("usa a capacidade extra autorizada em um sábado - a janela real nunca é recortada por calendário genérico", () => {
    // 2026-11-14 é sábado; 2026-11-15 domingo; 2026-11-16 segunda.
    const r1 = criarCandidatoComFaixas("R1", 1, {
      "2026-11-14": [
        { natureza: "sabado", horasDisponiveis: 4, contratacaoId: "CT-1", elegibilidade: { escopo: "qualquer_projeto_do_cenario" } },
      ],
      "2026-11-16": [{ natureza: "normal", horasDisponiveis: 8, contratacaoId: null, elegibilidade: null }],
    });
    const oc = ocorrencia({
      chave: chave("OP-1"),
      necessarioHorasPadrao: 4, // exatamente a capacidade extra do sábado - só fecha se o sábado for de fato usado
      candidatoIdsPorPrioridade: ["R1"],
      dataInicioJanela: "2026-11-14",
      ehOrcamentoNovo: true,
    });

    const resultado = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [oc],
      dependencias: [],
      registroCandidatos: new Map([["R1", r1]]),
      datasGradeCompartilhada: ["2026-11-14", "2026-11-15", "2026-11-16"],
      criterioPrioridadeDeNegocio: () => 0,
    }).get(chaveOcorrenciaParaString(oc.chave))!;

    expect(resultado.status).toBe("concluida");
    expect(resultado.dataInicioReal).toBe("2026-11-14");
    expect(resultado.dataFimReal).toBe("2026-11-14");
    expect(resultado.alocacoes).toEqual([
      { recursoId: "R1", data: "2026-11-14", natureza: "sabado", contratacaoId: "CT-1", horasMaquina: 4, horasPadrao: 4 },
    ]);
  });

  it("A pode iniciar sábado com capacidade extra, B só pode iniciar segunda, MESMA prioridade: A é escolhida primeiro, independentemente de como as chaves ordenariam", () => {
    // Reproduz o cenário relatado: um calendário genérico empurraria o
    // início "de ordenação" de A (sábado) para segunda, empatando
    // artificialmente com B (que só pode mesmo começar segunda) e
    // deixando a CHAVE decidir quem processa primeiro - potencialmente
    // deixando B reservar a segunda-feira antes de A. Como a ordenação
    // agora usa a MESMA data bruta da alocação (sem calendário), A
    // (09-11-14, sábado) tem data mínima estritamente anterior à de B
    // (2026-11-16, segunda) e vence o desempate 2 diretamente - a chave
    // (critério 3) nunca chega a ser consultada.
    //
    // As chaves são escolhidas deliberadamente para que, SE o desempate
    // caísse incorretamente no critério 3, B (chave "AAA-B", que ordena
    // ANTES de "ZZZ-A" alfabeticamente) venceria - o que provaria o bug.
    const r1 = criarCandidatoComFaixas("R1", 1, {
      "2026-11-14": [
        { natureza: "sabado", horasDisponiveis: 4, contratacaoId: "CT-1", elegibilidade: { escopo: "qualquer_projeto_do_cenario" } },
      ],
      "2026-11-16": [{ natureza: "normal", horasDisponiveis: 8, contratacaoId: null, elegibilidade: null }],
    });
    const a = ocorrencia({
      chave: chave("ZZZ-A"), // chave "perdedora" se o desempate (incorretamente) caísse na chave
      projetoId: "PROJETO-A",
      necessarioHorasPadrao: 8, // 4h do sábado + 4h da segunda
      candidatoIdsPorPrioridade: ["R1"],
      dataInicioJanela: "2026-11-14",
      ehOrcamentoNovo: true,
    });
    const b = ocorrencia({
      chave: chave("AAA-B"), // chave "vencedora" se o desempate (incorretamente) caísse na chave
      projetoId: "PROJETO-B",
      necessarioHorasPadrao: 8, // toda a segunda-feira
      candidatoIdsPorPrioridade: ["R1"],
      dataInicioJanela: "2026-11-16",
      ehOrcamentoNovo: true,
    });

    const resultados = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [a, b],
      dependencias: [],
      registroCandidatos: new Map([["R1", r1]]),
      datasGradeCompartilhada: ["2026-11-14", "2026-11-15", "2026-11-16"],
      criterioPrioridadeDeNegocio: () => 0, // mesma prioridade - o desempate por data mínima decide
    });

    const resultadoA = resultados.get(chaveOcorrenciaParaString(a.chave))!;
    const resultadoB = resultados.get(chaveOcorrenciaParaString(b.chave))!;

    // A processada primeiro: fecha usando sábado (4h) + segunda (4h).
    expect(resultadoA.status).toBe("concluida");
    expect(resultadoA.alocacoes.map((al) => [al.data, al.natureza, al.horasMaquina])).toEqual([
      ["2026-11-14", "sabado", 4],
      ["2026-11-16", "normal", 4],
    ]);

    // B processada depois: só sobrou 4h da segunda (8-4) - déficit real de 4h.
    expect(resultadoB.status).toBe("bloqueada_por_deficit");
    expect(resultadoB.deficitResidualHorasPadrao).toBe(4);
  });
});

describe("escalonarConjuntoComFilaDeProntos — zero dupla reserva entre 2 projetos", () => {
  it("duas ocorrências de projetos diferentes disputando o MESMO recurso nunca somam mais que a capacidade do dia", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8, "2026-11-10": 8 });
    const projA = ocorrencia({
      chave: chave("A", { projetoItemId: "PROJ-A" }),
      projetoId: "PROJ-A",
      necessarioHorasPadrao: 10,
      candidatoIdsPorPrioridade: ["R1"],
    });
    const projB = ocorrencia({
      chave: chave("B", { projetoItemId: "PROJ-B" }),
      projetoId: "PROJ-B",
      necessarioHorasPadrao: 10,
      candidatoIdsPorPrioridade: ["R1"],
    });

    const resultados = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [projA, projB],
      dependencias: [],
      registroCandidatos: new Map([["R1", r1]]),
      datasGradeCompartilhada: ["2026-11-09", "2026-11-10"],
      criterioPrioridadeDeNegocio: prioridadePorMapa({
        [chaveOcorrenciaParaString(projA.chave)]: 1,
        [chaveOcorrenciaParaString(projB.chave)]: 2,
      }),
    });

    const totalPorDia: Record<string, number> = {};
    for (const resultado of resultados.values()) {
      for (const alocacao of resultado.alocacoes) {
        totalPorDia[alocacao.data] = (totalPorDia[alocacao.data] ?? 0) + alocacao.horasMaquina;
      }
    }
    for (const total of Object.values(totalPorDia)) {
      expect(total).toBeLessThanOrEqual(8 + 1e-9);
    }

    // 20h necessárias ao todo, só 16h de capacidade nos 2 dias - déficit residual real, nunca escondido.
    const somaDeficit = [...resultados.values()].reduce((s, r) => s + r.deficitResidualHorasPadrao, 0);
    expect(somaDeficit).toBeCloseTo(4, 6);
  });
});

describe("escalonarConjuntoComFilaDeProntos — déficit bloqueia toda a descendência", () => {
  it("predecessora com déficit nunca libera a sucessora, mesmo que a sucessora tivesse capacidade disponível", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 2 }); // insuficiente para a predecessora (precisa de 10)
    const r2 = criarCandidato("R2", 1, { "2026-11-09": 8, "2026-11-10": 8 }); // sucessora teria capacidade de sobra

    const predecessora = ocorrencia({ chave: chave("PRED"), necessarioHorasPadrao: 10, candidatoIdsPorPrioridade: ["R1"] });
    const sucessora = ocorrencia({ chave: chave("SUC"), necessarioHorasPadrao: 2, candidatoIdsPorPrioridade: ["R2"] });

    const resultados = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [predecessora, sucessora],
      dependencias: [{ predecessora: predecessora.chave, sucessora: sucessora.chave, tipo: "sequencia_roteiro" }],
      registroCandidatos: new Map([["R1", r1], ["R2", r2]]),
      datasGradeCompartilhada: ["2026-11-09", "2026-11-10"],
      criterioPrioridadeDeNegocio: () => 0,
    });

    const resultadoPred = resultados.get(chaveOcorrenciaParaString(predecessora.chave))!;
    const resultadoSuc = resultados.get(chaveOcorrenciaParaString(sucessora.chave))!;

    expect(resultadoPred.status).toBe("bloqueada_por_deficit");
    expect(resultadoPred.deficitResidualHorasPadrao).toBeCloseTo(8, 6);
    expect(resultadoSuc.status).toBe("bloqueada_por_predecessora");
    expect(resultadoSuc.alocacoes).toHaveLength(0);
    expect(resultadoSuc.deficitResidualHorasPadrao).toBe(2); // necessário inteiro, nada consumido
  });
});

describe("escalonarConjuntoComFilaDeProntos — grade estende além de um prazo nominal", () => {
  it("ocorrência que não fecharia dentro de uma janela curta conclui quando a grade compartilhada se estende", () => {
    const r1 = criarCandidato("R1", 1, {
      "2026-11-09": 4,
      "2026-11-10": 4,
      "2026-11-11": 4, // fora de uma janela "de prazo" hipotética de 2 dias
    });
    const oc = ocorrencia({ chave: chave("OP-1"), necessarioHorasPadrao: 12, candidatoIdsPorPrioridade: ["R1"] });

    const resultado = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [oc],
      dependencias: [],
      registroCandidatos: new Map([["R1", r1]]),
      datasGradeCompartilhada: ["2026-11-09", "2026-11-10", "2026-11-11"], // grade já estendida até o horizonte técnico
      criterioPrioridadeDeNegocio: () => 0,
    }).get(chaveOcorrenciaParaString(oc.chave))!;

    expect(resultado.status).toBe("concluida");
    expect(resultado.dataFimReal).toBe("2026-11-11");
    expect(resultado.deficitResidualHorasPadrao).toBe(0);
  });

  it("grade que NÃO se estende o suficiente deixa déficit real, nunca uma conclusão forçada", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 4, "2026-11-10": 4 });
    const oc = ocorrencia({ chave: chave("OP-1"), necessarioHorasPadrao: 12, candidatoIdsPorPrioridade: ["R1"] });

    const resultado = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [oc],
      dependencias: [],
      registroCandidatos: new Map([["R1", r1]]),
      datasGradeCompartilhada: ["2026-11-09", "2026-11-10"], // horizonte técnico atingido antes de fechar
      criterioPrioridadeDeNegocio: () => 0,
    }).get(chaveOcorrenciaParaString(oc.chave))!;

    expect(resultado.status).toBe("bloqueada_por_deficit");
    expect(resultado.deficitResidualHorasPadrao).toBeCloseTo(4, 6);
  });
});

describe("escalonarConjuntoComFilaDeProntos — exemplo de regressão fixo B×Y (DEC-007 §7.1)", () => {
  const DATAS = ["2026-11-09", "2026-11-10", "2026-11-11"];

  function montarCenario() {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8, "2026-11-10": 8, "2026-11-11": 8 });
    const b = ocorrencia({
      chave: chave("OP-B", { projetoItemId: "PROJETO-B" }),
      projetoId: "PROJETO-B",
      necessarioHorasPadrao: 12,
      candidatoIdsPorPrioridade: ["R1"],
      dataInicioJanela: "2026-11-09",
    });
    const y = ocorrencia({
      chave: chave("OP-Y", { projetoItemId: "PROJETO-Y" }),
      projetoId: "PROJETO-Y",
      necessarioHorasPadrao: 8,
      candidatoIdsPorPrioridade: ["R1"],
      dataInicioJanela: "2026-11-09",
    });
    return { r1, b, y };
  }

  function rodar(ocorrenciasEmOrdem: OcorrenciaEscalonavel[], prioridades: Record<string, number>) {
    const { r1 } = montarCenario();
    return escalonarConjuntoComFilaDeProntos({
      ocorrencias: ocorrenciasEmOrdem,
      dependencias: [],
      registroCandidatos: new Map([["R1", r1]]),
      datasGradeCompartilhada: DATAS,
      criterioPrioridadeDeNegocio: prioridadePorMapa(prioridades),
    });
  }

  function assertTotaisPorDiaNuncaExcedemOito(resultados: Map<string, ResultadoOcorrenciaEscalonada>) {
    const totalPorDia: Record<string, number> = {};
    for (const resultado of resultados.values()) {
      for (const alocacao of resultado.alocacoes) {
        totalPorDia[alocacao.data] = (totalPorDia[alocacao.data] ?? 0) + alocacao.horasMaquina;
      }
    }
    for (const total of Object.values(totalPorDia)) {
      expect(total).toBeLessThanOrEqual(8 + 1e-9);
    }
  }

  it("programação-base (B prioridade 1, Y prioridade 2): B termina 10/11, Y termina 11/11", () => {
    const { b, y } = montarCenario();
    const resultados = rodar([b, y], { [chaveOcorrenciaParaString(b.chave)]: 1, [chaveOcorrenciaParaString(y.chave)]: 2 });

    const rB = resultados.get(chaveOcorrenciaParaString(b.chave))!;
    const rY = resultados.get(chaveOcorrenciaParaString(y.chave))!;

    expect(rB.status).toBe("concluida");
    expect(rB.alocacoes.map((a) => [a.data, a.horasMaquina])).toEqual([
      ["2026-11-09", 8],
      ["2026-11-10", 4],
    ]);
    expect(rB.dataFimReal).toBe("2026-11-10");

    expect(rY.status).toBe("concluida");
    expect(rY.alocacoes.map((a) => [a.data, a.horasMaquina])).toEqual([
      ["2026-11-10", 4],
      ["2026-11-11", 4],
    ]);
    expect(rY.dataFimReal).toBe("2026-11-11");

    assertTotaisPorDiaNuncaExcedemOito(resultados);
  });

  it("programação-proposta (Y prioridade 1, B prioridade 2): Y termina 09/11, B termina 11/11", () => {
    const { b, y } = montarCenario();
    const resultados = rodar([b, y], { [chaveOcorrenciaParaString(y.chave)]: 1, [chaveOcorrenciaParaString(b.chave)]: 2 });

    const rB = resultados.get(chaveOcorrenciaParaString(b.chave))!;
    const rY = resultados.get(chaveOcorrenciaParaString(y.chave))!;

    expect(rY.status).toBe("concluida");
    expect(rY.alocacoes.map((a) => [a.data, a.horasMaquina])).toEqual([["2026-11-09", 8]]);
    expect(rY.dataFimReal).toBe("2026-11-09");

    expect(rB.status).toBe("concluida");
    expect(rB.alocacoes.map((a) => [a.data, a.horasMaquina])).toEqual([
      ["2026-11-10", 8],
      ["2026-11-11", 4],
    ]);
    expect(rB.dataFimReal).toBe("2026-11-11");

    assertTotaisPorDiaNuncaExcedemOito(resultados);
  });

  it("inverter a ordem do array de entrada (mesmas prioridades) não altera o resultado", () => {
    const { b: b1, y: y1 } = montarCenario();
    const prioridades = { [chaveOcorrenciaParaString(b1.chave)]: 1, [chaveOcorrenciaParaString(y1.chave)]: 2 };
    const resultadoOrdemBY = rodar([b1, y1], prioridades);

    const { b: b2, y: y2 } = montarCenario();
    const resultadoOrdemYB = rodar([y2, b2], prioridades);

    expect(resultadoOrdemBY.get(chaveOcorrenciaParaString(b1.chave))!.dataFimReal).toBe(
      resultadoOrdemYB.get(chaveOcorrenciaParaString(b2.chave))!.dataFimReal,
    );
    expect(resultadoOrdemBY.get(chaveOcorrenciaParaString(y1.chave))!.dataFimReal).toBe(
      resultadoOrdemYB.get(chaveOcorrenciaParaString(y2.chave))!.dataFimReal,
    );
    expect(resultadoOrdemBY.get(chaveOcorrenciaParaString(b1.chave))!.alocacoes).toEqual(
      resultadoOrdemYB.get(chaveOcorrenciaParaString(b2.chave))!.alocacoes,
    );
    expect(resultadoOrdemBY.get(chaveOcorrenciaParaString(y1.chave))!.alocacoes).toEqual(
      resultadoOrdemYB.get(chaveOcorrenciaParaString(y2.chave))!.alocacoes,
    );
  });

  it("prioridades EXATAMENTE iguais (empate de negócio): resultado ainda é determinístico e independente da ordem do array (desempate por data mínima + chave)", () => {
    const prioridadesIguais = () => 0;

    const { b: b1, y: y1 } = montarCenario();
    const { r1: r1a } = montarCenario();
    const resultadoOrdemBY = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [b1, y1],
      dependencias: [],
      registroCandidatos: new Map([["R1", r1a]]),
      datasGradeCompartilhada: DATAS,
      criterioPrioridadeDeNegocio: prioridadesIguais,
    });

    const { b: b2, y: y2 } = montarCenario();
    const { r1: r1b } = montarCenario();
    const resultadoOrdemYB = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [y2, b2],
      dependencias: [],
      registroCandidatos: new Map([["R1", r1b]]),
      datasGradeCompartilhada: DATAS,
      criterioPrioridadeDeNegocio: prioridadesIguais,
    });

    // Mesma data mínima de início (ambas dataInicioJanela=2026-11-09, sem predecessoras)
    // -> desempate final por chave completa ("OP-B" < "OP-Y" lexicograficamente) decide,
    // de forma IDÊNTICA independente da ordem de entrada no array.
    expect(resultadoOrdemBY.get(chaveOcorrenciaParaString(b1.chave))!.dataFimReal).toBe(
      resultadoOrdemYB.get(chaveOcorrenciaParaString(b2.chave))!.dataFimReal,
    );
    expect(resultadoOrdemBY.get(chaveOcorrenciaParaString(y1.chave))!.dataFimReal).toBe(
      resultadoOrdemYB.get(chaveOcorrenciaParaString(y2.chave))!.dataFimReal,
    );
    expect(resultadoOrdemBY.get(chaveOcorrenciaParaString(b1.chave))!.alocacoes).toEqual(
      resultadoOrdemYB.get(chaveOcorrenciaParaString(b2.chave))!.alocacoes,
    );
    expect(resultadoOrdemBY.get(chaveOcorrenciaParaString(y1.chave))!.alocacoes).toEqual(
      resultadoOrdemYB.get(chaveOcorrenciaParaString(y2.chave))!.alocacoes,
    );
  });

  it("diff leve (via compararProgramacoes): Y adiantado em 2 dias e B atrasado em 1 dia ao inverter a prioridade", async () => {
    const { compararProgramacoes } = await import("./compararProgramacoes");
    const { b: bBase, y: yBase } = montarCenario();
    const base = rodar([bBase, yBase], {
      [chaveOcorrenciaParaString(bBase.chave)]: 1,
      [chaveOcorrenciaParaString(yBase.chave)]: 2,
    });

    const { b: bProposta, y: yProposta } = montarCenario();
    const proposta = rodar([bProposta, yProposta], {
      [chaveOcorrenciaParaString(yProposta.chave)]: 1,
      [chaveOcorrenciaParaString(bProposta.chave)]: 2,
    });

    const diffs = compararProgramacoes(base, proposta);
    const diffB = diffs.find((d) => chaveOcorrenciaParaString(d.chave) === chaveOcorrenciaParaString(bBase.chave))!;
    const diffY = diffs.find((d) => chaveOcorrenciaParaString(d.chave) === chaveOcorrenciaParaString(yBase.chave))!;

    // proposta - base: B vai de 10/11 para 11/11 -> +1 dia (atrasado).
    expect(diffB.diasVariacaoFim).toBe(1);
    // proposta - base: Y vai de 11/11 para 09/11 -> -2 dias (adiantado).
    expect(diffY.diasVariacaoFim).toBe(-2);
  });
});
