"use client";

import Link from "next/link";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { ModuleBackButton } from "@/modules/shared/navigation/ModuleBackButton";

type DailyScheduleRow = {
  resource: string;
  of: string;
  project: string;
  client: string;
  pn: string;
  estimatedTime: string;
  priority: string;
  situation: "Programada" | "Em execucao" | "Concluida" | "Parada";
};

const currentUser = "Flavio Evangelista";

const scheduleRows: DailyScheduleRow[] = [
  {
    resource: "Torno CNC 01",
    of: "260124-0010",
    project: "260124",
    client: "Delta",
    pn: "PN-000145",
    estimatedTime: "1,5h",
    priority: "01",
    situation: "Programada",
  },
  {
    resource: "Torno CNC 01",
    of: "260124-0015",
    project: "260124",
    client: "Delta",
    pn: "PN-000218",
    estimatedTime: "3,0h",
    priority: "01",
    situation: "Em execucao",
  },
  {
    resource: "Centro Usinagem 01",
    of: "260126-0001",
    project: "260126",
    client: "Metal",
    pn: "PN-000301",
    estimatedTime: "8,0h",
    priority: "03",
    situation: "Programada",
  },
  {
    resource: "Centro Usinagem 01",
    of: "260126-0002",
    project: "260126",
    client: "Metal",
    pn: "PN-000302",
    estimatedTime: "12,0h",
    priority: "03",
    situation: "Parada",
  },
  {
    resource: "Caldeiraria",
    of: "260127-0002",
    project: "260127",
    client: "Exemplo",
    pn: "PN-000412",
    estimatedTime: "8,0h",
    priority: "04",
    situation: "Programada",
  },
  {
    resource: "Montagem",
    of: "260128-0001",
    project: "260128",
    client: "Precisao",
    pn: "PN-000519",
    estimatedTime: "3,0h",
    priority: "05",
    situation: "Concluida",
  },
];

const situationStyles = {
  Programada: "bg-blue-50 text-blue-700 ring-blue-200",
  "Em execucao": "bg-amber-50 text-amber-700 ring-amber-200",
  Concluida: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Parada: "bg-rose-50 text-rose-700 ring-rose-200",
} as const;

const groupedSchedule = scheduleRows.reduce<Record<string, DailyScheduleRow[]>>(
  (groups, row) => {
    groups[row.resource] = [...(groups[row.resource] ?? []), row];
    return groups;
  },
  {},
);

export default function DailySchedulePage() {
  function handlePrint() {
    window.print();
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 print:bg-white sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-5 print:hidden">
          <div className="flex items-center gap-3">
            <ModuleBackButton label="PCP" />
            <p className="text-sm font-semibold">{currentUser}</p>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                PCP
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Programacao Diaria
              </h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(220px,320px)_auto_auto_auto_auto_auto] sm:items-center">
              <label htmlFor="daily-search" className="sr-only">
                Buscar programacao diaria
              </label>
              <input
                id="daily-search"
                type="search"
                placeholder="Buscar recurso, OF, projeto ou PN"
                className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <button className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Atualizar
              </button>
              <button className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Filtros
              </button>
              <button
                onClick={handlePrint}
                className="h-11 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
              >
                Imprimir
              </button>
              <button className="h-11 rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">
                Exportar PDF
              </button>
              <button className="h-11 rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">
                Exportar Excel
              </button>
            </div>
          </div>

          <nav aria-label="Navegacao PCP" className="flex flex-wrap gap-2">
            <Link
              href="/pcp/planejamento"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Planejamento PCP
            </Link>
            <Link
              href="/pcp/programacao-diaria"
              className="rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white"
            >
              Programacao diaria
            </Link>
            {["Capacidade", "Carga Maquina", "Sequenciamento"].map((item) => (
              <span
                key={item}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400"
              >
                {item}
              </span>
            ))}
          </nav>

          <section className="grid gap-3 lg:grid-cols-5">
            {["Data", "Turno", "Supervisor", "Centro de Trabalho", "Situacao"].map(
              (filter) => (
                <label key={filter} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {filter}
                  </span>
                  <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200">
                    <option>Todos</option>
                  </select>
                </label>
              ),
            )}
          </section>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white print:border-slate-300">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 print:block">
              PCP
            </p>
            <h2 className="text-base font-semibold text-slate-950">
              Programacao diaria por recurso
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Planejamento micro da fabrica para execucao dos lideres.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm print:min-w-0">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-5 py-3">Recurso</th>
                  <th className="px-5 py-3">OF</th>
                  <th className="px-5 py-3">Projeto</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">PN</th>
                  <th className="px-5 py-3">Tempo Previsto</th>
                  <th className="px-5 py-3">Prioridade</th>
                  <th className="px-5 py-3">Situacao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(groupedSchedule).map(([resource, rows]) =>
                  rows.map((row, index) => (
                    <tr key={`${row.resource}-${row.of}`} className="transition hover:bg-slate-50">
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {index === 0 ? resource : ""}
                      </td>
                      <td className="px-5 py-4">
                        <EntityLink
                          type="of"
                          id={row.of}
                          className="font-semibold text-slate-950 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                        >
                          {row.of}
                        </EntityLink>
                      </td>
                      <td className="px-5 py-4">
                        <EntityLink
                          type="projeto"
                          id={row.project}
                          className="font-semibold text-slate-950 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                        >
                          {row.project}
                        </EntityLink>
                      </td>
                      <td className="px-5 py-4 text-slate-700">{row.client}</td>
                      <td className="px-5 py-4">
                        <EntityLink
                          type="item"
                          id={row.pn}
                          className="font-semibold text-slate-950 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                        >
                          {row.pn}
                        </EntityLink>
                      </td>
                      <td className="px-5 py-4 tabular-nums text-slate-700">
                        {row.estimatedTime}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex h-7 w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold tabular-nums text-slate-700">
                          {row.priority}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                            situationStyles[row.situation]
                          }`}
                        >
                          {row.situation}
                        </span>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
