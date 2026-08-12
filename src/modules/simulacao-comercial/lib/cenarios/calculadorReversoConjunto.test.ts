import { describe, expect, it } from "vitest";
import { buscarDataInicioMaisTardiaViavel } from "./calculadorReversoConjunto";
import type { OcorrenciaEscalonavel } from "./escalonadorConjunto";
import type { DependenciaOcorrencia } from "./grafoPrecedencia";
import type { CandidatoComCapacidadeDiaria, FaixaCapacidadeDia } from "./alocarOperacaoDiaAdia";
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";
import { calcularEstimativaInicioNecessario } from "../estimarInicioNecessario";
import type { BaseFixaMotor } from "../prepararEntradasMotor";

function chave(bomOperacaoId: string, overrides: Partial<ChaveOcorrencia> = {}): ChaveOcorrencia {
  return { projetoItemId: "PI-1", produtoRaizId: "PR-1", caminhoBomItemIds: [], bomOperacaoId, ...overrides };
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

function datasDe(inicio: string, quantidade: number): string[] {
  const [ano, mes, dia] = inicio.split("-").map(Number);
  return Array.from({ length: quantidade }, (_, i) => new Date(Date.UTC(ano, mes - 1, dia + i)).toISOString().slice(0, 10));
}

function ocorrencia(overrides: Partial<OcorrenciaEscalonavel> & { chave: ChaveOcorrencia }): OcorrenciaEscalonavel {
  return {
    projetoId: "orcamento-novo",
    necessarioHorasPadrao: 1,
    candidatoIdsPorPrioridade: [],
    ehOrcamentoNovo: true,
    dataInicioJanela: "2026-11-09",
    ...overrides,
  };
}

describe("buscarDataInicioMaisTardiaViavel — validações estruturais", () => {
  it("rejeita datasCandidatas vazia", () => {
    expect(() =>
      buscarDataInicioMaisTardiaViavel({
        ocorrencias: [],
        dependencias: [],
        projetoIdOrcamentoNovo: "orcamento-novo",
        chavesOrcamentoNovo: [],
        chavesRaizOrcamentoNovo: [chave("A")],
        chavesFinaisOrcamentoNovo: [chave("A")],
        criarRegistroCandidatos: () => new Map(),
        datasGradeCompartilhada: [],
        datasCandidatas: [],
        criterioPrioridadeDeNegocio: () => 0,
        prazoInterno: "2026-11-20",
      }),
    ).toThrow(RangeError);
  });

  it("rejeita datasCandidatas com a última candidata posterior a prazoInterno - intervalo prometido é [piso, prazoInterno]", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8, "2026-11-10": 8 });
    const a = ocorrencia({ chave: chave("A"), candidatoIdsPorPrioridade: ["R1"] });
    expect(() =>
      buscarDataInicioMaisTardiaViavel({
        ocorrencias: [a],
        dependencias: [],
        projetoIdOrcamentoNovo: "orcamento-novo",
        chavesOrcamentoNovo: [a.chave],
        chavesRaizOrcamentoNovo: [a.chave],
        chavesFinaisOrcamentoNovo: [a.chave],
        criarRegistroCandidatos: () => new Map([["R1", r1]]),
        datasGradeCompartilhada: datasDe("2026-11-09", 2),
        datasCandidatas: ["2026-11-09", "2026-11-10"], // 10/11 é posterior ao prazo abaixo
        criterioPrioridadeDeNegocio: () => 0,
        prazoInterno: "2026-11-09",
      }),
    ).toThrow(RangeError);
  });

  it("rejeita chave duplicada em chavesOrcamentoNovo", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const a = ocorrencia({ chave: chave("A"), candidatoIdsPorPrioridade: ["R1"] });
    expect(() =>
      buscarDataInicioMaisTardiaViavel({
        ocorrencias: [a],
        dependencias: [],
        projetoIdOrcamentoNovo: "orcamento-novo",
        chavesOrcamentoNovo: [a.chave, a.chave], // duplicada
        chavesRaizOrcamentoNovo: [a.chave],
        chavesFinaisOrcamentoNovo: [a.chave],
        criarRegistroCandidatos: () => new Map([["R1", r1]]),
        datasGradeCompartilhada: datasDe("2026-11-09", 2),
        datasCandidatas: datasDe("2026-11-09", 2),
        criterioPrioridadeDeNegocio: () => 0,
        prazoInterno: "2026-11-10",
      }),
    ).toThrow(RangeError);
  });

  it("rejeita chave duplicada em chavesRaizOrcamentoNovo", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const a = ocorrencia({ chave: chave("A"), candidatoIdsPorPrioridade: ["R1"] });
    expect(() =>
      buscarDataInicioMaisTardiaViavel({
        ocorrencias: [a],
        dependencias: [],
        projetoIdOrcamentoNovo: "orcamento-novo",
        chavesOrcamentoNovo: [a.chave],
        chavesRaizOrcamentoNovo: [a.chave, a.chave], // duplicada
        chavesFinaisOrcamentoNovo: [a.chave],
        criarRegistroCandidatos: () => new Map([["R1", r1]]),
        datasGradeCompartilhada: datasDe("2026-11-09", 2),
        datasCandidatas: datasDe("2026-11-09", 2),
        criterioPrioridadeDeNegocio: () => 0,
        prazoInterno: "2026-11-10",
      }),
    ).toThrow(RangeError);
  });

  it("rejeita chave duplicada em chavesFinaisOrcamentoNovo", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const a = ocorrencia({ chave: chave("A"), candidatoIdsPorPrioridade: ["R1"] });
    expect(() =>
      buscarDataInicioMaisTardiaViavel({
        ocorrencias: [a],
        dependencias: [],
        projetoIdOrcamentoNovo: "orcamento-novo",
        chavesOrcamentoNovo: [a.chave],
        chavesRaizOrcamentoNovo: [a.chave],
        chavesFinaisOrcamentoNovo: [a.chave, a.chave], // duplicada
        criarRegistroCandidatos: () => new Map([["R1", r1]]),
        datasGradeCompartilhada: datasDe("2026-11-09", 2),
        datasCandidatas: datasDe("2026-11-09", 2),
        criterioPrioridadeDeNegocio: () => 0,
        prazoInterno: "2026-11-10",
      }),
    ).toThrow(RangeError);
  });

  it("rejeita chave duplicada em ocorrencias - nunca deixa um Map sobrescrever silenciosamente e mascarar dados_insuficientes", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    // Duas ocorrências com a MESMA chave: a primeira TEM candidato, a segunda NÃO tem.
    // Se `ocorrencias` fosse indexada num Map sem checar duplicidade antes, a segunda
    // (sem candidato) sobrescreveria a primeira silenciosamente e a pré-checagem leria
    // só a última - podendo devolver dados_insuficientes (ou pior, "esconder" a
    // duplicidade) em vez de rejeitar explicitamente um conjunto de entrada inconsistente.
    const chaveRepetida = chave("A");
    const comCandidato = ocorrencia({ chave: chaveRepetida, candidatoIdsPorPrioridade: ["R1"] });
    const semCandidato = ocorrencia({ chave: chaveRepetida, candidatoIdsPorPrioridade: [] });
    expect(() =>
      buscarDataInicioMaisTardiaViavel({
        ocorrencias: [comCandidato, semCandidato],
        dependencias: [],
        projetoIdOrcamentoNovo: "orcamento-novo",
        chavesOrcamentoNovo: [chaveRepetida],
        chavesRaizOrcamentoNovo: [chaveRepetida],
        chavesFinaisOrcamentoNovo: [chaveRepetida],
        criarRegistroCandidatos: () => new Map([["R1", r1]]),
        datasGradeCompartilhada: datasDe("2026-11-09", 2),
        datasCandidatas: datasDe("2026-11-09", 2),
        criterioPrioridadeDeNegocio: () => 0,
        prazoInterno: "2026-11-10",
      }),
    ).toThrow(RangeError);
  });

  it("rejeita chave de chavesOrcamentoNovo que pertence a outro projeto (projetoId/ehOrcamentoNovo divergentes)", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    // "outro" existe em `ocorrencias` (ex.: projeto já comprometido da base) mas NÃO é o orçamento novo.
    const outro = ocorrencia({ chave: chave("OUTRO"), projetoId: "PROJETO-BASE", ehOrcamentoNovo: false, candidatoIdsPorPrioridade: ["R1"] });
    expect(() =>
      buscarDataInicioMaisTardiaViavel({
        ocorrencias: [outro],
        dependencias: [],
        projetoIdOrcamentoNovo: "orcamento-novo", // orçamento novo real é outro projetoId
        chavesOrcamentoNovo: [outro.chave], // mas a chave apontada pertence a PROJETO-BASE
        chavesRaizOrcamentoNovo: [outro.chave],
        chavesFinaisOrcamentoNovo: [outro.chave],
        criarRegistroCandidatos: () => new Map([["R1", r1]]),
        datasGradeCompartilhada: datasDe("2026-11-09", 2),
        datasCandidatas: datasDe("2026-11-09", 2),
        criterioPrioridadeDeNegocio: () => 0,
        prazoInterno: "2026-11-10",
      }),
    ).toThrow(RangeError);
  });

  it("rejeita raiz/final que não está em chavesOrcamentoNovo, mesmo existindo em ocorrencias (poderia ser de outro projeto)", () => {
    const r1 = criarCandidato("R1", 1, { "2026-11-09": 8 });
    const a = ocorrencia({ chave: chave("A"), candidatoIdsPorPrioridade: ["R1"] }); // orçamento novo de verdade
    const outro = ocorrencia({ chave: chave("OUTRO"), projetoId: "PROJETO-BASE", ehOrcamentoNovo: false, candidatoIdsPorPrioridade: ["R1"] });
    expect(() =>
      buscarDataInicioMaisTardiaViavel({
        ocorrencias: [a, outro],
        dependencias: [],
        projetoIdOrcamentoNovo: "orcamento-novo",
        chavesOrcamentoNovo: [a.chave], // só A está no universo declarado do orçamento
        chavesRaizOrcamentoNovo: [outro.chave], // mas a raiz aponta pra fora desse universo
        chavesFinaisOrcamentoNovo: [a.chave],
        criarRegistroCandidatos: () => new Map([["R1", r1]]),
        datasGradeCompartilhada: datasDe("2026-11-09", 2),
        datasCandidatas: datasDe("2026-11-09", 2),
        criterioPrioridadeDeNegocio: () => 0,
        prazoInterno: "2026-11-10",
      }),
    ).toThrow(RangeError);
  });

  it("rejeita raiz com predecessora em dependencias", () => {
    const r1 = criarCandidato("R1", 1, {});
    const a = ocorrencia({ chave: chave("A"), candidatoIdsPorPrioridade: ["R1"] });
    const b = ocorrencia({ chave: chave("B"), candidatoIdsPorPrioridade: ["R1"] });
    expect(() =>
      buscarDataInicioMaisTardiaViavel({
        ocorrencias: [a, b],
        dependencias: [{ predecessora: a.chave, sucessora: b.chave, tipo: "sequencia_roteiro" }],
        projetoIdOrcamentoNovo: "orcamento-novo",
        chavesOrcamentoNovo: [a.chave, b.chave],
        chavesRaizOrcamentoNovo: [b.chave], // B tem predecessora - inválido como raiz
        chavesFinaisOrcamentoNovo: [b.chave],
        criarRegistroCandidatos: () => new Map([["R1", r1]]),
        datasGradeCompartilhada: datasDe("2026-11-09", 5),
        datasCandidatas: datasDe("2026-11-09", 5),
        criterioPrioridadeDeNegocio: () => 0,
        prazoInterno: "2026-11-20",
      }),
    ).toThrow(RangeError);
  });

  it("dados_insuficientes quando alguma ocorrência do orçamento não tem candidato elegível", () => {
    const a = ocorrencia({ chave: chave("A"), necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: [] });
    const resultado = buscarDataInicioMaisTardiaViavel({
      ocorrencias: [a],
      dependencias: [],
      projetoIdOrcamentoNovo: "orcamento-novo",
      chavesOrcamentoNovo: [a.chave],
      chavesRaizOrcamentoNovo: [a.chave],
      chavesFinaisOrcamentoNovo: [a.chave],
      criarRegistroCandidatos: () => new Map(),
      datasGradeCompartilhada: datasDe("2026-11-09", 5),
      datasCandidatas: datasDe("2026-11-09", 5),
      criterioPrioridadeDeNegocio: () => 0,
      prazoInterno: "2026-11-20",
    });
    expect(resultado.estado).toBe("dados_insuficientes");
    expect(resultado.metodoVersao).toBe(2);
  });
});

