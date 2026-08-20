import { describe, expect, it } from "vitest";
import { criarCandidatoRecursoTemporario, recursoTemporarioAplicavelA, type RecursoTemporarioCenario } from "./recursoTemporario";
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";
import { escalonarConjuntoComFilaDeProntos, type OcorrenciaEscalonavel } from "./escalonadorConjunto";

function chave(bomOperacaoId: string): ChaveOcorrencia {
  return { projetoItemId: "PI-1", produtoRaizId: "PR-1", caminhoBomItemIds: [], bomOperacaoId };
}

function recursoTemporario(overrides: Partial<RecursoTemporarioCenario> = {}): RecursoTemporarioCenario {
  return {
    idTemporario: "TEMP-1",
    tipo: "maquina_alugada",
    recursoReferenciaId: "R1",
    disponibilidade: [{ data: "2026-11-09", horasDisponiveis: 8 }],
    contratacaoId: "CT-1",
    justificativa: "pico de demanda",
    aplicavelAsOperacoes: [],
    ...overrides,
  };
}

describe("criarCandidatoRecursoTemporario — produtividade sempre herdada", () => {
  it("usa EXATAMENTE a produtividade de referência informada - nunca um valor digitado à parte (a interface não tem esse campo)", () => {
    const temp = recursoTemporario();
    const candidato = criarCandidatoRecursoTemporario(temp, 0.85);
    expect(candidato.produtividade).toBe(0.85);
  });

  it("candidato.id é o idTemporario (identidade própria, não o recursoReferenciaId)", () => {
    const temp = recursoTemporario({ idTemporario: "TEMP-XYZ", recursoReferenciaId: "R-REAL-1" });
    const candidato = criarCandidatoRecursoTemporario(temp, 1);
    expect(candidato.id).toBe("TEMP-XYZ");
  });

  it("rejeita produtividadeReferencia inválida (fora de (0,1])", () => {
    const temp = recursoTemporario();
    expect(() => criarCandidatoRecursoTemporario(temp, 0)).toThrow(RangeError);
    expect(() => criarCandidatoRecursoTemporario(temp, 1.5)).toThrow(RangeError);
    expect(() => criarCandidatoRecursoTemporario(temp, NaN)).toThrow(RangeError);
  });
});

describe("criarCandidatoRecursoTemporario — disponibilidade diária respeitada", () => {
  it("só devolve capacidade nas datas EXPLICITAMENTE listadas - qualquer outra data (mesmo dia útil comum) é zero", () => {
    const temp = recursoTemporario({
      disponibilidade: [
        { data: "2026-11-09", horasDisponiveis: 8 },
        { data: "2026-11-14", horasDisponiveis: 4 }, // um sábado, por exemplo - listado explicitamente
      ],
    });
    const candidato = criarCandidatoRecursoTemporario(temp, 1);

    expect(candidato.faixasDoDia("2026-11-09")).toEqual([{ natureza: "normal", horasDisponiveis: 8, contratacaoId: null, elegibilidade: null }]);
    expect(candidato.faixasDoDia("2026-11-14")).toEqual([{ natureza: "normal", horasDisponiveis: 4, contratacaoId: null, elegibilidade: null }]);
    // 10/11 é dia útil comum mas NÃO foi listado - zero, nunca presumido a partir de um período.
    expect(candidato.faixasDoDia("2026-11-10")).toEqual([]);
  });

  it("consumir reduz a capacidade restante da data específica, sem vazar para outras datas", () => {
    const temp = recursoTemporario({
      disponibilidade: [
        { data: "2026-11-09", horasDisponiveis: 8 },
        { data: "2026-11-10", horasDisponiveis: 8 },
      ],
    });
    const candidato = criarCandidatoRecursoTemporario(temp, 1);

    candidato.consumir("2026-11-09", "normal", 5);
    expect(candidato.faixasDoDia("2026-11-09")).toEqual([{ natureza: "normal", horasDisponiveis: 3, contratacaoId: null, elegibilidade: null }]);
    expect(candidato.faixasDoDia("2026-11-10")).toEqual([{ natureza: "normal", horasDisponiveis: 8, contratacaoId: null, elegibilidade: null }]);
  });

  it("consumir até esgotar: faixa some (horasDisponiveis<=0 não é mais devolvida)", () => {
    const temp = recursoTemporario({ disponibilidade: [{ data: "2026-11-09", horasDisponiveis: 4 }] });
    const candidato = criarCandidatoRecursoTemporario(temp, 1);
    candidato.consumir("2026-11-09", "normal", 4);
    expect(candidato.faixasDoDia("2026-11-09")).toEqual([]);
  });

  it("rejeita data de disponibilidade duplicada", () => {
    const temp = recursoTemporario({
      disponibilidade: [
        { data: "2026-11-09", horasDisponiveis: 4 },
        { data: "2026-11-09", horasDisponiveis: 8 },
      ],
    });
    expect(() => criarCandidatoRecursoTemporario(temp, 1)).toThrow(RangeError);
  });

  it("rejeita horasDisponiveis negativa", () => {
    const temp = recursoTemporario({ disponibilidade: [{ data: "2026-11-09", horasDisponiveis: -1 }] });
    expect(() => criarCandidatoRecursoTemporario(temp, 1)).toThrow(RangeError);
  });
});

