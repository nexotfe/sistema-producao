/* @vitest-environment jsdom */
// Cobre o desenho aprovado do InactivityGuard: aviso aos 25min, logout
// aos 30min, children somem imediatamente ao expirar (mesmo antes do
// signOut terminar), sincronizacao entre abas via storage (com
// validacao de valores recebidos), remontagem/nova sessao nao e'
// deslogada por timestamp antigo, reconciliacao pelo relogio real ao
// voltar de suspensao, falha/repeticao do logout automatico, limiares
// estreitos que nao sao multiplos de um intervalo fixo, e desmontagem
// durante o logout automatico (a navegacao real e' responsabilidade do
// AuthGate, nao deste componente - por isso nao ha mock de
// next/navigation aqui).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/modules/auth/lib/signOutLocal", () => ({
  signOutLocal: vi.fn(),
}));

import { signOutLocal } from "@/modules/auth/lib/signOutLocal";
import { buildInactivityStorageKey } from "@/modules/auth/lib/inactivityStorage";
import { InactivityGuard } from "./InactivityGuard";

const signOutLocalMock = signOutLocal as unknown as ReturnType<typeof vi.fn>;

const WARNING_AFTER_MS = 25 * 60 * 1000;
const LOGOUT_AFTER_MS = 30 * 60 * 1000;

function renderGuard(userId = "user-1") {
  return render(
    <InactivityGuard userId={userId}>
      <div>conteudo protegido</div>
    </InactivityGuard>,
  );
}

