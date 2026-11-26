import { connection } from "next/server";
import { integrationStatus } from "@xen/core";
import { serverEnv } from "@/lib/env";

/** Liveness + configuration status. Never returns secret values. */
export async function GET() {
  await connection(); // evaluate at request time, not build time
  try {
    const env = serverEnv();
    return Response.json({ ok: true, service: "xen-web", model: env.GEMINI_MODEL, integrations: integrationStatus(env) });
  } catch (e) {
    return Response.json({ ok: false, error: "Server environment is incomplete", detail: (e as Error).message.split(" — ")[1] ?? "" }, { status: 500 });
  }
}
