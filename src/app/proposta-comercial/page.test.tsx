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
    cenarioComercialDesatualizado: false,
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

describe("proposta-comercial/page - link de retorno ao Orçamento", () => {
  it("aponta dinamicamente para /projetos/{id do projeto na URL}", () => {
    useSearchParamsMock.mockReturnValue({ get: () => "outro-projeto-qualquer" });
    usePropostaMock.mockReturnValue(propostaPadrao());
    render(<CommercialProposalPage />);

    const link = screen.getByRole("link", { name: "← Voltar ao Orçamento" });
    expect(link.getAttribute("href")).toBe("/projetos/outro-projeto-qualquer");
  });

  it("sem projeto na URL: não renderiza o link (evita apontar para /projetos/null)", () => {
    useSearchParamsMock.mockReturnValue({ get: () => null });
    usePropostaMock.mockReturnValue(propostaPadrao());
    render(<CommercialProposalPage />);

    expect(screen.queryByRole("link", { name: "← Voltar ao Orçamento" })).toBeNull();
  });
});

// DEC-007 §6.2/Fase 8b (invalidação automática) - o aviso e o link de
// retorno vivem no mesmo container "print:hidden" (chrome do editor
// interno): visíveis na tela, ausentes na impressão/PDF/documento
// enviado ao cliente - nunca dentro do <header>/<footer> do documento.
describe("proposta-comercial/page - aviso de cenário desatualizado (editor interno, ausente na impressão)", () => {
  const TEXTO_AVISO = "O Roteiro foi alterado após a aprovação deste cenário. Recalcule e aprove um novo cenário.";

  it("cenarioComercialDesatualizado=true: aviso visível, dentro do mesmo container print:hidden do link de retorno", () => {
    usePropostaMock.mockReturnValue(propostaPadrao({ cenarioComercialDesatualizado: true }));
    render(<CommercialProposalPage />);

    const aviso = screen.getByText(TEXTO_AVISO);
    expect(aviso).toBeTruthy();

    const link = screen.getByRole("link", { name: "← Voltar ao Orçamento" });
    const containerAviso = aviso.closest(".print\\:hidden");
    const containerLink = link.closest(".print\\:hidden");
    expect(containerAviso).not.toBeNull();
    expect(containerAviso).toBe(containerLink);
  });

  it("cenarioComercialDesatualizado=false (padrão): nenhum aviso renderizado", () => {
    usePropostaMock.mockReturnValue(propostaPadrao());
    render(<CommercialProposalPage />);

    expect(screen.queryByText(TEXTO_AVISO)).toBeNull();
  });
});

// Achado real (prévia de impressão): além do link/aviso acima, a barra
// de usuário/Sair (UserMenu.tsx, corrigida à parte) e mais 3 controles
// PRÓPRIOS desta página vazavam no documento impresso - nenhum deles é
// conteúdo da proposta em si, todos pertencem ao editor interno.
describe("proposta-comercial/page - ações do editor interno ausentes na impressão (print:hidden)", () => {
  it("botão 'Nova Revisão' tem print:hidden", () => {
    usePropostaMock.mockReturnValue(propostaPadrao());
    render(<CommercialProposalPage />);
    expect(screen.getByRole("button", { name: "Nova Revisão" }).className).toContain("print:hidden");
  });

  it("botão 'Salvar' (Considerações) tem print:hidden", () => {
    usePropostaMock.mockReturnValue(propostaPadrao());
    render(<CommercialProposalPage />);
    expect(screen.getByRole("button", { name: "Salvar" }).className).toContain("print:hidden");
  });

  it("ações de rodapé (Anexos/Gerar PDF/Enviar Proposta) ficam num container print:hidden", () => {
    usePropostaMock.mockReturnValue(propostaPadrao());
    render(<CommercialProposalPage />);
    const botaoAnexos = screen.getByRole("button", { name: "Anexos" });
    const botaoGerarPdf = screen.getByRole("button", { name: "Gerar PDF" });
    const botaoEnviar = screen.getByRole("button", { name: "Enviar Proposta" });
    const container = botaoAnexos.closest(".print\\:hidden");
    expect(container).not.toBeNull();
    expect(container?.contains(botaoGerarPdf)).toBe(true);
    expect(container?.contains(botaoEnviar)).toBe(true);
  });

  it("textarea de Considerações perde a aparência de campo na impressão (sem borda/fundo)", () => {
    usePropostaMock.mockReturnValue(propostaPadrao());
    const { container } = render(<CommercialProposalPage />);
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea?.className).toContain("print:border-none");
    expect(textarea?.className).toContain("print:bg-transparent");
  });

  it("linhas de 'Outras Informações' perdem a aparência de campo na impressão (sem borda/fundo)", () => {
    usePropostaMock.mockReturnValue(propostaPadrao());
    render(<CommercialProposalPage />);
    const linha = screen.getByText("Nome do Vendedor").closest("div");
    expect(linha?.className).toContain("print:border-none");
    expect(linha?.className).toContain("print:bg-transparent");
  });
});

