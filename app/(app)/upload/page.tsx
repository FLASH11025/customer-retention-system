"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { trainModel, predictBatch, getSampleCsvUrl, getHealth, getTrainStatus, ApiError } from "@/lib/api";
import {
  validateCsvHeaders,
  parseCsvString,
  generateBlankTemplate,
  REQUIRED_TRAIN_COLUMNS,
  REQUIRED_PREDICT_COLUMNS,
  CsvValidationResult,
} from "@/lib/csv";
import { Button } from "@/components/ui/Button";
import { BentoCard, BentoHeader } from "@/components/ui/Card";
import { UploadIcon, ShieldCheckIcon, ArrowUpRightIcon } from "@/components/ui/Icons";

const STAGE_LABELS: Record<string, string> = {
  validating: "Validating CSV schema...",
  cleaning: "Cleaning data (dedup, quote stripping, type coercion)...",
  balancing: "Balancing classes with SMOTE...",
  training: "Training XGBoost model...",
  evaluating: "Evaluating on held-out test split...",
  done: "Training complete!",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function UploadPage() {
  const router = useRouter();
  const { setMetrics, setPredictionResults, threshold } = useAppStore();

  const [mode, setMode] = useState<"train" | "predict">("train");
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, any>[]>([]);
  const [validation, setValidation] = useState<CsvValidationResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileProcess = (selectedFile: File) => {
    setError(null);
    setSuccessMessage(null);

    if (!selectedFile.name.endsWith(".csv")) {
      setError("Please select a valid CSV file (.csv).");
      setFile(null);
      setPreviewRows([]);
      setValidation(null);
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) {
        setError("The uploaded CSV file is empty.");
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
      const valResult = validateCsvHeaders(headers, mode);
      setValidation(valResult);

      const parsed = parseCsvString(text);
      setPreviewRows(parsed.slice(0, 10));
    };
    reader.readAsText(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!file || !validation?.valid) return;

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (mode === "train") {
        setUploadProgress("Uploading training dataset and training XGBoost model...");
        // Poll /train/status for staged progress while the blocking train call runs
        const statusPoller = setInterval(async () => {
          try {
            const s = await getTrainStatus();
            if (s.stage && STAGE_LABELS[s.stage]) {
              setUploadProgress(STAGE_LABELS[s.stage]);
            }
          } catch {
            // status polling is best-effort
          }
        }, 700);

        try {
          const result = await trainModel(file);
          setMetrics(result);
          setSuccessMessage(
            `Model successfully trained using ${result.algorithm}! Accuracy: ${(result.accuracy * 100).toFixed(1)}%, ROC-AUC: ${(result.roc_auc * 100).toFixed(1)}%.`
          );
          setTimeout(() => {
            router.push("/model");
          }, 1500);
        } finally {
          clearInterval(statusPoller);
        }
      } else {
        // Guard: scoring requires a trained model on the backend
        try {
          const health = await getHealth();
          if (!health.model_loaded) {
            setError("Train a model first — no trained model exists on the backend. Switch to 'Train Model' mode and upload a training CSV with the 'churned' column.");
            setIsLoading(false);
            setUploadProgress("");
            return;
          }
        } catch {
          setError(`Backend not reachable at ${API_URL}. Start the backend, then retry.`);
          setIsLoading(false);
          setUploadProgress("");
          return;
        }

        setUploadProgress("Generating churn predictions and computing SHAP values...");
        const result = await predictBatch(file, threshold);
        setPredictionResults(result.summary, result.predictions);
        setSuccessMessage(
          `Predictions generated for ${result.summary.total_customers} customers! ${result.summary.predicted_to_leave} customers predicted at risk of churning.`
        );
        setTimeout(() => {
          router.push("/radar");
        }, 1500);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred during submission.");
      }
    } finally {
      setIsLoading(false);
      setUploadProgress("");
    }
  };

  const handleDownloadBlankTemplate = () => {
    const csvContent = generateBlankTemplate();
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "predictchurn_template.csv");
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
            Data Ingestion
          </span>
          <h1 className="font-display italic text-3xl sm:text-4xl text-signal-ink mt-1">
            Upload & Process Data
          </h1>
          <p className="text-sm text-signal-muted mt-1">
            Train a new XGBoost model with historical data or run batch inference on active customers.
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center p-1 bg-signal-surface-alt border border-signal-hairline rounded-16 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setMode("train");
              setFile(null);
              setPreviewRows([]);
              setValidation(null);
              setError(null);
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-12 transition-all ${
              mode === "train"
                ? "bg-signal-ink text-signal-bg dark:bg-signal-lime dark:text-[#14130F] shadow-sm"
                : "text-signal-muted hover:text-signal-ink"
            }`}
          >
            Train Model (Telco 21 / legacy 14)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("predict");
              setFile(null);
              setPreviewRows([]);
              setValidation(null);
              setError(null);
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-12 transition-all ${
              mode === "predict"
                ? "bg-signal-ink text-signal-bg dark:bg-signal-lime dark:text-[#14130F] shadow-sm"
                : "text-signal-muted hover:text-signal-ink"
            }`}
          >
            Score Customers (Telco 20 / legacy 13)
          </button>
        </div>
      </div>

      {/* Main Upload Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dropzone Column */}
        <div className="lg:col-span-2 space-y-6">
          <BentoCard className="relative overflow-hidden">
            <BentoHeader
              title={mode === "train" ? "1. Provide Training Dataset" : "1. Provide Customer Batch"}
              subtitle={
                mode === "train"
                  ? "Telco layout: 21 columns incl. 'churned' target — or legacy layout: 14 columns (auto-mapped)."
                  : "Telco layout: 20 columns (no 'churned') — or legacy layout: 13 columns (auto-mapped)."
              }
            />

            {/* Drag and Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-20 p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
                isDragging
                  ? "border-signal-ink bg-signal-hairline/20 scale-[0.99]"
                  : "border-signal-hairline hover:border-signal-muted bg-signal-surface-alt/40"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileProcess(e.target.files[0]);
                  }
                }}
              />

              <div className="w-16 h-16 rounded-full bg-signal-surface border border-signal-hairline mx-auto flex items-center justify-center text-signal-ink shadow-sm mb-4">
                <UploadIcon size={28} />
              </div>

              {file ? (
                <div>
                  <p className="font-mono text-sm font-bold text-signal-ink">{file.name}</p>
                  <p className="text-xs text-signal-muted mt-1">
                    {(file.size / 1024).toFixed(1)} KB • Click or drag to replace
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-base font-medium text-signal-ink">
                    Drag and drop your CSV here, or <span className="underline font-semibold">browse files</span>
                  </p>
                  <p className="text-xs text-signal-muted mt-1.5">
                    Standard comma-separated UTF-8 CSV file
                  </p>
                </div>
              )}
            </div>

            {/* Validation Feedback */}
            {validation && (
              <div className="mt-6 space-y-3">
                {validation.valid ? (
                  <div
                    className={`p-3.5 rounded-16 border text-xs space-y-1.5 ${
                      validation.schema === "legacy"
                        ? "bg-[#FEF7E0] border-[#F7E2A0] text-[#8A6D00] dark:bg-[#E0A526]/15 dark:border-[#E0A526]/40 dark:text-[#F3C34E]"
                        : "bg-[#E6F4EA] border border-[#CEEAD6] text-[#137333] dark:bg-[#137333]/20 dark:border-[#137333]/40 dark:text-[#81C995]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheckIcon size={18} />
                      <span className="font-medium">
                        {validation.schema === "legacy"
                          ? "Legacy schema detected — headers will be auto-mapped onto the Telco schema before training / scoring."
                          : `All required ${mode === "train" ? 21 : 20} columns verified and matched perfectly.`}
                      </span>
                    </div>
                    {validation.mappingNotes && validation.mappingNotes.length > 0 && (
                      <ul className="pl-7 space-y-0.5 font-mono text-[11px] opacity-80">
                        {validation.mappingNotes.map((note) => (
                          <li key={note}>• {note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-16 bg-[#FCE8E6] border border-[#F5C2C7] text-[#C5221F] dark:bg-[#C5221F]/20 dark:border-[#C5221F]/40 dark:text-[#F28B82] text-xs space-y-2">
                    <div className="font-semibold flex items-center gap-1.5">
                      <span>Header Validation Failed</span>
                    </div>
                    {validation.missingColumns.length > 0 && (
                      <p>
                        <strong>Missing required columns:</strong>{" "}
                        <span className="font-mono">{validation.missingColumns.join(", ")}</span>
                      </p>
                    )}
                    {validation.extraColumns.length > 0 && (
                      <p className="text-signal-muted text-[11px]">
                        <strong>Extra columns found (will be ignored):</strong>{" "}
                        <span className="font-mono">{validation.extraColumns.join(", ")}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Actions Bar */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-signal-hairline">
              <div className="text-xs text-signal-muted">
                {file && previewRows.length > 0 && (
                  <span>
                    Detected <strong className="text-signal-ink">{previewRows.length}</strong> preview rows
                  </span>
                )}
              </div>

              <Button
                variant="primary"
                size="md"
                disabled={!file || !validation?.valid || isLoading}
                onClick={handleSubmit}
                icon={<ArrowUpRightIcon size={16} />}
              >
                {isLoading
                  ? "Processing..."
                  : mode === "train"
                  ? "Train XGBoost Model"
                  : "Generate Predictions"}
              </Button>
            </div>

            {/* Loading & Status Alerts */}
            {isLoading && (
              <div className="mt-4 p-4 rounded-16 bg-signal-surface-alt border border-signal-hairline text-xs font-mono text-signal-ink flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-signal-lime animate-ping" />
                <span>{uploadProgress || "Working with backend..."}</span>
              </div>
            )}

            {error && (
              <div className="mt-4 p-4 rounded-16 bg-signal-danger/10 border border-signal-danger/30 text-signal-danger text-xs">
                <strong>Error:</strong> {error}
              </div>
            )}

            {successMessage && (
              <div className="mt-4 p-4 rounded-16 bg-signal-safe/10 border border-signal-safe/30 text-signal-safe text-xs">
                <strong>Success:</strong> {successMessage}
              </div>
            )}
          </BentoCard>

          {/* Preview Table */}
          {previewRows.length > 0 && (
            <BentoCard>
              <BentoHeader
                title="Data Preview"
                subtitle="First 10 rows parsed directly in-browser before submission."
              />
              <div className="overflow-x-auto max-h-72 border border-signal-hairline rounded-16">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-signal-surface-alt border-b border-signal-hairline sticky top-0">
                    <tr>
                      {Object.keys(previewRows[0]).map((col) => (
                        <th key={col} className="p-2.5 font-mono font-medium text-signal-muted whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-signal-hairline font-mono">
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-signal-surface-alt/50">
                        {Object.values(row).map((val, cellIdx) => (
                          <td key={cellIdx} className="p-2.5 whitespace-nowrap text-signal-ink">
                            {String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BentoCard>
          )}
        </div>

        {/* Resources & Template Column */}
        <div className="space-y-6">
          <BentoCard>
            <BentoHeader
              title="Official Templates"
              subtitle="Grab validated datasets directly from the backend server."
            />

            <div className="space-y-3">
              <a
                href={getSampleCsvUrl("train")}
                download="sample_training.csv"
                className="block p-3.5 rounded-16 border border-signal-hairline bg-signal-surface hover:bg-signal-surface-alt transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-signal-ink group-hover:text-signal-primary">
                    Sample Training CSV
                  </span>
                  <ArrowUpRightIcon size={14} className="text-signal-muted" />
                </div>
                <p className="text-[11px] text-signal-muted mt-1">
                  Legacy-layout sample (1,000 rows, with churned column) — auto-maps onto the Telco schema.
                </p>
              </a>

              <a
                href={getSampleCsvUrl("predict")}
                download="sample_to_predict.csv"
                className="block p-3.5 rounded-16 border border-signal-hairline bg-signal-surface hover:bg-signal-surface-alt transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-signal-ink group-hover:text-signal-primary">
                    Sample Scoring CSV
                  </span>
                  <ArrowUpRightIcon size={14} className="text-signal-muted" />
                </div>
                <p className="text-[11px] text-signal-muted mt-1">
                  300 unlabeled active customers ready for churn probability scoring.
                </p>
              </a>

              <button
                type="button"
                onClick={handleDownloadBlankTemplate}
                className="w-full text-left p-3.5 rounded-16 border border-dashed border-signal-hairline hover:border-signal-muted transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-signal-ink">
                    Download Blank Header Template
                  </span>
                  <span className="text-[10px] font-mono bg-signal-hairline px-2 py-0.5 rounded text-signal-muted">
                    .CSV
                  </span>
                </div>
                <p className="text-[11px] text-signal-muted mt-1">
                  Blank CSV containing only the 20 required column headers.
                </p>
              </button>
            </div>
          </BentoCard>

          <BentoCard>
            <BentoHeader
              title="Required Schema"
              subtitle="All columns must match exact naming conventions."
            />
            <div className="space-y-2">
              <div className="text-[11px] font-mono text-signal-muted">
                <span className="text-signal-ink font-semibold">1. Categorical:</span> Contract, PaymentMethod, InternetService, gender, SeniorCitizen, Partner, Dependents, PhoneService, MultipleLines, OnlineSecurity, OnlineBackup, DeviceProtection, TechSupport, StreamingTV, StreamingMovies, PaperlessBilling
              </div>
              <div className="text-[11px] font-mono text-signal-muted">
                <span className="text-signal-ink font-semibold">2. Numeric:</span> tenure, MonthlyCharges, TotalCharges
              </div>
              <div className="text-[11px] font-mono text-signal-muted">
                <span className="text-signal-ink font-semibold">3. Identifier:</span> customer_id
              </div>
              {mode === "train" && (
                <div className="text-[11px] font-mono text-signal-danger">
                  <span className="font-semibold">4. Target (Train only):</span> churned (1 or 0)
                </div>
              )}
              <div className="pt-2 mt-1 border-t border-signal-hairline/60 text-[11px] font-mono text-signal-muted">
                <span className="text-signal-ink font-semibold">Also accepted — legacy layout:</span>{" "}
                plan_type, contract_type, payment_method, account_age_months, monthly_charges, annual_spend,
                logins_last_30d, days_since_last_login, support_tickets_total, unresolved_tickets,
                late_payments_count, feature_usage_score{mode === "train" ? ", churned" : ""} → auto-mapped to the columns above.
              </div>
            </div>
          </BentoCard>
        </div>
      </div>
    </div>
  );
}
