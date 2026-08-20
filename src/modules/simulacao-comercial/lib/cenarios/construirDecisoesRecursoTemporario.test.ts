import { describe, expect, it } from "vitest";
import { construirDecisoesRecursoTemporario, type RecursoTemporarioParaConstruir } from "./construirDecisoesRecursoTemporario";
import type { RecursoTemporarioCenario, TipoRecursoTemporario } from "./recursoTemporario";

function recursoTemporario(overrides: Partial<RecursoTemporarioCenario> = {}): RecursoTemporarioCenario {
  return {
    idTemporario: "temp-1",
    tipo: "freelancer",
    recursoReferenciaId: "recurso-A",
    disponibilidade: [
      { data: "2026-01-12", horasDisponiveis: 8 },
      { data: "2026-01-13", horasDisponiveis: 8 },
    ],
    contratacaoId: "contratacao-temp-1",
    justificativa: "Pico de demanda.",
    aplicavelAsOperacoes: [],
    ...overrides,
  };
}

function item(overrides: Partial<RecursoTemporarioParaConstruir> = {}): RecursoTemporarioParaConstruir {
  return {
    recursoTemporario: recursoTemporario(),
    produtividadeReferencia: 0.9,
    abrangencia: "por_hora_utilizada",
    valor: 60,
    fornecedorOuObservacao: "",
    ...overrides,
  };
}

describe("construirDecisoesRecursoTemporario — os 3 tipos testados separadamente", () => {
  it.each(["maquina_alugada", "equipamento_adicional", "freelancer"] as const)(
    "tipo=%s produz DecisaoRecursoTemporario + Contratacao corretos",
    (tipo: TipoRecursoTemporario) => {
      const resultado = construirDecisoesRecursoTemporario([
        item({ recursoTemporario: recursoTemporario({ tipo, contratacaoId: `contratacao-${tipo}` }) }),
      ]);

      expect(resultado.recursosTemporarios).toHaveLength(1);
      expect(resultado.recursosTemporarios[0].produtividadeReferencia).toBe(0.9);
      expect(resultado.recursosTemporarios[0].recursoTemporario.tipo).toBe(tipo);

      expect(resultado.contratacoes).toHaveLength(1);
      expect(resultado.contratacoes[0]).toMatchObject({ id: `contratacao-${tipo}`, tipo, valor: 60 });
    },
  );
});

describe("construirDecisoesRecursoTemporario", () => {
  it("datas da Contratacao vêm de disponibilidade (dias sob contrato)", () => {
    const resultado = construirDecisoesRecursoTemporario([item()]);
    expect(resultado.contratacoes[0].datas).toEqual(["2026-01-12", "2026-01-13"]);
  });

  it("fornecedorOuObservacao vazio vira 'Não informado'", () => {
    const resultado = construirDecisoesRecursoTemporario([item({ fornecedorOuObservacao: "  " })]);
    expect(resultado.contratacoes[0].fornecedorOuContratado).toBe("Não informado");
  });

  it("custo contabilizado uma única vez: 1 recurso temporário -> exatamente 1 Contratacao", () => {
    const resultado = construirDecisoesRecursoTemporario([item()]);
    expect(resultado.contratacoes).toHaveLength(1);
  });

  it("outros campos de DecisoesCenario ficam vazios (só recursosTemporarios/contratacoes preenchidos)", () => {
    const resultado = construirDecisoesRecursoTemporario([item()]);
    expect(resultado.capacidadeExtra).toEqual([]);
    expect(resultado.terceirizacoes).toEqual([]);
    expect(resultado.antecipacoesMaterial).toEqual([]);
  });

  it("múltiplos recursos temporários -> múltiplas decisões e contratações independentes", () => {
    const resultado = construirDecisoesRecursoTemporario([
      item({ recursoTemporario: recursoTemporario({ idTemporario: "temp-1", contratacaoId: "c-1" }) }),
      item({ recursoTemporario: recursoTemporario({ idTemporario: "temp-2", contratacaoId: "c-2" }) }),
    ]);
    expect(resultado.recursosTemporarios).toHaveLength(2);
    expect(resultado.contratacoes.map((c) => c.id).sort()).toEqual(["c-1", "c-2"]);
  });
});
