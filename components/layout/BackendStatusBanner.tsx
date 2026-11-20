"use client";

import React, { useEffect, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import { getHealth } from "@/lib/api";

/**
 * Global connectivity banner for the app layout.
 * Polls GET /health; when the backend is unreachable it shows a clear
 * "Backend not reachable" state with a Retry button instead of letting
 * individual pages crash or silently show misleading "No Model" states.
 */
export function BackendStatusBanner() {
  const { backendOnline, setBackendOnline, setBackendHealth } = useAppStore();

  const check = useCallback(async () => {
    try {
      const health = await getHealth();
      setBackendHealth(health);
      setBackendOnline(true);
    } catch {
      setBackendHealth(null);
      setBackendOnline(false);
    }
  }, [setBackendHealth, setBackendOnline]);

  useEffect(() => {
    check();
    const interval = setInterval(check, 8000);
    return () => clearInterval(interval);
  }, [check]);

  if (backendOnline !== false) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-md z-50 p-4 rounded-16 bg-[#FCE8E6] border border-[#F5C2C7] text-[#C5221F] dark:bg-[#C5221F]/20 dark:border-[#C5221F]/40 dark:text-[#F28B82] shadow-lg">
      <div className="flex items-start gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-signal-danger animate-pulse shrink-0 mt-1" />
        <div className="flex-1 space-y-1">
          <p className="text-xs font-bold font-mono uppercase tracking-wider">
            Backend not reachable
          </p>
          <p className="text-[11px] leading-relaxed">
            The PredictChurn API at <span className="font-mono">{process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}</span> did not
            respond. Start it with <span className="font-mono">python -m uvicorn api:app --host 0.0.0.0 --port 8000</span> from the
            predictchurn/ folder. Live predictions, training, and the simulator are unavailable until it is back.
          </p>
          <button
            type="button"
            onClick={check}
            className="mt-1.5 px-3 py-1.5 rounded-12 bg-[#C5221F] text-white text-xs font-mono font-bold hover:opacity-90 transition-opacity dark:bg-[#F28B82] dark:text-[#14130F]"
          >
            Retry now
          </button>
        </div>
      </div>
    </div>
  );
}
