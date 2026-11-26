"use client";

import { useOptimistic, useTransition } from "react";
import { Bookmark, BookmarkCheck, CheckCircle2, EyeOff, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { markApplied, setHidden, setSaved, type ActionResult } from "@/lib/xen/actions";

function report(r: ActionResult) {
  if (r.ok) toast.success(r.message ?? "Done");
  else toast.error(r.error);
}

export function SaveButton({ id, saved, variant = "icon" }: { id: string; saved: boolean; variant?: "icon" | "full" }) {
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [pending, start] = useTransition();
  const onClick = () =>
    start(async () => {
      setOptimistic(!optimistic);
      report(await setSaved(id, !optimistic));
    });
  const Icon = optimistic ? BookmarkCheck : Bookmark;
  if (variant === "full") {
    return (
      <Button variant={optimistic ? "secondary" : "outline"} size="sm" onClick={onClick} disabled={pending} aria-pressed={optimistic}>
        <Icon className={optimistic ? "text-primary" : undefined} /> {optimistic ? "Saved" : "Save"}
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} disabled={pending} aria-pressed={optimistic} aria-label={optimistic ? "Remove from saved" : "Save"}>
          <Icon className={optimistic ? "text-primary" : undefined} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{optimistic ? "Remove from saved" : "Save"}</TooltipContent>
    </Tooltip>
  );
}

export function HideButton({ id, hidden }: { id: string; hidden: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => report(await setHidden(id, !hidden)))}>
      {pending ? <Loader2 className="animate-spin" /> : hidden ? <Eye /> : <EyeOff />}
      {hidden ? "Show again" : "Not interested"}
    </Button>
  );
}

export function AppliedButton({ id, status }: { id: string; status: string | null }) {
  const [pending, start] = useTransition();
  const applied = status !== null && status !== "saved" && status !== "interested" && status !== "discovered";
  return (
    <Button variant="outline" size="sm" disabled={pending || applied} onClick={() => start(async () => report(await markApplied(id)))}>
      {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 className={applied ? "text-ok" : undefined} />}
      {applied ? `Applied (${status!.replaceAll("_", " ")})` : "Mark as applied"}
    </Button>
  );
}
