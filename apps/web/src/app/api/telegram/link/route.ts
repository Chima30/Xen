import { sha256Hex, tgCall } from "@xen/core";
import { serverEnv } from "@/lib/env";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

/**
 * Issues a one-time Telegram link code for the signed-in user. Only the SHA-256 of the
 * code is stored; the user sends `/start <code>` to the bot within 10 minutes.
 */
export async function POST() {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const code = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16).toUpperCase();
  const expires = new Date(Date.now() + 10 * 60_000);

  const admin = createAdminClient();
  const { error } = await admin.from("telegram_accounts").upsert(
    { user_id: data.user.id, link_code: await sha256Hex(code), link_code_expires_at: expires.toISOString() },
    { onConflict: "user_id" },
  );
  if (error) return Response.json({ error: "Could not create link code" }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_user_id: data.user.id, actor: "user", action: "telegram.link_code_issued" });

  // The bot's @username, for a one-tap t.me deep link. Optional: linking also works by typing the command.
  let bot: string | null = null;
  const token = serverEnv().TELEGRAM_BOT_TOKEN;
  if (token) {
    try {
      bot = (await tgCall<{ username?: string }>(token, "getMe", {})).username ?? null;
    } catch {
      bot = null;
    }
  }

  return Response.json({ code, command: `/start ${code}`, expiresAt: expires.toISOString(), bot });
}
