import { describe, expect, it } from "vitest";
import { agregarCompromissosPorRecurso } from "./agregarCompromissosPorRecurso";
import type { CompromissoGranular } from "./compromissoCapacidade";

function granular(overrides: Partial<CompromissoGranular> = {}): CompromissoGranular {
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    projetoItemId: null,
    chaveTrabalho: "projeto-1::recurso-A::op-1",
    recursoId: "recurso-A",
    horasRestantesPadrao: 10,
    disponivelAPartirDe: "2026-09-01",
    dataEntradaFila: "2026-08-20",
    prioridade: 0,
    classeFila: "confirmado",
    origem: "snapshot_comercial",
    ...overrides,
  };
}

describe("agregarCompromissosPorRecurso", () => {
  it("lista vazia -> resultado vazio", () => {
    expect(agregarCompromissosPorRecurso([])).toEqual([]);
  });

  it("duas operações com todos os metadados de fila iguais são agregadas em 1 bloco só, horas somadas", () => {
    const g1 = granular({ chaveTrabalho: "op-1", horasRestantesPadrao: 10 });
    const g2 = granular({ chaveTrabalho: "op-2", horasRestantesPadrao: 6 });

    const resultado = agregarCompromissosPorRecurso([g1, g2]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].horasRestantesPadrao).toBe(16);
    expect(resultado[0].chavesTrabalhoOrigem).toEqual(["op-1", "op-2"]);
  });

  it("duas operações do mesmo projeto/recurso com disponibilidades DIFERENTES permanecem em dois blocos separados - nunca somadas", () => {
    const disponivelJa = granular({ chaveTrabalho: "op-ja", disponivelAPartirDe: "2026-08-01", horasRestantesPadrao: 10 });
    const disponivelDepois = granular({ chaveTrabalho: "op-futura", disponivelAPartirDe: "2026-10-01", horasRestantesPadrao: 6 });

    const resultado = agregarCompromissosPorRecurso([disponivelJa, disponivelDepois]);

    expect(resultado).toHaveLength(2);
    const horas = resultado.map((r) => r.horasRestantesPadrao).sort((a, b) => a - b);
    expect(horas).toEqual([6, 10]); // nunca 16 - as horas futuras nunca são antecipadas pela agregação
  });

  it("chaveOrdenacao diferencia segmentos com dataEntradaFila distintas, mesmo (projeto,recurso) e mesma disponibilidade", () => {
    const entrouCedo = granular({ chaveTrabalho: "op-a", dataEntradaFila: "2026-08-01" });
    const entrouDepois = granular({ chaveTrabalho: "op-b", dataEntradaFila: "2026-08-15" });

    const resultado = agregarCompromissosPorRecurso([entrouCedo, entrouDepois]);

    expect(resultado).toHaveLength(2);
    expect(resultado[0].chaveOrdenacao).not.toBe(resultado[1].chaveOrdenacao);
  });

  it("chaveOrdenacao é determinística e independente da ordem de entrada do array", () => {
    const a = granular({ chaveTrabalho: "op-a" });
    const b = granular({ chaveTrabalho: "op-b", disponivelAPartirDe: "2026-10-01" });

    const ordem1 = agregarCompromissosPorRecurso([a, b]);
    const ordem2 = agregarCompromissosPorRecurso([b, a]);

    const chavesOrdem1 = ordem1.map((r) => r.chaveOrdenacao).sort();
    const chavesOrdem2 = ordem2.map((r) => r.chaveOrdenacao).sort();
    expect(chavesOrdem1).toEqual(chavesOrdem2);
  });

  it("orcamento_novo com dataEntradaFila=null forma sua própria chave, distinta de confirmados", () => {
    const confirmado = granular();
    const novo = granular({
      chaveTrabalho: "op-novo",
      classeFila: "orcamento_novo",
      origem: "orcamento_novo",
      dataEntradaFila: null,
    });

    const resultado = agregarCompromissosPorRecurso([confirmado, novo]);

    expect(resultado).toHaveLength(2);
    const blocoNovo = resultado.find((r) => r.classeFila === "orcamento_novo")!;
    expect(blocoNovo.dataEntradaFila).toBeNull();
    expect(blocoNovo.origem).toBe("orcamento_novo");
  });

  it("origem única no bloco é preservada; origem mista (snapshot_comercial + pcp_real no mesmo bloco de agregação) vira 'misto'", () => {
    const snapshot = granular({ chaveTrabalho: "op-snap", origem: "snapshot_comercial" });
    const pcp = granular({ chaveTrabalho: "op-pcp", origem: "pcp_real" });

    const resultado = agregarCompromissosPorRecurso([snapshot, pcp]);

    expect(resultado).toHaveLength(1); // mesma classeFila/prioridade/dataEntradaFila/disponivelAPartirDe -> 1 bloco só
    expect(resultado[0].origem).toBe("misto");
  });

  it("chavesTrabalhoOrigem preserva a proveniência para auditoria, mas nunca é usada para decidir agregação", () => {
    const g1 = granular({ chaveTrabalho: "op-x" });
    const g2 = granular({ chaveTrabalho: "op-y" });

    const resultado = agregarCompromissosPorRecurso([g1, g2]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].chavesTrabalhoOrigem).toEqual(["op-x", "op-y"]);
  });

  describe("auditoria - horas finitas e maiores que zero", () => {
    it.each([0, -3, NaN, Infinity])("rejeita horasRestantesPadrao=%s", (horas) => {
      const invalido = granular({ horasRestantesPadrao: horas });
      expect(() => agregarCompromissosPorRecurso([invalido])).toThrow(/horasRestantesPadrao/);
    });
  });

  describe("auditoria - datas ISO válidas", () => {
    it("rejeita disponivelAPartirDe inválida", () => {
      const invalido = granular({ disponivelAPartirDe: "não é uma data" });
      expect(() => agregarCompromissosPorRecurso([invalido])).toThrow(/disponivelAPartirDe/);
    });

    it("rejeita dataEntradaFila inválida quando presente", () => {
      const invalido = granular({ dataEntradaFila: "2026-02-30" }); // 30 de fevereiro não existe
      expect(() => agregarCompromissosPorRecurso([invalido])).toThrow(/dataEntradaFila/);
    });
  });

  describe("auditoria - duplicados nunca somam carga duas vezes", () => {
    it("rejeita a mesma (origem, chaveTrabalho) reportada duas vezes", () => {
      const a = granular({ chaveTrabalho: "op-repetida" });
      const b = granular({ chaveTrabalho: "op-repetida", horasRestantesPadrao: 999 });
      expect(() => agregarCompromissosPorRecurso([a, b])).toThrow(/duplicada/);
    });
  });

  describe("auditoria - empresa diferente nunca agregada junto", () => {
    it("mesmo projetoId/recursoId e demais metadados de fila iguais, empresaId DIFERENTE: nunca soma no mesmo bloco", () => {
      const empresaA = granular({ empresaId: "empresa-A", chaveTrabalho: "op-a", horasRestantesPadrao: 10 });
      const empresaB = granular({ empresaId: "empresa-B", chaveTrabalho: "op-b", horasRestantesPadrao: 10 });

      const resultado = agregarCompromissosPorRecurso([empresaA, empresaB]);

      expect(resultado).toHaveLength(2);
      expect(resultado.every((r) => r.horasRestantesPadrao === 10)).toBe(true); // nunca 20 - empresas nunca se somam
      const empresas = resultado.map((r) => r.empresaId).sort();
      expect(empresas).toEqual(["empresa-A", "empresa-B"]);
    });

    it("MESMA chaveTrabalho entre empresas diferentes (chave agregada coincidente) não é tratada como duplicata nem soma junto", () => {
      const empresaA = granular({ empresaId: "empresa-A", chaveTrabalho: "projeto-1::recurso-A", horasRestantesPadrao: 10 });
      const empresaB = granular({ empresaId: "empresa-B", chaveTrabalho: "projeto-1::recurso-A", horasRestantesPadrao: 7 });

      const resultado = agregarCompromissosPorRecurso([empresaA, empresaB]);

      expect(resultado).toHaveLength(2);
      const horas = resultado.map((r) => r.horasRestantesPadrao).sort((a, b) => a - b);
      expect(horas).toEqual([7, 10]); // nunca 17
    });
  });

  describe("auditoria - nenhuma mutação dos arrays/objetos recebidos", () => {
    it("não muta os vencedores nem o array de entrada, mesmo quando congelados pelo chamador", () => {
      const g1 = Object.freeze(granular({ chaveTrabalho: "op-1" }));
      const g2 = Object.freeze(granular({ chaveTrabalho: "op-2" }));
      const vencedores = Object.freeze([g1, g2]);

      expect(() => agregarCompromissosPorRecurso(vencedores)).not.toThrow();
    });
  });
});
