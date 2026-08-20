import { describe, expect, it } from "vitest";
import {
  invalidarConfiguracaoForaDeEscopo,
  recursosCompativeisDeNecessidades,
  recursosOriginaisDeNecessidades,
} from "./derivarRecursosConfiguracaoCapacidade";
import type { NecessidadeCapacidadeFlexivel } from "./necessidadeCapacidadeFlexivel";

function necessidade(overrides: Partial<NecessidadeCapacidadeFlexivel>): NecessidadeCapacidadeFlexivel {
  return {
    empresaId: "empresa-1",
    projetoId: "projeto-1",
    projetoItemId: "item-1",
    chaveTrabalho: "chave-1",
    recursoOriginalId: "recurso-1",
    recursosCompativeisPorPrioridade: [],
    horasNecessariasPadrao: 1,
    disponivelAPartirDe: "2026-08-18",
    ...overrides,
  };
}

describe("recursosOriginaisDeNecessidades", () => {
  it("projeto 260011 - mostra só os 3 recursos originais do produto principal, nunca os do subconjunto", () => {
    // necessidadesOrcamentoNovo já vem filtrada pela Etapa C
    // (carregarNecessidadesOrcamentoNovo.ts exclui subconjuntos por
    // padrão) - esta função nunca vê SOLD-001/PINT-001/CAL-001 aqui,
    // exatamente como no dado real do projeto 260011.
    const necessidades = [
      necessidade({ chaveTrabalho: "op-1", recursoOriginalId: "cp-001" }),
      necessidade({ chaveTrabalho: "op-2", recursoOriginalId: "fcnc-007" }),
      necessidade({ chaveTrabalho: "op-3", recursoOriginalId: "fer-001" }),
    ];

    expect(recursosOriginaisDeNecessidades(necessidades)).toEqual(["cp-001", "fcnc-007", "fer-001"]);
  });

  it("duas OPs usando o mesmo recurso - aparece uma única opção", () => {
    const necessidades = [
      necessidade({ chaveTrabalho: "op-1", recursoOriginalId: "cp-001" }),
      necessidade({ chaveTrabalho: "op-2", recursoOriginalId: "cp-001" }),
    ];

    expect(recursosOriginaisDeNecessidades(necessidades)).toEqual(["cp-001"]);
  });

  it("simulação própria de subconjunto (raiz trocada) - mostra os recursos próprios dele, sem exceção de código", () => {
    // Mesma função, chamada com as necessidades de uma chamada SEPARADA
    // (produtoRaizId = subconjunto) - nenhuma lógica especial para
    // reconhecer "é um subconjunto", só o conteúdo das necessidades muda.
    const necessidadesDoSubconjunto = [
      necessidade({ chaveTrabalho: "op-sub-1", recursoOriginalId: "sold-001" }),
      necessidade({ chaveTrabalho: "op-sub-2", recursoOriginalId: "pint-001" }),
    ];

    expect(recursosOriginaisDeNecessidades(necessidadesDoSubconjunto)).toEqual(["pint-001", "sold-001"]);
  });

  it("lista vazia quando não há necessidades", () => {
    expect(recursosOriginaisDeNecessidades([])).toEqual([]);
  });
});

describe("recursosCompativeisDeNecessidades", () => {
  it("recurso compatível externo ao roteiro não aparece como original, mas aparece como compatível", () => {
    const necessidades = [
      necessidade({ recursoOriginalId: "cp-001", recursosCompativeisPorPrioridade: ["cp-002"] }),
    ];

    expect(recursosOriginaisDeNecessidades(necessidades)).toEqual(["cp-001"]);
    expect(recursosCompativeisDeNecessidades(necessidades).has("cp-002")).toBe(true);
    expect(recursosCompativeisDeNecessidades(necessidades).has("cp-001")).toBe(false);
  });

  it("une compatíveis de várias necessidades sem duplicata", () => {
    const necessidades = [
      necessidade({ chaveTrabalho: "op-1", recursoOriginalId: "cp-001", recursosCompativeisPorPrioridade: ["cp-002", "cp-003"] }),
      necessidade({ chaveTrabalho: "op-2", recursoOriginalId: "fer-001", recursosCompativeisPorPrioridade: ["cp-002"] }),
    ];

    const compativeis = recursosCompativeisDeNecessidades(necessidades);
    expect([...compativeis].sort()).toEqual(["cp-002", "cp-003"]);
  });
});

interface RegraTeste {
  id: string;
  recursoId: string;
}

describe("invalidarConfiguracaoForaDeEscopo", () => {
  it("mudança da base invalida regra já configurada para recurso que saiu do escopo", () => {
    // Cenário: regra configurada para SOLD-001 (alternativo válido na
    // base antiga); depois de trocar de base/projeto, SOLD-001 não é
    // mais original nem compatível - a regra não pode continuar valendo.
    const configuracao = {
      recursosAlternativos: ["sold-001"],
      regras: [{ id: "regra-1", recursoId: "sold-001" } satisfies RegraTeste],
    };

    const resultado = invalidarConfiguracaoForaDeEscopo(configuracao, ["cp-001", "fcnc-007", "fer-001"], new Set());

    expect(resultado.recursosAlternativos).toEqual([]);
    expect(resultado.regras).toEqual([]);
  });

  it("mantém regra de recurso original mesmo sem estar em recursosCompativeis", () => {
    const configuracao = {
      recursosAlternativos: [] as string[],
      regras: [{ id: "regra-1", recursoId: "cp-001" } satisfies RegraTeste],
    };

    const resultado = invalidarConfiguracaoForaDeEscopo(configuracao, ["cp-001"], new Set());

    expect(resultado.regras).toEqual(configuracao.regras);
  });

  it("mantém alternativo e regra ainda dentro do escopo", () => {
    const configuracao = {
      recursosAlternativos: ["cp-002"],
      regras: [{ id: "regra-1", recursoId: "cp-002" } satisfies RegraTeste],
    };

    const resultado = invalidarConfiguracaoForaDeEscopo(configuracao, ["cp-001"], new Set(["cp-002"]));

    expect(resultado.recursosAlternativos).toEqual(["cp-002"]);
    expect(resultado.regras).toEqual(configuracao.regras);
  });

  it("devolve a mesma referência quando nada muda (permite ao chamador pular o setState)", () => {
    const configuracao = {
      recursosAlternativos: ["cp-002"],
      regras: [{ id: "regra-1", recursoId: "cp-001" } satisfies RegraTeste],
    };

    const resultado = invalidarConfiguracaoForaDeEscopo(configuracao, ["cp-001"], new Set(["cp-002"]));

    expect(resultado).toBe(configuracao);
  });
});
