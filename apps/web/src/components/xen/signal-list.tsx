import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { SIGNAL_LABELS } from "@xen/core";
import { relative, formatDate } from "@/lib/xen/format";
import type { SignalRow } from "@/lib/xen/intel-queries";

const host = (u: string) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } };

/** A project's signals as a timeline: what happened, the quote it rests on, and where it came from. */
export function SignalList({ signals, now, projectNames }: { signals: SignalRow[]; now: number; projectNames?: Map<string, string> }) {
  return (
    <ol className="space-y-4">
      {signals.map((s) => (
        <li key={s.id} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
          <span className="pt-0.5 text-xs text-muted-foreground" title={formatDate(s.observed_at)}>{relative(s.observed_at, now)}</span>
          <div className="min-w-0">
            <p className="text-sm">
              {projectNames && <Link href={`/projects/${s.project_id}`} className="font-medium hover:underline">{projectNames.get(s.project_id) ?? "Project"}</Link>}
              {projectNames && " · "}
              <span className="font-medium">{SIGNAL_LABELS[s.signal_type] ?? s.signal_type}</span>
              <span className="text-muted-foreground"> · {s.summary}</span>
            </p>
            {s.evidence_excerpt && <blockquote className="mt-1 border-l pl-3 text-xs text-foreground/80">“{s.evidence_excerpt}”</blockquote>}
            <a href={s.source_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex items-center gap-1 font-mono text-2xs text-muted-foreground hover:text-foreground">
              {host(s.source_url)} <ExternalLink className="size-3" />
            </a>
          </div>
        </li>
      ))}
    </ol>
  );
}
