"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type ProductsHeaderProps = {
  search: string;
  setSearch: (value: string) => void;
};

export function ProductsHeader({ search, setSearch }: ProductsHeaderProps) {
  const router = useRouter();

  return (
    <header className="rounded-t-lg border-x border-t border-slate-200 bg-[#0B1B2B] px-5 py-4 -mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/5 text-xs font-bold text-slate-300">
              LOGO
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
              Produtos
            </h1>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label htmlFor="busca-produtos" className="sr-only">
              Buscar produtos
            </label>
            <input
              id="busca-produtos"
              type="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar produto, código, descrição, desenho, cliente ou documento..."
              className="h-10 w-full rounded-md border border-white/[0.15] bg-white/[0.08] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/40 lg:w-[min(42vw,520px)]"
            />

            <span className="whitespace-nowrap text-sm font-medium text-slate-300">
              Nome do usuário
            </span>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="h-10 rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
              >
                Voltar
              </button>
              <Link
                href="/central"
                className="inline-flex h-10 items-center rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
              >
                Início
              </Link>
            </div>
          </div>
        </div>
    </header>
  );
}
