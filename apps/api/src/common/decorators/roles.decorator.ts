import { SetMetadata } from "@nestjs/common";
import type { Role } from "@repo/types";

export const ROLES_KEY = "roles";

/** Restricts a route to the given tenant roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