// Achado real (prévia de impressão): a tabela "Itens da Proposta" tinha
// rolagem horizontal (overflow-x-auto) e largura mínima de 760px,
// pensadas para tela - na impressão isso cortava a coluna Valor Total.
describe("proposta-comercial/page - tabela 'Itens da Proposta' cabe inteira na impressão", () => {
  it("o container perde a rolagem horizontal (overflow visível) e a tabela perde a largura mínima na impressão", () => {
    usePropostaMock.mockReturnValue(
      propostaPadrao({
        itens: [
          { id: "item-1", descricao: "Item 1", codigo: "PN-1", ncm: "8479.90.90", quantidade: 1, valorUnitario: 100, valorTotal: 100 },
        ],
      }),
    );
    const { container } = render(<CommercialProposalPage />);

    const tabela = container.querySelector("table");
    expect(tabela).not.toBeNull();
    expect(tabela?.className).toContain("print:min-w-0");

    const wrapper = tabela?.parentElement;
    expect(wrapper?.className).toContain("overflow-x-auto");
    expect(wrapper?.className).toContain("print:overflow-visible");
  });

  it("cada linha de item tem print:break-inside-avoid, para nunca cortar um item entre duas páginas", () => {
    usePropostaMock.mockReturnValue(
      propostaPadrao({
        itens: [
          { id: "item-1", descricao: "Item 1", codigo: "PN-1", ncm: "8479.90.90", quantidade: 1, valorUnitario: 100, valorTotal: 100 },
          { id: "item-2", descricao: "Item 2", codigo: "PN-2", ncm: null, quantidade: 2, valorUnitario: 50, valorTotal: 100 },
        ],
      }),
    );
    const { container } = render(<CommercialProposalPage />);

    const linhas = container.querySelectorAll("tbody tr");
    expect(linhas.length).toBe(2);
    linhas.forEach((linha) => {
      expect((linha as HTMLElement).className).toContain("print:break-inside-avoid");
    });
  });

  it("todas as 6 colunas (cabeçalho e células) continuam presentes e legíveis na impressão (typografia/padding reduzidos, nunca ocultos)", () => {
    usePropostaMock.mockReturnValue(
      propostaPadrao({
        itens: [
          { id: "item-1", descricao: "Item 1", codigo: "PN-1", ncm: "8479.90.90", quantidade: 3, valorUnitario: 10, valorTotal: 30 },
        ],
      }),
    );
    render(<CommercialProposalPage />);

    for (const cabecalho of ["Produto", "Código", "NCM", "Qtd", "Valor Unitário", "Valor Total"]) {
      expect(screen.getByText(cabecalho)).toBeTruthy();
    }
    expect(screen.getByText("Item 1")).toBeTruthy();
    expect(screen.getByText("PN-1")).toBeTruthy();
    expect(screen.getByText("8479.90.90")).toBeTruthy();
  });
});
