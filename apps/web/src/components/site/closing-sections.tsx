import Link from "next/link";
import { XenLogo, XenSymbol } from "@/components/brand/xen-mark";
import type { PublicOpportunity, PublicStats } from "@/lib/xen/public";
import { formatReward } from "@/lib/xen/format";
import { CAPITAL, REWARD_STATUS } from "@/lib/xen/labels";
import { MetricCounter } from "./metric-counter";
import { AuroraButton, Container, Eyebrow } from "./primitives";

export function NumbersSection({ stats }: { stats: PublicStats | null }) {
  // Real counts only. A metric that could not be read is left out rather than guessed.
  const metrics = stats
    ? [
        { v: stats.opportunities, l: "Opportunities discovered" },
        { v: stats.confirmedPaid, l: "Confirmed paid, active" },
        { v: stats.zeroCapital, l: "Zero-capital, active" },
        { v: stats.verified, l: "Verified announcements" },
        { v: stats.sources, l: "Active information sources" },
        { v: stats.projects, l: "Projects profiled" },
      ]
    : [];
  return (
    <section aria-labelledby="numbers-title" className="relative z-10 bg-xen-abyss py-24 md:py-32">
      <Container>
        <Eyebrow>XEN by the numbers</Eyebrow>
        <h2 id="numbers-title" className="sr-only">XEN by the numbers</h2>
        {metrics.length ? (
          <div className="mt-14 grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map((m) => <MetricCounter key={m.l} value={m.v} label={m.l} />)}
          </div>
        ) : (
          <p className="mt-8 text-sm text-xen-silver">Live counts are unavailable right now.</p>
        )}
        <p className="mt-14 text-xs text-xen-slate">Counted directly from XEN&apos;s database. Nothing here is estimated.</p>
      </Container>
    </section>
  );
}

export function LabSection() {
  const items = ["Bug report generation", "Screenshot analysis", "Product feedback", "Testing checklists", "Test cases", "Tester portfolio", "Project outreach"];
  return (
    <section id="lab" aria-labelledby="lab-title" className="relative z-10 bg-xen-deep py-24 md:py-32">
      <Container className="grid items-center gap-14 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-20">
        <div>
          <Eyebrow>XEN Lab</Eyebrow>
          <h2 id="lab-title" className="xen-display mt-5 text-[clamp(2.25rem,4.2vw,3.6rem)] text-white">Turn your testing into professional work.</h2>
          <p className="mt-6 text-[15px] leading-relaxed text-xen-silver">A workspace for writing clear bug reports, structured feedback and test cases, and for keeping a portfolio of the testing you have done.</p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-[6px] border border-white/10 px-3 py-1.5 text-[11px] font-medium tracking-[0.12em] text-xen-silver uppercase">
            <span className="size-1.5 rounded-full bg-[#f3cf86]" aria-hidden /> In development · not available yet
          </p>
        </div>
        {/* A preview of the planned workspace layout, labelled as planned. */}
        <figure className="overflow-hidden rounded-[16px] border border-white/8 bg-xen-abyss" aria-label="Preview of the planned XEN Lab workspace">
          <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3">
            <XenSymbol className="size-4 text-xen-mist" title="" />
            <span className="text-xs text-xen-silver">Lab · Bug report</span>
            <span className="ml-auto text-[10px] tracking-[0.12em] text-xen-slate uppercase">Planned</span>
          </div>
          <div className="grid gap-0 md:grid-cols-[13rem_minmax(0,1fr)]">
            <ul className="hidden border-r border-white/8 p-4 md:block">
              {items.map((it, i) => (
                <li key={it} className={i === 0 ? "rounded-[6px] bg-xen-kelp px-3 py-2 text-sm text-white" : "px-3 py-2 text-sm text-xen-silver"}>{it}</li>
              ))}
            </ul>
            <div className="space-y-5 p-6">
              <div>
                <p className="text-[10px] tracking-[0.12em] text-xen-slate uppercase">Title</p>
                <div className="mt-2 h-9 rounded-[6px] border border-white/10 bg-xen-deep" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-[10px] tracking-[0.12em] text-xen-slate uppercase">Severity</p><div className="mt-2 h-9 rounded-[6px] border border-white/10 bg-xen-deep" /></div>
                <div><p className="text-[10px] tracking-[0.12em] text-xen-slate uppercase">Environment</p><div className="mt-2 h-9 rounded-[6px] border border-white/10 bg-xen-deep" /></div>
              </div>
              <div>
                <p className="text-[10px] tracking-[0.12em] text-xen-slate uppercase">Steps to reproduce</p>
                <div className="mt-2 space-y-2 rounded-[6px] border border-white/10 bg-xen-deep p-3">
                  {[72, 88, 54].map((w) => <div key={w} className="h-2 rounded-full bg-white/8" style={{ width: `${w}%` }} />)}
                </div>
              </div>
              <div className="flex justify-end"><span className="rounded-[6px] bg-white/8 px-4 py-2 text-[11px] tracking-[0.1em] text-xen-silver uppercase">Generate report</span></div>
            </div>
          </div>
        </figure>
      </Container>
    </section>
  );
}

