import { SetMetadata } from "@nestjs/common";
import type { ApiKeyScope } from "@repo/types";

export const SCOPES_KEY = "scopes";

/** Requires all given scopes for API-key actors. */
export const Scopes = (...scopes: ApiKeyScope[]) =>
  SetMetadata(SCOPES_KEY, scopes);
