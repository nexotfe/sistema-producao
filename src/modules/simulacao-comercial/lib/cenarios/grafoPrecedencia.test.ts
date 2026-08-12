import { describe, expect, it } from "vitest";
import {
  construirGrafoOcorrencias,
  detectarCiclo,
  resolverOcorrenciasLiberadas,
  resolverPredecessoraLinear,
  type BomOperacaoRow,
  type DependenciaOcorrencia,
  type OcorrenciaComContexto,
  type SubconjuntoUsado,
  type VinculoSubconjuntoOperacaoConsumidora,
} from "./grafoPrecedencia";
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";

function op(id: string, bomId: string, ordem: number | null, overrides: Partial<BomOperacaoRow> = {}): BomOperacaoRow {
  return { id, bomId, ordem, ativo: true, deletedAt: null, ...overrides };
}

function chave(overrides: Partial<ChaveOcorrencia> = {}): ChaveOcorrencia {
  return { projetoItemId: "PI-1", produtoRaizId: "PR-1", caminhoBomItemIds: [], bomOperacaoId: "OP-X", ...overrides };
}

describe("resolverPredecessoraLinear — ordenação ativa, não ordem-1", () => {
  it("ordens espaçadas 10/20/30: predecessora de 30 é 20, de 20 é 10, 10 não tem predecessora", () => {
    const operacoes = [op("OP-10", "BOM-A", 10), op("OP-20", "BOM-A", 20), op("OP-30", "BOM-A", 30)];

    expect(resolverPredecessoraLinear(operacoes, operacoes[2])?.id).toBe("OP-20");
    expect(resolverPredecessoraLinear(operacoes, operacoes[1])?.id).toBe("OP-10");
    expect(resolverPredecessoraLinear(operacoes, operacoes[0])).toBeNull();
  });

  it("operação inativa/excluída no meio da sequência é pulada - predecessora é a ativa anterior, não a fisicamente adjacente", () => {
    const operacoes = [
      op("OP-10", "BOM-A", 10),
      op("OP-20", "BOM-A", 20, { ativo: false }), // inativa
      op("OP-25", "BOM-A", 25, { deletedAt: "2026-08-01" }), // excluída logicamente
      op("OP-30", "BOM-A", 30),
    ];

    expect(resolverPredecessoraLinear(operacoes, operacoes[3])?.id).toBe("OP-10");
  });

  it("rejeita ordem nula - erro impeditivo, nunca presumida", () => {
    const operacoes = [op("OP-10", "BOM-A", 10), op("OP-NULA", "BOM-A", null)];
    expect(() => resolverPredecessoraLinear(operacoes, operacoes[1])).toThrow(RangeError);
  });

  it("rejeita operação que não está na lista informada", () => {
    const operacoes = [op("OP-10", "BOM-A", 10)];
    const foraDaLista = op("OP-FORA", "BOM-A", 20);
    expect(() => resolverPredecessoraLinear(operacoes, foraDaLista)).toThrow(RangeError);
  });

  it("rejeita ordem duplicada entre operações ativas - cadeia ficaria não determinística", () => {
    const operacoes = [op("OP-10", "BOM-A", 10), op("OP-20-X", "BOM-A", 20), op("OP-20-Y", "BOM-A", 20)];
    expect(() => resolverPredecessoraLinear(operacoes, operacoes[0])).toThrow(RangeError);
  });

  it("ordem duplicada entre uma operação ATIVA e uma INATIVA não conta (a inativa já é filtrada antes)", () => {
    const operacoes = [op("OP-10", "BOM-A", 10), op("OP-20-ativa", "BOM-A", 20), op("OP-20-inativa", "BOM-A", 20, { ativo: false })];
    expect(() => resolverPredecessoraLinear(operacoes, operacoes[0])).not.toThrow();
  });
});

