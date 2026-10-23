import { describe, expect, it } from "vitest";
import {
  calcularTerminoOperacoesProgramadasPcp,
  verificarCoberturaIntegralProjetoPcp,
  calcularTerminoIntegralProjetoPcp,
  decidirAtrasoProjetoPcp,
  type OperacaoParaAgregacaoPcp,
  type RequisitoCoberturaProjetoPcp,
} from "./calcularTerminoIntegralProjetoPcp";

function op(parcial: Partial<OperacaoParaAgregacaoPcp> & { opId: string; ofId: string }): OperacaoParaAgregacaoPcp {
  return { status: "concluida", dataFimPrevista: "2026-10-21", ...parcial };
}

describe("calcularTerminoOperacoesProgramadasPcp", () => {
  it("array vazio -> null", () => {
    expect(calcularTerminoOperacoesProgramadasPcp([])).toBeNull();
  });

  it("1 operacao concluida -> sua propria data", () => {
    expect(calcularTerminoOperacoesProgramadasPcp([op({ opId: "op1", ofId: "of1", dataFimPrevista: "2026-10-25" })])).toBe("2026-10-25");
  });

  it("operacao bloqueada_por_deficit COM dataFimPrevista preenchida (termino parcial) -> null, campo ignorado (regra do proprietario)", () => {
    expect(
      calcularTerminoOperacoesProgramadasPcp([
        op({ opId: "op1", ofId: "of1", status: "bloqueada_por_deficit", dataFimPrevista: "2026-10-23" }),
      ]),
    ).toBeNull();
  });

  it("operacao bloqueada_por_predecessora -> null", () => {
    expect(
      calcularTerminoOperacoesProgramadasPcp([
        op({ opId: "op1", ofId: "of1", status: "bloqueada_por_predecessora", dataFimPrevista: null }),
      ]),
    ).toBeNull();
  });

  it("mistura concluida + nao-concluida -> null (qualquer uma invalida o agregado)", () => {
    expect(
      calcularTerminoOperacoesProgramadasPcp([
        op({ opId: "op1", ofId: "of1", dataFimPrevista: "2026-10-21" }),
        op({ opId: "op2", ofId: "of1", status: "bloqueada_por_deficit", dataFimPrevista: null }),
      ]),
    ).toBeNull();
  });

  it("todas concluidas -> MAX das datas", () => {
    expect(
      calcularTerminoOperacoesProgramadasPcp([
        op({ opId: "op1", ofId: "of1", dataFimPrevista: "2026-10-21" }),
        op({ opId: "op2", ofId: "of1", dataFimPrevista: "2026-11-05" }),
        op({ opId: "op3", ofId: "of2", dataFimPrevista: "2026-10-30" }),
      ]),
    ).toBe("2026-11-05");
  });

  it("concluida com dataFimPrevista nula -> contrato violado, lanca erro", () => {
    expect(() => calcularTerminoOperacoesProgramadasPcp([op({ opId: "op1", ofId: "of1", dataFimPrevista: null })])).toThrow(
      /contrato violado/,
    );
  });
});

describe("verificarCoberturaIntegralProjetoPcp", () => {
  it("projeto sem OFs identificadas -> sem_base_para_previsao (nunca '0 necessarias = coberto')", () => {
    const requisito: RequisitoCoberturaProjetoPcp = { idsOfsNecessarias: [], idsOpsNecessariasPorOf: new Map() };
    expect(verificarCoberturaIntegralProjetoPcp({ requisito, operacoesPresentes: [] })).toEqual({ tipo: "sem_base_para_previsao" });
  });

  it("OF necessaria ausente por completo -> incompleta, listada em ofsAusentes", () => {
    const requisito: RequisitoCoberturaProjetoPcp = {
      idsOfsNecessarias: ["of1", "of2"],
      idsOpsNecessariasPorOf: new Map([["of1", ["op1"]], ["of2", ["op2"]]]),
    };
    const resultado = verificarCoberturaIntegralProjetoPcp({
      requisito,
      operacoesPresentes: [op({ opId: "op1", ofId: "of1" })],
    });
    expect(resultado).toEqual({ tipo: "incompleta", ofsAusentes: ["of2"], opsAusentesPorOf: new Map() });
  });

  it("OF presente mas com OP necessaria ausente -> incompleta, listada em opsAusentesPorOf (nunca em ofsAusentes)", () => {
    const requisito: RequisitoCoberturaProjetoPcp = {
      idsOfsNecessarias: ["of1"],
      idsOpsNecessariasPorOf: new Map([["of1", ["op1", "op2"]]]),
    };
    const resultado = verificarCoberturaIntegralProjetoPcp({
      requisito,
      operacoesPresentes: [op({ opId: "op1", ofId: "of1" })],
    });
    expect(resultado).toEqual({ tipo: "incompleta", ofsAusentes: [], opsAusentesPorOf: new Map([["of1", ["op2"]]]) });
  });

  it("cobertura completa - todas as OFs e OPs necessarias presentes", () => {
    const requisito: RequisitoCoberturaProjetoPcp = {
      idsOfsNecessarias: ["of1"],
      idsOpsNecessariasPorOf: new Map([["of1", ["op1", "op2"]]]),
    };
    const resultado = verificarCoberturaIntegralProjetoPcp({
      requisito,
      operacoesPresentes: [op({ opId: "op1", ofId: "of1" }), op({ opId: "op2", ofId: "of1" })],
    });
    expect(resultado).toEqual({ tipo: "completa" });
  });
});

