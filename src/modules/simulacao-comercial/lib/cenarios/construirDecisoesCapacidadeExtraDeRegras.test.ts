import { describe, expect, it } from "vitest";
import {
  construirDecisoesCapacidadeExtraDeRegras,
  encontrarDataSemConvencaoAplicavel,
  encontrarRegraConflitante,
  type RegraSemanalCapacidadeExtra,
} from "./construirDecisoesCapacidadeExtraDeRegras";
import { calcularCustoContratacoes } from "./contratacao";
import { derivarNaturezaDia, type FatoCalendarioDia, type NaturezaDia } from "./derivarNaturezaDia";
import type { ConvencaoHorasAdicionaisVigencia } from "./resolverConvencaoParaData";
import type { DiasRegraSemanal } from "./expandirRegraSemanal";

// Âncoras de calendário: 2026-09-14 é segunda-feira ("semana de 14/09 a
// 20/09/2026", mesmo exemplo usado pelo usuário); 2026-09-21 é a segunda
// seguinte (semana seguinte); 2026-01-05 é segunda-feira (âncora já
// usada no resto desta pasta).
const padraoSemanalProdutivo: FatoCalendarioDia = { produtivo: true, origem: "padrao_semanal" };
function resolverNatureza(data: string): NaturezaDia {
  return derivarNaturezaDia(data, padraoSemanalProdutivo);
}

function diasVazios(): DiasRegraSemanal {
  return { diasUteis: [], sabado: false, domingo: false, feriado: false };
}

function convencao(overrides: Partial<ConvencaoHorasAdicionaisVigencia> = {}): ConvencaoHorasAdicionaisVigencia {
  return {
    percentualSegundaSexta: 0.3,
    percentualSabado: 0.5,
    percentualDomingo: 1.0,
    percentualFeriado: 1.0,
    vigenteDesde: "2026-01-01",
    vigenteAte: null,
    ...overrides,
  };
}

function regra(overrides: Partial<RegraSemanalCapacidadeExtra> = {}): RegraSemanalCapacidadeExtra {
  return {
    recursoId: "recurso-A",
    semanaInicio: "2026-01-05",
    dias: { ...diasVazios(), diasUteis: [1, 2, 3, 4, 5] },
    horasPorDia: 2,
    ativo: true,
    ...overrides,
  };
}

