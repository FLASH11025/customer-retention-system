/**
 * Formatting utilities for numbers, currencies, and SHAP explainability reasons.
 */

export function formatCurrency(amount: number): string {
  const safeVal = Number(amount) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeVal);
}

export function formatPercent(value: number): string {
  const safeVal = Number(value) || 0;
  return `${safeVal.toFixed(1)}%`;
}

export function getRiskTier(churnProbPct: number): "Low" | "Medium" | "High" {
  if (churnProbPct < 30) return "Low";
  if (churnProbPct < 60) return "Medium";
  return "High";
}

export function getRiskColorClass(tier: "Low" | "Medium" | "High"): {
  text: string;
  bg: string;
  border: string;
  pill: string;
} {
  switch (tier) {
    case "Low":
      return {
        text: "text-signal-safe",
        bg: "bg-signal-safe/10",
        border: "border-signal-safe/30",
        pill: "bg-[#E6F4EA] text-[#137333] dark:bg-[#137333]/20 dark:text-[#81C995]",
      };
    case "Medium":
      return {
        text: "text-signal-watch",
        bg: "bg-signal-watch/10",
        border: "border-signal-watch/30",
        pill: "bg-[#FEF7E0] text-[#B06000] dark:bg-[#B06000]/20 dark:text-[#FDD663]",
      };
    case "High":
      return {
        text: "text-signal-danger",
        bg: "bg-signal-danger/10",
        border: "border-signal-danger/30",
        pill: "bg-[#FCE8E6] text-[#C5221F] dark:bg-[#C5221F]/20 dark:text-[#F28B82]",
      };
  }
}

export interface ParsedShapReason {
  raw: string;
  text: string;
  sign: "+" | "-";
  percentage: number;
  direction: "increases" | "decreases";
}

export function parseShapReason(reasonString: string): ParsedShapReason {
  const trimmed = reasonString.trim();
  // Regex to match e.g. "Logged in 0 times in last 30 days (+25%)" or "(-15% risk)"
  const match = trimmed.match(/^(.*?)\s*\(([+-])(\d+(?:\.\d+)?)%?(?:\s*risk)?\)$/i);

  if (match) {
    const text = match[1].trim();
    const sign = match[2] as "+" | "-";
    const percentage = parseFloat(match[3]);
    return {
      raw: trimmed,
      text,
      sign,
      percentage,
      direction: sign === "+" ? "increases" : "decreases",
    };
  }

  // Fallback if formatting doesn't contain parenthetical sign
  return {
    raw: trimmed,
    text: trimmed,
    sign: "+",
    percentage: 0,
    direction: "increases",
  };
}
