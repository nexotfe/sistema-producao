"use client";

import type { DragEvent } from "react";
import Link from "next/link";
import { useState } from "react";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { ModuleBackButton } from "@/modules/shared/navigation/ModuleBackButton";

type PlanningRow = {
  priority: string;
  project: string;
  client: string;
  situation: "Em andamento" | "Parado";
  operationalState: {
    total: number;
    released: number;
    blocked: number;
    waitingMaterial: number;
    programming: number;
  };
  nextAction: string;
  progress: string;
  delivery: string;
};

type QueueHistoryEntry = {
  user: string;
  date: string;
  project: string;
  previousPriority: string;
  newPriority: string;
  reason: string;
};

const currentUser = "Flavio Evangelista";

const initialPlanningRows: PlanningRow[] = [
  {
    priority: "01",
    project: "260124",
    client: "Cliente Delta",
    situation: "Parado",
    operationalState: {
      total: 100,
      released: 55,
      blocked: 45,
      waitingMaterial: 30,
      programming: 15,
    },
    nextAction: "Comprar material",
    progress: "0%",
    delivery: "26/06",
  },
  {
    priority: "02",
    project: "260125",
    client: "Cliente ABC",
    situation: "Em andamento",
    operationalState: {
      total: 80,
      released: 48,
      blocked: 32,
      waitingMaterial: 18,
      programming: 14,
    },
    nextAction: "Programar CNC",
    progress: "25%",
    delivery: "28/06",
  },
  {
    priority: "03",
    project: "260126",
    client: "Cliente Metal",
    situation: "Em andamento",
    operationalState: {
      total: 64,
      released: 52,
      blocked: 12,
      waitingMaterial: 8,
      programming: 4,
    },
    nextAction: "Produzir",
    progress: "50%",
    delivery: "02/07",
  },
  {
    priority: "04",
    project: "260127",
    client: "Cliente Exemplo Ltda.",
    situation: "Em andamento",
    operationalState: {
      total: 42,
      released: 37,
      blocked: 5,
      waitingMaterial: 2,
      programming: 3,
    },
    nextAction: "Montar",
    progress: "85%",
    delivery: "04/07",
  },
  {
    priority: "05",
    project: "260128",
    client: "Cliente Precisao",
    situation: "Parado",
    operationalState: {
      total: 36,
      released: 36,
      blocked: 0,
      waitingMaterial: 0,
      programming: 0,
    },
    nextAction: "Terceirizar",
    progress: "100%",
    delivery: "08/07",
  },
];

const situationStyles = {
  "Em andamento": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Parado: "bg-rose-50 text-rose-700 ring-rose-200",
} as const;

