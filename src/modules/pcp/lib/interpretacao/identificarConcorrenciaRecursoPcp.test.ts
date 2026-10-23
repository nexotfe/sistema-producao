import { describe, expect, it } from "vitest";
import { identificarRecursosCompartilhadosPcp, identificarSobreposicaoTemporalRecursoPcp } from "./identificarConcorrenciaRecursoPcp";

describe("identificarRecursosCompartilhadosPcp", () => {
  it("entrada vazia -> array vazio", () => {
    expect(identificarRecursosCompartilhadosPcp([])).toEqual([]);
  });

  it("1 unica OP no recurso -> nunca aparece como compartilhado", () => {
    expect(identificarRecursosCompartilhadosPcp([{ opId: "op1", recursoId: "r1", data: "2026-10-21", prioridadeUsada: 1000 }])).toEqual([]);
  });

  it("2 OPs distintas no mesmo recurso, DATAS DIFERENTES -> ainda conta como compartilhado (E1 ignora data)", () => {
    const resultado = identificarRecursosCompartilhadosPcp([
      { opId: "op1", recursoId: "r1", data: "2026-10-21", prioridadeUsada: 1000 },
      { opId: "op2", recursoId: "r1", data: "2026-11-05", prioridadeUsada: 2000 },
    ]);
    expect(resultado).toEqual([
      { recursoId: "r1", operacoes: [{ opId: "op1", prioridadeUsada: 1000 }, { opId: "op2", prioridadeUsada: 2000 }] },
    ]);
  });

  it("mesma OP com 2 alocacoes no mesmo recurso (datas diferentes) -> conta como 1 so operacao, nunca compartilhado com ela mesma", () => {
    expect(
      identificarRecursosCompartilhadosPcp([
        { opId: "op1", recursoId: "r1", data: "2026-10-21", prioridadeUsada: 1000 },
        { opId: "op1", recursoId: "r1", data: "2026-10-22", prioridadeUsada: 1000 },
      ]),
    ).toEqual([]);
  });

  it("ordenacao deterministica por prioridade, com desempate por opId", () => {
    const resultado = identificarRecursosCompartilhadosPcp([
      { opId: "opZ", recursoId: "r1", data: "2026-10-21", prioridadeUsada: 500 },
      { opId: "opA", recursoId: "r1", data: "2026-10-22", prioridadeUsada: 500 },
    ]);
    expect(resultado[0].operacoes.map((o) => o.opId)).toEqual(["opA", "opZ"]);
  });
});

describe("identificarSobreposicaoTemporalRecursoPcp", () => {
  it("entrada vazia -> array vazio", () => {
    expect(identificarSobreposicaoTemporalRecursoPcp([])).toEqual([]);
  });

  it("mesmo recurso, DATAS DIFERENTES -> NUNCA aparece como sobreposicao temporal (teste negativo explicito)", () => {
    expect(
      identificarSobreposicaoTemporalRecursoPcp([
        { opId: "op1", recursoId: "r1", data: "2026-10-21", prioridadeUsada: 1000 },
        { opId: "op2", recursoId: "r1", data: "2026-11-05", prioridadeUsada: 2000 },
      ]),
    ).toEqual([]);
  });

  it("mesmo recurso E mesma data -> sobreposicao temporal observada", () => {
    const resultado = identificarSobreposicaoTemporalRecursoPcp([
      { opId: "op1", recursoId: "r1", data: "2026-10-21", prioridadeUsada: 1000 },
      { opId: "op2", recursoId: "r1", data: "2026-10-21", prioridadeUsada: 2000 },
    ]);
    expect(resultado).toEqual([
      { recursoId: "r1", data: "2026-10-21", operacoes: [{ opId: "op1", prioridadeUsada: 1000 }, { opId: "op2", prioridadeUsada: 2000 }] },
    ]);
  });

  it("nenhum campo de causa existe no tipo de retorno (garantia estrutural, nunca runtime)", () => {
    const resultado = identificarSobreposicaoTemporalRecursoPcp([
      { opId: "op1", recursoId: "r1", data: "2026-10-21", prioridadeUsada: 1000 },
      { opId: "op2", recursoId: "r1", data: "2026-10-21", prioridadeUsada: 2000 },
    ]);
    expect(Object.keys(resultado[0])).toEqual(["recursoId", "data", "operacoes"]);
    expect(Object.keys(resultado[0].operacoes[0])).toEqual(["opId", "prioridadeUsada"]);
  });

  it("determinismo e imutabilidade - nao muta o array de entrada", () => {
    const entrada = [
      { opId: "op1", recursoId: "r1", data: "2026-10-21", prioridadeUsada: 1000 },
      { opId: "op2", recursoId: "r1", data: "2026-10-21", prioridadeUsada: 2000 },
    ];
    const copiaEntrada = JSON.parse(JSON.stringify(entrada));
    identificarSobreposicaoTemporalRecursoPcp(entrada);
    expect(entrada).toEqual(copiaEntrada);
  });
});
