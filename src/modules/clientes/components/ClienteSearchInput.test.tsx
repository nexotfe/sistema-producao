/* @vitest-environment jsdom */
// Cobre as propriedades pedidas para a correcao do
// react-hooks/set-state-in-effect (Padrao 1b) em ClienteSearchInput:
// busca vazia oculta resultados/loading, debounce de 300ms antes de
// consultar, resposta antiga descartada quando uma busca mais nova ja
// assumiu, e (Padrao 1) o campo termo se resincroniza quando a prop
// value muda por fora.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from "@/lib/supabaseClient";
import { ClienteSearchInput } from "./ClienteSearchInput";

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
    is: () => builder,
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

function clienteRow(id: string, nome: string) {
  return { id, nome, nome_fantasia: null, cnpj: null };
}

describe("ClienteSearchInput", () => {
  it("busca vazia oculta resultados e loading imediatamente ao limpar o campo", async () => {
    supabaseMock.from.mockImplementation(() =>
      criarFakeQuery({ data: [clienteRow("c1", "Acme Ltda")], error: null }),
    );

    render(<ClienteSearchInput value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Buscar cliente");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Acme" } });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Acme Ltda")).toBeTruthy();

    fireEvent.change(input, { target: { value: "" } });

    expect(screen.queryByText("Acme Ltda")).toBeNull();
    expect(screen.queryByText("Buscando...")).toBeNull();
  });

  it("aguarda o debounce de 300ms antes de consultar", async () => {
    supabaseMock.from.mockImplementation(() =>
      criarFakeQuery({ data: [], error: null }),
    );

    render(<ClienteSearchInput value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Buscar cliente");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Acme" } });

    expect(supabaseMock.from).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    expect(supabaseMock.from).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it("resposta antiga que chega depois da nova nao aplica resultado nem religa o loading", async () => {
    const deferidos: ReturnType<typeof criarDeferido<Resultado>>[] = [];

    supabaseMock.from.mockImplementation(() => {
      const deferido = criarDeferido<Resultado>();
      deferidos.push(deferido);
      return criarFakeQuery(deferido.promise);
    });

    render(<ClienteSearchInput value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Buscar cliente");
    fireEvent.focus(input);

    fireEvent.change(input, { target: { value: "Acme" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(deferidos.length).toBe(1);
    expect(screen.getByText("Buscando...")).toBeTruthy();

    // Troca o termo antes da 1a resposta chegar - agenda uma nova busca.
    fireEvent.change(input, { target: { value: "Beta" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(deferidos.length).toBe(2);

    // A busca nova (Beta) responde primeiro.
    await act(async () => {
      deferidos[1].resolve({ data: [clienteRow("c2", "Beta Ltda")], error: null });
    });
    expect(screen.getByText("Beta Ltda")).toBeTruthy();
    expect(screen.queryByText("Buscando...")).toBeNull();

    // A resposta antiga (Acme) chega tarde - nao pode aplicar nem
    // religar o loading da busca ja concluida.
    await act(async () => {
      deferidos[0].resolve({ data: [clienteRow("c1", "Acme Ltda")], error: null });
    });
    expect(screen.getByText("Beta Ltda")).toBeTruthy();
    expect(screen.queryByText("Acme Ltda")).toBeNull();
    expect(screen.queryByText("Buscando...")).toBeNull();
  });

  it("resincroniza o termo quando a prop value muda por fora, sem sobrescrever digitacao indevidamente", () => {
    const { rerender } = render(
      <ClienteSearchInput value={null} onChange={vi.fn()} />,
    );
    const input = () =>
      screen.getByPlaceholderText("Buscar cliente") as HTMLInputElement;

    expect(input().value).toBe("");

    rerender(
      <ClienteSearchInput
        value={{ id: "c1", nome: "Acme Ltda" }}
        onChange={vi.fn()}
      />,
    );
    expect(input().value).toBe("Acme Ltda");

    rerender(<ClienteSearchInput value={null} onChange={vi.fn()} />);
    expect(input().value).toBe("");
  });
});
