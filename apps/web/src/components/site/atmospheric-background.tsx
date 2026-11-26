/**
 * Layered deep-teal atmosphere: near-black teal, a concentrated cyan light low on the right,
 * a soft ambient glow behind the sphere and very fine grain. The light breathes slowly.
 */
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.93 0 0 0 0 1 0 0 0 0 0.99 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

export function AtmosphericBackground({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#011d1c_0%,#012624_38%,#012624_100%)]" />
      <div className="xen-breathe absolute inset-0 bg-[radial-gradient(55%_45%_at_82%_92%,rgb(0_130_124/0.42),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(48%_38%_at_50%_104%,rgb(203_255_252/0.13),transparent_72%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(40%_30%_at_12%_18%,rgb(0_55_52/0.55),transparent_70%)]" />
      <div className="absolute inset-0 opacity-[0.05] mix-blend-soft-light" style={{ backgroundImage: GRAIN }} />
      <style>{`
        .xen-breathe { animation: xen-breathe 14s ease-in-out infinite; }
        @keyframes xen-breathe { 0%,100% { opacity: .85 } 50% { opacity: 1 } }
      `}</style>
    </div>
  );
}
