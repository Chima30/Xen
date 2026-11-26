import type { Metadata } from "next";
import Link from "next/link";
import { XenLogo } from "@/components/brand/xen-mark";
import { Container } from "@/components/site/primitives";

export const metadata: Metadata = { title: "Privacy" };

/** A factual description of what XEN stores and why, based on how the system is built. */
export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-xen-abyss py-16">
      <Container className="max-w-3xl">
        <Link href="/" aria-label="XEN home"><XenLogo /></Link>
        <h1 className="xen-display mt-12 text-5xl text-white">Privacy</h1>
        <div className="mt-10 space-y-6 text-[15px] leading-relaxed text-xen-silver">
          <p>XEN collects public information about Web3 opportunities and projects: public web pages, announcements, feeds and public APIs. It does not read private communities, bypass logins or paywalls, or collect information about other people.</p>
          <p>For your account, XEN stores your email address, the profile and preferences you enter, and what you save, apply to or mark in the dashboard. If you link Telegram, it stores your Telegram user and chat identifiers so the bot can message you. This data lives in XEN&apos;s Supabase database and is protected by row-level security, so each account can only read its own personal records.</p>
          <p>XEN never asks for wallet private keys or seed phrases, never signs transactions and never sends messages on your behalf without your approval.</p>
          <p>Page text sent to the AI model (Google Gemini) for analysis is public content collected from the web, never your personal data.</p>
          <p>To have your account and data deleted, unlink Telegram in Settings and contact the operator of this XEN instance.</p>
        </div>
      </Container>
    </main>
  );
}
