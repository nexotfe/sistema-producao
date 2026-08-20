import { describe, expect, it } from "vitest";
import { derivarNaturezaDia, diaDaSemanaCivil, naturezaDiaParaCapacidadeExtra, type FatoCalendarioDia } from "./derivarNaturezaDia";

// Âncora de calendário (mesma usada em validarLinhaCapacidadeExtra.test.ts):
// 2026-01-01 é uma quinta-feira. 05/01=segunda, 06/01=terça, 10/01=sábado, 11/01=domingo, 12/01=segunda.
const SEGUNDA = "2026-01-12";
const TERCA = "2026-01-06";
const SEXTA = "2026-01-02";
const SABADO = "2026-01-10";
const DOMINGO = "2026-01-11";
const QUINTA = "2026-01-01";

const padraoSemanalProdutivo: FatoCalendarioDia = { produtivo: true, origem: "padrao_semanal" };

describe("diaDaSemanaCivil", () => {
  it("identifica cada dia da semana corretamente na âncora de calendário", () => {
    expect(diaDaSemanaCivil(SEGUNDA)).toBe(1);
    expect(diaDaSemanaCivil(TERCA)).toBe(2);
    expect(diaDaSemanaCivil(SABADO)).toBe(6);
    expect(diaDaSemanaCivil(DOMINGO)).toBe(0);
    expect(diaDaSemanaCivil(QUINTA)).toBe(4);
  });

  it("rejeita data inválida", () => {
    expect(() => diaDaSemanaCivil("31/12/2026")).toThrow(RangeError);
  });
});

describe("derivarNaturezaDia", () => {
  it("dia útil produtivo (padrão semanal) -> normal", () => {
    expect(derivarNaturezaDia(SEGUNDA, padraoSemanalProdutivo)).toBe("normal");
    expect(derivarNaturezaDia(SEXTA, padraoSemanalProdutivo)).toBe("normal");
  });

  it("sábado (sem feriado/evento não produtivo) -> sabado", () => {
    expect(derivarNaturezaDia(SABADO, padraoSemanalProdutivo)).toBe("sabado");
  });

  it("domingo (sem feriado/evento não produtivo) -> domingo", () => {
    expect(derivarNaturezaDia(DOMINGO, padraoSemanalProdutivo)).toBe("domingo");
  });

  it("feriado oficial numa terça-feira -> feriado (sobrepõe o dia da semana)", () => {
    const fato: FatoCalendarioDia = { produtivo: false, origem: "feriado_oficial" };
    expect(derivarNaturezaDia(TERCA, fato)).toBe("feriado");
  });

  it("evento de empresa NÃO produtivo numa quinta-feira -> feriado", () => {
    const fato: FatoCalendarioDia = { produtivo: false, origem: "evento_empresa" };
    expect(derivarNaturezaDia(QUINTA, fato)).toBe("feriado");
  });

  it("evento de empresa PRODUTIVO numa sexta-feira -> normal (produtivo=true não é feriado)", () => {
    const fato: FatoCalendarioDia = { produtivo: true, origem: "evento_empresa" };
    expect(derivarNaturezaDia(SEXTA, fato)).toBe("normal");
  });

  it("feriado oficial num sábado continua feriado, não sabado", () => {
    const fato: FatoCalendarioDia = { produtivo: false, origem: "feriado_oficial" };
    expect(derivarNaturezaDia(SABADO, fato)).toBe("feriado");
  });
});

describe("naturezaDiaParaCapacidadeExtra", () => {
  it("normal (dia útil) vira hora_extra", () => {
    expect(naturezaDiaParaCapacidadeExtra("normal")).toBe("hora_extra");
  });

  it("sabado/domingo/feriado passam direto", () => {
    expect(naturezaDiaParaCapacidadeExtra("sabado")).toBe("sabado");
    expect(naturezaDiaParaCapacidadeExtra("domingo")).toBe("domingo");
    expect(naturezaDiaParaCapacidadeExtra("feriado")).toBe("feriado");
  });
});
