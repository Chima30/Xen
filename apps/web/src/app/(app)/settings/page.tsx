import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ALL_CATEGORIES } from "@xen/core";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, Section } from "@/components/xen/status";
import { getSettings } from "@/lib/xen/queries";
import { NotificationsForm, PreferencesForm, ProfileForm, TelegramLink } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description="Your profile, what you want to find, and how XEN reaches you." />
      <Suspense fallback={<div className="space-y-4" aria-busy="true"><Skeleton className="h-48" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>}>
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  await connection();
  const s = await getSettings();
  return (
    <div className="max-w-4xl space-y-4">
      <Section title="Telegram" description="Account linking for the XEN bot">
        <TelegramLink linked={s.telegram ? { username: s.telegram.username, linked_at: s.telegram.linked_at! } : null} />
      </Section>
      <Section title="Profile" description={s.user.email ?? undefined}>
        <ProfileForm profile={s.profile} />
      </Section>
      <Section
        title="Opportunity preferences"
        description="Saved to your account. Scores are currently computed once per opportunity with the default profile (Nigeria, zero capital); per-user rescoring is not built yet."
      >
        <PreferencesForm prefs={s.prefs} categories={ALL_CATEGORIES} />
      </Section>
      <Section title="Notifications" description="Applies to alerts and briefings sent to your linked Telegram account.">
        <NotificationsForm notif={s.notif} categories={ALL_CATEGORIES} />
      </Section>
    </div>
  );
}
