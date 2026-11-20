"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { MagnifierIcon } from "@/components/ui/Icons";

interface SearchResult {
  id: string;
  type: "page" | "customer";
  title: string;
  subtitle: string;
  href: string;
}

const STATIC_ROUTES: SearchResult[] = [
  { id: "p-overview", type: "page", title: "Overview", subtitle: "Landing & system summary", href: "/" },
  { id: "p-upload", type: "page", title: "Data Upload", subtitle: "Train model or score customers", href: "/upload" },
  { id: "p-data-health", type: "page", title: "Data Health", subtitle: "Audit cleaning & SMOTE class balance", href: "/data-health" },
  { id: "p-model", type: "page", title: "Model Lab", subtitle: "Inspect ROC-AUC, confusion matrix & threshold", href: "/model" },
  { id: "p-radar", type: "page", title: "Risk Radar", subtitle: "Executive KPIs & segment risk distributions", href: "/radar" },
  { id: "p-customers", type: "page", title: "Customers", subtitle: "Browse at-risk accounts & export", href: "/customers" },
  { id: "p-simulator", type: "page", title: "Simulator", subtitle: "Single prediction & what-if tweak engine", href: "/simulator" },
  { id: "p-playbook", type: "page", title: "Retention Playbook", subtitle: "Action lanes & workflow management", href: "/playbook" },
  { id: "p-settings", type: "page", title: "Reports & Settings", subtitle: "Export reports, test API & theme", href: "/settings" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { predictions } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return STATIC_ROUTES;

    const matchedRoutes = STATIC_ROUTES.filter(
      (r) =>
        r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q)
    );

    const matchedCustomers: SearchResult[] = (predictions || [])
      .filter((c) => c.customer_id.toLowerCase().includes(q))
      .slice(0, 8)
      .map((c) => ({
        id: `c-${c.customer_id}`,
        type: "customer",
        title: `Customer ${c.customer_id}`,
        subtitle: `${c.prediction} • ${c.churn_probability_pct}% Risk • ${c.risk_level}`,
        href: `/customers/${encodeURIComponent(c.customer_id)}`,
      }));

    return [...matchedRoutes, ...matchedCustomers];
  }, [query, predictions]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-24 border border-signal-hairline bg-signal-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-signal-hairline">
          <MagnifierIcon size={20} className="text-signal-muted" />
          <input
            type="text"
            placeholder="Search pages or customer IDs (Esc to exit)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-sm font-sans text-signal-ink placeholder:text-signal-muted outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono border border-signal-hairline text-signal-muted">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-signal-hairline/30">
          {results.length === 0 ? (
            <div className="py-8 text-center text-sm text-signal-muted">
              No matching pages or customer records found.
            </div>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setOpen(false);
                  router.push(item.href);
                }}
                className="w-full text-left px-3 py-2.5 rounded-16 hover:bg-signal-hairline/20 flex items-center justify-between transition-colors group"
              >
                <div>
                  <div className="text-sm font-medium text-signal-ink group-hover:text-signal-lime">
                    {item.title}
                  </div>
                  <div className="text-xs text-signal-muted">
                    {item.subtitle}
                  </div>
                </div>
                <span className="text-[10px] font-mono text-signal-muted uppercase">
                  {item.type}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function CommandPaletteTrigger() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.userAgent.includes("Mac"));
  }, []);

  const openSearch = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true })
    );
  };

  return (
    <button
      onClick={openSearch}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-signal-hairline bg-signal-surface hover:border-signal-muted text-xs text-signal-muted transition-colors"
      aria-label="Open command palette"
    >
      <MagnifierIcon size={14} />
      <span className="hidden sm:inline">Search...</span>
      <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-signal-hairline/50 text-signal-ink">
        {isMac ? "⌘K" : "Ctrl+K"}
      </kbd>
    </button>
  );
}