export function TelegramSection({ botUsername, sample }: { botUsername: string | null; sample: PublicOpportunity | null }) {
  const reward = sample ? formatReward(sample.reward_amount, sample.reward_amount_max, sample.reward_currency) : null;
  return (
    <section aria-labelledby="tg-title" className="relative z-10 overflow-hidden bg-xen-abyss py-24 md:py-32">
      <Container className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div>
          <Eyebrow>Intelligence on the move</Eyebrow>
          <h2 id="tg-title" className="xen-display mt-5 text-[clamp(2.25rem,4.2vw,3.6rem)] text-white">Opportunities delivered directly to you.</h2>
          <p className="mt-6 max-w-[30rem] text-[15px] leading-relaxed text-xen-silver">
            Receive verified opportunity alerts, project updates, daily action plans and deadline reminders without constantly checking the website.
          </p>
          <div className="mt-9"><AuroraButton href="/settings">Connect Telegram</AuroraButton></div>
          {botUsername && <p className="mt-4 text-xs text-xen-slate">Bot: @{botUsername}</p>}
        </div>
        <div className="relative">
          {/* Particle stream from the core toward the notification */}
          <svg viewBox="0 0 400 120" className="absolute -top-16 left-0 hidden h-28 w-full lg:block" aria-hidden>
            <path id="tgpath" d="M0 110 C 120 100, 220 20, 400 30" fill="none" stroke="#00827c" strokeOpacity=".35" strokeDasharray="2 6" />
            {Array.from({ length: 7 }, (_, i) => (
              <circle key={i} r="2" fill="#cbfffc">
                <animateMotion dur="3.6s" begin={`${i * 0.5}s`} repeatCount="indefinite"><mpath href="#tgpath" /></animateMotion>
                <animate attributeName="opacity" values="0;1;1;0" dur="3.6s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
              </circle>
            ))}
          </svg>
          <figure className="relative mx-auto max-w-[26rem] rounded-[16px] border border-white/8 bg-xen-kelp p-5" aria-label="Example of an XEN Telegram alert layout">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-xen-abyss"><XenSymbol className="size-5 text-xen-mist" title="" /></span>
              <div>
                <p className="text-sm font-medium text-white">XEN</p>
                <p className="text-[11px] text-xen-silver">bot</p>
              </div>
              <span className="ml-auto text-[10px] tracking-[0.12em] text-xen-slate uppercase">{sample ? "Latest top-ranked" : "Alert layout"}</span>
            </div>
            <div className="mt-4 space-y-2 rounded-[12px] bg-xen-abyss p-4 text-[13px] leading-relaxed text-xen-mist">
              {sample ? (
                <>
                  <p className="font-medium text-white">{sample.title}</p>
                  {sample.project_name && <p><span className="text-xen-silver">Project</span> · {sample.project_name}</p>}
                  <p><span className="text-xen-silver">Reward</span> · <span className={sample.reward_status === "confirmed" ? "text-xen-phosphor" : undefined}>{reward ?? "Not stated"}</span> <span className="text-xen-silver">({REWARD_STATUS[sample.reward_status]?.label ?? sample.reward_status})</span></p>
                  <p><span className="text-xen-silver">Capital</span> · {CAPITAL[sample.capital]?.label ?? sample.capital}{sample.score !== null && <> &nbsp; <span className="text-xen-silver">Score</span> · {sample.score}</>}</p>
                </>
              ) : (
                <p className="text-xen-silver">Alerts show the title, project, reward as stated in the source, capital needed, score and eligibility.</p>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-xen-mist">
              {["View", "Source", "Apply", "Save", "Applied", "Not interested"].map((b) => <span key={b} className="rounded-[6px] bg-xen-abyss py-1.5">{b}</span>)}
            </div>
          </figure>
        </div>
      </Container>
    </section>
  );
}

export function FinalCta() {
  return (
    <section aria-labelledby="final-title" className="relative z-10 overflow-hidden bg-xen-deep py-28 md:py-40">
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-40" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1200 500">
        {Array.from({ length: 46 }, (_, i) => {
          const x = (i * 263) % 1200, y = (i * 149) % 500;
          const x2 = ((i + 7) * 263) % 1200, y2 = ((i + 7) * 149) % 500;
          return (
            <g key={i}>
              {i % 3 === 0 && <line x1={x} y1={y} x2={x2} y2={y2} stroke="#00827c" strokeOpacity=".18" />}
              <circle cx={x} cy={y} r={i % 5 === 0 ? 2 : 1.2} fill={i % 9 === 0 ? "#fde9ff" : "#cbfffc"} fillOpacity=".55" />
            </g>
          );
        })}
      </svg>
      <Container className="relative text-center">
        <h2 id="final-title" className="xen-display mx-auto max-w-[52rem] text-[clamp(2.5rem,5.2vw,4.6rem)] text-white">
          Spend less time searching.<br />Find more opportunities.
        </h2>
        <p className="mx-auto mt-6 max-w-[30rem] text-base leading-relaxed text-xen-silver">Let XEN monitor the ecosystem while you focus on the work that matters.</p>
        <div className="mt-10 flex justify-center"><AuroraButton href="/overview">Launch XEN</AuroraButton></div>
      </Container>
    </section>
  );
}

export function SiteFooter({ telegramUrl }: { telegramUrl: string | null }) {
  const col = "text-[10px] font-medium tracking-[0.14em] text-xen-slate uppercase";
  const link = "text-sm text-xen-silver transition-colors hover:text-white";
  return (
    <footer id="about" className="relative z-10 overflow-hidden bg-xen-deep pt-20">
      <Container>
        <div className="grid gap-12 border-t border-white/8 pt-14 md:grid-cols-[minmax(0,22rem)_1fr_1fr_1fr]">
          <div>
            <XenLogo />
            <p className="mt-5 text-sm leading-relaxed text-xen-silver">
              XEN is a Web3 opportunity intelligence system. It finds paid testing, bounties and early projects in public sources, checks the evidence, and tells you what is worth your time.
            </p>
          </div>
          <nav aria-label="Product">
            <p className={col}>Product</p>
            <ul className="mt-4 space-y-2.5">
              <li><Link className={link} href="/overview">Dashboard</Link></li>
              <li><Link className={link} href="/discover">Discover</Link></li>
              <li><Link className={link} href="/saved">Saved</Link></li>
              <li><Link className={link} href="/settings">Settings</Link></li>
            </ul>
          </nav>
          <nav aria-label="Categories">
            <p className={col}>Categories</p>
            <ul className="mt-4 space-y-2.5">
              <li><Link className={link} href="/discover/paid-testing">Paid testing</Link></li>
              <li><Link className={link} href="/discover/prediction-markets">Prediction markets</Link></li>
              <li><Link className={link} href="/discover/bug-bounties">Bug bounties</Link></li>
              <li><Link className={link} href="/discover/early-projects">Emerging protocols</Link></li>
            </ul>
          </nav>
          <nav aria-label="Company">
            <p className={col}>XEN</p>
            <ul className="mt-4 space-y-2.5">
              <li><Link className={link} href="/privacy">Privacy</Link></li>
              {telegramUrl && <li><a className={link} href={telegramUrl} target="_blank" rel="noopener noreferrer">Telegram</a></li>}
              <li><Link className={link} href="/login">Sign in</Link></li>
            </ul>
          </nav>
        </div>
        <p className="mt-14 text-xs text-xen-slate">XEN surfaces public information and never guarantees income. Speculative rewards are labelled as speculative.</p>
      </Container>
      <p aria-hidden className="xen-display pointer-events-none mt-10 -mb-[0.18em] text-center text-[clamp(8rem,28vw,26rem)] text-white/[0.035] select-none">XEN</p>
    </footer>
  );
}
