import type {
  OF_PRIORITIES,
  OF_STATUSES,
  PRODUCTION_QUEUE_TYPES,
} from "./constants";

export type OfPriority = (typeof OF_PRIORITIES)[number];

export type OfStatus = (typeof OF_STATUSES)[number];

export type ProductionQueueType = (typeof PRODUCTION_QUEUE_TYPES)[number];

export type ProductionSettings = {
  diasBufferEntrega: number;
  considerarSabado: boolean;
  eficienciaEngenharia: number;
  eficienciaProducao: number;
  eficienciaMontagem: number;
  prazoRespostaClienteDiasUteis: number;
};

export type InitialPlanningInput = {
  dataPrometidaCliente: Date;
  horasEngenharia?: number;
  horasProducao?: number;
  horasMontagem?: number;
  configuracoes: ProductionSettings;
};

export type RealQueueEligibilityInput = {
  materiaPrimaDisponivel: boolean;
  ofLiberada: boolean;
  aprovacoesConcluidas: boolean;
};

export type RealQueueEligibilityResult = {
  canEnterRealQueue: boolean;
  queueType: ProductionQueueType;
  reason:
    | "liberada"
    | "aguardando_material"
    | "of_nao_liberada"
    | "aprovacao_pendente";
};
