import {
  PROJECT_NUMBER_PATTERN,
  PROJECT_STATUSES,
  PROJECT_TYPES,
} from "./constants";
import type { ProjectStatus, ProjectType } from "./types";

export function isProjectNumber(value: string) {
  return PROJECT_NUMBER_PATTERN.test(value);
}

export function isProjectType(value: string): value is ProjectType {
  return PROJECT_TYPES.includes(value as ProjectType);
}

export function isProjectStatus(value: string): value is ProjectStatus {
  return PROJECT_STATUSES.includes(value as ProjectStatus);
}

export function buildProjectItemOfCode(projectNumber: string, itemIndex: number) {
  if (!isProjectNumber(projectNumber)) {
    throw new Error("Número do projeto deve seguir o formato AANNNN.");
  }

  if (!Number.isInteger(itemIndex) || itemIndex < 1) {
    throw new Error("Índice do item deve ser inteiro positivo.");
  }

  return `${projectNumber}-${String(itemIndex).padStart(4, "0")}`;
}

export function normalizePn(value: string) {
  return value.trim().toUpperCase();
}
