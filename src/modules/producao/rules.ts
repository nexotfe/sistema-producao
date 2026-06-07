import {
  DEFAULT_PRODUCTION_SETTINGS,
  OF_PRIORITIES,
  OF_STATUSES,
} from "./constants";
import type {
  OfPriority,
  OfStatus,
  ProductionSettings,
  RealQueueEligibilityInput,
  RealQueueEligibilityResult,
} from "./types";

export function isOfPriority(value: string): value is OfPriority {
  return OF_PRIORITIES.includes(value as OfPriority);
}

export function isOfStatus(value: string): value is OfStatus {
  return OF_STATUSES.includes(value as OfStatus);
}

export function normalizeProductionSettings(
  settings: Partial<ProductionSettings>,
): ProductionSettings {
  return {
    ...DEFAULT_PRODUCTION_SETTINGS,
    ...settings,
  };
}

export function applyEfficiency(idealHours: number, efficiency: number) {
  if (idealHours < 0) {
    throw new Error("Horas ideais nao podem ser negativas.");
  }

  if (efficiency <= 0 || efficiency > 1) {
    throw new Error("Eficiencia deve estar entre 0 e 1.");
  }

  return idealHours / efficiency;
}

export function subtractBusinessDays(
  date: Date,
  days: number,
  considerarSabado: boolean,
) {
  if (days < 0) {
    throw new Error("Dias de buffer nao podem ser negativos.");
  }

  const result = new Date(date);
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() - 1);

    const day = result.getDay();
    const isSunday = day === 0;
    const isSaturday = day === 6;

    if (isSunday || (isSaturday && !considerarSabado)) {
      continue;
    }

    remaining -= 1;
  }

  return result;
}

export function addBusinessDays(
  date: Date,
  days: number,
  considerarSabado: boolean,
) {
  if (days < 0) {
    throw new Error("Dias nao podem ser negativos.");
  }

  const result = new Date(date);
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);

    const day = result.getDay();
    const isSunday = day === 0;
    const isSaturday = day === 6;

    if (isSunday || (isSaturday && !considerarSabado)) {
      continue;
    }

    remaining -= 1;
  }

  return result;
}

export function getInternalTargetDate(
  promisedDate: Date,
  settings: Pick<ProductionSettings, "diasBufferEntrega" | "considerarSabado">,
) {
  return subtractBusinessDays(
    promisedDate,
    settings.diasBufferEntrega,
    settings.considerarSabado,
  );
}

export function getMaterialRequiredDate(
  internalTargetDate: Date,
  productionLeadTimeBusinessDays: number,
  considerarSabado: boolean,
) {
  return subtractBusinessDays(
    internalTargetDate,
    productionLeadTimeBusinessDays,
    considerarSabado,
  );
}

export function getRealQueueEligibility(
  input: RealQueueEligibilityInput,
): RealQueueEligibilityResult {
  if (!input.ofLiberada) {
    return {
      canEnterRealQueue: false,
      queueType: "simulacao",
      reason: "of_nao_liberada",
    };
  }

  if (!input.aprovacoesConcluidas) {
    return {
      canEnterRealQueue: false,
      queueType: "simulacao",
      reason: "aprovacao_pendente",
    };
  }

  if (!input.materiaPrimaDisponivel) {
    return {
      canEnterRealQueue: false,
      queueType: "simulacao",
      reason: "aguardando_material",
    };
  }

  return {
    canEnterRealQueue: true,
    queueType: "real",
    reason: "liberada",
  };
}
