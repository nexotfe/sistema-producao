import { THEME_COOKIE_NAME } from "./theme";

/**
 * Script de inicializacao do tema (Opcao B, PAD-006 secao 4/4.1).
 * Executa antes da renderizacao visual, direto no <head>, sem
 * depender de cookies()/headers() no servidor - o layout raiz
 * permanece estatico. So aplica data-theme quando ha escolha
 * explicita salva; ausencia de cookie (modo "system") fica a cargo da
 * camada @media (prefers-color-scheme) ja definida em globals.css.
 */
export const themeInitScript = `(function() {
  try {
    var match = document.cookie.match(/(?:^|; )${THEME_COOKIE_NAME}=([^;]*)/);
    var value = match ? decodeURIComponent(match[1]) : null;
    if (value === "light" || value === "dark") {
      document.documentElement.setAttribute("data-theme", value);
    }
  } catch (e) {}
})();`;
