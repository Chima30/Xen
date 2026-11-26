"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { isActiveExact, NAV } from "./nav";
import { ThemeToggle } from "./theme-toggle";

const STORAGE_KEY = "xen.sidebar.collapsed";

export function AppShell({ children, userMenu }: { children: React.ReactNode; userMenu: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      // Restore a per-browser preference after hydration.
      if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {}
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(STORAGE_KEY, c ? "0" : "1"); } catch {}
      return !c;
    });
  };

  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex",
          collapsed ? "w-14" : "w-60",
        )}
      >
        <div className={cn("flex h-12 items-center border-b", collapsed ? "justify-center" : "justify-between px-3")}>
          {!collapsed && <Brand />}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
                {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "Expand" : "Collapse"}</TooltipContent>
          </Tooltip>
        </div>
        <CurrentNav collapsed={collapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-5">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SheetHeader className="h-12 justify-center border-b px-3">
                <SheetTitle asChild><div><Brand /></div></SheetTitle>
              </SheetHeader>
              <CurrentNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="md:hidden"><Brand compact /></div>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search or jump to (Ctrl+K)"
            className="ml-auto flex h-8 min-w-0 items-center gap-2 rounded-md border bg-card px-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:w-full sm:max-w-72 sm:px-2.5 md:ml-0"
          >
            <Search className="size-4 shrink-0" />
            <span className="hidden truncate sm:inline">Search or jump to…</span>
            <kbd className="ml-auto hidden rounded border bg-muted px-1 font-mono text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <div className="flex shrink-0 items-center gap-1 md:ml-auto">
            <ThemeToggle />
            {userMenu}
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-6">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-baseline gap-2 rounded-sm outline-offset-2">
      <span className="font-mono text-sm font-semibold tracking-tight text-primary">XEN</span>
      {!compact && <span className="text-xs text-muted-foreground">Opportunity intelligence</span>}
    </Link>
  );
}

/** The URL is request data, so the active-item highlight streams in behind Suspense. */
function CurrentNav(props: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavList pathname={null} {...props} />}>
      <NavWithPath {...props} />
    </Suspense>
  );
}

function NavWithPath(props: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return <NavList pathname={pathname} {...props} />;
}

function NavList({ pathname, collapsed, onNavigate }: { pathname: string | null; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
      {NAV.map((g) => (
        <div key={g.label} className="mb-3">
          {!collapsed && <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">{g.label}</p>}
          <ul className="space-y-px">
            {g.items.map((item) => {
              const active = pathname !== null && isActiveExact(pathname, item.href);
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
                    collapsed && "justify-center px-0",
                    active ? "bg-sidebar-accent font-medium text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <item.icon className={cn("size-4 shrink-0", active && "text-primary")} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : link}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
