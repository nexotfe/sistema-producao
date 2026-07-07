"use client";

import type { ReactNode } from "react";
import { useModuleBack } from "@/modules/shared/navigation/useModuleBack";

type ModuleBackTriggerProps = {
  fallbackHref: string;
  className?: string;
  children: ReactNode;
};

/**
 * Mesma regra de "Voltar" do ModuleBackButton, mas sem estilo proprio -
 * para paginas que ja tem seu botao "Voltar" com visual especifico e so
 * precisam trocar a navegacao fixa por router.back() com fallback.
 */
export function ModuleBackTrigger({
  fallbackHref,
  className,
  children,
}: ModuleBackTriggerProps) {
  const handleBack = useModuleBack(fallbackHref);

  return (
    <button type="button" onClick={handleBack} className={className}>
      {children}
    </button>
  );
}
