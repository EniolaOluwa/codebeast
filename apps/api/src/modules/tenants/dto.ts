import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const TenantViewSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  plan: z.string(),
  createdAt: z.iso.datetime(),
});
export class TenantViewDto extends createZodDto(TenantViewSchema) {}
