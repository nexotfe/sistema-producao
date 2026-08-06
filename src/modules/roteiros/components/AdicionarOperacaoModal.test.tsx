/* @vitest-environment jsdom */
// Cobre o roteiro de teste combinado com o usuario para a correcao do
// react-hooks/set-state-in-effect neste modal (padrao key+remontagem
// ja usado 3x nesta sessao): abrir como novo, fechar e reabrir, editar
// operacao A e depois B, salvar com sucesso e com erro, e confirmar
// que nenhum valor vaza entre aberturas. onAdd/onEdit sao mockados -
// a logica de gravacao em si (useRoteiro/RPC) nao muda nesta correcao,
// so' a sincronizacao dos campos do formulario com a operacao editada.
//
// Os campos <input>/<label> deste modal nao tem htmlFor/id (pre-
// existente, fora do escopo desta correcao) - por isso as consultas
// abaixo usam posicao no DOM (ordem, tempo, descricao, nessa ordem no
// JSX) em vez de getByLabelText.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdicionarOperacaoModal } from "./AdicionarOperacaoModal";
import type { BomOperacao, OpcaoSelect } from "../types";

// Sem test.globals no vitest.config.mts, o auto-cleanup do
// @testing-library/react (que depende de um afterEach global) nunca
// dispara - sem isso, cada render() dentro deste arquivo empilha no
// mesmo document.body e as consultas por texto/role passam a achar
// mais de um elemento.
afterEach(() => {
  cleanup();
});

const recursosDisponiveis: OpcaoSelect[] = [
  { id: "recurso-1", label: "CAL-001 Caldeireiro" },
  { id: "recurso-2", label: "SOLD-001 Solda" },
];

const operacaoA: BomOperacao = {
  id: "op-a",
  ordem: 10,
  descricao: "Corte a laser",
  recursoProdutivoId: "recurso-1",
  recursoNome: "CAL-001 Caldeireiro",
  tipo: "producao",
  tempoEstimadoMinutos: 120,
  observacoes: "cuidado com rebarba",
};

const operacaoB: BomOperacao = {
  id: "op-b",
  ordem: 20,
  descricao: "Solda de acabamento",
  recursoProdutivoId: "recurso-2",
  recursoNome: "SOLD-001 Solda",
  tipo: "engenharia",
  tempoEstimadoMinutos: 45,
  observacoes: null,
};

// Ordem no JSX: Ordem (OP), Tempo estimado (min), Descricao.
function campos(container: HTMLElement) {
  const inputs = container.querySelectorAll("input");
  return {
    ordem: inputs[0] as HTMLInputElement,
    tempo: inputs[1] as HTMLInputElement,
    descricao: inputs[2] as HTMLInputElement,
  };
}

describe("AdicionarOperacaoModal", () => {
  it("abre como novo com os campos vazios e a proxima ordem sugerida", () => {
    const { container } = render(
      <AdicionarOperacaoModal
        open
        onClose={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        recursosDisponiveis={recursosDisponiveis}
        proximaOrdem={30}
        operacaoEditando={null}
      />,
    );

    const { ordem, descricao } = campos(container);
    expect(ordem.value).toBe("30");
    expect(descricao.value).toBe("");
    expect(screen.getByText("Adicionar OP")).toBeTruthy();
  });

  it("fechar e reabrir como novo nao mantem texto digitado", () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <AdicionarOperacaoModal
        open
        onClose={onClose}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        recursosDisponiveis={recursosDisponiveis}
        proximaOrdem={30}
        operacaoEditando={null}
      />,
    );

    fireEvent.change(campos(container).descricao, {
      target: { value: "rascunho perdido" },
    });
    expect(campos(container).descricao.value).toBe("rascunho perdido");

    rerender(
      <AdicionarOperacaoModal
        open={false}
        onClose={onClose}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        recursosDisponiveis={recursosDisponiveis}
        proximaOrdem={30}
        operacaoEditando={null}
      />,
    );
    expect(container.querySelector("input")).toBeNull();

    rerender(
      <AdicionarOperacaoModal
        open
        onClose={onClose}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        recursosDisponiveis={recursosDisponiveis}
        proximaOrdem={30}
        operacaoEditando={null}
      />,
    );

    const { ordem, descricao } = campos(container);
    expect(descricao.value).toBe("");
    expect(ordem.value).toBe("30");
  });

  it("editar operacao A e depois B mostra os campos de cada uma, sem vazamento", () => {
    const { container, rerender } = render(
      <AdicionarOperacaoModal
        open
        onClose={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        recursosDisponiveis={recursosDisponiveis}
        proximaOrdem={30}
        operacaoEditando={operacaoA}
      />,
    );

    let campo = campos(container);
    expect(campo.descricao.value).toBe("Corte a laser");
    expect(campo.ordem.value).toBe("10");
    expect(campo.tempo.value).toBe("120");
    expect(screen.getByText("Editar OP")).toBeTruthy();

    // Simula o usuario digitando algo em A antes de trocar para B - o
    // valor editado de A nao pode aparecer no formulario de B.
    fireEvent.change(campo.descricao, {
      target: { value: "Corte a laser (revisado)" },
    });

    rerender(
      <AdicionarOperacaoModal
        open
        onClose={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        recursosDisponiveis={recursosDisponiveis}
        proximaOrdem={30}
        operacaoEditando={operacaoB}
      />,
    );

    campo = campos(container);
    expect(campo.descricao.value).toBe("Solda de acabamento");
    expect(campo.ordem.value).toBe("20");
    expect(campo.tempo.value).toBe("45");
    expect(campo.descricao.value).not.toBe("Corte a laser (revisado)");
  });

  it("salvar com sucesso chama onEdit com os dados atuais e fecha o modal", async () => {
    const onEdit = vi.fn().mockResolvedValue({ status: "ok" });
    const onClose = vi.fn();

    render(
      <AdicionarOperacaoModal
        open
        onClose={onClose}
        onAdd={vi.fn()}
        onEdit={onEdit}
        recursosDisponiveis={recursosDisponiveis}
        proximaOrdem={30}
        operacaoEditando={operacaoA}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    });

    expect(onEdit).toHaveBeenCalledWith(
      "op-a",
      expect.objectContaining({ descricao: "Corte a laser" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("salvar com erro mostra a mensagem e mantem o modal aberto (nao fecha)", async () => {
    const onEdit = vi.fn().mockResolvedValue({
      status: "erro",
      mensagem: "Ordem já utilizada por outra operação.",
    });
    const onClose = vi.fn();

    const { container } = render(
      <AdicionarOperacaoModal
        open
        onClose={onClose}
        onAdd={vi.fn()}
        onEdit={onEdit}
        recursosDisponiveis={recursosDisponiveis}
        proximaOrdem={30}
        operacaoEditando={operacaoA}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    });

    expect(
      screen.getByText("Ordem já utilizada por outra operação."),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    // Os campos continuam preenchidos - o erro nao limpou o formulario.
    expect(campos(container).descricao.value).toBe("Corte a laser");
  });
});
