import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// DM Sans: the closest openly licensed geometric sans to the reference's Matter.
const sans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "XEN — Discover opportunities before the crowd", template: "%s · XEN" },
  description: "An intelligence network that finds paid Web3 opportunities, emerging protocols and early-stage platforms for you.",
  applicationName: "XEN",
};

export const viewport: Viewport = { themeColor: "#012624", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`dark ${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">
        {/* XEN is dark-only; next-themes stays for the toaster and any future theme work. */}
        <ThemeProvider attribute="class" forcedTheme="dark" defaultTheme="dark" disableTransitionOnChange>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
