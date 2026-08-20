/* @vitest-environment jsdom */
// CORREÇÃO (achada em teste visual real, projeto 260011 - "Verificando
// acesso..." travava indefinidamente em Cenários e depois em Proposta,
// sem erro no console, só reload recuperava): supabase.auth.getSession()
// pode nunca resolver (lock interno do GoTrueClient nunca liberado) -
// este arquivo prova que o AuthGate SEMPRE termina em um dos 3 estados
// exigidos (autorizado/redirecionado/erro recuperável), nunca fica
// preso em "Verificando acesso..." para sempre.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const replaceMock = vi.fn();
const routerMock = { replace: replaceMock };
let pathnameMock = "/central";

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => pathnameMock,
}));

vi.mock("@/modules/auth/InactivityGuard", () => ({
  InactivityGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/modules/auth/UserMenu", () => ({
  UserMenu: () => <div>menu</div>,
}));

const getSessionMock = vi.fn();
const onAuthStateChangeMock = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
      onAuthStateChange: (...args: unknown[]) => onAuthStateChangeMock(...args),
    },
  },
}));

import { AuthGate } from "./AuthGate";

function criarDeferido<T>() {
  let resolve!: (valor: T) => void;
  let reject!: (erro: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function sessaoFake(userId = "user-1") {
  return { user: { id: userId, email: "user@teste.com" } } as never;
}

const unsubscribeMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  pathnameMock = "/central";
  onAuthStateChangeMock.mockReturnValue({ data: { subscription: { unsubscribe: unsubscribeMock } } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AuthGate - verificação de sessão sempre termina", () => {
  it("caminho feliz: sessão resolve normalmente, mostra o conteúdo protegido", async () => {
    getSessionMock.mockResolvedValue({ data: { session: sessaoFake() } });

    render(
      <AuthGate>
        <div>conteudo protegido</div>
      </AuthGate>,
    );

    expect(screen.getByText("Verificando acesso...")).toBeTruthy();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("conteudo protegido")).toBeTruthy();
    expect(screen.queryByText("Verificando acesso...")).toBeNull();
  });

  it("getSession() nunca resolve (lock travado): depois do timeout, mostra erro recuperável em vez de travar para sempre", async () => {
    const deferido = criarDeferido<{ data: { session: unknown } }>();
    getSessionMock.mockReturnValue(deferido.promise);

    render(
      <AuthGate>
        <div>conteudo protegido</div>
      </AuthGate>,
    );

    expect(screen.getByText("Verificando acesso...")).toBeTruthy();

    // Bem antes do timeout: continua mostrando "Verificando acesso...", nunca troca cedo demais.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("Verificando acesso...")).toBeTruthy();

    // Passa do timeout: nunca mais "Verificando acesso..." para sempre - chega a um estado terminal (erro recuperável).
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText("Verificando acesso...")).toBeNull();
    expect(screen.getByText(/Não foi possível confirmar sua sessão/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Recarregar página" })).toBeTruthy();
    // Fail-closed: nunca mostra o conteúdo protegido enquanto a sessão real é desconhecida.
    expect(screen.queryByText("conteudo protegido")).toBeNull();
  });

  it("getSession() rejeita (erro de rede): mostra erro recuperável, nunca trava em 'Verificando acesso...'", async () => {
    const deferido = criarDeferido<{ data: { session: unknown } }>();
    getSessionMock.mockReturnValue(deferido.promise);

    render(
      <AuthGate>
        <div>conteudo protegido</div>
      </AuthGate>,
    );

    await act(async () => {
      deferido.reject(new Error("network error"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText("Verificando acesso...")).toBeNull();
    expect(screen.getByText(/Não foi possível confirmar sua sessão/)).toBeTruthy();
  });

  it("se a sessão real chega DEPOIS do timeout já ter mostrado o erro, recupera automaticamente (nunca exige reload se a promise destravar sozinha)", async () => {
    const deferido = criarDeferido<{ data: { session: unknown } }>();
    getSessionMock.mockReturnValue(deferido.promise);

    render(
      <AuthGate>
        <div>conteudo protegido</div>
      </AuthGate>,
    );

    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.getByText(/Não foi possível confirmar sua sessão/)).toBeTruthy();

    await act(async () => {
      deferido.resolve({ data: { session: sessaoFake() } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText(/Não foi possível confirmar sua sessão/)).toBeNull();
    expect(screen.getByText("conteudo protegido")).toBeTruthy();
  });

  it("botão 'Recarregar página' chama window.location.reload()", async () => {
    const deferido = criarDeferido<{ data: { session: unknown } }>();
    getSessionMock.mockReturnValue(deferido.promise);

    const reloadMock = vi.fn();
    const localizacaoOriginal = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...localizacaoOriginal, reload: reloadMock },
    });

    render(
      <AuthGate>
        <div>conteudo protegido</div>
      </AuthGate>,
    );

    await act(async () => {
      vi.advanceTimersByTime(8000);
    });

    fireEvent.click(screen.getByRole("button", { name: "Recarregar página" }));
    expect(reloadMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "location", { configurable: true, value: localizacaoOriginal });
  });

  it("desmontar antes do timeout nunca lança nem atualiza estado após desmontagem (limpa o timer)", async () => {
    const deferido = criarDeferido<{ data: { session: unknown } }>();
    getSessionMock.mockReturnValue(deferido.promise);

    const { unmount } = render(
      <AuthGate>
        <div>conteudo protegido</div>
      </AuthGate>,
    );

    unmount();

    // Avançar o relógio depois de desmontado nunca deve lançar (setState em componente desmontado seria um erro/warning).
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
  });
});
