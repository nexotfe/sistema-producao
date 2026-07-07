"use client";

import { useRouter } from "next/navigation";
import { hasInternalNavigationHistory } from "@/modules/shared/navigation/navigationHistory";

/**
 * Decisao central de "Voltar": usa o historico real do navegador
 * (router.back()) quando o usuario chegou aqui navegando dentro do
 * proprio app nesta aba (ex: Orcamento -> clicou no codigo do produto);
 * cai na rota mestre do modulo (fallbackHref) quando o acesso foi direto
 * (URL digitada, aba nova, refresh) e nao ha para onde voltar dentro do
 * app.
 */
export function useModuleBack(fallbackHref: string) {
  const router = useRouter();

  return function handleBack() {
    const canGoBack =
      typeof window !== "undefined" &&
      hasInternalNavigationHistory() &&
      window.history.length > 1;

    if (canGoBack) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  };
}
