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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));

import { supabase } from "@/lib/supabaseClient";
import { UserMenu } from "./UserMenu";

const supabaseMock = supabase as unknown as {
  auth: { signOut: ReturnType<typeof vi.fn> };
};

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
    supabaseMock.auth.signOut.mockResolvedValue({ error: null });
    render(<UserMenu email="usuario@nexotfe.com" />);
    expect(screen.getByText("usuario@nexotfe.com")).toBeTruthy();
  });

  it("sucesso: signOut local, depois router.replace('/') e router.refresh()", async () => {
    supabaseMock.auth.signOut.mockResolvedValue({ error: null });
    render(<UserMenu email="usuario@nexotfe.com" />);

    fireEvent.click(screen.getByRole("button", { name: "Sair" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(supabaseMock.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(replaceMock).toHaveBeenCalledWith("/");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("erro: mensagem visível, permanece na página, botão volta a ficar clicável", async () => {
    supabaseMock.auth.signOut.mockResolvedValue({
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
    supabaseMock.auth.signOut.mockReturnValue(deferido.promise);

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

    expect(supabaseMock.auth.signOut).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });
});
