import { Type } from "@sinclair/typebox";

export const HealthResponse = Type.Object({
  status: Type.String(),
  timestamp: Type.String(),
  uptime: Type.Number(),
  environment: Type.String(),
  version: Type.String(),
});

export const ReadinessResponse = Type.Object({
  status: Type.String(),
  timestamp: Type.String(),
});
