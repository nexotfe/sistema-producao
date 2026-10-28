/* @vitest-environment jsdom */
// PCP-Etapa2O.6: testes da página de Prioridades do PCP. Reaproveita
// consultarFilaPrioridadesPcpAction e moverPrioridadeProjetoPcpAction
// exatamente como já implementados e testados nas Etapas 2O.3/2O.5 -
// nunca reconstrói essas funcionalidades, só as consome via mock.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

const consultarFilaPrioridadesPcpActionMock = vi.fn();
vi.mock("@/modules/pcp/actions/consultarFilaPrioridadesPcpAction", () => ({
  consultarFilaPrioridadesPcpAction: (...args: unknown[]) => consultarFilaPrioridadesPcpActionMock(...args),
}));

const moverPrioridadeProjetoPcpActionMock = vi.fn();
vi.mock("@/modules/pcp/actions/moverPrioridadeProjetoPcpAction", () => ({
  moverPrioridadeProjetoPcpAction: (...args: unknown[]) => moverPrioridadeProjetoPcpActionMock(...args),
}));

// ETAPA 2O.8B-I6H: mesmo padrão de mock acima - evita que o módulo real
// (que importa createSupabaseServiceClient, "server-only") seja
// carregado neste ambiente jsdom.
const solicitarCalculoProgramacaoPcpActionMock = vi.fn();
vi.mock("@/modules/pcp/actions/solicitarCalculoProgramacaoPcpAction", () => ({
  solicitarCalculoProgramacaoPcpAction: (...args: unknown[]) => solicitarCalculoProgramacaoPcpActionMock(...args),
}));

import PrioridadesPcpPage, { calcularVizinhosParaMovimento } from "./page";
import type { ItemFilaPrioridadesPcp } from "@/modules/pcp/lib/buscarFilaPrioridadesPcp";

function item(overrides: Partial<ItemFilaPrioridadesPcp> = {}): ItemFilaPrioridadesPcp {
  return {
    projetoId: "projeto-x",
    numeroProjeto: "260001",
    nomeProjeto: "Projeto X",
    clienteId: null,
    nomeCliente: null,
    dataObjetivo: null,
    posicaoReal: 1000,
    posicaoSequencial: 1,
    ...overrides,
  };
}

function filaDeCinco(): ItemFilaPrioridadesPcp[] {
  return [
    item({ projetoId: "A", numeroProjeto: "260001", nomeProjeto: "Projeto A", posicaoReal: 1000, posicaoSequencial: 1 }),
    item({ projetoId: "B", numeroProjeto: "260002", nomeProjeto: "Projeto B", posicaoReal: 2000, posicaoSequencial: 2 }),
    item({ projetoId: "C", numeroProjeto: "260003", nomeProjeto: "Projeto C", posicaoReal: 3000, posicaoSequencial: 3 }),
    item({ projetoId: "D", numeroProjeto: "260004", nomeProjeto: "Projeto D", posicaoReal: 4000, posicaoSequencial: 4 }),
    item({ projetoId: "E", numeroProjeto: "260005", nomeProjeto: "Projeto E", posicaoReal: 5000, posicaoSequencial: 5 }),
  ];
}

