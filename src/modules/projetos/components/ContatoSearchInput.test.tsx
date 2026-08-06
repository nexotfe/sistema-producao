/* @vitest-environment jsdom */
// Padrao 1b - mesma cobertura de ClienteSearchInput.test.tsx, adaptada
// ao gatilho especifico deste componente: busca so' fica ativa com
// clienteId presente E termo nao vazio.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from "@/lib/supabaseClient";
import { ContatoSearchInput } from "./ContatoSearchInput";

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
    eq: () => builder,
    is: () => builder,
    not: () => builder,
    ilike: () => builder,
    order: () => builder,
    neq: () => builder,
    limit: () => promessa,
    then: (
      onResolve: (r: Resultado) => void,
      onReject?: (e: unknown) => void,
    ) => promessa.then(onResolve, onReject),
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

function renderInput(clienteId: string | null) {
  return render(
    <ContatoSearchInput
      valorNome=""
      onChangeNome={vi.fn()}
      onSelecionar={vi.fn()}
      clienteId={clienteId}
      prefixoColuna="contato_comercial"
    />,
  );
}

describe("ContatoSearchInput", () => {
  it("sem clienteId, nao busca mesmo com termo preenchido", async () => {
    supabaseMock.from.mockImplementation(() =>
      criarFakeQuery({ data: [], error: null }),
    );

    const { rerender } = renderInput(null);
    const input = screen.getByPlaceholderText("Nome do contato");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Ana" } });

    rerender(
      <ContatoSearchInput
        valorNome="Ana"
        onChangeNome={vi.fn()}
        onSelecionar={vi.fn()}
        clienteId={null}
        prefixoColuna="contato_comercial"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("resposta antiga (chave anterior) nao aplica resultado nem religa o loading da busca atual", async () => {
    const deferidos: ReturnType<typeof criarDeferido<Resultado>>[] = [];
    supabaseMock.from.mockImplementation(() => {
      const deferido = criarDeferido<Resultado>();
      deferidos.push(deferido);
      return criarFakeQuery(deferido.promise);
    });

    const { rerender } = render(
      <ContatoSearchInput
        valorNome="An"
        onChangeNome={vi.fn()}
        onSelecionar={vi.fn()}
        clienteId="cliente-1"
        prefixoColuna="contato_comercial"
      />,
    );
    fireEvent.focus(screen.getByPlaceholderText("Nome do contato"));

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(deferidos.length).toBe(1);
    expect(screen.getByText("Buscando...")).toBeTruthy();

    rerender(
      <ContatoSearchInput
        valorNome="Ana"
        onChangeNome={vi.fn()}
        onSelecionar={vi.fn()}
        clienteId="cliente-1"
        prefixoColuna="contato_comercial"
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(deferidos.length).toBe(2);

    await act(async () => {
      deferidos[1].resolve({
        data: [{ contato_comercial_nome: "Ana Souza" }],
        error: null,
      });
    });
    expect(screen.getByText("Ana Souza")).toBeTruthy();

    await act(async () => {
      deferidos[0].resolve({
        data: [{ contato_comercial_nome: "Antonio Velho" }],
        error: null,
      });
    });
    expect(screen.getByText("Ana Souza")).toBeTruthy();
    expect(screen.queryByText("Antonio Velho")).toBeNull();
    expect(screen.queryByText("Buscando...")).toBeNull();
  });
});
