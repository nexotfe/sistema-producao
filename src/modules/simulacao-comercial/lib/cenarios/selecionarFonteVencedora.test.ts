import { describe, expect, it } from "vitest";
import { selecionarFonteVencedora } from "./selecionarFonteVencedora";
import type { CompromissoGranular, CoberturaIntegralPcp } from "./compromissoCapacidade";

function granular(overrides: Partial<CompromissoGranular> = {}): CompromissoGranular {
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    projetoItemId: null,
    chaveTrabalho: "projeto-1::recurso-A",
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

describe("selecionarFonteVencedora", () => {
  it("sem nenhum granular: vencedores e diagnosticos vazios", () => {
    const resultado = selecionarFonteVencedora({ granulares: [], coberturasIntegrais: [] });
    expect(resultado).toEqual({ vencedores: [], diagnosticos: [] });
  });

  it("só snapshot_comercial (sem pcp_real para o trio): vence integralmente, sem diagnóstico", () => {
    const g = granular();
    const resultado = selecionarFonteVencedora({ granulares: [g], coberturasIntegrais: [] });
    expect(resultado.vencedores).toEqual([g]);
    expect(resultado.diagnosticos).toEqual([]);
  });

  it("só pcp_real (sem snapshot_comercial para o trio): vence integralmente, sem diagnóstico", () => {
    const g = granular({ origem: "pcp_real", chaveTrabalho: "projeto-1::op-5", projetoItemId: "item-1" });
    const resultado = selecionarFonteVencedora({ granulares: [g], coberturasIntegrais: [] });
    expect(resultado.vencedores).toEqual([g]);
    expect(resultado.diagnosticos).toEqual([]);
  });

  it("orcamento_novo nunca disputa - vence sem condição, mesmo coexistindo com snapshot/pcp do mesmo projeto/recurso", () => {
    const snapshot = granular();
    const novo = granular({ origem: "orcamento_novo", classeFila: "orcamento_novo", dataEntradaFila: null, chaveTrabalho: "projeto-1::op-novo", projetoItemId: "item-novo" });
    const resultado = selecionarFonteVencedora({ granulares: [snapshot, novo], coberturasIntegrais: [] });
    expect(resultado.vencedores).toContainEqual(snapshot);
    expect(resultado.vencedores).toContainEqual(novo);
    expect(resultado.diagnosticos).toEqual([]);
  });

  it("PCP granular substitui snapshot granular quando a chaveTrabalho bate exatamente", () => {
    const snapshot = granular({ chaveTrabalho: "chave-granular-comum" });
    const pcp = granular({ origem: "pcp_real", chaveTrabalho: "chave-granular-comum", projetoItemId: "item-1", horasRestantesPadrao: 4 });
    const resultado = selecionarFonteVencedora({ granulares: [snapshot, pcp], coberturasIntegrais: [] });
    expect(resultado.vencedores).toEqual([pcp]);
    expect(resultado.diagnosticos).toEqual([]);
  });

  it("PCP parcial (chave não bate) sem declaração de cobertura integral: granularidade_insuficiente, nunca soma, nunca descarta o snapshot", () => {
    const snapshot = granular({ chaveTrabalho: "projeto-1::recurso-A" }); // chave agregada, típica do snapshot hoje
    const pcp = granular({ origem: "pcp_real", chaveTrabalho: "op-especifica-1", projetoItemId: "item-1", horasRestantesPadrao: 3 });
    const resultado = selecionarFonteVencedora({ granulares: [snapshot, pcp], coberturasIntegrais: [] });

    expect(resultado.vencedores).toEqual([]); // nenhuma das duas entra - ambíguo
    expect(resultado.diagnosticos).toHaveLength(1);
    expect(resultado.diagnosticos[0]).toMatchObject({ empresaId: "empresa-1", projetoId: "projeto-1", recursoId: "recurso-A" });
    expect(resultado.diagnosticos[0].motivo).toMatch(/cobertura integral/);
  });

  it("PCP declara cobertura integral do trio: vence o restante, snapshot restante é descartado (nunca somado)", () => {
    const snapshot = granular({ chaveTrabalho: "projeto-1::recurso-A" });
    const pcp = granular({ origem: "pcp_real", chaveTrabalho: "op-especifica-1", projetoItemId: "item-1", horasRestantesPadrao: 3 });
    const cobertura: CoberturaIntegralPcp = { empresaId: "empresa-1", projetoId: "projeto-1", recursoId: "recurso-A" };

    const resultado = selecionarFonteVencedora({ granulares: [snapshot, pcp], coberturasIntegrais: [cobertura] });

    expect(resultado.vencedores).toEqual([pcp]);
    expect(resultado.vencedores).not.toContainEqual(snapshot);
    expect(resultado.diagnosticos).toEqual([]);
  });

  it("declaração de cobertura integral precisa coincidir exatamente em empresa, projeto e recurso - recurso diferente não cobre", () => {
    const snapshot = granular({ chaveTrabalho: "projeto-1::recurso-A", recursoId: "recurso-A" });
    const pcp = granular({ origem: "pcp_real", chaveTrabalho: "op-especifica-1", projetoItemId: "item-1", recursoId: "recurso-A" });
    const coberturaDeOutroRecurso: CoberturaIntegralPcp = { empresaId: "empresa-1", projetoId: "projeto-1", recursoId: "recurso-B" };

    const resultado = selecionarFonteVencedora({ granulares: [snapshot, pcp], coberturasIntegrais: [coberturaDeOutroRecurso] });

    expect(resultado.vencedores).toEqual([]);
    expect(resultado.diagnosticos).toHaveLength(1);
  });

  it("mistura: parte casa por chave granular, parte fica ambígua - só a parte casada vence, o resto vira diagnóstico", () => {
    const snapshotCasado = granular({ chaveTrabalho: "chave-comum" });
    const snapshotSobrando = granular({ chaveTrabalho: "chave-so-do-snapshot", horasRestantesPadrao: 5 });
    const pcpCasado = granular({ origem: "pcp_real", chaveTrabalho: "chave-comum", projetoItemId: "item-1" });

    const resultado = selecionarFonteVencedora({
      granulares: [snapshotCasado, snapshotSobrando, pcpCasado],
      coberturasIntegrais: [],
    });

    expect(resultado.vencedores).toEqual([pcpCasado]); // substituição individual segura
    expect(resultado.diagnosticos).toHaveLength(1); // o restante (snapshotSobrando) é ambíguo
  });

  it("confirmado sem dataEntradaFila é rejeitado (nunca fabrica uma data)", () => {
    const invalido = granular({ classeFila: "confirmado", dataEntradaFila: null });
    expect(() => selecionarFonteVencedora({ granulares: [invalido], coberturasIntegrais: [] })).toThrow(/dataEntradaFila/);
  });

  it("orcamento_novo aceita dataEntradaFila=null sem lançar erro", () => {
    const novo = granular({ classeFila: "orcamento_novo", origem: "orcamento_novo", dataEntradaFila: null });
    expect(() => selecionarFonteVencedora({ granulares: [novo], coberturasIntegrais: [] })).not.toThrow();
  });

  describe("auditoria - horas finitas e maiores que zero", () => {
    it.each([0, -5, NaN, Infinity, -Infinity])("rejeita horasRestantesPadrao=%s", (horas) => {
      const invalido = granular({ horasRestantesPadrao: horas });
      expect(() => selecionarFonteVencedora({ granulares: [invalido], coberturasIntegrais: [] })).toThrow(/horasRestantesPadrao/);
    });
  });

  describe("auditoria - datas ISO válidas", () => {
    it("rejeita disponivelAPartirDe inválida", () => {
      const invalido = granular({ disponivelAPartirDe: "31/12/2026" });
      expect(() => selecionarFonteVencedora({ granulares: [invalido], coberturasIntegrais: [] })).toThrow(/disponivelAPartirDe/);
    });

    it("rejeita dataEntradaFila inválida quando presente", () => {
      const invalido = granular({ dataEntradaFila: "2026-13-40" });
      expect(() => selecionarFonteVencedora({ granulares: [invalido], coberturasIntegrais: [] })).toThrow(/dataEntradaFila/);
    });
  });

  describe("auditoria - duplicados nunca somam carga duas vezes", () => {
    it("rejeita a mesma (origem, chaveTrabalho) reportada duas vezes pelo mesmo carregador", () => {
      const a = granular({ chaveTrabalho: "op-repetida" });
      const b = granular({ chaveTrabalho: "op-repetida", horasRestantesPadrao: 999 });
      expect(() => selecionarFonteVencedora({ granulares: [a, b], coberturasIntegrais: [] })).toThrow(/duplicada/);
    });

    it("a mesma chaveTrabalho em origens DIFERENTES não é duplicata - é o caso normal de disputa snapshot×PCP", () => {
      const snapshot = granular({ chaveTrabalho: "chave-comum", origem: "snapshot_comercial" });
      const pcp = granular({ chaveTrabalho: "chave-comum", origem: "pcp_real", projetoItemId: "item-1" });
      expect(() => selecionarFonteVencedora({ granulares: [snapshot, pcp], coberturasIntegrais: [] })).not.toThrow();
    });
  });

  describe("auditoria - empresa diferente nunca agregada ou deduplicada junto", () => {
    it("mesma chaveTrabalho, mesmo projetoId/recursoId, empresaId DIFERENTE: nunca substitui/deduplica - as duas vencem, cada uma no seu trio", () => {
      const empresaA = granular({ empresaId: "empresa-A", chaveTrabalho: "chave-comum", origem: "snapshot_comercial" });
      const empresaB = granular({ empresaId: "empresa-B", chaveTrabalho: "chave-comum", origem: "pcp_real", projetoItemId: "item-1" });

      const resultado = selecionarFonteVencedora({ granulares: [empresaA, empresaB], coberturasIntegrais: [] });

      expect(resultado.vencedores).toContainEqual(empresaA);
      expect(resultado.vencedores).toContainEqual(empresaB);
      expect(resultado.diagnosticos).toEqual([]); // nunca tratadas como o mesmo trio em disputa
    });

    it("cobertura integral de uma empresa nunca descarta o snapshot de outra empresa com o mesmo projetoId/recursoId", () => {
      const snapshotEmpresaA = granular({ empresaId: "empresa-A", chaveTrabalho: "projeto-1::recurso-A" });
      const pcpEmpresaA = granular({ empresaId: "empresa-A", chaveTrabalho: "op-especifica", origem: "pcp_real", projetoItemId: "item-1" });
      const snapshotEmpresaB = granular({ empresaId: "empresa-B", chaveTrabalho: "projeto-1::recurso-A" });
      const coberturaDaEmpresaA: CoberturaIntegralPcp = { empresaId: "empresa-A", projetoId: "projeto-1", recursoId: "recurso-A" };

      const resultado = selecionarFonteVencedora({
        granulares: [snapshotEmpresaA, pcpEmpresaA, snapshotEmpresaB],
        coberturasIntegrais: [coberturaDaEmpresaA],
      });

      expect(resultado.vencedores).toContainEqual(snapshotEmpresaB); // intocado - cobertura era só da empresa A
      expect(resultado.vencedores).not.toContainEqual(snapshotEmpresaA); // coberto pela declaração da empresa A
    });
  });

  describe("auditoria - nenhuma mutação dos arrays/objetos recebidos", () => {
    it("não muta os granulares nem o array de entrada, mesmo quando congelados pelo chamador", () => {
      const g1 = Object.freeze(granular({ chaveTrabalho: "op-1" }));
      const g2 = Object.freeze(granular({ chaveTrabalho: "op-2", origem: "pcp_real", projetoItemId: "item-1" }));
      const granulares = Object.freeze([g1, g2]);
      const coberturasIntegrais = Object.freeze([]);

      expect(() => selecionarFonteVencedora({ granulares, coberturasIntegrais })).not.toThrow();
      // congelados com Object.freeze: qualquer mutação real (em strict mode/ESM) teria lançado TypeError acima.
    });
  });
});
