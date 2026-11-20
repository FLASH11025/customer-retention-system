"""
churn_model.py
=============
Unified Machine Learning pipeline for PredictChurn.
Handles data validation, cleaning, feature transformation, SMOTE balancing,
model training (XGBoost), honest cross-validation (SMOTE inside folds),
metrics computation, SHAP explainability, and persistence on the Telco
Customer Churn dataset.

Design notes (correctness requirements):
- Heavy libraries (xgboost, shap, imblearn, sklearn, pandas) are imported
  lazily so the FastAPI app can start and answer /health instantly.
- Preprocessing and SMOTE are fitted on the TRAINING split only; SMOTE runs
  INSIDE the cross-validation folds via an imblearn Pipeline so CV scores
  are honest (no leakage inflation).
- Numeric imputation at predict time uses medians captured from the
  TRAINING split, never from the batch being scored.
- Categorical encoding uses OrdinalEncoder(handle_unknown="use_encoded_value",
  unknown_value=-1) so unseen categories never crash prediction.
- The bundle stores library versions; loading a bundle saved with different
  library versions returns a clear "please retrain" message instead of a
  stack trace. The XGBoost model is saved with its native JSON format.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from importlib.metadata import version as _pkg_version
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger("predictchurn.model")

# ---------------------------------------------------------------------------
# Real Telco Customer Churn Column Definitions
# ---------------------------------------------------------------------------
CAT_COLS = [
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
]

# Legacy behavioral columns (see the adapter block below): real values are
# kept as extra numeric model features for legacy-schema files; for Telco
# files - where these were never measured - they are inserted as constant
# 0.0, which is model-inert (zero variance after scaling).
LEGACY_BEHAVIORAL_COLS = [
    "logins_last_30d",
    "days_since_last_login",
    "support_tickets_total",
    "unresolved_tickets",
    "late_payments_count",
    "feature_usage_score",
]

# Core Telco numerics (used for schema detection; behavioral columns are
# optional and auto-inserted, so they must not gate detection)
NUM_CORE_COLS = ["tenure", "MonthlyCharges", "TotalCharges"]

# Full numeric feature list used by preprocessing/imputation
NUM_COLS = NUM_CORE_COLS + LEGACY_BEHAVIORAL_COLS

# Aliases for backwards compatibility
CATEGORICAL_COLS = CAT_COLS
NUMERIC_COLS = NUM_COLS

REQUIRED_COLS_PREDICT = ["customer_id"] + CAT_COLS + NUM_CORE_COLS
REQUIRED_COLS_TRAIN = REQUIRED_COLS_PREDICT + ["churned"]

# ---------------------------------------------------------------------------
# Legacy synthetic-schema adapter
# ---------------------------------------------------------------------------
# The app originally shipped with a synthetic 14-column CSV schema. Files in
# that layout are accepted through a DETERMINISTIC, lossy-but-documented
# mapping onto the real Telco schema, so ONE model can train and score on
# either file layout:
#
#   legacy column       -> Telco column     (value mapping)
#   account_age_months  -> tenure
#   monthly_charges     -> MonthlyCharges
#   annual_spend        -> TotalCharges     (derived monthly*tenure if absent)
#   plan_type           -> InternetService  Basic->No, Pro->DSL, Enterprise->Fiber optic
#   contract_type       -> Contract         Monthly->Month-to-month, Yearly->One year
#   payment_method      -> PaymentMethod    Bank->Bank transfer (automatic),
#                                           Card->Credit card (automatic),
#                                           UPI->Electronic check
#
# Telco categoricals with no legacy equivalent (gender, Partner, ...) are
# inserted as constants: a constant column has zero variance after scaling so
# it is model-inert, and using identical constants in train AND predict keeps
# the two paths consistent. The legacy behavioral columns (logins, tickets,
# ...) are KEPT as extra numeric model features; Telco files get them as
# constant 0.0 (see LEGACY_BEHAVIORAL_COLS above).
LEGACY_NUM_ALIASES = {
    "account_age_months": "tenure",
    "monthly_charges": "MonthlyCharges",
    "annual_spend": "TotalCharges",
}

LEGACY_VALUE_MAPS = {
    "InternetService": {  # source: plan_type
        "basic": "No",
        "pro": "DSL",
        "enterprise": "Fiber optic",
    },
    "Contract": {  # source: contract_type
        "monthly": "Month-to-month",
        "yearly": "One year",
        "annual": "One year",
        "two year": "Two year",
        "biannual": "Two year",
    },
    "PaymentMethod": {  # source: payment_method
        "bank": "Bank transfer (automatic)",
        "card": "Credit card (automatic)",
        "credit": "Credit card (automatic)",
        "upi": "Electronic check",
        "wallet": "Electronic check",
    },
}

LEGACY_CAT_SOURCES = {
    "InternetService": "plan_type",
    "Contract": "contract_type",
    "PaymentMethod": "payment_method",
}

# Deterministic defaults for UNSEEN values in each mapped categorical
LEGACY_CAT_DEFAULTS = {
    "InternetService": "DSL",
    "Contract": "Month-to-month",
    "PaymentMethod": "Electronic check",
}

# Constant fills for Telco categoricals absent from the legacy schema
LEGACY_CONSTANT_FILL = {
    "gender": "Female",
    "SeniorCitizen": "No",
    "Partner": "No",
    "Dependents": "No",
    "PhoneService": "Yes",
    "MultipleLines": "No",
    "OnlineSecurity": "No",
    "OnlineBackup": "No",
    "DeviceProtection": "No",
    "TechSupport": "No",
    "StreamingTV": "No",
    "StreamingMovies": "No",
    "PaperlessBilling": "Yes",
}

LEGACY_REQUIRED_CORE = [
    "plan_type",
    "contract_type",
    "payment_method",
    "account_age_months",
    "monthly_charges",
]


def detect_schema(df: Any) -> str:
    """Classify a dataframe's (or dict's) columns: 'telco', 'legacy', or 'unknown'."""
    if hasattr(df, "columns"):
        cols = {str(c) for c in df.columns}
    elif hasattr(df, "keys"):
        cols = {str(c) for c in df.keys()}
    else:
        return "unknown"
    if all(c in cols for c in CAT_COLS + NUM_CORE_COLS):
        return "telco"
    if all(c in cols for c in LEGACY_REQUIRED_CORE):
        return "legacy"
    return "unknown"


def _apply_legacy_schema_map(df: Any) -> tuple[Any, list[str]]:
    """Map a legacy-schema dataframe onto the real Telco schema.

    Deterministic and documented; returns (mapped_df, human_readable_notes).
    Never invents churn labels. Renames numeric aliases, translates legacy
    categorical values into Telco buckets, derives TotalCharges when absent,
    inserts constants for missing Telco categoricals, and drops legacy-only
    behavioral columns.
    """
    pd = _heavy()["pandas"]
    notes: list[str] = []
    df = df.copy()

    # 1) Numeric aliases -> Telco names
    for src, dst in LEGACY_NUM_ALIASES.items():
        if src in df.columns and dst not in df.columns:
            df = df.rename(columns={src: dst})
            notes.append(f"{src} -> {dst}")
        elif src in df.columns and dst in df.columns:
            df = df.drop(columns=[src])
            notes.append(f"{src} dropped (Telco column '{dst}' already present)")

    # 2) Derive TotalCharges when absent: Telco's TotalCharges is roughly
    #    monthly charges accumulated over tenure.
    if (
        "TotalCharges" not in df.columns
        and "MonthlyCharges" in df.columns
        and "tenure" in df.columns
    ):
        df["TotalCharges"] = (
            pd.to_numeric(df["MonthlyCharges"], errors="coerce")
            * pd.to_numeric(df["tenure"], errors="coerce")
        ).round(2)
        notes.append("TotalCharges derived as monthly_charges * account_age_months")

    # 3) Translate legacy categorical values into Telco buckets
    for dst, src in LEGACY_CAT_SOURCES.items():
        if src in df.columns:
            mapping = LEGACY_VALUE_MAPS[dst]
            default = LEGACY_CAT_DEFAULTS[dst]

            def _translate(v: Any, _m: dict = mapping, _d: str = default) -> str:
                return _m.get(str(v).strip().lower(), _d)

            df[dst] = df[src].map(_translate)
            notes.append(f"{src} -> {dst} (values mapped; unknown values -> '{default}')")
            df = df.drop(columns=[src])
        elif dst not in df.columns:
            df[dst] = LEGACY_CAT_DEFAULTS[dst]
            notes.append(f"{dst} absent -> constant '{LEGACY_CAT_DEFAULTS[dst]}'")

    # 4) Constants for remaining missing Telco categoricals (model-inert)
    for col, const in LEGACY_CONSTANT_FILL.items():
        if col not in df.columns:
            df[col] = const
            notes.append(f"{col} absent -> constant '{const}' (model-inert)")

    # 5) Behavioral columns are KEPT as extra numeric model features; the
    #    ensure-step in clean_and_validate inserts constant 0.0 for any that
    #    are absent so the feature list is uniform for both file layouts.
    kept = [c for c in LEGACY_BEHAVIORAL_COLS if c in df.columns]
    if kept:
        notes.append("kept as extra model features: " + ", ".join(kept))

    return df, notes


# Library versions that must match between training and loading environments.
VERSIONED_PACKAGES = ("xgboost", "scikit-learn", "shap")

# SHAP batching: compute explanations in chunks so large batches stay bounded.
SHAP_CHUNK_SIZE = 1000


def current_versions() -> dict[str, str]:
    """Return the library versions relevant for bundle compatibility."""
    out: dict[str, str] = {}
    for pkg in VERSIONED_PACKAGES + ("pandas", "numpy", "imbalanced-learn"):
        try:
            out[pkg] = _pkg_version(pkg)
        except Exception:  # package metadata missing
            out[pkg] = "unknown"
    return out


# ---------------------------------------------------------------------------
# Lazy heavy imports (keeps module import fast for API startup)
# ---------------------------------------------------------------------------
_HEAVY: dict[str, Any] = {}


def _heavy() -> dict[str, Any]:
    """Import and cache heavy third-party libraries on first use."""
    if not _HEAVY:
        import numpy
        import pandas
        import joblib
        import sklearn
        import xgboost
        import shap
        import imblearn
        from sklearn.base import clone
        from sklearn.compose import ColumnTransformer
        from sklearn.preprocessing import OrdinalEncoder, StandardScaler
        from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
        from sklearn.metrics import (
            accuracy_score,
            confusion_matrix,
            f1_score,
            precision_score,
            recall_score,
            roc_auc_score,
            roc_curve,
        )
        from xgboost import XGBClassifier
        from imblearn.over_sampling import SMOTE
        from imblearn.pipeline import Pipeline as ImbPipeline

        _HEAVY.update(
            dict(
                numpy=numpy,
                pandas=pandas,
                joblib=joblib,
                sklearn=sklearn,
                xgboost=xgboost,
                shap=shap,
                imblearn=imblearn,
                clone=clone,
                ColumnTransformer=ColumnTransformer,
                OrdinalEncoder=OrdinalEncoder,
                StandardScaler=StandardScaler,
                StratifiedKFold=StratifiedKFold,
                cross_val_score=cross_val_score,
                train_test_split=train_test_split,
                accuracy_score=accuracy_score,
                confusion_matrix=confusion_matrix,
                f1_score=f1_score,
                precision_score=precision_score,
                recall_score=recall_score,
                roc_auc_score=roc_auc_score,
                roc_curve=roc_curve,
                XGBClassifier=XGBClassifier,
                SMOTE=SMOTE,
                ImbPipeline=ImbPipeline,
            )
        )
    return _HEAVY


# ---------------------------------------------------------------------------
# Retention Actions and Reason Sentences
# ---------------------------------------------------------------------------
ACTIONS: dict[str, str] = {
    "Contract": "Offer a discounted yearly contract (15-20% off) to lock in commitment",
    "Contract_Month-to-month": "Offer a discounted yearly plan to lock in commitment",
    "Contract_One year": "Offer a multi-year loyalty discount renewal bonus",
    "Contract_Two year": "Send loyalty appreciation reward and renewal milestone benefits",
    "TechSupport": "Offer a 3-month free dedicated tech support trial",
    "TechSupport_No": "Offer a free tech support trial and VIP onboarding assistance",
    "TechSupport_Yes": "Maintain proactive priority ticket resolution",
    "OnlineSecurity": "Provide complimentary cyber protection and security suite",
    "OnlineSecurity_No": "Provide complimentary cyber protection and security suite",
    "OnlineBackup": "Offer free 1TB cloud backup storage add-on",
    "OnlineBackup_No": "Offer free 1TB cloud backup storage add-on",
    "DeviceProtection": "Provide discounted device insurance and replacement warranty",
    "DeviceProtection_No": "Provide discounted device insurance and replacement warranty",
    "InternetService": "Audit internet line stability and offer complimentary fiber speed upgrade",
    "InternetService_Fiber optic": "Audit fiber speed and connection stability; apply equipment discount",
    "InternetService_DSL": "Offer upgrade to high-speed fiber internet with free installation",
    "PaymentMethod": "Incentivize automatic billing with a $5 monthly invoice credit",
    "PaymentMethod_Electronic check": "Incentivize automatic bank or card payments with a $5 monthly bill credit",
    "PaymentMethod_Mailed check": "Encourage switch to automated payments with one-time account bonus",
    "PaperlessBilling": "Provide dual email and SMS billing notifications to avoid surprises",
    "PaperlessBilling_Yes": "Provide SMS billing reminders and flexible payment grace periods",
    "tenure": "Enroll in high-touch new customer onboarding and loyalty check-ins",
    "MonthlyCharges": "Conduct billing review and offer right-sized bundle discount",
    "TotalCharges": "Award account milestone credits for customer lifetime loyalty",
    "MultipleLines": "Offer family plan multi-line package discount",
    "PhoneService": "Review unlimited calling package options",
    "StreamingTV": "Bundle complimentary streaming entertainment pass",
    "StreamingMovies": "Bundle complimentary streaming entertainment pass",
    "SeniorCitizen": "Assign dedicated patient senior customer support specialist",
    "Partner": "Offer shared household family plan benefits",
    "Dependents": "Offer family plan discount and parental controls",
}


def _fmt_value(col: str, raw_val: Any) -> str:
    """Format a raw feature value for a reason sentence."""
    if col in ("tenure", "MonthlyCharges", "TotalCharges"):
        try:
            v = float(raw_val)
        except (TypeError, ValueError):
            v = 0.0
        if col == "tenure":
            return f"{int(v)} months"
        return f"${v:,.2f}"
    if isinstance(raw_val, float) and raw_val.is_integer():
        return str(int(raw_val))
    return str(raw_val)


def _sentence(feature_name: str, shap_val: float = 0.0, raw_row: Any = None) -> str:
    """
    Format a reason sentence in the form "Contract: Month-to-month (+22%)".

    With ordinal encoding the transformed feature name IS the original column
    name, so the value is read directly from the raw row.
    """
    pct = max(1, int(round(abs(shap_val) * 100)))
    sign = "+" if shap_val > 0 else "-"
    suffix = f"({sign}{pct}%)"

    col = feature_name
    val = _fmt_value(col, raw_row.get(col)) if raw_row is not None and col in raw_row.index else "?"
    return f"{col}: {val} {suffix}"


# Alias
format_shap_reason = _sentence


def format_risk_level(prob: float) -> str:
    """Format risk level tier based on churn probability: Low <30, Medium 30-60, High >60."""
    if prob < 0.30:
        return "Low"
    elif prob < 0.60:
        return "Medium"
    else:
        return "High"


def get_suggested_action(top_feature_names: list[str]) -> str:
    """Map top risk factors to actionable customer success interventions using ACTIONS dict."""
    for feat in top_feature_names:
        if feat in ACTIONS:
            return ACTIONS[feat]
        base = feat.split("_")[0] if "_" in feat else feat
        if base in ACTIONS:
            return ACTIONS[base]
        for key, act in ACTIONS.items():
            if key.lower() in feat.lower():
                return act
    return "Schedule account health check with dedicated Customer Success Manager"


# ---------------------------------------------------------------------------
# ChurnModel Class
# ---------------------------------------------------------------------------
class ChurnModel:
    """Encapsulates training, inference, explainability, and evaluation metrics."""

    def __init__(self):
        self.model = None
        self.algorithm = "XGBoost"
        self.preprocessor = None
        self.feature_names: list[str] = []
        self.categories: dict[str, list[str]] = {}
        self.metrics: Optional[dict] = None
        self.explainer = None
        self.X_background = None
        # Imputation statistics captured from the TRAINING split
        self.train_num_medians: dict[str, float] = {}
        self.train_cat_modes: dict[str, str] = {}
        # Bundle lifecycle state for API surface
        self.loading = False
        self.load_error: Optional[str] = None

    # ------------------------------------------------------------------
    # Cleaning / validation
    # ------------------------------------------------------------------
    def clean_and_validate(
        self,
        df: Any,
        mode: str = "train",
        num_medians: Optional[dict[str, float]] = None,
        cat_modes: Optional[dict[str, str]] = None,
    ) -> tuple[Any, dict]:
        """
        Validate columns and clean data. Numeric coercion keeps NaN; imputation
        uses provided TRAINING-split medians (predict) or is deferred to train()
        which splits first (train). SeniorCitizen is normalized to "No"/"Yes".
        """
        pd = _heavy()["pandas"]
        np = _heavy()["numpy"]
        df_clean = df.copy()

        # Handle customerID -> customer_id renaming if needed
        if "customerID" in df_clean.columns and "customer_id" not in df_clean.columns:
            df_clean = df_clean.rename(columns={"customerID": "customer_id"})
        elif "customer_id" not in df_clean.columns:
            # Synthetic IDs generated identically in train and predict paths
            df_clean.insert(0, "customer_id", [f"CUST_{i+1:05d}" for i in range(len(df_clean))])

        # Handle Churn -> churned conversion if needed
        if mode == "train":
            if "Churn" in df_clean.columns and "churned" not in df_clean.columns:
                df_clean["churned"] = df_clean["Churn"].apply(
                    lambda v: 1 if str(v).strip().strip("'").strip('"').lower() in ("yes", "1", "true") else 0
                )
                df_clean = df_clean.drop(columns=["Churn"])

        # --- Schema adapter: accept the legacy synthetic layout too -------
        schema = detect_schema(df_clean)
        schema_notes: list[str] = []
        if schema == "legacy":
            df_clean, schema_notes = _apply_legacy_schema_map(df_clean)
        elif schema == "unknown":
            cols = set(df_clean.columns)
            missing_telco = [c for c in CAT_COLS + NUM_CORE_COLS if c not in cols]
            missing_legacy = [c for c in LEGACY_REQUIRED_CORE if c not in cols]
            raise ValueError(
                f"Missing required columns: {missing_telco}. "
                f"The legacy layout is incomplete too; missing legacy columns: {missing_legacy}. "
                "Accepted layouts: Telco schema (Contract, PaymentMethod, InternetService, tenure, "
                "MonthlyCharges, TotalCharges, ...) or legacy schema (plan_type, contract_type, "
                "payment_method, account_age_months, monthly_charges, annual_spend, ...)."
            )

        # Behavioral features: real values for legacy files. When a file does
        # not carry them (Telco layout, sparse payload) they are filled with
        # the TRAINING-split medians at predict time - or constant 0.0 at
        # train time - keeping ONE feature list for both paths.
        beh_missing = [c for c in LEGACY_BEHAVIORAL_COLS if c not in df_clean.columns]
        if beh_missing:
            if mode == "train":
                for c in beh_missing:
                    df_clean[c] = 0.0
                schema_notes.append(
                    "absent behavioral features -> constant 0.0 (model-inert): " + ", ".join(beh_missing)
                )
            else:
                for c in beh_missing:
                    df_clean[c] = float(num_medians.get(c)) if num_medians and c in num_medians else 0.0
                schema_notes.append(
                    "absent behavioral features -> training-split medians: " + ", ".join(beh_missing)
                )

        required = REQUIRED_COLS_TRAIN if mode == "train" else REQUIRED_COLS_PREDICT
        missing_cols = [c for c in required if c not in df_clean.columns]
        extra = [c for c in df_clean.columns if c not in required and c != "customer_id"]

        if missing_cols:
            raise ValueError(f"Missing required columns: {missing_cols}. Found extra: {extra}")

        rows_in = len(df_clean)

        # Deduplicate on customer_id
        dupes_removed = 0
        if "customer_id" in df_clean.columns:
            dupes_removed = int(df_clean.duplicated(subset=["customer_id"]).sum())
            df_clean = df_clean.drop_duplicates(subset=["customer_id"]).reset_index(drop=True)

        # Numeric columns: strip quotes, coerce; keep NaN for deferred imputation
        df_clean[NUM_COLS] = df_clean[NUM_COLS].apply(
            lambda s: pd.to_numeric(s.astype(str).str.strip().str.strip("'").str.strip('"'), errors="coerce")
        )

        # Categorical columns: strip quotes; normalize SeniorCitizen to No/Yes
        for col in CAT_COLS:
            s = df_clean[col].astype(str).str.strip().str.strip("'").str.strip('"')
            if col == "SeniorCitizen":
                lowered = s.str.lower()
                s = lowered.map(
                    lambda v: "Yes" if v in ("1", "1.0", "yes", "true") else ("No" if v in ("0", "0.0", "no", "false") else v)
                )
            df_clean[col] = s

        cat_missing_mask = df_clean[CAT_COLS].isin(["", "nan", "None", "<NA>"])
        missing_count = int(df_clean[NUM_COLS].isna().sum().sum() + cat_missing_mask.sum().sum())

        if mode == "train":
            # Imputation is deferred: train() splits first, then fills with
            # TRAINING-split medians/modes so test rows never influence them.
            df_clean = df_clean.dropna(subset=["churned"]).reset_index(drop=True)
            df_clean["churned"] = df_clean["churned"].astype(int)
        else:
            # Predict mode: fill with TRAINING medians/modes when available,
            # otherwise fall back to batch statistics (legacy bundles).
            for col in NUM_COLS:
                if df_clean[col].isna().any():
                    fill = (
                        float(num_medians.get(col))
                        if num_medians and col in num_medians
                        else float(df_clean[col].median())
                    )
                    df_clean[col] = df_clean[col].fillna(fill)
            for col in CAT_COLS:
                mask = df_clean[col].isin(["", "nan", "None", "<NA>"])
                if mask.any():
                    fill = (
                        str(cat_modes.get(col))
                        if cat_modes and col in cat_modes
                        else str(df_clean.loc[~mask, col].mode().iloc[0])
                    )
                    df_clean.loc[mask, col] = fill

        cleaning_report = {
            "rows_in": rows_in,
            "duplicates_removed": dupes_removed,
            "missing_values": missing_count,
            "rows_out": len(df_clean),
            "schema": "legacy-mapped" if schema == "legacy" else "telco",
        }
        if schema_notes:
            cleaning_report["schema_mapping"] = schema_notes
        return df_clean, cleaning_report

    # ------------------------------------------------------------------
    # Preprocessing
    # ------------------------------------------------------------------
    def make_preprocessor(self):
        h = _heavy()
        return h["ColumnTransformer"](
            transformers=[
                ("num", h["StandardScaler"](), NUM_COLS),
                (
                    "cat",
                    h["OrdinalEncoder"](
                        handle_unknown="use_encoded_value",
                        unknown_value=-1,
                    ),
                    CAT_COLS,
                ),
            ],
            verbose_feature_names_out=False,
        )

    def fit_preprocessor(self, df_train: Any):
        """Fit ColumnTransformer on the TRAINING split only; capture categories."""
        feature_cols = NUM_COLS + CAT_COLS
        self.preprocessor = self.make_preprocessor()
        self.preprocessor.fit(df_train[feature_cols])
        self.feature_names = self.preprocessor.get_feature_names_out().tolist()
        self.categories = {
            col: sorted([str(v) for v in df_train[col].dropna().unique().tolist()]) for col in CAT_COLS
        }

    def transform_features(self, df: Any) -> Any:
        """Apply fitted preprocessor to the feature columns of df."""
        feature_cols = NUM_COLS + CAT_COLS
        return self.preprocessor.transform(df[feature_cols])

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------
    def train(self, df: Any, progress_cb: Optional[Callable[[str], None]] = None) -> dict:
        """
        Complete training pipeline:
        clean -> stratified 80/20 split -> impute from TRAIN split ->
        preprocessing fit on TRAIN split -> SMOTE inside CV folds (honest) ->
        final SMOTE+XGBoost fit on TRAIN split -> evaluate on untouched TEST split.
        """
        def _stage(name: str):
            if progress_cb:
                try:
                    progress_cb(name)
                except Exception:
                    pass

        h = _heavy()
        pd, np = h["pandas"], h["numpy"]
        t0 = time.time()

        _stage("validating")
        df_clean, cleaning_report = self.clean_and_validate(df, mode="train")
        _stage("cleaning")

        y_all = df_clean["churned"].values.astype(int)

        # Stratified 80/20 split BEFORE any preprocessing/SMOTE (no leakage)
        train_df, test_df = h["train_test_split"](
            df_clean, test_size=0.20, random_state=42, stratify=y_all
        )
        y_train = train_df["churned"].values.astype(int)
        y_test = test_df["churned"].values.astype(int)

        # Imputation statistics from the TRAINING split only
        self.train_num_medians = {
            col: float(train_df[col].median()) for col in NUM_COLS
        }
        self.train_cat_modes = {
            col: str(train_df[col].mode().iloc[0]) for col in CAT_COLS
        }
        # Fill any residual NaNs (coercion) using training-split statistics
        train_df = train_df.copy()
        test_df = test_df.copy()
        for col in NUM_COLS:
            train_df[col] = train_df[col].fillna(self.train_num_medians[col])
            test_df[col] = test_df[col].fillna(self.train_num_medians[col])
        for col in CAT_COLS:
            mask_tr = train_df[col].isin(["", "nan", "None", "<NA>"])
            mask_te = test_df[col].isin(["", "nan", "None", "<NA>"])
            if mask_tr.any():
                train_df.loc[mask_tr, col] = self.train_cat_modes[col]
            if mask_te.any():
                test_df.loc[mask_te, col] = self.train_cat_modes[col]

        # Preprocessing fitted on TRAIN split only
        self.fit_preprocessor(train_df)
        X_train = self.transform_features(train_df)
        X_test = self.transform_features(test_df)

        # Class balance before SMOTE (training split)
        b_stayed = int((y_train == 0).sum())
        b_churned = int((y_train == 1).sum())

        _stage("balancing")

        # ---------------- Honest CV: SMOTE + preprocessing inside folds -----
        cv = h["StratifiedKFold"](n_splits=5, shuffle=True, random_state=42)
        cv_pipeline = h["ImbPipeline"](
            steps=[
                ("preprocess", h["clone"](self.preprocessor)),
                ("smote", h["SMOTE"](random_state=42)),
                ("model", self._make_xgb()),
            ]
        )
        cv_scores_raw = h["cross_val_score"](
            cv_pipeline,
            train_df[NUM_COLS + CAT_COLS],
            y_train,
            cv=cv,
            scoring="roc_auc",
            n_jobs=1,
        )
        cv_scores = [round(float(s), 4) for s in cv_scores_raw]

        # ---------------- Final fit: SMOTE on TRAIN split, then XGBoost ----
        smote = h["SMOTE"](random_state=42)
        X_train_res, y_train_res = smote.fit_resample(X_train, y_train)
        a_stayed = int((y_train_res == 0).sum())
        a_churned = int((y_train_res == 1).sum())

        _stage("training")
        try:
            model = self._make_xgb()
            model.fit(X_train_res, y_train_res)
            self.model = model
            self.algorithm = "XGBoost"
        except Exception as exc:
            logger.warning("XGBoost failed (%s), falling back to RandomForest", exc)
            from sklearn.ensemble import RandomForestClassifier

            rf = RandomForestClassifier(n_estimators=150, max_depth=6, random_state=42)
            rf.fit(X_train_res, y_train_res)
            self.model = rf
            self.algorithm = "RandomForest"

        _stage("evaluating")
        test_probs = self.model.predict_proba(X_test)[:, 1]
        test_preds = (test_probs >= 0.5).astype(int)

        acc = float(h["accuracy_score"](y_test, test_preds))
        prec = float(h["precision_score"](y_test, test_preds, zero_division=0))
        rec = float(h["recall_score"](y_test, test_preds, zero_division=0))
        f1 = float(h["f1_score"](y_test, test_preds, zero_division=0))
        auc = float(h["roc_auc_score"](y_test, test_probs))

        cm = h["confusion_matrix"](y_test, test_preds)
        tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])

        fpr_arr, tpr_arr, _ = h["roc_curve"](y_test, test_probs)
        fpr_list = [round(float(v), 5) for v in fpr_arr]
        tpr_list = [round(float(v), 5) for v in tpr_arr]

        # Individual test predictions for interactive threshold slider
        test_probabilities = [
            {"y_true": int(yt), "prob": round(float(p), 4)}
            for yt, p in zip(y_test, test_probs)
        ]

        # Background sample + SHAP explainer matched to the saved model
        self.X_background = X_train[: min(len(X_train), 250)]
        try:
            self.explainer = h["shap"].TreeExplainer(self.model)
        except Exception:
            self.explainer = None

        t1 = time.time()
        self.metrics = {
            "algorithm": self.algorithm,
            "cv_scores": cv_scores,
            "cv_mean": round(float(np.mean(cv_scores_raw)), 4),
            "accuracy": round(acc, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
            "roc_auc": round(auc, 4),
            "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
            "roc_curve": {"fpr": fpr_list, "tpr": tpr_list},
            "train_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "churn_rate": round(float(np.mean(y_all)), 4),
            "class_balance": {
                "before": {"stayed": b_stayed, "churned": b_churned},
                "after": {"stayed": a_stayed, "churned": a_churned},
                "method": "SMOTE",
            },
            "cleaning": cleaning_report,
            "training_seconds": round(t1 - t0, 2),
            "trained_at": datetime.now().isoformat(),
            "categories": self.categories,
            "versions": current_versions(),
            "test_probabilities": test_probabilities,
        }
        _stage("done")
        return self.metrics

    def _make_xgb(self):
        return _heavy()["XGBClassifier"](
            n_estimators=150,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            eval_metric="logloss",
            random_state=42,
            verbosity=0,
        )

    # ------------------------------------------------------------------
    # Prediction
    # ------------------------------------------------------------------
    def _compute_shap(self, X: Any) -> Optional[Any]:
        """Compute SHAP values for the transformed matrix, chunked for large batches."""
        np = _heavy()["numpy"]
        if self.explainer is None:
            return None
        n = X.shape[0]
        if n <= SHAP_CHUNK_SIZE:
            try:
                raw = self.explainer.shap_values(X)
                return raw[1] if isinstance(raw, list) else raw
            except Exception as exc:
                logger.warning("SHAP calculation error: %s", exc)
                return None
        chunks = []
        for start in range(0, n, SHAP_CHUNK_SIZE):
            end = min(start + SHAP_CHUNK_SIZE, n)
            raw = self.explainer.shap_values(X[start:end])
            chunks.append(raw[1] if isinstance(raw, list) else raw)
        return np.vstack(chunks)

    def predict(self, df: Any, threshold: float = 0.5) -> dict:
        """Run batch predictions with per-customer SHAP explainability."""
        if self.model is None or self.preprocessor is None:
            raise ValueError("No model trained yet. Please train a model first.")

        pd, np = _heavy()["pandas"], _heavy()["numpy"]
        df_clean, _cleaning_report = self.clean_and_validate(
            df,
            mode="predict",
            num_medians=self.train_num_medians or None,
            cat_modes=self.train_cat_modes or None,
        )
        X = self.transform_features(df_clean)
        probs = self.model.predict_proba(X)[:, 1]

        shap_vals = self._compute_shap(X)

        predictions = []
        for i, prob in enumerate(probs):
            prob_f = float(prob)
            churn_pct = round(prob_f * 100, 1)
            pred_label = "LEAVE" if prob_f >= threshold else "STAY"
            risk_level = format_risk_level(prob_f)
            raw_row = df_clean.iloc[i]

            top_reasons = []
            top_feature_names = []
            if shap_vals is not None:
                row_sv = shap_vals[i]
                sorted_idx = np.argsort(np.abs(row_sv))[::-1][:3]
                for idx in sorted_idx:
                    fname = self.feature_names[idx]
                    top_feature_names.append(fname)
                    top_reasons.append(_sentence(fname, float(row_sv[idx]), raw_row=raw_row))

            suggested_action = get_suggested_action(top_feature_names)

            # Revenue at risk uses MonthlyCharges * 12
            monthly_chg = float(raw_row.get("MonthlyCharges", 0.0))
            annual_spend = round(monthly_chg * 12, 2)

            pred_item = {
                "customer_id": str(raw_row.get("customer_id", f"CUST_{i:04d}")),
                "prediction": pred_label,
                "churn_probability_pct": churn_pct,
                "risk_level": risk_level,
                "top_reasons": top_reasons,
                "suggested_action": suggested_action,
                "annual_spend": annual_spend,
            }

            # Embed other feature values for UI filtering
            for col in df_clean.columns:
                if col not in pred_item:
                    val = raw_row[col]
                    pred_item[col] = val.item() if hasattr(val, "item") else val

            predictions.append(pred_item)

        total_customers = len(predictions)
        predicted_to_leave = sum(1 for p in predictions if p["prediction"] == "LEAVE")
        avg_risk = float(np.mean([p["churn_probability_pct"] for p in predictions])) if total_customers else 0.0
        high_risk = sum(1 for p in predictions if p["risk_level"] == "High")
        revenue_at_risk = round(
            float(sum(p["annual_spend"] for p in predictions if p["prediction"] == "LEAVE")), 2
        )

        return {
            "summary": {
                "total_customers": total_customers,
                "predicted_to_leave": predicted_to_leave,
                "avg_churn_risk_pct": round(avg_risk, 1),
                "high_risk": high_risk,
                "revenue_at_risk": revenue_at_risk,
            },
            "predictions": predictions,
        }

    def predict_one(self, data: dict, threshold: float = 0.5) -> dict:
        """Run single-customer manual prediction."""
        data_copy = dict(data)
        if "customer_id" not in data_copy or not str(data_copy["customer_id"]).strip():
            data_copy["customer_id"] = "CUST_MANUAL"
        df_single = _heavy()["pandas"].DataFrame([data_copy])
        res = self.predict(df_single, threshold=threshold)
        return res["predictions"][0]

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    def save(self, directory: Path):
        """Save model bundle: native XGBoost JSON + joblib for everything else."""
        h = _heavy()
        directory.mkdir(parents=True, exist_ok=True)

        # Native XGBoost serialization (robust across versions)
        if self.model is not None and hasattr(self.model, "save_model"):
            try:
                self.model.save_model(str(directory / "xgb_model.json"))
            except Exception as exc:
                logger.warning("Native XGBoost save failed (%s); pickled fallback only", exc)

        h["joblib"].dump(
            {
                "model": self.model,
                "algorithm": self.algorithm,
                "preprocessor": self.preprocessor,
                "feature_names": self.feature_names,
                "categories": self.categories,
                "metrics": self.metrics,
                "X_background": self.X_background,
                "train_num_medians": self.train_num_medians,
                "train_cat_modes": self.train_cat_modes,
                "versions": current_versions(),
            },
            directory / "bundle.pkl",
        )

    def _check_versions(self, bundle_versions: Optional[dict]) -> Optional[str]:
        """Return an error message if library versions differ from training time."""
        if not bundle_versions:
            return "Model bundle has no library version stamp; please retrain to ensure compatibility."
        running = current_versions()
        diffs = []
        for pkg in VERSIONED_PACKAGES:
            saved = bundle_versions.get(pkg, "unknown")
            now = running.get(pkg, "unknown")
            if saved != now:
                diffs.append(f"{pkg} {saved} -> {now}")
        if diffs:
            return (
                "Model was trained with a different library version ("
                + "; ".join(diffs)
                + "), please retrain"
            )
        return None

    def load(self, directory: Path) -> bool:
        """Load model bundle. Returns False (with self.load_error set) on any problem."""
        self.load_error = None
        bundle_path = directory / "bundle.pkl"
        if not bundle_path.exists():
            self.load_error = "No trained model found on disk. Train a model first."
            return False
        try:
            h = _heavy()
            bundle = h["joblib"].load(bundle_path)

            # Version gate: refuse to run a model saved by incompatible libraries
            version_error = self._check_versions(bundle.get("versions"))
            if version_error:
                self.load_error = version_error
                return False

            # Prefer native XGBoost JSON over the pickled estimator
            native_path = directory / "xgb_model.json"
            model = None
            if native_path.exists():
                try:
                    model = h["XGBClassifier"](verbosity=0)
                    model.load_model(str(native_path))
                except Exception as exc:
                    logger.warning("Native XGBoost load failed (%s); trying pickled model", exc)
                    model = None
            if model is None:
                model = bundle.get("model")

            if model is None:
                self.load_error = "Model bundle contains no model. Please retrain."
                return False

            self.model = model
            self.algorithm = bundle.get("algorithm", "XGBoost")
            self.preprocessor = bundle.get("preprocessor")
            self.feature_names = bundle.get("feature_names", [])
            self.categories = bundle.get("categories", {})
            self.metrics = bundle.get("metrics")
            self.X_background = bundle.get("X_background")
            self.train_num_medians = bundle.get("train_num_medians", {}) or {}
            self.train_cat_modes = bundle.get("train_cat_modes", {}) or {}

            if self.model is not None:
                try:
                    self.explainer = h["shap"].TreeExplainer(self.model)
                except Exception:
                    self.explainer = None
            return True
        except Exception as exc:
            logger.warning("Could not load bundle: %s", exc)
            self.load_error = f"Could not load model bundle: {exc}"
            return False
