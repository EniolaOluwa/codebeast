import { Injectable } from "@nestjs/common";
import {
  automationActionsSchema,
  detectionActionsSchema,
  type Rule,
  ruleConditionsSchema,
  type RuleCreateInput,
  type RuleKind,
  type RuleUpdateInput,
} from "@repo/types";

import { NotFoundError } from "../../common/errors/errors.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

interface RuleRow {
  id: string;
  kind: RuleKind;
  name: string;
  enabled: boolean;
  conditions: unknown;
  actions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toRule(row: RuleRow): Rule {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    enabled: row.enabled,
    conditions: ruleConditionsSchema.parse(row.conditions),
    actions:
      row.kind === "DETECTION"
        ? detectionActionsSchema.parse(row.actions)
        : automationActionsSchema.parse(row.actions),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, input: RuleCreateInput): Promise<Rule> {
    const row = await this.prisma.withTenant(tenantId, (tx) =>
      tx.rule.create({
        data: {
          tenantId,
          kind: input.kind,
          name: input.name,
          enabled: input.enabled,
          conditions: input.conditions as object,
          actions: input.actions as object,
        },
      }),
    );

    return toRule(row);
  }

  async list(tenantId: string, kind?: RuleKind): Promise<Rule[]> {
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.rule.findMany({
        where: { tenantId, ...(kind ? { kind } : {}) },
        orderBy: { createdAt: "asc" },
      }),
    );

    return rows.map(toRule);
  }

  async get(tenantId: string, id: string): Promise<Rule> {
    const row = await this.prisma.withTenant(tenantId, (tx) =>
      tx.rule.findFirst({ where: { id, tenantId } }),
    );

    if (!row) {
      throw new NotFoundError("Rule");
    }

    return toRule(row);
  }

  async update(
    tenantId: string,
    id: string,
    input: RuleUpdateInput,
  ): Promise<Rule> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.rule.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        throw new NotFoundError("Rule");
      }

      // Actions are kind-specific: validate against the stored kind so a
      // detection rule can never carry automation actions (or vice versa).
      const actions =
        input.actions === undefined
          ? undefined
          : existing.kind === "DETECTION"
            ? detectionActionsSchema.parse(input.actions)
            : automationActionsSchema.parse(input.actions);

      const row = await tx.rule.update({
        where: { id: existing.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.conditions === undefined
            ? {}
            : { conditions: input.conditions as object }),
          ...(actions === undefined ? {} : { actions: actions as object }),
        },
      });

      return toRule(row);
    });
  }

  async remove(tenantId: string, id: string): Promise<{ success: true }> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.rule.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundError("Rule");
      }

      await tx.rule.delete({ where: { id: existing.id } });
      return { success: true };
    });
  }
}
