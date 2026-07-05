"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NovoItemProjetoPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-lg border border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                LOGO
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                Novo Item do Projeto
              </h1>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label htmlFor="busca-novo-item-projeto" className="sr-only">
                Buscar item do projeto
              </label>
              <input
                id="busca-novo-item-projeto"
                type="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Buscar projeto, cliente, código, item, OF, NF ou documento..."
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

        <section className="mx-auto w-full max-w-3xl rounded-lg border border-slate-200 bg-white px-5 py-5">
          <h2 className="text-sm font-bold text-slate-950">
            Novo Item do Projeto
          </h2>
          <p className="mt-4 text-sm text-slate-600">
            Esta página será implementada na próxima Sprint.
          </p>
        </section>
      </div>
    </main>
  );
}
