"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "link";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setMessage("");
    const auth = createClient().auth;

    if (mode === "password") {
      const { error } = await auth.signInWithPassword({ email, password });
      if (error) {
        setState("error");
        setMessage(error.message);
        return;
      }
      // Refresh so server components see the new session cookies.
      router.replace("/");
      router.refresh();
      return;
    }

    const { error } = await auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else {
      setState("sent");
      setMessage("Check your inbox for the sign-in link.");
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setState("idle");
    setMessage("");
  }

  const busy = state === "sending";
  const input =
    "w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-3">
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
      </div>
      {mode === "password" && (
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </div>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-accent-contrast disabled:opacity-60"
      >
        {busy ? (mode === "password" ? "Signing in…" : "Sending…") : mode === "password" ? "Sign in" : "Send sign-in link"}
      </button>
      {message && (
        <p role="status" className={`text-sm ${state === "error" ? "text-danger" : "text-ok"}`}>{message}</p>
      )}
      <button
        type="button"
        onClick={() => switchMode(mode === "password" ? "link" : "password")}
        className="text-sm text-muted underline-offset-4 hover:text-text hover:underline"
      >
        {mode === "password" ? "Email me a sign-in link instead" : "Use my password instead"}
      </button>
    </form>
  );
}
