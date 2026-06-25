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

export type DailyScheduleSituation = "Programada" | "Em execucao" | "Concluida" | "Parada";

export type DailyScheduleRow = {
  resource: string;
  ofId: string;
  of: string;
  projectId: string;
  project: string;
  client: string;
  pnId: string | null;
  pn: string;
  estimatedTime: string;
  reportedTime: string;
  priority: string;
  situation: DailyScheduleSituation;
  programmability: {
    isProgrammable: boolean;
    label: "Programavel" | "Bloqueada";
    details: string;
    blockers: string[];
  };
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

export type DailyOFRow = OFRow & {
  numero_of: string;
  produto_id: string | null;
};

export type ProductionOperationRow = {
  id: string;
  of_id: string;
};

export type DailyProductionOperationRow = ProductionOperationRow & {
  sequencia_snapshot: number | null;
  tempo_planejado_snapshot: number | string | null;
  unidade_tempo_snapshot: string | null;
};

export type ProductionAppointmentRow = {
  operacao_producao_id: string;
  duracao_minutos: number | string | null;
};

export type OperationAllocationRow = {
  operacao_producao_id: string;
  recurso_produtivo_id: string | null;
  ativa: boolean | null;
};

export type MaterialNeedRow = {
  of_id: string;
  status: string | null;
  status_atendimento: string | null;
  cancelada_em: string | null;
};

export type ProductItemRow = {
  id: string;
  pn: string;
};

export type ProductiveResourceRow = {
  id: string;
  nome: string;
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

function formatHours(value: number) {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}h`;
}

function formatPlannedTime(operations: DailyProductionOperationRow[]) {
  const totalMinutes = operations.reduce((total, operation) => {
    const time = toNumber(operation.tempo_planejado_snapshot);
    const unit = (operation.unidade_tempo_snapshot ?? "").toLowerCase();

    if (unit.startsWith("min")) return total + time;
    return total + time * 60;
  }, 0);

  return formatHours(totalMinutes / 60);
}

function formatReportedTime(appointments: ProductionAppointmentRow[]) {
  const totalMinutes = appointments.reduce(
    (total, appointment) => total + toNumber(appointment.duracao_minutos),
    0,
  );

  return formatHours(totalMinutes / 60);
}

function getDailyScheduleSituation(status: string | null | undefined): DailyScheduleSituation {
  if (status === "finalizada") return "Concluida";
  if (status === "em_producao") return "Em execucao";
  if (["aguardando_material", "parada", "cancelada"].includes(status ?? "")) return "Parada";
  return "Programada";
}

function getOFProgrammability(
  order: DailyOFRow,
  operations: DailyProductionOperationRow[],
  materialNeeds: MaterialNeedRow[],
  activeAllocation: OperationAllocationRow | null | undefined,
) {
  const status = order.status ?? "";
  const engineeringReleased = !["simulacao", "cancelada"].includes(status);
  const materialAvailable =
    status !== "aguardando_material" &&
    materialNeeds
      .filter((need) => !need.cancelada_em && need.status !== "cancelada")
      .every((need) => ["reservado", "atendido", "cancelado"].includes(need.status_atendimento ?? ""));
  const programmingAvailable = operations.length > 0;
  const resourceAvailable = Boolean(activeAllocation?.recurso_produtivo_id);
  const blockers = [
    engineeringReleased ? null : "Engenharia",
    materialAvailable ? null : "Material",
    programmingAvailable ? null : "Programacao",
    resourceAvailable ? null : "Recurso",
  ].filter(Boolean) as string[];
  const isProgrammable = blockers.length === 0;
  const label: "Programavel" | "Bloqueada" = isProgrammable ? "Programavel" : "Bloqueada";

  return {
    isProgrammable,
    label,
    details: [
      `Engenharia ${engineeringReleased ? "liberada" : "pendente"}`,
      `Material ${materialAvailable ? "disponivel" : "pendente"}`,
      `Programacao ${programmingAvailable ? "disponivel" : "pendente"}`,
      `Recurso ${resourceAvailable ? "disponivel" : "pendente"}`,
    ].join(" | "),
    blockers,
  };
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

export function buildDailyScheduleRows(
  projects: ProjectRow[],
  clients: ClientRow[],
  orders: DailyOFRow[],
  items: ProductItemRow[],
  operations: DailyProductionOperationRow[],
  appointments: ProductionAppointmentRow[],
  allocations: OperationAllocationRow[],
  materialNeeds: MaterialNeedRow[],
  resources: ProductiveResourceRow[],
) {
  const clientNames = new Map(clients.map((client) => [client.id, client.nome]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const itemPNs = new Map(items.map((item) => [item.id, item.pn]));
  const resourceNames = new Map(resources.map((resource) => [resource.id, resource.nome]));
  const projectPriorities = new Map(
    sortProjectsByPriority(projects).map((project, index) => [
      project.id,
      String(index + 1).padStart(2, "0"),
    ]),
  );
  const operationsByOrder = operations.reduce((groupedOperations, operation) => {
    const orderOperations = groupedOperations.get(operation.of_id) ?? [];
    orderOperations.push(operation);
    groupedOperations.set(operation.of_id, orderOperations);

    return groupedOperations;
  }, new Map<string, DailyProductionOperationRow[]>());
  const materialNeedsByOrder = materialNeeds.reduce((groupedNeeds, need) => {
    const orderNeeds = groupedNeeds.get(need.of_id) ?? [];
    orderNeeds.push(need);
    groupedNeeds.set(need.of_id, orderNeeds);

    return groupedNeeds;
  }, new Map<string, MaterialNeedRow[]>());
  const appointmentsByOperation = appointments.reduce((groupedAppointments, appointment) => {
    const operationAppointments = groupedAppointments.get(appointment.operacao_producao_id) ?? [];
    operationAppointments.push(appointment);
    groupedAppointments.set(appointment.operacao_producao_id, operationAppointments);

    return groupedAppointments;
  }, new Map<string, ProductionAppointmentRow[]>());
  const allocationsByOperation = allocations.reduce((groupedAllocations, allocation) => {
    const operationAllocations = groupedAllocations.get(allocation.operacao_producao_id) ?? [];
    operationAllocations.push(allocation);
    groupedAllocations.set(allocation.operacao_producao_id, operationAllocations);

    return groupedAllocations;
  }, new Map<string, OperationAllocationRow[]>());

  return [...orders]
    .sort((first, second) => {
      const firstPriority = projectPriorities.get(first.projeto_id) ?? "99";
      const secondPriority = projectPriorities.get(second.projeto_id) ?? "99";

      if (firstPriority !== secondPriority) return firstPriority.localeCompare(secondPriority);

      return first.numero_of.localeCompare(second.numero_of);
    })
    .map((order) => {
      const project = projectsById.get(order.projeto_id);
      const pn = order.produto_id ? itemPNs.get(order.produto_id) ?? "Sem PN" : "Sem PN";
      const orderOperations = [...(operationsByOrder.get(order.id) ?? [])].sort(
        (first, second) => (first.sequencia_snapshot ?? 0) - (second.sequencia_snapshot ?? 0),
      );
      const firstOperation = orderOperations[0];
      const activeAllocation = firstOperation
        ? (allocationsByOperation.get(firstOperation.id) ?? []).find(
            (allocation) => allocation.ativa !== false && allocation.recurso_produtivo_id,
          )
        : null;
      const orderAppointments = orderOperations.flatMap(
        (operation) => appointmentsByOperation.get(operation.id) ?? [],
      );
      const client =
        project?.cliente_id && clientNames.has(project.cliente_id)
          ? clientNames.get(project.cliente_id) ?? "Sem cliente"
          : "Sem cliente";

      return {
        resource: activeAllocation?.recurso_produtivo_id
          ? resourceNames.get(activeAllocation.recurso_produtivo_id) ?? "Sem recurso"
          : "Sem recurso",
        ofId: order.id,
        of: order.numero_of,
        projectId: order.projeto_id,
        project: project?.numero_projeto ?? order.projeto_id,
        client,
        pnId: pn !== "Sem PN" ? pn : null,
        pn,
        estimatedTime: formatPlannedTime(orderOperations),
        reportedTime: formatReportedTime(orderAppointments),
        priority: projectPriorities.get(order.projeto_id) ?? "99",
        situation: getDailyScheduleSituation(order.status),
        programmability: getOFProgrammability(
          order,
          orderOperations,
          materialNeedsByOrder.get(order.id) ?? [],
          activeAllocation,
        ),
      };
    });
}
