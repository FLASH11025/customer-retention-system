"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { getModelMetrics } from "@/lib/api";
import {
  recalculateMetricsFromProbabilities,
  findBestF1Threshold,
} from "@/lib/metrics";
import { BentoCard, BentoHeader } from "@/components/ui/Card";
import { MonoNumber } from "@/components/ui/MonoNumber";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LightningIcon, ArrowUpRightIcon, ShieldCheckIcon } from "@/components/ui/Icons";

export default function ModelLabPage() {
  const { metrics, setMetrics, threshold, setThreshold } = useAppStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!metrics) {
      setLoading(true);
      getModelMetrics()
        .then((m) => {
          if (m) setMetrics(m);
        })
        .catch(() => {
          // Backend offline — the global banner shows the retry state
        })
        .finally(() => setLoading(false));
    }
  }, [metrics, setMetrics]);

  // Optimal F1 threshold calculation
  const bestF1Info = useMemo(() => {
    if (!metrics?.test_probabilities || metrics.test_probabilities.length === 0) {
      return { threshold: 0.5, f1: metrics?.f1 || 0 };
    }
    return findBestF1Threshold(metrics.test_probabilities);
  }, [metrics]);

  // In-browser dynamic threshold recalculations
  const activeMetrics = useMemo(() => {
    if (!metrics) return null;
    if (!metrics.test_probabilities || metrics.test_probabilities.length === 0) {
      return {
        accuracy: metrics.accuracy,
        precision: metrics.precision,
        recall: metrics.recall,
        f1: metrics.f1,
        confusion_matrix: metrics.confusion_matrix,
        threshold: 0.5,
      };
    }
    return recalculateMetricsFromProbabilities(metrics.test_probabilities, threshold);
  }, [metrics, threshold]);

  if (!metrics && !loading) {
    return (
      <EmptyState
        icon={<LightningIcon size={24} />}
        title="No Model Trained Yet"
        description="The machine learning laboratory requires a trained model artifact. Upload a training dataset to train an XGBoost classifier with automated hyperparameter tuning and cross-validation."
        actionText="Train XGBoost Model"
        actionHref="/upload"
      />
    );
  }

  if (loading || !metrics || !activeMetrics) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex items-center gap-2 font-mono text-xs text-signal-muted">
          <span className="w-2.5 h-2.5 rounded-full bg-signal-lime animate-ping" />
          Loading model metrics and probability artifacts...
        </div>
      </div>
    );
  }

  const { cv_scores, roc_auc, roc_curve, algorithm, trained_at } = metrics;
  const cm = activeMetrics.confusion_matrix;
  const totalCM = cm.tn + cm.fp + cm.fn + cm.tp || 1;

  // Mean & std for CV
  const cvMean =
    cv_scores && cv_scores.length > 0
      ? cv_scores.reduce((a, b) => a + b, 0) / cv_scores.length
      : 0;

  // SVG ROC curve points
  const rocPoints =
    roc_curve?.fpr?.map((fpr, i) => {
      const tpr = roc_curve.tpr[i];
      // SVG viewBox is 0 0 300 300
      // x: 0 -> 300, y: 1 - tpr -> 0 -> 300
      const x = fpr * 260 + 30;
      const y = 270 - tpr * 240;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ") || "";

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-signal-hairline pb-6">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-signal-muted">
            Model Evaluation & Tuning
          </span>
          <h1 className="font-display italic text-3xl sm:text-4xl text-signal-ink mt-1">
            Model Laboratory
          </h1>
          <p className="text-sm text-signal-muted mt-1">
            Production classifier: <strong className="text-signal-ink">{algorithm}</strong> • Trained: {new Date(trained_at).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/upload">
            <Button variant="secondary" size="sm">
              Retrain Model
            </Button>
          </Link>
          <Link href="/radar">
            <Button variant="primary" size="sm" icon={<ArrowUpRightIcon size={14} />}>
              Open Risk Radar
            </Button>
          </Link>
        </div>
      </div>

      {/* Dynamic Threshold Slider Banner */}
      <BentoCard className="border-signal-ink/20 dark:border-signal-lime/30 bg-signal-surface-alt/50">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-signal-muted">
                Decision Threshold Recalculator
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-signal-lime text-[#14130F]">
                {(threshold * 100).toFixed(0)}%
              </span>
              {Math.abs(threshold - bestF1Info.threshold) < 0.01 && (
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-signal-safe/20 text-signal-safe border border-signal-safe/30">
                  Best F1 Optimal
                </span>
              )}
            </div>
            <p className="text-xs text-signal-muted">
              Slide to test trade-offs between catching more churners (Recall) vs minimizing false alarms (Precision).
            </p>
          </div>

          <div className="flex items-center gap-4 flex-1 max-w-md">
            <input
              type="range"
              min="0.05"
              max="0.95"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-full accent-signal-ink dark:accent-signal-lime cursor-pointer h-2 bg-signal-hairline rounded-lg"
              aria-label="Adjust decision threshold"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setThreshold(bestF1Info.threshold)}
              className="shrink-0 text-xs"
            >
              Snap to Best F1 ({(bestF1Info.threshold * 100).toFixed(0)}%)
            </Button>
          </div>
        </div>
      </BentoCard>

      {/* Evaluated Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <BentoCard>
          <div className="text-xs font-mono text-signal-muted uppercase">ROC-AUC</div>
          <div className="text-3xl font-mono font-bold text-signal-ink mt-2">
            <MonoNumber value={roc_auc * 100} decimals={1} suffix="%" />
          </div>
          <p className="text-[11px] text-signal-muted mt-1.5">Discrimination ability</p>
        </BentoCard>

        <BentoCard>
          <div className="text-xs font-mono text-signal-muted uppercase">Recall (Churners)</div>
          <div className="text-3xl font-mono font-bold text-signal-safe mt-2">
            <MonoNumber value={activeMetrics.recall * 100} decimals={1} suffix="%" />
          </div>
          <p className="text-[11px] text-signal-muted mt-1.5">Churners caught</p>
        </BentoCard>

        <BentoCard>
          <div className="text-xs font-mono text-signal-muted uppercase">Precision</div>
          <div className="text-3xl font-mono font-bold text-signal-ink mt-2">
            <MonoNumber value={activeMetrics.precision * 100} decimals={1} suffix="%" />
          </div>
          <p className="text-[11px] text-signal-muted mt-1.5">True positive confidence</p>
        </BentoCard>

        <BentoCard>
          <div className="text-xs font-mono text-signal-muted uppercase">F1-Score</div>
          <div className="text-3xl font-mono font-bold text-signal-ink mt-2">
            <MonoNumber value={activeMetrics.f1 * 100} decimals={1} suffix="%" />
          </div>
          <p className="text-[11px] text-signal-muted mt-1.5">Harmonic balance</p>
        </BentoCard>

        <BentoCard>
          <div className="text-xs font-mono text-signal-muted uppercase">Accuracy</div>
          <div className="text-3xl font-mono font-bold text-signal-ink mt-2">
            <MonoNumber value={activeMetrics.accuracy * 100} decimals={1} suffix="%" />
          </div>
          <p className="text-[11px] text-signal-muted mt-1.5">Overall correctness</p>
        </BentoCard>
      </div>

      {/* Visual Diagnostic Grid: ROC Curve & Confusion Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ROC Curve Chart */}
        <BentoCard>
          <BentoHeader
            title="ROC Curve"
            subtitle={`Receiver Operating Characteristic (AUC = ${(roc_auc * 100).toFixed(1)}%)`}
          />

          <div className="relative flex justify-center py-4">
            <svg
              viewBox="0 0 300 300"
              className="w-full max-w-[340px] aspect-square overflow-visible"
              aria-label="ROC Curve chart"
            >
              {/* Grid Lines */}
              <rect x="30" y="30" width="240" height="240" fill="none" stroke="currentColor" className="text-signal-hairline" />
              <line x1="30" y1="90" x2="270" y2="90" stroke="currentColor" className="text-signal-hairline" strokeDasharray="3 3" />
              <line x1="30" y1="150" x2="270" y2="150" stroke="currentColor" className="text-signal-hairline" strokeDasharray="3 3" />
              <line x1="30" y1="210" x2="270" y2="210" stroke="currentColor" className="text-signal-hairline" strokeDasharray="3 3" />
              <line x1="90" y1="30" x2="90" y2="270" stroke="currentColor" className="text-signal-hairline" strokeDasharray="3 3" />
              <line x1="150" y1="30" x2="150" y2="270" stroke="currentColor" className="text-signal-hairline" strokeDasharray="3 3" />
              <line x1="210" y1="30" x2="210" y2="270" stroke="currentColor" className="text-signal-hairline" strokeDasharray="3 3" />

              {/* Diagonal No-Skill Reference */}
              <line x1="30" y1="270" x2="270" y2="30" stroke="currentColor" className="text-signal-muted opacity-40" strokeDasharray="4 4" strokeWidth="1.5" />

              {/* Model ROC Curve */}
              {rocPoints && (
                <polyline
                  points={rocPoints}
                  fill="none"
                  stroke="#3F8F5F"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Labels */}
              <text x="30" y="290" className="text-[10px] font-mono fill-signal-muted" textAnchor="middle">0.0</text>
              <text x="150" y="290" className="text-[10px] font-mono fill-signal-muted" textAnchor="middle">False Positive Rate (0.5)</text>
              <text x="270" y="290" className="text-[10px] font-mono fill-signal-muted" textAnchor="middle">1.0</text>

              <text x="18" y="275" className="text-[10px] font-mono fill-signal-muted" textAnchor="end">0.0</text>
              <text x="18" y="155" className="text-[10px] font-mono fill-signal-muted" textAnchor="end">0.5</text>
              <text x="18" y="35" className="text-[10px] font-mono fill-signal-muted" textAnchor="end">1.0</text>
            </svg>
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-signal-muted pt-2 border-t border-signal-hairline">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-[#3F8F5F] rounded" /> XGBoost Model Curve
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 border-t border-dashed border-signal-muted" /> Random Baseline
            </span>
          </div>
        </BentoCard>

        {/* Confusion Matrix Heatmap */}
        <BentoCard>
          <BentoHeader
            title="Confusion Matrix"
            subtitle={`Calculated at threshold ${(threshold * 100).toFixed(0)}% on test split`}
          />

          <div className="pt-2">
            <div className="text-center text-xs font-mono text-signal-muted mb-2 uppercase tracking-wider">
              Predicted Label
            </div>

            <div className="flex">
              {/* Actual Y-axis label */}
              <div className="flex items-center justify-center -rotate-90 text-xs font-mono text-signal-muted uppercase tracking-wider pr-2">
                Actual
              </div>

              {/* 2x2 Matrix */}
              <div className="flex-1 grid grid-cols-2 gap-3">
                {/* True Negative */}
                <div
                  className="p-5 rounded-20 border border-signal-hairline flex flex-col items-center justify-center text-center transition-colors"
                  style={{
                    backgroundColor: `rgba(63, 143, 95, ${Math.max(0.12, (cm.tn / totalCM) * 0.45)})`,
                  }}
                >
                  <span className="text-[11px] font-mono text-signal-muted uppercase">True Negative (Stay)</span>
                  <span className="text-3xl font-mono font-bold text-signal-ink mt-1">
                    <MonoNumber value={cm.tn} />
                  </span>
                  <span className="text-[11px] font-mono text-signal-muted mt-1">
                    {((cm.tn / totalCM) * 100).toFixed(1)}% of test
                  </span>
                </div>

                {/* False Positive */}
                <div
                  className="p-5 rounded-20 border border-signal-hairline flex flex-col items-center justify-center text-center transition-colors"
                  style={{
                    backgroundColor: `rgba(224, 165, 38, ${Math.max(0.1, (cm.fp / totalCM) * 0.45)})`,
                  }}
                >
                  <span className="text-[11px] font-mono text-signal-muted uppercase">False Positive (False Alarm)</span>
                  <span className="text-3xl font-mono font-bold text-signal-watch mt-1">
                    <MonoNumber value={cm.fp} />
                  </span>
                  <span className="text-[11px] font-mono text-signal-muted mt-1">
                    {((cm.fp / totalCM) * 100).toFixed(1)}% of test
                  </span>
                </div>

                {/* False Negative */}
                <div
                  className="p-5 rounded-20 border border-signal-hairline flex flex-col items-center justify-center text-center transition-colors"
                  style={{
                    backgroundColor: `rgba(232, 69, 44, ${Math.max(0.1, (cm.fn / totalCM) * 0.5)})`,
                  }}
                >
                  <span className="text-[11px] font-mono text-signal-muted uppercase">False Negative (Missed Churn)</span>
                  <span className="text-3xl font-mono font-bold text-signal-danger mt-1">
                    <MonoNumber value={cm.fn} />
                  </span>
                  <span className="text-[11px] font-mono text-signal-muted mt-1">
                    {((cm.fn / totalCM) * 100).toFixed(1)}% of test
                  </span>
                </div>

                {/* True Positive */}
                <div
                  className="p-5 rounded-20 border border-signal-hairline flex flex-col items-center justify-center text-center transition-colors"
                  style={{
                    backgroundColor: `rgba(63, 143, 95, ${Math.max(0.15, (cm.tp / totalCM) * 0.5)})`,
                  }}
                >
                  <span className="text-[11px] font-mono text-signal-muted uppercase">True Positive (Caught Churn)</span>
                  <span className="text-3xl font-mono font-bold text-signal-safe mt-1">
                    <MonoNumber value={cm.tp} />
                  </span>
                  <span className="text-[11px] font-mono text-signal-muted mt-1">
                    {((cm.tp / totalCM) * 100).toFixed(1)}% of test
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-16 bg-signal-surface-alt border border-signal-hairline text-xs font-mono text-signal-muted">
              Total Test Samples: <strong className="text-signal-ink">{totalCM}</strong> • Catch Rate: <strong className="text-signal-safe">{((cm.tp / (cm.tp + cm.fn || 1)) * 100).toFixed(1)}%</strong>
            </div>
          </div>
        </BentoCard>
      </div>

      {/* Cross-Validation & Architecture Details */}
      <BentoCard>
        <BentoHeader
          title="5-Fold Cross Validation Stability"
          subtitle={`Mean ROC-AUC: ${(cvMean * 100).toFixed(1)}% across independent folds`}
        />

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          {cv_scores && cv_scores.length > 0 ? (
            cv_scores.map((score, i) => (
              <div key={i} className="p-3.5 rounded-16 bg-signal-surface-alt border border-signal-hairline text-center">
                <span className="text-[11px] font-mono text-signal-muted">Fold {i + 1}</span>
                <p className="text-lg font-mono font-bold text-signal-ink mt-1">
                  {(score * 100).toFixed(1)}%
                </p>
                <div className="w-full bg-signal-hairline h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-signal-safe h-full rounded-full" style={{ width: `${score * 100}%` }} />
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-signal-muted col-span-5">No CV score folds recorded.</p>
          )}
        </div>
      </BentoCard>
    </div>
  );
}
