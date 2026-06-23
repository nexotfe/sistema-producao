"use client";

import { useRouter } from "next/navigation";

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
  const router = useRouter();

  function handleBack() {
    const hasSameOriginReferrer =
      typeof window !== "undefined" &&
      document.referrer.length > 0 &&
      new URL(document.referrer).origin === window.location.origin;

    if (hasSameOriginReferrer && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={[moduleBackButtonClassName, className]
        .filter(Boolean)
        .join(" ")}
    >
      <span aria-hidden="true" className="text-sm font-semibold leading-none">
        {"\u2039"}
      </span>
      <span className="leading-none">{label}</span>
    </button>
  );
}
