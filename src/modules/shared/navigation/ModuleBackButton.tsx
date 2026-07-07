"use client";

import { useModuleBack } from "@/modules/shared/navigation/useModuleBack";

type ModuleBackButtonProps = {
  label?: string;
  fallbackHref?: string;
  className?: string;
};

export const moduleBackButtonClassName =
  "inline-flex w-fit items-center gap-1 rounded-sm text-sm font-semibold uppercase text-slate-500 outline-none transition hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2";

export function ModuleBackButton({
  label = "Voltar",
  fallbackHref = "/dashboard",
  className,
}: ModuleBackButtonProps) {
  const handleBack = useModuleBack(fallbackHref);

  return (
    <button
      type="button"
      onClick={handleBack}
      className={[moduleBackButtonClassName, className]
        .filter(Boolean)
        .join(" ")}
    >
      <span aria-hidden="true" className="text-sm font-semibold leading-none">
        {"‹"}
      </span>
      <span className="leading-none">{label}</span>
    </button>
  );
}
