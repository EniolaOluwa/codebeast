export { createPrismaClient, prisma } from "./client.ts";
export { Prisma } from "./generated/prisma/client.ts";
// Full re-export (values + types), including the generated enum consts that
// the API's contract-parity test compares against `@repo/types`.
export * from "./generated/prisma/client.ts";
