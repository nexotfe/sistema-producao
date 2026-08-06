/* @vitest-environment jsdom */
// Padrao 2 (key+remontagem) - cobre fechamento/reabertura,
// atualizacao do mesmo produto com novo produtoOrigemCodigo (a chave
// precisa incluir o codigo, nao so' o id) e troca para outro produto.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {},
}));

const duplicarProdutoComRoteiroMock = vi.fn();
vi.mock("../lib/duplicarProdutoComRoteiro", () => ({
  duplicarProdutoComRoteiro: (...args: unknown[]) =>
    duplicarProdutoComRoteiroMock(...args),
}));

import { DuplicarProdutoModal } from "./DuplicarProdutoModal";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

function campoCodigo() {
  return screen.getByDisplayValue(/-COPIA$|./) as HTMLInputElement;
}

describe("DuplicarProdutoModal", () => {
  it("abre com a sugestao CODIGO-COPIA; fecha e reabre para o mesmo produto sem manter edicao", () => {
    const { rerender } = render(
      <DuplicarProdutoModal
        open
        onClose={vi.fn()}
        produtoOrigemId="produto-1"
        produtoOrigemCodigo="M-001"
      />,
    );
    expect(campoCodigo().value).toBe("M-001-COPIA");

    fireEvent.change(campoCodigo(), { target: { value: "M-001-TESTE" } });
    expect(campoCodigo().value).toBe("M-001-TESTE");

    rerender(
      <DuplicarProdutoModal
        open={false}
        onClose={vi.fn()}
        produtoOrigemId="produto-1"
        produtoOrigemCodigo="M-001"
      />,
    );
    expect(screen.queryByDisplayValue(/M-001/)).toBeNull();

    rerender(
      <DuplicarProdutoModal
        open
        onClose={vi.fn()}
        produtoOrigemId="produto-1"
        produtoOrigemCodigo="M-001"
      />,
    );
    expect(campoCodigo().value).toBe("M-001-COPIA");
  });

  it("mesmo produtoOrigemId com produtoOrigemCodigo novo resincroniza a sugestao (chave inclui o codigo)", () => {
    const { rerender } = render(
      <DuplicarProdutoModal
        open
        onClose={vi.fn()}
        produtoOrigemId="produto-1"
        produtoOrigemCodigo="M-001"
      />,
    );
    expect(campoCodigo().value).toBe("M-001-COPIA");

    rerender(
      <DuplicarProdutoModal
        open
        onClose={vi.fn()}
        produtoOrigemId="produto-1"
        produtoOrigemCodigo="M-001-REV-B"
      />,
    );
    expect(campoCodigo().value).toBe("M-001-REV-B-COPIA");
  });

  it("troca para outro produto reinicia a sugestao com o codigo do novo produto", () => {
    const { rerender } = render(
      <DuplicarProdutoModal
        open
        onClose={vi.fn()}
        produtoOrigemId="produto-1"
        produtoOrigemCodigo="M-001"
      />,
    );

    fireEvent.change(campoCodigo(), { target: { value: "RASCUNHO" } });
    expect(campoCodigo().value).toBe("RASCUNHO");

    rerender(
      <DuplicarProdutoModal
        open
        onClose={vi.fn()}
        produtoOrigemId="produto-2"
        produtoOrigemCodigo="N-777"
      />,
    );
    expect(campoCodigo().value).toBe("N-777-COPIA");
  });

  it("duplicar com sucesso chama a RPC, fecha e navega para o novo roteiro", async () => {
    duplicarProdutoComRoteiroMock.mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <DuplicarProdutoModal
        open
        onClose={onClose}
        produtoOrigemId="produto-1"
        produtoOrigemCodigo="M-001"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Duplicar"));
    });

    expect(duplicarProdutoComRoteiroMock).toHaveBeenCalledWith(
      {},
      "produto-1",
      "M-001-COPIA",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/roteiros/M-001-COPIA");
  });

  it("duplicar com erro mostra a mensagem e mantem o modal aberto", async () => {
    duplicarProdutoComRoteiroMock.mockRejectedValue(
      new Error("Código já utilizado."),
    );
    const onClose = vi.fn();

    render(
      <DuplicarProdutoModal
        open
        onClose={onClose}
        produtoOrigemId="produto-1"
        produtoOrigemCodigo="M-001"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Duplicar"));
    });

    expect(screen.getByText("Código já utilizado.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
