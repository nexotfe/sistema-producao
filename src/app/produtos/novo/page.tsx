"use client";

import Link from "next/link";
import { ProductForm } from "@/modules/produtos/components/ProductForm";
import { ModuleBackTrigger } from "@/modules/shared/navigation/ModuleBackTrigger";

export default function NewProductPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Header titulo="Produto" subtitulo="Novo produto" />

        <ProductForm mode="new" />
      </div>
    </main>
  );
}

function Header({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <header className="rounded-lg border border-slate-200 bg-white px-5 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
            LOGO
          </div>

          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              {titulo}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{subtitulo}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <span className="whitespace-nowrap text-sm font-medium text-slate-500">
            Nome do usuário
          </span>

          <div className="flex flex-wrap gap-2">
            <ModuleBackTrigger
              fallbackHref="/produtos"
              className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Voltar
            </ModuleBackTrigger>
            <Link
              href="/central"
              className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Início
            </Link>
            <button
              type="button"
              className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
