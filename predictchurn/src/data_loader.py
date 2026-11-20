"""
data_loader.py
==============
Data ingestion, validation, cleaning, and preprocessing utilities for the
PredictChurn ML backend.

Public API
----------
validate_columns, clean_data, fit_preprocessor, apply_preprocessor,
get_feature_names, generate_sample_csv, generate_template_csv
"""

from __future__ import annotations

import logging
import io
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
import joblib

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Column manifests
# ---------------------------------------------------------------------------

REQUIRED_COLS_TRAIN: list[str] = [
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
]

REQUIRED_COLS_PREDICT: list[str] = [c for c in REQUIRED_COLS_TRAIN if c != "churned"]

CATEGORICAL_COLS: list[str] = ["plan_type", "contract_type", "payment_method"]

NUMERIC_COLS: list[str] = [
    "account_age_months",
    "monthly_charges",
    "annual_spend",
    "logins_last_30d",
    "days_since_last_login",
    "support_tickets_total",
    "unresolved_tickets",
    "late_payments_count",
    "feature_usage_score",
]

TARGET_COL: str = "churned"
ID_COL: str = "customer_id"

__all__ = [
    "REQUIRED_COLS_TRAIN",
    "REQUIRED_COLS_PREDICT",
    "CATEGORICAL_COLS",
    "NUMERIC_COLS",
    "TARGET_COL",
    "ID_COL",
    "validate_columns",
    "clean_data",
    "fit_preprocessor",
    "apply_preprocessor",
    "get_feature_names",
    "generate_sample_csv",
    "generate_template_csv",
]


# ---------------------------------------------------------------------------
# 1. validate_columns
# ---------------------------------------------------------------------------

