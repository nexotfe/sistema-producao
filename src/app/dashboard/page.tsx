import Link from "next/link";
import { StatusBadge } from "../../modules/projetos/StatusBadge";
import type { ProjectStatus } from "../../modules/projetos/types";

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
    type: "Fabricação",
    status: "em_elaboracao" as ProjectStatus,
    target: "21/06",
  },
  {
    project: "260118",
    client: "Cliente Metal",
    type: "Fabricação",
    status: "aprovado" as ProjectStatus,
    target: "14/06",
  },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="grid gap-3 lg:grid-cols-[180px_460px_140px] lg:items-center">
            <p className="text-sm font-semibold">Flávio Evangelista</p>

            <label htmlFor="quick-search" className="sr-only">
              Buscar
            </label>
            <input
              id="quick-search"
              type="search"
              placeholder="Buscar projeto, cliente ou PN"
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />

            {/*<Link
              href="/projetos/novo"
              className="inline-flex h-10 items-center justify-center rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              Novo Projeto
            </Link>
            */}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold">Comercial</h1>

            <nav aria-label="Atalhos comerciais" className="flex flex-wrap gap-2">
              <Link
                href="/projetos/novo"
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
              >
                + Projeto
              </Link>
              <Link
                href="/roteiros/1243-01"
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Roteiro Fabricação
              </Link>
              <Link
                href="/estoque/materias-primas"
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Estoque
              </Link>
              <Link
                href="/compras"
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Compras
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <section>
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-950">Projetos</h2>
              <p className="mt-1 text-sm text-slate-500">
                Orçamentos e demandas industriais em andamento.
              </p>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th className="px-6 py-3">Projeto</th>
                    <th className="px-6 py-3">Cliente</th>
                    <th className="px-6 py-3">Tipo</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Objetivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projectRows.map((row) => (
                    <tr key={row.project} className="transition hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <Link
                          href={`/projetos/${row.project}`}
                          className="font-semibold text-blue-700 transition hover:text-blue-800 hover:underline"
                        >
                          {row.project}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-700">{row.client}</td>
                      <td className="px-6 py-4 text-slate-700">{row.type}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-6 py-4 text-slate-700">{row.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-6 md:hidden">
              {projectRows.map((row) => (
                <div
                  key={row.project}
                  className="rounded-lg border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Link
                          href={`/projetos/${row.project}`}
                          className="font-semibold text-blue-700 transition hover:text-blue-800 hover:underline"
                        >
                          {row.project}
                        </Link>
                        <p className="mt-1 text-sm text-slate-600">{row.client}</p>
                      </div>
                      <StatusBadge status={row.status} />
                    </div>
                    <div className="flex flex-col gap-1 text-sm text-slate-600">
                      <div>
                        <span className="font-medium text-slate-700">Tipo:</span> {row.type}
                      </div>
                      <div>
                        <span className="font-medium text-slate-700">Objetivo:</span> {row.target}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
