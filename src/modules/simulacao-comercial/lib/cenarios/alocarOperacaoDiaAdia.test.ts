import { describe, expect, it } from "vitest";
import {
  alocarOperacaoDiaAdia,
  type CandidatoComCapacidadeDiaria,
  type FaixaCapacidadeDia,
  type NaturezaCapacidade,
} from "./alocarOperacaoDiaAdia";
import type { ElegibilidadeCapacidadeExtra } from "./capacidadeDia";
import { horasPadraoParaHorasMaquina } from "./unidades";

const PROJETO_ORCAMENTO_NOVO = "projeto-orcamento-novo";

/** Candidato só com faixa "normal" - para os testes que não envolvem hora extra/elegibilidade. */
function criarCandidatoSimples(id: string, produtividade: number, capacidadePorData: Record<string, number>): CandidatoComCapacidadeDiaria {
  const restante = { ...capacidadePorData };
  return {
    id,
    produtividade,
    faixasDoDia: (data) =>
      data in restante ? [{ natureza: "normal", horasDisponiveis: restante[data], contratacaoId: null, elegibilidade: null }] : [],
    consumir: (data, _natureza, horasMaquina) => {
      restante[data] = (restante[data] ?? 0) - horasMaquina;
    },
  };
}

type FaixaConfig = { natureza: NaturezaCapacidade; horas: number; contratacaoId?: string | null; elegibilidade?: ElegibilidadeCapacidadeExtra | null };

/** Candidato com controle total das faixas por data/natureza - para testes de normal×extra×elegibilidade. */
function criarCandidatoComFaixas(id: string, produtividade: number, faixasPorData: Record<string, FaixaConfig[]>): CandidatoComCapacidadeDiaria {
  const estado: Record<string, Required<FaixaConfig>[]> = Object.fromEntries(
    Object.entries(faixasPorData).map(([data, faixas]) => [
      data,
      faixas.map((f) => ({ contratacaoId: null, elegibilidade: null, ...f })),
    ]),
  );
  return {
    id,
    produtividade,
    faixasDoDia: (data): FaixaCapacidadeDia[] =>
      (estado[data] ?? []).map((f) => ({
        natureza: f.natureza,
        horasDisponiveis: f.horas,
        contratacaoId: f.contratacaoId,
        elegibilidade: f.elegibilidade,
      })),
    consumir: (data, natureza, horasMaquina) => {
      const faixa = (estado[data] ?? []).find((f) => f.natureza === natureza);
      if (faixa) faixa.horas -= horasMaquina;
    },
  };
}

function alocar(overrides: {
  necessarioHorasPadrao: number;
  candidatosPorPrioridade: CandidatoComCapacidadeDiaria[];
  datasOrdenadas: string[];
  projetoId?: string;
  ehOrcamentoNovo?: boolean;
}) {
  return alocarOperacaoDiaAdia({
    projetoId: PROJETO_ORCAMENTO_NOVO,
    ehOrcamentoNovo: true,
    ...overrides,
  });
}