describe("detectarCiclo", () => {
  it("grafo acíclico (cadeia linear e ramos independentes): não encontra ciclo", () => {
    const a = chave({ bomOperacaoId: "A" });
    const b = chave({ bomOperacaoId: "B" });
    const c = chave({ bomOperacaoId: "C" });
    const dependencias: DependenciaOcorrencia[] = [
      { predecessora: a, sucessora: b, tipo: "sequencia_roteiro" },
      { predecessora: b, sucessora: c, tipo: "sequencia_roteiro" },
    ];
    expect(detectarCiclo(dependencias)).toBeNull();
  });

  it("detecta ciclo direto (A -> B -> A)", () => {
    const a = chave({ bomOperacaoId: "A" });
    const b = chave({ bomOperacaoId: "B" });
    const dependencias: DependenciaOcorrencia[] = [
      { predecessora: a, sucessora: b, tipo: "sequencia_roteiro" },
      { predecessora: b, sucessora: a, tipo: "consumo_subconjunto" },
    ];
    const ciclo = detectarCiclo(dependencias);
    expect(ciclo).not.toBeNull();
    expect(ciclo!.map(chaveOcorrenciaParaString)).toContain(chaveOcorrenciaParaString(a));
    expect(ciclo!.map(chaveOcorrenciaParaString)).toContain(chaveOcorrenciaParaString(b));
  });

  it("detecta ciclo indireto (A -> B -> C -> A)", () => {
    const a = chave({ bomOperacaoId: "A" });
    const b = chave({ bomOperacaoId: "B" });
    const c = chave({ bomOperacaoId: "C" });
    const dependencias: DependenciaOcorrencia[] = [
      { predecessora: a, sucessora: b, tipo: "sequencia_roteiro" },
      { predecessora: b, sucessora: c, tipo: "sequencia_roteiro" },
      { predecessora: c, sucessora: a, tipo: "consumo_subconjunto" },
    ];
    expect(detectarCiclo(dependencias)).not.toBeNull();
  });

  it("auto-referência (A -> A) é detectada como ciclo", () => {
    const a = chave({ bomOperacaoId: "A" });
    expect(detectarCiclo([{ predecessora: a, sucessora: a, tipo: "sequencia_roteiro" }])).not.toBeNull();
  });

  it("componentes desconectados: ciclo num componente não impede detecção mesmo com outro componente acíclico antes dele", () => {
    const a = chave({ bomOperacaoId: "A" });
    const b = chave({ bomOperacaoId: "B" });
    const x = chave({ bomOperacaoId: "X" });
    const y = chave({ bomOperacaoId: "Y" });
    const dependencias: DependenciaOcorrencia[] = [
      { predecessora: a, sucessora: b, tipo: "sequencia_roteiro" }, // componente acíclico
      { predecessora: x, sucessora: y, tipo: "sequencia_roteiro" },
      { predecessora: y, sucessora: x, tipo: "consumo_subconjunto" }, // componente cíclico
    ];
    expect(detectarCiclo(dependencias)).not.toBeNull();
  });
});

describe("construirGrafoOcorrencias — Regra 1 (sequência simples)", () => {
  it("roteiro de 3 operações (ordens 10/20/30), sem subconjuntos: 2 dependências sequenciais", () => {
    const ocorrencias: OcorrenciaComContexto[] = [
      { chave: chave({ bomOperacaoId: "OP-10" }), bomOperacaoId: "OP-10", bomId: "BOM-A" },
      { chave: chave({ bomOperacaoId: "OP-20" }), bomOperacaoId: "OP-20", bomId: "BOM-A" },
      { chave: chave({ bomOperacaoId: "OP-30" }), bomOperacaoId: "OP-30", bomId: "BOM-A" },
    ];
    const operacoesPorBomId = { "BOM-A": [op("OP-10", "BOM-A", 10), op("OP-20", "BOM-A", 20), op("OP-30", "BOM-A", 30)] };

    const { dependencias } = construirGrafoOcorrencias({ ocorrencias, operacoesPorBomId, subconjuntosUsados: [], vinculosMestres: [] });

    expect(dependencias).toHaveLength(2);
    expect(dependencias.every((d) => d.tipo === "sequencia_roteiro")).toBe(true);
    expect(dependencias.map((d) => [d.predecessora.bomOperacaoId, d.sucessora.bomOperacaoId])).toEqual([
      ["OP-10", "OP-20"],
      ["OP-20", "OP-30"],
    ]);
  });
});

