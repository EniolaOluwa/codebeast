import { Injectable, type OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { FastifyInstance } from "fastify";

/**
 * Signature verification needs the exact request bytes, but Fastify's default
 * JSON parser discards them. Replace it with one that stashes the raw body on
 * the request first. (Registered before any request is served; runs for
 * `app.init()` in tests too.)
 */
declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

@Injectable()
export class RawBodyInitializer implements OnModuleInit {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  onModuleInit(): void {
    const instance = this.adapterHost.httpAdapter?.getInstance() as
      FastifyInstance | undefined;

    if (!instance) {
      return;
    }

    instance.removeContentTypeParser("application/json");
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (request, body, done) => {
        request.rawBody = body as string;

        try {
          done(null, body.length ? JSON.parse(body as string) : {});
        } catch (error) {
          done(error as Error, undefined);
        }
      },
    );
  }
}
