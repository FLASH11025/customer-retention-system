"use client";

import React, { useEffect, useState } from "react";

interface MonoNumberProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

export function MonoNumber({
  value,
  duration = 600,
  prefix = "",
  suffix = "",
  decimals = 0,
  className = "",
}: MonoNumberProps) {
  // Start at the real value so the number is visible immediately (SSR markup
  // matches, and hidden/background tabs never run requestAnimationFrame —
  // animating from 0 left them stuck displaying 0 forever).
  const [displayValue, setDisplayValue] = useState(value);
  const currentValueRef = React.useRef(value);

  useEffect(() => {
    if (value === currentValueRef.current) return;

    // Check prefers-reduced-motion
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplayValue(value);
      currentValueRef.current = value;
      return;
    }

    let startTimestamp: number | null = null;
    const startValue = currentValueRef.current;
    const targetValue = value;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease out quad
      const easeOut = 1 - (1 - progress) * (1 - progress);
      const current = startValue + (targetValue - startValue) * easeOut;

      currentValueRef.current = current;
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        currentValueRef.current = targetValue;
        setDisplayValue(targetValue);
      }
    };

    const animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [value, duration]);

  const formatted = displayValue.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={`font-mono tracking-tight tabular-nums ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
