import type { PaginatedResponse, PaginationMeta } from "@repo/types";

/** Shared pagination helpers so every list endpoint matches `paginatedResponseSchema`. */

export function skipTake(
  page: number,
  limit: number,
): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}

export function paginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

export function paginated<T>(
  items: T[],
  page: number,
  limit: number,
  total: number,
): PaginatedResponse<T> {
  return {
    success: true,
    data: items,
    pagination: paginationMeta(page, limit, total),
  };
}