describe("construirGrafoOcorrencias — Regra 2, múltiplas predecessoras de subconjuntos", () => {
  const operacoesPorBomId = {
    "BOM-PAI": [op("OP-MONTAR", "BOM-PAI", 10)],
    "BOM-SUB-A": [op("OP-A-10", "BOM-SUB-A", 10), op("OP-A-20", "BOM-SUB-A", 20)],
    "BOM-SUB-B": [op("OP-B-10", "BOM-SUB-B", 10), op("OP-B-20", "BOM-SUB-B", 20)],
  };

  const ocorrencias: OcorrenciaComContexto[] = [
    { chave: chave({ bomOperacaoId: "OP-MONTAR", caminhoBomItemIds: [] }), bomOperacaoId: "OP-MONTAR", bomId: "BOM-PAI" },
    { chave: chave({ bomOperacaoId: "OP-A-10", caminhoBomItemIds: ["ITEM-SUB-A"] }), bomOperacaoId: "OP-A-10", bomId: "BOM-SUB-A" },
    { chave: chave({ bomOperacaoId: "OP-A-20", caminhoBomItemIds: ["ITEM-SUB-A"] }), bomOperacaoId: "OP-A-20", bomId: "BOM-SUB-A" },
    { chave: chave({ bomOperacaoId: "OP-B-10", caminhoBomItemIds: ["ITEM-SUB-B"] }), bomOperacaoId: "OP-B-10", bomId: "BOM-SUB-B" },
    { chave: chave({ bomOperacaoId: "OP-B-20", caminhoBomItemIds: ["ITEM-SUB-B"] }), bomOperacaoId: "OP-B-20", bomId: "BOM-SUB-B" },
  ];

  const subconjuntosUsados: SubconjuntoUsado[] = [
    { bomItemId: "ITEM-SUB-A", bomIdPai: "BOM-PAI", bomIdSubconjunto: "BOM-SUB-A" },
    { bomItemId: "ITEM-SUB-B", bomIdPai: "BOM-PAI", bomIdSubconjunto: "BOM-SUB-B" },
  ];

  it("fallback conservador (sem vínculo mestre): OP-MONTAR ganha 2 predecessoras - a última operação de CADA subconjunto direto", () => {
    const { dependencias } = construirGrafoOcorrencias({ ocorrencias, operacoesPorBomId, subconjuntosUsados, vinculosMestres: [] });

    const predecessorasDeMontar = dependencias.filter((d) => d.sucessora.bomOperacaoId === "OP-MONTAR");
    expect(predecessorasDeMontar).toHaveLength(2);
    expect(predecessorasDeMontar.map((d) => d.predecessora.bomOperacaoId).sort()).toEqual(["OP-A-20", "OP-B-20"]);
    expect(predecessorasDeMontar.every((d) => d.tipo === "consumo_subconjunto")).toBe(true);

    // A sequência interna de cada subconjunto continua presente (Regra 1 dentro do próprio caminho).
    expect(dependencias).toContainEqual(
      expect.objectContaining({ tipo: "sequencia_roteiro", predecessora: expect.objectContaining({ bomOperacaoId: "OP-A-10" }), sucessora: expect.objectContaining({ bomOperacaoId: "OP-A-20" }) }),
    );
  });

  it("com vínculo mestre: só a operação designada do pai recebe a dependência, não as demais operações do pai", () => {
    const operacoesPorBomIdComDuasOps = {
      ...operacoesPorBomId,
      "BOM-PAI": [op("OP-P1", "BOM-PAI", 10), op("OP-P2", "BOM-PAI", 20)],
    };
    const ocorrenciasComDuasOps: OcorrenciaComContexto[] = [
      { chave: chave({ bomOperacaoId: "OP-P1", caminhoBomItemIds: [] }), bomOperacaoId: "OP-P1", bomId: "BOM-PAI" },
      { chave: chave({ bomOperacaoId: "OP-P2", caminhoBomItemIds: [] }), bomOperacaoId: "OP-P2", bomId: "BOM-PAI" },
      ...ocorrencias.slice(1), // subconjuntos A e B, iguais
    ];
    const vinculosMestres: VinculoSubconjuntoOperacaoConsumidora[] = [
      { bomItemIdSubconjunto: "ITEM-SUB-A", bomOperacaoIdConsumidora: "OP-P2" }, // só A tem vínculo explícito, B usa fallback
    ];

    const { dependencias } = construirGrafoOcorrencias({
      ocorrencias: ocorrenciasComDuasOps,
      operacoesPorBomId: operacoesPorBomIdComDuasOps,
      subconjuntosUsados,
      vinculosMestres,
    });

    const dependenciasDeSubA = dependencias.filter((d) => d.predecessora.bomOperacaoId === "OP-A-20");
    expect(dependenciasDeSubA).toHaveLength(1); // só OP-P2, não OP-P1
    expect(dependenciasDeSubA[0].sucessora.bomOperacaoId).toBe("OP-P2");

    const dependenciasDeSubB = dependencias.filter((d) => d.predecessora.bomOperacaoId === "OP-B-20");
    expect(dependenciasDeSubB).toHaveLength(2); // fallback conservador: OP-P1 e OP-P2
    expect(dependenciasDeSubB.map((d) => d.sucessora.bomOperacaoId).sort()).toEqual(["OP-P1", "OP-P2"]);
  });
});

