import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const RemovedResponseSchema = z.object({
  removed: z.boolean(),
});
export class RemovedResponseDto extends createZodDto(RemovedResponseSchema) {}
