"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Bookmark, ChevronDown, Loader2, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { deleteFilter, saveFilter } from "@/lib/xen/actions";
import { SORTS, type DiscoverFilters } from "@/lib/xen/filters";
import { CAPITAL, REWARD_STATUS, VERIFICATION, categoryLabel } from "@/lib/xen/labels";

const field = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function FilterBar({
  filters, activeCount, facets, savedFilters, lockedCategories,
}: {
  filters: DiscoverFilters;
  activeCount: number;
  facets: { categories: [string, number][]; currencies: string[]; networks: string[] };
  savedFilters: { id: string; name: string; query: string }[];
  /** On a category sub-page the category list is limited to that group. */
  lockedCategories?: readonly string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(activeCount > (filters.q ? 1 : 0));
  const [saveOpen, setSaveOpen] = useState(false);
  const [pending, start] = useTransition();

  const navigate = (qs: URLSearchParams) => start(() => router.push(qs.size ? `${pathname}?${qs}` : pathname, { scroll: false }));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const qs = new URLSearchParams();
    for (const [k, v] of new FormData(e.currentTarget)) {
      const s = String(v).trim();
      if (s && !(k === "sort" && s === "score")) qs.set(k, s);
    }
    navigate(qs);
  }

  const categoryOptions = facets.categories
    .filter(([c]) => !lockedCategories || lockedCategories.includes(c))
    .sort((a, b) => categoryLabel(a[0]).localeCompare(categoryLabel(b[0])));

  return (
    <form onSubmit={onSubmit} className="space-y-3" role="search" aria-label="Filter opportunities">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={filters.q} placeholder="Search titles, projects, descriptions" className="h-8 pl-8" aria-label="Search" />
        </div>
        <select name="sort" defaultValue={filters.sort} className={cn(field, "w-auto")} aria-label="Sort" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="advanced-filters">
          <SlidersHorizontal /> Filters{activeCount > 0 && <span className="rounded bg-primary/15 px-1 font-mono text-[11px] text-primary">{activeCount}</span>}
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm"><Bookmark /> Saved filters</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Saved filters</DropdownMenuLabel>
            {savedFilters.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">None yet. Set filters, then “Save current filters”.</p>}
            {savedFilters.map((f) => (
              <DropdownMenuItem key={f.id} className="justify-between" onSelect={() => navigate(new URLSearchParams(f.query))}>
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete saved filter ${f.name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    start(async () => {
                      const r = await deleteFilter(f.id, pathname);
                      if (r.ok) toast.success(r.message ?? "Deleted"); else toast.error(r.error);
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSaveOpen(true)} disabled={params.size === 0}>Save current filters…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Apply</Button>
        {params.size > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate(new URLSearchParams())}><X /> Reset</Button>
        )}
      </div>

      <div id="advanced-filters" hidden={!open} className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-md border bg-card p-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Category">
          <select name="category" defaultValue={filters.category} className={field}>
            <option value="">All</option>
            {categoryOptions.map(([c, n]) => <option key={c} value={c}>{categoryLabel(c)} ({n})</option>)}
          </select>
        </Field>
        <Field label="Project"><Input name="project" defaultValue={filters.project} className="h-8" placeholder="Any" /></Field>
        <Field label="Reward certainty">
          <select name="rewardStatus" defaultValue={filters.rewardStatus} className={field}>
            <option value="">Any</option>
            {Object.entries(REWARD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Min reward">
          <Input name="minReward" type="number" min={0} step="any" defaultValue={filters.minReward ?? ""} className="h-8" placeholder="Any" />
        </Field>
        <Field label="Currency">
          <select name="currency" defaultValue={filters.currency} className={field}>
            <option value="">Any</option>
            {facets.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Min score">
          <Input name="minScore" type="number" min={0} max={100} defaultValue={filters.minScore ?? ""} className="h-8" placeholder="0" />
        </Field>
        <Field label="Verification">
          <select name="verification" defaultValue={filters.verification} className={field}>
            <option value="">Any</option>
            {Object.entries(VERIFICATION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Capital">
          <select name="capital" defaultValue={filters.capital} className={field}>
            <option value="">Any</option>
            {Object.entries(CAPITAL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Blockchain">
          <select name="network" defaultValue={filters.network} className={field}>
            <option value="">Any</option>
            {facets.networks.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Difficulty">
          <select name="difficulty" defaultValue={filters.difficulty} className={field}>
            <option value="">Any</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </Field>
        <Field label="Max effort (minutes)">
          <Input name="maxMinutes" type="number" min={1} defaultValue={filters.maxMinutes ?? ""} className="h-8" placeholder="Any" />
        </Field>
        <Field label="Deadline">
          <select name="deadline" defaultValue={filters.deadline} className={field}>
            <option value="">Any</option>
            <option value="has">Has a deadline</option>
            <option value="7d">Due within 7 days</option>
            <option value="30d">Due within 30 days</option>
          </select>
        </Field>
        <Field label="Published">
          <select name="published" defaultValue={filters.publishedSince} className={field}>
            <option value="">Any time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </Field>
        <Field label="Discovered">
          <select name="discovered" defaultValue={filters.discoveredSince} className={field}>
            <option value="">Any time</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </Field>
        <label className="col-span-2 flex items-center gap-2 self-end pb-1.5 text-sm sm:col-span-1">
          <input type="checkbox" name="eligible" value="1" defaultChecked={filters.eligibleOnly} className="size-4 accent-primary" />
          Eligible for me (region)
        </label>
        <label className="col-span-2 flex items-center gap-2 self-end pb-1.5 text-sm sm:col-span-1">
          <input type="checkbox" name="inactive" value="1" defaultChecked={filters.includeInactive} className="size-4 accent-primary" />
          Include inactive
        </label>
      </div>

      <SaveFilterDialog open={saveOpen} onOpenChange={setSaveOpen} path={pathname} query={params.toString()} />
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SaveFilterDialog({ open, onOpenChange, path, query }: { open: boolean; onOpenChange: (o: boolean) => void; path: string; query: string }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Save filters</DialogTitle>
          <DialogDescription>Saves the filters currently applied on this page.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="filter-name">Name</Label>
          <Input id="filter-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Zero-capital paid tests" />
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() =>
              start(async () => {
                const r = await saveFilter({ name, path, query });
                if (r.ok) { toast.success(r.message ?? "Saved"); onOpenChange(false); setName(""); }
                else toast.error(r.error);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
