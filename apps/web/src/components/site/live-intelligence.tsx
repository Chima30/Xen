import Link from "next/link";
import { VerifyMark } from "@/components/xen/status";
import { formatDate, formatReward } from "@/lib/xen/format";
import { CAPITAL, categoryLabel, REWARD_STATUS, VERIFICATION } from "@/lib/xen/labels";
import type { PublicOpportunity } from "@/lib/xen/public";
import { ArrowSquare, Container, Eyebrow } from "./primitives";

const host = (u: string) => {
  try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; }
};

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium tracking-[0.12em] text-xen-slate uppercase">{label}</dt>
      <dd className="mt-1 truncate text-[13px] text-xen-mist">{children}</dd>
    </div>
  );
}

export function LiveIntelligence({ items }: { items: PublicOpportunity[] }) {
  return (
    <section id="live" aria-labelledby="live-title" className="relative z-10 bg-xen-abyss py-24 md:py-32">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow>Live intelligence</Eyebrow>
            <h2 id="live-title" className="xen-display mt-5 max-w-[42rem] text-[clamp(2.25rem,4.4vw,3.8rem)] text-white">Information that leads to action.</h2>
          </div>
          <p className="max-w-[24rem] text-sm leading-relaxed text-xen-silver">
            Real opportunities from XEN&apos;s discovery engine, ranked by score. Each one links back to its original source.
          </p>
        </div>

        {items.length === 0 ? (
          <div className="mt-14 rounded-[16px] border border-white/8 bg-xen-kelp/50 px-8 py-16 text-center">
            <p className="text-lg text-white">Nothing to show yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-xen-silver">
              XEN only lists opportunities it has found and checked in real sources. New items appear here after the next scans.
            </p>
          </div>
        ) : (
          <ul className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((o) => {
              const reward = formatReward(o.reward_amount, o.reward_amount_max, o.reward_currency);
              const confirmed = o.reward_status === "confirmed";
              return (
                <li key={o.id}>
                  <article className="group relative flex h-full flex-col rounded-[16px] bg-xen-kelp p-6 transition-colors duration-300 ease-xen hover:bg-[#00403c]">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium tracking-[0.12em] text-xen-silver uppercase">{categoryLabel(o.category)}</p>
                        <h3 className="mt-3 text-[1.375rem] leading-tight font-medium tracking-[-0.02em] text-white">
                          <Link href={`/opportunities/${o.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">{o.title}</Link>
                        </h3>
                        {o.project_name && <p className="mt-1 text-sm text-xen-silver">{o.project_name}</p>}
                      </div>
                      <ArrowSquare />
                    </div>
                    <p className={confirmed ? "mt-6 font-mono text-2xl tracking-tight text-xen-phosphor" : "mt-6 font-mono text-2xl tracking-tight text-xen-mist/80"}>
                      {reward ?? "Reward not stated"}
                    </p>
                    <p className="mt-1 text-xs text-xen-silver">{REWARD_STATUS[o.reward_status]?.label ?? o.reward_status}</p>
                    <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/8 pt-5">
                      <Meta label="Verification">
                        <span className="inline-flex items-center gap-1.5"><VerifyMark status={o.verification} />{VERIFICATION[o.verification]?.label ?? o.verification}</span>
                      </Meta>
                      <Meta label="Capital">{CAPITAL[o.capital]?.label ?? o.capital}</Meta>
                      <Meta label="Discovered">{formatDate(o.discovered_at)}</Meta>
                      <Meta label="Deadline">{o.deadline_at ? formatDate(o.deadline_at) : "None stated"}</Meta>
                    </dl>
                    <a href={o.source_url} target="_blank" rel="noopener noreferrer nofollow" className="relative z-10 mt-5 inline-flex w-fit items-center gap-1 font-mono text-[11px] text-xen-silver hover:text-white">
                      Source · {host(o.source_url)}
                    </a>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </Container>
    </section>
  );
}
