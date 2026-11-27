import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { localDate, type CalendarEvent } from "@xen/core";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader } from "@/components/xen/status";
import { cn } from "@/lib/utils";
import { getCalendar, getMyProfile } from "@/lib/xen/personal-queries";
import { requestNow } from "@/lib/xen/time";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage(props: PageProps<"/calendar">) {
  return (
    <div className="space-y-5">
      <PageHeader title="Calendar" description="Deadlines, follow-ups, tasks, reminders and expected payments" />
      <Suspense fallback={<Skeleton className="h-[36rem]" />}><Month searchParams={props.searchParams} /></Suspense>
    </div>
  );
}

const KIND: Record<CalendarEvent["kind"], { label: string; dot: string }> = {
  deadline: { label: "Deadline", dot: "bg-destructive" },
  follow_up: { label: "Follow-up", dot: "bg-warn" },
  task: { label: "Task", dot: "bg-foreground/70" },
  reminder: { label: "Reminder", dot: "bg-muted-foreground" },
  payment: { label: "Payment expected", dot: "bg-ok" },
  opens: { label: "Opens", dot: "bg-primary" },
};

const shift = (month: string, n: number) => { const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 7); };

async function Month({ searchParams }: { searchParams: PageProps<"/calendar">["searchParams"] }) {
  const sp = await searchParams;
  const [{ timeZone }, now] = await Promise.all([getMyProfile(), requestNow()]);
  const today = localDate(new Date(now), timeZone);
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const { events, from, to } = await getCalendar(month);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  // Weeks start on Monday.
  const first = new Date(`${from}T12:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7;
  const days = Number(to.slice(8));
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const title = first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const upcoming = events.filter((e) => e.date >= (month === today.slice(0, 7) ? today : from) && !e.done);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-medium">{title}</h2>
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon-sm"><Link href={`/calendar?month=${shift(month, -1)}`} aria-label="Previous month"><ChevronLeft /></Link></Button>
          {month !== today.slice(0, 7) && <Button asChild variant="outline" size="sm"><Link href="/calendar">Today</Link></Button>}
          <Button asChild variant="outline" size="icon-sm"><Link href={`/calendar?month=${shift(month, 1)}`} aria-label="Next month"><ChevronRight /></Link></Button>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-md border md:block">
        <div className="grid grid-cols-7 border-b bg-muted/30 text-xs text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border">
          {cells.map((d, i) => {
            const list = d ? byDay.get(d) ?? [] : [];
            return (
              <div key={i} className={cn("min-h-24 bg-card p-1.5", !d && "bg-card/40")}>
                {d && (
                  <>
                    <p className={cn("mb-1 text-xs font-mono", d === today ? "inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground" : "text-muted-foreground")}>{Number(d.slice(8))}</p>
                    <ul className="space-y-0.5">
                      {list.slice(0, 3).map((e, j) => (
                        <li key={j}>
                          <Link href={e.href} title={`${KIND[e.kind].label}: ${e.title}`} className={cn("flex items-center gap-1 truncate rounded px-1 text-2xs hover:bg-muted", e.done && "text-muted-foreground line-through")}>
                            <span className={cn("size-1.5 shrink-0 rounded-full", KIND[e.kind].dot)} aria-hidden />
                            <span className="truncate">{e.title}</span>
                          </Link>
                        </li>
                      ))}
                      {list.length > 3 && <li className="px-1 text-2xs text-muted-foreground">+{list.length - 3} more</li>}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Agenda</h2>
        {upcoming.length === 0 ? (
          <EmptyState title="Nothing scheduled">Deadlines from applications and saved opportunities, task due dates, reminders and expected payments appear here.</EmptyState>
        ) : (
          <ul className="divide-y rounded-md border">
            {upcoming.map((e, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{new Date(`${e.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
                <span className={cn("size-2 shrink-0 rounded-full", KIND[e.kind].dot)} aria-hidden />
                <span className="w-28 shrink-0 text-xs text-muted-foreground">{KIND[e.kind].label}</span>
                <Link href={e.href} className="min-w-0 truncate hover:underline">{e.title}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
