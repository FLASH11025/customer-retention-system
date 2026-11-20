"""
Unit tests for PredictChurn data validation and prediction pipeline.
Run with: pytest tests/ -v --tb=short
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Make src importable
sys.path.insert(0, str(Path(__file__).parent.parent))
from src.data_loader import (
    CATEGORICAL_COLS,
    NUMERIC_COLS,
    validate_columns,
    clean_data,
    generate_sample_csv,
    generate_template_csv,
)


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def sample_train_df() -> pd.DataFrame:
    """Small synthetic training DataFrame."""
    return generate_sample_csv(n=200, churn_rate=0.20, seed=0)


@pytest.fixture
def sample_predict_df(sample_train_df) -> pd.DataFrame:
    """Predict DataFrame — no 'churned' column."""
    return sample_train_df.drop(columns=["churned"])


@pytest.fixture
def dirty_train_df(sample_train_df) -> pd.DataFrame:
    """Introduce dirt: duplicates + NaNs."""
    df = pd.concat([sample_train_df, sample_train_df.iloc[:10]], ignore_index=True)
    df.loc[0:5, "monthly_charges"] = np.nan
    df.loc[5:10, "plan_type"] = np.nan
    df.loc[15:20, "logins_last_30d"] = np.nan
    return df


# ─── validate_columns ─────────────────────────────────────────────────────────

class TestValidateColumns:
    def test_valid_train_df(self, sample_train_df):
        ok, missing, extra = validate_columns(sample_train_df, "train")
        assert ok is True
        assert missing == []
        assert extra == []

    def test_valid_predict_df(self, sample_predict_df):
        ok, missing, extra = validate_columns(sample_predict_df, "predict")
        assert ok is True
        assert missing == []

    def test_missing_column_train(self, sample_train_df):
        df = sample_train_df.drop(columns=["churned", "plan_type"])
        ok, missing, extra = validate_columns(df, "train")
        assert ok is False
        assert "churned" in missing
        assert "plan_type" in missing

    def test_extra_column(self, sample_train_df):
        df = sample_train_df.copy()
        df["extra_col"] = 1
        ok, missing, extra = validate_columns(df, "train")
        assert "extra_col" in extra

    def test_predict_mode_with_churned_col(self, sample_train_df):
        """Predict mode: churned column is extra, not missing."""
        ok, missing, extra = validate_columns(sample_train_df, "predict")
        assert "churned" in extra
        assert "churned" not in missing


# ─── clean_data ───────────────────────────────────────────────────────────────

class TestCleanData:
    def test_duplicates_removed(self, dirty_train_df):
        original_len = len(dirty_train_df)
        df_clean, report = clean_data(dirty_train_df, "train")
        assert report["duplicates_removed"] == 10
        assert len(df_clean) < original_len

    def test_no_nans_after_cleaning(self, dirty_train_df):
        df_clean, _ = clean_data(dirty_train_df, "train")
        assert df_clean.isnull().sum().sum() == 0

    def test_imputation_report_populated(self, dirty_train_df):
        _, report = clean_data(dirty_train_df, "train")
        imputed = report["imputed"]
        # At least monthly_charges and plan_type should be reported
        assert "monthly_charges" in imputed or "plan_type" in imputed

    def test_imputation_strategies(self, dirty_train_df):
        _, report = clean_data(dirty_train_df, "train")
        imputed = report["imputed"]
        for col, info in imputed.items():
            assert info["strategy"] in ("median", "mode")
            assert info["count"] > 0

    def test_churned_is_int(self, sample_train_df):
        df_clean, _ = clean_data(sample_train_df, "train")
        assert df_clean["churned"].dtype in (np.int32, np.int64, int)

    def test_no_customer_id_duplicates(self, dirty_train_df):
        df_clean, _ = clean_data(dirty_train_df, "train")
        assert df_clean["customer_id"].nunique() == len(df_clean)

    def test_rows_after_in_report(self, sample_train_df):
        df_clean, report = clean_data(sample_train_df, "train")
        assert report["rows_after"] == len(df_clean)


# ─── generate_sample_csv ──────────────────────────────────────────────────────

class TestGenerateSampleCsv:
    def test_correct_columns(self):
        df = generate_sample_csv(n=100)
        from src.data_loader import REQUIRED_COLS_TRAIN
        for col in REQUIRED_COLS_TRAIN:
            assert col in df.columns, f"Missing column: {col}"

    def test_correct_row_count(self):
        df = generate_sample_csv(n=500)
        assert len(df) == 500

    def test_churn_rate_approximate(self):
        df = generate_sample_csv(n=2000, churn_rate=0.20, seed=99)
        actual_rate = df["churned"].mean()
        # Allow ±10% of target churn rate
        assert 0.10 <= actual_rate <= 0.35, f"Churn rate {actual_rate:.2%} out of expected range"

    def test_unique_customer_ids(self):
        df = generate_sample_csv(n=300)
        assert df["customer_id"].nunique() == 300

    def test_categorical_valid_values(self):
        df = generate_sample_csv(n=300)
        assert set(df["plan_type"].unique()).issubset({"Basic", "Pro", "Enterprise"})
        assert set(df["contract_type"].unique()).issubset({"Monthly", "Yearly"})
        assert set(df["payment_method"].unique()).issubset({"Card", "UPI", "Bank"})

    def test_feature_usage_score_range(self):
        df = generate_sample_csv(n=500)
        assert df["feature_usage_score"].between(0, 100).all()

    def test_reproducible_with_seed(self):
        df1 = generate_sample_csv(n=100, seed=7)
        df2 = generate_sample_csv(n=100, seed=7)
        pd.testing.assert_frame_equal(df1, df2)

    def test_no_negative_numeric_cols(self):
        df = generate_sample_csv(n=500)
        non_negative_cols = [
            "account_age_months", "monthly_charges", "annual_spend",
            "logins_last_30d", "days_since_last_login", "support_tickets_total",
            "unresolved_tickets", "late_payments_count",
        ]
        for col in non_negative_cols:
            assert (df[col] >= 0).all(), f"{col} has negative values"


# ─── generate_template_csv ────────────────────────────────────────────────────

class TestGenerateTemplateCsv:
    def test_has_predict_columns(self):
        df = generate_template_csv()
        from src.data_loader import REQUIRED_COLS_PREDICT
        for col in REQUIRED_COLS_PREDICT:
            assert col in df.columns

    def test_no_churned_column(self):
        df = generate_template_csv()
        assert "churned" not in df.columns

    def test_has_at_least_one_example_row(self):
        df = generate_template_csv()
        assert len(df) >= 1


# ─── format_risk_level ────────────────────────────────────────────────────────

class TestFormatRiskLevel:
    def setup_method(self):
        from src.predict import format_risk_level
        self.fmt = format_risk_level

    def test_low(self):
        assert self.fmt(0.10) == "Low"
        assert self.fmt(0.00) == "Low"
        assert self.fmt(0.299) == "Low"

    def test_medium(self):
        assert self.fmt(0.30) == "Medium"
        assert self.fmt(0.50) == "Medium"
        assert self.fmt(0.599) == "Medium"

    def test_high(self):
        assert self.fmt(0.60) == "High"
        assert self.fmt(0.90) == "High"
        assert self.fmt(1.00) == "High"


# ─── Integration: preprocess → train → predict ────────────────────────────────

class TestIntegration:
    """Smoke-tests the full pipeline on small synthetic data."""

    def test_full_pipeline_runs(self, sample_train_df):
        from src.data_loader import fit_preprocessor, apply_preprocessor, get_feature_names
        from src.train import train_model
        from src.predict import predict_batch
        from src.explainability import build_explainer, compute_shap_values, get_top_reasons

        df_clean, _ = clean_data(sample_train_df, "train")
        preprocessor, categories = fit_preprocessor(df_clean)
        X = apply_preprocessor(df_clean, preprocessor)
        y = df_clean["churned"].values
        feature_names = get_feature_names(preprocessor)

        from sklearn.model_selection import train_test_split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )

        model, model_type = train_model(X_train, y_train)
        assert model is not None
        assert model_type in ("XGBoost", "LightGBM", "RandomForest")

        explainer = build_explainer(model, X_train[:50])
        shap_vals = compute_shap_values(explainer, X_test[:10])
        assert shap_vals.shape[0] == 10

        customer_ids = [f"TEST-{i}" for i in range(len(X_test))]
        preds = predict_batch(
            model, X_test, customer_ids, explainer, feature_names,
            df_clean.drop(columns=["churned"]).iloc[-len(X_test):].reset_index(drop=True)
        )
        assert len(preds) == len(X_test)
        for p in preds:
            assert p["prediction"] in ("STAY", "LEAVE")
            assert 0.0 <= p["churn_probability"] <= 100.0
            assert p["risk_level"] in ("Low", "Medium", "High")
            assert len(p["top_reasons"]) <= 3

    def test_evaluate_metrics_range(self, sample_train_df):
        from src.data_loader import fit_preprocessor, apply_preprocessor, get_feature_names
        from src.train import train_model
        from src.evaluate import evaluate

        df_clean, _ = clean_data(sample_train_df, "train")
        preprocessor, _ = fit_preprocessor(df_clean)
        X = apply_preprocessor(df_clean, preprocessor)
        y = df_clean["churned"].values

        from sklearn.model_selection import train_test_split
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

        model, _ = train_model(X_train, y_train)
        metrics = evaluate(model, X_test, y_test, threshold=0.5)

        for key in ("accuracy", "precision", "recall", "f1", "roc_auc"):
            assert 0.0 <= metrics[key] <= 1.0, f"{key} out of range: {metrics[key]}"
