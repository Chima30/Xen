/**
 * Layered deep-teal atmosphere: near-black teal, a concentrated cyan light low on the right,
 * a soft ambient glow behind the sphere and very fine grain. The light breathes slowly.
 */
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.93 0 0 0 0 1 0 0 0 0 0.99 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

export function AtmosphericBackground({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-[#012624]" />
      <div className="absolute inset-0 bg-[radial-gradient(75%_65%_at_50%_55%,rgb(0_110_104/0.55),transparent_75%)]" />
      <div className="xen-breathe absolute inset-0 bg-[radial-gradient(20%_24%_at_77%_74%,rgb(0_160_152/0.6),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(34%_30%_at_60%_80%,rgb(0_130_124/0.28),transparent_72%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_55%,rgb(1_29_28/0.85)_100%)]" />
      <div className="absolute inset-0 opacity-[0.05] mix-blend-soft-light" style={{ backgroundImage: GRAIN }} />
      <style>{`
        .xen-breathe { animation: xen-breathe 14s ease-in-out infinite; }
        @keyframes xen-breathe { 0%,100% { opacity: .85 } 50% { opacity: 1 } }
      `}</style>
    </div>
  );
}