describe("construirGrafoOcorrencias — validações de integridade do conjunto", () => {
  it("rejeita chave completa de ocorrência duplicada", () => {
    const operacoesPorBomId = { "BOM-A": [op("OP-10", "BOM-A", 10)] };
    const ocorrencias: OcorrenciaComContexto[] = [
      { chave: chave({ bomOperacaoId: "OP-10" }), bomOperacaoId: "OP-10", bomId: "BOM-A" },
      { chave: chave({ bomOperacaoId: "OP-10" }), bomOperacaoId: "OP-10", bomId: "BOM-A" }, // duplicada
    ];
    expect(() => construirGrafoOcorrencias({ ocorrencias, operacoesPorBomId, subconjuntosUsados: [], vinculosMestres: [] })).toThrow(RangeError);
  });

  it("rejeita quando chave.bomOperacaoId diverge de ocorrencia.bomOperacaoId", () => {
    const operacoesPorBomId = { "BOM-A": [op("OP-10", "BOM-A", 10)] };
    const ocorrencias: OcorrenciaComContexto[] = [
      { chave: chave({ bomOperacaoId: "OP-DIFERENTE" }), bomOperacaoId: "OP-10", bomId: "BOM-A" },
    ];
    expect(() => construirGrafoOcorrencias({ ocorrencias, operacoesPorBomId, subconjuntosUsados: [], vinculosMestres: [] })).toThrow(RangeError);
  });

  it("rejeita ocorrência cujo bomOperacaoId não existe em operacoesPorBomId do bomId informado", () => {
    const operacoesPorBomId = { "BOM-A": [op("OP-10", "BOM-A", 10)] };
    const ocorrencias: OcorrenciaComContexto[] = [
      { chave: chave({ bomOperacaoId: "OP-INEXISTENTE" }), bomOperacaoId: "OP-INEXISTENTE", bomId: "BOM-A" },
    ];
    expect(() => construirGrafoOcorrencias({ ocorrencias, operacoesPorBomId, subconjuntosUsados: [], vinculosMestres: [] })).toThrow(RangeError);
  });

  it("rejeita quando a predecessora linear resolvida não tem ocorrência correspondente no conjunto (conjunto incompleto - evitaria cronograma otimista)", () => {
    // Roteiro tem 2 operações (10 e 20), mas só a ocorrência de 20 foi
    // informada - a predecessora real (10) existe no BOM mas não no
    // conjunto de ocorrências, então não pode ser silenciosamente
    // ignorada (isso faria 20 parecer a primeira da cadeia).
    const operacoesPorBomId = { "BOM-A": [op("OP-10", "BOM-A", 10), op("OP-20", "BOM-A", 20)] };
    const ocorrencias: OcorrenciaComContexto[] = [
      { chave: chave({ bomOperacaoId: "OP-20" }), bomOperacaoId: "OP-20", bomId: "BOM-A" },
    ];
    expect(() => construirGrafoOcorrencias({ ocorrencias, operacoesPorBomId, subconjuntosUsados: [], vinculosMestres: [] })).toThrow(RangeError);
  });

  it("rejeita subconjunto usado sem nenhuma operação ativa informada", () => {
    const operacoesPorBomId = { "BOM-PAI": [op("OP-MONTAR", "BOM-PAI", 10)], "BOM-SUB": [] };
    const ocorrencias: OcorrenciaComContexto[] = [
      { chave: chave({ bomOperacaoId: "OP-MONTAR", caminhoBomItemIds: [] }), bomOperacaoId: "OP-MONTAR", bomId: "BOM-PAI" },
    ];
    const subconjuntosUsados: SubconjuntoUsado[] = [{ bomItemId: "ITEM-SUB", bomIdPai: "BOM-PAI", bomIdSubconjunto: "BOM-SUB" }];
    expect(() =>
      construirGrafoOcorrencias({ ocorrencias, operacoesPorBomId, subconjuntosUsados, vinculosMestres: [] }),
    ).toThrow(RangeError);
  });

  it("rejeita quando a última operação do subconjunto não tem ocorrência correspondente no conjunto informado", () => {
    const operacoesPorBomId = {
      "BOM-PAI": [op("OP-MONTAR", "BOM-PAI", 10)],
      "BOM-SUB": [op("OP-SUB-10", "BOM-SUB", 10)],
    };
    const ocorrencias: OcorrenciaComContexto[] = [
      // só a ocorrência do pai foi informada - falta a do subconjunto
      { chave: chave({ bomOperacaoId: "OP-MONTAR", caminhoBomItemIds: [] }), bomOperacaoId: "OP-MONTAR", bomId: "BOM-PAI" },
    ];
    const subconjuntosUsados: SubconjuntoUsado[] = [{ bomItemId: "ITEM-SUB", bomIdPai: "BOM-PAI", bomIdSubconjunto: "BOM-SUB" }];
    expect(() =>
      construirGrafoOcorrencias({ ocorrencias, operacoesPorBomId, subconjuntosUsados, vinculosMestres: [] }),
    ).toThrow(RangeError);
  });

  it("rejeita vínculo mestre apontando para operação de OUTRO bomId, não do bomIdPai correto", () => {
    const operacoesPorBomId = {
      "BOM-PAI": [op("OP-MONTAR", "BOM-PAI", 10)],
      "BOM-SUB": [op("OP-SUB-10", "BOM-SUB", 10)],
      "BOM-OUTRO": [op("OP-DE-OUTRO-BOM", "BOM-OUTRO", 10)],
    };
    const ocorrencias: OcorrenciaComContexto[] = [
      { chave: chave({ bomOperacaoId: "OP-MONTAR", caminhoBomItemIds: [] }), bomOperacaoId: "OP-MONTAR", bomId: "BOM-PAI" },
      { chave: chave({ bomOperacaoId: "OP-SUB-10", caminhoBomItemIds: ["ITEM-SUB"] }), bomOperacaoId: "OP-SUB-10", bomId: "BOM-SUB" },
    ];
    const subconjuntosUsados: SubconjuntoUsado[] = [{ bomItemId: "ITEM-SUB", bomIdPai: "BOM-PAI", bomIdSubconjunto: "BOM-SUB" }];
    const vinculosMestres: VinculoSubconjuntoOperacaoConsumidora[] = [
      { bomItemIdSubconjunto: "ITEM-SUB", bomOperacaoIdConsumidora: "OP-DE-OUTRO-BOM" }, // pertence a BOM-OUTRO, não a BOM-PAI
    ];
    expect(() =>
      construirGrafoOcorrencias({ ocorrencias, operacoesPorBomId, subconjuntosUsados, vinculosMestres }),
    ).toThrow(RangeError);
  });

  it("rejeita vínculo mestre apontando para operação INATIVA do BOM pai", () => {
    const operacoesPorBomId = {
      // OP-MONTAR (ativa, com ocorrência) coexiste com OP-INATIVA (inativa, sem ocorrência própria) no mesmo bomId.
      "BOM-PAI": [op("OP-MONTAR", "BOM-PAI", 10), op("OP-INATIVA", "BOM-PAI", 20, { ativo: false })],
      "BOM-SUB": [op("OP-SUB-10", "BOM-SUB", 10)],
    };
    const ocorrencias: OcorrenciaComContexto[] = [
      { chave: chave({ bomOperacaoId: "OP-MONTAR", caminhoBomItemIds: [] }), bomOperacaoId: "OP-MONTAR", bomId: "BOM-PAI" },
      { chave: chave({ bomOperacaoId: "OP-SUB-10", caminhoBomItemIds: ["ITEM-SUB"] }), bomOperacaoId: "OP-SUB-10", bomId: "BOM-SUB" },
    ];
    const subconjuntosUsados: SubconjuntoUsado[] = [{ bomItemId: "ITEM-SUB", bomIdPai: "BOM-PAI", bomIdSubconjunto: "BOM-SUB" }];
    const vinculosMestres: VinculoSubconjuntoOperacaoConsumidora[] = [
      { bomItemIdSubconjunto: "ITEM-SUB", bomOperacaoIdConsumidora: "OP-INATIVA" }, // aponta para a inativa, não a ativa
    ];
    expect(() =>
      construirGrafoOcorrencias({ ocorrencias, operacoesPorBomId, subconjuntosUsados, vinculosMestres }),
    ).toThrow(RangeError);
  });

  it("rejeita vínculo mestre 'solto' - bomItemIdSubconjunto que não corresponde a nenhum subconjuntoUsado", () => {
    const operacoesPorBomId = { "BOM-PAI": [op("OP-MONTAR", "BOM-PAI", 10)] };
    const ocorrencias: OcorrenciaComContexto[] = [
      { chave: chave({ bomOperacaoId: "OP-MONTAR", caminhoBomItemIds: [] }), bomOperacaoId: "OP-MONTAR", bomId: "BOM-PAI" },
    ];
    const vinculosMestres: VinculoSubconjuntoOperacaoConsumidora[] = [
      { bomItemIdSubconjunto: "ITEM-QUE-NAO-EXISTE", bomOperacaoIdConsumidora: "OP-MONTAR" },
    ];
    expect(() =>
      construirGrafoOcorrencias({ ocorrencias, operacoesPorBomId, subconjuntosUsados: [], vinculosMestres }),
    ).toThrow(RangeError);
  });
});

