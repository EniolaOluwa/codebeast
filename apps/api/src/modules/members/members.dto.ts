import {
  memberInviteInputSchema,
  memberUpdateInputSchema,
  paginationQuerySchema,
} from "@repo/types";
import { createZodDto } from "nestjs-zod";

export class MemberInviteDto extends createZodDto(memberInviteInputSchema) {}
export class MemberUpdateDto extends createZodDto(memberUpdateInputSchema) {}
export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
