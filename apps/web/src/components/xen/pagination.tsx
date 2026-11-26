import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Pagination({ page, pageSize, total, basePath, params }: { page: number; pageSize: number; total: number; basePath: string; params: Record<string, string | string[] | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v && k !== "page") qs.set(k, v);
    if (p > 1) qs.set("page", String(p));
    return qs.size ? `${basePath}?${qs}` : basePath;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = (p: number, disabled: boolean, children: React.ReactNode, label: string) =>
    disabled ? (
      <span aria-disabled className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>{children}</span>
    ) : (
      <Link href={href(p)} aria-label={label} className={buttonVariants({ variant: "outline", size: "sm" })}>{children}</Link>
    );

  return (
    <nav className="flex items-center justify-between gap-2 text-sm text-muted-foreground" aria-label="Pagination">
      <span>{total === 0 ? "No results" : `${from}–${to} of ${total}`}</span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          {link(page - 1, page <= 1, <><ChevronLeft /> Previous</>, "Previous page")}
          <span className="font-mono text-xs">{page} / {pages}</span>
          {link(page + 1, page >= pages, <>Next <ChevronRight /></>, "Next page")}
        </div>
      )}
    </nav>
  );
}
