"use client";

import Link from "next/link";
import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/lab", label: "Bug reports" },
  { href: "/lab/test-plans", label: "Test plans" },
  { href: "/lab/feedback", label: "Feedback" },
  { href: "/lab/portfolio", label: "Portfolio" },
];

/** Section tabs. The active tab is passed in, so no URL read is needed. */
export function LabTabs({ active }: { active: string }) {
  return (
    <nav aria-label="Lab sections" className="flex gap-1 overflow-x-auto border-b">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={cn("-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors", active === t.href ? "border-xen-cyan text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => { setDone(true); setTimeout(() => setDone(false), 1500); },
          () => toast.error("Copy failed"),
        )
      }
    >
      {done ? <Check /> : <Copy />} {done ? "Copied" : label}
    </Button>
  );
}

export function DownloadButton({ text, filename, label = "Download .md" }: { text: string; filename: string; label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      <Download /> {label}
    </Button>
  );
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "xen";

export const field = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
export const area = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
