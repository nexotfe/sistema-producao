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
    <header className="rounded-lg border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
              LOGO
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
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
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 lg:w-[min(42vw,520px)]"
            />

            <span className="whitespace-nowrap text-sm font-medium text-slate-500">
              Nome do usuário
            </span>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Voltar
              </button>
              <Link
                href="/central"
                className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Início
              </Link>
            </div>
          </div>
        </div>
    </header>
  );
}
