// PCP — Etapas 51 e 53A: fixtures isoladas, nenhuma gravação no Supabase.
import { describe, expect, it } from "vitest";
import { classificarPrazoOfPcp, type ProgramacaoVigenteParaPrazoPcp } from "./classificarPrazoOfPcp";

const JANELA_VIGENTE: Pick<ProgramacaoVigenteParaPrazoPcp, "janelaInicio" | "janelaFim"> = {
  janelaInicio: "2026-11-01",
  janelaFim: "2026-11-10",
};
const HOJE_DENTRO_DA_JANELA = "2026-11-05";

// Valores padrão (Etapa 53A ainda não entra em cena) para os testes da Etapa 51 que não
// mencionam operação não aplicável nem resolvida - preserva o comportamento original deles.
const SEM_NAO_APLICAVEL_SEM_RESOLVIDA = { existemOperacoesNaoAplicaveis: false, existemOperacoesResolvidas: false };

function programacao(params: {
  versaoOrigem?: number;
  versaoAtual?: number;
  janelaFim?: string;
  operacoes: ProgramacaoVigenteParaPrazoPcp["operacoes"];
}): ProgramacaoVigenteParaPrazoPcp {
  return {
    empresaCapacidadeVersaoOrigem: params.versaoOrigem ?? 10,
    versaoCapacidadeAtual: params.versaoAtual ?? 10,
    janelaInicio: JANELA_VIGENTE.janelaInicio,
    janelaFim: params.janelaFim ?? JANELA_VIGENTE.janelaFim,
    operacoes: params.operacoes,
  };
}

