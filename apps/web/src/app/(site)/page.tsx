import { Suspense } from "react";
import { CategoriesSection } from "@/components/site/categories-section";
import { FinalCta, LabSection, NumbersSection, SiteFooter, TelegramSection } from "@/components/site/closing-sections";
import { ExploreSection } from "@/components/site/explore-section";
import { HowItWorks } from "@/components/site/how-it-works";
import { IntelligenceStatus, LandingCore } from "@/components/site/landing-core";
import { LiveIntelligence } from "@/components/site/live-intelligence";
import { Container } from "@/components/site/primitives";
import { XenNavigation } from "@/components/site/xen-navigation";
import { getBotUsername, getPublicCategoryCounts, getPublicOpportunities, getPublicPulse, getPublicStats } from "@/lib/xen/public";

/**
 * The static shell (navigation, hero, sphere, copy) renders instantly; each data-backed
 * section streams in behind its own Suspense boundary from cached, read-only queries.
 */
export default function LandingPage() {
  return (
    <>
      {/* First visit plays the intro; later visits in the same session skip it. */}
      <script
        dangerouslySetInnerHTML={{
          __html: "try{if(sessionStorage.getItem('xen-intro')){document.documentElement.dataset.intro='done'}sessionStorage.setItem('xen-intro','1')}catch(e){}",
        }}
      />
      <a href="#live" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-[6px] focus:bg-xen-cyan focus:px-3 focus:py-2 focus:text-xen-abyss">Skip to opportunities</a>
      <XenNavigation />
      <main className="relative">
        <LandingCore status={<Suspense fallback={null}><ScanStatus /></Suspense>} />
        <Suspense fallback={<SectionPlaceholder id="live" />}><Live /></Suspense>
        <ExploreSection />
        <Suspense fallback={<SectionPlaceholder />}><Categories /></Suspense>
        <HowItWorks />
        <Suspense fallback={<SectionPlaceholder />}><Numbers /></Suspense>
        <LabSection />
        <Suspense fallback={<SectionPlaceholder />}><Telegram /></Suspense>
        <FinalCta />
      </main>
      <Suspense fallback={null}><Footer /></Suspense>
    </>
  );
}

async function ScanStatus() {
  const pulse = await getPublicPulse();
  return <IntelligenceStatus lastScanAt={pulse.lastScanAt} />;
}
async function Live() {
  return <LiveIntelligence items={await getPublicOpportunities(6)} />;
}
async function Categories() {
  return <CategoriesSection counts={await getPublicCategoryCounts()} />;
}
async function Numbers() {
  return <NumbersSection stats={await getPublicStats()} />;
}
async function Telegram() {
  const [bot, items] = await Promise.all([getBotUsername(), getPublicOpportunities(6)]);
  return <TelegramSection botUsername={bot} sample={items[0] ?? null} />;
}
async function Footer() {
  const bot = await getBotUsername();
  return <SiteFooter telegramUrl={bot ? `https://t.me/${bot}` : null} />;
}

function SectionPlaceholder({ id }: { id?: string }) {
  return (
    <section id={id} aria-busy="true" className="relative z-10 bg-xen-abyss py-24">
      <Container><div className="h-64 rounded-[16px] bg-xen-kelp/40" /></Container>
    </section>
  );
}
