"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ParticleSphere, type CoreSignals } from "./particle-sphere";

type Quality = "hero" | "compact";

/** Starting particle budget from the device, before any measurement. */
function initialCount(quality: Quality) {
  if (quality === "compact") return 3500;
  const w = window.innerWidth;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (w < 768) return 9000;
  if (cores <= 4 || mem <= 4) return 22000;
  return cores >= 8 ? 52000 : 36000;
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Measures real frame time and asks for fewer particles once if the device struggles. */
function FrameBudget({ onSlow }: { onSlow: () => void }) {
  const acc = useRef({ t: 0, n: 0, done: false });
  useFrame((_, delta) => {
    const a = acc.current;
    if (a.done) return;
    a.t += delta; a.n += 1;
    if (a.t > 2.5) {
      const avgMs = (a.t / a.n) * 1000;
      a.done = true;
      if (avgMs > 22) onSlow(); // under ~45 fps
    }
  });
  return null;
}

/**
 * The XEN Intelligence Core: a GPU particle sphere. Decorative, so it is aria-hidden and
 * never takes pointer events; the cursor is read from window events instead.
 */
export function XenIntelligenceCore({ signals, quality = "hero", className, baseY, radius }: {
  signals: React.RefObject<CoreSignals>;
  quality?: Quality;
  className?: string;
  baseY?: number;
  radius?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState<number | null>(null);
  const [supported, setSupported] = useState(true);
  const [visible, setVisible] = useState(true);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const ok = webglAvailable();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Client-only capability checks; set once after mount.
    setSupported(ok); // eslint-disable-line react-hooks/set-state-in-effect
    setStill(reduce);
    setCount(initialCount(quality));
  }, [quality]);

  // Render only while on screen and while the tab is visible.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let onScreen = true;
    const update = () => setVisible(onScreen && document.visibilityState === "visible");
    const io = new IntersectionObserver(([e]) => { onScreen = !!e?.isIntersecting; update(); }, { rootMargin: "120px" });
    io.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);

  // Cursor relative to the canvas, damped inside the sphere component.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = wrap.current;
      const s = signals.current;
      if (!el || !s) return;
      const r = el.getBoundingClientRect();
      const inside = e.clientY >= r.top - 80 && e.clientY <= r.bottom;
      s.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      s.pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      s.pointer.active = inside;
    };
    const onLeave = () => { if (signals.current) signals.current.pointer.active = false; };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => { window.removeEventListener("pointermove", onMove); document.removeEventListener("pointerleave", onLeave); };
  }, [signals]);

  return (
    <div ref={wrap} aria-hidden className={cn("pointer-events-none select-none", className)}>
      {!supported ? (
        // Lightweight fallback when WebGL is unavailable: a soft lit horizon, no motion.
        <div className="h-full w-full bg-[radial-gradient(60%_55%_at_55%_100%,rgb(203_255_252/0.22),rgb(0_130_124/0.12)_45%,transparent_75%)]" />
      ) : count !== null ? (
        <Canvas
          frameloop={visible ? (still ? "demand" : "always") : "never"}
          dpr={quality === "compact" ? [1, 1.5] : [1, 1.75]}
          camera={{ position: [0, 0, 3.4], fov: 38, near: 0.1, far: 20 }}
          gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
          style={{ pointerEvents: "none" }}
        >
          <ParticleSphere key={count} count={count} signals={signals} still={still} baseY={baseY} radius={radius} />
          {!still && <FrameBudget onSlow={() => setCount((c) => (c && c > 6000 ? Math.round(c * 0.55) : c))} />}
        </Canvas>
      ) : null}
    </div>
  );
}
