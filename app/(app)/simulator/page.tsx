"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { predictOne, getModelMetrics, SingleCustomerInput, PredictionItem } from "@/lib/api";
import { parseShapReason } from "@/lib/format";
import { BentoCard, BentoHeader } from "@/components/ui/Card";
import { RiskPulse } from "@/components/ui/RiskPulse";
import { StatusBadge, RiskBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LightningIcon } from "@/components/ui/Icons";

interface HistoryEntry {
  timestamp: string;
  probability: number;
  prediction: "STAY" | "LEAVE";
  risk_level: "Low" | "Medium" | "High";
  note: string;
}

/** Binary yes/no select helper */
function YesNoSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-mono text-signal-muted uppercase mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-signal-surface-alt border border-signal-hairline rounded-12 px-3 py-2 text-xs font-mono text-signal-ink focus:outline-none focus:border-signal-ink"
      >
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
  );
}

function SimulatorContent() {
  const searchParams = useSearchParams();
  const { metrics, setMetrics, threshold } = useAppStore();

  // Load metrics if not present
  useEffect(() => {
    if (!metrics) {
      getModelMetrics()
        .then((m) => {
          if (m) setMetrics(m);
        })
        .catch(() => {
          // Backend offline — the global banner shows the retry state
        });
    }
  }, [metrics, setMetrics]);

  // Dynamic dropdown categories from trained model
  const contractOptions = metrics?.categories?.Contract ?? ["Month-to-month", "One year", "Two year"];
  const paymentOptions = metrics?.categories?.PaymentMethod ?? ["Electronic check", "Mailed check", "Bank transfer (automatic)", "Credit card (automatic)"];
  const internetOptions = metrics?.categories?.InternetService ?? ["DSL", "Fiber optic", "No"];
  const genderOptions = metrics?.categories?.gender ?? ["Male", "Female"];

  // Categorical form state — seeded from URL params for deep-linking
  const [customerId, setCustomerId] = useState<string>(searchParams.get("customer_id") || "CUST_SIM_001");
  const [contract, setContract] = useState<string>(searchParams.get("contract") || contractOptions[0]);
  const [paymentMethod, setPaymentMethod] = useState<string>(searchParams.get("payment") || paymentOptions[0]);
  const [internetService, setInternetService] = useState<string>(searchParams.get("internet") || internetOptions[0]);
  const [gender, setGender] = useState<string>(genderOptions[0]);
  const [seniorCitizen, setSeniorCitizen] = useState<number>(0);
  const [partner, setPartner] = useState<string>("No");
  const [dependents, setDependents] = useState<string>("No");
  const [phoneService, setPhoneService] = useState<string>("Yes");
  const [multipleLines, setMultipleLines] = useState<string>("No");
  const [onlineSecurity, setOnlineSecurity] = useState<string>("No");
  const [onlineBackup, setOnlineBackup] = useState<string>("No");
  const [deviceProtection, setDeviceProtection] = useState<string>("No");
  const [techSupport, setTechSupport] = useState<string>("No");
  const [streamingTV, setStreamingTV] = useState<string>("No");
  const [streamingMovies, setStreamingMovies] = useState<string>("No");
  const [paperlessBilling, setPaperlessBilling] = useState<string>("Yes");

  // Numeric form state
  const [tenure, setTenure] = useState<number>(Number(searchParams.get("tenure")) || 12);
  const [monthlyCharges, setMonthlyCharges] = useState<number>(Number(searchParams.get("monthly")) || 65);
  const [totalCharges, setTotalCharges] = useState<number>(
    Number(searchParams.get("total")) || tenure * monthlyCharges
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionItem | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const handlePredict = async (changeNote?: string) => {
    setIsLoading(true);
    setError(null);

    const inputData: SingleCustomerInput = {
      customer_id: customerId || "CUST_SIM",
      Contract: contract,
      PaymentMethod: paymentMethod,
      InternetService: internetService,
      gender,
      SeniorCitizen: seniorCitizen,
      Partner: partner,
      Dependents: dependents,
      PhoneService: phoneService,
      MultipleLines: multipleLines,
      OnlineSecurity: onlineSecurity,
      OnlineBackup: onlineBackup,
      DeviceProtection: deviceProtection,
      TechSupport: techSupport,
      StreamingTV: streamingTV,
      StreamingMovies: streamingMovies,
      PaperlessBilling: paperlessBilling,
      tenure,
      MonthlyCharges: monthlyCharges,
      TotalCharges: totalCharges,
    };

    try {
      const pred = await predictOne(inputData, threshold);
      setResult(pred);

      setHistory((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          probability: pred.churn_probability_pct,
          prediction: pred.prediction,
          risk_level: pred.risk_level,
          note: changeNote || "Manual evaluation",
        },
        ...prev.slice(0, 9),
      ]);
    } catch (err: any) {
      setError(err?.message || "Failed to predict single customer");
    } finally {
      setIsLoading(false);
    }
  };

  // Initial trigger when metrics loads
  useEffect(() => {
    if (metrics) {
      handlePredict("Initial baseline");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics]);

  if (!metrics) {
    return (
      <EmptyState
        icon={<LightningIcon size={24} />}
        title="Model Required for Simulation"
        description="The customer simulator requires a trained model to perform real-time single-account inference and SHAP attribution."
        actionText="Train Model First"
        actionHref="/upload"
      />
    );
  }

  const parsedReasons = (result?.top_reasons || []).map((r) => parseShapReason(r));

  const selectClass =
    "w-full bg-signal-surface-alt border border-signal-hairline rounded-12 px-3 py-2 text-xs font-mono text-signal-ink focus:outline-none focus:border-signal-ink";

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-signal-hairline pb-6">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-signal-muted">
            What-If Analysis Engine
          </span>
          <h1 className="font-display italic text-3xl sm:text-4xl text-signal-ink mt-1">
            Customer Risk Simulator
          </h1>
          <p className="text-sm text-signal-muted mt-1">
            Simulate parameter adjustments to observe immediate impacts on churn probability and SHAP drivers.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => handlePredict("Recalculate inputs")}
          disabled={isLoading}
          icon={<LightningIcon size={16} />}
        >
          {isLoading ? "Computing..." : "Run Simulation"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls Bento Form */}
        <div className="lg:col-span-2 space-y-6">
          <BentoCard>
            <BentoHeader
              title="Customer Profile Controls"
              subtitle="Modify contractual settings, services, and demographics"
            />

            {/* Customer ID */}
            <div className="pt-2 pb-4 border-b border-signal-hairline">
              <label className="block text-[11px] font-mono text-signal-muted uppercase mb-1">
                Customer ID (optional)
              </label>
              <input
                type="text"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full bg-signal-surface-alt border border-signal-hairline rounded-12 px-3 py-2 text-xs font-mono text-signal-ink focus:outline-none focus:border-signal-ink"
                placeholder="CUST_SIM_001"
              />
            </div>

            {/* Contract / Payment / Internet — 3-col row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
              <div>
                <label className="block text-[11px] font-mono text-signal-muted uppercase mb-1">
                  Contract
                </label>
                <select
                  value={contract}
                  onChange={(e) => setContract(e.target.value)}
                  className={selectClass}
                >
                  {contractOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-signal-muted uppercase mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className={selectClass}
                >
                  {paymentOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-signal-muted uppercase mb-1">
                  Internet Service
                </label>
                <select
                  value={internetService}
                  onChange={(e) => setInternetService(e.target.value)}
                  className={selectClass}
                >
                  {internetOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Gender / Senior Citizen — 2-col */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
              <div>
                <label className="block text-[11px] font-mono text-signal-muted uppercase mb-1">
                  Gender
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={selectClass}
                >
                  {genderOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-signal-muted uppercase mb-1">
                  Senior Citizen
                </label>
                <select
                  value={String(seniorCitizen)}
                  onChange={(e) => setSeniorCitizen(Number(e.target.value))}
                  className={selectClass}
                >
                  <option value="0">No (0)</option>
                  <option value="1">Yes (1)</option>
                </select>
              </div>

              <YesNoSelect label="Partner" value={partner} onChange={setPartner} />
              <YesNoSelect label="Dependents" value={dependents} onChange={setDependents} />
            </div>

            {/* Add-on services — 4-col grid */}
            <div className="pt-4 border-t border-signal-hairline mt-4">
              <span className="text-[11px] font-mono text-signal-muted uppercase tracking-wider">
                Services &amp; Add-ons
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                <YesNoSelect label="Phone Service" value={phoneService} onChange={setPhoneService} />
                <YesNoSelect label="Multiple Lines" value={multipleLines} onChange={setMultipleLines} />
                <YesNoSelect label="Online Security" value={onlineSecurity} onChange={setOnlineSecurity} />
                <YesNoSelect label="Online Backup" value={onlineBackup} onChange={setOnlineBackup} />
                <YesNoSelect label="Device Protection" value={deviceProtection} onChange={setDeviceProtection} />
                <YesNoSelect label="Tech Support" value={techSupport} onChange={setTechSupport} />
                <YesNoSelect label="Streaming TV" value={streamingTV} onChange={setStreamingTV} />
                <YesNoSelect label="Streaming Movies" value={streamingMovies} onChange={setStreamingMovies} />
              </div>
            </div>

            {/* Paperless Billing */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-signal-hairline mt-4">
              <YesNoSelect label="Paperless Billing" value={paperlessBilling} onChange={setPaperlessBilling} />
            </div>

            {/* Numeric sliders */}
            <div className="space-y-5 pt-6 border-t border-signal-hairline mt-6">
              {/* Tenure */}
              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-signal-muted">Tenure (Months)</span>
                  <span className="font-bold text-signal-ink">{tenure} mo</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="72"
                  value={tenure}
                  onChange={(e) => setTenure(Number(e.target.value))}
                  className="w-full accent-signal-ink dark:accent-signal-lime h-2 bg-signal-hairline rounded-lg cursor-pointer"
                />
              </div>

              {/* Monthly Charges */}
              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-signal-muted">Monthly Charges (\$)</span>
                  <span className="font-bold text-signal-ink">\${monthlyCharges}</span>
                </div>
                <input
                  type="range"
                  min="18"
                  max="120"
                  value={monthlyCharges}
                  onChange={(e) => setMonthlyCharges(Number(e.target.value))}
                  className="w-full accent-signal-ink dark:accent-signal-lime h-2 bg-signal-hairline rounded-lg cursor-pointer"
                />
              </div>

              {/* Total Charges */}
              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-signal-muted">Total Charges (\$)</span>
                  <span className="font-bold text-signal-ink">\${totalCharges}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="8700"
                  step="10"
                  value={totalCharges}
                  onChange={(e) => setTotalCharges(Number(e.target.value))}
                  className="w-full accent-signal-ink dark:accent-signal-lime h-2 bg-signal-hairline rounded-lg cursor-pointer"
                />
                <p className="text-[10px] text-signal-muted mt-1">
                  Tip: set to tenure × monthly charges, or adjust independently.
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3.5 rounded-16 bg-signal-danger/10 border border-signal-danger/30 text-signal-danger text-xs">
                {error}
              </div>
            )}
          </BentoCard>
        </div>

        {/* Real-time Output & History */}
        <div className="space-y-6">
          {/* Result Card */}
          <BentoCard className="flex flex-col items-center text-center p-6 sm:p-8">
            <span className="text-[11px] font-mono uppercase tracking-widest text-signal-muted mb-4">
              Real-time Output
            </span>

            {result ? (
              <div className="space-y-4 w-full">
                <RiskPulse value={result.churn_probability_pct} size="xl" />

                <div className="flex items-center justify-center gap-2 pt-2">
                  <StatusBadge status={result.prediction} size="md" />
                  <RiskBadge level={result.risk_level} />
                </div>

                <div className="p-3.5 rounded-16 bg-signal-surface-alt border border-signal-hairline text-left space-y-1">
                  <span className="text-[10px] font-mono uppercase text-signal-muted block">
                    Prescribed Action
                  </span>
                  <p className="text-xs font-semibold text-signal-ink">
                    {result.suggested_action}
                  </p>
                </div>

                {parsedReasons.length > 0 && (
                  <div className="text-left space-y-1.5 pt-2">
                    <span className="text-[10px] font-mono uppercase text-signal-muted block">
                      Local SHAP Drivers
                    </span>
                    {parsedReasons.map((r, i) => (
                      <div
                        key={i}
                        className={`text-[11px] p-2 rounded-10 border ${
                          r.sign === "+"
                            ? "bg-[#FCE8E6]/40 text-signal-danger border-signal-danger/20"
                            : "bg-[#E6F4EA]/40 text-signal-safe border-signal-safe/20"
                        }`}
                      >
                        {r.sign === "+" ? "▲" : "▼"} {r.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-signal-muted py-12">
                Click &quot;Run Simulation&quot; to generate prediction.
              </div>
            )}
          </BentoCard>

          {/* Session History Log */}
          {history.length > 0 && (
            <BentoCard>
              <BentoHeader
                title="Simulation History"
                subtitle="Trajectory of risk across adjustments"
              />

              <div className="space-y-2 pt-1 font-mono text-xs">
                {history.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-10 bg-signal-surface-alt border border-signal-hairline"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-signal-muted">{h.timestamp}</span>
                      <StatusBadge status={h.prediction} size="sm" />
                    </div>
                    <span className="font-bold text-signal-ink">
                      {h.probability.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </BentoCard>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SimulatorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="font-mono text-xs text-signal-muted">Loading simulator...</div>
        </div>
      }
    >
      <SimulatorContent />
    </Suspense>
  );
}
