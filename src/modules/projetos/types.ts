import type {
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
} from "./constants";

export type ProjectType = (typeof PROJECT_TYPES)[number];

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

export type Project = {
  id: string;
  empresaId: string;
  numeroProjeto: string;
  clienteId: string | null;
  tipoProjeto: ProjectType;
  dataObjetivo: string | null;
  prioridade: ProjectPriority;
  margemLucroPercent: number | null;
  regraFaturamento: string | null;
  observacoes: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  ativo: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
};

export type ProjectItem = {
  id: string;
  empresaId: string;
  projetoId: string;
  produtoId: string;
  pn: string;
  descricao: string;
  revisao: string | null;
  quantidade: number;
  material: string | null;
  tipoItem: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  ativo: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
};

export type ProjectListFilters = {
  search?: string;
  clienteId?: string;
  status?: ProjectStatus;
  tipoProjeto?: ProjectType;
  dataObjetivoInicio?: string;
  dataObjetivoFim?: string;
};
