import { DEFAULT_CUSTOMER_RESPONSE_BUSINESS_DAYS } from "./constants";
import { addBusinessDays } from "../producao/rules";

export function getCustomerResponseDueDate(
  sentToCustomerAt: Date,
  considerarSabado: boolean,
  responseBusinessDays = DEFAULT_CUSTOMER_RESPONSE_BUSINESS_DAYS,
) {
  return addBusinessDays(
    sentToCustomerAt,
    responseBusinessDays,
    considerarSabado,
  );
}

export function getCustomerDelayBusinessDays(
  dueDate: Date,
  respondedAt: Date,
  considerarSabado: boolean,
) {
  if (respondedAt <= dueDate) {
    return 0;
  }

  let delay = 0;
  const cursor = new Date(dueDate);

  while (cursor < respondedAt) {
    cursor.setDate(cursor.getDate() + 1);

    const day = cursor.getDay();
    const isSunday = day === 0;
    const isSaturday = day === 6;

    if (isSunday || (isSaturday && !considerarSabado)) {
      continue;
    }

    delay += 1;
  }

  return delay;
}

export function shiftPlanningByCustomerDelay(
  plannedDate: Date,
  delayBusinessDays: number,
  considerarSabado: boolean,
) {
  return addBusinessDays(plannedDate, delayBusinessDays, considerarSabado);
}