describe("buscarDataInicioMaisTardiaViavel — limite exato, um dia antes/depois", () => {
  // R1 dá exatamente 4h/dia; A precisa de 8h (2 dias CONSECUTIVOS, sempre
  // - nenhuma candidata resolve sozinha em 1 dia). candidato C sempre
  // termina em C+1 dia civil - relação limpa entre candidata e conclusão,
  // necessária para os 3 testes abaixo (com necessário=capacidade de 1
  // dia só, QUALQUER candidata se resolveria no mesmo dia e mascararia o
  // efeito "1 dia antes/depois").
  function montarCenarioDoisDias() {
    // Fábrica, não instância pronta - a busca avalia VÁRIAS candidatas
    // dentro da mesma chamada (regressiva), cada uma precisa de um R1
    // novo (ver "independência entre tentativas" abaixo) - devolver um
    // objeto já construído aqui seria exatamente o vazamento entre
    // tentativas que este módulo existe para evitar.
    const criarRegistroCandidatos = () =>
      new Map<string, CandidatoComCapacidadeDiaria>([
        [
          "R1",
          criarCandidato("R1", 1, {
            "2026-11-09": 4,
            "2026-11-10": 4,
            "2026-11-11": 4,
            "2026-11-12": 4,
            "2026-11-13": 4,
            "2026-11-14": 4,
          }),
        ],
      ]);
    const a = ocorrencia({ chave: chave("A"), necessarioHorasPadrao: 8, candidatoIdsPorPrioridade: ["R1"] });
    return { criarRegistroCandidatos, a };
  }
  const GRADE = datasDe("2026-11-09", 6); // 09..14
  const CANDIDATAS = datasDe("2026-11-09", 4); // 09..12 (regressiva: 12,11,10,09)

  it("viavel_no_limite: candidata mais tardia (12/11) conclui EXATAMENTE no prazo (13/11), folga zero", () => {
    const { criarRegistroCandidatos, a } = montarCenarioDoisDias();
    const resultado = buscarDataInicioMaisTardiaViavel({
      ocorrencias: [a],
      dependencias: [],
      projetoIdOrcamentoNovo: "orcamento-novo",
      chavesOrcamentoNovo: [a.chave],
      chavesRaizOrcamentoNovo: [a.chave],
      chavesFinaisOrcamentoNovo: [a.chave],
      criarRegistroCandidatos,
      datasGradeCompartilhada: GRADE,
      datasCandidatas: CANDIDATAS,
      criterioPrioridadeDeNegocio: () => 0,
      prazoInterno: "2026-11-13",
    });
    expect(resultado.estado).toBe("viavel_no_limite");
    if (resultado.estado === "viavel_no_limite") {
      expect(resultado.dataEstimadaInicioNecessario).toBe("2026-11-12");
      expect(resultado.dataFimReal).toBe("2026-11-13");
      expect(resultado.folgaDiasCivis).toBe(0);
    }
  });

  it("prazo um dia DEPOIS do limite exato: mesma D*, agora com 1 dia civil de folga", () => {
    const { criarRegistroCandidatos, a } = montarCenarioDoisDias();
    const resultado = buscarDataInicioMaisTardiaViavel({
      ocorrencias: [a],
      dependencias: [],
      projetoIdOrcamentoNovo: "orcamento-novo",
      chavesOrcamentoNovo: [a.chave],
      chavesRaizOrcamentoNovo: [a.chave],
      chavesFinaisOrcamentoNovo: [a.chave],
      criarRegistroCandidatos,
      datasGradeCompartilhada: GRADE,
      datasCandidatas: CANDIDATAS,
      criterioPrioridadeDeNegocio: () => 0,
      prazoInterno: "2026-11-14",
    });
    expect(resultado.estado).toBe("viavel");
    if (resultado.estado === "viavel") {
      expect(resultado.dataEstimadaInicioNecessario).toBe("2026-11-12");
      expect(resultado.dataFimReal).toBe("2026-11-13");
      expect(resultado.folgaDiasCivis).toBe(1);
    }
  });

  it("prazo um dia ANTES da conclusão mínima alcançável (mesmo na candidata mais cedo): prazo_inviavel, 1 dia de atraso", () => {
    const { criarRegistroCandidatos, a } = montarCenarioDoisDias();
    const resultado = buscarDataInicioMaisTardiaViavel({
      ocorrencias: [a],
      dependencias: [],
      projetoIdOrcamentoNovo: "orcamento-novo",
      chavesOrcamentoNovo: [a.chave],
      chavesRaizOrcamentoNovo: [a.chave],
      chavesFinaisOrcamentoNovo: [a.chave],
      criarRegistroCandidatos,
      datasGradeCompartilhada: GRADE,
      datasCandidatas: ["2026-11-09"], // intervalo prometido é [piso, prazoInterno] - com prazo=09/11 só essa candidata é válida; ela conclui em 10/11, 1 dia tarde
      criterioPrioridadeDeNegocio: () => 0,
      prazoInterno: "2026-11-09",
    });
    expect(resultado.estado).toBe("prazo_inviavel");
    if (resultado.estado === "prazo_inviavel") {
      expect(resultado.dataFimReal).toBe("2026-11-10");
      expect(resultado.diasCivisDeAtraso).toBe(1);
    }
  });
});

