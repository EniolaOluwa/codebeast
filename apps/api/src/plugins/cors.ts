import cors from "@fastify/cors";
import fp from "fastify-plugin";

const corsPlugin = fp(
  async (fastify) => {
    await fastify.register(cors, {
      origin: fastify.config.CORS_ORIGIN?.split(",") ?? "*",
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    });
  },
  { name: "cors" },
);

export default corsPlugin;
