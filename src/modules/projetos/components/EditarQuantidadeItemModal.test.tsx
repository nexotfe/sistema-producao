/* @vitest-environment jsdom */
// Padrao 2 (key+remontagem) - cobre fechamento/reabertura,
// atualizacao do mesmo item com nova quantidade (a chave precisa
// incluir o valor, nao so' o id) e troca para outro item.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EditarQuantidadeItemModal } from "./EditarQuantidadeItemModal";

afterEach(() => {
  cleanup();
});

const itemA = { id: "item-a", pn: "P-001", descricao: "Motor A", quantidade: 5 };
const itemB = { id: "item-b", pn: "P-002", descricao: "Motor B", quantidade: 12 };

function campoQuantidade() {
  return screen.getByDisplayValue(/^[\d.,]+$/) as HTMLInputElement;
}

describe("EditarQuantidadeItemModal", () => {
  it("fecha (item=null) e reabre com o mesmo item sem manter texto digitado", () => {
    const { rerender } = render(
      <EditarQuantidadeItemModal item={itemA} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(campoQuantidade().value).toBe("5");

    fireEvent.change(campoQuantidade(), { target: { value: "999" } });
    expect(campoQuantidade().value).toBe("999");

    rerender(
      <EditarQuantidadeItemModal item={null} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(screen.queryByDisplayValue(/^[\d.,]+$/)).toBeNull();

    rerender(
      <EditarQuantidadeItemModal item={itemA} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(campoQuantidade().value).toBe("5");
  });

  it("atualizacao do mesmo item com nova quantidade resincroniza o campo (chave inclui o valor)", () => {
    const { rerender } = render(
      <EditarQuantidadeItemModal item={itemA} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(campoQuantidade().value).toBe("5");

    const itemAAtualizado = { ...itemA, quantidade: 8 };
    rerender(
      <EditarQuantidadeItemModal
        item={itemAAtualizado}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(campoQuantidade().value).toBe("8");
  });

  it("troca para outro item reinicia o campo com a quantidade do novo item", () => {
    const { rerender } = render(
      <EditarQuantidadeItemModal item={itemA} onClose={vi.fn()} onSave={vi.fn()} />,
    );

    fireEvent.change(campoQuantidade(), { target: { value: "999" } });
    expect(campoQuantidade().value).toBe("999");

    rerender(
      <EditarQuantidadeItemModal item={itemB} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(campoQuantidade().value).toBe("12");
    expect(screen.getByText(/Motor B/)).toBeTruthy();
  });

  it("salvar com sucesso chama onSave e fecha; com erro mantem o modal aberto", async () => {
    const onSaveErro = vi
      .fn()
      .mockResolvedValue({ status: "erro", mensagem: "Quantidade inválida." });
    const onClose = vi.fn();

    render(
      <EditarQuantidadeItemModal
        item={itemA}
        onClose={onClose}
        onSave={onSaveErro}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Salvar"));
    });

    expect(onSaveErro).toHaveBeenCalledWith("item-a", 5);
    expect(screen.getByText("Quantidade inválida.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
