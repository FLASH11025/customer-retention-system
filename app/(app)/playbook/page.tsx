"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/format";
import { BentoCard, BentoHeader } from "@/components/ui/Card";
import { RiskPulse } from "@/components/ui/RiskPulse";
import { RiskBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PlaybookIcon, ShieldCheckIcon, ArrowUpRightIcon, DoorIcon } from "@/components/ui/Icons";

export default function RetentionPlaybookPage() {
  const { predictions, retentionDone, toggleRetentionDone } = useAppStore();

  // Group leavers and at-risk accounts by suggested_action
  const actionLanes = useMemo(() => {
    if (!predictions || predictions.length === 0) return [];

    const lanesMap: Record<
      string,
      {
        action: string;
        customers: typeof predictions;
        totalRevenue: number;
        completedCount: number;
      }
    > = {};

    for (const p of predictions) {
      // Focus primarily on accounts flagged to leave or with medium/high risk
      const action = p.suggested_action || "General Account Health Review";

      if (!lanesMap[action]) {
        lanesMap[action] = {
          action,
          customers: [],
          totalRevenue: 0,
          completedCount: 0,
        };
      }

      lanesMap[action].customers.push(p);
      lanesMap[action].totalRevenue += Number(p.annual_spend) || 0;
      if (retentionDone[p.customer_id]) {
        lanesMap[action].completedCount += 1;
      }
    }

    return Object.values(lanesMap).sort(
      (a, b) => b.totalRevenue - a.totalRevenue
    );
  }, [predictions, retentionDone]);

  // Overall playbook metrics
  const totalTasks = predictions?.length || 0;
  const completedTasks = useMemo(() => {
    if (!predictions) return 0;
    return predictions.filter((p) => !!retentionDone[p.customer_id]).length;
  }, [predictions, retentionDone]);

  const totalAtRiskRevenue = useMemo(() => {
    if (!predictions) return 0;
    return predictions
      .filter((p) => p.prediction.toUpperCase() === "LEAVE")
      .reduce((sum, p) => sum + (Number(p.annual_spend) || 0), 0);
  }, [predictions]);

  const handleExportLaneCsv = (actionTitle: string, customers: typeof predictions) => {
    if (!customers || customers.length === 0) return;

    const headers = [
      "customer_id",
      "churn_probability_pct",
      "risk_level",
      "annual_spend",
      "suggested_action",
      "primary_reason",
      "retention_completed",
    ];

    const rows = [
      headers.join(","),
      ...customers.map((c) =>
        [
          `"${c.customer_id}"`,
          c.churn_probability_pct,
          `"${c.risk_level}"`,
          c.annual_spend || 0,
          `"${(c.suggested_action || "").replace(/"/g, '""')}"`,
          `"${(c.top_reasons?.[0] || "").replace(/"/g, '""')}"`,
          retentionDone[c.customer_id] ? "YES" : "NO",
        ].join(",")
      ),
    ];

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `playbook_lane_${actionTitle.slice(0, 20).replace(/\s+/g, "_")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!predictions || predictions.length === 0) {
    return (
      <EmptyState
        icon={<PlaybookIcon size={24} />}
        title="No Retention Playbook Available"
        description="The retention playbook groups accounts into actionable mitigation workflows based on machine learning explainability and suggested interventions."
        actionText="Score Customer File"
        actionHref="/upload"
      />
    );
  }

  const completionPct = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-signal-hairline pb-6">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-signal-muted">
            Customer Success Workflows
          </span>
          <h1 className="font-display italic text-3xl sm:text-4xl text-signal-ink mt-1">
            Retention Playbook
          </h1>
          <p className="text-sm text-signal-muted mt-1">
            Segmented intervention lanes categorized by root-cause mitigation strategy.
          </p>
        </div>

        <Link href="/customers">
          <Button variant="secondary" size="sm" icon={<ArrowUpRightIcon size={14} />}>
            View All Customers
          </Button>
        </Link>
      </div>

      {/* Playbook Progress Banner */}
      <BentoCard className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase text-signal-muted">
                Retention Campaign Execution
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-signal-safe/20 text-signal-safe">
                {completionPct.toFixed(0)}% Completed
              </span>
            </div>
            <p className="text-xs text-signal-muted">
              <strong className="text-signal-ink font-mono">{completedTasks}</strong> of {totalTasks} account interventions marked done.
            </p>
          </div>

          <div className="text-right">
            <span className="text-[11px] font-mono uppercase text-signal-muted">Revenue Exposure</span>
            <div className="text-2xl font-mono font-bold text-signal-ink">
              {formatCurrency(totalAtRiskRevenue)}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-signal-hairline h-2 rounded-full overflow-hidden mt-4">
          <div
            className="h-full bg-signal-safe rounded-full transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </BentoCard>

      {/* Action Lanes (Kanban Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {actionLanes.map((lane) => {
          const laneDonePct =
            lane.customers.length > 0
              ? (lane.completedCount / lane.customers.length) * 100
              : 0;

          return (
            <div
              key={lane.action}
              className="flex flex-col rounded-24 border border-signal-hairline bg-signal-surface p-5 space-y-4"
            >
              {/* Lane Header */}
              <div className="border-b border-signal-hairline pb-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm text-signal-ink leading-snug">
                    {lane.action}
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleExportLaneCsv(lane.action, lane.customers)}
                    className="p-1 rounded hover:bg-signal-hairline text-signal-muted hover:text-signal-ink transition-colors text-[10px] font-mono shrink-0"
                    title="Export Lane CSV"
                  >
                    CSV ↓
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-signal-muted mt-2">
                  <span>
                    {lane.customers.length} accounts • {formatCurrency(lane.totalRevenue)}
                  </span>
                  <span className="text-signal-safe font-semibold">
                    {laneDonePct.toFixed(0)}% done
                  </span>
                </div>
              </div>

              {/* Lane Cards List */}
              <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px] pr-1">
                {lane.customers.map((c) => {
                  const isDone = !!retentionDone[c.customer_id];

                  return (
                    <div
                      key={c.customer_id}
                      className={`p-3.5 rounded-16 border transition-all ${
                        isDone
                          ? "bg-signal-surface-alt/40 border-signal-hairline opacity-60"
                          : "bg-signal-surface-alt border-signal-hairline hover:border-signal-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/customers/${encodeURIComponent(c.customer_id)}`}
                          className="font-mono font-bold text-xs text-signal-ink hover:underline"
                        >
                          {c.customer_id}
                        </Link>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={c.prediction} size="sm" />
                          <RiskBadge level={c.risk_level} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs font-mono mt-2 pt-2 border-t border-signal-hairline/60">
                        <div className="flex items-center gap-1.5">
                          <RiskPulse value={c.churn_probability_pct} size="sm" showValue={false} />
                          <span className="font-semibold text-signal-ink">
                            {c.churn_probability_pct.toFixed(0)}%
                          </span>
                        </div>
                        <span className="text-signal-muted">
                          {formatCurrency(c.annual_spend)}
                        </span>
                      </div>

                      {c.top_reasons?.[0] && (
                        <p className="text-[11px] font-sans text-signal-muted mt-2 truncate" title={c.top_reasons[0]}>
                          • {c.top_reasons[0]}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-3 mt-2 border-t border-signal-hairline/60">
                        <button
                          type="button"
                          onClick={() => toggleRetentionDone(c.customer_id)}
                          className={`flex items-center gap-1.5 text-xs font-mono transition-colors ${
                            isDone ? "text-signal-safe font-semibold" : "text-signal-muted hover:text-signal-ink"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isDone}
                            readOnly
                            className="w-3.5 h-3.5 rounded accent-signal-safe pointer-events-none"
                          />
                          <span>{isDone ? "Intervention Logged" : "Mark Done"}</span>
                        </button>

                        <Link
                          href={`/customers/${encodeURIComponent(c.customer_id)}`}
                          className="text-[10px] font-mono text-signal-muted hover:text-signal-ink flex items-center gap-0.5"
                        >
                          Detail →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
