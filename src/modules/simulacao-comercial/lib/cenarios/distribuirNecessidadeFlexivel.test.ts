import { describe, expect, it } from "vitest";
import { distribuirNecessidadeFlexivel } from "./distribuirNecessidadeFlexivel";
import type { NecessidadeCapacidadeFlexivel, CapacidadeNormalRecurso } from "./necessidadeCapacidadeFlexivel";
import type { CapacidadeExtraDia } from "./capacidadeDia";
import type { DecisaoRecursoTemporario } from "./avaliarCenario";
import type { RecursoTemporarioCenario } from "./recursoTemporario";

function necessidade(overrides: Partial<NecessidadeCapacidadeFlexivel> = {}): NecessidadeCapacidadeFlexivel {
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    projetoItemId: "item-1",
    chaveTrabalho: "op-1",
    recursoOriginalId: "recurso-A",
    recursosCompativeisPorPrioridade: [],
    horasNecessariasPadrao: 10,
    disponivelAPartirDe: "2026-09-01",
    ...overrides,
  };
}

function capacidade(recursoId: string, capacidadeHorasMaquinaDia: number, produtividade = 1): CapacidadeNormalRecurso {
  return { recursoId, capacidadeHorasMaquinaDia, produtividade };
}

function capacidadesMap(entradas: CapacidadeNormalRecurso[]): ReadonlyMap<string, CapacidadeNormalRecurso> {
  return new Map(entradas.map((c) => [c.recursoId, c]));
}

function gerarDatas(inicio: string, quantidade: number): string[] {
  const [ano, mes, dia] = inicio.split("-").map(Number);
  const datas: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    datas.push(new Date(Date.UTC(ano, mes - 1, dia + i)).toISOString().slice(0, 10));
  }
  return datas;
}

function extra(overrides: Partial<CapacidadeExtraDia> = {}): CapacidadeExtraDia {
  return {
    recursoId: "recurso-A",
    data: "2026-09-01",
    horasAdicionaisDisponiveis: 10,
    natureza: "hora_extra",
    elegibilidade: { escopo: "qualquer_projeto_do_cenario" },
    contratacaoId: "contrato-extra-A",
    ...overrides,
  };
}

function decisaoTemporario(overrides: Partial<RecursoTemporarioCenario> = {}, produtividadeReferencia = 1): DecisaoRecursoTemporario {
  const recursoTemporario: RecursoTemporarioCenario = {
    idTemporario: "temp-1",
    tipo: "freelancer",
    recursoReferenciaId: "recurso-A",
    disponibilidade: [{ data: "2026-09-01", horasDisponiveis: 100 }],
    contratacaoId: "contrato-temp-1",
    justificativa: "fixture",
    aplicavelAsOperacoes: [],
    ...overrides,
  };
  return { recursoTemporario, produtividadeReferencia };
}

