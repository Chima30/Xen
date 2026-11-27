import type { Metadata } from "next";
import { Suspense } from "react";
import { portfolioToMarkdown } from "@xen/core";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton, DownloadButton, LabTabs } from "@/components/lab/lab-ui";
import { slugify } from "@/components/lab/lab-utils";
import { PortfolioEditor } from "@/components/lab/portfolio-editor";
import { PageHeader, Section } from "@/components/xen/status";
import { getPortfolio } from "@/lib/xen/lab-queries";

export const metadata: Metadata = { title: "Tester portfolio" };

export default function PortfolioPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Testing Lab" description="A tester profile built from work you actually did" />
      <LabTabs active="/lab/portfolio" />
      <Suspense fallback={<Skeleton className="h-96" />}><Portfolio /></Suspense>
    </div>
  );
}

async function Portfolio() {
  const p = await getPortfolio();
  const md = portfolioToMarkdown({ name: p.name, headline: p.headline, summary: p.summary, skills: p.skills, entries: [...p.derived, ...p.manual] });
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <Section title="Profile"><PortfolioEditor headline={p.headline} summary={p.summary} manual={p.manual} /></Section>
        <Section title={`From your XEN work (${p.derived.length})`} description="Bug reports marked submitted or accepted, and feedback you sent">
          {p.derived.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet. Mark reports as submitted or accepted in Bug reports, and feedback as sent.</p>
          ) : (
            <ul className="divide-y text-sm">
              {p.derived.map((e, i) => (
                <li key={i} className="py-2"><span className="font-medium">{e.project}</span> — {e.title} <span className="text-muted-foreground">({e.kind.replace(/_/g, " ")}, {e.outcome})</span></li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <Section title="Export" description="Markdown you can paste into an application, a README or a form" actions={<div className="flex gap-2"><CopyButton text={md} /><DownloadButton text={md} filename={`${slugify(p.name)}-tester-profile.md`} /></div>}>
        <pre className="max-h-[36rem] overflow-auto rounded-md bg-background p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">{md}</pre>
      </Section>
    </div>
  );
}
