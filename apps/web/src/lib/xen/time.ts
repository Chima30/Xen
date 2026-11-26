import "server-only";
import { connection } from "next/server";

/** Marks the render as request-time and returns the current time for relative dates. */
export async function requestNow(): Promise<number> {
  await connection();
  return Date.now();
}
