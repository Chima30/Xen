"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { day: string; count: number };

const label = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Opportunities discovered per day (Lagos calendar days). Single series: no legend, the
 * section title names it. Thin bars with rounded data ends, recessive axes, hover tooltip.
 */
export function DiscoveryChart({ data }: { data: Point[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <figure>
      <div className="h-40 text-chart-1" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="day" tickFormatter={label} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
                    <p className="text-muted-foreground">{label(String(payload[0]!.payload.day))}</p>
                    <p className="font-mono text-sm text-foreground">{payload[0]!.value} discovered</p>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="count" fill="currentColor" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 text-xs text-muted-foreground">{total} discovered in the last 14 days</figcaption>
      <table className="sr-only">
        <caption>Opportunities discovered per day</caption>
        <thead><tr><th>Day</th><th>Discovered</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.day}><td>{label(d.day)}</td><td>{d.count}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
