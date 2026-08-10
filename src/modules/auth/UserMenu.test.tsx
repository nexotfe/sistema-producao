/* @vitest-environment jsdom */
// Cobre os 3 comportamentos pedidos para o botao Sair: sucesso (signOut
// local + router.replace("/") + router.refresh()), erro (mensagem
// visivel, permanece na pagina, botao volta a ficar clicavel) e
// prevencao de clique duplo (signOut chamado uma unica vez mesmo com
// dois cliques antes da resposta chegar).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const replaceMock = vi.fn();
const refreshMock = vi.fn();

// Referencia estavel entre renders - reflete o comportamento real do
// useRouter do Next (memoizado), diferente de retornar um objeto novo
// a cada chamada.
const routerMock = { replace: replaceMock, refresh: refreshMock };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@/modules/auth/lib/signOutLocal", () => ({
  signOutLocal: vi.fn(),
}));

import { signOutLocal } from "@/modules/auth/lib/signOutLocal";
import { UserMenu } from "./UserMenu";

const signOutLocalMock = signOutLocal as unknown as ReturnType<typeof vi.fn>;

function criarDeferido<T>() {
  let resolve!: (valor: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("UserMenu", () => {
  it("mostra o e-mail da sessão", () => {
    signOutLocalMock.mockResolvedValue({ error: null });
    render(<UserMenu email="usuario@nexotfe.com" />);
    expect(screen.getByText("usuario@nexotfe.com")).toBeTruthy();
  });

  it("sucesso: signOut local, depois router.replace('/') e router.refresh()", async () => {
    signOutLocalMock.mockResolvedValue({ error: null });
    render(<UserMenu email="usuario@nexotfe.com" />);

    fireEvent.click(screen.getByRole("button", { name: "Sair" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(signOutLocalMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("erro: mensagem visível, permanece na página, botão volta a ficar clicável", async () => {
    signOutLocalMock.mockResolvedValue({
      error: { message: "network error" },
    });
    render(<UserMenu email="usuario@nexotfe.com" />);

    fireEvent.click(screen.getByRole("button", { name: "Sair" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(replaceMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/não foi possível sair/i);

    const botao = screen.getByRole("button", { name: "Sair" }) as HTMLButtonElement;
    expect(botao.disabled).toBe(false);
  });

  it("clique duplo: signOut chamado uma única vez mesmo com dois cliques antes da resposta", async () => {
    const deferido = criarDeferido<{ error: null }>();
    signOutLocalMock.mockReturnValue(deferido.promise);

    render(<UserMenu email="usuario@nexotfe.com" />);
    const botao = screen.getByRole("button", { name: /sair/i });

    fireEvent.click(botao);
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Saindo..." })).toBeTruthy();

    // Segundo clique enquanto ainda esta processando o primeiro - o
    // botao ja esta disabled (bloqueio nativo do DOM), e o guard interno
    // de isSigningOut cobre qualquer disparo que contorne o disabled.
    fireEvent.click(botao);

    await act(async () => {
      deferido.resolve({ error: null });
      await Promise.resolve();
    });

    expect(signOutLocalMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });
});
