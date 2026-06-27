"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function ProductNavigation() {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Voltar
      </button>

      <Link
        href="/central"
        className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Inicio
      </Link>
    </div>
  );
}