describe("construirDecisoesCapacidadeExtraDeRegras", () => {
  it("1 regra (segunda a sexta) -> 1 contratação, várias CapacidadeExtraDia com custo = valor-hora × 1,30", () => {
    const resultado = construirDecisoesCapacidadeExtraDeRegras({
      regras: [regra()],
      janelaInicio: "2026-01-05", // segunda
      janelaFim: "2026-01-09", // sexta
      resolverNatureza,
      valorHoraPorRecurso: { "recurso-A": 20 },
      convencoes: [convencao()],
    });

    expect(resultado.capacidadeExtra).toHaveLength(5);
    expect(resultado.contratacoes).toHaveLength(1);
    expect(resultado.contratacoes[0].valor).toBeCloseTo(26, 6); // 20 * 1.30
    expect(new Set(resultado.capacidadeExtra.map((c) => c.contratacaoId)).size).toBe(1);
  });

  it("múltiplas naturezas no mesmo cenário (segunda-sexta + sábado) -> 2 contratações separadas, cada uma com a taxa certa", () => {
    const resultado = construirDecisoesCapacidadeExtraDeRegras({
      regras: [
        regra({ dias: { ...diasVazios(), diasUteis: [1, 2, 3, 4, 5] } }),
        regra({ dias: { ...diasVazios(), sabado: true }, horasPorDia: 8.8 }),
      ],
      janelaInicio: "2026-01-05",
      janelaFim: "2026-01-10", // inclui o sábado 10/01
      resolverNatureza,
      valorHoraPorRecurso: { "recurso-A": 20 },
      convencoes: [convencao()],
    });

    expect(resultado.contratacoes).toHaveLength(2);
    const porTipo = new Map(resultado.contratacoes.map((c) => [c.tipo, c.valor]));
    expect(porTipo.get("hora_extra")).toBeCloseTo(26, 6); // 20*1.30
    expect(porTipo.get("sabado_domingo_feriado")).toBeCloseTo(30, 6); // 20*1.50
  });

  it("regra que atravessa uma troca de vigência vira 2 grupos/contratações, cada uma com sua taxa - sem dupla cobrança", () => {
    const antiga = convencao({ vigenteDesde: "2026-01-01", vigenteAte: "2026-01-06", percentualSegundaSexta: 0.2 });
    const nova = convencao({ vigenteDesde: "2026-01-07", vigenteAte: null, percentualSegundaSexta: 0.4 });

    const resultado = construirDecisoesCapacidadeExtraDeRegras({
      regras: [regra()], // segunda a sexta, semana de 05 a 11/01
      janelaInicio: "2026-01-05", // segunda (convenção antiga)
      janelaFim: "2026-01-09", // sexta (convenção nova a partir de 07/01)
      resolverNatureza,
      valorHoraPorRecurso: { "recurso-A": 10 },
      convencoes: [antiga, nova],
    });

    expect(resultado.contratacoes).toHaveLength(2);
    const valores = resultado.contratacoes.map((c) => c.valor).sort((a, b) => a - b);
    expect(valores[0]).toBeCloseTo(12, 6); // 10 * 1.20 (antiga: 05,06/01)
    expect(valores[1]).toBeCloseTo(14, 6); // 10 * 1.40 (nova: 07,08,09/01)

    // 5 dias expandidos, cada um com exatamente 1 contratacaoId, nenhuma data duplicada.
    expect(resultado.capacidadeExtra).toHaveLength(5);
    const datas = resultado.capacidadeExtra.map((c) => c.data).sort();
    expect(datas).toEqual(["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"]);
    expect(new Set(datas).size).toBe(datas.length); // nenhuma data duplicada = sem dupla cobrança
  });

  it("bloqueia (lança erro) quando uma data não tem convenção aplicável - nunca assume custo zero", () => {
    expect(() =>
      construirDecisoesCapacidadeExtraDeRegras({
        regras: [regra()],
        janelaInicio: "2026-01-05",
        janelaFim: "2026-01-09",
        resolverNatureza,
        valorHoraPorRecurso: { "recurso-A": 20 },
        convencoes: [], // nenhuma convenção cadastrada
      }),
    ).toThrow(RangeError);
  });

  it("regra ativo=false não gera nenhuma CapacidadeExtraDia nem Contratacao", () => {
    const resultado = construirDecisoesCapacidadeExtraDeRegras({
      regras: [regra({ ativo: false })],
      janelaInicio: "2026-01-05",
      janelaFim: "2026-01-09",
      resolverNatureza,
      valorHoraPorRecurso: { "recurso-A": 20 },
      convencoes: [convencao()],
    });
    expect(resultado.capacidadeExtra).toEqual([]);
    expect(resultado.contratacoes).toEqual([]);
  });

  // --- Regressão do bug real (teste manual): segunda 1h + terça 1h de
  // UMA ÚNICA semana apresentava 11h porque a regra repetia
  // automaticamente em todas as semanas do cenário. ---

  it("uma única semana: segunda 1h + terça 1h = exatamente 2 horas disponibilizadas, mesmo com janela do cenário muito mais ampla", () => {
    const resultado = construirDecisoesCapacidadeExtraDeRegras({
      regras: [regra({ semanaInicio: "2026-09-14", dias: { ...diasVazios(), diasUteis: [1, 2] }, horasPorDia: 1 })],
      janelaInicio: "2026-08-01",
      janelaFim: "2026-11-30", // ~4 meses - a regra NÃO pode repetir nas outras semanas
      resolverNatureza,
      valorHoraPorRecurso: { "recurso-A": 20 },
      convencoes: [convencao()],
    });

    const totalHoras = resultado.capacidadeExtra.reduce((soma, c) => soma + c.horasAdicionaisDisponiveis, 0);
    expect(totalHoras).toBe(2); // NUNCA 11h (o bug original)
    expect(resultado.capacidadeExtra.map((c) => c.data).sort()).toEqual(["2026-09-14", "2026-09-15"]);
  });

  it("nenhuma repetição nas semanas seguintes: só a semana da regra aparece, nenhuma data de outras semanas", () => {
    const resultado = construirDecisoesCapacidadeExtraDeRegras({
      regras: [regra({ semanaInicio: "2026-09-14", dias: { ...diasVazios(), diasUteis: [1, 2, 3, 4, 5] }, horasPorDia: 2 })],
      janelaInicio: "2026-09-01",
      janelaFim: "2026-10-31", // cruza várias semanas
      resolverNatureza,
      valorHoraPorRecurso: { "recurso-A": 20 },
      convencoes: [convencao()],
    });

    const datas = resultado.capacidadeExtra.map((c) => c.data).sort();
    expect(datas).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"]);
    // Nenhuma data na semana seguinte (21 a 25/09) nem em nenhuma outra.
    expect(datas.some((d) => d >= "2026-09-19")).toBe(false);
  });

  it("corte nos limites da janela: só os dias da semana que caem DENTRO da janela do cenário geram capacidade", () => {
    const resultado = construirDecisoesCapacidadeExtraDeRegras({
      regras: [regra({ semanaInicio: "2026-09-14", dias: { ...diasVazios(), diasUteis: [1, 2, 3, 4, 5] }, horasPorDia: 2 })],
      janelaInicio: "2026-09-16", // corta segunda(14) e terça(15) fora
      janelaFim: "2026-09-30",
      resolverNatureza,
      valorHoraPorRecurso: { "recurso-A": 20 },
      convencoes: [convencao()],
    });

    const datas = resultado.capacidadeExtra.map((c) => c.data).sort();
    expect(datas).toEqual(["2026-09-16", "2026-09-17", "2026-09-18"]); // só quarta, quinta, sexta
  });

  it("regra cuja semana não tem NENHUMA interseção com a janela do cenário não gera nenhuma capacidade (nunca um erro silencioso, mas também nunca vaza pra fora da semana)", () => {
    const resultado = construirDecisoesCapacidadeExtraDeRegras({
      regras: [regra({ semanaInicio: "2026-09-14" })],
      janelaInicio: "2026-10-01",
      janelaFim: "2026-10-31",
      resolverNatureza,
      valorHoraPorRecurso: { "recurso-A": 20 },
      convencoes: [convencao()],
    });
    expect(resultado.capacidadeExtra).toEqual([]);
    expect(resultado.contratacoes).toEqual([]);
  });

  it("duas semanas diferentes (2 regras): cada uma produz só as próprias datas, totais somados corretamente sem se misturar", () => {
    const resultado = construirDecisoesCapacidadeExtraDeRegras({
      regras: [
        regra({ semanaInicio: "2026-09-14", dias: { ...diasVazios(), diasUteis: [1, 2, 3, 4, 5] }, horasPorDia: 2 }), // semana 30-like: seg-sex
        regra({ semanaInicio: "2026-09-21", dias: { ...diasVazios(), sabado: true }, horasPorDia: 8.8 }), // semana seguinte: só sábado
      ],
      janelaInicio: "2026-09-01",
      janelaFim: "2026-09-30",
      resolverNatureza,
      valorHoraPorRecurso: { "recurso-A": 20 },
      convencoes: [convencao()],
    });

    const datasSemana1 = resultado.capacidadeExtra.filter((c) => c.data < "2026-09-21").map((c) => c.data).sort();
    const datasSemana2 = resultado.capacidadeExtra.filter((c) => c.data >= "2026-09-21").map((c) => c.data).sort();
    expect(datasSemana1).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"]);
    expect(datasSemana2).toEqual(["2026-09-26"]); // sábado da semana de 21/09
    expect(resultado.capacidadeExtra).toHaveLength(6);
  });

  it("mesmo recurso em semanas diferentes: 2 regras do mesmo recursoId, cada uma na sua semana, ambas produzem capacidade independentemente", () => {
    const resultado = construirDecisoesCapacidadeExtraDeRegras({
      regras: [
        regra({ recursoId: "recurso-A", semanaInicio: "2026-09-14", dias: { ...diasVazios(), diasUteis: [1] }, horasPorDia: 1 }),
        regra({ recursoId: "recurso-A", semanaInicio: "2026-09-21", dias: { ...diasVazios(), diasUteis: [1] }, horasPorDia: 3 }),
      ],
      janelaInicio: "2026-09-01",
      janelaFim: "2026-09-30",
      resolverNatureza,
      valorHoraPorRecurso: { "recurso-A": 20 },
      convencoes: [convencao()],
    });

    expect(resultado.capacidadeExtra).toHaveLength(2);
    const porData = new Map(resultado.capacidadeExtra.map((c) => [c.data, c.horasAdicionaisDisponiveis]));
    expect(porData.get("2026-09-14")).toBe(1);
    expect(porData.get("2026-09-21")).toBe(3);
  });

  it("custo potencial (toda hora disponibilizada) vs. custo efetivamente utilizado (só o que o escalonador de fato consumiu) são valores diferentes e não devem ser confundidos", () => {
    const resultado = construirDecisoesCapacidadeExtraDeRegras({
      regras: [regra({ semanaInicio: "2026-09-14", dias: { ...diasVazios(), diasUteis: [1, 2] }, horasPorDia: 1 })], // 2h disponibilizadas
      janelaInicio: "2026-09-14",
      janelaFim: "2026-09-15",
      resolverNatureza,
      valorHoraPorRecurso: { "recurso-A": 20 }, // custo/hora = 20*1.30 = 26
      convencoes: [convencao()],
    });

    const contratacaoId = resultado.contratacoes[0].id;

    // Potencial: as 2h disponibilizadas fossem TODAS usadas.
    const horasDisponibilizadas = resultado.capacidadeExtra.reduce((soma, c) => soma + c.horasAdicionaisDisponiveis, 0);
    const custoPotencial = calcularCustoContratacoes({
      contratacoes: resultado.contratacoes,
      horasUsadasPorContratacaoId: new Map([[contratacaoId, horasDisponibilizadas]]),
    });

    // Efetivamente utilizado: o escalonador só precisou de 0,5h.
    const custoUtilizado = calcularCustoContratacoes({
      contratacoes: resultado.contratacoes,
      horasUsadasPorContratacaoId: new Map([[contratacaoId, 0.5]]),
    });

    expect(horasDisponibilizadas).toBe(2);
    expect(custoPotencial.custoTotal).toBeCloseTo(52, 6); // 2h * 26
    expect(custoUtilizado.custoTotal).toBeCloseTo(13, 6); // 0.5h * 26
    expect(custoPotencial.custoTotal).not.toBeCloseTo(custoUtilizado.custoTotal, 6);
  });
});

