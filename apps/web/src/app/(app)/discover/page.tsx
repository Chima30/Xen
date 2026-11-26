import type { Metadata } from "next";
import { DiscoverView } from "@/components/xen/discover-view";

export const metadata: Metadata = { title: "Discover" };

export default function DiscoverPage({ searchParams }: PageProps<"/discover">) {
  return (
    <DiscoverView
      title="Discover"
      description="Every active opportunity XEN has found, ranked by score. Filter, search and save views."
      basePath="/discover"
      searchParams={searchParams}
    />
  );
}
