import React from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ModelStatusChip } from "@/components/layout/ModelStatusChip";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-signal-bg">
      <header className="sticky top-0 z-30 flex items-center justify-between h-20 px-6 md:px-12 border-b border-signal-hairline bg-signal-bg/90 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-16 bg-signal-ink dark:bg-signal-lime flex items-center justify-center text-signal-lime dark:text-signal-ink font-mono font-bold text-lg shadow-sm">
            ⚡
          </div>
          <div>
            <span className="font-display italic text-2xl font-bold tracking-tight text-signal-ink">
              Signal
            </span>
            <span className="ml-1.5 text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-signal-hairline text-signal-muted">
              PredictChurn
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          <ModelStatusChip />
          <ThemeToggle />
          <Link
            href="/upload"
            className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-16 bg-signal-ink text-signal-bg dark:bg-signal-lime dark:text-[#14130F] font-semibold text-xs tracking-tight hover:opacity-90 transition-opacity"
          >
            Launch Console ↗
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-signal-hairline py-8 px-6 md:px-12 text-center text-xs text-signal-muted font-mono flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>PredictChurn Signal Studio • Local Machine Intelligence</div>
        <div>Zero Telemetry • Real Data Only • SHAP TreeExplainer</div>
      </footer>
    </div>
  );
}