describe("criarCandidatoRecursoTemporario — os 3 tipos (maquina_alugada/equipamento_adicional/freelancer) testados separadamente", () => {
  it.each(["maquina_alugada", "equipamento_adicional", "freelancer"] as const)(
    "tipo=%s não influencia produtividade nem capacidade diária - candidato idêntico em tudo, exceto o rótulo",
    (tipo) => {
      const temp = recursoTemporario({ tipo, disponibilidade: [{ data: "2026-11-09", horasDisponiveis: 6 }] });
      const candidato = criarCandidatoRecursoTemporario(temp, 0.9);

      expect(candidato.produtividade).toBe(0.9);
      expect(candidato.faixasDoDia("2026-11-09")).toEqual([
        { natureza: "normal", horasDisponiveis: 6, contratacaoId: null, elegibilidade: null },
      ]);
    },
  );
});

describe("recursoTemporarioAplicavelA", () => {
  it("verdadeiro quando a chave está em aplicavelAsOperacoes", () => {
    const alvo = chave("OP-1");
    const temp = recursoTemporario({ aplicavelAsOperacoes: [chave("OP-0"), alvo] });
    expect(recursoTemporarioAplicavelA(temp, alvo)).toBe(true);
  });

  it("falso quando a chave não está na lista", () => {
    const temp = recursoTemporario({ aplicavelAsOperacoes: [chave("OP-0")] });
    expect(recursoTemporarioAplicavelA(temp, chave("OP-1"))).toBe(false);
  });

  it("falso quando aplicavelAsOperacoes está vazia", () => {
    const temp = recursoTemporario({ aplicavelAsOperacoes: [] });
    expect(recursoTemporarioAplicavelA(temp, chave("OP-1"))).toBe(false);
  });
});

describe("criarCandidatoRecursoTemporario — integração real com o escalonador conjunto (Fase 2)", () => {
  it("o candidato produzido é diretamente consumível por escalonarConjuntoComFilaDeProntos, sem adaptação", () => {
    const alvo = chave("OP-1");
    const temp = recursoTemporario({
      idTemporario: "TEMP-FREELA",
      recursoReferenciaId: "R-REFERENCIA",
      disponibilidade: [
        { data: "2026-11-09", horasDisponiveis: 4 },
        { data: "2026-11-10", horasDisponiveis: 4 },
      ],
      aplicavelAsOperacoes: [alvo],
    });
    const candidato = criarCandidatoRecursoTemporario(temp, 0.8);

    const oc: OcorrenciaEscalonavel = {
      chave: alvo,
      projetoId: "orcamento-novo",
      necessarioHorasPadrao: 6.4, // 8h de máquina (4+4) × 0.8 de produtividade
      candidatoIdsPorPrioridade: [candidato.id],
      ehOrcamentoNovo: true,
      dataInicioJanela: "2026-11-09",
    };

    const resultados = escalonarConjuntoComFilaDeProntos({
      ocorrencias: [oc],
      dependencias: [],
      registroCandidatos: new Map([[candidato.id, candidato]]),
      datasGradeCompartilhada: ["2026-11-09", "2026-11-10"],
      criterioPrioridadeDeNegocio: () => 0,
    });

    const resultado = resultados.get(chaveOcorrenciaParaString(alvo))!;
    expect(resultado.status).toBe("concluida");
    expect(resultado.dataFimReal).toBe("2026-11-10");
  });
});
