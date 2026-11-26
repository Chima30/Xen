"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else {
      setState("sent");
      setMessage("Check your inbox for the sign-in link.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-3">
      <label className="block text-sm font-medium" htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-accent-contrast disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Send sign-in link"}
      </button>
      {message && (
        <p role="status" className={`text-sm ${state === "error" ? "text-danger" : "text-ok"}`}>{message}</p>
      )}
    </form>
  );
}