describe("calcularVizinhosParaMovimento - função pura", () => {
  it("fila vazia: sempre null", () => {
    expect(calcularVizinhosParaMovimento([], "A", 1)).toBeNull();
  });

  it("fila com 1 único projeto: sempre null (nenhum vizinho possível)", () => {
    expect(calcularVizinhosParaMovimento([item({ projetoId: "A", posicaoSequencial: 1 })], "A", 1)).toBeNull();
  });

  it("mover para a MESMA posição atual: null, nunca chama o servidor", () => {
    expect(calcularVizinhosParaMovimento(filaDeCinco(), "C", 3)).toBeNull();
  });

  it("mover E (posição 5) para posição 1 (subir até o topo): vizinho seguinte = A, sem anterior", () => {
    expect(calcularVizinhosParaMovimento(filaDeCinco(), "E", 1)).toEqual({
      vizinhoAnteriorProjetoId: null,
      vizinhoSeguinteProjetoId: "A",
    });
  });

  it("mover A (posição 1) para posição 5 (descer até o fim): vizinho anterior = E, sem seguinte", () => {
    expect(calcularVizinhosParaMovimento(filaDeCinco(), "A", 5)).toEqual({
      vizinhoAnteriorProjetoId: "E",
      vizinhoSeguinteProjetoId: null,
    });
  });

  it("subir B (posição 2) uma posição: fica antes de A", () => {
    expect(calcularVizinhosParaMovimento(filaDeCinco(), "B", 1)).toEqual({
      vizinhoAnteriorProjetoId: null,
      vizinhoSeguinteProjetoId: "A",
    });
  });

  it("descer C (posição 3) uma posição: fica entre D e E", () => {
    expect(calcularVizinhosParaMovimento(filaDeCinco(), "C", 4)).toEqual({
      vizinhoAnteriorProjetoId: "D",
      vizinhoSeguinteProjetoId: "E",
    });
  });

  it("mover para posição intermediária (C para posição 2): fica entre A e B", () => {
    expect(calcularVizinhosParaMovimento(filaDeCinco(), "C", 2)).toEqual({
      vizinhoAnteriorProjetoId: "A",
      vizinhoSeguinteProjetoId: "B",
    });
  });

  it("destino fora da faixa (maior que o tamanho da fila) é limitado ao último lugar, nunca gera erro", () => {
    expect(calcularVizinhosParaMovimento(filaDeCinco(), "A", 999)).toEqual({
      vizinhoAnteriorProjetoId: "E",
      vizinhoSeguinteProjetoId: null,
    });
  });

  it("projetoId inexistente na fila: null", () => {
    expect(calcularVizinhosParaMovimento(filaDeCinco(), "fantasma", 1)).toBeNull();
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Preenche a justificativa obrigatória (Etapa 2O.8B-I5 Parte 3) antes de clicar em qualquer controle de movimentação. */
function preencherMotivo(texto = "justificativa de teste"): void {
  fireEvent.change(screen.getByLabelText(/Justificativa da movimentação/), { target: { value: texto } });
}

describe("PrioridadesPcpPage - componente", () => {
  it("fila vazia: mensagem apropriada, nenhum controle de movimentação quebrado", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: [] });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText(/Nenhum projeto na fila de prioridades/)).toBeTruthy());
  });

  it("fila com 1 projeto: botões de subir/descer desabilitados (nenhum vizinho possível)", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({
      ok: true,
      fila: [item({ projetoId: "A", numeroProjeto: "260001", posicaoSequencial: 1 })],
    });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260001")).toBeTruthy());
    expect((screen.getByLabelText(/Subir prioridade do projeto 260001/) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Descer prioridade do projeto 260001/) as HTMLButtonElement).disabled).toBe(true);
  });

  it("fila com vários projetos: ordenação e posições sequenciais exibidas corretamente", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260001")).toBeTruthy());
    const numerosNaOrdem = screen.getAllByText(/^26000[1-5]$/).map((elemento) => elemento.textContent);
    expect(numerosNaOrdem).toEqual(["260001", "260002", "260003", "260004", "260005"]);
  });

  it("cliente e data objetivo ausentes: exibidos como travessão, nunca inventados", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({
      ok: true,
      fila: [item({ projetoId: "A", numeroProjeto: "260001", clienteId: null, nomeCliente: null, dataObjetivo: null })],
    });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260001")).toBeTruthy());
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2); // cliente + data objetivo
  });

  it("busca filtra a fila exibida, sem refazer a consulta", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260001")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/Buscar projeto/), { target: { value: "Projeto C" } });

    expect(screen.queryByText("260001")).toBeNull();
    expect(screen.getByText("260003")).toBeTruthy();
    expect(consultarFilaPrioridadesPcpActionMock).toHaveBeenCalledTimes(1);
  });

  it("usuário sem autenticação: mensagem apropriada", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: false, motivo: "nao_autenticado" });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText(/Sessão não autenticada/)).toBeTruthy());
  });

  it("usuário sem permissão de leitura: mensagem apropriada", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: false, motivo: "nao_autorizado" });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText(/pcp.visualizar_programacao/)).toBeTruthy());
  });

  it("sem justificativa preenchida: NUNCA chama o servidor, mensagem de validação exibida", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/Subir prioridade do projeto 260005/));

    await waitFor(() => expect(screen.getByText(/Informe o motivo da movimentação/)).toBeTruthy());
    expect(moverPrioridadeProjetoPcpActionMock).not.toHaveBeenCalled();
  });

  it("movimento com sucesso E recálculo real concluído: mensagens corretas, fila recarregada", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    moverPrioridadeProjetoPcpActionMock.mockResolvedValue({
      ok: true,
      posicaoNova: 500,
      eventoHistoricoId: "evento-1",
      conclusaoExecucao: { aceito: true, resultadoEfetivo: "concluido", programacaoId: "prog-1", viaRecuperacaoPosFalhaDeComunicacao: false },
      recalculo: {
        ok: true,
        versaoCapacidadeUtilizada: "7",
        operacoes: [
          { opId: "op-1", status: "concluida", dataInicioReal: "2026-10-24", dataFimReal: "2026-10-24", alocacoes: [], deficitResidualHorasPadrao: 0 },
          { opId: "op-2", status: "bloqueada_por_deficit", dataInicioReal: null, dataFimReal: null, alocacoes: [], deficitResidualHorasPadrao: 3 },
        ],
        excluidas: [],
      },
    });
    const { container } = render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    preencherMotivo();
    fireEvent.click(screen.getByLabelText(/Subir prioridade do projeto 260005/));

    await waitFor(() => expect(screen.getByText(/Prioridade atualizada/)).toBeTruthy());
    // "1" fica dentro de <strong>, texto vizinho fica fora - getByText não
    // casa string partida entre nós; container.textContent junta tudo.
    expect(container.textContent).toMatch(/1 operação\(ões\) programada\(s\)/);
    expect(container.textContent).toMatch(/1 com déficit de capacidade/);
    expect(consultarFilaPrioridadesPcpActionMock).toHaveBeenCalledTimes(2); // carga inicial + recarga pós-movimento.
  });

  it("movimento com sucesso mas recálculo real interrompido pelo supervisor: mensagem honesta, nunca finge um resultado do Motor", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    moverPrioridadeProjetoPcpActionMock.mockResolvedValue({
      ok: true,
      posicaoNova: 500,
      eventoHistoricoId: "evento-1",
      conclusaoExecucao: { aceito: true, resultadoEfetivo: "concluido", programacaoId: "prog-1", viaRecuperacaoPosFalhaDeComunicacao: false },
      recalculo: { ok: false, motivo: "interrompido_por_limite_de_tempo" },
    });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    preencherMotivo();
    fireEvent.click(screen.getByLabelText(/Subir prioridade do projeto 260005/));

    await waitFor(() => expect(screen.getByText(/Prioridade atualizada/)).toBeTruthy());
    expect(screen.getByText(/interrompido por exceder o tempo limite/)).toBeTruthy();
  });

  it("movimento com sucesso mas liberação da reserva falhou: nunca aparenta término normal, avisa bloqueio de novas movimentações", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    moverPrioridadeProjetoPcpActionMock.mockResolvedValue({
      ok: true,
      posicaoNova: 500,
      eventoHistoricoId: "evento-1",
      conclusaoExecucao: { aceito: false, motivoRejeicao: "concluir_execucao_motor_pcp: timeout de rede" },
      recalculo: { ok: true, versaoCapacidadeUtilizada: "7", operacoes: [], excluidas: [] },
    });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    preencherMotivo();
    fireEvent.click(screen.getByLabelText(/Subir prioridade do projeto 260005/));

    await waitFor(() => expect(screen.getByText(/Prioridade atualizada/)).toBeTruthy());
    expect(screen.getByText(/situação não confirmada/)).toBeTruthy();
    expect(screen.getByText(/timeout de rede/)).toBeTruthy();
  });

  it("falha de reordenação: prioridade não mudou, mensagem de erro exibida", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    moverPrioridadeProjetoPcpActionMock.mockResolvedValue({
      ok: false,
      motivo: "falha_reordenacao",
      detalhe: "reordenar_fila_pcp: vizinho anterior não está na fila da empresa.",
    });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    preencherMotivo();
    fireEvent.click(screen.getByLabelText(/Subir prioridade do projeto 260005/));

    await waitFor(() => expect(screen.getByText(/Não foi possível alterar a prioridade/)).toBeTruthy());
  });

  it("reserva ocupada por outro usuário: mensagem específica, NUNCA aparenta que a movimentação foi realizada", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    moverPrioridadeProjetoPcpActionMock.mockResolvedValue({
      ok: false,
      motivo: "reserva_ocupada",
      detalhe: { responsavelAtualNome: "Outro Usuário", situacao: "ocupada" },
    });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    preencherMotivo();
    fireEvent.click(screen.getByLabelText(/Subir prioridade do projeto 260005/));

    await waitFor(() => expect(screen.getByText(/Outro Usuário está com uma movimentação/)).toBeTruthy());
    expect(screen.queryByText(/Prioridade atualizada/)).toBeNull();
  });

  it("reserva em recuperação pendente: mensagem explica o bloqueio até recuperação segura", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    moverPrioridadeProjetoPcpActionMock.mockResolvedValue({
      ok: false,
      motivo: "reserva_ocupada",
      detalhe: { responsavelAtualNome: "ADM A", situacao: "recuperacao_pendente" },
    });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    preencherMotivo();
    fireEvent.click(screen.getByLabelText(/Subir prioridade do projeto 260005/));

    await waitFor(() => expect(screen.getByText(/aguarda recuperação segura/)).toBeTruthy());
  });

  it("movimento sem permissão: controles de movimentação são desativados após a resposta", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    moverPrioridadeProjetoPcpActionMock.mockResolvedValue({ ok: false, motivo: "nao_autorizado" });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    preencherMotivo();
    fireEvent.click(screen.getByLabelText(/Subir prioridade do projeto 260005/));

    await waitFor(() => expect(screen.getByText(/permissão apenas para visualizar/)).toBeTruthy());
    expect((screen.getByLabelText(/Subir prioridade do projeto 260001/) as HTMLButtonElement).disabled).toBe(true);
  });

  it("clique repetido durante movimentação em andamento: só 1 chamada ao servidor", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    let resolverPrimeiraChamada!: (valor: unknown) => void;
    moverPrioridadeProjetoPcpActionMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolverPrimeiraChamada = resolve)),
    );
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    preencherMotivo();
    const botaoSubir = screen.getByLabelText(/Subir prioridade do projeto 260005/);
    fireEvent.click(botaoSubir);
    await waitFor(() => expect((botaoSubir as HTMLButtonElement).disabled).toBe(true));
    // Botão já desabilitado - um segundo clique via fireEvent direto não dispararia o handler de qualquer forma;
    // o importante é que só 1 chamada ocorreu até aqui.
    expect(moverPrioridadeProjetoPcpActionMock).toHaveBeenCalledTimes(1);

    resolverPrimeiraChamada({
      ok: true,
      posicaoNova: 500,
      eventoHistoricoId: "evento-1",
      conclusaoExecucao: { aceito: true, resultadoEfetivo: "concluido", programacaoId: "prog-1", viaRecuperacaoPosFalhaDeComunicacao: false },
      recalculo: { ok: true, versaoCapacidadeUtilizada: "7", operacoes: [], excluidas: [] },
    });
    await waitFor(() => expect(screen.getByText(/Prioridade atualizada/)).toBeTruthy());
  });
});