describe("distribuirNecessidadeFlexivel", () => {
  describe("validações", () => {
    it("rejeita horasNecessariasPadrao não finita, zero ou negativa", () => {
      for (const horas of [0, -5, NaN, Infinity]) {
        expect(() =>
          distribuirNecessidadeFlexivel({
            necessidade: necessidade({ horasNecessariasPadrao: horas }),
            ehOrcamentoNovo: false,
            capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
            capacidadeExtraAutorizada: [],
            temporariosPorPrioridade: [],
            datasOrdenadas: gerarDatas("2026-09-01", 1),
          }),
        ).toThrow(/horasNecessariasPadrao/);
      }
    });

    it("rejeita data inválida (disponivelAPartirDe)", () => {
      expect(() =>
        distribuirNecessidadeFlexivel({
          necessidade: necessidade({ disponivelAPartirDe: "31/12/2026" }),
          ehOrcamentoNovo: false,
          capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
          capacidadeExtraAutorizada: [],
          temporariosPorPrioridade: [],
          datasOrdenadas: gerarDatas("2026-09-01", 1),
        }),
      ).toThrow(/disponivelAPartirDe/);
    });

    it("rejeita recursoOriginalId vazio", () => {
      expect(() =>
        distribuirNecessidadeFlexivel({
          necessidade: necessidade({ recursoOriginalId: "" }),
          ehOrcamentoNovo: false,
          capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
          capacidadeExtraAutorizada: [],
          temporariosPorPrioridade: [],
          datasOrdenadas: gerarDatas("2026-09-01", 1),
        }),
      ).toThrow(/recursoOriginalId/);
    });

    it("rejeita recurso compatível duplicado", () => {
      expect(() =>
        distribuirNecessidadeFlexivel({
          necessidade: necessidade({ recursosCompativeisPorPrioridade: ["recurso-B", "recurso-B"] }),
          ehOrcamentoNovo: false,
          capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8), capacidade("recurso-B", 8)]),
          capacidadeExtraAutorizada: [],
          temporariosPorPrioridade: [],
          datasOrdenadas: gerarDatas("2026-09-01", 1),
        }),
      ).toThrow(/duplicado/);
    });

    it("rejeita o recurso original também listado como compatível", () => {
      expect(() =>
        distribuirNecessidadeFlexivel({
          necessidade: necessidade({ recursosCompativeisPorPrioridade: ["recurso-A"] }),
          ehOrcamentoNovo: false,
          capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
          capacidadeExtraAutorizada: [],
          temporariosPorPrioridade: [],
          datasOrdenadas: gerarDatas("2026-09-01", 1),
        }),
      ).toThrow(/recursoOriginalId/);
    });

    it("rejeita candidato de capacidade duplicado em capacidadeExtraAutorizada (mesmo recurso+data+natureza)", () => {
      expect(() =>
        distribuirNecessidadeFlexivel({
          necessidade: necessidade(),
          ehOrcamentoNovo: false,
          capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
          capacidadeExtraAutorizada: [extra(), extra()],
          temporariosPorPrioridade: [],
          datasOrdenadas: gerarDatas("2026-09-01", 1),
        }),
      ).toThrow(/duplicada/);
    });

    it("rejeita idTemporario duplicado", () => {
      expect(() =>
        distribuirNecessidadeFlexivel({
          necessidade: necessidade(),
          ehOrcamentoNovo: false,
          capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
          capacidadeExtraAutorizada: [],
          temporariosPorPrioridade: [decisaoTemporario(), decisaoTemporario()],
          datasOrdenadas: gerarDatas("2026-09-01", 1),
        }),
      ).toThrow(/duplicado/);
    });

    it("rejeita produtividade inválida (0, negativa ou >1)", () => {
      for (const produtividade of [0, -1, 1.5]) {
        expect(() =>
          distribuirNecessidadeFlexivel({
            necessidade: necessidade(),
            ehOrcamentoNovo: false,
            capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8, produtividade)]),
            capacidadeExtraAutorizada: [],
            temporariosPorPrioridade: [],
            datasOrdenadas: gerarDatas("2026-09-01", 1),
          }),
        ).toThrow(/produtividade/);
      }
    });

    it("rejeita capacidadeHorasMaquinaDia negativa ou não finita", () => {
      for (const capacidadeInvalida of [-1, NaN, Infinity]) {
        expect(() =>
          distribuirNecessidadeFlexivel({
            necessidade: necessidade(),
            ehOrcamentoNovo: false,
            capacidadesNormais: capacidadesMap([capacidade("recurso-A", capacidadeInvalida)]),
            capacidadeExtraAutorizada: [],
            temporariosPorPrioridade: [],
            datasOrdenadas: gerarDatas("2026-09-01", 1),
          }),
        ).toThrow(/capacidadeHorasMaquinaDia/);
      }
    });

    it("rejeita compatível informado sem candidato correspondente em capacidadesNormais", () => {
      expect(() =>
        distribuirNecessidadeFlexivel({
          necessidade: necessidade({ recursosCompativeisPorPrioridade: ["recurso-B"] }),
          ehOrcamentoNovo: false,
          capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]), // recurso-B ausente
          capacidadeExtraAutorizada: [],
          temporariosPorPrioridade: [],
          datasOrdenadas: gerarDatas("2026-09-01", 1),
        }),
      ).toThrow(/recurso-B/);
    });

    it("rejeita capacidade adicional sem contratacaoId", () => {
      expect(() =>
        distribuirNecessidadeFlexivel({
          necessidade: necessidade(),
          ehOrcamentoNovo: false,
          capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
          capacidadeExtraAutorizada: [extra({ contratacaoId: "" })],
          temporariosPorPrioridade: [],
          datasOrdenadas: gerarDatas("2026-09-01", 1),
        }),
      ).toThrow(/contratacaoId/);
    });

    it("rejeita recurso temporário sem contratacaoId", () => {
      expect(() =>
        distribuirNecessidadeFlexivel({
          necessidade: necessidade(),
          ehOrcamentoNovo: false,
          capacidadesNormais: capacidadesMap([capacidade("recurso-A", 0)]),
          capacidadeExtraAutorizada: [],
          temporariosPorPrioridade: [decisaoTemporario({ contratacaoId: "" })],
          datasOrdenadas: gerarDatas("2026-09-01", 1),
        }),
      ).toThrow(/contratacaoId/);
    });
  });

  it("1. OP de 10h: original fornece 7h, compatível fornece só as 3h restantes", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade({ recursosCompativeisPorPrioridade: ["recurso-B"] }),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 7), capacidade("recurso-B", 8)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    });

    expect(resultado.status).toBe("concluida");
    expect(resultado.deficitResidualHorasPadrao).toBe(0);
    const porRecurso = new Map(resultado.alocacoes.map((a) => [a.recursoId, a.horasPadrao]));
    expect(porRecurso.get("recurso-A")).toBe(7);
    expect(porRecurso.get("recurso-B")).toBe(3);
  });

  it("2. compatível nunca recebe as 10h completas depois de o original já consumir 7h", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade({ recursosCompativeisPorPrioridade: ["recurso-B"] }),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 7), capacidade("recurso-B", 20)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    });

    const alocacaoB = resultado.alocacoes.find((a) => a.recursoId === "recurso-B")!;
    expect(alocacaoB.horasPadrao).toBe(3);
    expect(alocacaoB.horasPadrao).not.toBe(10);
  });

  it("3. duas máquinas compatíveis dividem apenas o saldo, seguindo a prioridade", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade({ recursosCompativeisPorPrioridade: ["recurso-B", "recurso-C"] }),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 4), capacidade("recurso-B", 3), capacidade("recurso-C", 10)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    });

    const porRecurso = new Map(resultado.alocacoes.map((a) => [a.recursoId, a.horasPadrao]));
    expect(porRecurso.get("recurso-A")).toBe(4);
    expect(porRecurso.get("recurso-B")).toBe(3);
    expect(porRecurso.get("recurso-C")).toBe(3); // 10 - 4 - 3
    expect(resultado.deficitResidualHorasPadrao).toBe(0);
  });

  it("4. recurso original com capacidade suficiente impede qualquer uso de compatível", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade({ recursosCompativeisPorPrioridade: ["recurso-B"] }),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 20), capacidade("recurso-B", 100)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    });

    expect(resultado.recursosEfetivamenteUsados).toEqual(["recurso-A"]);
    expect(resultado.alocacoes.some((a) => a.recursoId === "recurso-B")).toBe(false);
  });

  it("5. compatível sem capacidade não piora nem altera o resultado", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade({ recursosCompativeisPorPrioridade: ["recurso-B"] }),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 7), capacidade("recurso-B", 0)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    });

    expect(resultado.status).toBe("capacidade_insuficiente");
    expect(resultado.horasAlocadasPadrao).toBe(7);
    expect(resultado.deficitResidualHorasPadrao).toBe(3);
  });

  it("6. capacidade normal compatível é usada antes da hora adicional paga do original", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade({ recursosCompativeisPorPrioridade: ["recurso-B"] }),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 4), capacidade("recurso-B", 6)]),
      capacidadeExtraAutorizada: [extra({ recursoId: "recurso-A", horasAdicionaisDisponiveis: 20 })],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    });

    expect(resultado.status).toBe("concluida");
    expect(resultado.alocacoes.some((a) => a.tipoCapacidade === "adicional")).toBe(false); // normal (A+B) já cobriu tudo
    const porRecurso = new Map(resultado.alocacoes.map((a) => [a.recursoId, a.horasPadrao]));
    expect(porRecurso.get("recurso-A")).toBe(4);
    expect(porRecurso.get("recurso-B")).toBe(6);
  });

  it("7. hora adicional é usada somente depois de esgotadas as capacidades normais", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade(),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 4)]),
      capacidadeExtraAutorizada: [extra({ recursoId: "recurso-A", horasAdicionaisDisponiveis: 10 })],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    });

    expect(resultado.status).toBe("concluida");
    const normal = resultado.alocacoes.find((a) => a.tipoCapacidade === "normal_original")!;
    const adicional = resultado.alocacoes.find((a) => a.tipoCapacidade === "adicional")!;
    expect(normal.horasPadrao).toBe(4);
    expect(normal.contratacaoId).toBeNull();
    expect(adicional.horasPadrao).toBe(6);
    expect(adicional.contratacaoId).toBe("contrato-extra-A");
  });

  it("8. recurso temporário é usado somente depois da hora adicional", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade(),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 2)]),
      capacidadeExtraAutorizada: [extra({ recursoId: "recurso-A", horasAdicionaisDisponiveis: 3 })],
      temporariosPorPrioridade: [decisaoTemporario()],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    });

    expect(resultado.status).toBe("concluida");
    const porTipo = new Map(resultado.alocacoes.map((a) => [a.tipoCapacidade, a.horasPadrao]));
    expect(porTipo.get("normal_original")).toBe(2);
    expect(porTipo.get("adicional")).toBe(3);
    expect(porTipo.get("temporario")).toBe(5); // 10 - 2 - 3
    const temporario = resultado.alocacoes.find((a) => a.tipoCapacidade === "temporario")!;
    expect(temporario.recursoId).toBe("temp-1");
    expect(temporario.contratacaoId).toBe("contrato-temp-1");
  });

  it("9. sem compatibilidade, o saldo permanece como déficit", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade(),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 4)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    });

    expect(resultado.status).toBe("capacidade_insuficiente");
    expect(resultado.horasAlocadasPadrao).toBe(4);
    expect(resultado.deficitResidualHorasPadrao).toBe(6);
  });

  it("10. produtividades diferentes entre original e compatível, aplicadas uma única vez", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade({ horasNecessariasPadrao: 12, recursosCompativeisPorPrioridade: ["recurso-B"] }),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8, 1), capacidade("recurso-B", 8, 0.5)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    });

    const alocA = resultado.alocacoes.find((a) => a.recursoId === "recurso-A")!;
    const alocB = resultado.alocacoes.find((a) => a.recursoId === "recurso-B")!;
    expect(alocA.horasPadrao).toBe(8);
    expect(alocA.horasMaquina).toBe(8); // produtividade 1: horasMaquina = horasPadrao
    expect(alocB.horasPadrao).toBe(4);
    expect(alocB.horasMaquina).toBe(8); // produtividade 0,5: horasMaquina = horasPadrao / 0,5 = 8, não 2 nem 4
    expect(resultado.deficitResidualHorasPadrao).toBe(0);
  });

  it("11. soma exata: alocado + déficit = necessário (números não redondos, tolerância numérica respeitada)", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade({ horasNecessariasPadrao: 10.7 }),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 3.3)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    });

    expect(resultado.horasAlocadasPadrao + resultado.deficitResidualHorasPadrao).toBeCloseTo(10.7, 9);
  });

  it("12. ordem incidental dos candidatos (não a prioridade explícita) não altera o resultado", () => {
    const base = {
      necessidade: necessidade(),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 4)]),
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    };
    const extraA = extra({ recursoId: "recurso-A", data: "2026-09-01", natureza: "hora_extra", horasAdicionaisDisponiveis: 3, contratacaoId: "c-a" });
    const extraOutraData = extra({ recursoId: "recurso-A", data: "2026-09-02", natureza: "hora_extra", horasAdicionaisDisponiveis: 3, contratacaoId: "c-a-2" });

    const resultadoOrdemA = distribuirNecessidadeFlexivel({ ...base, capacidadeExtraAutorizada: [extraA, extraOutraData], datasOrdenadas: gerarDatas("2026-09-01", 2) });
    const resultadoOrdemB = distribuirNecessidadeFlexivel({ ...base, capacidadeExtraAutorizada: [extraOutraData, extraA], datasOrdenadas: gerarDatas("2026-09-01", 2) });

    expect(resultadoOrdemA).toEqual(resultadoOrdemB);
  });

  it("13. empate entre compatíveis (mesma capacidade) respeita a prioridade cadastrada", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade({ horasNecessariasPadrao: 5, recursosCompativeisPorPrioridade: ["recurso-B", "recurso-C"] }),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 0), capacidade("recurso-B", 10), capacidade("recurso-C", 10)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    });

    expect(resultado.recursosEfetivamenteUsados).toEqual(["recurso-B"]);
    expect(resultado.alocacoes.some((a) => a.recursoId === "recurso-C")).toBe(false);
  });

  it("14. nenhuma contaminação entre duas execuções consecutivas", () => {
    const params = {
      necessidade: necessidade({ recursosCompativeisPorPrioridade: ["recurso-B"] }),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 7), capacidade("recurso-B", 8)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    };

    const resultado1 = distribuirNecessidadeFlexivel(params);
    distribuirNecessidadeFlexivel({ ...params, necessidade: necessidade({ horasNecessariasPadrao: 999, recursosCompativeisPorPrioridade: ["recurso-B"] }) });
    const resultado2 = distribuirNecessidadeFlexivel(params);

    expect(resultado1).toEqual(resultado2);
  });

  it("15. nenhuma mutação dos objetos de entrada (necessidade, capacidades, extras, temporários congelados)", () => {
    const necessidadeCongelada = Object.freeze(necessidade({ recursosCompativeisPorPrioridade: Object.freeze(["recurso-B"]) as readonly string[] }));
    const capacidadesCongeladas = capacidadesMap([Object.freeze(capacidade("recurso-A", 7)), Object.freeze(capacidade("recurso-B", 8))]);
    const extrasCongelados = Object.freeze([Object.freeze(extra())]);
    const temporariosCongelados = Object.freeze([Object.freeze(decisaoTemporario())]);
    const datasCongeladas = Object.freeze(gerarDatas("2026-09-01", 1));

    expect(() =>
      distribuirNecessidadeFlexivel({
        necessidade: necessidadeCongelada,
        ehOrcamentoNovo: false,
        capacidadesNormais: capacidadesCongeladas,
        capacidadeExtraAutorizada: extrasCongelados,
        temporariosPorPrioridade: temporariosCongelados,
        datasOrdenadas: datasCongeladas,
      }),
    ).not.toThrow();
  });

  it("16. nenhuma alocação antes de disponivelAPartirDe", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade({ horasNecessariasPadrao: 8, disponivelAPartirDe: "2026-09-03" }),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 5),
    });

    expect(resultado.status).toBe("concluida");
    expect(resultado.alocacoes.every((a) => a.data >= "2026-09-03")).toBe(true);
  });

  it("17. faixas em datas diferentes permanecem separadas - saldo não utilizado não é carregado para o dia seguinte", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade({ horasNecessariasPadrao: 8 }),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 5)]),
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 2),
    });

    expect(resultado.status).toBe("concluida");
    const porData = new Map(resultado.alocacoes.map((a) => [a.data, a.horasPadrao]));
    expect(porData.get("2026-09-01")).toBe(5);
    expect(porData.get("2026-09-02")).toBe(3); // não 8 - cada dia tem seu próprio teto de 5h
  });

  it("18. ausência de valor-hora não é um conceito deste módulo - a alocação física (com contratacaoId) ocorre normalmente, sem nenhum campo de custo", () => {
    const resultado = distribuirNecessidadeFlexivel({
      necessidade: necessidade(),
      ehOrcamentoNovo: false,
      capacidadesNormais: capacidadesMap([capacidade("recurso-A", 4)]),
      capacidadeExtraAutorizada: [extra({ recursoId: "recurso-A", horasAdicionaisDisponiveis: 10 })],
      temporariosPorPrioridade: [],
      datasOrdenadas: gerarDatas("2026-09-01", 1),
    });

    expect(resultado.status).toBe("concluida");
    const adicional = resultado.alocacoes.find((a) => a.tipoCapacidade === "adicional")!;
    expect(adicional.contratacaoId).toBe("contrato-extra-A");
    expect(Object.keys(adicional).sort()).toEqual(
      ["chaveTrabalho", "contratacaoId", "data", "horasMaquina", "horasPadrao", "recursoId", "tipoCapacidade"].sort(),
    ); // nenhum campo de custo/valor-hora existe neste tipo - custo é responsabilidade de outra camada
  });

  describe("ordem temporal - prioridade aplicada dentro de cada data, nunca sobre o horizonte inteiro", () => {
    it("teste de regressão obrigatório: adicional do Dia 1 é usada antes de avançar para o Dia 2, mesmo com normal disponível no Dia 2", () => {
      const resultado = distribuirNecessidadeFlexivel({
        necessidade: necessidade({ horasNecessariasPadrao: 10 }),
        ehOrcamentoNovo: false,
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 8)]), // 8h normal, todo dia
        capacidadeExtraAutorizada: [extra({ recursoId: "recurso-A", data: "2026-09-01", horasAdicionaisDisponiveis: 2, contratacaoId: "c-1" })],
        temporariosPorPrioridade: [],
        datasOrdenadas: gerarDatas("2026-09-01", 2), // Dia 1 e Dia 2
      });

      expect(resultado.status).toBe("concluida");
      expect(resultado.alocacoes.every((a) => a.data === "2026-09-01")).toBe(true); // nenhuma hora no Dia 2
      const porTipo = new Map(resultado.alocacoes.map((a) => [a.tipoCapacidade, a.horasPadrao]));
      expect(porTipo.get("normal_original")).toBe(8);
      expect(porTipo.get("adicional")).toBe(2);
      expect(resultado.deficitResidualHorasPadrao).toBe(0);
    });

    it("1. Dia 1: original normal insuficiente, compatível normal disponível - usa o compatível antes da adicional do MESMO dia", () => {
      const resultado = distribuirNecessidadeFlexivel({
        necessidade: necessidade({ horasNecessariasPadrao: 10, recursosCompativeisPorPrioridade: ["recurso-B"] }),
        ehOrcamentoNovo: false,
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 3), capacidade("recurso-B", 7)]),
        capacidadeExtraAutorizada: [extra({ recursoId: "recurso-A", data: "2026-09-01", horasAdicionaisDisponiveis: 100, contratacaoId: "c-1" })],
        temporariosPorPrioridade: [],
        datasOrdenadas: gerarDatas("2026-09-01", 1),
      });

      expect(resultado.status).toBe("concluida");
      expect(resultado.alocacoes.some((a) => a.tipoCapacidade === "adicional")).toBe(false); // nunca tocada - normal (A+B) já bastou
      const porRecurso = new Map(resultado.alocacoes.map((a) => [a.recursoId, a.horasPadrao]));
      expect(porRecurso.get("recurso-A")).toBe(3);
      expect(porRecurso.get("recurso-B")).toBe(7);
    });

    it("2. Dia 1: adicional disponível; Dia 2: compatível normal disponível - usa a adicional do Dia 1 para antecipar a entrega", () => {
      const resultado = distribuirNecessidadeFlexivel({
        necessidade: necessidade({ horasNecessariasPadrao: 10, recursosCompativeisPorPrioridade: ["recurso-B"] }),
        ehOrcamentoNovo: false,
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 0), capacidade("recurso-B", 0)]), // nada de normal no Dia 1 (nem original nem compatível)
        capacidadeExtraAutorizada: [extra({ recursoId: "recurso-A", data: "2026-09-01", horasAdicionaisDisponiveis: 10, contratacaoId: "c-1" })],
        temporariosPorPrioridade: [],
        datasOrdenadas: gerarDatas("2026-09-01", 2),
      });

      expect(resultado.status).toBe("concluida");
      expect(resultado.alocacoes).toHaveLength(1);
      expect(resultado.alocacoes[0]).toMatchObject({ data: "2026-09-01", tipoCapacidade: "adicional", recursoId: "recurso-A", horasPadrao: 10 });
    });

    it("3. Dia 1: temporário disponível; Dia 2: normal disponível - usa o temporário no Dia 1 quando normal e adicional do Dia 1 são insuficientes", () => {
      const resultado = distribuirNecessidadeFlexivel({
        necessidade: necessidade({ horasNecessariasPadrao: 5 }),
        ehOrcamentoNovo: false,
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 2)]), // 2h normal, todo dia (inclusive Dia 2)
        capacidadeExtraAutorizada: [],
        temporariosPorPrioridade: [decisaoTemporario({ disponibilidade: [{ data: "2026-09-01", horasDisponiveis: 100 }] })],
        datasOrdenadas: gerarDatas("2026-09-01", 2),
      });

      expect(resultado.status).toBe("concluida");
      expect(resultado.alocacoes.every((a) => a.data === "2026-09-01")).toBe(true); // nunca chega no Dia 2
      const porTipo = new Map(resultado.alocacoes.map((a) => [a.tipoCapacidade, a.horasPadrao]));
      expect(porTipo.get("normal_original")).toBe(2);
      expect(porTipo.get("temporario")).toBe(3);
    });

    it("4. capacidade adicional não autorizada no Dia 1 nunca pode ser usada nesse dia, mesmo com déficit - só entra quando autorizada no dia certo", () => {
      const resultado = distribuirNecessidadeFlexivel({
        necessidade: necessidade({ horasNecessariasPadrao: 6 }),
        ehOrcamentoNovo: false,
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 2)]), // 2h normal/dia - insuficiente sozinho
        capacidadeExtraAutorizada: [extra({ recursoId: "recurso-A", data: "2026-09-02", horasAdicionaisDisponiveis: 5, contratacaoId: "c-dia2" })], // só autorizada no Dia 2
        temporariosPorPrioridade: [],
        datasOrdenadas: gerarDatas("2026-09-01", 2),
      });

      expect(resultado.status).toBe("concluida");
      const adicionalDia1 = resultado.alocacoes.filter((a) => a.tipoCapacidade === "adicional" && a.data === "2026-09-01");
      expect(adicionalDia1).toEqual([]); // nada autorizado no Dia 1 - nunca usada lá
      const adicionalDia2 = resultado.alocacoes.find((a) => a.tipoCapacidade === "adicional")!;
      expect(adicionalDia2.data).toBe("2026-09-02");
      expect(adicionalDia2.horasPadrao).toBe(2); // 6 - 2 (normal dia1) - 2 (normal dia2) = 2
    });

    it("5. horas não utilizadas de um dia não migram para outro, mesmo processando data por data", () => {
      const resultado = distribuirNecessidadeFlexivel({
        necessidade: necessidade({ horasNecessariasPadrao: 3 }),
        ehOrcamentoNovo: false,
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 10)]), // 10h disponíveis, só 3h necessárias
        capacidadeExtraAutorizada: [],
        temporariosPorPrioridade: [],
        datasOrdenadas: gerarDatas("2026-09-01", 2),
      });

      expect(resultado.alocacoes).toHaveLength(1);
      expect(resultado.alocacoes[0]).toMatchObject({ data: "2026-09-01", horasPadrao: 3 });
      expect(resultado.alocacoes.some((a) => a.data === "2026-09-02")).toBe(false); // as 7h sobrando do Dia 1 não "migraram" para criar uma alocação no Dia 2
    });

    it("6. soma exata das categorias somadas ao déficit é igual à necessidade, mesmo distribuída em várias datas e categorias", () => {
      const resultado = distribuirNecessidadeFlexivel({
        necessidade: necessidade({ horasNecessariasPadrao: 10 }),
        ehOrcamentoNovo: false,
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 2)]),
        capacidadeExtraAutorizada: [extra({ recursoId: "recurso-A", data: "2026-09-01", horasAdicionaisDisponiveis: 1, contratacaoId: "c-1" })],
        temporariosPorPrioridade: [decisaoTemporario({ disponibilidade: [{ data: "2026-09-01", horasDisponiveis: 1 }] })],
        datasOrdenadas: gerarDatas("2026-09-01", 3), // 2h normal/dia × 3 dias = 6h, + 1h adicional + 1h temporário = 8h; déficit = 2h
      });

      expect(resultado.status).toBe("capacidade_insuficiente");
      expect(resultado.horasAlocadasPadrao + resultado.deficitResidualHorasPadrao).toBeCloseTo(10, 9);
    });

    it("7. resultado independente da ordem incidental dos candidatos, mesmo com várias datas envolvidas", () => {
      const base = {
        necessidade: necessidade({ horasNecessariasPadrao: 10 }),
        ehOrcamentoNovo: false,
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 2)]),
        temporariosPorPrioridade: [decisaoTemporario({ idTemporario: "temp-x" })],
        datasOrdenadas: gerarDatas("2026-09-01", 3),
      };
      const extraDia1 = extra({ recursoId: "recurso-A", data: "2026-09-01", horasAdicionaisDisponiveis: 1, contratacaoId: "c-1" });
      const extraDia3 = extra({ recursoId: "recurso-A", data: "2026-09-03", horasAdicionaisDisponiveis: 1, contratacaoId: "c-3" });

      const resultadoOrdemA = distribuirNecessidadeFlexivel({ ...base, capacidadeExtraAutorizada: [extraDia1, extraDia3] });
      const resultadoOrdemB = distribuirNecessidadeFlexivel({ ...base, capacidadeExtraAutorizada: [extraDia3, extraDia1] });

      expect(resultadoOrdemA).toEqual(resultadoOrdemB);
    });

    it("8. repetir a execução com novas instâncias produz resultado idêntico, mesmo atravessando várias datas/categorias", () => {
      const params = {
        necessidade: necessidade({ horasNecessariasPadrao: 10 }),
        ehOrcamentoNovo: false,
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 3)]),
        capacidadeExtraAutorizada: [extra({ recursoId: "recurso-A", data: "2026-09-02", horasAdicionaisDisponiveis: 2, contratacaoId: "c-1" })],
        temporariosPorPrioridade: [],
        datasOrdenadas: gerarDatas("2026-09-01", 3),
      };

      const resultado1 = distribuirNecessidadeFlexivel(params);
      distribuirNecessidadeFlexivel({ ...params, necessidade: necessidade({ horasNecessariasPadrao: 500 }) }); // execução intermediária "pesada"
      const resultado2 = distribuirNecessidadeFlexivel(params);

      expect(resultado1).toEqual(resultado2);
    });

    it("9. prova explícita: a correção muda a DATA de conclusão (não só a composição das horas) - antecipa em relação ao que 3 rodadas globais produziriam", () => {
      const resultado = distribuirNecessidadeFlexivel({
        necessidade: necessidade({ horasNecessariasPadrao: 10, recursosCompativeisPorPrioridade: ["recurso-B"] }),
        ehOrcamentoNovo: false,
        // Dia 1: original sem normal, mas com adicional suficiente.
        // Dia 2: compatível teria normal suficiente (a implementação de 3
        // rodadas globais escolheria isto, terminando no Dia 2).
        capacidadesNormais: capacidadesMap([capacidade("recurso-A", 0), capacidade("recurso-B", 0)]),
        capacidadeExtraAutorizada: [extra({ recursoId: "recurso-A", data: "2026-09-01", horasAdicionaisDisponiveis: 10, contratacaoId: "c-1" })],
        temporariosPorPrioridade: [],
        datasOrdenadas: gerarDatas("2026-09-01", 2),
      });

      const dataDeConclusao = resultado.alocacoes.reduce((maior, a) => (a.data > maior ? a.data : maior), resultado.alocacoes[0].data);
      expect(dataDeConclusao).toBe("2026-09-01"); // nunca "2026-09-02" - a correção antecipa a entrega usando a adicional do Dia 1
    });
  });
});
