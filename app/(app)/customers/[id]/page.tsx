"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { formatCurrency, parseShapReason } from "@/lib/format";
import { BentoCard, BentoHeader } from "@/components/ui/Card";
import { RiskPulse } from "@/components/ui/RiskPulse";
import { StatusBadge, RiskBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ShieldCheckIcon, LightningIcon, DoorIcon, ArrowUpRightIcon } from "@/components/ui/Icons";

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id as string;
  const customerId = rawId ? decodeURIComponent(rawId) : "";

  const { predictions, retentionDone, toggleRetentionDone } = useAppStore();

  const customer = useMemo(() => {
    if (!predictions || !customerId) return null;
    return predictions.find((p) => p.customer_id === customerId) || null;
  }, [predictions, customerId]);

  // Compute cohort medians for telemetry comparison (Telco schema)
  const cohortMedians = useMemo(() => {
    if (!predictions || predictions.length === 0) return null;

    const numericFields = [
      "tenure",
      "MonthlyCharges",
      "TotalCharges",
      "annual_spend",
    ] as const;

    const medians: Record<string, number> = {};

    numericFields.forEach((field) => {
      const vals = predictions
        .map((p) => Number(p[field]))
        .filter((v) => !isNaN(v))
        .sort((a, b) => a - b);

      if (vals.length > 0) {
        const mid = Math.floor(vals.length / 2);
        medians[field] = vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
      } else {
        medians[field] = 0;
      }
    });

    return medians;
  }, [predictions]);

  if (!customer) {
    return (
      <EmptyState
        icon={<DoorIcon size={24} />}
        title={`Customer "${customerId}" Not Found`}
        description="This account was not found in the current scored cohort. Make sure you have scored the customer file or run a single prediction."
        actionText="Back to Customers Directory"
        actionHref="/customers"
      />
    );
  }

  const isDone = !!retentionDone[customer.customer_id];
  const parsedReasons = (customer.top_reasons || []).map((r) => parseShapReason(r));

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between border-b border-signal-hairline pb-4 text-xs font-mono">
        <div className="flex items-center gap-2 text-signal-muted">
          <Link href="/customers" className="hover:text-signal-ink transition-colors">
            ← Directory
          </Link>
          <span>/</span>
          <span className="text-signal-ink font-bold">{customer.customer_id}</span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/simulator?customer_id=${encodeURIComponent(customer.customer_id)}&contract=${encodeURIComponent(
              customer.Contract || "Month-to-month"
            )}&payment=${encodeURIComponent(customer.PaymentMethod || "Electronic check")}&internet=${encodeURIComponent(
              customer.InternetService || "DSL"
            )}&tenure=${customer.tenure ?? 12}&monthly=${customer.MonthlyCharges || 50}&total=${
              customer.TotalCharges || (customer.MonthlyCharges ?? 0) * (customer.tenure || 1)
            }`}
          >
            <Button variant="secondary" size="sm" icon={<LightningIcon size={14} />}>
              Test in Simulator
            </Button>
          </Link>
        </div>
      </div>

      {/* Hero Customer Card */}
      <BentoCard className="p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h1 className="font-display italic text-3xl sm:text-4xl text-signal-ink">
                {customer.customer_id}
              </h1>
              <StatusBadge status={customer.prediction} size="md" />
              <RiskBadge level={customer.risk_level} />
            </div>

            <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-signal-muted">
              <span>Internet: <strong className="text-signal-ink">{customer.InternetService || "N/A"}</strong></span>
              <span>•</span>
              <span>Contract: <strong className="text-signal-ink">{customer.Contract || "N/A"}</strong></span>
              <span>•</span>
              <span>Payment: <strong className="text-signal-ink">{customer.PaymentMethod || "N/A"}</strong></span>
              <span>•</span>
              <span>Tenure: <strong className="text-signal-ink font-semibold">{customer.tenure ?? "N/A"} months</strong></span>
              <span>•</span>
              <span>Annual Value: <strong className="text-signal-ink font-semibold">{formatCurrency(customer.annual_spend)}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs font-mono uppercase text-signal-muted">Model Risk Score</div>
              <div className="text-3xl font-mono font-bold text-signal-ink">
                {customer.churn_probability_pct.toFixed(1)}%
              </div>
              <p className="text-[11px] text-signal-muted mt-0.5">Probability of churning</p>
            </div>
            <RiskPulse value={customer.churn_probability_pct} size="lg" />
          </div>
        </div>
      </BentoCard>

      {/* SHAP Feature Drivers & Action Play */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SHAP Explanations */}
        <BentoCard className="lg:col-span-2">
          <BentoHeader
            title="SHAP Explainability & Root Causes"
            subtitle="Local feature contributions computed dynamically via TreeExplainer"
          />

          <div className="space-y-4 pt-2">
            {parsedReasons.length > 0 ? (
              parsedReasons.map((r, i) => {
                const isRiskIncrease = r.sign === "+";
                return (
                  <div
                    key={i}
                    className={`p-4 rounded-16 border transition-all ${
                      isRiskIncrease
                        ? "bg-[#FCE8E6]/40 border-signal-danger/30 dark:bg-signal-danger/10"
                        : "bg-[#E6F4EA]/40 border-signal-safe/30 dark:bg-signal-safe/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isRiskIncrease ? "bg-signal-danger" : "bg-signal-safe"
                          }`}
                        />
                        <span className="text-sm font-medium text-signal-ink">
                          {r.text}
                        </span>
                      </div>
                      {r.percentage && (
                        <span
                          className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                            isRiskIncrease
                              ? "bg-signal-danger/20 text-signal-danger"
                              : "bg-signal-safe/20 text-signal-safe"
                          }`}
                        >
                          {r.sign}
                          {r.percentage}% impact
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-signal-muted">No individual SHAP drivers available.</p>
            )}
          </div>
        </BentoCard>

        {/* Action Playbook */}
        <BentoCard className="flex flex-col justify-between">
          <div>
            <BentoHeader
              title="Prescribed Retention Play"
              subtitle="Algorithmically assigned mitigation strategy"
            />

            <div className="p-4 rounded-16 bg-signal-surface-alt border border-signal-hairline mt-3 space-y-2">
              <span className="text-[11px] font-mono text-signal-muted uppercase tracking-wider block">
                Recommended Action
              </span>
              <p className="text-base font-semibold text-signal-ink">
                {customer.suggested_action || "Account Review Required"}
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-signal-hairline mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-signal-muted">Intervention Status:</span>
              <span className="text-xs font-mono font-bold text-signal-ink">
                {isDone ? "Completed" : "Pending Action"}
              </span>
            </div>

            <Button
              variant={isDone ? "secondary" : "primary"}
              size="md"
              className="w-full"
              onClick={() => toggleRetentionDone(customer.customer_id)}
              icon={<ShieldCheckIcon size={16} />}
            >
              {isDone ? "Mark As Incomplete" : "Mark Playbook Completed"}
            </Button>
          </div>
        </BentoCard>
      </div>

      {/* Cohort Comparison & Telemetry Benchmark */}
      {cohortMedians && (
        <BentoCard>
          <BentoHeader
            title="Telemetry vs Cohort Median"
            subtitle="Benchmark of customer behavioral signals against the broader population"
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-2">
            {[
              {
                label: "Tenure",
                val: `${customer.tenure ?? 0} months`,
                med: `${cohortMedians.tenure || 0} months`,
              },
              {
                label: "Monthly Charges",
                val: formatCurrency(customer.MonthlyCharges || 0),
                med: formatCurrency(cohortMedians.MonthlyCharges || 0),
              },
              {
                label: "Total Charges",
                val: formatCurrency(customer.TotalCharges || 0),
                med: formatCurrency(cohortMedians.TotalCharges || 0),
              },
              {
                label: "Annual Value",
                val: formatCurrency(customer.annual_spend || 0),
                med: formatCurrency(cohortMedians.annual_spend || 0),
              },
              {
                label: "Internet Service",
                val: customer.InternetService || "N/A",
                med: "cohort mode",
              },
            ].map((stat, i) => (
              <div key={i} className="p-3.5 rounded-16 bg-signal-surface-alt border border-signal-hairline">
                <span className="text-[11px] font-mono text-signal-muted uppercase block">
                  {stat.label}
                </span>
                <div className="text-lg font-mono font-bold text-signal-ink mt-1">
                  {stat.val}
                </div>
                <div className="text-[10px] font-mono text-signal-muted mt-0.5">
                  Median: {stat.med}
                </div>
              </div>
            ))}
          </div>
        </BentoCard>
      )}
    </div>
  );
}
