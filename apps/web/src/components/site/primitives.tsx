import Link from "next/link";
import { cn } from "@/lib/utils";

/** Diagonal arrow that slides a few pixels on hover of its group. */
export function DiagArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className={cn("size-3 transition-transform duration-300 ease-xen group-hover:translate-x-0.5 group-hover:-translate-y-0.5", className)} fill="none">
      <path d="M3 9 9 3M4.5 3H9v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The one gradient control: aurora fill, dark text, 6px radius. Used for primary actions only.
 * A soft light-up on hover; no scale, no glow halo.
 */
export function AuroraButton({ href, children, className, size = "md" }: { href: string; children: React.ReactNode; className?: string; size?: "sm" | "md" }) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative inline-flex items-center gap-2 overflow-hidden rounded-[6px] font-medium tracking-[0.1em] text-xen-abyss uppercase",
        "bg-[image:var(--xen-aurora-gradient)] transition-[filter,box-shadow] duration-300 ease-xen hover:brightness-[1.04]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xen-cyan",
        size === "sm" ? "h-9 px-4 text-[11px]" : "h-11 px-5 text-xs",
        className,
      )}
    >
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.35),transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <span className="relative">{children}</span>
      <DiagArrow className="relative" />
    </Link>
  );
}

/** Small square arrow button used on rows and cards. */
export function ArrowSquare({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-white/10 text-xen-mist transition-colors duration-300 ease-xen group-hover:border-xen-cyan/40 group-hover:bg-xen-cyan/10", className)}>
      <DiagArrow />
    </span>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("xen-eyebrow", className)}>{children}</p>;
}

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-12", className)}>{children}</div>;
}
