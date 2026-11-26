import type { Metadata } from "next";
import Link from "next/link";
import { XenLogo } from "@/components/brand/xen-mark";
import { AtmosphericBackground } from "@/components/site/atmospheric-background";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      <AtmosphericBackground />
      <div className="relative w-full max-w-sm">
        <Link href="/" aria-label="XEN home" className="mb-8 inline-block"><XenLogo /></Link>
        <div className="rounded-[16px] bg-xen-kelp/80 p-7">
          <p className="xen-eyebrow">XEN intelligence</p>
          <h1 className="mt-3 text-2xl font-medium tracking-[-0.03em] text-white">Sign in</h1>
          <p className="mt-1 text-sm text-xen-silver">Use your email and password</p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
