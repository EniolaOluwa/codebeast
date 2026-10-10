import helmet from "@fastify/helmet";
import fp from "fastify-plugin";

const helmetPlugin = fp(
  async (fastify) => {
    await fastify.register(helmet);
  },
  { name: "helmet" },
);

export default helmetPlugin;
