import "server-only";
import { loadServerEnv, type ServerEnv } from "@xen/core";

let cached: ServerEnv | null = null;

/** Server-only validated environment. Throws a descriptive error if required vars are missing. */
export function serverEnv(): ServerEnv {
  cached ??= loadServerEnv(process.env);
  return cached;
}
