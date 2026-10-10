import { describe, expect, it } from "vitest";

import { buildApp } from "../app.ts";

describe("Health Routes", () => {
  it("GET /health returns 200 with status ok", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("environment");
    await app.close();
  });

  it("GET /health/ready returns 200", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ready");
    expect(body).toHaveProperty("timestamp");
    await app.close();
  });
});
