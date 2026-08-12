import { describe, expect, it } from "vitest";
import { calcularFimPorDuracaoInclusiva, diaCivilSeguinte, resolverDataInicioMinima } from "./datasPrecedencia";

const IDENTIDADE = (data: string) => data; // "próximo dia produtivo" trivial - o próprio dia, para testar só a semântica de D+1

describe("diaCivilSeguinte", () => {
  it("avança 1 dia civil, sem depender de calendário produtivo", () => {
    expect(diaCivilSeguinte("2026-11-09")).toBe("2026-11-10");
  });

  it("atravessa virada de mês e de ano corretamente", () => {
    expect(diaCivilSeguinte("2026-11-30")).toBe("2026-12-01");
    expect(diaCivilSeguinte("2026-12-31")).toBe("2027-01-01");
  });
});

describe("resolverDataInicioMinima — sucessora começa estritamente após a predecessora, nunca no mesmo dia", () => {
  it("sem predecessora: dataInicioJanela é elegível (inclusive)", () => {
    const resultado = resolverDataInicioMinima({
      dataInicioJanela: "2026-11-09",
      dataFimPredecessoras: [],
      proximoDiaProdutivoAPartirDe: IDENTIDADE,
    });
    expect(resultado).toBe("2026-11-09");
  });

  it("com 1 predecessora terminando em D: sucessora começa em D+1, nunca em D", () => {
    const resultado = resolverDataInicioMinima({
      dataInicioJanela: "2026-11-01", // bem antes, não é o fator limitante
      dataFimPredecessoras: ["2026-11-13"],
      proximoDiaProdutivoAPartirDe: IDENTIDADE,
    });
    expect(resultado).toBe("2026-11-14");
  });

  it("dataInicioJanela mais tardia que D+1 prevalece (a operação não pode começar antes da janela nem antes da predecessora)", () => {
    const resultado = resolverDataInicioMinima({
      dataInicioJanela: "2026-12-01",
      dataFimPredecessoras: ["2026-11-13"], // D+1 = 14/11, mas a janela só abre em 01/12
      proximoDiaProdutivoAPartirDe: IDENTIDADE,
    });
    expect(resultado).toBe("2026-12-01");
  });

  it("com múltiplas predecessoras: usa a que termina mais tarde (todas precisam ter concluído)", () => {
    const resultado = resolverDataInicioMinima({
      dataInicioJanela: "2026-11-01",
      dataFimPredecessoras: ["2026-11-13", "2026-11-20", "2026-11-15"],
      proximoDiaProdutivoAPartirDe: IDENTIDADE,
    });
    expect(resultado).toBe("2026-11-21"); // dia seguinte à maior data de fim (20/11)
  });

  it("delega o avanço até o próximo dia produtivo real à função injetada (calendário fica fora desta fase pura)", () => {
    // 14/11 é um sábado não produtivo neste calendário fictício - o
    // primeiro dia produtivo real só é 16/11.
    const proximoDiaProdutivoFicticio = (data: string) => (data === "2026-11-14" ? "2026-11-16" : data);
    const resultado = resolverDataInicioMinima({
      dataInicioJanela: "2026-11-01",
      dataFimPredecessoras: ["2026-11-13"],
      proximoDiaProdutivoAPartirDe: proximoDiaProdutivoFicticio,
    });
    expect(resultado).toBe("2026-11-16");
  });
});

describe("resolverDataInicioMinima — retorno do calendário injetado é validado, não confiado cegamente", () => {
  it("rejeita retorno que não é uma data ISO válida", () => {
    expect(() =>
      resolverDataInicioMinima({
        dataInicioJanela: "2026-11-09",
        dataFimPredecessoras: [],
        proximoDiaProdutivoAPartirDe: () => "data-invalida",
      }),
    ).toThrow(RangeError);
  });

  it("rejeita retorno anterior à data pedida (calendário com bug quebraria a garantia de D+1 silenciosamente)", () => {
    expect(() =>
      resolverDataInicioMinima({
        dataInicioJanela: "2026-11-09",
        dataFimPredecessoras: [],
        proximoDiaProdutivoAPartirDe: () => "2026-11-01", // anterior a 09/11, nunca deveria acontecer
      }),
    ).toThrow(RangeError);
  });

  it("aceita retorno igual à data pedida (o próprio dia já é produtivo)", () => {
    const resultado = resolverDataInicioMinima({
      dataInicioJanela: "2026-11-09",
      dataFimPredecessoras: [],
      proximoDiaProdutivoAPartirDe: (data) => data,
    });
    expect(resultado).toBe("2026-11-09");
  });
});

describe("calcularFimPorDuracaoInclusiva — duração inclusiva, não offset", () => {
  it("prazo de 3 dias corridos a partir de 14/11 cobre 14,15,16 - fim é 16/11, nunca 17/11", () => {
    expect(calcularFimPorDuracaoInclusiva("2026-11-14", 3)).toBe("2026-11-16");
  });

  it("prazo de 1 dia corrido: fim é o próprio dia de início", () => {
    expect(calcularFimPorDuracaoInclusiva("2026-11-14", 1)).toBe("2026-11-14");
  });

  it("atravessa virada de mês corretamente", () => {
    expect(calcularFimPorDuracaoInclusiva("2026-11-29", 5)).toBe("2026-12-03");
  });

  it("rejeita prazo zero, negativo, fracionário ou não finito", () => {
    expect(() => calcularFimPorDuracaoInclusiva("2026-11-14", 0)).toThrow(RangeError);
    expect(() => calcularFimPorDuracaoInclusiva("2026-11-14", -1)).toThrow(RangeError);
    expect(() => calcularFimPorDuracaoInclusiva("2026-11-14", 2.5)).toThrow(RangeError);
    expect(() => calcularFimPorDuracaoInclusiva("2026-11-14", NaN)).toThrow(RangeError);
  });
});
