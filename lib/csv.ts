/**
 * CSV validation and parsing utilities for PredictChurn.
 * Strictly checks required headers for train vs predict modes.
 * Schema: Telco Customer Churn dataset (OpenML 42178).
 */

export const REQUIRED_PREDICT_COLUMNS = [
  "customer_id",
  "Contract",
  "PaymentMethod",
  "InternetService",
  "gender",
  "SeniorCitizen",
  "Partner",
  "Dependents",
  "PhoneService",
  "MultipleLines",
  "OnlineSecurity",
  "OnlineBackup",
  "DeviceProtection",
  "TechSupport",
  "StreamingTV",
  "StreamingMovies",
  "PaperlessBilling",
  "tenure",
  "MonthlyCharges",
  "TotalCharges",
] as const;

export const REQUIRED_TRAIN_COLUMNS = [
  ...REQUIRED_PREDICT_COLUMNS,
  "churned",
] as const;

/**
 * Legacy synthetic schema (the app's original 14-column layout). CSVs in this
 * layout are accepted and auto-mapped onto the Telco schema by the backend:
 *
 *   account_age_months -> tenure, monthly_charges -> MonthlyCharges,
 *   annual_spend -> TotalCharges, plan_type -> InternetService,
 *   contract_type -> Contract, payment_method -> PaymentMethod.
 * Behavioral columns (logins, tickets, usage) are kept as extra model features;
 * Telco categoricals missing from the file are inserted as constants.
 */
export const LEGACY_PREDICT_COLUMNS = [
  "customer_id",
  "plan_type",
  "contract_type",
  "payment_method",
  "account_age_months",
  "monthly_charges",
  "annual_spend",
  "logins_last_30d",
  "days_since_last_login",
  "support_tickets_total",
  "unresolved_tickets",
  "late_payments_count",
  "feature_usage_score",
] as const;

export const LEGACY_TRAIN_COLUMNS = [
  ...LEGACY_PREDICT_COLUMNS,
  "churned",
] as const;

export const LEGACY_MAPPING_NOTES = [
  "plan_type → InternetService (Basic→No, Pro→DSL, Enterprise→Fiber optic)",
  "contract_type → Contract (Monthly→Month-to-month, Yearly→One year)",
  "payment_method → PaymentMethod (Bank→Bank transfer, Card→Credit card, UPI→Electronic check)",
  "account_age_months → tenure, monthly_charges → MonthlyCharges, annual_spend → TotalCharges",
  "logins / tickets / usage columns → kept as behavioral model features",
] as const;

export interface CsvValidationResult {
  valid: boolean;
  missingColumns: string[];
  extraColumns: string[];
  totalColumns: number;
  /** Which layout matched: "telco" (native) or "legacy" (auto-mapped). */
  schema?: "telco" | "legacy";
  /** Human-readable mapping notes shown in the UI for legacy files. */
  mappingNotes?: string[];
}

export function validateCsvHeaders(
  headers: string[],
  mode: "train" | "predict"
): CsvValidationResult {
  const normalized = headers.map((h) => h.trim());
  const required =
    mode === "train" ? REQUIRED_TRAIN_COLUMNS : REQUIRED_PREDICT_COLUMNS;

  const missingColumns = required.filter((col) => !normalized.includes(col));
  const extraColumns = normalized.filter(
    (col) => !(required as readonly string[]).includes(col)
  );

  if (missingColumns.length === 0) {
    return {
      valid: true,
      missingColumns: [],
      extraColumns,
      totalColumns: normalized.length,
      schema: "telco",
    };
  }

  // Legacy synthetic layout: accepted through deterministic backend mapping
  const legacyRequired =
    mode === "train" ? LEGACY_TRAIN_COLUMNS : LEGACY_PREDICT_COLUMNS;
  const legacyMissing = legacyRequired.filter(
    (col) => !normalized.includes(col)
  );
  if (legacyMissing.length === 0) {
    return {
      valid: true,
      missingColumns: [],
      extraColumns: normalized.filter(
        (col) => !(legacyRequired as readonly string[]).includes(col)
      ),
      totalColumns: normalized.length,
      schema: "legacy",
      mappingNotes: [...LEGACY_MAPPING_NOTES],
    };
  }

  return {
    valid: false,
    missingColumns,
    extraColumns,
    totalColumns: normalized.length,
  };
}

export function generateBlankTemplate(): string {
  return REQUIRED_PREDICT_COLUMNS.join(",") + "\n";
}

export function parseCsvString(csvContent: string): Record<string, any>[] {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const numericFields = new Set([
    "SeniorCitizen",
    "tenure",
    "MonthlyCharges",
    "TotalCharges",
    "churned",
    // legacy schema numerics (preview coercion)
    "account_age_months",
    "monthly_charges",
    "annual_spend",
    "logins_last_30d",
    "days_since_last_login",
    "support_tickets_total",
    "unresolved_tickets",
    "late_payments_count",
    "feature_usage_score",
  ]);

  const rows: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    if (values.length < headers.length) continue;

    const row: Record<string, any> = {};
    for (let j = 0; j < headers.length; j++) {
      const col = headers[j];
      const rawVal = values[j];
      if (numericFields.has(col)) {
        const num = parseFloat(rawVal);
        row[col] = isNaN(num) ? rawVal : num;
      } else {
        row[col] = rawVal;
      }
    }
    rows.push(row);
  }

  return rows;
}
