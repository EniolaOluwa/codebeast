import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fp from "fastify-plugin";

const swaggerPlugin = fp(
  async (fastify) => {
    await fastify.register(swagger, {
      openapi: {
        openapi: "3.1.0",
        info: {
          title: "CodeBeast API",
          description: "CodeBeast API — autonomous SRE platform",
          version: "1.0.0",
        },
        servers: [
          {
            url:
              fastify.config.NODE_ENV === "production"
                ? "https://api.codebeast.app"
                : `http://localhost:${fastify.config.PORT}`,
          },
        ],
      },
    });

    await fastify.register(swaggerUi, {
      routePrefix: "/api-docs",
    });
  },
  { name: "swagger" },
);

export default swaggerPlugin;
