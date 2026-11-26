import { cn } from "@/lib/utils";

/**
 * XEN symbol: four signal paths arriving from the corners and converging on one node.
 * Each path bends slightly before it meets the centre, like a trajectory being pulled in,
 * so together they read as an X made of incoming information. Original mark.
 */
export function XenSymbol({ className, title = "XEN", accent = false }: { className?: string; title?: string; accent?: boolean }) {
  const id = accent ? "xen-sym-aurora" : undefined;
  return (
    <svg viewBox="0 0 32 32" className={cn("size-6", className)} role="img" aria-label={title} fill="none">
      {accent && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#cbfffc" />
            <stop offset="0.48" stopColor="#fffdfa" />
            <stop offset="0.9" stopColor="#fad1ff" />
          </linearGradient>
        </defs>
      )}
      <g stroke={accent ? `url(#${id})` : "currentColor"} strokeWidth="2" strokeLinecap="round">
        <path d="M5 5 C 10 8, 12 11, 14.6 14.6" />
        <path d="M27 5 C 24 10, 21 12, 17.4 14.6" />
        <path d="M27 27 C 22 24, 20 21, 17.4 17.4" />
        <path d="M5 27 C 8 22, 11 20, 14.6 17.4" />
      </g>
      <g fill="currentColor">
        <circle cx="5" cy="5" r="1.6" />
        <circle cx="27" cy="5" r="1.6" />
        <circle cx="27" cy="27" r="1.6" />
        <circle cx="5" cy="27" r="1.6" />
        <circle cx="16" cy="16" r="2.4" fill={accent ? "#fde9ff" : "currentColor"} />
      </g>
    </svg>
  );
}

/** Horizontal logo: symbol + wordmark. The wordmark is set, not drawn, in the brand face. */
export function XenLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-xen-mist", className)}>
      <XenSymbol className="size-[1.375rem]" title="" />
      {!compact && <span className="text-[0.9375rem] font-medium tracking-[0.18em]">XEN</span>}
      <span className="sr-only">XEN</span>
    </span>
  );
}

/** Loading indicator built from the symbol: the four paths draw in toward the centre. */
export function XenLoader({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn("inline-flex", className)}>
      <svg viewBox="0 0 32 32" className="size-6 text-xen-cyan" fill="none" aria-hidden>
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="xen-loader-paths">
          <path d="M5 5 C 10 8, 12 11, 14.6 14.6" pathLength={1} />
          <path d="M27 5 C 24 10, 21 12, 17.4 14.6" pathLength={1} />
          <path d="M27 27 C 22 24, 20 21, 17.4 17.4" pathLength={1} />
          <path d="M5 27 C 8 22, 11 20, 14.6 17.4" pathLength={1} />
        </g>
        <circle cx="16" cy="16" r="2.4" fill="#fde9ff" className="xen-loader-core" />
      </svg>
      <style>{`
        .xen-loader-paths path { stroke-dasharray: 1; animation: xen-draw 1.4s var(--xen-ease) infinite; }
        .xen-loader-paths path:nth-child(2) { animation-delay: .12s } .xen-loader-paths path:nth-child(3) { animation-delay: .24s } .xen-loader-paths path:nth-child(4) { animation-delay: .36s }
        .xen-loader-core { animation: xen-core 1.4s var(--xen-ease) infinite; transform-origin: 16px 16px; }
        @keyframes xen-draw { 0% { stroke-dashoffset: 1; opacity: .3 } 50% { stroke-dashoffset: 0; opacity: 1 } 100% { stroke-dashoffset: -1; opacity: .3 } }
        @keyframes xen-core { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
      `}</style>
    </span>
  );
}