describe("buscarDataInicioMaisTardiaViavel — déficit e horizonte técnico", () => {
  it("horizonte_tecnico_excedido: nem a candidata mais cedo (mais generosa) conclui", () => {
    const a = ocorrencia({ chave: chave("A"), necessarioHorasPadrao: 100, candidatoIdsPorPrioridade: ["R1"] }); // nunca fecha
    const resultado = buscarDataInicioMaisTardiaViavel({
      ocorrencias: [a],
      dependencias: [],
      projetoIdOrcamentoNovo: "orcamento-novo",
      chavesOrcamentoNovo: [a.chave],
      chavesRaizOrcamentoNovo: [a.chave],
      chavesFinaisOrcamentoNovo: [a.chave],
      criarRegistroCandidatos: () => new Map([["R1", criarCandidato("R1", 1, { "2026-11-09": 1, "2026-11-10": 1, "2026-11-11": 1 })]]), // 3h no total - fresca a cada candidata
      datasGradeCompartilhada: datasDe("2026-11-09", 3),
      datasCandidatas: datasDe("2026-11-09", 3),
      criterioPrioridadeDeNegocio: () => 0,
      prazoInterno: "2026-11-25",
    });
    expect(resultado.estado).toBe("horizonte_tecnico_excedido");
    if (resultado.estado === "horizonte_tecnico_excedido") {
      expect(resultado.candidatosExaminados).toBe(3);
    }
  });
});

