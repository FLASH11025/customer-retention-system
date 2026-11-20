"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { getModelMetrics } from "@/lib/api";
import { BentoCard, BentoHeader } from "@/components/ui/Card";
import { MonoNumber } from "@/components/ui/MonoNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { ShieldCheckIcon, RadarIcon, ArrowUpRightIcon } from "@/components/ui/Icons";

export default function DataHealthPage() {
  const { metrics, setMetrics } = useAppStore();
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

  if (!metrics && !loading) {
    return (
      <EmptyState
        icon={<RadarIcon size={24} />}
        title="No Dataset Health Audit Available"
        description="Dataset health statistics and class balance transformations are generated during model training. Upload a training dataset to view data cleaning and SMOTE balancing metrics."
        actionText="Go to Upload & Train"
        actionHref="/upload"
      />
    );
  }

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex items-center gap-2 font-mono text-xs text-signal-muted">
          <span className="w-2.5 h-2.5 rounded-full bg-signal-lime animate-ping" />
          Loading data health audit...
        </div>
      </div>
    );
  }

  const { cleaning, class_balance, train_rows, test_rows, churn_rate, categories } = metrics;

  const totalBefore = (class_balance.before.stayed || 0) + (class_balance.before.churned || 0);
  const beforeChurnPct = totalBefore > 0 ? ((class_balance.before.churned / totalBefore) * 100).toFixed(1) : "0";
  const beforeStayPct = totalBefore > 0 ? ((class_balance.before.stayed / totalBefore) * 100).toFixed(1) : "0";

  const totalAfter = (class_balance.after.stayed || 0) + (class_balance.after.churned || 0);
  const afterChurnPct = totalAfter > 0 ? ((class_balance.after.churned / totalAfter) * 100).toFixed(1) : "0";
  const afterStayPct = totalAfter > 0 ? ((class_balance.after.stayed / totalAfter) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-signal-hairline pb-6">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-signal-muted">
            Data Quality & Pipeline
          </span>
          <h1 className="font-display italic text-3xl sm:text-4xl text-signal-ink mt-1">
            Data Health & SMOTE Audit
          </h1>
          <p className="text-sm text-signal-muted mt-1">
            Automated preprocessing pipeline telemetry, cleaning summaries, and synthetic minority balancing.
          </p>
        </div>

        <Link href="/model">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-16 bg-signal-surface border border-signal-hairline hover:bg-signal-surface-alt transition-colors">
            <span>View Trained Model</span>
            <ArrowUpRightIcon size={14} />
          </div>
        </Link>
      </div>

      {/* Cleaning Overview Bento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <BentoCard>
          <div className="text-xs font-mono text-signal-muted uppercase tracking-wider">Raw Input Rows</div>
          <div className="text-3xl font-mono font-bold text-signal-ink mt-2">
            <MonoNumber value={cleaning.rows_in} />
          </div>
          <p className="text-[11px] text-signal-muted mt-2">Rows parsed from original CSV</p>
        </BentoCard>

        <BentoCard>
          <div className="text-xs font-mono text-signal-muted uppercase tracking-wider">Duplicates Dropped</div>
          <div className="text-3xl font-mono font-bold text-signal-safe mt-2">
            <MonoNumber value={cleaning.duplicates_removed} />
          </div>
          <p className="text-[11px] text-signal-muted mt-2">Deduplicated on customer_id</p>
        </BentoCard>

        <BentoCard>
          <div className="text-xs font-mono text-signal-muted uppercase tracking-wider">Missing Values Imputed</div>
          <div className="text-3xl font-mono font-bold text-signal-watch mt-2">
            <MonoNumber value={cleaning.missing_values} />
          </div>
          <p className="text-[11px] text-signal-muted mt-2">Median (numeric) / Mode (category)</p>
        </BentoCard>

        <BentoCard>
          <div className="text-xs font-mono text-signal-muted uppercase tracking-wider">Clean Training Dataset</div>
          <div className="text-3xl font-mono font-bold text-signal-ink mt-2">
            <MonoNumber value={cleaning.rows_out} />
          </div>
          <p className="text-[11px] text-signal-muted mt-2">Passed to 80/20 train-test split</p>
        </BentoCard>
      </div>

      {/* Source schema note (legacy CSVs are auto-mapped onto the Telco schema) */}
      {cleaning.schema === "legacy-mapped" && (
        <BentoCard>
          <div className="text-xs font-mono uppercase tracking-wider text-signal-watch font-semibold">
            Legacy Schema Detected — Auto-Mapped
          </div>
          <p className="text-xs text-signal-muted mt-2 leading-relaxed">
            This model was trained on a legacy-layout CSV (plan_type, contract_type, payment_method,
            account_age_months, ...). The pipeline mapped it deterministically onto the Telco schema:
          </p>
          <ul className="mt-3 space-y-1 font-mono text-[11px] text-signal-muted">
            {(cleaning.schema_mapping || []).map((note: string) => (
              <li key={note} className="break-words">• {note}</li>
            ))}
          </ul>
        </BentoCard>
      )}

      {/* Class Balance & SMOTE Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BentoCard>
          <BentoHeader
            title="Class Balance: Before SMOTE"
            subtitle={`Natural distribution (${(churn_rate * 100).toFixed(1)}% churn rate)`}
          />
          <div className="space-y-4 pt-2">
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-signal-safe font-semibold">Stayed (Class 0)</span>
                <span className="text-signal-muted">{class_balance.before.stayed} rows ({beforeStayPct}%)</span>
              </div>
              <div className="w-full h-3 bg-signal-hairline rounded-full overflow-hidden">
                <div
                  className="h-full bg-signal-safe rounded-full transition-all duration-500"
                  style={{ width: `${beforeStayPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-signal-danger font-semibold">Churned (Class 1)</span>
                <span className="text-signal-muted">{class_balance.before.churned} rows ({beforeChurnPct}%)</span>
              </div>
              <div className="w-full h-3 bg-signal-hairline rounded-full overflow-hidden">
                <div
                  className="h-full bg-signal-danger rounded-full transition-all duration-500"
                  style={{ width: `${beforeChurnPct}%` }}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-16 bg-signal-surface-alt border border-signal-hairline text-xs text-signal-muted leading-relaxed">
              <span className="font-semibold text-signal-ink">Observation:</span> Severe class imbalance naturally occurs in churn datasets. Training directly without oversampling biases the classifier toward the majority class.
            </div>
          </div>
        </BentoCard>

        <BentoCard>
          <BentoHeader
            title="Class Balance: After SMOTE"
            subtitle={`Balancing algorithm: ${class_balance.method}`}
          />
          <div className="space-y-4 pt-2">
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-signal-safe font-semibold">Stayed (Class 0)</span>
                <span className="text-signal-muted">{class_balance.after.stayed} rows ({afterStayPct}%)</span>
              </div>
              <div className="w-full h-3 bg-signal-hairline rounded-full overflow-hidden">
                <div
                  className="h-full bg-signal-safe rounded-full transition-all duration-500"
                  style={{ width: `${afterStayPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-signal-danger font-semibold">Synthesized Churn (Class 1)</span>
                <span className="text-signal-muted">{class_balance.after.churned} rows ({afterChurnPct}%)</span>
              </div>
              <div className="w-full h-3 bg-signal-hairline rounded-full overflow-hidden">
                <div
                  className="h-full bg-signal-danger rounded-full transition-all duration-500"
                  style={{ width: `${afterChurnPct}%` }}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-16 bg-signal-safe/10 border border-signal-safe/30 text-xs text-signal-safe leading-relaxed flex items-start gap-2">
              <ShieldCheckIcon size={16} className="shrink-0 mt-0.5" />
              <span>
                <strong>SMOTE applied exclusively to train split:</strong> Synthetic samples balance decision boundaries without causing data leakage into the test evaluation split ({test_rows} test rows).
              </span>
            </div>
          </div>
        </BentoCard>
      </div>

      {/* Dataset Partitions & Detected Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BentoCard>
          <BentoHeader title="Split Telemetry" subtitle="Stratified 80/20 train/test partition" />
          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between py-2 border-b border-signal-hairline">
              <span className="text-signal-muted">Train Split (80%)</span>
              <span className="font-bold text-signal-ink">{train_rows} rows</span>
            </div>
            <div className="flex justify-between py-2 border-b border-signal-hairline">
              <span className="text-signal-muted">Test Split (20%)</span>
              <span className="font-bold text-signal-ink">{test_rows} rows</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-signal-muted">Training Time</span>
              <span className="font-bold text-signal-ink">
                {metrics.training_seconds ? `${metrics.training_seconds.toFixed(2)}s` : "< 1s"}
              </span>
            </div>
          </div>
        </BentoCard>

        <BentoCard className="lg:col-span-2">
          <BentoHeader
            title="Categorical Domains Discovered"
            subtitle="Extracted dynamically from data during encoding (no hardcoded lists)."
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {Object.entries(categories || {}).map(([col, values]) => (
              <div key={col} className="p-3 rounded-16 border border-signal-hairline bg-signal-surface-alt">
                <span className="text-[11px] font-mono text-signal-muted uppercase tracking-wider block mb-2">
                  {col}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {values.map((v) => (
                    <span
                      key={v}
                      className="px-2 py-0.5 rounded-md font-mono text-xs bg-signal-surface border border-signal-hairline text-signal-ink font-medium"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </BentoCard>
      </div>
    </div>
  );
}
