"use client";

import Link from "next/link";
import { useTransition } from "react";
import { KanbanSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { trackOpportunity } from "@/lib/xen/personal-actions";

/** Adds the opportunity to your applications board as "Interested", or links to it if tracked. */
export function TrackButton({ id, tracked }: { id: string; tracked: boolean }) {
  const [pending, start] = useTransition();
  if (tracked) return <Link href="/applications" className={buttonVariants({ variant: "outline", size: "sm" })}><KanbanSquare /> In applications</Link>;
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => {
      const r = await trackOpportunity(id);
      if (r.ok) toast.success("Added to your applications"); else toast.error(r.error);
    })}>
      {pending ? <Loader2 className="animate-spin" /> : <KanbanSquare />} Track
    </Button>
  );
}
