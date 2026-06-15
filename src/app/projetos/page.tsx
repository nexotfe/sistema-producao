import Link from "next/link";

import { StatusBadge } from "@/modules/projetos/StatusBadge";
import type { ProjectStatus } from "@/modules/projetos/types";

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
  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Comercial
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Projetos
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Orcamentos e demandas industriais em andamento.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <label htmlFor="project-search" className="sr-only">
              Buscar projetos
            </label>
            <input
              id="project-search"
              type="search"
              placeholder="Buscar projeto, cliente ou PN"
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />

            <nav aria-label="Atalhos comerciais" className="flex flex-wrap gap-2">
              <Link
                href="/projetos"
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
              >
                Projetos
              </Link>
              <Link
                href="/clientes"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Clientes
              </Link>
              <Link
                href="/central"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Central
              </Link>
              <Link
                href="/compras"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Compras
              </Link>
              <Link
                href="/estoque/materias-primas"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Estoque
              </Link>
            </nav>
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
                      <Link
                        href={`/projetos/${row.project}`}
                        className="font-semibold text-slate-950 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                      >
                        {row.project}
                      </Link>
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
