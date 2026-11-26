"use client";

import { useEffect, useRef, useState } from "react";

/** Counts up to a real value once, when it enters the viewport. Reduced motion shows it at once. */
export function MetricCounter({ value, label }: { value: number; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; } // eslint-disable-line react-hooks/set-state-in-effect
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const dur = 1200;
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / dur);
        setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(node);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value]);

  return (
    <div ref={el}>
      <p className="xen-display text-[clamp(3rem,6vw,5.375rem)] text-xen-phosphor tabular-nums" aria-label={`${value} ${label}`}>
        <span aria-hidden>{shown.toLocaleString("en-US")}</span>
      </p>
      <p className="mt-3 text-[11px] font-medium tracking-[0.14em] text-xen-silver uppercase">{label}</p>
    </div>
  );
}
