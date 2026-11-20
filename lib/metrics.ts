/**
 * Client-side metric recalculations and aggregations.
 * Recalculates confusion matrix, precision, recall, F1, and revenue at risk
 * dynamically in the browser without re-running training.
 */

export interface TestProbabilityItem {
  y_true: number;
  prob: number;
}

export interface RecalculatedMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  confusion_matrix: {
    tn: number;
    fp: number;
    fn: number;
    tp: number;
  };
  threshold: number;
}

export function recalculateMetricsFromProbabilities(
  testProbabilities: TestProbabilityItem[],
  threshold: number
): RecalculatedMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  for (const item of testProbabilities) {
    const yPred = item.prob >= threshold ? 1 : 0;
    if (item.y_true === 1 && yPred === 1) tp++;
    else if (item.y_true === 0 && yPred === 1) fp++;
    else if (item.y_true === 1 && yPred === 0) fn++;
    else if (item.y_true === 0 && yPred === 0) tn++;
  }

  const total = tp + fp + fn + tn;
  const accuracy = total > 0 ? (tp + tn) / total : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    accuracy,
    precision,
    recall,
    f1,
    confusion_matrix: { tn, fp, fn, tp },
    threshold,
  };
}

export function findBestF1Threshold(
  testProbabilities: TestProbabilityItem[]
): { threshold: number; f1: number } {
  let bestThreshold = 0.5;
  let bestF1 = -1;

  for (let t = 0.1; t <= 0.9; t += 0.05) {
    const roundedT = Math.round(t * 100) / 100;
    const { f1 } = recalculateMetricsFromProbabilities(
      testProbabilities,
      roundedT
    );
    if (f1 > bestF1) {
      bestF1 = f1;
      bestThreshold = roundedT;
    }
  }

  return { threshold: bestThreshold, f1: bestF1 };
}

export function calculateRevenueAtRisk(
  predictions: Array<{ prediction: string; annual_spend?: number }>
): number {
  return predictions
    .filter((p) => p.prediction.toUpperCase() === "LEAVE")
    .reduce((sum, p) => sum + (Number(p.annual_spend) || 0), 0);
}

export interface RiskBin {
  range: string;
  min: number;
  max: number;
  count: number;
}

export function computeRiskDistributionBins(
  probabilities: number[]
): RiskBin[] {
  const bins: RiskBin[] = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}-${(i + 1) * 10}%`,
    min: i * 10,
    max: (i + 1) * 10,
    count: 0,
  }));

  for (const prob of probabilities) {
    const clamped = Math.max(0, Math.min(100, prob));
    const idx = Math.min(9, Math.floor(clamped / 10));
    bins[idx].count++;
  }

  return bins;
}
