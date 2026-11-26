"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Container, Eyebrow } from "./primitives";

const STAGES = [
  { name: "Discover", body: "Searches accessible websites, announcements, public APIs and community sources." },
  { name: "Analyze", body: "Extracts rewards, requirements, deadlines and participation instructions." },
  { name: "Verify", body: "Checks original sources, reward evidence and credibility." },
  { name: "Rank", body: "Prioritizes opportunities according to relevance and eligibility." },
  { name: "Notify", body: "Delivers actionable opportunities directly to the dashboard and Telegram." },
];

/**
 * The pipeline as a stream of light through five nodes. Stages light up progressively as the
 * section scrolls through the viewport (observed, not pinned).
 */
export function HowItWorks() {
  const section = useRef<HTMLElement>(null);
  const [lit, setLit] = useState(0);

  useEffect(() => {
    let kill = () => {};
    let cancelled = false;
    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      if (cancelled || !section.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const t = ScrollTrigger.create({
        trigger: section.current, start: "top 70%", end: "bottom 60%",
        onUpdate: (st) => setLit(Math.min(STAGES.length, Math.floor(st.progress * (STAGES.length + 0.6)) + 1)),
        onLeaveBack: () => setLit(0),
      });
      kill = () => t.kill();
    })();
    return () => { cancelled = true; kill(); };
  }, []);

  return (
    <section ref={section} id="how" aria-labelledby="how-title" className="relative z-10 bg-xen-deep py-24 md:py-32">
      <Container>
        <Eyebrow>How XEN works</Eyebrow>
        <h2 id="how-title" className="xen-display mt-5 max-w-[44rem] text-[clamp(2.25rem,4.4vw,3.8rem)] text-white">From a public signal to an action you can take.</h2>

        <div className="relative mt-20">
          {/* Stream line with travelling particles (desktop) */}
          <div aria-hidden className="absolute top-[11px] right-[10%] left-[10%] hidden h-px md:block">
            <div className="absolute inset-0 bg-white/10" />
            <div className="absolute inset-y-0 left-0 bg-[image:var(--xen-liquid-gradient)] transition-[width] duration-700 ease-xen" style={{ width: `${Math.max(0, (lit - 1) / (STAGES.length - 1)) * 100}%` }} />
            {lit > 0 && Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="xen-stream absolute -top-[2px] size-[5px] rounded-full bg-xen-cyan" style={{ animationDelay: `${i * 0.7}s` }} />
            ))}
          </div>
          <ol className="grid gap-10 md:grid-cols-5 md:gap-6">
            {STAGES.map((s, i) => {
              const on = i < lit;
              return (
                <li key={s.name} className="relative flex gap-5 md:flex-col md:items-center md:text-center">
                  <span aria-hidden className={cn("relative z-10 mt-0.5 flex size-[23px] shrink-0 items-center justify-center rounded-full border transition-colors duration-500 ease-xen", on ? "border-xen-cyan bg-xen-abyss" : "border-white/15 bg-xen-deep")}>
                    <span className={cn("size-2 rounded-full transition-colors duration-500", on ? "bg-xen-phosphor" : "bg-white/15")} />
                  </span>
                  <div>
                    <p className="text-[10px] font-medium tracking-[0.14em] text-xen-slate uppercase">Stage {i + 1}</p>
                    <h3 className={cn("mt-2 text-2xl font-medium tracking-[-0.03em] transition-colors duration-500", on ? "text-white" : "text-white/45")}>{s.name}</h3>
                    <p className={cn("mt-2 text-sm leading-relaxed transition-colors duration-500 md:mx-auto md:max-w-[14rem]", on ? "text-xen-silver" : "text-xen-silver/50")}>{s.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </Container>
      <style>{`
        .xen-stream { left: 0; animation: xen-stream 4.2s linear infinite; opacity: 0; }
        @keyframes xen-stream { 0% { left: 0; opacity: 0 } 8% { opacity: .9 } 92% { opacity: .9 } 100% { left: 100%; opacity: 0 } }
      `}</style>
    </section>
  );
}
