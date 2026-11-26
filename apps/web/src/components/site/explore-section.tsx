"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowSquare, Container, Eyebrow } from "./primitives";

const FEATURES = [
  { key: "radar", label: "Discovery", title: "XEN Radar", body: "Continuously searches for paid testing, Web3 jobs and emerging opportunities.", href: "/discover" },
  { key: "early", label: "Early intelligence", title: "XEN Early", body: "Discovers upcoming protocols and trading platforms before their public launches.", href: "/discover/early-projects" },
  { key: "verify", label: "Verification", title: "XEN Verify", body: "Examines reward evidence, eligibility and project credibility.", href: "/discover?verification=verified_announcement" },
  { key: "scout", label: "Research", title: "XEN Scout", body: "Researches projects and opportunities through natural-language requests.", href: "/overview" },
  { key: "watch", label: "Monitoring", title: "XEN Watch", body: "Monitors selected projects and alerts users when important changes occur.", href: "/sources" },
] as const;
type Key = (typeof FEATURES)[number]["key"];

/**
 * Deterministic node network: five groups around a hub. Hovering a feature row lights its group.
 * Hand-placed coordinates keep it stable across renders.
 */
const GROUPS: Record<Key, { x: number; y: number }[]> = {
  radar: [{ x: 90, y: 90 }, { x: 150, y: 60 }, { x: 70, y: 170 }, { x: 160, y: 140 }],
  early: [{ x: 420, y: 70 }, { x: 360, y: 120 }, { x: 470, y: 150 }, { x: 400, y: 40 }],
  verify: [{ x: 460, y: 330 }, { x: 400, y: 390 }, { x: 500, y: 410 }, { x: 380, y: 310 }],
  scout: [{ x: 110, y: 380 }, { x: 60, y: 320 }, { x: 170, y: 420 }, { x: 150, y: 330 }],
  watch: [{ x: 270, y: 470 }, { x: 220, y: 500 }, { x: 330, y: 505 }, { x: 290, y: 430 }],
};
const HUB = { x: 270, y: 260 };

function NetworkVisualization({ active }: { active: Key | null }) {
  return (
    <svg viewBox="0 0 540 540" className="h-auto w-full" aria-hidden>
      <defs>
        <radialGradient id="hubglow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#cbfffc" stopOpacity="0.5" />
          <stop offset="1" stopColor="#cbfffc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={HUB.x} cy={HUB.y} r="70" fill="url(#hubglow)" opacity={active ? 0.9 : 0.5} className="transition-opacity duration-500" />
      {(Object.keys(GROUPS) as Key[]).map((k) => {
        const on = active === k;
        const dim = active !== null && !on;
        const nodes = GROUPS[k];
        const first = nodes[0]!;
        return (
          <g key={k} className="transition-opacity duration-500 ease-xen" opacity={dim ? 0.25 : 1}>
            <path d={`M${HUB.x} ${HUB.y} Q ${(HUB.x + first.x) / 2 + 20} ${(HUB.y + first.y) / 2 - 20} ${first.x} ${first.y}`} stroke={on ? "#cbfffc" : "#00827c"} strokeWidth={on ? 1.4 : 1} fill="none" strokeDasharray={on ? "none" : "2 5"} className="transition-[stroke] duration-500" />
            {nodes.slice(1).map((n, i) => (
              <line key={i} x1={first.x} y1={first.y} x2={n.x} y2={n.y} stroke={on ? "#cbfffc" : "#bbc7c6"} strokeOpacity={on ? 0.7 : 0.22} strokeWidth="1" />
            ))}
            {nodes.map((n, i) => (
              <circle key={i} cx={n.x} cy={n.y} r={i === 0 ? 5 : 3} fill={on ? (i === 0 ? "#fde9ff" : "#cbfffc") : i === 0 ? "#edfffe" : "#00827c"} className="transition-[fill] duration-500" />
            ))}
            {on && <circle cx={first.x} cy={first.y} r="14" fill="none" stroke="#cbfffc" strokeOpacity="0.4" className="xen-node-ring" />}
          </g>
        );
      })}
      <circle cx={HUB.x} cy={HUB.y} r="7" fill="#fde9ff" />
      <style>{`.xen-node-ring{transform-box:fill-box;transform-origin:center;animation:xen-ring 1.8s var(--xen-ease) infinite}@keyframes xen-ring{0%{opacity:.6;transform:scale(.6)}100%{opacity:0;transform:scale(1.6)}}`}</style>
    </svg>
  );
}

export function ExploreSection() {
  const [active, setActive] = useState<Key | null>(null);
  return (
    <section id="explore" aria-labelledby="explore-title" className="relative z-10 bg-xen-abyss py-24 md:py-32">
      <Container>
        <Eyebrow>Explore XEN</Eyebrow>
        <h2 id="explore-title" className="xen-display mt-5 max-w-[48rem] text-[clamp(2.25rem,4.4vw,3.8rem)] text-white">An intelligence system built around opportunity.</h2>
        <div className="mt-16 grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
          <ul className="divide-y divide-white/8 border-y border-white/8">
            {FEATURES.map((f) => (
              <li key={f.key}>
                <Link
                  href={f.href}
                  onMouseEnter={() => setActive(f.key)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(f.key)}
                  onBlur={() => setActive(null)}
                  className={cn("group flex items-start gap-6 py-7 transition-colors duration-300 focus-visible:outline-none", active === f.key ? "text-white" : "text-white/90")}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium tracking-[0.14em] text-xen-silver uppercase">{f.label}</p>
                    <h3 className="mt-2 text-[1.75rem] leading-tight font-medium tracking-[-0.03em]">{f.title}</h3>
                    <p className="mt-2 max-w-[28rem] text-[15px] leading-relaxed text-xen-silver">{f.body}</p>
                  </div>
                  <ArrowSquare className="mt-1" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mx-auto w-full max-w-[34rem]">
            <NetworkVisualization active={active} />
          </div>
        </div>
      </Container>
    </section>
  );
}
