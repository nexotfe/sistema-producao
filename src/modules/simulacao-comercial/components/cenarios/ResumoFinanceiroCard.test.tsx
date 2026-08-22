/* @vitest-environment jsdom */
// DEC-007 §6.2/Fase 8b (idempotência da aprovação de cenário comercial -
// migração 20260822195805, correção do usuário após o achado de
// travamento em "Aprovando..." no orçamento 260007). Cobre exatamente
// o que mudou neste componente: chaveIdempotencia estável entre
// tentativas da MESMA confirmação; "Aprovando..." SEMPRE sai (mesmo com
// exceção inesperada - a causa raiz do travamento real); gravacao_incerta
// nunca é tratado como erro comum, sempre passa pela verificação antes
// de decidir sucesso ou nova tentativa.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const aprovarCenarioComercialActionMock = vi.fn();
vi.mock("@/modules/simulacao-comercial/actions/aprovarCenarioComercialAction", () => ({
  aprovarCenarioComercialAction: (...args: unknown[]) => aprovarCenarioComercialActionMock(...args),
}));

const buscarCenarioAprovadoPorChaveIdempotenciaMock = vi.fn();
vi.mock("@/modules/simulacao-comercial/lib/cenarios/buscarCenarioAprovadoPorChaveIdempotencia", () => ({
  buscarCenarioAprovadoPorChaveIdempotencia: (...args: unknown[]) => buscarCenarioAprovadoPorChaveIdempotenciaMock(...args),
}));

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { ResumoFinanceiroCard, type ResumoFinanceiroCardProps } from "./ResumoFinanceiroCard";
import type { SaidaPrevisaoComercial } from "@/modules/simulacao-comercial/lib/cenarios/montarPrevisaoComercialProjeto";

function saidaCalculavel(): SaidaPrevisaoComercial {
  return {
    dataSolicitadaCliente: "2026-09-01",
    status: "calculado",
    primeiraEntregaPossivel: "2026-09-02",
    atendeDataSolicitada: true,
    diferencaEmDias: 1,
    recursosQueDeterminamTermino: [],
    horizonteTecnico: "suficiente",
    diagnosticos: [],
    tipoAnalise: "previsao_comercial_por_capacidade",
    custoAdicional: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, total: 0 },
    capacidadeUtilizada: { horaAdicionalHoras: 0, recursoTemporarioHoras: 0 },
    detalhamentoPorRecurso: [],
  };
}

function propsBase(overrides: Partial<ResumoFinanceiroCardProps> = {}): ResumoFinanceiroCardProps {
  return {
    projetoId: "projeto-1",
    custoTecnicoAtual: 3975,
    valorComercialAtualReferencia: null,
    premissas: { dataNecessidade: "2026-09-08", margemSegurancaDias: 0, dataPrevistaAprovacaoPedido: "2026-08-26" },
    saidaAtual: saidaCalculavel(),
    saidaAjustada: null,
    cenarioAjustado: null,
    cenarioJaAprovado: null,
    onCenarioAprovado: vi.fn(),
    ...overrides,
  };
}

