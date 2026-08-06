/* @vitest-environment jsdom */
// Padrao 1b - mesma cobertura de ClienteSearchInput.test.tsx, adaptada
// ao gatilho especifico deste componente: busca so' fica ativa sem
// produto ja selecionado E com termo nao vazio.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from "@/lib/supabaseClient";
import { ProdutoSearchModal } from "./ProdutoSearchModal";

type Resultado = { data: unknown; error: unknown };

const supabaseMock = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
};

function criarDeferido<T>() {
  let resolve!: (valor: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function criarFakeQuery(resultado: Resultado | Promise<Resultado>) {
  const promessa = Promise.resolve(resultado);
  const builder: unknown = {
    select: () => builder,
    or: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => promessa,
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ProdutoSearchModal", () => {
  it("busca vazia (campo limpo) oculta resultados imediatamente", async () => {
    supabaseMock.from.mockImplementation(() =>
      criarFakeQuery({
        data: [{ id: "p1", codigo: "M001", descricao: "Motor" }],
        error: null,
      }),
    );

    render(<ProdutoSearchModal open onClose={vi.fn()} onAdd={vi.fn()} />);
    const input = screen.getByPlaceholderText("Ex: M12345 ou Cortadora");
    fireEvent.change(input, { target: { value: "Motor" } });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/Motor/)).toBeTruthy();

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByText(/Motor/)).toBeNull();
  });

  it("resposta antiga que chega depois da nova nao aplica resultado", async () => {
    const deferidos: ReturnType<typeof criarDeferido<Resultado>>[] = [];
    supabaseMock.from.mockImplementation(() => {
      const deferido = criarDeferido<Resultado>();
      deferidos.push(deferido);
      return criarFakeQuery(deferido.promise);
    });

    render(<ProdutoSearchModal open onClose={vi.fn()} onAdd={vi.fn()} />);
    const input = screen.getByPlaceholderText("Ex: M12345 ou Cortadora");

    fireEvent.change(input, { target: { value: "Mot" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(deferidos.length).toBe(1);

    fireEvent.change(input, { target: { value: "Motor" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(deferidos.length).toBe(2);

    await act(async () => {
      deferidos[1].resolve({
        data: [{ id: "p2", codigo: "M002", descricao: "Motor Elétrico" }],
        error: null,
      });
    });
    expect(screen.getByText(/Motor Elétrico/)).toBeTruthy();

    await act(async () => {
      deferidos[0].resolve({
        data: [{ id: "p1", codigo: "M001", descricao: "Motorzinho Antigo" }],
        error: null,
      });
    });
    expect(screen.queryByText(/Motorzinho Antigo/)).toBeNull();
  });
});