describe("alocarOperacaoDiaAdia — casos básicos", () => {
  it("necessário cabe no primeiro dia: aloca tudo num dia só", () => {
    const candidato = criarCandidatoSimples("TCN-001", 0.9, { "2026-11-09": 8 });
    const resultado = alocar({ necessarioHorasPadrao: 2, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09"] });

    expect(resultado.deficitResidualHorasPadrao).toBe(0);
    expect(resultado.alocacoes).toHaveLength(1);
    expect(resultado.alocacoes[0]).toMatchObject({ data: "2026-11-09", natureza: "normal", contratacaoId: null });
    expect(resultado.alocacoes[0].horasPadrao).toBeCloseTo(2, 10);
    expect(resultado.alocacoes[0].horasMaquina).toBeCloseTo(2 / 0.9, 10);
  });

  it("necessário maior que 1 dia: aloca em múltiplos dias, em ordem cronológica", () => {
    const candidato = criarCandidatoSimples("TCN-001", 1, { "2026-11-09": 7.2, "2026-11-10": 7.2, "2026-11-11": 7.2 });
    const resultado = alocar({
      necessarioHorasPadrao: 14.4,
      candidatosPorPrioridade: [candidato],
      datasOrdenadas: ["2026-11-09", "2026-11-10", "2026-11-11"],
    });

    expect(resultado.deficitResidualHorasPadrao).toBe(0);
    expect(resultado.alocacoes.map((a) => a.data)).toEqual(["2026-11-09", "2026-11-10"]);
  });

  it("déficit residual quando a capacidade total não cobre o necessário", () => {
    const candidato = criarCandidatoSimples("TCN-001", 1, { "2026-11-09": 5 });
    const resultado = alocar({ necessarioHorasPadrao: 20, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09"] });

    expect(resultado.deficitResidualHorasPadrao).toBe(15);
    expect(resultado.alocacoes[0].horasPadrao).toBe(5);
  });

  it("candidato sem capacidade em nenhuma data: déficit total, nenhuma alocação", () => {
    const candidato = criarCandidatoSimples("TCN-001", 1, {});
    const resultado = alocar({ necessarioHorasPadrao: 10, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09", "2026-11-10"] });

    expect(resultado.deficitResidualHorasPadrao).toBe(10);
    expect(resultado.alocacoes).toHaveLength(0);
  });

  it("necessário zero: conclui de imediato, sem alocação, sem déficit", () => {
    const candidato = criarCandidatoSimples("TCN-001", 1, { "2026-11-09": 8 });
    const resultado = alocar({ necessarioHorasPadrao: 0, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09"] });

    expect(resultado.deficitResidualHorasPadrao).toBe(0);
    expect(resultado.alocacoes).toHaveLength(0);
  });
});

describe("alocarOperacaoDiaAdia — ordem correta: data externa, candidato interno", () => {
  it("candidato de prioridade menor, disponível só nos primeiros dias, é usado nesses dias - não é ignorado esperando o de prioridade maior", () => {
    const original = criarCandidatoSimples("TCN-001", 1, { "2026-11-11": 10 });
    const alugado = criarCandidatoSimples("TORNO-ALUGADO-A", 1, { "2026-11-09": 6, "2026-11-10": 6 });

    const resultado = alocar({
      necessarioHorasPadrao: 18,
      candidatosPorPrioridade: [original, alugado],
      datasOrdenadas: ["2026-11-09", "2026-11-10", "2026-11-11"],
    });

    expect(resultado.deficitResidualHorasPadrao).toBe(0);
    expect(resultado.alocacoes.map((a) => [a.recursoId, a.data])).toEqual([
      ["TORNO-ALUGADO-A", "2026-11-09"],
      ["TORNO-ALUGADO-A", "2026-11-10"],
      ["TCN-001", "2026-11-11"],
    ]);
  });

  it("BUG QUE ESTA ORDEM CORRIGE: um algoritmo 'esgota candidato antes de avançar' ignoraria a disponibilidade restrita do alugado nos dias iniciais", () => {
    const original = criarCandidatoSimples("TCN-001", 1, { "2026-11-10": 8, "2026-11-11": 8 });
    const alugado = criarCandidatoSimples("TORNO-ALUGADO-A", 1, { "2026-11-09": 4 });

    const resultado = alocar({
      necessarioHorasPadrao: 20,
      candidatosPorPrioridade: [original, alugado],
      datasOrdenadas: ["2026-11-09", "2026-11-10", "2026-11-11"],
    });

    expect(resultado.deficitResidualHorasPadrao).toBe(0);
    const alocacao09 = resultado.alocacoes.find((a) => a.data === "2026-11-09");
    expect(alocacao09?.recursoId).toBe("TORNO-ALUGADO-A");
    expect(alocacao09?.horasPadrao).toBe(4);
  });

  it("dois candidatos disponíveis no MESMO dia: o de prioridade maior aloca primeiro, o de prioridade menor só pega o que sobra", () => {
    const original = criarCandidatoSimples("TCN-001", 1, { "2026-11-09": 5 });
    const compativel = criarCandidatoSimples("COMPAT-01", 1, { "2026-11-09": 5 });

    const resultado = alocar({ necessarioHorasPadrao: 7, candidatosPorPrioridade: [original, compativel], datasOrdenadas: ["2026-11-09"] });

    expect(resultado.alocacoes).toEqual([
      { recursoId: "TCN-001", data: "2026-11-09", natureza: "normal", contratacaoId: null, horasMaquina: 5, horasPadrao: 5 },
      { recursoId: "COMPAT-01", data: "2026-11-09", natureza: "normal", contratacaoId: null, horasMaquina: 2, horasPadrao: 2 },
    ]);
  });
});

describe("alocarOperacaoDiaAdia — conversão de unidade entre candidatos com produtividades diferentes", () => {
  it("o mesmo necessário-padrão consome quantidades diferentes de horas de máquina de candidatos com produtividade diferente", () => {
    const noventa = criarCandidatoSimples("R-90", 0.9, { "2026-11-09": 100 });
    const resultado90 = alocar({ necessarioHorasPadrao: 2, candidatosPorPrioridade: [noventa], datasOrdenadas: ["2026-11-09"] });
    expect(resultado90.alocacoes[0].horasMaquina).toBeCloseTo(2 / 0.9, 10);

    const cinquenta = criarCandidatoSimples("R-50", 0.5, { "2026-11-09": 100 });
    const resultado50 = alocar({ necessarioHorasPadrao: 2, candidatosPorPrioridade: [cinquenta], datasOrdenadas: ["2026-11-09"] });
    expect(resultado50.alocacoes[0].horasMaquina).toBeCloseTo(4, 10);
  });

  it("saldo de horas-padrão restante é recalculado em horas de máquina do PRÓXIMO candidato ao trocar de recurso", () => {
    const original = criarCandidatoSimples("TCN-001", 0.9, { "2026-11-09": 1 });
    const compativel = criarCandidatoSimples("COMPAT-50", 0.5, { "2026-11-09": 10 });

    const resultado = alocar({ necessarioHorasPadrao: 2, candidatosPorPrioridade: [original, compativel], datasOrdenadas: ["2026-11-09"] });

    expect(resultado.alocacoes[0]).toMatchObject({ recursoId: "TCN-001", horasMaquina: 1, horasPadrao: 0.9 });
    expect(resultado.alocacoes[1]).toMatchObject({ recursoId: "COMPAT-50" });
    expect(resultado.alocacoes[1].horasMaquina).toBeCloseTo(2.2, 10);
    expect(resultado.alocacoes[1].horasPadrao).toBeCloseTo(1.1, 10);
    expect(resultado.deficitResidualHorasPadrao).toBe(0);
  });
});

describe("alocarOperacaoDiaAdia — normal antes de extra, elegibilidade respeitada", () => {
  it("consome a faixa normal inteira antes de tocar a extra, mesmo com extra disponível", () => {
    const candidato = criarCandidatoComFaixas("TCN-001", 1, {
      "2026-11-14": [
        { natureza: "sabado", horas: 5, contratacaoId: "ctr-sabado", elegibilidade: { escopo: "qualquer_projeto_do_cenario" } },
      ],
    });
    // Sábado normalmente não tem faixa "normal" (jornada = 0) - só a extra existe.
    const resultado = alocar({ necessarioHorasPadrao: 3, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-14"] });

    expect(resultado.alocacoes).toEqual([
      { recursoId: "TCN-001", data: "2026-11-14", natureza: "sabado", contratacaoId: "ctr-sabado", horasMaquina: 3, horasPadrao: 3 },
    ]);
  });

  it("dia útil com normal + hora extra: normal é consumida primeiro, extra só entra depois de esgotar a normal", () => {
    const candidato = criarCandidatoComFaixas("TCN-001", 1, {
      "2026-11-10": [
        { natureza: "normal", horas: 8 },
        { natureza: "hora_extra", horas: 2, contratacaoId: "ctr-he", elegibilidade: { escopo: "qualquer_projeto_do_cenario" } },
      ],
    });

    const resultado = alocar({ necessarioHorasPadrao: 9, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-10"] });

    expect(resultado.deficitResidualHorasPadrao).toBe(0);
    expect(resultado.alocacoes).toEqual([
      { recursoId: "TCN-001", data: "2026-11-10", natureza: "normal", contratacaoId: null, horasMaquina: 8, horasPadrao: 8 },
      { recursoId: "TCN-001", data: "2026-11-10", natureza: "hora_extra", contratacaoId: "ctr-he", horasMaquina: 1, horasPadrao: 1 },
    ]);
  });

  it("projeto elegível (somente_orcamento_novo, é o orçamento novo) consome a extra", () => {
    const candidato = criarCandidatoComFaixas("TCN-001", 1, {
      "2026-11-10": [{ natureza: "hora_extra", horas: 4, contratacaoId: "ctr-he", elegibilidade: { escopo: "somente_orcamento_novo" } }],
    });

    const resultado = alocar({
      necessarioHorasPadrao: 3,
      candidatosPorPrioridade: [candidato],
      datasOrdenadas: ["2026-11-10"],
      projetoId: PROJETO_ORCAMENTO_NOVO,
      ehOrcamentoNovo: true,
    });

    expect(resultado.deficitResidualHorasPadrao).toBe(0);
    expect(resultado.alocacoes[0].natureza).toBe("hora_extra");
  });

  it("projeto NÃO elegível (somente_orcamento_novo, mas este é um projeto concorrente antigo) NUNCA consome a extra - fica em déficit mesmo com extra disponível", () => {
    const candidato = criarCandidatoComFaixas("TCN-001", 1, {
      "2026-11-10": [{ natureza: "hora_extra", horas: 4, contratacaoId: "ctr-he", elegibilidade: { escopo: "somente_orcamento_novo" } }],
    });

    const resultado = alocar({
      necessarioHorasPadrao: 3,
      candidatosPorPrioridade: [candidato],
      datasOrdenadas: ["2026-11-10"],
      projetoId: "projeto-concorrente-antigo",
      ehOrcamentoNovo: false,
    });

    expect(resultado.deficitResidualHorasPadrao).toBe(3);
    expect(resultado.alocacoes).toHaveLength(0);
  });

  it("projeto não elegível para a extra deste recurso ainda assim usa a normal de OUTRO recurso disponível na fila", () => {
    const semExtraParaEsteProjeto = criarCandidatoComFaixas("TCN-001", 1, {
      "2026-11-10": [{ natureza: "hora_extra", horas: 10, contratacaoId: "ctr-he", elegibilidade: { escopo: "somente_orcamento_novo" } }],
    });
    const compativelNormal = criarCandidatoSimples("COMPAT-01", 1, { "2026-11-10": 3 });

    const resultado = alocar({
      necessarioHorasPadrao: 3,
      candidatosPorPrioridade: [semExtraParaEsteProjeto, compativelNormal],
      datasOrdenadas: ["2026-11-10"],
      projetoId: "projeto-concorrente-antigo",
      ehOrcamentoNovo: false,
    });

    expect(resultado.deficitResidualHorasPadrao).toBe(0);
    expect(resultado.alocacoes).toEqual([
      { recursoId: "COMPAT-01", data: "2026-11-10", natureza: "normal", contratacaoId: null, horasMaquina: 3, horasPadrao: 3 },
    ]);
  });

  it("horas extras utilizadas são recuperáveis somando as alocações com natureza != normal", () => {
    const candidato = criarCandidatoComFaixas("TCN-001", 1, {
      "2026-11-10": [
        { natureza: "normal", horas: 5 },
        { natureza: "hora_extra", horas: 10, contratacaoId: "ctr-he", elegibilidade: { escopo: "qualquer_projeto_do_cenario" } },
      ],
    });

    const resultado = alocar({ necessarioHorasPadrao: 8, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-10"] });

    const horasExtrasUtilizadas = resultado.alocacoes
      .filter((a) => a.natureza !== "normal")
      .reduce((soma, a) => soma + a.horasPadrao, 0);
    expect(horasExtrasUtilizadas).toBe(3); // 8 necessário - 5 normal = 3 de extra
  });
});

describe("alocarOperacaoDiaAdia — validações defensivas (NaN, infinito, valores inválidos)", () => {
  it("rejeita necessarioHorasPadrao negativo, NaN ou infinito", () => {
    const candidato = criarCandidatoSimples("TCN-001", 1, { "2026-11-09": 8 });
    expect(() => alocar({ necessarioHorasPadrao: -1, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09"] })).toThrow(RangeError);
    expect(() => alocar({ necessarioHorasPadrao: NaN, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09"] })).toThrow(RangeError);
    expect(() => alocar({ necessarioHorasPadrao: Infinity, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09"] })).toThrow(RangeError);
  });

  it("rejeita datasOrdenadas fora de ordem ou com repetição", () => {
    const candidato = criarCandidatoSimples("TCN-001", 1, { "2026-11-09": 8 });
    expect(() =>
      alocar({ necessarioHorasPadrao: 1, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-10", "2026-11-09"] }),
    ).toThrow(RangeError);
    expect(() =>
      alocar({ necessarioHorasPadrao: 1, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09", "2026-11-09"] }),
    ).toThrow(RangeError);
  });

  it("rejeita candidato com produtividade zero, negativa, >1 ou NaN, mesmo que nunca chegue a ser usado no loop", () => {
    const invalido = criarCandidatoSimples("TCN-INVALIDO", 0, { "2026-11-09": 8 });
    expect(() => alocar({ necessarioHorasPadrao: 0, candidatosPorPrioridade: [invalido], datasOrdenadas: ["2026-11-09"] })).toThrow(RangeError);
  });

  it("rejeita horasDisponiveis negativa retornada por um candidato durante a alocação", () => {
    const candidatoMalComportado: CandidatoComCapacidadeDiaria = {
      id: "TCN-001",
      produtividade: 1,
      faixasDoDia: () => [{ natureza: "normal", horasDisponiveis: -5, contratacaoId: null, elegibilidade: null }],
      consumir: () => {},
    };
    expect(() =>
      alocar({ necessarioHorasPadrao: 1, candidatosPorPrioridade: [candidatoMalComportado], datasOrdenadas: ["2026-11-09"] }),
    ).toThrow(RangeError);
  });

  it("rejeita candidatosPorPrioridade com id duplicado", () => {
    const a = criarCandidatoSimples("TCN-001", 1, { "2026-11-09": 4 });
    const b = criarCandidatoSimples("TCN-001", 1, { "2026-11-09": 4 }); // mesmo id, estado independente
    expect(() => alocar({ necessarioHorasPadrao: 1, candidatosPorPrioridade: [a, b], datasOrdenadas: ["2026-11-09"] })).toThrow(RangeError);
  });
});

describe("alocarOperacaoDiaAdia — tolerância de ponto flutuante, sem déficit fantasma", () => {
  it("soma de parcelas com resíduo clássico de ponto flutuante (0.1 + 0.2) fecha déficit exatamente zero", () => {
    const candidato = criarCandidatoSimples("TCN-001", 1, { "2026-11-09": 0.1, "2026-11-10": 0.2 });
    const resultado = alocar({ necessarioHorasPadrao: 0.3, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09", "2026-11-10"] });

    expect(resultado.deficitResidualHorasPadrao).toBe(0);
  });

  it("produtividades diferentes que geram resíduo na ida/volta de unidade não deixam déficit residual maior que zero", () => {
    const um = criarCandidatoSimples("R-1", 0.7, { "2026-11-09": 100 });
    const dois = criarCandidatoSimples("R-2", 0.3, { "2026-11-09": 100 });

    const resultado = alocar({
      necessarioHorasPadrao: 10 / 3, // dízima - risco real de resíduo
      candidatosPorPrioridade: [um, dois],
      datasOrdenadas: ["2026-11-09"],
    });

    expect(resultado.deficitResidualHorasPadrao).toBe(0);
  });
});

describe("alocarOperacaoDiaAdia — recálculo de horasMaquina após limitar horasPadrao ao restante", () => {
  it("horasPadrao nunca excede o restante mesmo quando a ida/volta de unidade produz excesso de ponto flutuante, e o horasMaquina consumido é sempre o recálculo formal a partir desse horasPadrao já limitado", () => {
    // produtividade=0.3, necessario=100: a ida/volta horasPadrao/produtividade
    // e volta produz um excesso de ponto flutuante (100.00000000000001,
    // não 100) se horasPadrao não for limitado ao restante - é essa
    // capadura que este teste prova (não uma identidade bit a bit entre
    // horasMaquina*produtividade e horasPadrao, que a IEEE 754 não
    // garante em geral: 333.33333333333337 * 0.3 = 100.00000000000001,
    // não 100 - por isso o motor recalcula horasMaquina A PARTIR do
    // horasPadrao já limitado, na mesma direção que consumir() recebe,
    // em vez de comparar as duas conversões entre si).
    const produtividade = 0.3;
    const consumosRegistrados: number[] = [];
    const candidato: CandidatoComCapacidadeDiaria = {
      id: "R-0.3",
      produtividade,
      faixasDoDia: () => [{ natureza: "normal", horasDisponiveis: 1000, contratacaoId: null, elegibilidade: null }],
      consumir: (_data, _natureza, horasMaquina) => {
        consumosRegistrados.push(horasMaquina);
      },
    };

    const resultado = alocar({ necessarioHorasPadrao: 100, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09"] });

    expect(consumosRegistrados).toHaveLength(1);
    const horasMaquinaConsumido = consumosRegistrados[0];
    const horasPadraoAlocado = resultado.alocacoes[0].horasPadrao;

    expect(horasPadraoAlocado).toBe(100); // limitado ao restante exato, sem excesso
    // O horasMaquina passado a consumir() é exatamente o recálculo
    // horasPadraoParaHorasMaquina(horasPadrao_ja_limitado, produtividade)
    // - a mesma fórmula, com o valor JÁ capeado - não o valor calculado
    // antes do capeamento.
    expect(horasMaquinaConsumido).toBe(horasPadraoParaHorasMaquina(horasPadraoAlocado, produtividade));
    expect(resultado.deficitResidualHorasPadrao).toBe(0);
  });
});

describe("alocarOperacaoDiaAdia — invariantes de FaixaCapacidadeDia validadas explicitamente", () => {
  it("rejeita duas faixas com a mesma natureza no mesmo dia (natureza precisa identificar a faixa unicamente)", () => {
    const candidato: CandidatoComCapacidadeDiaria = {
      id: "TCN-001",
      produtividade: 1,
      faixasDoDia: () => [
        { natureza: "hora_extra", horasDisponiveis: 2, contratacaoId: "ctr-1", elegibilidade: { escopo: "qualquer_projeto_do_cenario" } },
        { natureza: "hora_extra", horasDisponiveis: 3, contratacaoId: "ctr-2", elegibilidade: { escopo: "qualquer_projeto_do_cenario" } },
      ],
      consumir: () => {},
    };
    expect(() => alocar({ necessarioHorasPadrao: 1, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09"] })).toThrow(RangeError);
  });

  it("rejeita faixa normal com contratacaoId ou elegibilidade não nulos", () => {
    const candidato: CandidatoComCapacidadeDiaria = {
      id: "TCN-001",
      produtividade: 1,
      faixasDoDia: () => [{ natureza: "normal", horasDisponiveis: 8, contratacaoId: "ctr-1", elegibilidade: null }],
      consumir: () => {},
    };
    expect(() => alocar({ necessarioHorasPadrao: 1, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09"] })).toThrow(RangeError);
  });

  it("rejeita faixa extra com contratacaoId nulo", () => {
    const candidato: CandidatoComCapacidadeDiaria = {
      id: "TCN-001",
      produtividade: 1,
      faixasDoDia: () => [{ natureza: "sabado", horasDisponiveis: 5, contratacaoId: null, elegibilidade: { escopo: "qualquer_projeto_do_cenario" } }],
      consumir: () => {},
    };
    expect(() => alocar({ necessarioHorasPadrao: 1, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09"] })).toThrow(RangeError);
  });

  it("rejeita faixa extra com elegibilidade nula", () => {
    const candidato: CandidatoComCapacidadeDiaria = {
      id: "TCN-001",
      produtividade: 1,
      faixasDoDia: () => [{ natureza: "feriado", horasDisponiveis: 5, contratacaoId: "ctr-1", elegibilidade: null }],
      consumir: () => {},
    };
    expect(() => alocar({ necessarioHorasPadrao: 1, candidatosPorPrioridade: [candidato], datasOrdenadas: ["2026-11-09"] })).toThrow(RangeError);
  });
});

describe("alocarOperacaoDiaAdia — mutação controlada: saldo compartilhado vs. cenários independentes", () => {
  it("duas ocorrências (2 chamadas) usando a MESMA instância de candidato no mesmo recurso/data compartilham o mesmo saldo - a segunda vê o consumo da primeira", () => {
    const candidatoCompartilhado = criarCandidatoSimples("TCN-001", 1, { "2026-11-09": 8 });

    const primeiraOcorrencia = alocar({ necessarioHorasPadrao: 5, candidatosPorPrioridade: [candidatoCompartilhado], datasOrdenadas: ["2026-11-09"] });
    expect(primeiraOcorrencia.deficitResidualHorasPadrao).toBe(0);

    const segundaOcorrencia = alocar({ necessarioHorasPadrao: 5, candidatosPorPrioridade: [candidatoCompartilhado], datasOrdenadas: ["2026-11-09"] });
    // só sobravam 3h depois da primeira ocorrência ter consumido 5 das 8h.
    expect(segundaOcorrencia.alocacoes[0].horasPadrao).toBe(3);
    expect(segundaOcorrencia.deficitResidualHorasPadrao).toBe(2);
  });

  it("dois cenários independentes (candidatos construídos separadamente a partir da mesma base) não se contaminam", () => {
    const construirCenario = () => criarCandidatoSimples("TCN-001", 1, { "2026-11-09": 8 });

    const cenarioA = alocar({ necessarioHorasPadrao: 5, candidatosPorPrioridade: [construirCenario()], datasOrdenadas: ["2026-11-09"] });
    const cenarioB = alocar({ necessarioHorasPadrao: 5, candidatosPorPrioridade: [construirCenario()], datasOrdenadas: ["2026-11-09"] });

    // Os dois cenários partem da MESMA base (8h) e pedem o MESMO necessário -
    // se houvesse contaminação, o segundo veria menos capacidade que o primeiro.
    expect(cenarioA.alocacoes[0].horasPadrao).toBe(5);
    expect(cenarioB.alocacoes[0].horasPadrao).toBe(5);
    expect(cenarioA.deficitResidualHorasPadrao).toBe(0);
    expect(cenarioB.deficitResidualHorasPadrao).toBe(0);
  });
});
