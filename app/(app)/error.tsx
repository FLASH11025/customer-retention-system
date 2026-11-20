"use client";

import React, { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("PredictChurn Application Error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
      <div className="w-16 h-16 rounded-full bg-signal-danger/10 border border-signal-danger/30 flex items-center justify-center text-signal-danger mb-4">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h2 className="font-display italic text-3xl text-signal-ink mb-2">
        Something went off course
      </h2>
      <p className="text-sm text-signal-muted max-w-md mb-6 leading-relaxed">
        {error.message || "An unexpected error occurred while rendering this view."}
      </p>

      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Reload Page
        </Button>
        <Button variant="primary" onClick={() => reset()}>
          Try Again
        </Button>
      </div>
    </div>
  );
}