// ETAPA 2O.8B-I6H: botão "Solicitar Cálculo" - ação independente, NUNCA
// move prioridade, NUNCA grava no Histórico de Prioridades. Não pode
// apresentar sucesso antes da confirmação da publicação oficial
// (conclusaoExecucao), mesmo quando o Motor concluiu tecnicamente.
describe("PrioridadesPcpPage - Solicitar Cálculo (I6H)", () => {
  it("clique chama a Server Action com dataInicial/dataFinal, nunca com projetoId/motivo", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    solicitarCalculoProgramacaoPcpActionMock.mockResolvedValue({
      ok: true,
      versaoCapacidadeUtilizada: "7",
      janela: { dataInicial: "2026-10-28", dataFinal: "2026-11-03" },
      operacoes: [],
      excluidas: [],
      conclusaoExecucao: { aceito: true, resultadoEfetivo: "concluido", programacaoId: "prog-1", viaRecuperacaoPosFalhaDeComunicacao: false },
    });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Solicitar Cálculo" }));

    await waitFor(() => expect(solicitarCalculoProgramacaoPcpActionMock).toHaveBeenCalledTimes(1));
    const payload = solicitarCalculoProgramacaoPcpActionMock.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(["dataFinal", "dataInicial"]);
  });

  it("Motor concluído E publicação oficial concluída: mensagem de sucesso só aparece com conclusaoExecucao confirmada", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    solicitarCalculoProgramacaoPcpActionMock.mockResolvedValue({
      ok: true,
      versaoCapacidadeUtilizada: "9",
      janela: { dataInicial: "2026-10-28", dataFinal: "2026-11-03" },
      operacoes: [
        { opId: "op-1", status: "concluida", dataInicioReal: "2026-10-28", dataFimReal: "2026-10-28", alocacoes: [], deficitResidualHorasPadrao: 0 },
      ],
      excluidas: [],
      conclusaoExecucao: { aceito: true, resultadoEfetivo: "concluido", programacaoId: "prog-9", viaRecuperacaoPosFalhaDeComunicacao: false },
    });
    const { container } = render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Solicitar Cálculo" }));

    await waitFor(() => expect(screen.getByText(/Programação oficial publicada com sucesso/)).toBeTruthy());
    expect(container.textContent).toMatch(/1 operação\(ões\) programada\(s\)/);
  });

  it("Motor concluído mas versão ficou obsoleta: NUNCA mostra sucesso, explica a obsolescência", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    solicitarCalculoProgramacaoPcpActionMock.mockResolvedValue({
      ok: true,
      versaoCapacidadeUtilizada: "9",
      janela: { dataInicial: "2026-10-28", dataFinal: "2026-11-03" },
      operacoes: [],
      excluidas: [],
      conclusaoExecucao: { aceito: true, resultadoEfetivo: "obsoleto", programacaoId: null, viaRecuperacaoPosFalhaDeComunicacao: false },
    });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Solicitar Cálculo" }));

    await waitFor(() => expect(screen.getByText(/rejeitado por obsolescência/)).toBeTruthy());
    expect(screen.queryByText(/publicada com sucesso/)).toBeNull();
  });

  it("estado desconhecido após falha: NUNCA presume sucesso nem falha confirmada, avisa bloqueio até recuperação", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    solicitarCalculoProgramacaoPcpActionMock.mockResolvedValue({ ok: false, motivo: "estado_desconhecido_apos_falha" });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Solicitar Cálculo" }));

    await waitFor(() => expect(screen.getByText(/estado da execução não pôde ser confirmado/)).toBeTruthy());
  });

  it("reserva ocupada por uma movimentação de prioridade em andamento: mensagem específica", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    solicitarCalculoProgramacaoPcpActionMock.mockResolvedValue({
      ok: false,
      motivo: "reserva_ocupada",
      detalhe: { responsavelAtualNome: "Outro Usuário", situacao: "ocupada" },
    });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Solicitar Cálculo" }));

    await waitFor(() => expect(screen.getByText(/Outro Usuário está com uma movimentação/)).toBeTruthy());
  });

  it("sem permissão: botão é desativado após a resposta, igual ao fluxo de movimentação", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    solicitarCalculoProgramacaoPcpActionMock.mockResolvedValue({ ok: false, motivo: "nao_autorizado" });
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Solicitar Cálculo" }));

    await waitFor(() => expect(screen.getByText(/pcp.solicitar_calculo/)).toBeTruthy());
    expect((screen.getByRole("button", { name: "Solicitar Cálculo" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("clique repetido enquanto a solicitação está em andamento: só 1 chamada ao servidor", async () => {
    consultarFilaPrioridadesPcpActionMock.mockResolvedValue({ ok: true, fila: filaDeCinco() });
    let resolverChamada!: (valor: unknown) => void;
    solicitarCalculoProgramacaoPcpActionMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolverChamada = resolve)),
    );
    render(<PrioridadesPcpPage />);

    await waitFor(() => expect(screen.getByText("260005")).toBeTruthy());
    const botao = screen.getByRole("button", { name: "Solicitar Cálculo" });
    fireEvent.click(botao);
    await waitFor(() => expect(screen.getByRole("button", { name: "Calculando..." })).toBeTruthy());
    expect(solicitarCalculoProgramacaoPcpActionMock).toHaveBeenCalledTimes(1);

    resolverChamada({
      ok: true,
      versaoCapacidadeUtilizada: "7",
      janela: { dataInicial: "2026-10-28", dataFinal: "2026-11-03" },
      operacoes: [],
      excluidas: [],
      conclusaoExecucao: { aceito: true, resultadoEfetivo: "concluido", programacaoId: "prog-1", viaRecuperacaoPosFalhaDeComunicacao: false },
    });
    await waitFor(() => expect(screen.getByText(/publicada com sucesso/)).toBeTruthy());
  });
});
