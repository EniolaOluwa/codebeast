import underPressure from "@fastify/under-pressure";
import fp from "fastify-plugin";

const underPressurePlugin = fp(
  async (fastify) => {
    await fastify.register(underPressure, {
      maxEventLoopDelay: 1000,
      maxHeapUsedBytes: 100 * 1024 * 1024,
      maxRssBytes: 100 * 1024 * 1024,
      healthCheck: async () => {
        return { status: "ok" };
      },
      healthCheckInterval: 5000,
    });
  },
  { name: "under-pressure" },
);

export default underPressurePlugin;
