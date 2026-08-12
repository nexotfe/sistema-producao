import { describe, expect, it } from "vitest";
import { calcularCustoContratacoes, type Contratacao } from "./contratacao";

function contratacao(overrides: Partial<Contratacao> & { id: string }): Contratacao {
  return {
    tipo: "hora_extra",
    abrangencia: "por_hora_utilizada",
    valor: 10,
    moeda: "BRL",
    fornecedorOuContratado: "Fornecedor X",
    referenciaProposta: null,
    justificativa: "teste",
    datas: [],
    ...overrides,
  };
}

describe("calcularCustoContratacoes — fórmula por abrangência", () => {
  it("por_hora_utilizada: valor × horas realmente usadas", () => {
    const c = contratacao({ id: "CT-1", abrangencia: "por_hora_utilizada", valor: 50 });
    const resultado = calcularCustoContratacoes({
      contratacoes: [c],
      horasUsadasPorContratacaoId: new Map([["CT-1", 6]]),
    });
    expect(resultado.custoTotal).toBe(300);
    expect(resultado.custoPorContratacaoId.get("CT-1")).toBe(300);
  });

  it("por_hora_utilizada sem nenhuma hora usada (0 no mapa ou ausente): custo zero, nunca erro", () => {
    const c = contratacao({ id: "CT-1", abrangencia: "por_hora_utilizada", valor: 50 });
    const resultado = calcularCustoContratacoes({ contratacoes: [c], horasUsadasPorContratacaoId: new Map() });
    expect(resultado.custoTotal).toBe(0);
  });

  it("por_dia_contratado: valor × dias CONTRATADOS (datas.length), independente de uso", () => {
    const c = contratacao({ id: "CT-2", abrangencia: "por_dia_contratado", valor: 200, datas: ["2026-11-09", "2026-11-10", "2026-11-11"] });
    const resultado = calcularCustoContratacoes({
      contratacoes: [c],
      horasUsadasPorContratacaoId: new Map([["CT-2", 0]]), // uso real irrelevante para esta abrangência
    });
    expect(resultado.custoTotal).toBe(600);
  });

  it("por_periodo_completo: valor cobrado UMA vez, independente de datas.length", () => {
    const c = contratacao({ id: "CT-3", abrangencia: "por_periodo_completo", valor: 1000, datas: ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"] });
    const resultado = calcularCustoContratacoes({ contratacoes: [c], horasUsadasPorContratacaoId: new Map() });
    expect(resultado.custoTotal).toBe(1000);
  });

  it("valor_fixo_unico: cobrado UMA vez mesmo com múltiplas datas - nunca multiplicado (o gotcha explícito do DEC-007 §10)", () => {
    const c = contratacao({ id: "CT-4", abrangencia: "valor_fixo_unico", valor: 500, datas: ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"] });
    const resultado = calcularCustoContratacoes({ contratacoes: [c], horasUsadasPorContratacaoId: new Map() });
    expect(resultado.custoTotal).toBe(500);
  });
});

describe("calcularCustoContratacoes — custo nunca duplicado por contratação", () => {
  it("soma o custo de cada contratação da lista exatamente uma vez", () => {
    const contratacoes = [
      contratacao({ id: "CT-1", abrangencia: "valor_fixo_unico", valor: 100 }),
      contratacao({ id: "CT-2", abrangencia: "por_dia_contratado", valor: 50, datas: ["2026-11-09", "2026-11-10"] }),
      contratacao({ id: "CT-3", abrangencia: "por_hora_utilizada", valor: 20 }),
    ];
    const resultado = calcularCustoContratacoes({
      contratacoes,
      horasUsadasPorContratacaoId: new Map([["CT-3", 5]]),
    });
    // 100 + (50*2=100) + (20*5=100) = 300
    expect(resultado.custoTotal).toBe(300);
    expect(resultado.custoPorContratacaoId.size).toBe(3);
  });

  it("rejeita id duplicado na lista de contratações - nunca cobra a mesma contratação duas vezes por engano", () => {
    const contratacoes = [
      contratacao({ id: "CT-1", abrangencia: "valor_fixo_unico", valor: 100 }),
      contratacao({ id: "CT-1", abrangencia: "valor_fixo_unico", valor: 999 }), // mesmo id, valor diferente - dado inconsistente
    ];
    expect(() => calcularCustoContratacoes({ contratacoes, horasUsadasPorContratacaoId: new Map() })).toThrow(RangeError);
  });

  it("referenciar a mesma contratação várias vezes (via múltiplas alocações/faixas em outro lugar do cenário) não duplica o custo - a lista de Contratacao[] em si só tem 1 entrada por id, cobrada 1 vez", () => {
    // Simula o caso descrito no DEC-007 §10: uma contratação "valor_fixo_unico"
    // referenciada por VÁRIAS alocações diárias (várias datas de uso) - o
    // custo não deve crescer com o número de referências, só existe 1 Contratacao.
    const c = contratacao({ id: "CT-MOBILIZACAO", abrangencia: "valor_fixo_unico", valor: 800 });
    const horasUsadasSimulandoMuitoUso = new Map([["CT-MOBILIZACAO", 999]]); // mesmo com "uso" alto, não afeta valor_fixo_unico
    const resultado = calcularCustoContratacoes({ contratacoes: [c], horasUsadasPorContratacaoId: horasUsadasSimulandoMuitoUso });
    expect(resultado.custoTotal).toBe(800);
  });
});

describe("calcularCustoContratacoes — validações defensivas", () => {
  it("rejeita valor negativo", () => {
    const c = contratacao({ id: "CT-1", valor: -10 });
    expect(() => calcularCustoContratacoes({ contratacoes: [c], horasUsadasPorContratacaoId: new Map() })).toThrow(RangeError);
  });

  it("rejeita por_dia_contratado sem nenhuma data", () => {
    const c = contratacao({ id: "CT-1", abrangencia: "por_dia_contratado", valor: 10, datas: [] });
    expect(() => calcularCustoContratacoes({ contratacoes: [c], horasUsadasPorContratacaoId: new Map() })).toThrow(RangeError);
  });

  it("rejeita horasUsadasPorContratacaoId com valor negativo", () => {
    const c = contratacao({ id: "CT-1", abrangencia: "por_hora_utilizada", valor: 10 });
    expect(() => calcularCustoContratacoes({ contratacoes: [c], horasUsadasPorContratacaoId: new Map([["CT-1", -5]]) })).toThrow(RangeError);
  });

  it("rejeita data inválida (não-ISO) em datas", () => {
    const c = contratacao({ id: "CT-1", abrangencia: "por_dia_contratado", valor: 10, datas: ["09/11/2026"] });
    expect(() => calcularCustoContratacoes({ contratacoes: [c], horasUsadasPorContratacaoId: new Map() })).toThrow(RangeError);
  });

  it("rejeita data duplicada dentro de datas - nunca infla por_dia_contratado contando o mesmo dia duas vezes", () => {
    const c = contratacao({ id: "CT-1", abrangencia: "por_dia_contratado", valor: 100, datas: ["2026-11-09", "2026-11-09"] });
    expect(() => calcularCustoContratacoes({ contratacoes: [c], horasUsadasPorContratacaoId: new Map() })).toThrow(RangeError);
  });

  it("rejeita horasUsadasPorContratacaoId com chave que não corresponde a nenhuma contratação (id órfão) - nunca ignora silenciosamente", () => {
    const c = contratacao({ id: "CT-1", abrangencia: "por_hora_utilizada", valor: 10 });
    expect(() =>
      calcularCustoContratacoes({
        contratacoes: [c],
        horasUsadasPorContratacaoId: new Map([
          ["CT-1", 5],
          ["CT-ID-ERRADO", 3], // órfão - não existe em contratacoes
        ]),
      }),
    ).toThrow(RangeError);
  });

  it("rejeita custo que estoura para Infinity (valor e horas individualmente finitos, produto não finito)", () => {
    const c = contratacao({ id: "CT-1", abrangencia: "por_hora_utilizada", valor: Number.MAX_VALUE });
    expect(() =>
      calcularCustoContratacoes({
        contratacoes: [c],
        horasUsadasPorContratacaoId: new Map([["CT-1", Number.MAX_VALUE]]), // MAX_VALUE × MAX_VALUE = Infinity
      }),
    ).toThrow(RangeError);
  });

  it("rejeita custoTotal que estoura para Infinity na acumulação, mesmo com cada custo individual finito", () => {
    const contratacoes = [
      contratacao({ id: "CT-1", abrangencia: "valor_fixo_unico", valor: Number.MAX_VALUE }),
      contratacao({ id: "CT-2", abrangencia: "valor_fixo_unico", valor: Number.MAX_VALUE }),
    ];
    expect(() => calcularCustoContratacoes({ contratacoes, horasUsadasPorContratacaoId: new Map() })).toThrow(RangeError);
  });
});
