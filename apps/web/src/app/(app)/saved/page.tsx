import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ListSkeleton } from "@/components/xen/discover-view";
import { HideButton } from "@/components/xen/opportunity-actions";
import { OpportunityTable } from "@/components/xen/opportunity-table";
import { EmptyState, PageHeader } from "@/components/xen/status";
import { getSaved } from "@/lib/xen/queries";
import { requestNow } from "@/lib/xen/time";

export const metadata: Metadata = { title: "Saved" };

export default function SavedPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Saved" description="Opportunities you bookmarked, and the ones you marked as not interested" />
      <Suspense fallback={<ListSkeleton />}>
        <Saved />
      </Suspense>
    </div>
  );
}

async function Saved() {
  const now = await requestNow();
  const { saved, hidden } = await getSaved();
  return (
    <div className="space-y-6">
      {saved.length ? (
        <OpportunityTable rows={saved} saved={new Set(saved.map((s) => s.id))} now={now} />
      ) : (
        <EmptyState title="No saved opportunities" action={<Link href="/discover" className={buttonVariants({ variant: "outline", size: "sm" })}>Browse Discover</Link>}>
          Use the bookmark on any opportunity to keep it here. You can also save from Telegram alerts.
        </EmptyState>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Not interested ({hidden.length})</h2>
        {hidden.length ? (
          <ul className="divide-y rounded-md border bg-card">
            {hidden.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <Link href={`/opportunities/${o.id}`} className="min-w-0 truncate text-sm hover:underline">{o.title}</Link>
                <HideButton id={o.id} hidden />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing hidden. “Not interested” removes an opportunity from Discover without deleting it.</p>
        )}
      </section>
    </div>
  );
}
