import type { PaginationParams, PaginationRange } from "./types";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function normalizePagination(params: Partial<PaginationParams>) {
  const page = Math.max(1, Math.floor(params.page ?? DEFAULT_PAGE));
  const requestedPageSize = Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize));

  return {
    page,
    pageSize,
    range: getPaginationRange({ page, pageSize }),
  };
}

export function getPaginationRange(params: PaginationParams): PaginationRange {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  return { from, to };
}

export function getTotalPages(totalCount: number, pageSize: number) {
  if (totalCount <= 0) {
    return 0;
  }

  return Math.ceil(totalCount / pageSize);
}
