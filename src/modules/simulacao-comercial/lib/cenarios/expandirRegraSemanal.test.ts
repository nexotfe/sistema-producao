import { describe, expect, it } from "vitest";
import {
  expandirRegraSemanal,
  calcularSemanaFim,
  segundaDaSemana,
  calcularJanelaEfetivaSemana,
  type DiasRegraSemanal,
} from "./expandirRegraSemanal";
import { derivarNaturezaDia, type FatoCalendarioDia, type NaturezaDia } from "./derivarNaturezaDia";

// Âncora de calendário (mesma usada no resto desta pasta): 2026-01-01 é
// quinta-feira. 05/01=segunda, 10/01=sábado, 11/01=domingo, 12/01=segunda.
const padraoSemanalProdutivo: FatoCalendarioDia = { produtivo: true, origem: "padrao_semanal" };
const feriadoOficial: FatoCalendarioDia = { produtivo: false, origem: "feriado_oficial" };

function resolverNaturezaSemFeriado(data: string): NaturezaDia {
  return derivarNaturezaDia(data, padraoSemanalProdutivo);
}

function diasVazios(): DiasRegraSemanal {
  return { diasUteis: [], sabado: false, domingo: false, feriado: false };
}

describe("expandirRegraSemanal - segunda a sexta", () => {
  it("gera 1 entrada por dia útil marcado, natureza=normal", () => {
    const resultado = expandirRegraSemanal({
      dias: { ...diasVazios(), diasUteis: [1, 2, 3, 4, 5] },
      horasPorDia: 2,
      ativo: true,
      dataInicio: "2026-01-05", // segunda
      dataFim: "2026-01-11", // domingo
      resolverNatureza: resolverNaturezaSemFeriado,
    });
    expect(resultado).toEqual([
      { data: "2026-01-05", horas: 2, natureza: "normal" },
      { data: "2026-01-06", horas: 2, natureza: "normal" },
      { data: "2026-01-07", horas: 2, natureza: "normal" },
      { data: "2026-01-08", horas: 2, natureza: "normal" },
      { data: "2026-01-09", horas: 2, natureza: "normal" },
      // sábado/domingo não marcados - ausentes
    ]);
  });

  it("subconjunto de dias úteis (ex.: só segunda a quinta)", () => {
    const resultado = expandirRegraSemanal({
      dias: { ...diasVazios(), diasUteis: [1, 2, 3, 4] },
      horasPorDia: 2,
      ativo: true,
      dataInicio: "2026-01-05",
      dataFim: "2026-01-09",
      resolverNatureza: resolverNaturezaSemFeriado,
    });
    expect(resultado.map((r) => r.data)).toEqual(["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"]);
  });
});

describe("expandirRegraSemanal - sábado/domingo", () => {
  it("sábado marcado gera só sábados, natureza=sabado", () => {
    const resultado = expandirRegraSemanal({
      dias: { ...diasVazios(), sabado: true },
      horasPorDia: 8.8,
      ativo: true,
      dataInicio: "2026-01-05",
      dataFim: "2026-01-18",
      resolverNatureza: resolverNaturezaSemFeriado,
    });
    expect(resultado).toEqual([
      { data: "2026-01-10", horas: 8.8, natureza: "sabado" },
      { data: "2026-01-17", horas: 8.8, natureza: "sabado" },
    ]);
  });

  it("domingo marcado gera só domingos, natureza=domingo", () => {
    const resultado = expandirRegraSemanal({
      dias: { ...diasVazios(), domingo: true },
      horasPorDia: 8.8,
      ativo: true,
      dataInicio: "2026-01-05",
      dataFim: "2026-01-18",
      resolverNatureza: resolverNaturezaSemFeriado,
    });
    expect(resultado).toEqual([
      { data: "2026-01-11", horas: 8.8, natureza: "domingo" },
      { data: "2026-01-18", horas: 8.8, natureza: "domingo" },
    ]);
  });
});

describe("expandirRegraSemanal - feriado prevalece sobre o dia da semana", () => {
  it("uma quarta-feira que é feriado NÃO é incluída pela regra 'segunda a sexta' (só natureza=normal)", () => {
    const resolverComFeriadoNaQuarta = (data: string): NaturezaDia =>
      data === "2026-01-07" ? derivarNaturezaDia(data, feriadoOficial) : derivarNaturezaDia(data, padraoSemanalProdutivo);

    const resultado = expandirRegraSemanal({
      dias: { ...diasVazios(), diasUteis: [1, 2, 3, 4, 5] },
      horasPorDia: 2,
      ativo: true,
      dataInicio: "2026-01-05",
      dataFim: "2026-01-09",
      resolverNatureza: resolverComFeriadoNaQuarta,
    });

    expect(resultado.map((r) => r.data)).not.toContain("2026-01-07");
    expect(resultado).toHaveLength(4);
  });

  it("a mesma quarta-feira feriado É incluída quando o alvo 'feriado' está marcado, independente do dia da semana", () => {
    const resolverComFeriadoNaQuarta = (data: string): NaturezaDia =>
      data === "2026-01-07" ? derivarNaturezaDia(data, feriadoOficial) : derivarNaturezaDia(data, padraoSemanalProdutivo);

    const resultado = expandirRegraSemanal({
      dias: { ...diasVazios(), feriado: true },
      horasPorDia: 8.8,
      ativo: true,
      dataInicio: "2026-01-05",
      dataFim: "2026-01-09",
      resolverNatureza: resolverComFeriadoNaQuarta,
    });

    expect(resultado).toEqual([{ data: "2026-01-07", horas: 8.8, natureza: "feriado" }]);
  });
});

