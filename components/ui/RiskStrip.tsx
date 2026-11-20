import React from "react";

interface RiskStripProps {
  low: number;
  medium: number;
  high: number;
  height?: number;
  className?: string;
  showLabels?: boolean;
}

export function RiskStrip({
  low,
  medium,
  high,
  height = 6,
  className = "",
  showLabels = false,
}: RiskStripProps) {
  const total = Math.max(1, low + medium + high);
  const lowPct = (low / total) * 100;
  const medPct = (medium / total) * 100;
  const highPct = (high / total) * 100;

  return (
    <div className={`w-full ${className}`}>
      {showLabels && (
        <div className="flex items-center justify-between text-[11px] font-mono text-signal-muted mb-1.5">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-safe" />
            Low {lowPct.toFixed(0)}% ({low})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-watch" />
            Med {medPct.toFixed(0)}% ({medium})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-danger" />
            High {highPct.toFixed(0)}% ({high})
          </span>
        </div>
      )}

      <div
        className="w-full flex rounded-full overflow-hidden bg-signal-hairline"
        style={{ height }}
        role="meter"
        aria-valuenow={high}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`Risk breakdown: ${low} safe, ${medium} watch, ${high} danger`}
      >
        <div
          style={{ width: `${lowPct}%` }}
          className="bg-signal-safe transition-all duration-500 ease-out"
          title={`Safe / Low: ${low}`}
        />
        <div
          style={{ width: `${medPct}%` }}
          className="bg-signal-watch transition-all duration-500 ease-out"
          title={`Watch / Medium: ${medium}`}
        />
        <div
          style={{ width: `${highPct}%` }}
          className="bg-signal-danger transition-all duration-500 ease-out"
          title={`Danger / High: ${high}`}
        />
      </div>
    </div>
  );
}