function criarDeferido<T>() {
  let resolve!: (valor: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  window.localStorage.clear();
  signOutLocalMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("InactivityGuard", () => {
  it("mostra o conteúdo normalmente enquanto ativo", () => {
    renderGuard();
    expect(screen.getByText("conteudo protegido")).toBeTruthy();
  });

  it("aviso aos 25 minutos de inatividade, sem deslogar ainda", async () => {
    renderGuard();

    await act(async () => {
      vi.advanceTimersByTime(WARNING_AFTER_MS + 1000);
    });

    expect(screen.getByRole("alert").textContent).toMatch(/encerrada por inatividade/i);
    expect(screen.getByText("conteudo protegido")).toBeTruthy();
    expect(signOutLocalMock).not.toHaveBeenCalled();
  });

  it("logout (scope local) aos 30 minutos - navegação fica a cargo do AuthGate", async () => {
    renderGuard();

    await act(async () => {
      vi.advanceTimersByTime(LOGOUT_AFTER_MS + 1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(signOutLocalMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("conteudo protegido")).toBeNull();
  });

  it("para de renderizar children imediatamente ao expirar, mesmo com o logout ainda em andamento", async () => {
    signOutLocalMock.mockReturnValue(new Promise(() => {})); // nunca resolve
    renderGuard();

    await act(async () => {
      vi.advanceTimersByTime(LOGOUT_AFTER_MS + 1000);
    });

    expect(screen.queryByText("conteudo protegido")).toBeNull();
  });

  it("atividade genuína antes dos 25min impede o aviso de aparecer no marco original", async () => {
    renderGuard();

    await act(async () => {
      vi.advanceTimersByTime(WARNING_AFTER_MS - 5000);
    });
    fireEvent.mouseDown(window);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clique em 'Continuar conectado' cancela o logout pendente", async () => {
    renderGuard();

    await act(async () => {
      vi.advanceTimersByTime(WARNING_AFTER_MS + 1000);
    });
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continuar conectado" }));
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(WARNING_AFTER_MS - 1000);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(signOutLocalMock).not.toHaveBeenCalled();
  });

  it("sincroniza entre abas: evento storage com atividade mais recente cancela o aviso", async () => {
    renderGuard("user-1");

    await act(async () => {
      vi.advanceTimersByTime(WARNING_AFTER_MS + 1000);
    });
    expect(screen.getByRole("alert")).toBeTruthy();

    const key = buildInactivityStorageKey("user-1");
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key, newValue: String(Date.now()) }),
      );
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ignora timestamp inválido vindo de storage (NaN, negativo, futuro distante)", async () => {
    renderGuard("user-1");
    const key = buildInactivityStorageKey("user-1");

    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: "abc" }));
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: "-100" }));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          newValue: String(Date.now() + 10 * 60 * 1000),
        }),
      );
    });

    expect(screen.getByText("conteudo protegido")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    // o relogio real continua no controle - aos 25min reais, o aviso
    // aparece normalmente, provando que os valores invalidos acima nao
    // corromperam o estado interno.
    await act(async () => {
      vi.advanceTimersByTime(WARNING_AFTER_MS + 1000);
    });
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("remontagem/nova sessão: timestamp antigo no storage não desloga quem acabou de entrar", async () => {
    const key = buildInactivityStorageKey("user-2");
    window.localStorage.setItem(key, String(Date.now() - LOGOUT_AFTER_MS - 60_000));

    renderGuard("user-2");

    expect(screen.getByText("conteudo protegido")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(signOutLocalMock).not.toHaveBeenCalled();
  });

  it("reconcilia pelo relógio real ao voltar de suspensão (visibilitychange/focus), sem esperar o próximo tick", async () => {
    renderGuard();

    // Simula aba suspensa: o relogio do sistema avanca 40min de uma
    // vez, sem que nenhum timeout agendado tenha rodado nesse meio
    // tempo (equivalente a uma aba em background/suspensa).
    vi.setSystemTime(Date.now() + 40 * 60 * 1000);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });

    expect(screen.queryByText("conteudo protegido")).toBeNull();
  });

  it("falha no logout automático: mantém bloqueado, mostra mensagem e botão, tenta de novo ao clicar", async () => {
    signOutLocalMock.mockResolvedValue({ error: { message: "network error" } });
    renderGuard();

    await act(async () => {
      vi.advanceTimersByTime(LOGOUT_AFTER_MS + 1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText("conteudo protegido")).toBeNull();
    expect(screen.getByText(/não foi possível encerrar a sessão/i)).toBeTruthy();

    signOutLocalMock.mockResolvedValue({ error: null });
    fireEvent.click(screen.getByRole("button", { name: "Tentar sair novamente" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(signOutLocalMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("conteudo protegido")).toBeNull();
  });

  it("tenta de novo automaticamente ao recuperar internet, após falha", async () => {
    signOutLocalMock.mockResolvedValue({ error: { message: "offline" } });
    renderGuard();

    await act(async () => {
      vi.advanceTimersByTime(LOGOUT_AFTER_MS + 1000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(signOutLocalMock).toHaveBeenCalledTimes(1);

    signOutLocalMock.mockResolvedValue({ error: null });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(signOutLocalMock).toHaveBeenCalledTimes(2);
  });

  it("limiares estreitos (25s/30s, 5s de distância) não pulam o aviso mesmo sem serem múltiplos de um intervalo fixo", async () => {
    render(
      <InactivityGuard userId="user-1" warningAfterMs={25_000} logoutAfterMs={30_000}>
        <div>conteudo protegido</div>
      </InactivityGuard>,
    );

    await act(async () => {
      vi.advanceTimersByTime(25_000);
    });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("conteudo protegido")).toBeTruthy();
    expect(signOutLocalMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText("conteudo protegido")).toBeNull();
    expect(signOutLocalMock).toHaveBeenCalledTimes(1);
  });

  it("desmontagem durante o logout automático (AuthGate reagindo ao SIGNED_OUT) não gera setState em componente desmontado", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const deferido = criarDeferido<{ error: null }>();
    signOutLocalMock.mockReturnValue(deferido.promise);

    const { unmount } = renderGuard();

    await act(async () => {
      vi.advanceTimersByTime(LOGOUT_AFTER_MS + 1000);
    });
    expect(signOutLocalMock).toHaveBeenCalledTimes(1);

    // Simula o AuthGate desmontando o guard (sessao virou null) antes
    // do signOut resolver - exatamente a corrida relatada no teste real.
    unmount();

    await act(async () => {
      deferido.resolve({ error: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    const unmountedWarnings = consoleErrorSpy.mock.calls.filter((args) =>
      String(args[0]).includes("unmounted component"),
    );
    expect(unmountedWarnings).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });

  it("duas guards do mesmo usuário (duas abas) expirando ao mesmo tempo: a segunda encontra sessão já removida, sem quebrar nenhuma das duas", async () => {
    // Comportamento real confirmado em node_modules/@supabase/auth-js:
    // signOut({scope:"local"}) quando a sessao ja foi removida (ex.: a
    // outra aba deslogou primeiro) NAO retorna erro - e' idempotente,
    // sempre resolve {error: null}. As duas instancias independentes
    // (uma por aba) devem terminar bloqueadas, nenhuma presa em estado
    // de falha.
    signOutLocalMock.mockResolvedValue({ error: null });

    const tabA = render(
      <InactivityGuard userId="user-1">
        <div>conteudo aba A</div>
      </InactivityGuard>,
    );
    const tabB = render(
      <InactivityGuard userId="user-1">
        <div>conteudo aba B</div>
      </InactivityGuard>,
    );

    await act(async () => {
      vi.advanceTimersByTime(LOGOUT_AFTER_MS + 1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(signOutLocalMock).toHaveBeenCalledTimes(2);
    expect(tabA.queryByText("conteudo aba A")).toBeNull();
    expect(tabB.queryByText("conteudo aba B")).toBeNull();
    expect(tabA.queryByText(/não foi possível encerrar a sessão/i)).toBeNull();
    expect(tabB.queryByText(/não foi possível encerrar a sessão/i)).toBeNull();

    tabA.unmount();
    tabB.unmount();
  });
});
