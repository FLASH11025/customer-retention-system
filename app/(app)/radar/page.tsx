"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { getLastPredictions } from "@/lib/api";
import { computeRiskDistributionBins } from "@/lib/metrics";
import { formatCurrency } from "@/lib/format";
import { BentoCard, BentoHeader } from "@/components/ui/Card";
import { MonoNumber } from "@/components/ui/MonoNumber";
import { RiskPulse } from "@/components/ui/RiskPulse";
import { RiskStrip } from "@/components/ui/RiskStrip";
import { StatusBadge, RiskBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RadarIcon, ArrowUpRightIcon, DoorIcon } from "@/components/ui/Icons";

export default function RiskRadarPage() {
  const { summary, predictions, setPredictionResults } = useAppStore();
  const [segmentBy, setSegmentBy] = useState<"InternetService" | "Contract" | "PaymentMethod">("InternetService");

  // Recovery: if the local cohort is gone (new tab, cleared storage, browser
  // restart) but the backend still holds the last scored batch, hydrate it.
  const [recovering, setRecovering] = useState<boolean>(predictions === null);
  useEffect(() => {
    if (predictions && predictions.length > 0) {
      setRecovering(false);
      return;
    }
    let cancelled = false;
    getLastPredictions()
      .then((last) => {
        if (!cancelled && last && last.predictions && last.predictions.length > 0) {
          setPredictionResults(last.summary, last.predictions);
        }
      })
      .catch(() => {
        // backend offline or no batch yet — the empty state below guides the user
      })
      .finally(() => {
        if (!cancelled) setRecovering(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Histogram deciles
  const distributionBins = useMemo(() => {
    if (!predictions || predictions.length === 0) return [];
    const probs = predictions.map((p) => p.churn_probability_pct);
    return computeRiskDistributionBins(probs);
  }, [predictions]);

  // Risk tier counts
  const riskCounts = useMemo(() => {
    if (!predictions) return { low: 0, medium: 0, high: 0 };
    let low = 0, medium = 0, high = 0;
    for (const p of predictions) {
      if (p.risk_level === "High" || p.churn_probability_pct >= 60) high++;
      else if (p.risk_level === "Medium" || p.churn_probability_pct >= 30) medium++;
      else low++;
    }
    return { low, medium, high };
  }, [predictions]);

  // Dynamic segmentation
  const segmentData = useMemo(() => {
    if (!predictions || predictions.length === 0) return [];
    const groups: Record<string, { count: number; leavers: number; totalRisk: number; totalSpend: number }> = {};

    for (const p of predictions) {
      const key = (p[segmentBy] as string) || "Unknown";
      if (!groups[key]) {
        groups[key] = { count: 0, leavers: 0, totalRisk: 0, totalSpend: 0 };
      }
      groups[key].count += 1;
      if (p.prediction.toUpperCase() === "LEAVE") groups[key].leavers += 1;
      groups[key].totalRisk += p.churn_probability_pct;
      groups[key].totalSpend += Number(p.annual_spend) || 0;
    }

    return Object.entries(groups).map(([name, data]) => ({
      name,
      count: data.count,
      leavers: data.leavers,
      avgRiskPct: data.totalRisk / data.count,
      totalSpend: data.totalSpend,
      churnRate: (data.leavers / data.count) * 100,
    })).sort((a, b) => b.avgRiskPct - a.avgRiskPct);
  }, [predictions, segmentBy]);

  // Top 10 high-risk leavers
  const topAtRisk = useMemo(() => {
    if (!predictions) return [];
    return [...predictions]
      .sort((a, b) => b.churn_probability_pct - a.churn_probability_pct)
      .slice(0, 8);
  }, [predictions]);

  if (!summary || !predictions || predictions.length === 0) {
    if (recovering) {
      return (
        <EmptyState
          icon={<RadarIcon size={24} />}
          title="Checking for a scored cohort…"
          description="Looking for predictions from your last scoring run. If none exist yet, score a CSV to populate the Risk Radar."
        />
      );
    }
    return (
      <EmptyState
        icon={<RadarIcon size={24} />}
        title="No Customer Cohort Scored Yet"
        description="Training a model does not score customers — these pages need a scored batch. Go to Upload → 'Score Customers' mode and upload a CSV (Telco 20-column or legacy 13-column layout) to generate churn predictions, risk tiers, and revenue exposure."
        actionText="Score Customers Batch"
        actionHref="/upload"
      />
    );
  }

  const maxBinCount = Math.max(...distributionBins.map((b) => b.count), 1);

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-signal-hairline pb-6">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-signal-muted">
            Executive Intelligence
          </span>
          <h1 className="font-display italic text-3xl sm:text-4xl text-signal-ink mt-1">
            Risk Radar
          </h1>
          <p className="text-sm text-signal-muted mt-1">
            Macro cohort analytics, exposure distribution, and prioritized retention signals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/customers">
            <Button variant="secondary" size="sm">
              All Customers Table
            </Button>
          </Link>
          <Link href="/playbook">
            <Button variant="primary" size="sm" icon={<ArrowUpRightIcon size={14} />}>
              Open Playbook
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <BentoCard>
          <div className="text-xs font-mono text-signal-muted uppercase tracking-wider">
            Total Scored Cohort
          </div>
          <div className="text-3xl font-mono font-bold text-signal-ink mt-2">
            <MonoNumber value={summary.total_customers} />
          </div>
          <p className="text-[11px] text-signal-muted mt-2">Active accounts analyzed</p>
        </BentoCard>

        <BentoCard>
          <div className="text-xs font-mono text-signal-muted uppercase tracking-wider">
            Predicted to Churn
          </div>
          <div className="text-3xl font-mono font-bold text-signal-danger mt-2">
            <MonoNumber value={summary.predicted_to_leave} />
          </div>
          <p className="text-[11px] text-signal-muted mt-2">
            {((summary.predicted_to_leave / summary.total_customers) * 100).toFixed(1)}% of customer base
          </p>
        </BentoCard>

        <BentoCard>
          <div className="text-xs font-mono text-signal-muted uppercase tracking-wider">
            Annual Revenue At Risk
          </div>
          <div className="text-3xl font-mono font-bold text-signal-ink mt-2">
            {formatCurrency(summary.revenue_at_risk)}
          </div>
          <p className="text-[11px] text-signal-danger font-mono font-semibold mt-2">
            Immediate intervention pool
          </p>
        </BentoCard>

        <BentoCard>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-signal-muted uppercase tracking-wider">
                Mean Cohort Risk
              </div>
              <div className="text-3xl font-mono font-bold text-signal-ink mt-2">
                <MonoNumber value={summary.avg_churn_risk_pct} decimals={1} suffix="%" />
              </div>
              <p className="text-[11px] text-signal-muted mt-2">Across all accounts</p>
            </div>
            <RiskPulse value={summary.avg_churn_risk_pct} size="md" />
          </div>
        </BentoCard>
      </div>

      {/* Risk Proportions Strip */}
      <BentoCard>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-signal-ink">Cohort Risk Composition</h3>
            <p className="text-xs text-signal-muted">Segmented into Low (&lt;30%), Medium (30-60%), and High (&gt;60%)</p>
          </div>
        </div>
        <RiskStrip
          low={riskCounts.low}
          medium={riskCounts.medium}
          high={riskCounts.high}
          height={10}
          showLabels={true}
        />
      </BentoCard>

      {/* Visual Diagnostic Charts: Histogram & Segmentation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Distribution Histogram */}
        <BentoCard>
          <BentoHeader
            title="Churn Probability Distribution"
            subtitle="Customer frequency binned in 10% risk intervals"
          />

          <div className="space-y-3 pt-4">
            <div className="flex items-end gap-1.5 h-44 w-full pt-4 border-b border-signal-hairline">
              {distributionBins.map((bin) => {
                const heightPct = Math.max(6, (bin.count / maxBinCount) * 100);
                let barColor = "bg-signal-safe";
                if (bin.min >= 60) barColor = "bg-signal-danger";
                else if (bin.min >= 30) barColor = "bg-signal-watch";

                return (
                  <div
                    key={bin.range}
                    className="flex-1 flex flex-col items-center justify-end h-full group relative"
                  >
                    {/* Tooltip */}
                    <div className="absolute -top-9 opacity-0 group-hover:opacity-100 transition-opacity bg-signal-ink text-signal-bg px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap z-10 pointer-events-none shadow-md">
                      {bin.count} customers ({bin.range})
                    </div>

                    <div
                      className={`w-full rounded-t-sm transition-all duration-300 ${barColor}`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between text-[10px] font-mono text-signal-muted">
              <span>0% (Safe)</span>
              <span>50% (Tipping point)</span>
              <span>100% (Imminent)</span>
            </div>
          </div>
        </BentoCard>

        {/* Dynamic Segmentation Chart */}
        <BentoCard>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-semibold text-signal-ink">Cohort Segmentation</h3>
              <p className="text-xs text-signal-muted">Average churn risk and leavers by dimension</p>
            </div>

            {/* Segment dimension buttons */}
            <div className="flex items-center p-0.5 bg-signal-surface-alt border border-signal-hairline rounded-12 text-xs">
              <button
                type="button"
                onClick={() => setSegmentBy("InternetService")}
                className={`px-2.5 py-1 rounded-8 font-medium transition-all ${
                  segmentBy === "InternetService"
                    ? "bg-signal-ink text-signal-bg dark:bg-signal-lime dark:text-[#14130F]"
                    : "text-signal-muted hover:text-signal-ink"
                }`}
              >
                Internet
              </button>
              <button
                type="button"
                onClick={() => setSegmentBy("Contract")}
                className={`px-2.5 py-1 rounded-8 font-medium transition-all ${
                  segmentBy === "Contract"
                    ? "bg-signal-ink text-signal-bg dark:bg-signal-lime dark:text-[#14130F]"
                    : "text-signal-muted hover:text-signal-ink"
                }`}
              >
                Contract
              </button>
              <button
                type="button"
                onClick={() => setSegmentBy("PaymentMethod")}
                className={`px-2.5 py-1 rounded-8 font-medium transition-all ${
                  segmentBy === "PaymentMethod"
                    ? "bg-signal-ink text-signal-bg dark:bg-signal-lime dark:text-[#14130F]"
                    : "text-signal-muted hover:text-signal-ink"
                }`}
              >
                Payment
              </button>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            {segmentData.map((seg) => (
              <div key={seg.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-semibold text-signal-ink">{seg.name}</span>
                  <span className="text-signal-muted">
                    {seg.avgRiskPct.toFixed(1)}% avg risk • {seg.leavers}/{seg.count} leavers ({formatCurrency(seg.totalSpend)})
                  </span>
                </div>
                <div className="w-full h-2.5 bg-signal-hairline rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      seg.avgRiskPct >= 60
                        ? "bg-signal-danger"
                        : seg.avgRiskPct >= 30
                        ? "bg-signal-watch"
                        : "bg-signal-safe"
                    }`}
                    style={{ width: `${Math.min(100, seg.avgRiskPct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </BentoCard>
      </div>

      {/* Top Priority At-Risk Accounts */}
      <BentoCard>
        <BentoHeader
          title="Top Critical Accounts Requiring Immediate Retention"
          subtitle="Highest predicted churn risk with annual contract revenue exposure"
          action={
            <Link href="/customers">
              <span className="text-xs font-mono text-signal-ink hover:underline">
                View all {predictions.length} customers →
              </span>
            </Link>
          }
        />

        <div className="overflow-x-auto border border-signal-hairline rounded-16">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-signal-surface-alt border-b border-signal-hairline font-mono text-signal-muted">
              <tr>
                <th className="p-3">Customer ID</th>
                <th className="p-3">Prediction</th>
                <th className="p-3">Risk Probability</th>
                <th className="p-3">Annual Spend</th>
                <th className="p-3">Primary Churn Driver</th>
                <th className="p-3">Recommended Play</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-signal-hairline font-mono">
              {topAtRisk.map((c) => (
                <tr key={c.customer_id} className="hover:bg-signal-surface-alt/40 transition-colors">
                  <td className="p-3 font-bold text-signal-ink">
                    <Link href={`/customers/${encodeURIComponent(c.customer_id)}`} className="hover:underline">
                      {c.customer_id}
                    </Link>
                  </td>
                  <td className="p-3">
                    <StatusBadge status={c.prediction} size="sm" />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <RiskPulse value={c.churn_probability_pct} size="sm" showValue={false} />
                      <span className="font-bold text-signal-ink">{c.churn_probability_pct.toFixed(1)}%</span>
                      <RiskBadge level={c.risk_level} />
                    </div>
                  </td>
                  <td className="p-3 text-signal-ink font-semibold">
                    {formatCurrency(c.annual_spend)}
                  </td>
                  <td className="p-3 font-sans text-signal-ink max-w-[200px] truncate" title={c.top_reasons?.[0] || "N/A"}>
                    {c.top_reasons?.[0] || "N/A"}
                  </td>
                  <td className="p-3 font-sans text-xs text-signal-muted max-w-[220px] truncate" title={c.suggested_action}>
                    {c.suggested_action}
                  </td>
                  <td className="p-3 text-right">
                    <Link href={`/customers/${encodeURIComponent(c.customer_id)}`}>
                      <button
                        type="button"
                        className="p-1.5 rounded-8 hover:bg-signal-hairline text-signal-ink transition-colors"
                        title="View Full Profile"
                      >
                        <ArrowUpRightIcon size={14} />
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BentoCard>
    </div>
  );
}
