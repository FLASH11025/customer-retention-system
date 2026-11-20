"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { getModelMetrics, getHealth } from "@/lib/api";

export function ModelStatusChip() {
  const { metrics, setMetrics, backendOnline, setBackendOnline, backendHealth, setBackendHealth } = useAppStore();

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const health = await getHealth();
        if (!isMounted) return;
        setBackendHealth(health);
        setBackendOnline(true);
      } catch {
        // Network failure = backend offline (distinct from "no model" 404)
        if (isMounted) {
          setBackendOnline(false);
          setBackendHealth(null);
        }
        return;
      }
      try {
        const data = await getModelMetrics();
        if (isMounted) setMetrics(data);
      } catch {
        if (isMounted) setMetrics(null);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [setMetrics, setBackendOnline, setBackendHealth]);

  if (backendOnline === false) {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-signal-danger/40 bg-signal-danger/10 text-xs font-mono">
        <span className="w-2 h-2 rounded-full bg-signal-danger animate-pulse" />
        <span className="text-signal-danger font-semibold">Backend Offline</span>
      </span>
    );
  }

  if (!metrics) {
    return (
      <Link
        href="/upload"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-signal-hairline bg-signal-surface hover:border-signal-muted text-xs font-mono transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-signal-muted" />
        <span className="text-signal-muted">No Model Trained</span>
        <span className="text-[10px] text-signal-lime bg-signal-ink px-1.5 py-0.5 rounded-full">
          Train ↗
        </span>
      </Link>
    );
  }

  const timeFormatted = metrics.trained_at
    ? new Date(metrics.trained_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "Active";

  return (
    <Link
      href="/model"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-signal-hairline bg-signal-surface hover:border-signal-lime/50 text-xs font-mono transition-colors shadow-sm"
      title={`Model: ${metrics.algorithm} | Trained: ${metrics.trained_at}${backendHealth?.loading ? " | Loading..." : ""}`}
    >
      <span className="w-2 h-2 rounded-full bg-signal-lime animate-pulse" />
      <span className="font-semibold text-signal-ink">
        {metrics.algorithm}
      </span>
      <span className="text-signal-muted text-[11px]">
        {metrics.train_rows + metrics.test_rows} rows • {timeFormatted}
      </span>
    </Link>
  );
}
