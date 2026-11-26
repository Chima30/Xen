import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DiscoverView, ListSkeleton } from "@/components/xen/discover-view";
import { GROUPS, isGroupSlug } from "@/lib/xen/labels";

export function generateStaticParams() {
  return Object.keys(GROUPS).map((group) => ({ group }));
}

export async function generateMetadata({ params }: PageProps<"/discover/[group]">): Promise<Metadata> {
  const { group } = await params;
  return { title: isGroupSlug(group) ? GROUPS[group].label : "Discover" };
}

export default function GroupPage({ params, searchParams }: PageProps<"/discover/[group]">) {
  // Reading params happens behind Suspense so navigation between groups stays instant.
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Group params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Group({ params, searchParams }: Pick<PageProps<"/discover/[group]">, "params" | "searchParams">) {
  const { group } = await params;
  if (!isGroupSlug(group)) notFound();
  const g = GROUPS[group];
  return <DiscoverView title={g.label} description={g.description} basePath={`/discover/${group}`} categories={g.categories} searchParams={searchParams} />;
}
