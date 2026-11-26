"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { XenLogo } from "@/components/brand/xen-mark";
import { cn } from "@/lib/utils";
import { AuroraButton, Container } from "./primitives";

const LINKS = [
  { href: "#live", label: "Discover" },
  { href: "#explore", label: "Intelligence" },
  { href: "#how", label: "How it works" },
  { href: "#lab", label: "Testing Lab" },
  { href: "#about", label: "About" },
];

export function XenNavigation() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "xen-intro-nav fixed inset-x-0 top-0 z-50 transition-colors duration-300 ease-xen",
        scrolled || open ? "bg-xen-abyss/92 backdrop-blur-[6px]" : "bg-transparent",
      )}
    >
      <Container className="flex h-[76px] items-center justify-between">
        <Link href="/" aria-label="XEN home" className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-xen-cyan">
          <XenLogo />
        </Link>
        <nav aria-label="Primary" className="absolute left-1/2 hidden -translate-x-1/2 md:block">
          <ul className="flex items-center gap-9">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-[11px] font-medium tracking-[0.12em] text-xen-silver uppercase transition-colors duration-200 hover:text-white focus-visible:text-white focus-visible:outline-none">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <AuroraButton href="/overview" size="sm" className="hidden sm:inline-flex">Launch XEN</AuroraButton>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-[6px] text-xen-mist md:hidden"
            aria-expanded={open}
            aria-controls="xen-mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="relative block h-3 w-5">
              <span className={cn("absolute left-0 h-px w-5 bg-current transition-transform duration-300 ease-xen", open ? "top-1.5 rotate-45" : "top-0")} />
              <span className={cn("absolute left-0 top-1.5 h-px w-5 bg-current transition-opacity duration-200", open && "opacity-0")} />
              <span className={cn("absolute left-0 h-px w-5 bg-current transition-transform duration-300 ease-xen", open ? "top-1.5 -rotate-45" : "top-3")} />
            </span>
          </button>
        </div>
      </Container>
      <div
        id="xen-mobile-menu"
        hidden={!open}
        className="border-t border-white/5 bg-xen-abyss md:hidden"
      >
        <Container className="flex flex-col gap-1 py-4">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="py-2 text-xs font-medium tracking-[0.12em] text-xen-silver uppercase hover:text-white">
              {l.label}
            </a>
          ))}
          <AuroraButton href="/overview" className="mt-3 self-start">Launch XEN</AuroraButton>
        </Container>
      </div>
    </header>
  );
}
