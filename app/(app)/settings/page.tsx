"use client";

import React, { useState } from "react";
import { useAppStore } from "@/lib/store";
import { API_BASE_URL, getModelMetrics } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { BentoCard, BentoHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ShieldCheckIcon, LightningIcon, ArrowUpRightIcon } from "@/components/ui/Icons";

export default function SettingsAndReportsPage() {
  const { metrics, predictions, summary, clearSessionData } = useAppStore();

  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);

  const handleTestConnection = async () => {
    setIsPinging(true);
    setPingStatus(null);
    setPingLatency(null);

    const start = performance.now();
    try {
      const res = await getModelMetrics();
      const latency = Math.round(performance.now() - start);
      setPingLatency(latency);
      if (res) {
        setPingStatus(`Connected! ML Model active (${res.algorithm}, AUC: ${(res.roc_auc * 100).toFixed(1)}%).`);
      } else {
        setPingStatus(`Connected! Server online, but no model trained yet.`);
      }
    } catch (err: any) {
      setPingStatus(`Connection failed: ${err.message || "Could not reach server"}`);
    } finally {
      setIsPinging(false);
    }
  };

  const handleExportFullPredictionsCsv = () => {
    if (!predictions || predictions.length === 0) return;

    const headers = [
      "customer_id",
      "prediction",
      "churn_probability_pct",
      "risk_level",
      "annual_spend",
      "plan_type",
      "contract_type",
      "payment_method",
      "account_age_months",
      "monthly_charges",
      "logins_last_30d",
      "days_since_last_login",
      "support_tickets_total",
      "unresolved_tickets",
      "late_payments_count",
      "feature_usage_score",
      "suggested_action",
      "top_reasons",
    ];

    const rows = [
      headers.join(","),
      ...predictions.map((p) =>
        [
          `"${p.customer_id}"`,
          `"${p.prediction}"`,
          p.churn_probability_pct,
          `"${p.risk_level}"`,
          p.annual_spend || 0,
          `"${p.plan_type || ""}"`,
          `"${p.contract_type || ""}"`,
          `"${p.payment_method || ""}"`,
          p.account_age_months || 0,
          p.monthly_charges || 0,
          p.logins_last_30d || 0,
          p.days_since_last_login || 0,
          p.support_tickets_total || 0,
          p.unresolved_tickets || 0,
          p.late_payments_count || 0,
          p.feature_usage_score || 0,
          `"${(p.suggested_action || "").replace(/"/g, '""')}"`,
          `"${(p.top_reasons || []).join(" | ").replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ];

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `predictchurn_full_export_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportMetricsJson = () => {
    if (!metrics) return;

    const blob = new Blob([JSON.stringify(metrics, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `predictchurn_metrics_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-signal-hairline pb-6">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-signal-muted">
            Reports & Configurations
          </span>
          <h1 className="font-display italic text-3xl sm:text-4xl text-signal-ink mt-1">
            Exports & Diagnostics
          </h1>
          <p className="text-sm text-signal-muted mt-1">
            Data exports, printable executive summaries, system telemetry, and session management.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => window.print()}
          className="print:hidden"
        >
          Print Executive Report 🖨️
        </Button>
      </div>

      {/* Printable Executive Report (Visible in Print & Screen) */}
      <div className="print:block space-y-6">
        <BentoCard>
          <BentoHeader
            title="Executive Report Summary"
            subtitle="Compact briefing of latest scoring cohort and model evaluation"
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div className="p-3.5 rounded-16 bg-signal-surface-alt border border-signal-hairline">
              <span className="text-[10px] font-mono uppercase text-signal-muted block">
                Model Classifier
              </span>
              <p className="text-sm font-mono font-bold text-signal-ink mt-1">
                {metrics?.algorithm || "None Trained"}
              </p>
            </div>
            <div className="p-3.5 rounded-16 bg-signal-surface-alt border border-signal-hairline">
              <span className="text-[10px] font-mono uppercase text-signal-muted block">
                ROC-AUC Score
              </span>
              <p className="text-sm font-mono font-bold text-signal-ink mt-1">
                {metrics ? `${(metrics.roc_auc * 100).toFixed(1)}%` : "N/A"}
              </p>
            </div>
            <div className="p-3.5 rounded-16 bg-signal-surface-alt border border-signal-hairline">
              <span className="text-[10px] font-mono uppercase text-signal-muted block">
                Customers Scored
              </span>
              <p className="text-sm font-mono font-bold text-signal-ink mt-1">
                {summary?.total_customers ?? "None"}
              </p>
            </div>
            <div className="p-3.5 rounded-16 bg-signal-surface-alt border border-signal-hairline">
              <span className="text-[10px] font-mono uppercase text-signal-muted block">
                Revenue at Risk
              </span>
              <p className="text-sm font-mono font-bold text-signal-danger mt-1">
                {summary ? formatCurrency(summary.revenue_at_risk) : "N/A"}
              </p>
            </div>
          </div>
        </BentoCard>
      </div>

      {/* Export Center (Hidden when printing) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
        <BentoCard>
          <BentoHeader
            title="Data Export Center"
            subtitle="Download complete datasets and ML artifacts"
          />

          <div className="space-y-3 pt-2">
            <Button
              variant="secondary"
              className="w-full justify-between"
              onClick={handleExportFullPredictionsCsv}
              disabled={!predictions || predictions.length === 0}
            >
              <span>Download Full Predictions CSV</span>
              <span className="font-mono text-xs text-signal-muted">
                {predictions ? `${predictions.length} rows` : "No data"}
              </span>
            </Button>

            <Button
              variant="secondary"
              className="w-full justify-between"
              onClick={handleExportMetricsJson}
              disabled={!metrics}
            >
              <span>Download Model Metrics JSON</span>
              <span className="font-mono text-xs text-signal-muted">
                {metrics ? `${metrics.algorithm}` : "No model"}
              </span>
            </Button>
          </div>
        </BentoCard>

        {/* Backend Connection Diagnostics */}
        <BentoCard>
          <BentoHeader
            title="FastAPI Server Diagnostics"
            subtitle="Endpoint latency and health check verification"
          />

          <div className="space-y-3 pt-2">
            <div className="p-3 rounded-12 bg-signal-surface-alt border border-signal-hairline font-mono text-xs flex items-center justify-between">
              <span className="text-signal-muted">Base URL:</span>
              <span className="text-signal-ink font-bold">{API_BASE_URL}</span>
            </div>

            <Button
              variant="primary"
              className="w-full"
              onClick={handleTestConnection}
              disabled={isPinging}
              icon={<LightningIcon size={14} />}
            >
              {isPinging ? "Testing Connection..." : "Ping Backend API"}
            </Button>

            {pingStatus && (
              <div
                className={`p-3 rounded-12 text-xs font-mono border ${
                  pingLatency !== null
                    ? "bg-[#E6F4EA] text-[#137333] border-[#CEEAD6] dark:bg-[#137333]/20 dark:text-[#81C995] dark:border-[#137333]/40"
                    : "bg-[#FCE8E6] text-[#C5221F] border-[#F5C2C7] dark:bg-[#C5221F]/20 dark:text-[#F28B82] dark:border-[#C5221F]/40"
                }`}
              >
                <div>{pingStatus}</div>
                {pingLatency !== null && (
                  <div className="mt-1 font-bold">Latency: {pingLatency} ms</div>
                )}
              </div>
            )}
          </div>
        </BentoCard>
      </div>

      {/* Session Storage & Keyboard Shortcuts (Hidden when printing) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
        <BentoCard>
          <BentoHeader
            title="Session Storage"
            subtitle="Persisted client-side state across browser reloads"
          />

          <div className="space-y-3 pt-2">
            <p className="text-xs text-signal-muted leading-relaxed">
              All active predictions, filters, threshold settings, and completed retention playbook tasks are safely stored in your browser&apos;s session storage.
            </p>

            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm("Are you sure you want to clear your local predictions and state?")) {
                  clearSessionData();
                  window.location.reload();
                }
              }}
            >
              Clear Session & Reset
            </Button>
          </div>
        </BentoCard>

        <BentoCard>
          <BentoHeader
            title="Keyboard Shortcuts"
            subtitle="Efficiency controls for fast navigation"
          />

          <div className="space-y-2 pt-2 font-mono text-xs">
            <div className="flex justify-between py-1.5 border-b border-signal-hairline">
              <span className="text-signal-muted">Command Palette</span>
              <kbd className="px-2 py-0.5 rounded bg-signal-surface-alt border border-signal-hairline text-signal-ink">
                ⌘K / Ctrl+K
              </kbd>
            </div>
            <div className="flex justify-between py-1.5 border-b border-signal-hairline">
              <span className="text-signal-muted">Toggle Theme</span>
              <kbd className="px-2 py-0.5 rounded bg-signal-surface-alt border border-signal-hairline text-signal-ink">
                ⌘T / Ctrl+T
              </kbd>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-signal-muted">Close Palette / Modal</span>
              <kbd className="px-2 py-0.5 rounded bg-signal-surface-alt border border-signal-hairline text-signal-ink">
                Esc
              </kbd>
            </div>
          </div>
        </BentoCard>
      </div>
    </div>
  );
}
