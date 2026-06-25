"use client";

import type { DragEvent } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { ModuleBackButton } from "@/modules/shared/navigation/ModuleBackButton";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

type PlanningRow = {
  projectId: string;
  priority: string;
  project: string;
  client: string;
  status: string;
  situation: "Em andamento" | "Parado" | "Concluído";
  operationalState: {
    total: number;
    ready: number;
    blocked: number;
    waitingMaterial: number;
    inProduction: number;
    programming: number;
    finished: number;
    hasOrders: boolean;
  };
  nextAction: string;
  progress: string;
  delivery: string;
};

type PlanningSituation = PlanningRow["situation"];

type ProjectRow = {
  id: string;
  cliente_id: string | null;
  numero_projeto: string;
  status: string | null;
  prioridade: string | null;
  data_objetivo: string | null;
  created_at: string | null;
};

type ClientRow = {
  id: string;
  nome: string;
};

type OFRow = {
  id: string;
  projeto_id: string;
  status: string | null;
};

type ProductionOperationRow = {
  id: string;
  of_id: string;
};

type OutsourcedServiceRow = {
  id: string;
  operacao_producao_id: string;
  status: string | null;
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
    projectId: "260124",
    priority: "01",
    project: "260124",
    client: "Cliente Delta",
    status: "Em planejamento",
    situation: "Parado",
    operationalState: {
      total: 100,
      ready: 55,
      blocked: 45,
      waitingMaterial: 30,
      inProduction: 10,
      programming: 15,
      finished: 0,
      hasOrders: true,
    },
    nextAction: "Comprar material",
    progress: "0%",
    delivery: "26/06",
  },
  {
    projectId: "260125",
    priority: "02",
    project: "260125",
    client: "Cliente ABC",
    status: "Em planejamento",
    situation: "Em andamento",
    operationalState: {
      total: 80,
      ready: 48,
      blocked: 32,
      waitingMaterial: 18,
      inProduction: 10,
      programming: 14,
      finished: 0,
      hasOrders: true,
    },
    nextAction: "Programar CNC",
    progress: "25%",
    delivery: "28/06",
  },
  {
    projectId: "260126",
    priority: "03",
    project: "260126",
    client: "Cliente Metal",
    status: "Em planejamento",
    situation: "Em andamento",
    operationalState: {
      total: 64,
      ready: 52,
      blocked: 12,
      waitingMaterial: 8,
      inProduction: 8,
      programming: 4,
      finished: 0,
      hasOrders: true,
    },
    nextAction: "Produzir",
    progress: "50%",
    delivery: "02/07",
  },
  {
    projectId: "260127",
    priority: "04",
    project: "260127",
    client: "Cliente Exemplo Ltda.",
    status: "Em planejamento",
    situation: "Em andamento",
    operationalState: {
      total: 42,
      ready: 37,
      blocked: 5,
      waitingMaterial: 2,
      inProduction: 4,
      programming: 3,
      finished: 0,
      hasOrders: true,
    },
    nextAction: "Montar",
    progress: "85%",
    delivery: "04/07",
  },
  {
    projectId: "260128",
    priority: "05",
    project: "260128",
    client: "Cliente Precisao",
    status: "Em planejamento",
    situation: "Parado",
    operationalState: {
      total: 36,
      ready: 36,
      blocked: 0,
      waitingMaterial: 0,
      inProduction: 0,
      programming: 0,
      finished: 36,
      hasOrders: true,
    },
    nextAction: "Terceirizar",
    progress: "100%",
    delivery: "08/07",
  },
];

const situationStyles = {
  "Em andamento": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Parado: "bg-rose-50 text-rose-700 ring-rose-200",
  Concluído: "bg-blue-50 text-blue-700 ring-blue-200",
} as const;