describe("construirGrafoOcorrencias — chave completa de ocorrência (desambiguação)", () => {
  it("o mesmo bomOperacaoId usado em 2 itens de projeto diferentes não confunde as cadeias de precedência", () => {
    const operacoesPorBomId = { "BOM-A": [op("OP-10", "BOM-A", 10), op("OP-20", "BOM-A", 20)] };
    const ocorrencias: OcorrenciaComContexto[] = [
      { chave: chave({ projetoItemId: "PI-1", bomOperacaoId: "OP-10" }), bomOperacaoId: "OP-10", bomId: "BOM-A" },
      { chave: chave({ projetoItemId: "PI-1", bomOperacaoId: "OP-20" }), bomOperacaoId: "OP-20", bomId: "BOM-A" },
      { chave: chave({ projetoItemId: "PI-2", bomOperacaoId: "OP-10" }), bomOperacaoId: "OP-10", bomId: "BOM-A" },
      { chave: chave({ projetoItemId: "PI-2", bomOperacaoId: "OP-20" }), bomOperacaoId: "OP-20", bomId: "BOM-A" },
    ];

    const { dependencias } = construirGrafoOcorrencias({ ocorrencias, operacoesPorBomId, subconjuntosUsados: [], vinculosMestres: [] });

    expect(dependencias).toHaveLength(2); // 1 por item de projeto, nunca cruzadas
    const dePi1 = dependencias.find((d) => d.predecessora.projetoItemId === "PI-1")!;
    const dePi2 = dependencias.find((d) => d.predecessora.projetoItemId === "PI-2")!;
    expect(dePi1.sucessora.projetoItemId).toBe("PI-1"); // nunca aponta pro item PI-2
    expect(dePi2.sucessora.projetoItemId).toBe("PI-2");
  });
});

