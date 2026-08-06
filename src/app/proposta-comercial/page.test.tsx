/* @vitest-environment jsdom */
// Cobre a propriedade pedida para a correcao do
// react-hooks/set-state-in-effect em proposta-comercial/page.tsx:
// "prop externa mudando sem sobrescrever edicao local indevidamente" -
// nomeVendedor deve ser preenchido com responsavelNome so' na transicao
// em que ele chega (ex: carregamento assincrono) E somente enquanto o
// campo ainda estiver vazio; uma vez que o usuario digita algo, uma
// nova mudanca de responsavelNome nao pode sobrescrever.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const useSearchParamsMock = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParamsMock(),
}));

// useProposta.ts real importa supabaseClient no topo do modulo -
// precisa de um mock aqui tambem (mesmo so' usando proximaRevisao via
// importActual) para nao tentar criar um client real sem env vars.
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {},
  isSupabaseConfigured: true,
}));

const usePropostaMock = vi.fn();
vi.mock("@/modules/projetos/hooks/useProposta", async () => {
  const real = await vi.importActual<
    typeof import("@/modules/projetos/hooks/useProposta")
  >("@/modules/projetos/hooks/useProposta");
  return {
    proximaRevisao: real.proximaRevisao,
    useProposta: () => usePropostaMock(),
  };
});

import CommercialProposalPage from "./page";

function propostaPadrao(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    erro: null,
    numeroProposta: "260010",
    criadoEm: "2026-01-01T00:00:00.000Z",
    cliente: null,
    nomeSolicitante: "",
    responsavelNome: "",
    itens: [],
    valorTecnicoProposta: 0,
    valorDescontoProposta: 0,
    valorTotalProposta: 0,
    revisao: "A",
    salvandoRevisao: false,
    avancarRevisao: vi.fn(),
    consideracoes: "",
    salvandoConsideracoes: false,
    salvarConsideracoes: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useSearchParamsMock.mockReturnValue({
    get: () => "projeto-1",
  });
});

afterEach(() => {
  cleanup();
});

// "Nome do Vendedor" e' o primeiro input de texto da secao "Outras
// Informacoes" - localizado pelo texto do rotulo irmao no mesmo card.
function inputPorRotulo(rotulo: string) {
  const rotuloEl = screen.getByText(rotulo);
  return rotuloEl.parentElement?.querySelector("input") as HTMLInputElement;
}

describe("proposta-comercial/page - nomeVendedor (Padrao 1, regra especial)", () => {
  it("preenche nomeVendedor com responsavelNome quando ele chega, se o campo ainda estiver vazio", () => {
    usePropostaMock.mockReturnValue(propostaPadrao({ responsavelNome: "" }));
    const { rerender } = render(<CommercialProposalPage />);

    expect(inputPorRotulo("Nome do Vendedor").value).toBe("");

    usePropostaMock.mockReturnValue(
      propostaPadrao({ responsavelNome: "Fulano de Tal" }),
    );
    rerender(<CommercialProposalPage />);

    expect(inputPorRotulo("Nome do Vendedor").value).toBe("Fulano de Tal");
  });

  it("nao sobrescreve o que o usuario ja digitou quando responsavelNome muda de novo", () => {
    usePropostaMock.mockReturnValue(
      propostaPadrao({ responsavelNome: "Fulano de Tal" }),
    );
    const { rerender } = render(<CommercialProposalPage />);

    expect(inputPorRotulo("Nome do Vendedor").value).toBe("Fulano de Tal");

    act(() => {
      fireEvent.change(inputPorRotulo("Nome do Vendedor"), {
        target: { value: "Vendedor Escolhido Manualmente" },
      });
    });
    expect(inputPorRotulo("Nome do Vendedor").value).toBe(
      "Vendedor Escolhido Manualmente",
    );

    // responsavelNome muda de novo (ex: nova consulta) - nao pode
    // sobrescrever a edicao manual.
    usePropostaMock.mockReturnValue(
      propostaPadrao({ responsavelNome: "Beltrano" }),
    );
    rerender(<CommercialProposalPage />);

    expect(inputPorRotulo("Nome do Vendedor").value).toBe(
      "Vendedor Escolhido Manualmente",
    );
  });
});
