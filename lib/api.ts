/**
 * Typed client for PredictChurn FastAPI backend.
 * Points to NEXT_PUBLIC_API_URL or defaults to http://localhost:8000.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ConfusionMatrix {
  tn: number;
  fp: number;
  fn: number;
  tp: number;
}

export interface RocCurve {
  fpr: number[];
  tpr: number[];
}

export interface ClassBalance {
  before: { stayed: number; churned: number };
  after: { stayed: number; churned: number };
  method: string;
}

export interface CleaningReport {
  rows_in: number;
  duplicates_removed: number;
  missing_values: number;
  rows_out: number;
  /** "telco" = native layout; "legacy-mapped" = legacy CSV auto-mapped. */
  schema?: string;
  /** Deterministic mapping steps applied to a legacy CSV (empty for Telco). */
  schema_mapping?: string[];
}

export interface TestProbabilityItem {
  y_true: number;
  prob: number;
}

export interface ModelMetrics {
  algorithm: string;
  cv_scores: number[];
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
  confusion_matrix: ConfusionMatrix;
  roc_curve: RocCurve;
  train_rows: number;
  test_rows: number;
  churn_rate: number;
  class_balance: ClassBalance;
  cleaning: CleaningReport;
  training_seconds: number;
  trained_at: string;
  categories: Record<string, string[]>;
  test_probabilities?: TestProbabilityItem[];
}

export interface PredictionItem {
  customer_id: string;
  prediction: "STAY" | "LEAVE";
  churn_probability_pct: number;
  risk_level: "Low" | "Medium" | "High";
  top_reasons: string[];
  suggested_action: string;
  annual_spend: number;
  // Telco feature columns (optional — present in batch predictions)
  Contract?: string;
  PaymentMethod?: string;
  InternetService?: string;
  gender?: string;
  SeniorCitizen?: number;
  Partner?: string;
  Dependents?: string;
  PhoneService?: string;
  MultipleLines?: string;
  OnlineSecurity?: string;
  OnlineBackup?: string;
  DeviceProtection?: string;
  TechSupport?: string;
  StreamingTV?: string;
  StreamingMovies?: string;
  PaperlessBilling?: string;
  tenure?: number;
  MonthlyCharges?: number;
  TotalCharges?: number;
  [key: string]: any;
}

export interface PredictionSummary {
  total_customers: number;
  predicted_to_leave: number;
  avg_churn_risk_pct: number;
  high_risk: number;
  revenue_at_risk: number;
}

export interface BatchPredictionResponse {
  summary: PredictionSummary;
  predictions: PredictionItem[];
}

export interface SingleCustomerInput {
  customer_id?: string;
  // Categorical (Telco schema)
  Contract: string;
  PaymentMethod: string;
  InternetService: string;
  gender: string;
  SeniorCitizen: number; // 0 or 1
  Partner: string;
  Dependents: string;
  PhoneService: string;
  MultipleLines: string;
  OnlineSecurity: string;
  OnlineBackup: string;
  DeviceProtection: string;
  TechSupport: string;
  StreamingTV: string;
  StreamingMovies: string;
  PaperlessBilling: string;
  // Numeric (Telco schema)
  tenure: number;
  MonthlyCharges: number;
  TotalCharges: number;
}

export interface BackendHealth {
  status: string;
  model_loaded: boolean;
  loading: boolean;
  load_error: string | null;
}

export interface TrainStatus {
  stage: string | null;
  running: boolean;
  started_at: number | null;
  finished_at: number | null;
  error: string | null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson && errJson.detail) {
        errorDetail =
          typeof errJson.detail === "string"
            ? errJson.detail
            : JSON.stringify(errJson.detail);
      }
    } catch {
      // response wasn't JSON
    }
    throw new ApiError(errorDetail, res.status);
  }
  return res.json() as Promise<T>;
}

export async function getModelMetrics(): Promise<ModelMetrics | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/metrics`, {
      method: "GET",
      cache: "no-store",
    });
    if (res.status === 404) {
      return null;
    }
    return await handleResponse<ModelMetrics>(res);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function trainModel(file: File): Promise<ModelMetrics> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/train`, {
    method: "POST",
    body: formData,
  });

  return handleResponse<ModelMetrics>(res);
}

export async function predictBatch(
  file: File,
  threshold: number = 0.5
): Promise<BatchPredictionResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(
    `${API_BASE_URL}/predict?threshold=${encodeURIComponent(threshold)}`,
    {
      method: "POST",
      body: formData,
    }
  );

  return handleResponse<BatchPredictionResponse>(res);
}

/**
 * Recovery path for Risk Radar / Customers: returns the backend's most recent
 * batch prediction (kept since the backend started), or null if none exists.
 */
export async function getLastPredictions(): Promise<BatchPredictionResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/predict/last`, {
      method: "GET",
      cache: "no-store",
    });
    if (res.status === 404) return null;
    return await handleResponse<BatchPredictionResponse>(res);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function predictOne(
  features: SingleCustomerInput,
  threshold: number = 0.5
): Promise<PredictionItem> {
  const res = await fetch(
    `${API_BASE_URL}/predict-one?threshold=${encodeURIComponent(threshold)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(features),
    }
  );

  return handleResponse<PredictionItem>(res);
}

export async function getHealth(): Promise<BackendHealth> {
  const res = await fetch(`${API_BASE_URL}/health`, {
    method: "GET",
    cache: "no-store",
  });
  return handleResponse<BackendHealth>(res);
}

export async function getTrainStatus(): Promise<TrainStatus> {
  const res = await fetch(`${API_BASE_URL}/train/status`, {
    method: "GET",
    cache: "no-store",
  });
  return handleResponse<TrainStatus>(res);
}

export function getSampleCsvUrl(type: "train" | "predict"): string {
  return `${API_BASE_URL}/${type === "train" ? "sample-csv" : "template-csv"}`;
}