describe("encontrarDataSemConvencaoAplicavel", () => {
  it("devolve null quando todas as datas têm convenção aplicável", () => {
    const resultado = encontrarDataSemConvencaoAplicavel({
      regras: [regra()],
      janelaInicio: "2026-01-05",
      janelaFim: "2026-01-09",
      resolverNatureza,
      convencoes: [convencao()],
    });
    expect(resultado).toBeNull();
  });

  it("devolve a primeira data sem cobertura", () => {
    const resultado = encontrarDataSemConvencaoAplicavel({
      regras: [regra()],
      janelaInicio: "2026-01-05",
      janelaFim: "2026-01-09",
      resolverNatureza,
      convencoes: [],
    });
    expect(resultado).toBe("2026-01-05");
  });

  it("ignora regras inativas (não bloqueiam mesmo sem convenção)", () => {
    const resultado = encontrarDataSemConvencaoAplicavel({
      regras: [regra({ ativo: false })],
      janelaInicio: "2026-01-05",
      janelaFim: "2026-01-09",
      resolverNatureza,
      convencoes: [],
    });
    expect(resultado).toBeNull();
  });

  it("regra cuja semana está fora da janela não é verificada (nenhuma data a checar)", () => {
    const resultado = encontrarDataSemConvencaoAplicavel({
      regras: [regra({ semanaInicio: "2026-09-14" })],
      janelaInicio: "2026-10-01",
      janelaFim: "2026-10-31",
      resolverNatureza,
      convencoes: [],
    });
    expect(resultado).toBeNull();
  });
});

