import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { prisma } from "@repo/db";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  readonly client = prisma;

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log("Prisma connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
    this.logger.log("Prisma disconnected");
  }

  async ping(): Promise<void> {
    await this.client.$queryRaw`SELECT 1`;
  }
}
