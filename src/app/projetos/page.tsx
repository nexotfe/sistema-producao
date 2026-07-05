"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { StatusBadge } from "@/modules/projetos/StatusBadge";
import type { ProjectStatus } from "@/modules/projetos/types";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";

const projectRows = [
  {
    project: "260123",
    client: "Cliente ABC",
    type: "Desenvolvimento",
    status: "em_analise" as ProjectStatus,
    target: "18/06",
  },
  {
    project: "260124",
    client: "Cliente Delta",
    type: "Fabricacao",
    status: "em_elaboracao" as ProjectStatus,
    target: "21/06",
  },
  {
    project: "260118",
    client: "Cliente Metal",
    type: "Fabricacao",
    status: "aprovado" as ProjectStatus,
    target: "14/06",
  },
];

export default function ProjectsPage() {
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
                placeholder="Buscar projeto, cliente ou PN"
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

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <Link
              href="/projetos/novo"
              className="inline-flex items-center text-base font-semibold text-slate-950 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
            >
              Cadastro de Projetos
              <span
                aria-hidden="true"
                className="ml-2 text-base font-semibold leading-none text-slate-500"
              >
                {"\u203A"}
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
                {projectRows.map((row) => (
                  <tr key={row.project} className="transition hover:bg-slate-50">
                    <td className="px-5 py-4">
                      {row.project === "260123" ? (
                        <span className="font-semibold text-slate-950">
                          {row.project}
                        </span>
                      ) : (
                        <EntityLink
                          type="projeto"
                          id={row.project}
                          className="font-semibold text-slate-950 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                        >
                          {row.project}
                        </EntityLink>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-700">{row.client}</td>
                    <td className="px-5 py-4 text-slate-700">{row.type}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-4 text-slate-700">{row.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
