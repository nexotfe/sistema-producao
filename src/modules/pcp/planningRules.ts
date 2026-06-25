export type PlanningSituation = "Em andamento" | "Parado" | "Concluído";

export type PlanningRow = {
  projectId: string;
  priority: string;
  project: string;
  client: string;
  status: string;
  situation: PlanningSituation;
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

export type ProjectRow = {
  id: string;
  cliente_id: string | null;
  numero_projeto: string;
  status: string | null;
  prioridade: string | null;
  data_objetivo: string | null;
  created_at: string | null;
};

export type ClientRow = {
  id: string;
  nome: string;
};

export type OFRow = {
  id: string;
  projeto_id: string;
  status: string | null;
};

export type ProductionOperationRow = {
  id: string;
  of_id: string;
};

export type ProductionProgressRow = {
  operacao_id: string;
  of_id: string;
  quantidade_planejada_snapshot: number | string | null;
  quantidade_produzida: number | string | null;
};

export type OutsourcedServiceRow = {
  id: string;
  operacao_producao_id: string;
  status: string | null;
};

const operationalTemplates = [
  {
    nextAction: "Comprar material",
    progress: "0%",
  },
  {
    nextAction: "Programar CNC",
    progress: "25%",
  },
  {
    nextAction: "Produzir",
    progress: "50%",
  },
  {
    nextAction: "Montar",
    progress: "85%",
  },
  {
    nextAction: "Terceirizar",
    progress: "100%",
  },
];

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

function toNumber(value: number | string | null | undefined) {
  if (value == null) return 0;
  return Number(value) || 0;
}

function formatProgress(value: number) {
  return `${Math.round(value)}%`;
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

function getProgress(project: ProjectRow, projectOrders: OFRow[], productionRows: ProductionProgressRow[]) {
  if (project.status === "concluido") return "100%";
  if (projectOrders.length === 0) return "0%";
  if (projectOrders.every((order) => order.status === "finalizada")) return "100%";

  const plannedQuantity = productionRows.reduce(
    (total, row) => total + toNumber(row.quantidade_planejada_snapshot),
    0,
  );
  const producedQuantity = productionRows.reduce(
    (total, row) => total + toNumber(row.quantidade_produzida),
    0,
  );

  if (plannedQuantity <= 0) return "0%";

  return formatProgress(Math.min((producedQuantity / plannedQuantity) * 100, 100));
}

export function buildPlanningRows(
  projects: ProjectRow[],
  clients: ClientRow[],
  orders: OFRow[],
  outsourcedServices: OutsourcedServiceRow[],
  operations: ProductionOperationRow[],
  productionProgressRows: ProductionProgressRow[],
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
  const productionRowsByProject = productionProgressRows.reduce((groupedRows, productionRow) => {
    const order = ordersById.get(productionRow.of_id);

    if (order) {
      const projectRows = groupedRows.get(order.projeto_id) ?? [];
      projectRows.push(productionRow);
      groupedRows.set(order.projeto_id, projectRows);
    }

    return groupedRows;
  }, new Map<string, ProductionProgressRow[]>());

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
      progress: getProgress(project, projectOrders, productionRowsByProject.get(project.id) ?? []),
      delivery: formatDate(project.data_objetivo),
    };
  });
}
