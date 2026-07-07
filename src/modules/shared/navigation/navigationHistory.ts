const STORAGE_KEY = "nexotfe:internal-navigation";

/**
 * document.referrer nao muda entre navegacoes client-side do Next.js (so
 * reflete a navegacao real do browser que carregou o documento pela
 * primeira vez), entao nao serve para detectar "o usuario navegou dentro
 * do app". Em vez disso, marcamos no sessionStorage sempre que o pathname
 * muda depois do primeiro carregamento (ver NavigationHistoryTracker).
 */
export function markInternalNavigation() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // sessionStorage indisponivel (ex: modo privado) - sem tracking, o
    // back navigation cai no fallback da rota mestre do modulo.
  }
}

export function hasInternalNavigationHistory(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
