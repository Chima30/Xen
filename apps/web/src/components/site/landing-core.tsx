"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { createSignals, type CoreSignals } from "@/components/core/particle-sphere";
import { AtmosphericBackground } from "./atmospheric-background";
import { AuroraButton, Container, Eyebrow } from "./primitives";

// WebGL is client-only and loaded after the page is interactive.
const XenIntelligenceCore = dynamic(() => import("@/components/core/xen-intelligence-core").then((m) => m.XenIntelligenceCore), { ssr: false });

const CLUSTER_LABELS = ["Paid testing", "Prediction markets", "Trading platforms", "Emerging protocols", "Bug bounties", "Web3 work"];

/**
 * Hero + "Always discovering". One fixed canvas sits behind both sections; scrolling only
 * changes a few numbers the sphere reads each frame (rise, shift, morph). Native scrolling
 * is untouched: ScrollTrigger observes, it never pins or hijacks.
 */
export function LandingCore({ status }: { status?: React.ReactNode }) {
  const signals = useRef<CoreSignals>(createSignals());
  const stage = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const second = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const set = () => setMobile(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      if (cancelled || !hero.current || !second.current || !stage.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const s = signals.current;
      const triggers = [
        ScrollTrigger.create({
          trigger: hero.current, start: "top top", end: "bottom top", scrub: true,
          onUpdate: (st) => { s.rise = st.progress; },
        }),
        ScrollTrigger.create({
          trigger: second.current, start: "top 85%", end: "center center", scrub: true,
          onUpdate: (st) => { s.morph = st.progress; s.shiftX = mobile ? 0 : st.progress * 0.48; },
        }),
        ScrollTrigger.create({
          trigger: second.current, start: "bottom 70%", end: "bottom top", scrub: true,
          onUpdate: (st) => { if (stage.current) stage.current.style.opacity = String(1 - st.progress); },
        }),
      ];
      cleanup = () => triggers.forEach((t) => t.kill());
    })();
    return () => { cancelled = true; cleanup(); };
  }, [mobile]);

  return (
    <>
      {/* The stage: fixed behind the first two sections, fades out after them. */}
      <div ref={stage} className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-150">
        <AtmosphericBackground />
        <XenIntelligenceCore
          signals={signals}
          className="xen-intro-core absolute inset-0"
          radius={mobile ? 0.6 : 0.75}
          baseY={mobile ? -0.96 : -1.07}
        />
      </div>

      <section ref={hero} id="top" aria-labelledby="hero-title" className="relative z-10 flex min-h-[100svh] flex-col">
        <Container className="flex flex-1 flex-col items-center pt-[20svh] text-center md:pt-[17svh]">
          <Eyebrow className="xen-intro-1 tracking-[0.3em] text-xen-mist">XEN Intelligence</Eyebrow>
          <h1 id="hero-title" className="xen-display mt-6 text-[clamp(2.5rem,4.45vw,4rem)] text-white">
            <span className="xen-intro-2 block">Discover opportunities</span>
            <span className="xen-intro-3 block">before the crowd.</span>
          </h1>
          <p className="xen-intro-4 mt-6 max-w-[52rem] text-[15px] leading-relaxed text-xen-mist/85">
            An intelligence network that finds paid Web3 opportunities, emerging protocols and early-stage platforms for you.
          </p>
          <div className="xen-intro-5 mt-8">
            <AuroraButton href="#live">Explore opportunities</AuroraButton>
          </div>
        </Container>
        <Container className="relative pb-6">
          {status}
        </Container>
      </section>

      <section ref={second} id="intelligence" aria-labelledby="always-title" className="relative z-10 flex min-h-[120svh] items-center py-24">
        <Container>
          <div className="max-w-[38rem] md:max-w-[34rem] lg:max-w-[40rem]">
            <Eyebrow>Always discovering</Eyebrow>
            <h2 id="always-title" className="xen-display mt-5 text-[clamp(2.25rem,4.6vw,3.8rem)] text-white">The next opportunity is already out there.</h2>
            <p className="mt-6 max-w-[30rem] text-base leading-relaxed text-xen-silver">
              XEN continuously monitors emerging protocols, trading platforms and Web3 communities to find opportunities worth your time.
            </p>
            <ul className="mt-10 grid max-w-[26rem] grid-cols-2 gap-x-8 gap-y-3" aria-label="What the network groups">
              {CLUSTER_LABELS.map((l) => (
                <li key={l} className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.12em] text-xen-silver uppercase">
                  <span className="size-1 rounded-full bg-xen-cyan/80" aria-hidden />{l}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>
    </>
  );
}

/** Real system status: the last scheduled run, from the database. No simulated activity. */
export function IntelligenceStatus({ lastScanAt }: { lastScanAt: string | null }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!lastScanAt) return;
    const fmt = () => {
      const mins = Math.max(0, Math.round((Date.now() - new Date(lastScanAt).getTime()) / 60000));
      setLabel(mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`);
    };
    fmt();
    const id = setInterval(fmt, 60000);
    return () => clearInterval(id);
  }, [lastScanAt]);
  if (!lastScanAt) return null;
  return (
    <p className="xen-intro-5 flex items-center justify-center gap-2 text-[11px] tracking-[0.12em] text-xen-silver/80 uppercase md:justify-start">
      <span className="size-1.5 rounded-full bg-xen-cyan" aria-hidden />
      Last network scan <span className="text-xen-mist">{label ?? "—"}</span>
    </p>
  );
}
