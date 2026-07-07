"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { markInternalNavigation } from "@/modules/shared/navigation/navigationHistory";

/**
 * Monta uma unica vez no layout raiz. Observa toda troca de pathname da
 * aplicacao (inclusive em paginas que nao usam ModuleBackButton) e marca
 * no sessionStorage que houve pelo menos uma navegacao interna nesta aba -
 * o sinal que ModuleBackButton usa para decidir entre router.back() e a
 * rota mestre de fallback.
 */
export function NavigationHistoryTracker() {
  const pathname = usePathname();
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    if (
      previousPathname.current !== null &&
      previousPathname.current !== pathname
    ) {
      markInternalNavigation();
    }
    previousPathname.current = pathname;
  }, [pathname]);

  return null;
}
