"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { getModelMetrics } from "@/lib/api";
import { BentoCard, BentoHeader } from "@/components/ui/Card";
import { MonoNumber } from "@/components/ui/MonoNumber";
import { RiskStrip } from "@/components/ui/RiskStrip";
import { RiskPulse } from "@/components/ui/RiskPulse";
import {
  PulseIcon,
  ShieldIcon,
  DoorIcon,
  PlaybookIcon,
  LightningIcon,
  ArrowUpRightIcon,
} from "@/components/ui/Icons";

export default function MarketingOverviewPage() {
  const { metrics, setMetrics, predictions, summary } = useAppStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    getModelMetrics()
      .then((data) => setMetrics(data))
      .catch(() => setMetrics(null));
  }, [setMetrics]);

  // Determine state-adaptive primary CTA
  const hasModel = Boolean(metrics);
  const hasPredictions = Boolean(predictions && predictions.length > 0);

  let ctaText = "Train your first model";
  let ctaHref = "/upload";
  let ctaSubtitle = "Upload sample training data to fit XGBoost in 10 seconds";

  if (hasModel && !hasPredictions) {
    ctaText = "Upload customers to score";
    ctaHref = "/upload";
    ctaSubtitle = `Model trained (${metrics?.algorithm || "XGBoost"}). Feed customer CSV to forecast churn.`;
  } else if (hasModel && hasPredictions) {
    ctaText = "View at-risk customers";
    ctaHref = "/radar";
    ctaSubtitle = `${summary?.predicted_to_leave || 0} accounts forecasted to leave • Explore Risk Radar`;
  }

  // 3-step strip progress
  const step1Done = hasModel || hasPredictions;
  const step2Done = hasModel;
  const step3Done = hasPredictions;

  return (
    <div className="space-y-16 py-8 md:py-16 px-6 md:px-12 max-w-7xl mx-auto">
      {/* Hero Section */}
      <section className="relative rounded-24 border border-signal-hairline bg-signal-surface p-8 md:p-14 overflow-hidden shadow-sm">
        <div className="absolute inset-0 hero-grid opacity-30 pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-signal-hairline bg-signal-bg text-xs font-mono text-signal-muted">
            <span className="w-2 h-2 rounded-full bg-signal-lime animate-pulse" />
            <span>Zero Mock • Real XGBoost Pipeline • SHAP Attribution</span>
          </div>

          <h1 className="font-display italic text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-signal-ink leading-tightest">
            Know who will leave, <br className="hidden sm:inline" />
            <span className="font-sans not-italic font-black text-transparent bg-clip-text bg-gradient-to-r from-signal-ink to-signal-muted">
              and why
            </span>
            , before they do.
          </h1>

          <p className="text-base sm:text-lg text-signal-muted max-w-2xl font-sans leading-relaxed">
            Stop guessing customer churn. Train an explainable machine learning pipeline on your subscriber data, calculate revenue at risk, and receive automated retention interventions.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-2.5 px-6 py-4 rounded-16 bg-signal-ink text-signal-bg dark:bg-signal-lime dark:text-[#14130F] font-bold text-base hover:opacity-95 shadow-md hover:-translate-y-0.5 transition-all"
            >
              <span>{ctaText}</span>
              <ArrowUpRightIcon size={18} />
            </Link>
            <span className="text-xs font-mono text-signal-muted">
              {ctaSubtitle}
            </span>
          </div>
        </div>
      </section>

      {/* 3-Step How-It-Works Strip */}
      <section className="rounded-24 border border-signal-hairline bg-signal-surface p-6 md:p-8">
        <div className="text-xs font-mono uppercase tracking-wider text-signal-muted mb-4">
          Autonomous Pipeline Workflow
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Step 1 */}
          <div className="flex items-start gap-4 p-4 rounded-20 bg-signal-bg/50 border border-signal-hairline/60">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                step1Done
                  ? "bg-signal-safe text-white"
                  : "bg-signal-hairline text-signal-muted"
              }`}
            >
              {step1Done ? "✓" : "1"}
            </div>
            <div>
              <h4 className="text-sm font-bold text-signal-ink">1. Upload CSV</h4>
              <p className="text-xs text-signal-muted mt-1 leading-relaxed">
                Feed clean customer cohorts. Headers are validated in the browser against schema constraints.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-4 p-4 rounded-20 bg-signal-bg/50 border border-signal-hairline/60">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                step2Done
                  ? "bg-signal-safe text-white"
                  : "bg-signal-hairline text-signal-muted"
              }`}
            >
              {step2Done ? "✓" : "2"}
            </div>
            <div>
              <h4 className="text-sm font-bold text-signal-ink">2. Fit XGBoost Model</h4>
              <p className="text-xs text-signal-muted mt-1 leading-relaxed">
                Applies SMOTE balancing to train split only, tunes hyperparameters, and outputs real ROC-AUC.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-4 p-4 rounded-20 bg-signal-bg/50 border border-signal-hairline/60">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                step3Done
                  ? "bg-signal-safe text-white"
                  : "bg-signal-hairline text-signal-muted"
              }`}
            >
              {step3Done ? "✓" : "3"}
            </div>
            <div>
              <h4 className="text-sm font-bold text-signal-ink">3. Act on Risk</h4>
              <p className="text-xs text-signal-muted mt-1 leading-relaxed">
                Inspect per-customer SHAP drivers, adjust decision thresholds live, and execute retention lanes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Live Stats Bento or First Step Onboarding */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display italic text-3xl font-bold text-signal-ink">
            Live System Telemetry
          </h2>
          <span className="text-xs font-mono text-signal-muted">
            Derived from active backend state
          </span>
        </div>

        {hasPredictions && summary ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <BentoCard>
              <BentoHeader title="Accounts Scored" subtitle="Active prediction cohort" />
              <div className="text-4xl font-black font-mono text-signal-ink">
                <MonoNumber value={summary.total_customers} />
              </div>
              <p className="text-xs text-signal-muted mt-2">
                Processed via FastAPI TreeExplainer
              </p>
            </BentoCard>

            <BentoCard variant="alt">
              <BentoHeader title="Predicted Leavers" subtitle="Flagged with LEAVE badge" />
              <div className="text-4xl font-black font-mono text-signal-danger">
                <MonoNumber value={summary.predicted_to_leave} />
              </div>
              <p className="text-xs text-signal-muted mt-2">
                Avg Risk: {summary.avg_churn_risk_pct}%
              </p>
            </BentoCard>

            <BentoCard>
              <BentoHeader title="Revenue At Stake" subtitle="Annual spend of leavers" />
              <div className="text-4xl font-black font-mono text-signal-ink">
                <MonoNumber
                  value={summary.revenue_at_risk}
                  prefix="$"
                  decimals={2}
                />
              </div>
              <p className="text-xs text-signal-muted mt-2">
                Priority retention focus
              </p>
            </BentoCard>

            <BentoCard>
              <BentoHeader title="Model ROC-AUC" subtitle="Holdout test split score" />
              <div className="text-4xl font-black font-mono text-signal-safe">
                <MonoNumber
                  value={metrics?.roc_auc ? metrics.roc_auc * 100 : 0}
                  suffix="%"
                  decimals={1}
                />
              </div>
              <p className="text-xs text-signal-muted mt-2 font-mono">
                {metrics?.algorithm || "XGBoost"}
              </p>
            </BentoCard>
          </div>
        ) : hasModel && metrics ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <BentoCard>
              <BentoHeader title="Model Trained" subtitle={metrics.algorithm} />
              <div className="text-3xl font-mono font-bold text-signal-ink">
                {metrics.accuracy ? `${(metrics.accuracy * 100).toFixed(1)}%` : "Ready"}
              </div>
              <p className="text-xs text-signal-muted mt-2">
                Holdout Test Accuracy ({metrics.test_rows} samples)
              </p>
            </BentoCard>

            <BentoCard>
              <BentoHeader title="Discrimination (ROC-AUC)" subtitle="Separation power" />
              <div className="text-3xl font-mono font-bold text-signal-safe">
                {metrics.roc_auc ? (metrics.roc_auc * 100).toFixed(1) : "0.0"}%
              </div>
              <p className="text-xs text-signal-muted mt-2">
                Cross-validated on balanced training split
              </p>
            </BentoCard>

            <BentoCard variant="alt" className="flex flex-col justify-between">
              <div>
                <BentoHeader title="Next Milestone" subtitle="Run customer cohort" />
                <p className="text-xs text-signal-muted">
                  Feed active customer accounts to view risk radar, revenue at risk, and SHAP factors.
                </p>
              </div>
              <Link
                href="/upload"
                className="mt-4 text-xs font-bold text-signal-ink inline-flex items-center gap-1 hover:underline"
              >
                Upload cohort now ↗
              </Link>
            </BentoCard>
          </div>
        ) : (
          <BentoCard className="p-8 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-signal-hairline/40 flex items-center justify-center text-signal-muted mb-3">
              <LightningIcon size={24} />
            </div>
            <h3 className="font-display italic text-2xl text-signal-ink font-bold">
              No dataset trained yet
            </h3>
            <p className="text-sm text-signal-muted max-w-md mt-1 mb-6">
              Download the provided sample CSV or provide your historical SaaS churn records to initialize the XGBoost pipeline.
            </p>
            <Link
              href="/upload"
              className="px-5 py-2.5 rounded-16 bg-signal-ink text-signal-bg dark:bg-signal-lime dark:text-[#14130F] font-bold text-xs tracking-tight"
            >
              Start in Upload Hub ↗
            </Link>
          </BentoCard>
        )}
      </section>

      {/* "What You Get" Feature Bento */}
      <section className="space-y-6">
        <h2 className="font-display italic text-3xl font-bold text-signal-ink">
          Built for Precision Customer Retention
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <BentoCard>
            <div className="w-9 h-9 rounded-12 bg-signal-ink/5 dark:bg-signal-lime/10 flex items-center justify-center text-signal-ink dark:text-signal-lime mb-4">
              <ShieldIcon size={20} />
            </div>
            <h3 className="text-sm font-bold text-signal-ink">SHAP Explainability</h3>
            <p className="text-xs text-signal-muted mt-1 leading-relaxed">
              Every score translates into signed, human-readable percentages explaining why each subscriber might churn.
            </p>
          </BentoCard>

          <BentoCard>
            <div className="w-9 h-9 rounded-12 bg-signal-ink/5 dark:bg-signal-lime/10 flex items-center justify-center text-signal-ink dark:text-signal-lime mb-4">
              <LightningIcon size={20} />
            </div>
            <h3 className="text-sm font-bold text-signal-ink">Dynamic Thresholds</h3>
            <p className="text-xs text-signal-muted mt-1 leading-relaxed">
              Recalculate precision, recall, and revenue at stake live in the browser to match your team’s intervention capacity.
            </p>
          </BentoCard>

          <BentoCard>
            <div className="w-9 h-9 rounded-12 bg-signal-ink/5 dark:bg-signal-lime/10 flex items-center justify-center text-signal-ink dark:text-signal-lime mb-4">
              <PlaybookIcon size={20} />
            </div>
            <h3 className="text-sm font-bold text-signal-ink">Retention Playbook</h3>
            <p className="text-xs text-signal-muted mt-1 leading-relaxed">
              Automated routing of at-risk accounts into intervention lanes (support escalation, discount offers, CSM outreach).
            </p>
          </BentoCard>

          <BentoCard>
            <div className="w-9 h-9 rounded-12 bg-signal-ink/5 dark:bg-signal-lime/10 flex items-center justify-center text-signal-ink dark:text-signal-lime mb-4">
              <PulseIcon size={20} accent />
            </div>
            <h3 className="text-sm font-bold text-signal-ink">What-If Simulator</h3>
            <p className="text-xs text-signal-muted mt-1 leading-relaxed">
              Tweak login cadence, unresolved tickets, or plan parameters in real-time to observe dynamic risk trajectory.
            </p>
          </BentoCard>
        </div>
      </section>

      {/* Short FAQ Section */}
      <section className="rounded-24 border border-signal-hairline bg-signal-surface p-8 space-y-6">
        <h2 className="font-display italic text-2xl font-bold text-signal-ink">
          Frequently Answered Questions
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-signal-muted leading-relaxed">
          <div className="space-y-1.5">
            <h4 className="font-bold text-sm text-signal-ink">What data format is expected?</h4>
            <p>
              Standard CSV containing subscriber attributes: tenure, contract structure, monthly charges, login frequency, support tickets, and feature scores.
            </p>
          </div>

          <div className="space-y-1.5">
            <h4 className="font-bold text-sm text-signal-ink">Where does customer data live?</h4>
            <p>
              Strictly local on your machine. All model fitting and inference occurs against your local Python process on <code>localhost:8000</code>.
            </p>
          </div>

          <div className="space-y-1.5">
            <h4 className="font-bold text-sm text-signal-ink">How are explanations calculated?</h4>
            <p>
              We run SHAP TreeExplainer across trees to measure marginal feature contribution and express them as signed impact percentages.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