describe("buscarDataInicioMaisTardiaViavel — independência entre tentativas", () => {
  it("capacidade de uma tentativa NUNCA vaza para a próxima - mesma fábrica reutilizada, resultado idêntico em execuções repetidas", () => {
    let vezesQueACapacidadeFoiConstruida = 0;
    function fabricaFresca(): ReadonlyMap<string, CandidatoComCapacidadeDiaria> {
      vezesQueACapacidadeFoiConstruida++;
      return new Map([["R1", criarCandidato("R1", 1, { "2026-11-09": 4, "2026-11-10": 4, "2026-11-11": 4 })]]);
    }
    const a = ocorrencia({ chave: chave("A"), necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R1"] });

    const params = {
      ocorrencias: [a],
      dependencias: [] as DependenciaOcorrencia[],
      projetoIdOrcamentoNovo: "orcamento-novo",
      chavesOrcamentoNovo: [a.chave],
      chavesRaizOrcamentoNovo: [a.chave],
      chavesFinaisOrcamentoNovo: [a.chave],
      criarRegistroCandidatos: fabricaFresca,
      datasGradeCompartilhada: datasDe("2026-11-09", 3),
      datasCandidatas: datasDe("2026-11-09", 3),
      criterioPrioridadeDeNegocio: () => 0,
      prazoInterno: "2026-11-11",
    };

    const resultado1 = buscarDataInicioMaisTardiaViavel(params);
    const chamadasApos1a = vezesQueACapacidadeFoiConstruida;
    const resultado2 = buscarDataInicioMaisTardiaViavel(params);

    // Se a capacidade vazasse entre tentativas, a 1a chamada já teria
    // "gasto" R1 progressivamente a cada candidata regressiva, e rodar a
    // busca inteira DE NOVO (2a chamada) encontraria capacidade já parcialmente
    // consumida - resultado diferente. Como a fábrica sempre devolve um R1
    // "cheio", os dois resultados completos precisam ser idênticos.
    expect(resultado2).toEqual(resultado1);
    // A fábrica foi chamada pelo menos 1 vez a mais na 2a rodada completa (nova busca do zero).
    expect(vezesQueACapacidadeFoiConstruida).toBeGreaterThan(chamadasApos1a);
  });
});

describe("buscarDataInicioMaisTardiaViavel — contraexemplo de não-monotonicidade (justifica a varredura linear)", () => {
  // Reproduz exatamente o cenário do contraexemplo: A (raiz do orçamento)
  // usa R1; C (concorrente, mesmo R1, rank mais baixo que A) tem sucessora
  // D que usa R2; B (sucessora de A) também usa R2, mas só é ELEGÍVEL na
  // faixa de 10/11 quando o projeto é BASE-C (D) - B (orçamento) só
  // consegue usar a faixa "normal" de 11/11.
  //
  // Rank fixo (A < C < D < B) em TODAS as tentativas - a única coisa que
  // muda entre candidatas é a data de início de A, mas isso já basta para
  // deslocar QUANDO C conclui, o que desloca a janela de D, o que decide
  // se D consome 10/11 (natureza restrita a BASE-C) ou é empurrada para
  // 11/11 (a única data que B consegue usar) - efeito indireto via um
  // recurso (R2) que A nunca toca diretamente.
  function montarCenario() {
    const a = ocorrencia({ chave: chave("A", { projetoItemId: "ORCAMENTO" }), projetoId: "ORCAMENTO", necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R1"], ehOrcamentoNovo: true });
    const b = ocorrencia({ chave: chave("B", { projetoItemId: "ORCAMENTO" }), projetoId: "ORCAMENTO", necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R2"], ehOrcamentoNovo: true });
    const c = ocorrencia({ chave: chave("C", { projetoItemId: "BASE-C" }), projetoId: "BASE-C", necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R1"], ehOrcamentoNovo: false, dataInicioJanela: "2026-11-09" });
    const d = ocorrencia({ chave: chave("D", { projetoItemId: "BASE-C" }), projetoId: "BASE-C", necessarioHorasPadrao: 4, candidatoIdsPorPrioridade: ["R2"], ehOrcamentoNovo: false, dataInicioJanela: "2026-11-09" });
    const dependencias: DependenciaOcorrencia[] = [
      { predecessora: a.chave, sucessora: b.chave, tipo: "sequencia_roteiro" },
      { predecessora: c.chave, sucessora: d.chave, tipo: "sequencia_roteiro" },
    ];
    // A(1) < C(2) < D(3) < B(4) - ordem fixa, nunca muda entre candidatas.
    const rank: Record<string, number> = {
      [chaveOcorrenciaParaString(a.chave)]: 1,
      [chaveOcorrenciaParaString(c.chave)]: 2,
      [chaveOcorrenciaParaString(d.chave)]: 3,
      [chaveOcorrenciaParaString(b.chave)]: 4,
    };
    const criterioPrioridadeDeNegocio = (oc: OcorrenciaEscalonavel) => rank[chaveOcorrenciaParaString(oc.chave)];

    function criarRegistroCandidatos(): ReadonlyMap<string, CandidatoComCapacidadeDiaria> {
      return new Map([
        ["R1", criarCandidato("R1", 1, { "2026-11-09": 4, "2026-11-10": 4 })],
        [
          "R2",
          criarCandidatoComFaixas("R2", 1, {
            "2026-11-10": [{ natureza: "hora_extra", horasDisponiveis: 4, contratacaoId: "CT-BASE-C", elegibilidade: { escopo: "projetos_especificos", projetoIds: ["BASE-C"] } }],
            "2026-11-11": [{ natureza: "normal", horasDisponiveis: 4, contratacaoId: null, elegibilidade: null }],
          }),
        ],
      ]);
    }

    return { a, b, c, d, dependencias, criterioPrioridadeDeNegocio, criarRegistroCandidatos };
  }

  it("candidata isolada 09/11 (mais cedo): B nunca conclui - horizonte_tecnico_excedido", () => {
    const { a, b, c, d, dependencias, criterioPrioridadeDeNegocio, criarRegistroCandidatos } = montarCenario();
    const resultado = buscarDataInicioMaisTardiaViavel({
      ocorrencias: [a, b, c, d],
      dependencias,
      projetoIdOrcamentoNovo: "ORCAMENTO",
      chavesOrcamentoNovo: [a.chave, b.chave],
      chavesRaizOrcamentoNovo: [a.chave],
      chavesFinaisOrcamentoNovo: [b.chave],
      criarRegistroCandidatos,
      datasGradeCompartilhada: datasDe("2026-11-09", 3),
      datasCandidatas: ["2026-11-09"], // só a candidata "mais cedo" testada isoladamente
      criterioPrioridadeDeNegocio,
      prazoInterno: "2026-11-11",
    });
    // A conclui em 09/11 (único dia que toca); C só sobra 10/11 em R1, conclui em 10/11;
    // D (predecessora concluída em 10/11) só pode começar em 11/11 - cai na faixa "normal"
    // de 11/11 (a hora_extra de 10/11 nem está na janela de D). B (predecessora concluída
    // em 09/11) pode tentar a partir de 10/11: a faixa de 10/11 é hora_extra restrita a
    // BASE-C - B não é elegível, pula; 11/11 já foi consumida por D - déficit total.
    expect(resultado.estado).toBe("horizonte_tecnico_excedido");
  });

  it("candidata isolada 10/11 (mais tarde): B conclui em 11/11 - viavel_no_limite", () => {
    const { a, b, c, d, dependencias, criterioPrioridadeDeNegocio, criarRegistroCandidatos } = montarCenario();
    const resultado = buscarDataInicioMaisTardiaViavel({
      ocorrencias: [a, b, c, d],
      dependencias,
      projetoIdOrcamentoNovo: "ORCAMENTO",
      chavesOrcamentoNovo: [a.chave, b.chave],
      chavesRaizOrcamentoNovo: [a.chave],
      chavesFinaisOrcamentoNovo: [b.chave],
      criarRegistroCandidatos,
      datasGradeCompartilhada: datasDe("2026-11-09", 3),
      datasCandidatas: ["2026-11-10"], // só a candidata "mais tarde" testada isoladamente
      criterioPrioridadeDeNegocio,
      prazoInterno: "2026-11-11",
    });
    // A só toca 10/11 (não usa 09/11) - C fica livre para usar 09/11 em R1, conclui em
    // 09/11. D (predecessora concluída em 09/11) pode começar em 10/11 - a faixa hora_extra
    // de 10/11 é elegível para BASE-C - D consome ali inteiramente, nunca chega a 11/11.
    // B (predecessora concluída em 10/11) só pode começar em 11/11 - a faixa "normal" de
    // 11/11 está livre (D não a tocou) - B fecha em 11/11 = prazo.
    expect(resultado.estado).toBe("viavel_no_limite");
    if (resultado.estado === "viavel_no_limite") {
      expect(resultado.dataFimReal).toBe("2026-11-11");
    }
  });

  it("a busca completa (varredura regressiva) encontra a candidata mais tarde viável (10/11), nunca a mais cedo (09/11, que sozinha falha)", () => {
    const { a, b, c, d, dependencias, criterioPrioridadeDeNegocio, criarRegistroCandidatos } = montarCenario();
    const resultado = buscarDataInicioMaisTardiaViavel({
      ocorrencias: [a, b, c, d],
      dependencias,
      projetoIdOrcamentoNovo: "ORCAMENTO",
      chavesOrcamentoNovo: [a.chave, b.chave],
      chavesRaizOrcamentoNovo: [a.chave],
      chavesFinaisOrcamentoNovo: [b.chave],
      criarRegistroCandidatos,
      datasGradeCompartilhada: datasDe("2026-11-09", 3),
      datasCandidatas: ["2026-11-09", "2026-11-10"],
      criterioPrioridadeDeNegocio,
      prazoInterno: "2026-11-11",
    });
    expect(resultado.estado).toBe("viavel_no_limite");
    if (resultado.estado === "viavel_no_limite") {
      expect(resultado.dataEstimadaInicioNecessario).toBe("2026-11-10");
    }
  });

  it("classificação NÃO presume monotonicidade: com prazo mais apertado (10/11), a candidata NÃO-mais-cedo (10/11) é quem produz a melhor conclusão tardia - nunca horizonte_tecnico_excedido só porque a mais cedo (09/11) falhou", () => {
    const { a, b, c, d, dependencias, criterioPrioridadeDeNegocio, criarRegistroCandidatos } = montarCenario();
    const resultado = buscarDataInicioMaisTardiaViavel({
      ocorrencias: [a, b, c, d],
      dependencias,
      projetoIdOrcamentoNovo: "ORCAMENTO",
      chavesOrcamentoNovo: [a.chave, b.chave],
      chavesRaizOrcamentoNovo: [a.chave],
      chavesFinaisOrcamentoNovo: [b.chave],
      criarRegistroCandidatos,
      datasGradeCompartilhada: datasDe("2026-11-09", 3),
      datasCandidatas: ["2026-11-09", "2026-11-10"],
      criterioPrioridadeDeNegocio,
      prazoInterno: "2026-11-10", // 1 dia mais apertado que o teste anterior - nenhuma candidata cumpre o prazo agora
    });
    // Candidata 09/11 (mais cedo): B nunca conclui (déficit total - ver teste isolado acima).
    // Se a classificação só olhasse a mais cedo (bug original), o resultado seria
    // horizonte_tecnico_excedido. Candidata 10/11 (não é a mais cedo) CONCLUI em 11/11 -
    // 1 dia depois do prazo, mas é uma conclusão real - o estado correto é prazo_inviavel,
    // usando a data da candidata 10/11 (a única que produziu qualquer conclusão).
    expect(resultado.estado).toBe("prazo_inviavel");
    if (resultado.estado === "prazo_inviavel") {
      expect(resultado.dataFimReal).toBe("2026-11-11");
      expect(resultado.diasCivisDeAtraso).toBe(1);
    }
  });
});

describe("buscarDataInicioMaisTardiaViavel — sem concorrência, reproduz o Calculador Reverso atual (não regressão)", () => {
  // Cenário deliberadamente UNIFORME (1 operação, 1 recurso, capacidade
  // diária constante, sem hora extra, sem outros projetos) - único caso
  // em que o modelo agregado antigo (dias produtivos como escalar) e o
  // modelo por-dia novo (escalonador conjunto) são matematicamente
  // equivalentes por construção: capacidade acumulada = N dias * 8h/dia
  // em AMBOS. dataDisponibilidadeProducao é fixada bem antes de tudo, só
  // para nunca cair no ramo de material do método antigo (fora do escopo
  // deste módulo) - isola a comparação ao eixo "capacidade x prazo".
  function gerarDiasConsecutivos(inicio: string, quantidade: number): string[] {
    const [ano, mes, dia] = inicio.split("-").map(Number);
    return Array.from({ length: quantidade }, (_, i) => new Date(Date.UTC(ano, mes - 1, dia + i)).toISOString().slice(0, 10));
  }
  async function contarDiasCivisInclusive(a: string, b: string): Promise<number> {
    const [anoA, mesA, diaA] = a.split("-").map(Number);
    const [anoB, mesB, diaB] = b.split("-").map(Number);
    return Math.round((Date.UTC(anoB, mesB - 1, diaB) - Date.UTC(anoA, mesA - 1, diaA)) / 86_400_000) + 1;
  }

  it("D* do método novo bate com dataEstimadaInicioNecessario do método antigo para o mesmo cenário uniforme", async () => {
    const P = gerarDiasConsecutivos("2026-11-01", 20); // 01..20/11, todos tratados como produtivos (mesmo fake já usado em estimarInicioNecessario.test.ts)
    const prazoInterno = P[P.length - 1]; // 20/11
    const NECESSARIO_HORAS = 16; // 2 dias de 8h/dia - nunca fecha em 1 candidata só (evita mascarar o eixo testado, mesmo cuidado da seção "limite exato" acima)

    const baseFixaAntiga: BaseFixaMotor = {
      operacoesOrdenadas: [{ bomOperacaoId: "op-1", recursoOriginalId: "r1", tempoEstimadoMinutos: 60, quantidade: NECESSARIO_HORAS }],
      recursoIds: ["r1"],
      compatibilidades: {},
      capacidadeDiariaPorRecurso: { r1: 8 },
      produtividadePorRecurso: { r1: 1 },
      comprometidoInicialPorRecurso: { r1: 0 },
    };

    const resultadoAntigo = await calcularEstimativaInicioNecessario(
      baseFixaAntiga,
      P,
      prazoInterno,
      P[0], // material disponível desde sempre - nunca é o fator limitante
      contarDiasCivisInclusive,
      P.length,
    );
    expect(resultadoAntigo.estado === "viavel" || resultadoAntigo.estado === "viavel_no_limite").toBe(true);
    if (!(resultadoAntigo.estado === "viavel" || resultadoAntigo.estado === "viavel_no_limite")) return;

    const a = ocorrencia({ chave: chave("A"), necessarioHorasPadrao: NECESSARIO_HORAS, candidatoIdsPorPrioridade: ["R1"] });
    const resultadoNovo = buscarDataInicioMaisTardiaViavel({
      ocorrencias: [a],
      dependencias: [],
      projetoIdOrcamentoNovo: "orcamento-novo",
      chavesOrcamentoNovo: [a.chave],
      chavesRaizOrcamentoNovo: [a.chave],
      chavesFinaisOrcamentoNovo: [a.chave],
      criarRegistroCandidatos: () => new Map([["R1", criarCandidato("R1", 1, Object.fromEntries(P.map((data) => [data, 8])))]]),
      datasGradeCompartilhada: P,
      datasCandidatas: P,
      criterioPrioridadeDeNegocio: () => 0,
      prazoInterno,
    });

    expect(resultadoNovo.estado === "viavel" || resultadoNovo.estado === "viavel_no_limite").toBe(true);
    if (resultadoNovo.estado === "viavel" || resultadoNovo.estado === "viavel_no_limite") {
      expect(resultadoNovo.dataEstimadaInicioNecessario).toBe(resultadoAntigo.dataEstimadaInicioNecessario);
    }
  });
});
