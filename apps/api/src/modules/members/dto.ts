import type { Role } from "@repo/types";
import { paginatedResponseSchema, RoleSchema } from "@repo/types";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateMemberSchema = z.object({
  email: z.email(),
  name: z.string().min(1).max(120).optional(),
  role: RoleSchema.default("MEMBER"),
});
export class CreateMemberDto extends createZodDto(CreateMemberSchema) {}

export const UpdateMemberSchema = z.object({
  role: RoleSchema,
});
export class UpdateMemberDto extends createZodDto(UpdateMemberSchema) {}

export const MemberViewSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: RoleSchema,
  createdAt: z.iso.datetime(),
});
export class MemberViewDto extends createZodDto(MemberViewSchema) {}

export const MemberListResponseSchema =
  paginatedResponseSchema(MemberViewSchema);
export class MemberListResponseDto extends createZodDto(
  MemberListResponseSchema,
) {}

export interface MemberView {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: Date;
}