describe("calcularTerminoIntegralProjetoPcp", () => {
  const requisitoBase: RequisitoCoberturaProjetoPcp = {
    idsOfsNecessarias: ["of1"],
    idsOpsNecessariasPorOf: new Map([["of1", ["op1"]]]),
  };

  it("cobertura incompleta -> propaga incompleta, nunca calcula termino", () => {
    const resultado = calcularTerminoIntegralProjetoPcp({ requisito: requisitoBase, operacoesPresentes: [] });
    expect(resultado).toEqual({ cobertura: "incompleta", ofsAusentes: ["of1"], opsAusentesPorOf: new Map() });
  });

  it("cobertura completa, operacao parcialmente alocada com data preenchida -> termino null (nunca usa o termino parcial)", () => {
    const resultado = calcularTerminoIntegralProjetoPcp({
      requisito: requisitoBase,
      operacoesPresentes: [op({ opId: "op1", ofId: "of1", status: "bloqueada_por_deficit", dataFimPrevista: "2026-10-23" })],
    });
    expect(resultado).toEqual({ cobertura: "completa", termino: null });
  });

  it("cobertura completa, tudo concluido -> termino real", () => {
    const resultado = calcularTerminoIntegralProjetoPcp({
      requisito: requisitoBase,
      operacoesPresentes: [op({ opId: "op1", ofId: "of1", dataFimPrevista: "2026-11-10" })],
    });
    expect(resultado).toEqual({ cobertura: "completa", termino: "2026-11-10" });
  });
});

describe("decidirAtrasoProjetoPcp", () => {
  it("sem_base_para_previsao propaga", () => {
    expect(decidirAtrasoProjetoPcp({ terminoIntegral: { cobertura: "sem_base_para_previsao" }, dataObjetivo: "2026-11-01" })).toBe(
      "sem_base_para_previsao",
    );
  });

  it("cobertura incompleta -> cobertura_incompleta (nunca rebaixado para 'sem conclusao')", () => {
    expect(
      decidirAtrasoProjetoPcp({
        terminoIntegral: { cobertura: "incompleta", ofsAusentes: ["of9"], opsAusentesPorOf: new Map() },
        dataObjetivo: "2026-11-01",
      }),
    ).toBe("cobertura_incompleta");
  });

  it("cobertura completa, termino null -> sem_conclusao_integral_prevista", () => {
    expect(decidirAtrasoProjetoPcp({ terminoIntegral: { cobertura: "completa", termino: null }, dataObjetivo: "2026-11-01" })).toBe(
      "sem_conclusao_integral_prevista",
    );
  });

  it("cobertura completa, termino presente, data_objetivo nula -> prazo_indeterminado", () => {
    expect(decidirAtrasoProjetoPcp({ terminoIntegral: { cobertura: "completa", termino: "2026-11-05" }, dataObjetivo: null })).toBe(
      "prazo_indeterminado",
    );
  });

  it("termino > objetivo -> atrasado", () => {
    expect(decidirAtrasoProjetoPcp({ terminoIntegral: { cobertura: "completa", termino: "2026-11-10" }, dataObjetivo: "2026-11-01" })).toBe(
      "atrasado",
    );
  });

  it("termino EXATAMENTE IGUAL ao objetivo -> dentro_do_prazo (nunca atrasado em igualdade)", () => {
    expect(decidirAtrasoProjetoPcp({ terminoIntegral: { cobertura: "completa", termino: "2026-11-01" }, dataObjetivo: "2026-11-01" })).toBe(
      "dentro_do_prazo",
    );
  });

  it("termino < objetivo -> dentro_do_prazo", () => {
    expect(decidirAtrasoProjetoPcp({ terminoIntegral: { cobertura: "completa", termino: "2026-10-20" }, dataObjetivo: "2026-11-01" })).toBe(
      "dentro_do_prazo",
    );
  });
});
