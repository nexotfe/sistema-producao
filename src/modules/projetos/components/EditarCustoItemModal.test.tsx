/* @vitest-environment jsdom */
// Padrao 2 (key+remontagem) - cobre fechamento/reabertura,
// atualizacao do mesmo item com novo custoUnitario (a chave precisa
// incluir o valor, nao so' o id, para resincronizar) e troca para
// outro item.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EditarCustoItemModal } from "./EditarCustoItemModal";

afterEach(() => {
  cleanup();
});

const itemA = { id: "item-a", pn: "P-001", descricao: "Motor A", custoUnitario: 100 };
const itemB = { id: "item-b", pn: "P-002", descricao: "Motor B", custoUnitario: 250 };

function campoCusto() {
  return screen.getByDisplayValue(/^[\d.,]+$/) as HTMLInputElement;
}

describe("EditarCustoItemModal", () => {
  it("fecha (item=null) e reabre com o mesmo item sem manter texto digitado", () => {
    const { rerender } = render(
      <EditarCustoItemModal item={itemA} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(campoCusto().value).toBe("100");

    fireEvent.change(campoCusto(), { target: { value: "999" } });
    expect(campoCusto().value).toBe("999");

    rerender(
      <EditarCustoItemModal item={null} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(screen.queryByDisplayValue(/^[\d.,]+$/)).toBeNull();

    rerender(
      <EditarCustoItemModal item={itemA} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(campoCusto().value).toBe("100");
  });

  it("atualizacao do mesmo item com novo custoUnitario resincroniza o campo (chave inclui o valor)", () => {
    const { rerender } = render(
      <EditarCustoItemModal item={itemA} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(campoCusto().value).toBe("100");

    const itemAAtualizado = { ...itemA, custoUnitario: 150 };
    rerender(
      <EditarCustoItemModal
        item={itemAAtualizado}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(campoCusto().value).toBe("150");
  });

  it("troca para outro item reinicia o campo com o custo do novo item", () => {
    const { rerender } = render(
      <EditarCustoItemModal item={itemA} onClose={vi.fn()} onSave={vi.fn()} />,
    );

    fireEvent.change(campoCusto(), { target: { value: "999" } });
    expect(campoCusto().value).toBe("999");

    rerender(
      <EditarCustoItemModal item={itemB} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(campoCusto().value).toBe("250");
    expect(screen.getByText(/Motor B/)).toBeTruthy();
  });

  it("salvar com sucesso chama onSave e fecha; com erro mantem o modal aberto", async () => {
    const onSaveErro = vi
      .fn()
      .mockResolvedValue({ status: "erro", mensagem: "Custo inválido." });
    const onClose = vi.fn();

    render(
      <EditarCustoItemModal item={itemA} onClose={onClose} onSave={onSaveErro} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Salvar"));
    });

    expect(onSaveErro).toHaveBeenCalledWith("item-a", 100);
    expect(screen.getByText("Custo inválido.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
