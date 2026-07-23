"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE_NAME, type ThemePreference } from "./theme";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/**
 * Mecanismo de troca de tema (PAD-006 secao 4/5). Sem UI consumidora
 * ainda - o Theme Toggle real e escopo da Fase 3 (ModuleHeader).
 */
export async function setThemeCookie(preference: ThemePreference) {
  const cookieStore = await cookies();

  if (preference === "system") {
    cookieStore.delete(THEME_COOKIE_NAME);
    return;
  }

  cookieStore.set(THEME_COOKIE_NAME, preference, {
    path: "/",
    maxAge: ONE_YEAR_IN_SECONDS,
    sameSite: "lax",
  });
}
