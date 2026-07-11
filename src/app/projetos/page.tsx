"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { StatusBadge } from "@/modules/projetos/StatusBadge";
import { PROJECT_TYPE_LABELS } from "@/modules/projetos/constants";
import { useProjetosLista } from "@/modules/projetos/hooks/useProjetosLista";

function formatarData(iso: string | null) {
  if (!iso) {
    return "—";
  }

  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function ProjectsPage() {
  const router = useRouter();
  const { projetos, busca, setBusca, loading } = useProjetosLista();

  return (
    <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-t-lg border-x border-t border-slate-200 bg-[#0B1B2B] px-5 py-4 -mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/5 text-xs font-bold text-slate-300">
                LOGO
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                Projeto
              </h1>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label htmlFor="project-search" className="sr-only">
                Buscar projetos
              </label>
              <input
                id="project-search"
                type="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar projeto por número, descrição ou cliente..."
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

        <section className="rounded-lg border border-slate-200 bg-app-card">
          <div className="border-b border-slate-100 px-5 py-4">
            <Link
              href="/projeto"
              className="inline-flex items-center text-base font-semibold text-slate-950 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
            >
              Cadastro de Projetos
              <span
                aria-hidden="true"
                className="ml-2 text-base font-semibold leading-none text-slate-500"
              >
                {"›"}
              </span>
            </Link>
            <p className="mt-2 text-sm text-slate-500">
              Consulte os projetos comerciais e acompanhe o status operacional.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-5 py-3">Projeto</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Objetivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td className="px-5 py-4 text-slate-500" colSpan={5}>
                      Carregando...
                    </td>
                  </tr>
                ) : projetos.length === 0 ? (
                  <tr>
                    <td className="px-5 py-4 text-slate-500" colSpan={5}>
                      Nenhum projeto encontrado.
                    </td>
                  </tr>
                ) : (
                  projetos.map((projeto) => (
                    <tr
                      key={projeto.id}
                      className="transition hover:bg-slate-50"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/projeto?id=${projeto.id}`}
                          className="font-semibold text-slate-950 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                        >
                          {projeto.numeroProjeto}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {projeto.clienteNome ?? "—"}
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {PROJECT_TYPE_LABELS[projeto.tipoProjeto]}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={projeto.status} />
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {formatarData(projeto.dataObjetivo)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
