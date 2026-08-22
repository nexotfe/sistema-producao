/* @vitest-environment jsdom */
// DEC-007 §6.2/Fase 8b (invalidação automática) - cobre o badge/aviso
// novo (desatualizado para uso corrente), preservando o
// comportamento tri-estado já existente (undefined/null/objeto).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CenarioAprovadoVigenteCard } from "./CenarioAprovadoVigenteCard";
import type { CenarioComercialAprovadoResumo } from "@/modules/projetos/lib/buscarCenarioComercialAprovado";

afterEach(() => {
  cleanup();
});

function cenario(overrides: Partial<CenarioComercialAprovadoResumo> = {}): CenarioComercialAprovadoResumo {
  return {
    id: "cenario-1",
    empresaId: "empresa-1",
    tipoCenario: "atual",
    dataSolicitadaCliente: "2026-08-01",
    prazoProposto: "2026-08-15",
    diferencaEmDias: 14,
    custoTecnicoAtual: 4920,
    custoAdicionalTotal: 0,
    novoCustoTecnico: 4920,
    aprovadoEm: "2026-08-05T10:00:00Z",
    assinaturaTecnica: null,
    janelaInicio: null,
    janelaFim: null,
    ...overrides,
  };
}

describe("CenarioAprovadoVigenteCard", () => {
  it("undefined: mostra 'Carregando...', nunca 'Nenhum cenário aprovado'", () => {
    render(<CenarioAprovadoVigenteCard cenarioJaAprovado={undefined} decisaoCenarioComercial={undefined} />);
    expect(screen.getByText("Carregando...")).toBeTruthy();
  });

  it("null: nenhum cenário aprovado, sem badge", () => {
    render(<CenarioAprovadoVigenteCard cenarioJaAprovado={null} decisaoCenarioComercial={null} />);
    expect(screen.getByText("Nenhum cenário aprovado ainda para este projeto.")).toBeTruthy();
  });

  it("cenário vigente e usável (decisão confirmou): badge 'Vigente', sem aviso de desatualização", () => {
    render(
      <CenarioAprovadoVigenteCard
        cenarioJaAprovado={cenario()}
        decisaoCenarioComercial={{ usarCenario: true, motivo: "assinatura_confere" }}
      />,
    );
    expect(screen.getByText(/Vigente — cenário atual/)).toBeTruthy();
    expect(screen.queryByText(/desatualizado para uso corrente/)).toBeNull();
    expect(screen.queryByText(/O Roteiro foi alterado/)).toBeNull();
  });

  it("cenário existe mas a decisão diz desatualizado (ex.: 260007, assinatura nula): badge muda, aviso aparece, dados históricos continuam visíveis", () => {
    render(
      <CenarioAprovadoVigenteCard
        cenarioJaAprovado={cenario({ custoTecnicoAtual: 4920, novoCustoTecnico: 4920 })}
        decisaoCenarioComercial={{ usarCenario: false, motivoDesatualizado: "assinatura_nula_legado" }}
      />,
    );
    expect(screen.getByText("Aprovado — desatualizado para uso corrente")).toBeTruthy();
    expect(
      screen.getByText("O Roteiro foi alterado após a aprovação deste cenário. Recalcule e aprove um novo cenário."),
    ).toBeTruthy();
    // Snapshot histórico continua visível mesmo desatualizado.
    expect(screen.getAllByText("R$ 4.920,00").length).toBeGreaterThan(0);
  });

  it("decisaoCenarioComercial ainda undefined (avaliando) mas cenarioJaAprovado já resolvido: trata como vigente por padrão (nunca lança), evita flicker de 'desatualizado' precoce", () => {
    render(<CenarioAprovadoVigenteCard cenarioJaAprovado={cenario()} decisaoCenarioComercial={undefined} />);
    expect(screen.getByText(/Vigente — cenário atual/)).toBeTruthy();
  });
});
