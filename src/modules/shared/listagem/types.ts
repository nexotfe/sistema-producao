export type PaginationParams = {
  page: number;
  pageSize: number;
};

export type PaginationRange = {
  from: number;
  to: number;
};

export type PaginatedResult<T> = {
  data: T[];
  range: PaginationRange;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};
