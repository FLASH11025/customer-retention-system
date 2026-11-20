"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { getLastPredictions } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { BentoCard, BentoHeader } from "@/components/ui/Card";
import { RiskPulse } from "@/components/ui/RiskPulse";
import { StatusBadge, RiskBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DoorIcon, ArrowUpRightIcon, MagnifierIcon, ShieldCheckIcon } from "@/components/ui/Icons";

const PAGE_SIZE = 15;

export default function CustomersPage() {
  const { predictions, filters, setFilters, resetFilters, retentionDone, toggleRetentionDone, setPredictionResults } = useAppStore();

  // Recovery: hydrate the last backend-scored batch if local state is empty
  // (new tab, cleared storage, browser restart).
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

  const [sortField, setSortField] = useState<"churn_probability_pct" | "annual_spend" | "customer_id">("churn_probability_pct");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Collect unique internet service plans dynamically from predictions
  const availablePlans = useMemo(() => {
    if (!predictions) return [];
    const set = new Set<string>();
    predictions.forEach((p) => {
      if (p.InternetService) set.add(p.InternetService);
    });
    return Array.from(set).sort();
  }, [predictions]);

  // Filtered and sorted predictions
  const filteredPredictions = useMemo(() => {
    if (!predictions) return [];

    return predictions
      .filter((p) => {
        // Search
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const matchId = p.customer_id.toLowerCase().includes(q);
          const matchAction = p.suggested_action?.toLowerCase().includes(q);
          if (!matchId && !matchAction) return false;
        }

        // Status
        if (filters.predictionStatus !== "ALL") {
          if (p.prediction.toUpperCase() !== filters.predictionStatus) return false;
        }

        // Risk Level
        if (filters.riskLevels.length > 0) {
          if (!filters.riskLevels.includes(p.risk_level)) return false;
        }

        // Plan (InternetService)
        if (filters.plans.length > 0 && p.InternetService) {
          if (!filters.plans.includes(p.InternetService)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [predictions, filters, sortField, sortAsc]);

  // Pagination slice
  const totalPages = Math.ceil(filteredPredictions.length / PAGE_SIZE) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredPredictions.slice(start, start + PAGE_SIZE);
  }, [filteredPredictions, currentPage]);

  const handleSort = (field: "churn_probability_pct" | "annual_spend" | "customer_id") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
    setCurrentPage(1);
  };

  const handleExportFilteredCsv = () => {
    if (filteredPredictions.length === 0) return;

    const headers = [
      "customer_id",
      "prediction",
      "churn_probability_pct",
      "risk_level",
      "annual_spend",
      "InternetService",
      "Contract",
      "suggested_action",
      "top_reasons",
    ];

    const csvRows = [
      headers.join(","),
      ...filteredPredictions.map((p) => {
        return [
          `"${p.customer_id}"`,
          `"${p.prediction}"`,
          p.churn_probability_pct,
          `"${p.risk_level}"`,
          p.annual_spend || 0,
          `"${p.InternetService || ""}"`,
          `"${p.Contract || ""}"`,
          `"${(p.suggested_action || "").replace(/"/g, '""')}"`,
          `"${(p.top_reasons || []).join(" | ").replace(/"/g, '""')}"`,
        ].join(",");
      }),
    ];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `predictchurn_filtered_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!predictions || predictions.length === 0) {
    if (recovering) {
      return (
        <EmptyState
          icon={<DoorIcon size={24} />}
          title="Checking for a scored cohort…"
          description="Looking for predictions from your last scoring run. If none exist yet, score a CSV to populate the customer directory."
        />
      );
    }
    return (
      <EmptyState
        icon={<DoorIcon size={24} />}
        title="No Scored Customer Data"
        description="Training a model does not score customers — this directory needs a scored batch. Go to Upload → 'Score Customers' mode and upload a CSV (Telco 20-column or legacy 13-column layout) to view per-account churn risk, SHAP drivers, and retention playbooks."
        actionText="Score Customer File"
        actionHref="/upload"
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-signal-hairline pb-6">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-signal-muted">
            Customer Directory
          </span>
          <h1 className="font-display italic text-3xl sm:text-4xl text-signal-ink mt-1">
            Accounts & Predictions
          </h1>
          <p className="text-sm text-signal-muted mt-1">
            Showing <strong className="text-signal-ink">{filteredPredictions.length}</strong> of {predictions.length} customers
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={handleExportFilteredCsv}>
            Export Filtered CSV ({filteredPredictions.length})
          </Button>
          <Link href="/simulator">
            <Button variant="primary" size="sm" icon={<ArrowUpRightIcon size={14} />}>
              Test Single Account
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters Bento Card */}
      <BentoCard className="p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-1">
            <label className="block text-[11px] font-mono uppercase text-signal-muted mb-1.5">
              Search Accounts
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="ID or suggested action..."
                value={filters.search}
                onChange={(e) => {
                  setFilters({ search: e.target.value });
                  setCurrentPage(1);
                }}
                className="w-full bg-signal-surface-alt border border-signal-hairline rounded-12 pl-8 pr-3 py-2 text-xs text-signal-ink placeholder:text-signal-muted focus:outline-none focus:border-signal-ink"
              />
              <MagnifierIcon
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-signal-muted"
              />
            </div>
          </div>

          {/* Prediction Status Filter */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-signal-muted mb-1.5">
              Status Filter
            </label>
            <div className="flex items-center p-0.5 bg-signal-surface-alt border border-signal-hairline rounded-12 text-xs">
              {(["ALL", "LEAVE", "STAY"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setFilters({ predictionStatus: st });
                    setCurrentPage(1);
                  }}
                  className={`flex-1 py-1.5 rounded-8 font-medium transition-all ${
                    filters.predictionStatus === st
                      ? "bg-signal-ink text-signal-bg dark:bg-signal-lime dark:text-[#14130F]"
                      : "text-signal-muted hover:text-signal-ink"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Risk Level Filter */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-signal-muted mb-1.5">
              Risk Level
            </label>
            <div className="flex items-center gap-1.5">
              {(["High", "Medium", "Low"] as const).map((lvl) => {
                const active = filters.riskLevels.includes(lvl);
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? filters.riskLevels.filter((x) => x !== lvl)
                        : [...filters.riskLevels, lvl];
                      setFilters({ riskLevels: next });
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-12 text-xs font-mono font-medium border transition-all ${
                      active
                        ? "bg-signal-ink text-signal-bg dark:bg-signal-lime dark:text-[#14130F] border-transparent"
                        : "bg-signal-surface-alt border-signal-hairline text-signal-muted hover:text-signal-ink"
                    }`}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Plan Filter */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-signal-muted mb-1.5">
              Plan Filter
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {availablePlans.map((pl) => {
                const active = filters.plans.includes(pl);
                return (
                  <button
                    key={pl}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? filters.plans.filter((x) => x !== pl)
                        : [...filters.plans, pl];
                      setFilters({ plans: next });
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-1.5 rounded-12 text-xs font-mono border transition-all ${
                      active
                        ? "bg-signal-ink text-signal-bg dark:bg-signal-lime dark:text-[#14130F] border-transparent"
                        : "bg-signal-surface-alt border-signal-hairline text-signal-muted hover:text-signal-ink"
                    }`}
                  >
                    {pl}
                  </button>
                );
              })}
              {(filters.search ||
                filters.predictionStatus !== "ALL" ||
                filters.riskLevels.length > 0 ||
                filters.plans.length > 0) && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-[11px] font-mono text-signal-muted hover:text-signal-danger underline ml-auto"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      </BentoCard>

      {/* Main Table */}
      <BentoCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-signal-surface-alt border-b border-signal-hairline font-mono text-signal-muted">
              <tr>
                <th
                  className="p-3.5 cursor-pointer hover:text-signal-ink transition-colors"
                  onClick={() => handleSort("customer_id")}
                >
                  Customer ID {sortField === "customer_id" && (sortAsc ? "▲" : "▼")}
                </th>
                <th className="p-3.5">Prediction</th>
                <th
                  className="p-3.5 cursor-pointer hover:text-signal-ink transition-colors"
                  onClick={() => handleSort("churn_probability_pct")}
                >
                  Risk Probability {sortField === "churn_probability_pct" && (sortAsc ? "▲" : "▼")}
                </th>
                <th
                  className="p-3.5 cursor-pointer hover:text-signal-ink transition-colors"
                  onClick={() => handleSort("annual_spend")}
                >
                  Annual Spend {sortField === "annual_spend" && (sortAsc ? "▲" : "▼")}
                </th>
                <th className="p-3.5">Top SHAP Drivers</th>
                <th className="p-3.5">Prescribed Retention Action</th>
                <th className="p-3.5 text-center">Done</th>
                <th className="p-3.5 text-right">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-signal-hairline font-mono">
              {paginatedList.map((c) => {
                const isDone = !!retentionDone[c.customer_id];
                return (
                  <tr
                    key={c.customer_id}
                    className={`hover:bg-signal-surface-alt/40 transition-colors ${
                      isDone ? "opacity-60 bg-signal-hairline/10" : ""
                    }`}
                  >
                    <td className="p-3.5 font-bold text-signal-ink">
                      <Link
                        href={`/customers/${encodeURIComponent(c.customer_id)}`}
                        className="hover:underline text-signal-ink hover:text-signal-primary"
                      >
                        {c.customer_id}
                      </Link>
                    </td>

                    <td className="p-3.5">
                      <StatusBadge status={c.prediction} size="sm" />
                    </td>

                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <RiskPulse value={c.churn_probability_pct} size="sm" showValue={false} />
                        <span className="font-bold text-signal-ink">
                          {c.churn_probability_pct.toFixed(1)}%
                        </span>
                        <RiskBadge level={c.risk_level} />
                      </div>
                    </td>

                    <td className="p-3.5 font-semibold text-signal-ink">
                      {formatCurrency(c.annual_spend)}
                    </td>

                    <td className="p-3.5 font-sans max-w-[260px]">
                      <div className="space-y-1">
                        {c.top_reasons?.slice(0, 2).map((r, i) => (
                          <div
                            key={i}
                            className="text-[11px] truncate text-signal-muted"
                            title={r}
                          >
                            • {r}
                          </div>
                        ))}
                      </div>
                    </td>

                    <td className="p-3.5 font-sans text-xs text-signal-ink max-w-[220px] truncate" title={c.suggested_action}>
                      {c.suggested_action}
                    </td>

                    <td className="p-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => toggleRetentionDone(c.customer_id)}
                        className="w-4 h-4 rounded accent-signal-safe cursor-pointer"
                        title="Mark retention task completed"
                        aria-label={`Mark retention done for ${c.customer_id}`}
                      />
                    </td>

                    <td className="p-3.5 text-right">
                      <Link href={`/customers/${encodeURIComponent(c.customer_id)}`}>
                        <button
                          type="button"
                          className="p-1.5 rounded-8 hover:bg-signal-hairline text-signal-ink transition-colors"
                          title="Open Customer Intelligence Drawer"
                        >
                          <ArrowUpRightIcon size={14} />
                        </button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between p-4 border-t border-signal-hairline text-xs font-mono text-signal-muted bg-signal-surface-alt/30">
          <div>
            Page <strong className="text-signal-ink">{currentPage}</strong> of {totalPages}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </BentoCard>
    </div>
  );
}