describe("classificarPrazoOfPcp", () => {
  it("1. OF com uma única operação concluída: previsão disponível com o término dela", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-1"],
      ...SEM_NAO_APLICAVEL_SEM_RESOLVIDA,
      programacaoVigente: programacao({
        operacoes: [{ ofId: "of-1", opId: "op-1", status: "concluida", dataFimPrevista: "2026-11-07", deficitResidual: 0, alocacoesLength: 3 }],
      }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado).toEqual({
      estado: "previsao_disponivel",
      terminoPrevisto: "2026-11-07",
      operacoes: [{ opId: "op-1", classificacao: "sem_deficit", dataFimPrevista: "2026-11-07" }],
    });
  });

  it("2. OF com múltiplas operações concluídas: término é o mais tardio, não a última cadastrada", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-1", "op-2", "op-3"],
      ...SEM_NAO_APLICAVEL_SEM_RESOLVIDA,
      programacaoVigente: programacao({
        operacoes: [
          { ofId: "of-1", opId: "op-1", status: "concluida", dataFimPrevista: "2026-11-09", deficitResidual: 0, alocacoesLength: 2 },
          { ofId: "of-1", opId: "op-2", status: "concluida", dataFimPrevista: "2026-11-03", deficitResidual: 0, alocacoesLength: 1 },
          // op-3 cadastrada por último, mas termina antes de op-1 — o resultado não pode ser o dela.
          { ofId: "of-1", opId: "op-3", status: "concluida", dataFimPrevista: "2026-11-04", deficitResidual: 0, alocacoesLength: 1 },
        ],
      }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado.estado).toBe("previsao_disponivel");
    expect(resultado.estado === "previsao_disponivel" && resultado.terminoPrevisto).toBe("2026-11-09");
  });

  it("3. operações paralelas (mesmo intervalo, recursos diferentes): término é o máximo entre elas", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-a", "op-b"],
      ...SEM_NAO_APLICAVEL_SEM_RESOLVIDA,
      programacaoVigente: programacao({
        operacoes: [
          { ofId: "of-1", opId: "op-a", status: "concluida", dataFimPrevista: "2026-11-05", deficitResidual: 0, alocacoesLength: 1 },
          { ofId: "of-1", opId: "op-b", status: "concluida", dataFimPrevista: "2026-11-06", deficitResidual: 0, alocacoesLength: 1 },
        ],
      }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado.estado === "previsao_disponivel" && resultado.terminoPrevisto).toBe("2026-11-06");
  });

  it("4. dependência não resolvida (predecessora) invalida o término, mesmo com as outras operações concluídas", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-1", "op-2"],
      ...SEM_NAO_APLICAVEL_SEM_RESOLVIDA,
      programacaoVigente: programacao({
        operacoes: [
          { ofId: "of-1", opId: "op-1", status: "concluida", dataFimPrevista: "2026-11-05", deficitResidual: 0, alocacoesLength: 1 },
          { ofId: "of-1", opId: "op-2", status: "bloqueada_por_predecessora", dataFimPrevista: null, deficitResidual: 4, alocacoesLength: 0 },
        ],
      }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado).toEqual({
      estado: "operacoes_impedidas",
      operacoes: [
        { opId: "op-1", classificacao: "sem_deficit", dataFimPrevista: "2026-11-05" },
        { opId: "op-2", classificacao: "bloqueio_por_predecessora", dataFimPrevista: null },
      ],
    });
  });

  it("5. operação bloqueada por déficit real de capacidade (com alocação parcial)", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-1"],
      ...SEM_NAO_APLICAVEL_SEM_RESOLVIDA,
      programacaoVigente: programacao({
        operacoes: [{ ofId: "of-1", opId: "op-1", status: "bloqueada_por_deficit", dataFimPrevista: null, deficitResidual: 6, alocacoesLength: 2 }],
      }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado).toEqual({
      estado: "operacoes_impedidas",
      operacoes: [{ opId: "op-1", classificacao: "deficit_parcial_de_capacidade", dataFimPrevista: null }],
    });
  });

  it("5b. operação bloqueada por déficit sem nenhuma alocação: indistinguível, nunca rotulada como predecessora", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-1"],
      ...SEM_NAO_APLICAVEL_SEM_RESOLVIDA,
      programacaoVigente: programacao({
        operacoes: [{ ofId: "of-1", opId: "op-1", status: "bloqueada_por_deficit", dataFimPrevista: null, deficitResidual: 8, alocacoesLength: 0 }],
      }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado).toEqual({
      estado: "operacoes_impedidas",
      operacoes: [{ opId: "op-1", classificacao: "sem_alocacao_indistinguivel", dataFimPrevista: null }],
    });
  });

  it("6. programação inexistente (empresa sem nenhuma programação vigente)", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-1"],
      ...SEM_NAO_APLICAVEL_SEM_RESOLVIDA,
      programacaoVigente: null,
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado).toEqual({ estado: "programacao_inexistente" });
  });

  it("7. versão de capacidade desatualizada (entrada relevante mudou depois do cálculo)", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-1"],
      ...SEM_NAO_APLICAVEL_SEM_RESOLVIDA,
      programacaoVigente: programacao({
        versaoOrigem: 10,
        versaoAtual: 11,
        operacoes: [{ ofId: "of-1", opId: "op-1", status: "concluida", dataFimPrevista: "2026-11-05", deficitResidual: 0, alocacoesLength: 1 }],
      }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado).toEqual({ estado: "programacao_desatualizada" });
  });

  it("8. janela expirada: versão bate, mas hoje já passou de janelaFim — não serve de evidência prospectiva", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-1"],
      ...SEM_NAO_APLICAVEL_SEM_RESOLVIDA,
      programacaoVigente: programacao({
        janelaFim: "2026-11-03",
        operacoes: [{ ofId: "of-1", opId: "op-1", status: "concluida", dataFimPrevista: "2026-11-02", deficitResidual: 0, alocacoesLength: 1 }],
      }),
      hoje: "2026-11-05",
    });
    expect(resultado).toEqual({ estado: "janela_incompativel_com_avaliacao" });
  });

  it("8b. janela ainda vigente no limite exato (hoje === janelaFim) não é tratada como expirada", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-1"],
      ...SEM_NAO_APLICAVEL_SEM_RESOLVIDA,
      programacaoVigente: programacao({
        janelaFim: "2026-11-05",
        operacoes: [{ ofId: "of-1", opId: "op-1", status: "concluida", dataFimPrevista: "2026-11-05", deficitResidual: 0, alocacoesLength: 1 }],
      }),
      hoje: "2026-11-05",
    });
    expect(resultado.estado).toBe("previsao_disponivel");
  });

  it("9. cobertura incompleta: a OF tem uma operação necessária que ainda não aparece na programação vigente", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-1", "op-2"],
      ...SEM_NAO_APLICAVEL_SEM_RESOLVIDA,
      programacaoVigente: programacao({
        operacoes: [{ ofId: "of-1", opId: "op-1", status: "concluida", dataFimPrevista: "2026-11-05", deficitResidual: 0, alocacoesLength: 1 }],
      }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado).toEqual({ estado: "cobertura_insuficiente", opsAusentes: ["op-2"] });
  });

  it("10. operações de outras OFs na mesma programação vigente nunca contaminam o resultado desta OF", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-1"],
      ...SEM_NAO_APLICAVEL_SEM_RESOLVIDA,
      programacaoVigente: programacao({
        operacoes: [
          { ofId: "of-1", opId: "op-1", status: "concluida", dataFimPrevista: "2026-11-05", deficitResidual: 0, alocacoesLength: 1 },
          { ofId: "of-2", opId: "op-9", status: "bloqueada_por_deficit", dataFimPrevista: null, deficitResidual: 20, alocacoesLength: 0 },
        ],
      }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado.estado).toBe("previsao_disponivel");
  });

  it("12. contrato violado (status concluída com deficitResidual != 0) propaga o erro em vez de mascarar", () => {
    expect(() =>
      classificarPrazoOfPcp({
        ofId: "of-1",
        opsNecessariasDaOf: ["op-1"],
        ...SEM_NAO_APLICAVEL_SEM_RESOLVIDA,
        programacaoVigente: programacao({
          operacoes: [{ ofId: "of-1", opId: "op-1", status: "concluida", dataFimPrevista: "2026-11-05", deficitResidual: 3, alocacoesLength: 1 }],
        }),
        hoje: HOJE_DENTRO_DA_JANELA,
      }),
    ).toThrow(/contrato violado/);
  });

  // --- Etapa 53A: distinção explícita entre "sem operações", "só não aplicáveis" e "todas resolvidas" ---

  it("13. OF sem nenhuma operação cadastrada (nunca teve nenhuma, aplicável ou não)", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: [],
      existemOperacoesNaoAplicaveis: false,
      existemOperacoesResolvidas: false,
      programacaoVigente: programacao({ operacoes: [] }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado).toEqual({ estado: "sem_operacoes_aplicaveis", motivo: "sem_operacoes_cadastradas" });
  });

  it("14. OF só com operações não aplicáveis (nenhuma resolvida de verdade, nenhuma pendente)", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: [],
      existemOperacoesNaoAplicaveis: true,
      existemOperacoesResolvidas: false,
      programacaoVigente: programacao({ operacoes: [] }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado).toEqual({ estado: "sem_operacoes_aplicaveis", motivo: "somente_nao_aplicaveis" });
  });

  it("15. OF com todas as operações aplicáveis resolvidas: não depende de programação vigente", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: [],
      existemOperacoesNaoAplicaveis: false,
      existemOperacoesResolvidas: true,
      programacaoVigente: null, // nenhuma programação - mesmo assim reconhece a conclusão.
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado).toEqual({ estado: "todas_operacoes_resolvidas" });
  });

  it("16. OF com operações resolvidas e não aplicáveis, nenhuma pendente: ainda 'todas resolvidas', nunca 'só não aplicáveis'", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: [],
      existemOperacoesNaoAplicaveis: true,
      existemOperacoesResolvidas: true,
      programacaoVigente: programacao({ operacoes: [] }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado).toEqual({ estado: "todas_operacoes_resolvidas" });
  });

  it("17. OF com parte resolvida e parte pendente: avalia normalmente só a parte pendente", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-pendente"],
      existemOperacoesNaoAplicaveis: false,
      existemOperacoesResolvidas: true,
      programacaoVigente: programacao({
        operacoes: [{ ofId: "of-1", opId: "op-pendente", status: "concluida", dataFimPrevista: "2026-11-06", deficitResidual: 0, alocacoesLength: 1 }],
      }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado).toEqual({
      estado: "previsao_disponivel",
      terminoPrevisto: "2026-11-06",
      operacoes: [{ opId: "op-pendente", classificacao: "sem_deficit", dataFimPrevista: "2026-11-06" }],
    });
  });

  it("18. OF com operação pendente e programação desatualizada: continua exigindo programação válida", () => {
    const resultado = classificarPrazoOfPcp({
      ofId: "of-1",
      opsNecessariasDaOf: ["op-pendente"],
      existemOperacoesNaoAplicaveis: false,
      existemOperacoesResolvidas: true,
      programacaoVigente: programacao({
        versaoOrigem: 10,
        versaoAtual: 11,
        operacoes: [{ ofId: "of-1", opId: "op-pendente", status: "concluida", dataFimPrevista: "2026-11-06", deficitResidual: 0, alocacoesLength: 1 }],
      }),
      hoje: HOJE_DENTRO_DA_JANELA,
    });
    expect(resultado).toEqual({ estado: "programacao_desatualizada" });
  });
});
