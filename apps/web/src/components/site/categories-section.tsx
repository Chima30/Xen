import Link from "next/link";
import { DiagArrow, Container, Eyebrow } from "./primitives";

/** Editorial category index. Every row goes to its real discovery page. */
const CATS = [
  { name: "Paid Product Testing", href: "/discover/paid-testing", note: "Beta and alpha tests, feedback, QA, user research", size: "lg" },
  { name: "Prediction Markets", href: "/discover/prediction-markets", note: "Testing programs and early access", size: "md" },
  { name: "Trading Platforms", href: "/discover/trading-platforms", note: "DEX, perpetual and spot exchanges", size: "md" },
  { name: "Incentivized Testnets", href: "/discover/incentivized-testnets", note: "Testnets with announced or expected incentives", size: "lg" },
  { name: "Bug Bounties", href: "/discover/bug-bounties", note: "Security programs with stated rewards", size: "md" },
  { name: "Web3 Jobs", href: "/discover/jobs-gigs", note: "Development, design, writing and community work", size: "md" },
  { name: "Emerging Protocols", href: "/discover/early-projects", note: "Waitlists, upcoming launches, early projects", size: "lg" },
  { name: "Hackathons and Grants", href: "/discover/hackathons", note: "Prizes, grants and ecosystem programs", size: "md" },
] as const;

export function CategoriesSection({ counts }: { counts: Record<string, number> | null }) {
  return (
    <section aria-labelledby="cats-title" className="relative z-10 bg-xen-abyss py-24 md:py-32">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-20">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <Eyebrow>Opportunity categories</Eyebrow>
            <h2 id="cats-title" className="xen-display mt-5 text-[clamp(2rem,3.6vw,3rem)] text-white">Where XEN looks.</h2>
            <p className="mt-5 text-[15px] leading-relaxed text-xen-silver">Eight areas, each with its own live list. Speculative rewards are always labelled as speculative.</p>
          </div>
          <ul className="border-t border-white/8">
            {CATS.map((c) => {
              const n = counts?.[c.href];
              return (
                <li key={c.href} className="border-b border-white/8">
                  <Link href={c.href} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 py-6 transition-colors duration-300 hover:bg-white/[0.02] focus-visible:outline-none focus-visible:bg-white/[0.03] md:py-7">
                    <div className="min-w-0">
                      <p className={c.size === "lg" ? "text-[clamp(1.75rem,3.4vw,2.6rem)] leading-none font-medium tracking-[-0.04em] text-white" : "text-[clamp(1.5rem,2.6vw,2rem)] leading-none font-medium tracking-[-0.035em] text-white/90"}>
                        {c.name}
                      </p>
                      <p className="mt-2 text-sm text-xen-silver">{c.note}</p>
                    </div>
                    <div className="flex items-center gap-5">
                      {typeof n === "number" && (
                        <span className="text-right">
                          <span className="block font-mono text-lg text-xen-phosphor tabular-nums">{n}</span>
                          <span className="block text-[10px] tracking-[0.12em] text-xen-slate uppercase">active</span>
                        </span>
                      )}
                      <span className="inline-flex size-10 items-center justify-center rounded-[6px] border border-white/10 text-xen-mist transition-colors duration-300 group-hover:border-xen-cyan/40 group-hover:bg-xen-cyan/10">
                        <DiagArrow className="size-3.5" />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </Container>
    </section>
  );
}
