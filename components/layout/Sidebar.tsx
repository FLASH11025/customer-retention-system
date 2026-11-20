"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PulseIcon,
  UploadCloudIcon,
  ShieldIcon,
  LightningIcon,
  RadarIcon,
  DoorIcon,
  PlaybookIcon,
} from "@/components/ui/Icons";

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { name: "Overview", href: "/", icon: <PulseIcon size={20} /> },
  { name: "Upload", href: "/upload", icon: <UploadCloudIcon size={20} /> },
  { name: "Data Health", href: "/data-health", icon: <ShieldIcon size={20} /> },
  { name: "Model Lab", href: "/model", icon: <LightningIcon size={20} /> },
  { name: "Risk Radar", href: "/radar", icon: <RadarIcon size={20} /> },
  { name: "Customers", href: "/customers", icon: <DoorIcon size={20} /> },
  { name: "Simulator", href: "/simulator", icon: <PulseIcon size={20} accent /> },
  { name: "Playbook", href: "/playbook", icon: <PlaybookIcon size={20} /> },
  {
    name: "Settings",
    href: "/settings",
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop & Tablet Left Rail */}
      <aside className="hidden md:flex flex-col w-16 lg:w-60 shrink-0 border-r border-signal-hairline bg-signal-surface min-h-screen py-6 px-3 lg:px-4 select-none">
        {/* Brand Header */}
        <Link
          href="/"
          className="flex items-center gap-3 px-2 mb-8 group"
        >
          <div className="w-8 h-8 rounded-12 bg-signal-ink dark:bg-signal-lime flex items-center justify-center text-signal-lime dark:text-signal-ink font-mono font-bold text-base shadow-sm">
            ⚡
          </div>
          <div className="hidden lg:block">
            <span className="font-display italic text-xl font-bold tracking-tight text-signal-ink">
              Signal
            </span>
            <span className="ml-1 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-signal-hairline text-signal-muted">
              ML
            </span>
          </div>
        </Link>

        {/* Navigation list */}
        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-16 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-signal-ink text-signal-bg dark:bg-signal-lime dark:text-[#14130F] font-semibold shadow-sm"
                    : "text-signal-muted hover:text-signal-ink hover:bg-signal-hairline/25"
                }`}
                title={item.name}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="hidden lg:inline">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom indicator */}
        <div className="hidden lg:block pt-4 border-t border-signal-hairline/60">
          <div className="rounded-16 bg-signal-surface-alt p-3 border border-signal-hairline text-xs">
            <div className="font-mono text-[10px] text-signal-muted uppercase tracking-wider mb-1">
              Engine Status
            </div>
            <div className="flex items-center gap-2 font-medium text-signal-ink">
              <span className="w-2 h-2 rounded-full bg-signal-safe" />
              <span>XGBoost + SHAP</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-signal-surface/95 backdrop-blur-md border-t border-signal-hairline flex items-center justify-around py-2 px-1">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 p-2 rounded-12 text-[10px] ${
                isActive
                  ? "text-signal-ink dark:text-signal-lime font-bold"
                  : "text-signal-muted"
              }`}
            >
              {item.icon}
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
