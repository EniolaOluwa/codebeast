import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  errorEnvelopeSchema,
  paginatedResponseSchema,
  paginationQuerySchema,
} from "./api.ts";

describe("api envelopes", () => {
  it("accepts a valid error envelope", () => {
    const parsed = errorEnvelopeSchema.parse({
      success: false,
      error: { code: "NOT_FOUND", message: "Repository not found" },
    });
    expect(parsed.error.code).toBe("NOT_FOUND");
  });

  it("rejects a success envelope masquerading as an error", () => {
    const result = errorEnvelopeSchema.safeParse({ success: true });
    expect(result.success).toBe(false);
  });

  it("coerces pagination query defaults", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(paginationQuerySchema.parse({ page: "3", limit: "50" })).toEqual({
      page: 3,
      limit: 50,
    });
    expect(paginationQuerySchema.safeParse({ limit: "500" }).success).toBe(
      false,
    );
  });

  it("builds a typed paginated response schema", () => {
    const schema = paginatedResponseSchema(z.object({ id: z.string() }));
    const parsed = schema.parse({
      success: true,
      data: [{ id: "abc" }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(parsed.data[0]?.id).toBe("abc");

    expect(
      schema.safeParse({ success: true, data: [], pagination: {} }).success,
    ).toBe(false);
  });
});