def validate_columns(
    df: pd.DataFrame, mode: str
) -> tuple[bool, list[str], list[str]]:
    """Validate that *df* has the expected columns for the given *mode*.

    Parameters
    ----------
    df : pd.DataFrame
        Input data frame.
    mode : str
        ``'train'`` or ``'predict'``.

    Returns
    -------
    is_valid : bool
        True when no required columns are missing.
    missing_cols : list[str]
        Required columns absent from *df*.
    extra_cols : list[str]
        Columns present in *df* but not in the required list (excluding
        ``customer_id`` and ``churned``).
    """
    try:
        required = REQUIRED_COLS_TRAIN if mode == "train" else REQUIRED_COLS_PREDICT
        df_cols = set(df.columns.tolist())
        required_set = set(required)

        missing_cols = [c for c in required if c not in df_cols]
        # Extra columns: present in df but not in the required set for this mode
        extra_cols = [
            c
            for c in df_cols
            if c not in required_set and c != ID_COL
        ]

        is_valid = len(missing_cols) == 0
        logger.info(
            "validate_columns(mode=%s): valid=%s, missing=%s, extra=%s",
            mode, is_valid, missing_cols, extra_cols,
        )
        return is_valid, missing_cols, extra_cols
    except Exception as exc:
        logger.exception("validate_columns failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 2. clean_data
# ---------------------------------------------------------------------------

def clean_data(
    df: pd.DataFrame, mode: str
) -> tuple[pd.DataFrame, dict]:
    """Clean *df* in-place and return a report of the changes.

    Steps
    -----
    1. Remove duplicate ``customer_id`` rows (keep first).
    2. Fill numeric NaN with column median; categorical NaN with column mode.
    3. For train mode: coerce ``churned`` to int, drop rows where it is NaN.

    Parameters
    ----------
    df : pd.DataFrame
        Raw input frame.
    mode : str
        ``'train'`` or ``'predict'``.

    Returns
    -------
    df_clean : pd.DataFrame
        Cleaned data frame (copy).
    report : dict
        ``{"duplicates_removed": int, "imputed": {...}, "rows_after": int}``
    """
    try:
        df = df.copy()
        report: dict = {"duplicates_removed": 0, "imputed": {}, "rows_after": 0}

        # 1. Deduplicate by customer_id
        n_before = len(df)
        df = df.drop_duplicates(subset=[ID_COL], keep="first")
        n_dupes = n_before - len(df)
        report["duplicates_removed"] = n_dupes
        if n_dupes:
            logger.info("Removed %d duplicate customer_id rows.", n_dupes)

        # 2. Impute missing values
        for col in NUMERIC_COLS:
            if col not in df.columns:
                continue
            n_missing = int(df[col].isna().sum())
            if n_missing > 0:
                median_val = float(df[col].median())
                df[col] = df[col].fillna(median_val)
                report["imputed"][col] = {
                    "count": n_missing,
                    "strategy": "median",
                    "value": median_val,
                }
                logger.debug("Imputed %d NaN in '%s' with median=%.4f", n_missing, col, median_val)

        for col in CATEGORICAL_COLS:
            if col not in df.columns:
                continue
            n_missing = int(df[col].isna().sum())
            if n_missing > 0:
                mode_val = str(df[col].mode().iloc[0])
                df[col] = df[col].fillna(mode_val)
                report["imputed"][col] = {
                    "count": n_missing,
                    "strategy": "mode",
                    "value": mode_val,
                }
                logger.debug("Imputed %d NaN in '%s' with mode='%s'", n_missing, col, mode_val)

        # 3. Train-specific: coerce target, drop NaN targets
        if mode == "train" and TARGET_COL in df.columns:
            df[TARGET_COL] = pd.to_numeric(df[TARGET_COL], errors="coerce")
            n_bad = int(df[TARGET_COL].isna().sum())
            if n_bad:
                df = df.dropna(subset=[TARGET_COL])
                logger.warning("Dropped %d rows with un-parseable 'churned' values.", n_bad)
            df[TARGET_COL] = df[TARGET_COL].astype(int)

        report["rows_after"] = len(df)
        logger.info("clean_data complete: rows_after=%d", len(df))
        return df, report
    except Exception as exc:
        logger.exception("clean_data failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 3. fit_preprocessor
# ---------------------------------------------------------------------------

def fit_preprocessor(
    df: pd.DataFrame,
) -> tuple[ColumnTransformer, dict]:
    """Fit and return a ColumnTransformer on the feature columns of *df*.

    The transformer applies:
    * ``OneHotEncoder(drop='first', sparse_output=False, handle_unknown='ignore')``
      to :data:`CATEGORICAL_COLS`.
    * ``StandardScaler()`` to :data:`NUMERIC_COLS`.

    Parameters
    ----------
    df : pd.DataFrame
        Cleaned training frame (must contain all feature columns).

    Returns
    -------
    preprocessor : ColumnTransformer
        Fitted transformer.
    categories : dict[str, list[str]]
        ``{col: sorted(unique_values)}`` for each categorical column.
    """
    try:
        ohe = OneHotEncoder(drop="first", sparse_output=False, handle_unknown="ignore")
        scaler = StandardScaler()

        preprocessor = ColumnTransformer(
            transformers=[
                ("cat", ohe, CATEGORICAL_COLS),
                ("num", scaler, NUMERIC_COLS),
            ],
            remainder="drop",
        )

        feature_df = df[CATEGORICAL_COLS + NUMERIC_COLS]
        preprocessor.fit(feature_df)

        categories: dict[str, list[str]] = {
            col: sorted(df[col].unique().tolist()) for col in CATEGORICAL_COLS
        }

        logger.info("Preprocessor fitted. Categories: %s", categories)
        return preprocessor, categories
    except Exception as exc:
        logger.exception("fit_preprocessor failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 4. apply_preprocessor
# ---------------------------------------------------------------------------

def apply_preprocessor(
    df: pd.DataFrame, preprocessor: ColumnTransformer
) -> np.ndarray:
    """Transform *df* using an already-fitted *preprocessor*.

    Parameters
    ----------
    df : pd.DataFrame
        Frame containing (at minimum) all feature columns.
    preprocessor : ColumnTransformer
        Fitted transformer returned by :func:`fit_preprocessor`.

    Returns
    -------
    np.ndarray
        2-D transformed feature array.
    """
    try:
        feature_df = df[CATEGORICAL_COLS + NUMERIC_COLS]
        X = preprocessor.transform(feature_df)
        logger.info("apply_preprocessor: output shape %s", X.shape)
        return X
    except Exception as exc:
        logger.exception("apply_preprocessor failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 5. get_feature_names
# ---------------------------------------------------------------------------

def get_feature_names(preprocessor: ColumnTransformer) -> list[str]:
    """Return human-readable feature names from a fitted *preprocessor*.

    Strips the ``'cat__'`` and ``'num__'`` prefixes added by
    :class:`~sklearn.compose.ColumnTransformer`.

    Parameters
    ----------
    preprocessor : ColumnTransformer
        Fitted transformer.

    Returns
    -------
    list[str]
        Feature names without pipeline prefixes.
    """
    try:
        raw_names: list[str] = preprocessor.get_feature_names_out().tolist()
        cleaned: list[str] = []
        for name in raw_names:
            if name.startswith("cat__"):
                cleaned.append(name[len("cat__"):])
            elif name.startswith("num__"):
                cleaned.append(name[len("num__"):])
            else:
                cleaned.append(name)
        logger.debug("Feature names (%d): %s", len(cleaned), cleaned)
        return cleaned
    except Exception as exc:
        logger.exception("get_feature_names failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 6. generate_sample_csv
# ---------------------------------------------------------------------------

def generate_sample_csv(
    n: int = 1000,
    churn_rate: float = 0.15,
    seed: int = 42,
) -> pd.DataFrame:
    """Generate a realistic synthetic training CSV.

    The churn label is generated via a logistic function over a composite
    risk score so that high-risk behavioural patterns (low logins, high
    days-since-login, unresolved tickets, late payments, low feature-usage,
    monthly contract) increase churn probability.

    Parameters
    ----------
    n : int
        Number of rows to generate. Default 1 000.
    churn_rate : float
        Target baseline churn rate. Default 0.15.
    seed : int
        Random seed for reproducibility. Default 42.

    Returns
    -------
    pd.DataFrame
        Synthetic training data with all required columns.
    """
    try:
        rng = np.random.default_rng(seed)

        customer_ids = [f"CUST{i:04d}" for i in range(n)]

        plan_types = rng.choice(["Basic", "Pro", "Enterprise"], size=n, p=[0.4, 0.4, 0.2])
        contract_types = rng.choice(["Monthly", "Yearly"], size=n, p=[0.6, 0.4])
        payment_methods = rng.choice(["Card", "UPI", "Bank"], size=n, p=[0.5, 0.3, 0.2])

        account_age_months = rng.integers(1, 61, size=n)

        # Monthly charges correlated with plan type
        monthly_charges = np.empty(n)
        for i in range(n):
            if plan_types[i] == "Basic":
                monthly_charges[i] = rng.uniform(20, 50)
            elif plan_types[i] == "Pro":
                monthly_charges[i] = rng.uniform(50, 100)
            else:
                monthly_charges[i] = rng.uniform(100, 200)

        annual_spend = monthly_charges * 12 * (0.8 + 0.4 * rng.random(n))

        # Generate base values first (no churn signal yet)
        logins_last_30d_raw = rng.integers(0, 31, size=n)
        days_since_last_login_raw = rng.integers(0, 91, size=n)
        support_tickets_total = rng.integers(0, 21, size=n)
        unresolved_tickets = np.array(
            [rng.integers(0, min(support_tickets_total[i], 10) + 1) for i in range(n)]
        )
        late_payments_count = rng.integers(0, 11, size=n)
        feature_usage_score_raw = rng.uniform(0, 100, size=n)

        # Composite churn risk score (higher = more likely to churn)
        # Normalise each component to roughly [-1, 1]
        login_risk = 1.0 - (logins_last_30d_raw / 30.0)           # few logins → high risk
        days_risk = days_since_last_login_raw / 90.0               # many days → high risk
        ticket_risk = unresolved_tickets / 10.0                    # many unresolved → high risk
        payment_risk = late_payments_count / 10.0                  # many late → high risk
        usage_risk = 1.0 - (feature_usage_score_raw / 100.0)       # low usage → high risk
        contract_risk = np.where(contract_types == "Monthly", 0.3, -0.3)

        # Logistic score → probability
        composite = (
            2.0 * login_risk
            + 2.0 * days_risk
            + 1.5 * ticket_risk
            + 1.5 * payment_risk
            + 2.0 * usage_risk
            + contract_risk
        )
        # Shift composite so that logistic(0) ≈ churn_rate
        from scipy.special import expit  # type: ignore[import-untyped]
        desired_intercept = np.log(churn_rate / (1.0 - churn_rate)) - np.mean(composite)
        churn_prob = expit(composite + desired_intercept)

        churned = (rng.random(n) < churn_prob).astype(int)

        df = pd.DataFrame(
            {
                "customer_id": customer_ids,
                "plan_type": plan_types,
                "contract_type": contract_types,
                "payment_method": payment_methods,
                "account_age_months": account_age_months.astype(int),
                "monthly_charges": np.round(monthly_charges, 2),
                "annual_spend": np.round(annual_spend, 2),
                "logins_last_30d": logins_last_30d_raw.astype(int),
                "days_since_last_login": days_since_last_login_raw.astype(int),
                "support_tickets_total": support_tickets_total.astype(int),
                "unresolved_tickets": unresolved_tickets.astype(int),
                "late_payments_count": late_payments_count.astype(int),
                "feature_usage_score": np.round(feature_usage_score_raw, 2),
                "churned": churned,
            }
        )

        actual_rate = float(churned.mean())
        logger.info(
            "generate_sample_csv: n=%d, actual_churn_rate=%.3f (target=%.3f)",
            n, actual_rate, churn_rate,
        )
        return df[REQUIRED_COLS_TRAIN]
    except Exception as exc:
        logger.exception("generate_sample_csv failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 7. generate_template_csv
# ---------------------------------------------------------------------------

def generate_template_csv() -> pd.DataFrame:
    """Return a one-row template DataFrame for predict-mode CSV uploads.

    The returned frame has all :data:`REQUIRED_COLS_PREDICT` columns and
    contains a single realistic example row.

    Returns
    -------
    pd.DataFrame
        Template with one example row; no ``churned`` column.
    """
    try:
        example = {
            "customer_id": "CUST0001",
            "plan_type": "Pro",
            "contract_type": "Monthly",
            "payment_method": "Card",
            "account_age_months": 24,
            "monthly_charges": 75.00,
            "annual_spend": 870.00,
            "logins_last_30d": 12,
            "days_since_last_login": 5,
            "support_tickets_total": 3,
            "unresolved_tickets": 1,
            "late_payments_count": 0,
            "feature_usage_score": 62.5,
        }
        df = pd.DataFrame([example])[REQUIRED_COLS_PREDICT]
        logger.info("generate_template_csv: returning %d-row template.", len(df))
        return df
    except Exception as exc:
        logger.exception("generate_template_csv failed: %s", exc)
        raise
