"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function NewManufacturingRoutePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pn = searchParams.get("pn");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="bg-slate-50 px-4 pt-4 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                  LOGO
                </div>

                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                    Novo Roteiro de Fabricação
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {pn ? `PN ${pn}` : "Produto ainda não salvo"}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
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
                  <button
                    type="button"
                    className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
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
        <div className="rounded-md border border-slate-200 bg-white p-8 text-center">
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
