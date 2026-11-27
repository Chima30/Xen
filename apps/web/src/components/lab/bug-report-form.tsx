"use client";

import { useState, useTransition } from "react";
import { ImagePlus, Loader2, ScanSearch, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import type { BugReport, ScreenshotAnalysis } from "@xen/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { analyzeScreenshotsAction, generateBugReportAction, saveBugReport } from "@/lib/xen/lab-actions";
import { CopyButton, DownloadButton } from "./lab-ui";
import { area, slugify } from "./lab-utils";

type Shot = { path: string; name: string; preview: string };

/**
 * Bug report generator. You describe what happened; XEN structures it. Steps, results and
 * environment you leave empty stay marked "Not provided" — the report never fills them in.
 */
export function BugReportForm({ userId }: { userId: string }) {
  const [f, setF] = useState({ project: "", platformUrl: "", device: "", browser: "", os: "", description: "", stepsTaken: "", expected: "", actual: "", links: "" });
  const [shots, setShots] = useState<Shot[]>([]);
  const [analysis, setAnalysis] = useState<ScreenshotAnalysis | null>(null);
  const [keepNotes, setKeepNotes] = useState("");
  const [out, setOut] = useState<{ report: BugReport; markdown: string } | null>(null);
  const [md, setMd] = useState("");
  const [busy, start] = useTransition();
  const [uploading, setUploading] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const input = () => ({
    ...f,
    links: f.links.split(/\s+/).map((l) => l.trim()).filter(Boolean),
    screenshots: shots.map((s) => s.path),
    screenshotNotes: keepNotes,
  });

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const db = createClient();
    try {
      for (const file of Array.from(files).slice(0, 6 - shots.length)) {
        if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { toast.error(`${file.name}: images only (PNG, JPG, WebP, GIF)`); continue; }
        if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: over 10 MB`); continue; }
        const path = `${userId}/lab/${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, ""))}.${file.type.split("/")[1]}`;
        const { error } = await db.storage.from("evidence").upload(path, file, { contentType: file.type, upsert: false });
        if (error) { toast.error(`${file.name}: ${error.message}`); continue; }
        setShots((s) => [...s, { path, name: file.name, preview: URL.createObjectURL(file) }]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function removeShot(s: Shot) {
    await createClient().storage.from("evidence").remove([s.path]);
    setShots((xs) => xs.filter((x) => x.path !== s.path));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await generateBugReportAction(input());
            if (!r.ok) return void toast.error(r.error);
            setOut(r.data);
            setMd(r.data.markdown);
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project"><Input value={f.project} onChange={set("project")} placeholder="e.g. DemoDEX" /></Field>
          <Field label="Platform URL"><Input value={f.platformUrl} onChange={set("platformUrl")} placeholder="https://" inputMode="url" /></Field>
          <Field label="Device"><Input value={f.device} onChange={set("device")} placeholder="e.g. Tecno Spark 20" /></Field>
          <Field label="Browser"><Input value={f.browser} onChange={set("browser")} placeholder="e.g. Chrome 140" /></Field>
          <Field label="Operating system"><Input value={f.os} onChange={set("os")} placeholder="e.g. Android 14" /></Field>
          <Field label="Recordings or links (space-separated)"><Input value={f.links} onChange={set("links")} placeholder="https://…" /></Field>
        </div>
        <Field label="What went wrong" required>
          <textarea className={area} rows={3} value={f.description} onChange={set("description")} placeholder="Describe the problem in your own words" required minLength={10} />
        </Field>
        <Field label="Steps you took"><textarea className={area} rows={4} value={f.stepsTaken} onChange={set("stepsTaken")} placeholder={"1. Opened the swap page\n2. …"} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What you expected"><textarea className={area} rows={2} value={f.expected} onChange={set("expected")} /></Field>
          <Field label="What actually happened"><textarea className={area} rows={2} value={f.actual} onChange={set("actual")} /></Field>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Screenshots</p>
            <div className="flex gap-2">
              <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-[0.8rem] hover:bg-muted">
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />} Add
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="sr-only" onChange={(e) => upload(e.target.files)} disabled={uploading || shots.length >= 6} />
              </label>
              <Button
                type="button" variant="outline" size="sm" disabled={!shots.length || busy}
                onClick={() => start(async () => {
                  const r = await analyzeScreenshotsAction(shots.map((s) => s.path), f.description);
                  if (!r.ok) return void toast.error(r.error);
                  setAnalysis(r.data);
                })}
              >
                <ScanSearch /> Analyze
              </Button>
            </div>
          </div>
          {shots.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {shots.map((s) => (
                <li key={s.path} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                  <img src={s.preview} alt={s.name} className="h-20 w-28 rounded-md border object-cover" />
                  <button type="button" onClick={() => removeShot(s)} aria-label={`Remove ${s.name}`} className="absolute -top-1.5 -right-1.5 rounded-full bg-background p-0.5 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Private to you (stored in your own folder). Analysis lists only what is visible; it never guesses causes.</p>
          )}
          {analysis && (
            <div className="space-y-2 text-sm">
              {analysis.observations.length ? (
                <ul className="space-y-1">
                  {analysis.observations.map((o, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1 size-4 accent-[var(--xen-cyan)]" aria-label="Use this observation"
                        onChange={(e) => setKeepNotes((n) => (e.target.checked ? `${n}\n- ${o.what}${o.where ? ` (${o.where})` : ""}`.trim() : n.replace(`- ${o.what}${o.where ? ` (${o.where})` : ""}`, "").trim()))} />
                      <span>{o.what}{o.where && <span className="text-muted-foreground"> — {o.where}</span>}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-muted-foreground">Nothing notable was visible.</p>}
              {analysis.visibleText.length > 0 && <p className="text-xs text-muted-foreground">Text shown: {analysis.visibleText.map((t) => `“${t}”`).join(", ")}</p>}
              {analysis.unclear && !/^(not provided|none|n\/a)\.?$/i.test(analysis.unclear.trim()) && <p className="text-xs text-warn">{analysis.unclear}</p>}
              <p className="text-xs text-muted-foreground">Tick the observations you confirm; only those go into the report.</p>
            </div>
          )}
        </div>

        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate report</Button>
      </form>

      <section aria-label="Generated report" className="space-y-3">
        {!out ? (
          <div className="rounded-md border border-dashed p-8 text-sm text-muted-foreground">
            The structured report appears here. You can edit it before copying, downloading or saving.
          </div>
        ) : (
          <>
            {out.report.missing.length > 0 && (
              <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
                Not provided: {out.report.missing.join(", ")}. Teams often reject reports without these — add them if you can.
              </p>
            )}
            <textarea className={`${area} font-mono text-xs leading-relaxed`} rows={24} value={md} onChange={(e) => setMd(e.target.value)} aria-label="Report (Markdown)" />
            <div className="flex flex-wrap gap-2">
              <CopyButton text={md} />
              <DownloadButton text={md} filename={`${slugify(out.report.title)}.md`} />
              <Button
                type="button" size="sm" disabled={busy}
                onClick={() => start(async () => {
                  const r = await saveBugReport({ input: input(), report: out.report, markdown: md });
                  if (r.ok) toast.success("Saved to your reports"); else toast.error(r.error);
                })}
              >
                Save
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    // Wrapping label: the control is associated with its text without ids.
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}{required && <span className="font-normal text-muted-foreground"> (required)</span>}</span>
      {children}
    </label>
  );
}
