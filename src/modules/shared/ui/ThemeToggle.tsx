"use client";

import { useSyncExternalStore, useTransition } from "react";
import { setThemeCookie } from "@/modules/shared/theme/setThemeCookie";
import {
  THEME_COOKIE_NAME,
  type ThemeChoice,
  type ThemePreference,
} from "@/modules/shared/theme/theme";

function readCookiePreference(): ThemePreference {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${THEME_COOKIE_NAME}=([^;]*)`),
  );
  const value = match ? decodeURIComponent(match[1]) : null;

  return value === "light" || value === "dark" ? value : "system";
}

function readSystemPreference(): ThemeChoice {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(preference: ThemePreference): ThemeChoice {
  return preference === "system" ? readSystemPreference() : preference;
}

function applyDataTheme(choice: ThemeChoice) {
  document.documentElement.setAttribute("data-theme", choice);
}

// Store externo (padrao useSyncExternalStore, sem useEffect/setState -
// mesma decisao ja validada). Combina a preferencia persistida (cookie)
// com a preferencia do SO quando em modo "system", e reage a mudancas
// de qualquer uma das duas fontes em tempo real.
let cachedPreference: ThemePreference | null = null;
const listeners = new Set<() => void>();
let mediaQueryBound = false;

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function getSnapshot(): ThemeChoice {
  if (cachedPreference === null) {
    cachedPreference = readCookiePreference();
  }
  return resolveTheme(cachedPreference);
}

function getServerSnapshot(): ThemeChoice {
  return "light";
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);

  if (!mediaQueryBound) {
    mediaQueryBound = true;
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", notifyListeners);
  }

  return () => listeners.delete(onStoreChange);
}

function setStorePreference(next: ThemeChoice) {
  cachedPreference = next;
  notifyListeners();
}

/**
 * Botao unico de alternancia Claro/Escuro (icone sol/lua). O modo
 * "Sistema" continua suportado pela infraestrutura (PAD-006 - ausencia
 * de cookie segue o SO), mas deixou de ser alcancavel por este
 * controle: um clique so alterna entre claro e escuro.
 *
 * Uma vez que o usuario clica no ThemeToggle do cabecalho, o modo
 * Sistema deixa de ser aplicado para essa sessao/dispositivo (o cookie
 * explicito passa a ter prioridade). Nao ha, ainda, forma de o usuario
 * voltar para "Seguir sistema" pela interface - essa opcao so existira
 * quando a tela de Configuracoes for implementada. Ate la, isso e uma
 * limitacao temporaria conhecida, nao um defeito.
 */
export function ThemeToggle() {
  const resolved = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [, startTransition] = useTransition();

  function handleToggle() {
    const next: ThemeChoice = resolved === "dark" ? "light" : "dark";
    applyDataTheme(next);
    setStorePreference(next);
    startTransition(() => {
      setThemeCookie(next);
    });
  }

  const label =
    resolved === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro";

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-border bg-surface text-text-secondary transition hover:bg-border-subtle focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus-ring"
    >
      {resolved === "dark" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}
