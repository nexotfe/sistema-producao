import { describe, expect, it } from "vitest";
import { combinarDecisoesCenario } from "./combinarDecisoesCenario";
import type { DecisoesCenario } from "./avaliarCenario";

const vazio: DecisoesCenario = {
  capacidadeExtra: [],
  contratacoes: [],
  terceirizacoes: [],
  recursosTemporarios: [],
  antecipacoesMaterial: [],
};

const elegibilidade = { escopo: "somente_orcamento_novo" as const };

const antecipacao: DecisoesCenario = {
  ...vazio,
  antecipacoesMaterial: [{ chave: chaveExemplo(), dataDisponibilidadeAntecipada: "2026-08-24", contratacaoId: "contratacao-material" }],
  contratacoes: [
    {
      id: "contratacao-material",
      tipo: "antecipacao_material",
      abrangencia: "valor_fixo_unico",
      valor: 500,
      moeda: "BRL",
      fornecedorOuContratado: "Fornecedor X",
      referenciaProposta: null,
      justificativa: "Antecipação negociada.",
      datas: [],
    },
  ],
};

const capacidadeExtraHoraExtra: DecisoesCenario = {
  ...vazio,
  capacidadeExtra: [
    {
      recursoId: "recurso-A",
      data: "2026-01-12",
      horasAdicionaisDisponiveis: 4,
      natureza: "hora_extra",
      elegibilidade,
      contratacaoId: "contratacao-hora-extra",
    },
  ],
  contratacoes: [
    {
      id: "contratacao-hora-extra",
      tipo: "hora_extra",
      abrangencia: "por_hora_utilizada",
      valor: 50,
      moeda: "BRL",
      fornecedorOuContratado: "Equipe interna",
      referenciaProposta: null,
      justificativa: "Hora extra.",
      datas: ["2026-01-12"],
    },
  ],
};

const capacidadeExtraSabado: DecisoesCenario = {
  ...vazio,
  capacidadeExtra: [
    {
      recursoId: "recurso-A",
      data: "2026-01-10",
      horasAdicionaisDisponiveis: 6,
      natureza: "sabado",
      elegibilidade,
      contratacaoId: "contratacao-sabado",
    },
  ],
  contratacoes: [
    {
      id: "contratacao-sabado",
      tipo: "sabado_domingo_feriado",
      abrangencia: "por_hora_utilizada",
      valor: 60,
      moeda: "BRL",
      fornecedorOuContratado: "Equipe interna",
      referenciaProposta: null,
      justificativa: "Sábado.",
      datas: ["2026-01-10"],
    },
  ],
};

function chaveExemplo() {
  return {
    projetoItemId: "item-1",
    produtoRaizId: "produto-1",
    caminhoBomItemIds: [],
    bomOperacaoId: "op-1",
  };
}

describe("combinarDecisoesCenario", () => {
  it("com lista vazia devolve DecisoesCenario todo vazio", () => {
    expect(combinarDecisoesCenario([])).toEqual(vazio);
  });

  it("com só antecipação de material, devolve as decisões da antecipação e o resto vazio", () => {
    const combinado = combinarDecisoesCenario([antecipacao]);
    expect(combinado.antecipacoesMaterial).toEqual(antecipacao.antecipacoesMaterial);
    expect(combinado.contratacoes).toEqual(antecipacao.contratacoes);
    expect(combinado.capacidadeExtra).toEqual([]);
    expect(combinado.terceirizacoes).toEqual([]);
    expect(combinado.recursosTemporarios).toEqual([]);
  });

  it("com só capacidade extra, devolve as decisões da capacidade extra e o resto vazio", () => {
    const combinado = combinarDecisoesCenario([capacidadeExtraHoraExtra]);
    expect(combinado.capacidadeExtra).toEqual(capacidadeExtraHoraExtra.capacidadeExtra);
    expect(combinado.contratacoes).toEqual(capacidadeExtraHoraExtra.contratacoes);
    expect(combinado.antecipacoesMaterial).toEqual([]);
  });

  it("combina antecipação de material + capacidade extra sem perder nenhum array", () => {
    const combinado = combinarDecisoesCenario([antecipacao, capacidadeExtraHoraExtra]);
    expect(combinado.antecipacoesMaterial).toEqual(antecipacao.antecipacoesMaterial);
    expect(combinado.capacidadeExtra).toEqual(capacidadeExtraHoraExtra.capacidadeExtra);
    expect(combinado.contratacoes).toEqual([...antecipacao.contratacoes, ...capacidadeExtraHoraExtra.contratacoes]);
  });

  it("combina múltiplas naturezas de capacidade extra (hora extra + sábado) no mesmo cenário", () => {
    const combinado = combinarDecisoesCenario([capacidadeExtraHoraExtra, capacidadeExtraSabado]);
    expect(combinado.capacidadeExtra).toHaveLength(2);
    expect(combinado.capacidadeExtra.map((c) => c.natureza).sort()).toEqual(["hora_extra", "sabado"]);
    expect(combinado.contratacoes).toHaveLength(2);
  });
});
