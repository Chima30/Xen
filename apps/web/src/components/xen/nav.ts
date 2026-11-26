import {
  Activity, Binoculars, Bookmark, Bug, Building2, CandlestickChart, Code2, Compass, Eye, FlaskConical, Gauge, Landmark, Network, Radar,
  Settings, Sprout, Trophy, Vote, type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; keywords?: string };
export type NavGroup = { label: string; items: NavItem[] };

/** Only pages that exist. Later phases add Lab, Tasks, Applications, Calendar, Earnings, etc. */
export const NAV: NavGroup[] = [
  {
    label: "Intelligence",
    items: [
      { href: "/overview", label: "Overview", icon: Gauge, keywords: "home dashboard" },
      { href: "/discover", label: "Discover", icon: Compass, keywords: "all opportunities search filter" },
    ],
  },
  {
    label: "Opportunities",
    items: [
      { href: "/discover/paid-testing", label: "Paid Testing", icon: FlaskConical, keywords: "beta alpha feedback qa usability" },
      { href: "/discover/prediction-markets", label: "Prediction Markets", icon: Vote },
      { href: "/discover/trading-platforms", label: "Trading Platforms", icon: CandlestickChart, keywords: "dex perp spot" },
      { href: "/discover/incentivized-testnets", label: "Incentivized Testnets", icon: Network },
      { href: "/discover/early-projects", label: "Early Projects", icon: Sprout, keywords: "waitlist launch" },
      { href: "/discover/bug-bounties", label: "Bug Bounties", icon: Bug, keywords: "security" },
      { href: "/discover/hackathons", label: "Hackathons", icon: Trophy },
      { href: "/discover/jobs-gigs", label: "Jobs and Gigs", icon: Code2, keywords: "freelance design writing ambassador" },
      { href: "/discover/grants", label: "Grants", icon: Landmark },
    ],
  },
  {
    label: "Early intelligence",
    items: [
      { href: "/projects", label: "Projects", icon: Building2, keywords: "profiles signals funding early" },
      { href: "/leads", label: "Hidden Opportunities", icon: Binoculars, keywords: "leads outreach may need testers" },
    ],
  },
  {
    label: "Personal",
    items: [
      { href: "/watchlist", label: "Watchlist", icon: Eye, keywords: "watch monitor projects alerts" },
      { href: "/saved", label: "Saved", icon: Bookmark, keywords: "bookmarks hidden" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/sources", label: "Sources and Usage", icon: Radar, keywords: "source management api quota health" },
      { href: "/activity", label: "Agent Activity", icon: Activity, keywords: "logs jobs scans" },
      { href: "/settings", label: "Settings", icon: Settings, keywords: "profile preferences telegram notifications" },
    ],
  },
];

export const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
/** Discover is active only on /discover itself, not on its sub-pages (they have their own items). */
export const isActiveExact = (pathname: string, href: string) => (href === "/discover" ? pathname === "/discover" : isActive(pathname, href));
