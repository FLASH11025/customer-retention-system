import React from "react";

interface StatusBadgeProps {
  status: "STAY" | "LEAVE" | string;
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({
  status,
  size = "md",
  className = "",
}: StatusBadgeProps) {
  const isLeave = status.toUpperCase() === "LEAVE";

  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs";

  if (isLeave) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full font-mono font-bold tracking-tight bg-[#FCE8E6] text-[#C5221F] dark:bg-[#C5221F]/20 dark:text-[#F28B82] border border-[#F5C2C7] dark:border-[#C5221F]/40 ${sizeClass} ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#C5221F]" />
        LEAVE
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono font-bold tracking-tight bg-[#E6F4EA] text-[#137333] dark:bg-[#137333]/20 dark:text-[#81C995] border border-[#CEEAD6] dark:border-[#137333]/40 ${sizeClass} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#137333]" />
      STAY
    </span>
  );
}

interface RiskBadgeProps {
  level: "Low" | "Medium" | "High" | string;
  className?: string;
}

export function RiskBadge({ level, className = "" }: RiskBadgeProps) {
  const normalized = level.toLowerCase();

  if (normalized === "high") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-mono font-semibold bg-[#FDECE9] text-signal-danger border border-signal-danger/20 dark:bg-signal-danger/10 ${className}`}
      >
        High Risk
      </span>
    );
  }

  if (normalized === "medium") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-mono font-semibold bg-[#FCF4E4] text-[#B45309] border border-signal-watch/20 dark:bg-signal-watch/10 dark:text-signal-watch ${className}`}
      >
        Medium Risk
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-mono font-semibold bg-[#E7F3EC] text-signal-safe border border-signal-safe/20 dark:bg-signal-safe/10 ${className}`}
    >
      Low Risk
    </span>
  );
}
