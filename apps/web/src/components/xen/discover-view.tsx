import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { activeFilterCount, PAGE_SIZE, parseFilters } from "@/lib/xen/filters";
import { getFacets, getSavedFilters, listOpportunities } from "@/lib/xen/queries";
import { FilterBar } from "./filter-bar";
import { OpportunityTable } from "./opportunity-table";
import { Pagination } from "./pagination";
import { EmptyState, PageHeader } from "./status";
import { requestNow } from "@/lib/xen/time";

type SP = Record<string, string | string[] | undefined>;

export function DiscoverView({ title, description, basePath, categories, searchParams }: {
  title: string;
  description: string;
  basePath: string;
  categories?: readonly string[];
  searchParams: Promise<SP>;
}) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} description={description} />
      <Suspense fallback={<ListSkeleton />}>
        <Results basePath={basePath} categories={categories} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ basePath, categories, searchParams }: { basePath: string; categories?: readonly string[]; searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const now = await requestNow();
  const filters = parseFilters(sp);
  const [list, facets, saved] = await Promise.all([listOpportunities(filters, categories), getFacets(), getSavedFilters(basePath)]);
  const active = activeFilterCount(filters);
  const qsKey = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();

  return (
    <div className="space-y-3">
      <FilterBar
        key={qsKey}
        filters={filters}
        activeCount={active}
        facets={{ categories: [...facets.categories.entries()], currencies: facets.currencies, networks: facets.networks }}
        savedFilters={saved}
        lockedCategories={categories}
      />
      {list.error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">Could not load opportunities: {list.error}</p>}
      {list.rows.length > 0 ? (
        <>
          <OpportunityTable rows={list.rows} saved={list.saved} now={now} />
          <Pagination page={filters.page} pageSize={PAGE_SIZE} total={list.total} basePath={basePath} params={sp} />
        </>
      ) : !list.error ? (
        <EmptyState title={active ? "No opportunities match these filters" : "Nothing discovered here yet"}>
          {active
            ? "Try removing a filter or widening the date range."
            : "XEN checks its sources every 15 minutes and only stores opportunities it can extract from real sources. New items appear here as they are found."}
        </EmptyState>
      ) : null}
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <div className="flex gap-2"><Skeleton className="h-8 flex-1" /><Skeleton className="h-8 w-32" /><Skeleton className="h-8 w-24" /></div>
      <div className="divide-y rounded-md border">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-6 w-9" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