export default function PCPPlanningPage() {
  const [planningRows, setPlanningRows] = useState(initialPlanningRows);
  const [draggedProject, setDraggedProject] = useState<string | null>(null);
  const [, setQueueHistory] = useState<QueueHistoryEntry[]>([]);

  function normalizePriorities(rows: PlanningRow[]) {
    return rows.map((row, index) => ({
      ...row,
      priority: String(index + 1).padStart(2, "0"),
    }));
  }

  function handleDragStart(project: string) {
    setDraggedProject(project);
  }

  function handleDrop(targetProject: string) {
    if (!draggedProject || draggedProject === targetProject) {
      setDraggedProject(null);
      return;
    }

    setPlanningRows((currentRows) => {
      const draggedIndex = currentRows.findIndex(
        (row) => row.project === draggedProject,
      );
      const targetIndex = currentRows.findIndex(
        (row) => row.project === targetProject,
      );

      if (draggedIndex < 0 || targetIndex < 0) {
        return currentRows;
      }

      const nextRows = [...currentRows];
      const [draggedRow] = nextRows.splice(draggedIndex, 1);
      nextRows.splice(targetIndex, 0, draggedRow);

      const normalizedRows = normalizePriorities(nextRows);
      const movedRow = normalizedRows.find(
        (row) => row.project === draggedProject,
      );

      if (movedRow) {
        setQueueHistory((history) => [
          ...history,
          {
            user: currentUser,
            date: new Date().toISOString(),
            project: movedRow.project,
            previousPriority: draggedRow.priority,
            newPriority: movedRow.priority,
            reason: "Reorganizacao manual da fila",
          },
        ]);
      }

      return normalizedRows;
    });

    setDraggedProject(null);
  }

  function allowDrop(event: DragEvent<HTMLTableRowElement>) {
    event.preventDefault();
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <ModuleBackButton label="PCP" />
            <p className="text-sm font-semibold">{currentUser}</p>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                PCP
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Planejamento PCP
              </h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(240px,360px)_auto_auto] sm:items-center">
              <label htmlFor="pcp-search" className="sr-only">
                Buscar planejamento
              </label>
              <input
                id="pcp-search"
                type="search"
                placeholder="Buscar projeto, cliente ou estado operacional"
                className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />

              <button className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Atualizar
              </button>

              <button className="h-11 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800">
                Filtros
              </button>
            </div>
          </div>

          <nav aria-label="Navegacao PCP" className="flex flex-wrap gap-2">
            <Link
              href="/pcp/planejamento"
              className="rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white"
            >
              Planejamento PCP
            </Link>
            <Link
              href="/pcp/programacao-diaria"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
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
        </header>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-950">
              Sequenciamento operacional
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Visao inicial das frentes de fabrica para planejamento.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-5 py-3">Prioridade</th>
                  <th className="px-5 py-3">Projeto</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Situacao</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Proxima acao</th>
                  <th className="px-5 py-3">Avanco</th>
                  <th className="px-5 py-3">Entrega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {planningRows.map((row) => (
                  <tr
                    key={row.project}
                    onDragOver={allowDrop}
                    onDrop={() => handleDrop(row.project)}
                    className={`transition hover:bg-slate-50 ${
                      draggedProject === row.project ? "bg-slate-100" : ""
                    }`}
                  >
                    <td className="px-5 py-4">
                      <span
                        draggable
                        onDragStart={() => handleDragStart(row.project)}
                        onDragEnd={() => setDraggedProject(null)}
                        className="inline-flex h-7 w-10 cursor-grab items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold tabular-nums text-slate-700 active:cursor-grabbing"
                      >
                        {row.priority}
                      </span>
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
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                          situationStyles[row.situation]
                        }`}
                      >
                        {row.situation}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="group relative inline-flex">
                        <span
                          aria-label={`${row.operationalState.released} OFs liberadas e ${row.operationalState.blocked} OFs nao liberadas`}
                          className="inline-flex h-7 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold tabular-nums text-slate-700"
                        >
                          <span>{row.operationalState.released}✓</span>
                          <span>{row.operationalState.blocked}⚠</span>
                        </span>

                        <span className="pointer-events-none absolute left-0 top-9 z-10 hidden w-48 rounded-md border border-slate-200 bg-white p-3 text-xs font-medium leading-5 text-slate-700 shadow-lg group-hover:block">
                          <span className="flex justify-between gap-3">
                            <span>OF totais</span>
                            <span>{row.operationalState.total}</span>
                          </span>
                          <span className="flex justify-between gap-3 text-emerald-700">
                            <span>✓ Liberadas</span>
                            <span>{row.operationalState.released}</span>
                          </span>
                          <span className="flex justify-between gap-3 text-amber-700">
                            <span>📦 Aguardando MP</span>
                            <span>{row.operationalState.waitingMaterial}</span>
                          </span>
                          <span className="flex justify-between gap-3 text-blue-700">
                            <span>💻 Programacao</span>
                            <span>{row.operationalState.programming}</span>
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-700">{row.nextAction}</td>
                    <td className="px-5 py-4 font-semibold tabular-nums text-slate-900">
                      {row.progress}
                    </td>
                    <td className="px-5 py-4 text-slate-700">{row.delivery}</td>
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
