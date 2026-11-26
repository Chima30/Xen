"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseEnv } from "./public-env";

export function createClient() {
  const { url, anonKey } = publicSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
