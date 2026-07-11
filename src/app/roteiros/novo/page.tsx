"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function NewManufacturingRoutePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pn = searchParams.get("pn");

  return (
    <main className="min-h-screen bg-app-bg text-slate-950">
      <header className="bg-app-bg px-4 pt-4 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-t-lg border-x border-t border-slate-200 bg-[#0B1B2B] px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/5 text-xs font-bold text-slate-300">
                  LOGO
                </div>

                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                    Novo Roteiro de Fabricação
                  </h1>
                  <p className="mt-1 text-sm text-slate-300">
                    {pn ? `PN ${pn}` : "Produto ainda não salvo"}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
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
                  <button
                    type="button"
                    className="h-10 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="rounded-md border border-slate-200 bg-app-card p-8 text-center">
          <p className="text-sm text-slate-500">
            Estrutura do roteiro (operações, materiais e tecnologias) será
            criada aqui. Página mock apenas para validar a navegação a
            partir do cadastro de produto.
          </p>
        </div>
      </section>
    </main>
  );
}
