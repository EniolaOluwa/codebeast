import fastifyEnv from "@fastify/env";
import fp from "fastify-plugin";

import { type Env, envSchema } from "./env.schema.ts";

const envPlugin = fp(
  async (fastify) => {
    await fastify.register(fastifyEnv, {
      confKey: "config",
      schema: envSchema,
      dotenv: true,
    });
  },
  { name: "env" },
);

declare module "fastify" {
  interface FastifyInstance {
    config: Env;
  }
}

export default envPlugin;
