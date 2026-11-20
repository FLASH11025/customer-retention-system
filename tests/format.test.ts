import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatPercent,
  parseShapReason,
  getRiskTier,
} from "@/lib/format";

describe("Formatting & SHAP Parsing (TDD)", () => {
  it("should format currency consistently with dollar sign and commas", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(50000)).toBe("$50,000.00");
  });

  it("should format percentages with 1 decimal place", () => {
    expect(formatPercent(42.856)).toBe("42.9%");
    expect(formatPercent(100)).toBe("100.0%");
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("should parse signed SHAP reason strings", () => {
    const reason1 = "Logged in 0 times in last 30 days (+25%)";
    const parsed1 = parseShapReason(reason1);
    expect(parsed1.text).toBe("Logged in 0 times in last 30 days");
    expect(parsed1.sign).toBe("+");
    expect(parsed1.percentage).toBe(25);
    expect(parsed1.direction).toBe("increases");

    const reason2 = "Customer for 4 years (-15%)";
    const parsed2 = parseShapReason(reason2);
    expect(parsed2.text).toBe("Customer for 4 years");
    expect(parsed2.sign).toBe("-");
    expect(parsed2.percentage).toBe(15);
    expect(parsed2.direction).toBe("decreases");
  });

  it("should correctly classify risk levels", () => {
    expect(getRiskTier(15)).toBe("Low");
    expect(getRiskTier(29.9)).toBe("Low");
    expect(getRiskTier(30.0)).toBe("Medium");
    expect(getRiskTier(59.9)).toBe("Medium");
    expect(getRiskTier(60.0)).toBe("High");
    expect(getRiskTier(85)).toBe("High");
  });
});