describe("resolverOcorrenciasLiberadas — sucessora liberada só após conclusão real de TODAS as predecessoras", () => {
  const a = chave({ bomOperacaoId: "A" });
  const b = chave({ bomOperacaoId: "B" });
  const c = chave({ bomOperacaoId: "C" }); // depende de A e B
  const todasOcorrencias = [a, b, c];
  const dependencias: DependenciaOcorrencia[] = [
    { predecessora: a, sucessora: c, tipo: "sequencia_roteiro" },
    { predecessora: b, sucessora: c, tipo: "consumo_subconjunto" },
  ];

  it("sem nenhuma predecessora concluída: só as ocorrências sem predecessora (A, B) estão liberadas", () => {
    const liberadas = resolverOcorrenciasLiberadas(todasOcorrencias, dependencias, new Set());
    expect(liberadas.map((o) => o.bomOperacaoId).sort()).toEqual(["A", "B"]);
  });

  it("com só UMA das duas predecessoras concluída: C ainda NÃO está liberada", () => {
    const liberadas = resolverOcorrenciasLiberadas(todasOcorrencias, dependencias, new Set([chaveOcorrenciaParaString(a)]));
    expect(liberadas.map((o) => o.bomOperacaoId)).not.toContain("C");
  });

  it("só com AMBAS as predecessoras concluídas, C fica liberada", () => {
    const concluidas = new Set([chaveOcorrenciaParaString(a), chaveOcorrenciaParaString(b)]);
    const liberadas = resolverOcorrenciasLiberadas(todasOcorrencias, dependencias, concluidas);
    expect(liberadas.map((o) => o.bomOperacaoId)).toEqual(["C"]);
  });

  it("ocorrência já concluída nunca reaparece na lista de liberadas", () => {
    const concluidas = new Set([chaveOcorrenciaParaString(a), chaveOcorrenciaParaString(b), chaveOcorrenciaParaString(c)]);
    const liberadas = resolverOcorrenciasLiberadas(todasOcorrencias, dependencias, concluidas);
    expect(liberadas).toHaveLength(0);
  });
});
