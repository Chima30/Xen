import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-md border border-border bg-surface p-6">
        <p className="font-mono text-sm tracking-tight text-accent">XEN</p>
        <h1 className="mt-1 text-lg font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted">We’ll email you a one-time sign-in link.</p>
        <LoginForm />
      </div>
    </main>
  );
}
