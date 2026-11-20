import { describe, it, expect } from "vitest";
import {
  recalculateMetricsFromProbabilities,
  findBestF1Threshold,
  calculateRevenueAtRisk,
  computeRiskDistributionBins,
} from "@/lib/metrics";

describe("Metrics & Threshold Recalculation (TDD)", () => {
  const sampleTestProbabilities = [
    { y_true: 1, prob: 0.85 }, // True Positive at 0.5
    { y_true: 1, prob: 0.65 }, // True Positive at 0.5
    { y_true: 0, prob: 0.55 }, // False Positive at 0.5
    { y_true: 0, prob: 0.25 }, // True Negative at 0.5
    { y_true: 1, prob: 0.35 }, // False Negative at 0.5
    { y_true: 0, prob: 0.10 }, // True Negative at 0.5
  ];

  it("should recalculate accuracy, precision, recall, f1 and confusion matrix at threshold 0.5", () => {
    const metrics = recalculateMetricsFromProbabilities(sampleTestProbabilities, 0.5);

    // At threshold 0.5:
    // y_pred: [1, 1, 1, 0, 0, 0]
    // y_true: [1, 1, 0, 0, 1, 0]
    // TP: 2 (indices 0, 1)
    // FP: 1 (index 2)
    // FN: 1 (index 4)
    // TN: 2 (indices 3, 5)
    expect(metrics.confusion_matrix.tp).toBe(2);
    expect(metrics.confusion_matrix.fp).toBe(1);
    expect(metrics.confusion_matrix.fn).toBe(1);
    expect(metrics.confusion_matrix.tn).toBe(2);

    expect(metrics.accuracy).toBeCloseTo(4 / 6, 3);
    expect(metrics.precision).toBeCloseTo(2 / 3, 3);
    expect(metrics.recall).toBeCloseTo(2 / 3, 3);
    expect(metrics.f1).toBeCloseTo(2 / 3, 3);
  });

  it("should update metrics when threshold is shifted to 0.7", () => {
    const metrics = recalculateMetricsFromProbabilities(sampleTestProbabilities, 0.7);

    // At threshold 0.7:
    // y_pred: [1, 0, 0, 0, 0, 0]
    // TP: 1 (index 0)
    // FP: 0
    // FN: 2 (indices 1, 4)
    // TN: 3 (indices 2, 3, 5)
    expect(metrics.confusion_matrix.tp).toBe(1);
    expect(metrics.confusion_matrix.fp).toBe(0);
    expect(metrics.confusion_matrix.fn).toBe(2);
    expect(metrics.confusion_matrix.tn).toBe(3);
    expect(metrics.precision).toBe(1.0);
    expect(metrics.recall).toBeCloseTo(1 / 3, 3);
  });

  it("should find the optimal F1 threshold", () => {
    const best = findBestF1Threshold(sampleTestProbabilities);
    expect(best.threshold).toBeGreaterThanOrEqual(0.1);
    expect(best.threshold).toBeLessThanOrEqual(0.9);
    expect(best.f1).toBeGreaterThan(0);
  });

  it("should calculate revenue at risk accurately for LEAVE customers", () => {
    const predictions = [
      { prediction: "LEAVE" as const, annual_spend: 1200 },
      { prediction: "STAY" as const, annual_spend: 800 },
      { prediction: "LEAVE" as const, annual_spend: 2500 },
    ];
    const revenue = calculateRevenueAtRisk(predictions);
    expect(revenue).toBe(3700);
  });

  it("should compute risk distribution bins (0-10, 10-20, ... 90-100)", () => {
    const probs = [5, 15, 25, 25, 75, 95];
    const bins = computeRiskDistributionBins(probs);
    expect(bins).toHaveLength(10);
    expect(bins[0].count).toBe(1); // 0-10
    expect(bins[1].count).toBe(1); // 10-20
    expect(bins[2].count).toBe(2); // 20-30
    expect(bins[7].count).toBe(1); // 70-80
    expect(bins[9].count).toBe(1); // 90-100
  });
});