const operationalTemplates = initialPlanningRows.map((row) => ({
  situation: row.situation,
  operationalState: row.operationalState,
  nextAction: row.nextAction,
  progress: row.progress,
}));

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatStatus(value: string | null | undefined) {
  if (!value) return "Sem status";
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sortProjectsByPriority(projects: ProjectRow[]) {
  const priorityWeight: Record<string, number> = {
    critica: 0,
    alta: 1,
    normal: 2,
    baixa: 3,
  };

  return [...projects].sort((first, second) => {
    const firstPriority = priorityWeight[first.prioridade ?? "normal"] ?? 2;
    const secondPriority = priorityWeight[second.prioridade ?? "normal"] ?? 2;

    if (firstPriority !== secondPriority) return firstPriority - secondPriority;

    const firstDate = first.data_objetivo ? new Date(first.data_objetivo).getTime() : Infinity;
    const secondDate = second.data_objetivo ? new Date(second.data_objetivo).getTime() : Infinity;

    if (firstDate !== secondDate) return firstDate - secondDate;

    return first.numero_projeto.localeCompare(second.numero_projeto);
  });
}

function calculateOperationalState(project: ProjectRow, projectOrders: OFRow[]) {
  const total = projectOrders.length;
  const finished = projectOrders.filter((order) => order.status === "finalizada").length;
  const inProduction = projectOrders.filter((order) => order.status === "em_producao").length;
  const waitingMaterial = projectOrders.filter((order) => order.status === "aguardando_material").length;
  const programming = projectOrders.filter((order) =>
    ["simulacao", "pronta_programacao", "programada"].includes(order.status ?? ""),
  ).length;
  const ready = projectOrders.filter((order) =>
    ["pronta_programacao", "programada", "em_producao"].includes(order.status ?? ""),
  ).length;
  const blocked = Math.max(total - ready, 0);
  const situation: PlanningSituation =
    total > 0 && finished === total
      ? "Concluído"
      : project.status === "concluido"
        ? "Concluído"
        : inProduction > 0 || projectOrders.some((order) => order.status === "programada")
          ? "Em andamento"
          : "Parado";

  return {
    situation,
    operationalState: {
      total,
      ready,
      blocked,
      waitingMaterial,
      inProduction,
      programming,
      finished,
      hasOrders: total > 0,
    },
  };
}

function getNextAction(project: ProjectRow, projectOrders: OFRow[], outsourcedServices: OutsourcedServiceRow[]) {
  if (project.status === "cancelado") return "Cancelado";
  if (project.status === "concluido") return "Concluído";
  if (projectOrders.length === 0) return "Sem OF's";
  if (projectOrders.every((order) => order.status === "finalizada")) return "Concluído";
  if (projectOrders.some((order) => order.status === "aguardando_material")) {
    return "Comprar material";
  }
  if (projectOrders.some((order) => order.status === "pronta_programacao")) {
    return "Programar CNC";
  }
  if (projectOrders.some((order) => order.status === "simulacao")) {
    return "Liberar engenharia";
  }
  if (projectOrders.some((order) => order.status === "programada")) {
    return "Produzir";
  }
  if (projectOrders.some((order) => order.status === "em_producao")) {
    return "Montar";
  }
  if (
    outsourcedServices.some((service) =>
      ["planejado", "enviado", "em_execucao"].includes(service.status ?? ""),
    )
  ) {
    return "Terceirizar";
  }

  return "Programar CNC";
}

function buildPlanningRows(
  projects: ProjectRow[],
  clients: ClientRow[],
  orders: OFRow[],
  outsourcedServices: OutsourcedServiceRow[],
  operations: ProductionOperationRow[],
) {
  const clientNames = new Map(clients.map((client) => [client.id, client.nome]));
  const ordersByProject = orders.reduce((groupedOrders, order) => {
    const projectOrders = groupedOrders.get(order.projeto_id) ?? [];
    projectOrders.push(order);
    groupedOrders.set(order.projeto_id, projectOrders);

    return groupedOrders;
  }, new Map<string, OFRow[]>());
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const projectIdsByOperation = operations.reduce((operationProjects, operation) => {
    const order = ordersById.get(operation.of_id);

    if (order) {
      operationProjects.set(operation.id, order.projeto_id);
    }

    return operationProjects;
  }, new Map<string, string>());
  const outsourcedServicesByProject = outsourcedServices.reduce((groupedServices, service) => {
    const projectId = projectIdsByOperation.get(service.operacao_producao_id);

    if (projectId) {
      const projectServices = groupedServices.get(projectId) ?? [];
      projectServices.push(service);
      groupedServices.set(projectId, projectServices);
    }

    return groupedServices;
  }, new Map<string, OutsourcedServiceRow[]>());

  return sortProjectsByPriority(projects).map((project, index) => {
    const template = operationalTemplates[index % operationalTemplates.length];
    const projectOrders = ordersByProject.get(project.id) ?? [];
    const { situation, operationalState } = calculateOperationalState(
      project,
      projectOrders,
    );

    return {
      projectId: project.id,
      priority: String(index + 1).padStart(2, "0"),
      project: project.numero_projeto,
      client: project.cliente_id ? clientNames.get(project.cliente_id) ?? "Sem cliente" : "Sem cliente",
      status: formatStatus(project.status),
      situation,
      operationalState,
      nextAction: getNextAction(
        project,
        projectOrders,
        outsourcedServicesByProject.get(project.id) ?? [],
      ),
      progress: template.progress,
      delivery: formatDate(project.data_objetivo),
    };
  });
}

export default function PCPPlanningPage() {
  const [planningRows, setPlanningRows] = useState<PlanningRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draggedProject, setDraggedProject] = useState<string | null>(null);
  const [, setQueueHistory] = useState<QueueHistoryEntry[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadPlanningRows() {
      if (!isSupabaseConfigured) {
        if (isMounted) {
          setPlanningRows([]);
          setLoadError("Supabase não está configurado.");
          setIsLoading(false);
        }
        return;
      }

      const projectsResult = await supabase
        .from("projetos")
        .select("id,cliente_id,numero_projeto,status,prioridade,data_objetivo,created_at")
        .is("deleted_at", null);

      if (projectsResult.error) {
        if (isMounted) {
          setPlanningRows([]);
          setLoadError(projectsResult.error.message);
          setIsLoading(false);
        }
        return;
      }

      const projects = (projectsResult.data as ProjectRow[] | null) ?? [];
      const clientIds = Array.from(
        new Set(projects.map((project) => project.cliente_id).filter(Boolean) as string[]),
      );

      const clientsResult =
        clientIds.length > 0
          ? await supabase.from("clientes").select("id,nome").in("id", clientIds)
          : { data: [], error: null };

      if (clientsResult.error) {
        if (isMounted) {
          setPlanningRows([]);
          setLoadError(clientsResult.error.message);
          setIsLoading(false);
        }
        return;
      }

      const projectIds = projects.map((project) => project.id);
      const ordersResult =
        projectIds.length > 0
          ? await supabase
              .from("ordens_fabricacao")
              .select("id,projeto_id,status")
              .in("projeto_id", projectIds)
              .is("deleted_at", null)
          : { data: [], error: null };

      if (ordersResult.error) {
        if (isMounted) {
          setPlanningRows([]);
          setLoadError(ordersResult.error.message);
          setIsLoading(false);
        }
        return;
      }

      const orders = (ordersResult.data as OFRow[] | null) ?? [];
      const orderIds = orders.map((order) => order.id);
      const operationsResult =
        orderIds.length > 0
          ? await supabase.from("operacoes_producao").select("id,of_id").in("of_id", orderIds)
          : { data: [], error: null };

      if (operationsResult.error) {
        if (isMounted) {
          setPlanningRows([]);
          setLoadError(operationsResult.error.message);
          setIsLoading(false);
        }
        return;
      }

      const operations = (operationsResult.data as ProductionOperationRow[] | null) ?? [];
      const operationIds = operations.map((operation) => operation.id);
      const outsourcedServicesResult =
        operationIds.length > 0
          ? await supabase
              .from("servicos_terceirizados")
              .select("id,operacao_producao_id,status")
              .in("operacao_producao_id", operationIds)
          : { data: [], error: null };

      if (outsourcedServicesResult.error) {
        if (isMounted) {
          setPlanningRows([]);
          setLoadError(outsourcedServicesResult.error.message);
          setIsLoading(false);
        }
        return;
      }

      if (isMounted) {
        setPlanningRows(
          buildPlanningRows(
            projects,
            (clientsResult.data as ClientRow[] | null) ?? [],
            orders,
            (outsourcedServicesResult.data as OutsourcedServiceRow[] | null) ?? [],
            operations,
          ),
        );
        setLoadError(null);
        setIsLoading(false);
      }
    }

    loadPlanningRows();

    return () => {
      isMounted = false;
    };
  }, []);

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
        (row) => row.projectId === draggedProject,
      );
      const targetIndex = currentRows.findIndex(
        (row) => row.projectId === targetProject,
      );

      if (draggedIndex < 0 || targetIndex < 0) {
        return currentRows;
      }

      const nextRows = [...currentRows];
      const [draggedRow] = nextRows.splice(draggedIndex, 1);
      nextRows.splice(targetIndex, 0, draggedRow);

      const normalizedRows = normalizePriorities(nextRows);
      const movedRow = normalizedRows.find(
        (row) => row.projectId === draggedProject,
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
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-sm font-medium text-slate-500">
                      Carregando projetos...
                    </td>
                  </tr>
                ) : null}

                {!isLoading && loadError ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-sm font-medium text-amber-700">
                      {loadError}
                    </td>
                  </tr>
                ) : null}

                {!isLoading && !loadError && planningRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-sm font-medium text-slate-500">
                      Nenhum projeto encontrado.
                    </td>
                  </tr>
                ) : null}

                {planningRows.map((row) => (
                  <tr
                    key={row.projectId}
                    onDragOver={allowDrop}
                    onDrop={() => handleDrop(row.projectId)}
                    className={`transition hover:bg-slate-50 ${
                      draggedProject === row.projectId ? "bg-slate-100" : ""
                    }`}
                  >
                    <td className="px-5 py-4">
                      <span
                        draggable
                        onDragStart={() => handleDragStart(row.projectId)}
                        onDragEnd={() => setDraggedProject(null)}
                        className="inline-flex h-7 w-10 cursor-grab items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold tabular-nums text-slate-700 active:cursor-grabbing"
                      >
                        {row.priority}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <EntityLink
                        type="projeto"
                        id={row.projectId}
                        className="font-semibold text-slate-950 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                      >
                        {row.project}
                      </EntityLink>
                    </td>
                    <td className="px-5 py-4 text-slate-700">{row.client}</td>
                    <td className="px-5 py-4">
                      <span
                        title={`Status do projeto: ${row.status}`}
                        aria-label={`Situacao ${row.situation}. Status do projeto: ${row.status}`}
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
                          aria-label={
                            row.operationalState.hasOrders
                              ? `${row.operationalState.ready} OFs aptas e ${row.operationalState.blocked} OFs nao aptas`
                              : "Sem OFs"
                          }
                          className="inline-flex h-7 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold tabular-nums text-slate-700"
                        >
                          {row.operationalState.hasOrders ? (
                            <>
                              <span>{row.operationalState.ready}✓</span>
                              <span>{row.operationalState.blocked}⚠</span>
                            </>
                          ) : (
                            <span>Sem OF&apos;s</span>
                          )}
                        </span>

                        <span className="pointer-events-none absolute left-0 top-9 z-10 hidden w-48 rounded-md border border-slate-200 bg-white p-3 text-xs font-medium leading-5 text-slate-700 shadow-lg group-hover:block">
                          <span className="flex justify-between gap-3">
                            <span>OF totais</span>
                            <span>{row.operationalState.total}</span>
                          </span>
                          <span className="flex justify-between gap-3 text-emerald-700">
                            <span>✓ Aptas</span>
                            <span>{row.operationalState.ready}</span>
                          </span>
                          <span className="flex justify-between gap-3 text-amber-700">
                            <span>📦 Aguardando MP</span>
                            <span>{row.operationalState.waitingMaterial}</span>
                          </span>
                          <span className="flex justify-between gap-3 text-slate-700">
                            <span>🏭 Em produção</span>
                            <span>{row.operationalState.inProduction}</span>
                          </span>
                          <span className="flex justify-between gap-3 text-blue-700">
                            <span>⚙ Programação</span>
                            <span>{row.operationalState.programming}</span>
                          </span>
                          <span className="flex justify-between gap-3 text-emerald-700">
                            <span>Finalizadas</span>
                            <span>{row.operationalState.finished}</span>
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
