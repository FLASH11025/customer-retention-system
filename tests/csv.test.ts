import { describe, it, expect } from "vitest";
import {
  REQUIRED_TRAIN_COLUMNS,
  REQUIRED_PREDICT_COLUMNS,
  validateCsvHeaders,
  generateBlankTemplate,
  parseCsvString,
} from "@/lib/csv";

describe("CSV Validation & Parsing (TDD) — Telco Schema", () => {
  it("should validate complete training CSV headers", () => {
    const headers = [...REQUIRED_TRAIN_COLUMNS];
    const result = validateCsvHeaders(headers, "train");
    expect(result.valid).toBe(true);
    expect(result.missingColumns).toHaveLength(0);
  });

  it("should validate complete prediction CSV headers", () => {
    const headers = [...REQUIRED_PREDICT_COLUMNS];
    const result = validateCsvHeaders(headers, "predict");
    expect(result.valid).toBe(true);
    expect(result.missingColumns).toHaveLength(0);
  });

  it("should flag missing columns accurately", () => {
    const headers = ["customer_id", "Contract", "tenure"];
    const result = validateCsvHeaders(headers, "train");
    expect(result.valid).toBe(false);
    expect(result.missingColumns).toContain("churned");
    expect(result.missingColumns).toContain("PaymentMethod");
    expect(result.missingColumns).toContain("MonthlyCharges");
  });

  it("should detect extra unexpected columns", () => {
    const headers = [...REQUIRED_PREDICT_COLUMNS, "random_extra_col"];
    const result = validateCsvHeaders(headers, "predict");
    expect(result.valid).toBe(true); // extra columns don't block valid headers
    expect(result.extraColumns).toContain("random_extra_col");
  });

  it("should generate a valid blank template CSV with required Telco columns", () => {
    const template = generateBlankTemplate();
    const lines = template.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const headers = lines[0].split(",");
    expect(headers).toEqual([...REQUIRED_PREDICT_COLUMNS]);
  });

  it("should contain the new Telco column names (not old SaaS names)", () => {
    // Telco columns must be present
    expect(REQUIRED_PREDICT_COLUMNS).toContain("Contract");
    expect(REQUIRED_PREDICT_COLUMNS).toContain("PaymentMethod");
    expect(REQUIRED_PREDICT_COLUMNS).toContain("InternetService");
    expect(REQUIRED_PREDICT_COLUMNS).toContain("tenure");
    expect(REQUIRED_PREDICT_COLUMNS).toContain("MonthlyCharges");
    expect(REQUIRED_PREDICT_COLUMNS).toContain("TotalCharges");

    // Old SaaS columns must NOT be present
    const cols = REQUIRED_PREDICT_COLUMNS as readonly string[];
    expect(cols).not.toContain("plan_type");
    expect(cols).not.toContain("contract_type");
    expect(cols).not.toContain("annual_spend");
    expect(cols).not.toContain("logins_last_30d");
    expect(cols).not.toContain("feature_usage_score");
  });

  it("should parse Telco CSV string into objects with coerced numeric fields", () => {
    const csvData =
      "customer_id,Contract,PaymentMethod,InternetService,gender,SeniorCitizen,Partner,Dependents,PhoneService,MultipleLines,OnlineSecurity,OnlineBackup,DeviceProtection,TechSupport,StreamingTV,StreamingMovies,PaperlessBilling,tenure,MonthlyCharges,TotalCharges\n" +
      "CUST_00001,Month-to-month,Electronic check,Fiber optic,Male,0,No,No,Yes,No,No,No,No,No,No,No,Yes,12,65.5,786";

    const rows = parseCsvString(csvData);
    expect(rows).toHaveLength(1);
    expect(rows[0].customer_id).toBe("CUST_00001");
    expect(rows[0].Contract).toBe("Month-to-month");
    expect(rows[0].tenure).toBe(12);
    expect(rows[0].MonthlyCharges).toBe(65.5);
    expect(rows[0].TotalCharges).toBe(786);
    expect(rows[0].SeniorCitizen).toBe(0);
  });
});

describe("CSV Validation — Legacy Schema Acceptance", () => {
  it("should accept the legacy 14-column training layout as valid with mapping notes", () => {
    const headers = [
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
      "churned",
    ];
    const result = validateCsvHeaders(headers, "train");
    expect(result.valid).toBe(true);
    expect(result.schema).toBe("legacy");
    expect(result.mappingNotes).toBeDefined();
    expect(result.mappingNotes!.length).toBeGreaterThan(0);
  });

  it("should accept the legacy 13-column scoring layout (no churned)", () => {
    const headers = [
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
    ];
    const result = validateCsvHeaders(headers, "predict");
    expect(result.valid).toBe(true);
    expect(result.schema).toBe("legacy");
  });

  it("should still reject a CSV matching neither schema", () => {
    const result = validateCsvHeaders(["customer_id", "gender", "tenure"], "train");
    expect(result.valid).toBe(false);
    expect(result.schema).toBeUndefined();
    expect(result.missingColumns).toContain("churned");
  });

  it("should reject a legacy scoring file when churned IS present (train-mode check intact)", () => {
    // legacy predict-mode headers fed to predict mode must not suddenly require churned
    const headers = [
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
    ];
    const result = validateCsvHeaders(headers, "predict");
    expect(result.valid).toBe(true);
    expect(result.extraColumns).toHaveLength(0);
  });
});
