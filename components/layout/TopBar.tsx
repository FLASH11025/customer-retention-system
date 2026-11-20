"use client";

import React from "react";
import { ModelStatusChip } from "./ModelStatusChip";
import { ThemeToggle } from "./ThemeToggle";
import { CommandPalette, CommandPaletteTrigger } from "./CommandPalette";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 border-b border-signal-hairline bg-signal-bg/85 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <CommandPaletteTrigger />
      </div>

      <div className="flex items-center gap-3">
        <ModelStatusChip />
        <ThemeToggle />
      </div>

      <CommandPalette />
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-signal-bg">
      <div className="shrink-0">
        <aside className="sticky top-0 h-screen">
          <div className="h-full">
            {/* Sidebar rendered client-side */}
          </div>
        </aside>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full pb-20 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