describe("expandirRegraSemanal - validações e casos de borda", () => {
  it("ativo=false não gera nenhuma entrada, mesmo com dias marcados", () => {
    const resultado = expandirRegraSemanal({
      dias: { ...diasVazios(), diasUteis: [1, 2, 3, 4, 5] },
      horasPorDia: 2,
      ativo: false,
      dataInicio: "2026-01-05",
      dataFim: "2026-01-09",
      resolverNatureza: resolverNaturezaSemFeriado,
    });
    expect(resultado).toEqual([]);
  });

  it("rejeita horasPorDia zero", () => {
    expect(() =>
      expandirRegraSemanal({
        dias: { ...diasVazios(), diasUteis: [1] },
        horasPorDia: 0,
        ativo: true,
        dataInicio: "2026-01-05",
        dataFim: "2026-01-05",
        resolverNatureza: resolverNaturezaSemFeriado,
      }),
    ).toThrow(RangeError);
  });

  it("rejeita horasPorDia negativo", () => {
    expect(() =>
      expandirRegraSemanal({
        dias: { ...diasVazios(), diasUteis: [1] },
        horasPorDia: -2,
        ativo: true,
        dataInicio: "2026-01-05",
        dataFim: "2026-01-05",
        resolverNatureza: resolverNaturezaSemFeriado,
      }),
    ).toThrow(RangeError);
  });

  it("rejeita nenhum dia/natureza marcado", () => {
    expect(() =>
      expandirRegraSemanal({
        dias: diasVazios(),
        horasPorDia: 2,
        ativo: true,
        dataInicio: "2026-01-05",
        dataFim: "2026-01-09",
        resolverNatureza: resolverNaturezaSemFeriado,
      }),
    ).toThrow(RangeError);
  });

  it("rejeita dataInicio posterior a dataFim", () => {
    expect(() =>
      expandirRegraSemanal({
        dias: { ...diasVazios(), diasUteis: [1] },
        horasPorDia: 2,
        ativo: true,
        dataInicio: "2026-01-09",
        dataFim: "2026-01-05",
        resolverNatureza: resolverNaturezaSemFeriado,
      }),
    ).toThrow(RangeError);
  });
});

describe("calcularSemanaFim", () => {
  it("sempre exatamente 6 dias depois de semanaInicio (domingo da mesma semana)", () => {
    expect(calcularSemanaFim("2026-09-14")).toBe("2026-09-20");
    expect(calcularSemanaFim("2026-01-05")).toBe("2026-01-11");
  });
});

describe("segundaDaSemana", () => {
  it("uma segunda-feira resolve para ela mesma", () => {
    expect(segundaDaSemana("2026-01-05")).toBe("2026-01-05");
  });

  it("qualquer dia da semana resolve para a segunda-feira da mesma semana", () => {
    expect(segundaDaSemana("2026-01-06")).toBe("2026-01-05"); // terça
    expect(segundaDaSemana("2026-01-09")).toBe("2026-01-05"); // sexta
    expect(segundaDaSemana("2026-01-10")).toBe("2026-01-05"); // sábado
  });

  it("domingo resolve para a segunda-feira ANTERIOR (mesma semana civil, não a próxima)", () => {
    expect(segundaDaSemana("2026-01-11")).toBe("2026-01-05");
  });
});

describe("calcularJanelaEfetivaSemana", () => {
  it("semana totalmente dentro da janela do cenário - devolve a semana inteira", () => {
    const resultado = calcularJanelaEfetivaSemana({
      semanaInicio: "2026-09-14",
      janelaInicio: "2026-09-01",
      janelaFim: "2026-09-30",
    });
    expect(resultado).toEqual({ dataInicio: "2026-09-14", dataFim: "2026-09-20" });
  });

  it("corta no início da janela quando a semana começa antes dela", () => {
    const resultado = calcularJanelaEfetivaSemana({
      semanaInicio: "2026-09-14",
      janelaInicio: "2026-09-17",
      janelaFim: "2026-09-30",
    });
    expect(resultado).toEqual({ dataInicio: "2026-09-17", dataFim: "2026-09-20" });
  });

  it("corta no fim da janela quando a semana termina depois dela", () => {
    const resultado = calcularJanelaEfetivaSemana({
      semanaInicio: "2026-09-14",
      janelaInicio: "2026-09-01",
      janelaFim: "2026-09-17",
    });
    expect(resultado).toEqual({ dataInicio: "2026-09-14", dataFim: "2026-09-17" });
  });

  it("devolve null quando a semana não tem nenhuma interseção com a janela (totalmente antes)", () => {
    const resultado = calcularJanelaEfetivaSemana({
      semanaInicio: "2026-09-14",
      janelaInicio: "2026-09-21",
      janelaFim: "2026-09-30",
    });
    expect(resultado).toBeNull();
  });

  it("devolve null quando a semana não tem nenhuma interseção com a janela (totalmente depois)", () => {
    const resultado = calcularJanelaEfetivaSemana({
      semanaInicio: "2026-09-14",
      janelaInicio: "2026-08-01",
      janelaFim: "2026-09-13",
    });
    expect(resultado).toBeNull();
  });

  it("rejeita semanaInicio que não é segunda-feira", () => {
    expect(() =>
      calcularJanelaEfetivaSemana({ semanaInicio: "2026-09-15", janelaInicio: "2026-09-01", janelaFim: "2026-09-30" }),
    ).toThrow(RangeError);
  });
});
