import { describe, expect, it } from "vitest";
import { calcularDatasTerceirizacao } from "./terceirizacao";

describe("calcularDatasTerceirizacao — sem predecessora", () => {
  it("início = dataInicioJanela quando não há predecessora", () => {
    const resultado = calcularDatasTerceirizacao({
      dataInicioJanela: "2026-11-09",
      dataFimPredecessoras: [],
      prazoDiasCorridos: 3,
    });
    expect(resultado.dataInicioCalculada).toBe("2026-11-09");
  });

  it("fim é INCLUSIVO em dias corridos - início 09/11, prazo=3 cobre 09,10,11 -> fim=11/11 (mesmo cruzando fim de semana, dias CORRIDOS, não produtivos)", () => {
    const resultado = calcularDatasTerceirizacao({
      dataInicioJanela: "2026-11-09",
      dataFimPredecessoras: [],
      prazoDiasCorridos: 3,
    });
    expect(resultado.dataFimCalculada).toBe("2026-11-11");
  });

  it("duração cruzando um fim de semana conta os dias corridos normalmente - nenhum calendário produtivo interno se aplica ao terceiro", () => {
    // 2026-11-13 é sexta; prazo=4 dias corridos cobre 13,14(sáb),15(dom),16(seg) -> fim=16/11.
    const resultado = calcularDatasTerceirizacao({
      dataInicioJanela: "2026-11-13",
      dataFimPredecessoras: [],
      prazoDiasCorridos: 4,
    });
    expect(resultado.dataFimCalculada).toBe("2026-11-16");
  });
});

describe("calcularDatasTerceirizacao — com predecessora (precedência exata, DEC-007 §6)", () => {
  it("início é o dia CIVIL seguinte ao maior dataFimReal das predecessoras - nunca no mesmo dia", () => {
    const resultado = calcularDatasTerceirizacao({
      dataInicioJanela: "2026-11-01", // bem anterior - não deveria dominar
      dataFimPredecessoras: ["2026-11-09"],
      prazoDiasCorridos: 2,
    });
    expect(resultado.dataInicioCalculada).toBe("2026-11-10");
    expect(resultado.dataFimCalculada).toBe("2026-11-11");
  });

  it("com múltiplas predecessoras, usa a MAIOR dataFimReal entre elas", () => {
    const resultado = calcularDatasTerceirizacao({
      dataInicioJanela: "2026-11-01",
      dataFimPredecessoras: ["2026-11-09", "2026-11-12", "2026-11-05"],
      prazoDiasCorridos: 1,
    });
    expect(resultado.dataInicioCalculada).toBe("2026-11-13"); // dia seguinte ao maior fim (12/11)
    expect(resultado.dataFimCalculada).toBe("2026-11-13");
  });

  it("mesmo se dataInicioJanela for POSTERIOR ao fim da predecessora, o maior dos dois vence (nunca começa antes da janela declarada)", () => {
    const resultado = calcularDatasTerceirizacao({
      dataInicioJanela: "2026-11-20",
      dataFimPredecessoras: ["2026-11-09"], // dia seguinte seria 10/11, mas a janela só abre em 20/11
      prazoDiasCorridos: 1,
    });
    expect(resultado.dataInicioCalculada).toBe("2026-11-20");
  });
});