async function abrirEConfirmar() {
  fireEvent.click(screen.getByRole("button", { name: "Aprovar cenário" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Confirmar aprovação|Aprovando/ }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("ResumoFinanceiroCard - confirmarAprovacao", () => {
  it("caminho feliz: envia chaveIdempotencia (UUID) junto do payload, mostra sucesso, chama onCenarioAprovado", async () => {
    aprovarCenarioComercialActionMock.mockResolvedValue({ ok: true, cenarioComercialAprovadoId: "novo-id" });
    const onCenarioAprovado = vi.fn();
    render(<ResumoFinanceiroCard {...propsBase({ onCenarioAprovado })} />);

    await abrirEConfirmar();

    expect(aprovarCenarioComercialActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ chaveIdempotencia: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    );
    expect(onCenarioAprovado).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Cenário comercial aprovado com sucesso.")).toBeTruthy();
  });

  // Achado real: um erro/exceção não tratada no meio do fluxo deixava
  // "Aprovando..." preso para sempre. O try/catch/finally garante que
  // isso nunca mais acontece - e trata a própria chamada lançando como
  // tão ambígua quanto gravacao_incerta (mesma verificação antes de
  // decidir), nunca como "falhou" direto.
  it("aprovarCenarioComercialAction lança uma exceção inesperada: trata como ambíguo (verifica antes de decidir), 'Aprovando...' sempre sai, botão volta a ficar clicável", async () => {
    aprovarCenarioComercialActionMock.mockRejectedValue(new Error("falha de rede inesperada"));
    buscarCenarioAprovadoPorChaveIdempotenciaMock.mockResolvedValue(null);
    render(<ResumoFinanceiroCard {...propsBase()} />);

    fireEvent.click(screen.getByRole("button", { name: "Aprovar cenário" }));
    const botaoConfirmar = screen.getByRole("button", { name: "Confirmar aprovação" });

    await expect(
      act(async () => {
        fireEvent.click(botaoConfirmar);
      }),
    ).resolves.not.toThrow();

    expect(buscarCenarioAprovadoPorChaveIdempotenciaMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Confirmar aprovação" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aprovando..." })).toBeNull();
  });

  // Correção (achado real: a mensagem genérica não dizia qual etapa
  // falhou) - tela INTERNA (orçamentista/admin), a etapa aparece
  // diretamente na mensagem para orientar a investigação.
  it("motivo=tempo_esgotado: mensagem mostra a ETAPA específica, nunca fica preso em 'Aprovando...'", async () => {
    aprovarCenarioComercialActionMock.mockResolvedValue({ ok: false, motivo: "tempo_esgotado", etapa: "carregar-base" });
    render(<ResumoFinanceiroCard {...propsBase()} />);

    await abrirEConfirmar();

    expect(screen.getByText(/tempo esgotado na etapa "carregar-base"/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar aprovação" })).toBeTruthy();
  });

  it("motivo=falha_etapa (erro que não é timeout): mensagem mostra a ETAPA e a duração, nunca fica preso em 'Aprovando...'", async () => {
    aprovarCenarioComercialActionMock.mockResolvedValue({ ok: false, motivo: "falha_etapa", etapa: "autenticar", duracaoMs: 42 });
    render(<ResumoFinanceiroCard {...propsBase()} />);

    await abrirEConfirmar();

    expect(screen.getByText(/falha na etapa "autenticar" \(42ms\)/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar aprovação" })).toBeTruthy();
  });

  // gravacao_incerta NUNCA deve ser tratado como erro comum - sempre
  // passa pela verificação (buscarCenarioAprovadoPorChaveIdempotencia)
  // antes de decidir sucesso ou liberar nova tentativa.
  it("motivo=gravacao_incerta + verificação ENCONTRA o cenário: trata como sucesso silencioso, chama onCenarioAprovado", async () => {
    aprovarCenarioComercialActionMock.mockResolvedValue({ ok: false, motivo: "gravacao_incerta" });
    buscarCenarioAprovadoPorChaveIdempotenciaMock.mockResolvedValue({ id: "cenario-gravado" });
    const onCenarioAprovado = vi.fn();
    render(<ResumoFinanceiroCard {...propsBase({ onCenarioAprovado })} />);

    await abrirEConfirmar();

    expect(buscarCenarioAprovadoPorChaveIdempotenciaMock).toHaveBeenCalledWith(
      expect.anything(),
      "projeto-1",
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(onCenarioAprovado).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Cenário comercial aprovado com sucesso.")).toBeTruthy();
  });

  it("motivo=gravacao_incerta + verificação NÃO encontra: mensagem específica, libera nova tentativa (nunca trata como sucesso nem como erro genérico)", async () => {
    aprovarCenarioComercialActionMock.mockResolvedValue({ ok: false, motivo: "gravacao_incerta" });
    buscarCenarioAprovadoPorChaveIdempotenciaMock.mockResolvedValue(null);
    const onCenarioAprovado = vi.fn();
    render(<ResumoFinanceiroCard {...propsBase({ onCenarioAprovado })} />);

    await abrirEConfirmar();

    expect(onCenarioAprovado).not.toHaveBeenCalled();
    expect(screen.getByText(/conexão caiu antes de confirmar a gravação/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar aprovação" })).toBeTruthy();
  });

  it("chaveIdempotencia permanece a MESMA em uma nova tentativa dentro do mesmo modal (retry após tempo_esgotado)", async () => {
    aprovarCenarioComercialActionMock.mockResolvedValueOnce({ ok: false, motivo: "tempo_esgotado", etapa: "carregar-base" });
    aprovarCenarioComercialActionMock.mockResolvedValueOnce({ ok: true, cenarioComercialAprovadoId: "novo-id" });
    render(<ResumoFinanceiroCard {...propsBase()} />);

    fireEvent.click(screen.getByRole("button", { name: "Aprovar cenário" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar aprovação" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar aprovação" }));
    });

    const chaveNaPrimeiraChamada = aprovarCenarioComercialActionMock.mock.calls[0][0].chaveIdempotencia;
    const chaveNaSegundaChamada = aprovarCenarioComercialActionMock.mock.calls[1][0].chaveIdempotencia;
    expect(chaveNaPrimeiraChamada).toBe(chaveNaSegundaChamada);
  });
});