describe("encontrarRegraConflitante", () => {
  it("mesmo recurso, mesma semana, dia em comum -> conflito detectado", () => {
    const existente = regra({ semanaInicio: "2026-09-14", dias: { ...diasVazios(), diasUteis: [1, 2] } });
    const candidata = regra({ semanaInicio: "2026-09-14", dias: { ...diasVazios(), diasUteis: [2, 3] } }); // terça em comum
    expect(encontrarRegraConflitante([existente], candidata)).toBe(existente);
  });

  it("regra idêntica (duplicada) -> também é conflito", () => {
    const existente = regra({ semanaInicio: "2026-09-14" });
    const candidata = regra({ semanaInicio: "2026-09-14" });
    expect(encontrarRegraConflitante([existente], candidata)).toBe(existente);
  });

  it("mesmo recurso, semanas DIFERENTES -> nenhum conflito", () => {
    const existente = regra({ semanaInicio: "2026-09-14" });
    const candidata = regra({ semanaInicio: "2026-09-21" });
    expect(encontrarRegraConflitante([existente], candidata)).toBeNull();
  });

  it("mesma semana, recursos DIFERENTES -> nenhum conflito", () => {
    const existente = regra({ recursoId: "recurso-A", semanaInicio: "2026-09-14" });
    const candidata = regra({ recursoId: "recurso-B", semanaInicio: "2026-09-14" });
    expect(encontrarRegraConflitante([existente], candidata)).toBeNull();
  });

  it("mesmo recurso e semana, mas dias sem nenhuma interseção -> nenhum conflito", () => {
    const existente = regra({ semanaInicio: "2026-09-14", dias: { ...diasVazios(), diasUteis: [1, 2] } });
    const candidata = regra({ semanaInicio: "2026-09-14", dias: { ...diasVazios(), diasUteis: [3, 4, 5] } });
    expect(encontrarRegraConflitante([existente], candidata)).toBeNull();
  });

  it("regra existente INATIVA nunca conflita, mesmo com sobreposição total", () => {
    const existente = regra({ semanaInicio: "2026-09-14", ativo: false });
    const candidata = regra({ semanaInicio: "2026-09-14" });
    expect(encontrarRegraConflitante([existente], candidata)).toBeNull();
  });

  it("sábado/domingo/feriado em comum também conflitam", () => {
    const existente = regra({ semanaInicio: "2026-09-14", dias: { ...diasVazios(), sabado: true } });
    const candidata = regra({ semanaInicio: "2026-09-14", dias: { ...diasVazios(), sabado: true, domingo: true } });
    expect(encontrarRegraConflitante([existente], candidata)).toBe(existente);
  });
});
