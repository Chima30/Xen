import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServiceClient } from "@xen/core";
import { serverEnv } from "../env";
import { publicSupabaseEnv } from "./public-env";

/** Per-request client acting as the signed-in user (RLS applies). */
export async function createUserClient() {
  // Read cookies first: it marks the caller as request-time, so the build never
  // prerenders past this point and missing env vars only fail real requests.
  // connection() also covers prerender validation, where the auth client would otherwise read the clock.
  await connection();
  const store = await cookies();
  const { url, anonKey } = publicSupabaseEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there; proxy.ts refreshes sessions.
        }
      },
    },
  });
}

/** Service-role client. Bypasses RLS — only use after authorizing the caller. */
export function createAdminClient() {
  const env = serverEnv();
  return createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}
