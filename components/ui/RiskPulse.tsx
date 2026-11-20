"use client";

import React from "react";

interface RiskPulseProps {
  value: number; // 0 to 100
  size?: "sm" | "md" | "lg" | "xl";
  showValue?: boolean;
  className?: string;
}

export function RiskPulse({
  value,
  size = "md",
  showValue = true,
  className = "",
}: RiskPulseProps) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));

  // Determine color along risk spectrum
  let strokeColor = "#3F8F5F"; // Safe moss (<30%)
  if (clamped >= 60) {
    strokeColor = "#E8452C"; // Danger vermilion
  } else if (clamped >= 30) {
    strokeColor = "#E0A526"; // Watch amber
  }

  const dimensions = {
    sm: { dim: 32, stroke: 3.5, font: "text-[10px]" },
    md: { dim: 52, stroke: 5, font: "text-xs font-semibold" },
    lg: { dim: 88, stroke: 7, font: "text-lg font-bold" },
    xl: { dim: 140, stroke: 10, font: "text-3xl font-black" },
  }[size];

  const radius = (dimensions.dim - dimensions.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Churn risk: ${Math.round(clamped)}%`}
    >
      <svg
        width={dimensions.dim}
        height={dimensions.dim}
        className="rotate-[-90deg] transition-all duration-500 ease-out"
      >
        {/* Background Track */}
        <circle
          cx={dimensions.dim / 2}
          cy={dimensions.dim / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={dimensions.stroke}
          className="text-signal-hairline opacity-40 dark:opacity-20"
        />
        {/* Active Value Ring */}
        <circle
          cx={dimensions.dim / 2}
          cy={dimensions.dim / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={dimensions.stroke}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {showValue && (
        <span
          className={`absolute font-mono tracking-tighter text-signal-ink ${dimensions.font}`}
        >
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}
