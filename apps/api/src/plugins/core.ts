import fp from "fastify-plugin";

import envPlugin from "../config/env.ts";
import corsPlugin from "./cors.ts";
import errorHandlerPlugin from "./error-handler.ts";
import helmetPlugin from "./helmet.ts";
import rateLimitPlugin from "./rate-limit.ts";
import swaggerPlugin from "./swagger.ts";
import underPressurePlugin from "./under-pressure.ts";

const corePlugins = fp(
  async (fastify) => {
    await fastify.register(envPlugin);
    await fastify.register(helmetPlugin);
    await fastify.register(corsPlugin);
    await fastify.register(rateLimitPlugin);
    await fastify.register(swaggerPlugin);
    await fastify.register(underPressurePlugin);
    await fastify.register(errorHandlerPlugin);
  },
  { name: "core" },
);

export default corePlugins;
