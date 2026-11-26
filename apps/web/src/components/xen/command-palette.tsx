"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Compass, FileText, Loader2 } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { paletteSearch } from "@/lib/xen/actions";
import { categoryLabel } from "@/lib/xen/labels";
import { NAV } from "./nav";

type Hit = Awaited<ReturnType<typeof paletteSearch>>[number];

/** Ctrl/Cmd+K: jump to any page, or search opportunities by title or project. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) return;
    const id = setTimeout(() => startTransition(async () => setHits(await paletteSearch(t))), 200);
    return () => clearTimeout(id);
  }, [term]);

  const pages = useMemo(() => {
    const t = term.trim().toLowerCase();
    const all = NAV.flatMap((g) => g.items);
    return t ? all.filter((i) => `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(t)) : all;
  }, [term]);

  const go = (href: string) => {
    onOpenChange(false);
    setTerm("");
    setHits([]);
    router.push(href);
  };

  const t = term.trim();
  const results = t.length >= 2 ? hits : [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search XEN" description="Jump to a page or search opportunities">
      <Command shouldFilter={false}>
        <CommandInput value={term} onValueChange={setTerm} placeholder="Search opportunities or pages…" />
        <CommandList>
          <CommandEmpty>{pending ? "Searching…" : "No matches."}</CommandEmpty>
          {t.length >= 2 && (
            <CommandGroup heading={pending ? "Opportunities (searching…)" : "Opportunities"}>
              {results.map((h) => (
                <CommandItem key={h.id} value={`opp-${h.id}`} onSelect={() => go(`/opportunities/${h.id}`)}>
                  <FileText />
                  <span className="truncate">{h.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{h.project_name ?? categoryLabel(h.category)}</span>
                </CommandItem>
              ))}
              {t && (
                <CommandItem value="search-all" onSelect={() => go(`/discover?q=${encodeURIComponent(t)}`)}>
                  {pending ? <Loader2 className="animate-spin" /> : <Compass />}
                  <span>Search all opportunities for “{t}”</span>
                </CommandItem>
              )}
            </CommandGroup>
          )}
          {pages.length > 0 && (
            <CommandGroup heading="Pages">
              {pages.map((p) => (
                <CommandItem key={p.href} value={`page-${p.href}`} onSelect={() => go(p.href)}>
                  <p.icon />
                  <span>{p.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
